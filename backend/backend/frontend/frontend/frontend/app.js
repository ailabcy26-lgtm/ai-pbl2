const API = '/api';
const $ = (s) => document.querySelector(s);
const api = async (path, method = 'GET', body) => {
  try {
    const r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return await r.json();
  } catch { return { error: 'Cannot reach backend. Is it running on port 5000?' }; }
};
const ask = async (task, prompt) => {
  const result = await api('/ai', 'POST', { task, prompt });
  return result.answer || result.error || 'Error: could not get an answer.';
};

const speechRecognitionSupported = 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
const SpeechRecognitionApi = window.SpeechRecognition || window.webkitSpeechRecognition;
let activeRecognition = null;

window.startVoiceInput = (targetId) => {
  if (!speechRecognitionSupported) {
    alert('Voice input is not supported in this browser. Use Chrome or Edge.');
    return;
  }
  if (activeRecognition) activeRecognition.stop();
  const recognition = new SpeechRecognitionApi();
  activeRecognition = recognition;
  recognition.lang = 'en-IN';
  recognition.continuous = false;
  recognition.interimResults = false;
  const target = $('#' + targetId);
  const voiceButton = document.querySelector(`[data-voice-target="${targetId}"]`);
  if (voiceButton) { voiceButton.classList.add('listening'); voiceButton.textContent = 'Listening...'; }
  recognition.onresult = (event) => {
    const text = event.results[0][0].transcript;
    target.value = target.value ? `${target.value.trim()} ${text}` : text;
    target.dispatchEvent(new Event('input', { bubbles: true }));
  };
  recognition.onerror = () => {
    if (targetId === 'cm') target.placeholder = 'Voice input unavailable. Type your question.';
  };
  recognition.onend = () => {
    activeRecognition = null;
    if (voiceButton) { voiceButton.classList.remove('listening'); voiceButton.textContent = 'Mic'; }
  };
  recognition.start();
};

window.speakText = (text) => {
  if (!('speechSynthesis' in window)) {
    alert('Read aloud is not supported in this browser.');
    return;
  }
  window.speechSynthesis.cancel();
  const speech = new SpeechSynthesisUtterance(text);
  speech.lang = 'en-IN';
  speech.rate = 1;
  speech.pitch = 1;
  window.speechSynthesis.speak(speech);
};

// Reusable AI tool page (notes, quiz, summary, content)
const aiTool = (title, task, hint) => () => `
  <h2>${title}</h2><div class="card">
  <textarea id="p" placeholder="${hint}"></textarea>
  <div class="voice-actions">
    <button class="btn voice-btn" type="button" data-voice-target="p" onclick="startVoiceInput('p')">Mic</button>
    <button class="btn gold" onclick="run('${task}')">Generate</button>
  </div>
  <div class="out" id="o">Your result appears here.</div>
  <button class="btn read-btn" type="button" onclick="speakText($('#o').textContent)">Read aloud</button></div>`;
window.run = async (task) => {
  const button = document.querySelector('#main .btn.gold');
  const prompt = $('#p').value.trim();
  if (!prompt) { $('#o').textContent = 'Please enter a prompt first.'; $('#p').focus(); return; }
  if (button) { button.disabled = true; button.textContent = 'Generating...'; }
  $('#o').textContent = 'Thinking locally...';
  const answer = await ask(task, prompt);
  $('#o').textContent = answer;
  speakText(answer);
  if (button) { button.disabled = false; button.textContent = 'Generate'; }
};

// Generic CRUD page builder
const crud = (title, col, fields) => async () => {
  const rows = await api(`/${col}`);
  const list = Array.isArray(rows) ? rows : [];
  const fieldControl = (f) => {
    const label = f.charAt(0).toUpperCase() + f.slice(1);
    const type = f === 'date' ? 'type="date"' : 'type="text"';
    return `<label class="field-label" for="f_${f}">${label}<input id="f_${f}" ${type} placeholder="Enter ${label.toLowerCase()}" autocomplete="off"></label>`;
  };
  return `<h2>${title}</h2>
  <div class="card"><h3>Add new</h3>
  <form id="add_${col}" class="row" onsubmit="event.preventDefault(); addItem('${col}',FIELDS['${col}']);">
    ${fields.map(fieldControl).join('')}
    <button class="btn" id="add_${col}_button" type="submit">Add ${col === 'events' ? 'Event' : col === 'resources' ? 'Resource' : 'Student'}</button>
  </form><div class="out" id="crud_${col}_message" hidden></div></div>
  <div class="card"><input id="q" placeholder="Search..." oninput="searchItems('${col}')">
  <div id="tbl">${table(col, fields, list)}</div></div>`;
};
const table = (col, fields, list) => `<table><tr>${fields.map((f) => `<th>${f}</th>`).join('')}<th>Actions</th></tr>
  ${list.map((r) => `<tr>${fields.map((f) => `<td>${r[f] ?? ''}</td>`).join('')}
  <td><button class="btn" onclick="editItem('${col}',${r.id},'${fields[0]}')">Edit</button>
  <button class="btn red" onclick="delItem('${col}',${r.id})">Delete</button></td></tr>`).join('') || '<tr><td colspan="9">No records yet. Add one above.</td></tr>'}</table>`;
const FIELDS = { students: ['name', 'usn', 'dept', 'marks', 'attendance'], resources: ['name', 'type', 'status'], events: ['name', 'date', 'venue', 'details'] };
window.addItem = async (col, fields) => {
  const button = $(`#add_${col}_button`);
  const message = $(`#crud_${col}_message`);
  const o = {};
  const missing = [];
  fields.forEach((f) => {
    const input = $('#f_' + f);
    o[f] = input.value.trim();
    if (!o[f]) missing.push(f);
  });
  if (missing.length) {
    message.hidden = false;
    message.textContent = `Please fill: ${missing.join(', ')}`;
    const first = $('#f_' + missing[0]);
    if (first) first.focus();
    return;
  }
  if (button) { button.disabled = true; button.textContent = 'Adding...'; }
  const result = await api(`/${col}`, 'POST', o);
  if (button) { button.disabled = false; button.textContent = `Add ${col === 'events' ? 'Event' : col === 'resources' ? 'Resource' : 'Student'}`; }
  if (result.error) {
    message.hidden = false;
    message.textContent = result.error;
    return;
  }
  fields.forEach((f) => { $('#f_' + f).value = ''; });
  message.hidden = false;
  message.textContent = `${col === 'events' ? 'Event' : col === 'resources' ? 'Resource' : 'Student'} added successfully.`;
  const updatedRows = await api(`/${col}`);
  if (Array.isArray(updatedRows)) {
    const tableElement = $('#tbl');
    if (tableElement) tableElement.innerHTML = table(col, fields, updatedRows);
  }
};
window.searchItems = async (col) => {
  const list = await api(`/${col}?q=${encodeURIComponent($('#q').value)}`);
  $('#tbl').innerHTML = table(col, FIELDS[col], list);
};
window.delItem = async (col, id) => { await api(`/${col}/${id}`, 'DELETE'); show(current); };
window.editItem = async (col, id, field) => {
  const v = prompt(`New value for ${field}:`); if (v === null) return;
  await api(`/${col}/${id}`, 'PUT', { [field]: v }); show(current);
};

const pages = {
  Dashboard: async () => {
    const a = await api('/analytics');
    if (a.error) return `<h2>Dashboard</h2><div class="card">${a.error}</div>`;
    return `<h2>Campus Dashboard</h2><div class="grid">
      <div class="stat"><b>${a.totalStudents}</b><span>Students</span></div>
      <div class="stat"><b>${a.avgMarks}%</b><span>Average marks</span></div>
      <div class="stat"><b>${a.avgAttendance}%</b><span>Average attendance</span></div>
      <div class="stat"><b>${a.resources}</b><span>Resources</span></div>
      <div class="stat"><b>${a.events}</b><span>Events</span></div></div>
      <div class="card"><h3>Welcome</h3>Use the menu to open AI services for students, faculty and administrators.</div>`;
  },
  'AI Chatbot': () => `<h2>AI Chatbot</h2><div class="card"><div class="chat" id="chat"><div class="msg bot">Hi! Ask me about courses, campus or administration.</div></div>
    <div class="row"><input id="cm" placeholder="Type or speak your question" onkeydown="if(event.key==='Enter')send()">
    <button class="btn voice-btn" type="button" data-voice-target="cm" onclick="startVoiceInput('cm')">Mic</button>
    <button class="btn gold" style="flex:0" onclick="send()">Send</button></div>
    <button class="btn read-btn" type="button" onclick="readChatAnswer()">Read last answer</button></div>`,
  'Academic Assistant': aiTool('Academic Assistant', 'notes', 'Enter a topic, e.g. "Binary Trees" - notes are generated. Use the Quiz tool for questions.'),
  'Quiz Generator': aiTool('Quiz Generator', 'quiz', 'Enter a topic, e.g. "DBMS normalization"'),
  'AI Content Generator': aiTool('AI Content Generator', 'content', 'e.g. "Write an announcement for the annual tech fest on 5 Dec"'),
  Students: crud('Student Management', 'students', FIELDS.students),
  'Performance & Attendance': async () => {
    const a = await api('/analytics');
    const li = (l) => l.map((s) => `<tr><td>${s.name}</td><td>${s.usn}</td><td>${s.marks}</td><td>${s.attendance}%</td></tr>`).join('') || '<tr><td colspan="4">None</td></tr>';
    return `<h2>Performance & Attendance Analysis</h2>
    <div class="card"><h3>Low attendance (below 75%)</h3><table><tr><th>Name</th><th>USN</th><th>Marks</th><th>Attendance</th></tr>${li(a.lowAttendance || [])}</table></div>
    <div class="card"><h3>At-risk students (marks below 50)</h3><table><tr><th>Name</th><th>USN</th><th>Marks</th><th>Attendance</th></tr>${li(a.atRisk || [])}</table></div>
    <div class="card"><h3>Top performers</h3><table><tr><th>Name</th><th>USN</th><th>Marks</th><th>Attendance</th></tr>${li(a.toppers || [])}</table></div>`;
  },
  'Feedback Analysis': () => `<h2>Feedback Analysis</h2><div class="card"><textarea id="fb" placeholder="Paste or speak one feedback per line"></textarea>
    <div class="voice-actions"><button class="btn voice-btn" type="button" data-voice-target="fb" onclick="startVoiceInput('fb')">Mic</button><button class="btn gold" onclick="analyzeFb()">Analyze</button></div>
    <div class="out" id="o"></div><button class="btn read-btn" type="button" onclick="speakText($('#o').textContent)">Read aloud</button></div>`,
  Events: crud('Event Management', 'events', FIELDS.events),
  'Career Guidance': () => `<h2>Career Guidance</h2><div class="card"><input id="sk" placeholder="Your skills and interests, e.g. python, math, design">
    <div class="voice-actions"><button class="btn voice-btn" type="button" data-voice-target="sk" onclick="startVoiceInput('sk')">Mic</button><button class="btn gold" onclick="career()">Suggest careers</button></div>
    <div class="out" id="o"></div><button class="btn read-btn" type="button" onclick="speakText($('#o').textContent)">Read aloud</button></div>`,
  Resources: crud('Resource Management', 'resources', FIELDS.resources),
  'Responsible AI': () => `<h2>Responsible AI Usage</h2><div class="card"><ul style="padding-left:20px;line-height:1.9">
    <li>AI answers are suggestions. A human must verify important decisions.</li><li>Personal data of students is never shared with AI tools.</li>
    <li>Marks and attendance analysis uses clear rules so results are explainable.</li><li>Content is checked for bias and harmful language.</li>
    <li>Students must follow academic integrity and cite AI help.</li></ul></div>`,
};
window.readChatAnswer = () => {
  const answers = document.querySelectorAll('#chat .msg.bot');
  if (!answers.length) return;
  speakText(answers[answers.length - 1].textContent);
};

window.send = async () => {
  const t = $('#cm').value.trim();
  if (!t) { $('#cm').focus(); return; }
  const button = $('#chat')?.parentElement?.querySelector('.btn.gold');
  $('#cm').value = '';
  $('#chat').innerHTML += `<div class="msg me"></div>`;
  $('#chat').lastElementChild.textContent = t;
  $('#chat').innerHTML += `<div class="msg bot" id="typing">Thinking...</div>`;
  $('#chat').scrollTop = 9999;
  if (button) { button.disabled = true; button.textContent = 'Sending...'; }
  const a = await ask('chatbot', t);
  $('#typing')?.remove();
  $('#chat').innerHTML += `<div class="msg bot"></div>`;
  $('#chat').lastElementChild.textContent = a;
  speakText(a);
  $('#chat').scrollTop = 9999;
  if (button) { button.disabled = false; button.textContent = 'Send'; }
  $('#cm').focus();
};
window.analyzeFb = async () => {
  const r = await api('/feedback/analyze', 'POST', { feedback: $('#fb').value.split('\n').filter(Boolean) });
  $('#o').innerHTML = r.error || `Total: ${r.total}  <span class="tag ok">Positive ${r.positive}</span> <span class="tag bad">Negative ${r.negative}</span>\nCommon topics: ${Object.entries(r.topics).map(([k, v]) => k + ' (' + v + ')').join(', ') || 'none found'}`;
};
window.career = async () => {
  const r = await api('/career', 'POST', { skills: $('#sk').value });
  $('#o').textContent = r.error || 'Suggested careers:\n- ' + r.suggestions.join('\n- ');
};

let current = 'Dashboard';
async function show(name) {
  current = name;
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('active', b.textContent === name));
  $('#main').innerHTML = await pages[name]();
}
const loginForm = $('#loginForm');
let authMode = 'login';
$('#authToggle').onclick = () => {
  authMode = authMode === 'login' ? 'register' : 'login';
  $('#registerFields').hidden = authMode !== 'register';
  $('#password').autocomplete = authMode === 'register' ? 'new-password' : 'current-password';
  loginForm.querySelector('button[type="submit"]').textContent = authMode === 'register' ? 'Create account' : 'Sign in';
  $('#authToggle').textContent = authMode === 'register' ? 'Already registered? Sign in' : 'New user? Register';
  $('#loginError').textContent = '';
  if (authMode === 'register') $('#fullName').focus(); else $('#username').focus();
};

loginForm.onsubmit = async (event) => {
  event.preventDefault();
  const submitButton = loginForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = authMode === 'register' ? 'Creating account...' : 'Signing in...';
  $('#loginError').textContent = '';
  const endpoint = authMode === 'register' ? '/register' : '/login';
  const body = authMode === 'register'
    ? { name: $('#fullName').value.trim(), username: $('#username').value.trim(), password: $('#password').value }
    : { username: $('#username').value.trim(), password: $('#password').value };
  const result = await api(endpoint, 'POST', body);
  if (!result.ok) {
    submitButton.disabled = false;
    submitButton.textContent = authMode === 'register' ? 'Create account' : 'Sign in';
    $('#loginError').textContent = result.error || 'Login failed';
    return;
  }
  if (authMode === 'register') {
    submitButton.disabled = false;
    submitButton.textContent = 'Sign in';
    $('#loginError').textContent = `Account created for ${result.username}. Enter your password to sign in.`;
    $('#loginError').style.color = '#1e8e4e';
    authMode = 'login';
    $('#registerFields').hidden = true;
    $('#password').autocomplete = 'current-password';
    $('#password').value = '';
    $('#fullName').value = '';
    $('#authToggle').textContent = 'New user? Register';
    $('#password').focus();
    return;
  }
  sessionStorage.setItem('gmCampusUser', result.username);
  $('#currentUser').textContent = result.username;
  $('#loginScreen').hidden = true;
  $('#appShell').hidden = false;
  startApp();
};

function startApp() {
  $('#nav').innerHTML = Object.keys(pages).map((n) => `<button>${n}</button>`).join('');
  document.querySelectorAll('#nav button').forEach((b) => (b.onclick = () => show(b.textContent)));
  show('Dashboard');
}

function restoreSession() {
  const username = sessionStorage.getItem('gmCampusUser');
  if (username) {
    $('#currentUser').textContent = username;
    $('#loginScreen').hidden = true;
    $('#appShell').hidden = false;
    startApp();
  }
}

$('#logoutButton').onclick = () => {
  sessionStorage.removeItem('gmCampusUser');
  $('#appShell').hidden = true;
  $('#loginScreen').hidden = false;
  $('#password').value = '';
  $('#loginError').textContent = '';
  $('#loginError').style.color = '';
};

restoreSession();

let installPrompt = null;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventEvent = event.preventDefault;
  event.preventDefault();
  installPrompt = event;
  const installButton = $('#installAppButton');
  if (installButton) installButton.hidden = false;
});

$('#installAppButton').onclick = async () => {
  if (!installPrompt) {
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIos) alert('On iPhone/iPad: tap Share, then Add to Home Screen.');
    else alert('Use the browser menu and choose Install app or Add to Home Screen.');
    return;
  }
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  $('#installAppButton').hidden = true;
};

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}