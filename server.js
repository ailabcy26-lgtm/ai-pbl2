require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const app = express();
app.use(cors());
app.use(express.json());

const usersFile = process.env.USERS_FILE || path.join(__dirname, 'users.json');
const readUsers = () => {
  try { return JSON.parse(fs.readFileSync(usersFile, 'utf8')); }
  catch { return []; }
};
const writeUsers = (users) => fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => {
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return { salt, hash };
};

app.post('/api/register', (req, res) => {
  const { name = '', username = '', password = '' } = req.body;
  const cleanName = name.trim();
  const cleanUsername = username.trim().toLowerCase();
  if (cleanName.length < 2) return res.status(400).json({ error: 'Enter your full name.' });
  if (cleanUsername.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  const users = readUsers();
  if (users.some((user) => user.username === cleanUsername)) {
    return res.status(409).json({ error: 'That username is already registered.' });
  }
  const credentials = hashPassword(password);
  users.push({ name: cleanName, username: cleanUsername, role: 'User', ...credentials });
  writeUsers(users);
  return res.status(201).json({ ok: true, username: cleanUsername, role: 'User' });
});

app.post('/api/login', (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const configuredUsername = (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
  const configuredPassword = process.env.ADMIN_PASSWORD || (process.env.NODE_ENV === 'production' ? '' : 'admin123');
  if (configuredPassword && username === configuredUsername && password === configuredPassword) {
    return res.json({ ok: true, username: configuredUsername, role: 'Administrator' });
  }
  const user = readUsers().find((item) => item.username === username);
  if (user) {
    const check = crypto.pbkdf2Sync(password, user.salt, 100000, 64, 'sha512').toString('hex');
    if (crypto.timingSafeEqual(Buffer.from(check, 'hex'), Buffer.from(user.hash, 'hex'))) {
      return res.json({ ok: true, username: user.username, role: user.role, name: user.name });
    }
  }
  return res.status(401).json({ error: 'Invalid username or password' });
});

// Serve the nested frontend files.
const frontendDir = path.join(__dirname, 'backend', 'backend', 'frontend');
app.use('/assets', express.static(path.join(frontendDir, 'assets')));
app.get('/manifest.json', (req, res) => res.sendFile(path.join(frontendDir, 'manifest.json')));
app.get('/sw.js', (req, res) => res.sendFile(path.join(frontendDir, 'sw.js')));
app.get('/', (req, res) => res.sendFile(path.join(frontendDir, 'index.html')));
app.get('/style.css', (req, res) => res.sendFile(path.join(frontendDir, 'frontend', 'style.css')));
app.get('/app.js', (req, res) => res.sendFile(path.join(frontendDir, 'frontend', 'frontend', 'app.js')));

// ---------- In-memory database (replace with MongoDB/MySQL later) ----------
let nextId = 100;
const db = {
  students: [
    { id: 1, name: 'Demo Student 1', usn: 'DEMO-001', dept: 'CY', marks: 82, attendance: 91 },
    { id: 2, name: 'Demo Student 2', usn: 'DEMO-002', dept: 'IY', marks: 58, attendance: 68 },
    { id: 3, name: 'Demo Student 3', usn: 'DEMO-003', dept: 'CSE', marks: 74, attendance: 79 },
    { id: 4, name: 'Demo Student 4', usn: 'DEMO-004', dept: 'ME', marks: 41, attendance: 55 },
  ],
  resources: [
    { id: 1, name: 'Seminar Hall A', type: 'Classroom', status: 'Available' },
    { id: 2, name: 'AI Lab 1', type: 'Lab', status: 'Booked' },
    { id: 3, name: 'Projector P-12', type: 'Equipment', status: 'Available' },
  ],
  events: [
    { id: 1, name: 'AI Hackathon', date: '2026-12-05', venue: 'Main Auditorium', details: '24-hour team event' },
    { id: 2, name: 'Placement Talk', date: '2026-12-10', venue: 'Seminar Hall A', details: 'Industry speaker' },
  ],
  feedback: [],
};

// ---------- Generic CRUD: students, resources, events ----------
['students', 'resources', 'events'].forEach((col) => {
  app.get(`/api/${col}`, (req, res) => {
    const q = (req.query.q || '').toLowerCase();
    res.json(db[col].filter((r) => !q || JSON.stringify(r).toLowerCase().includes(q)));
  });
  app.post(`/api/${col}`, (req, res) => {
    const item = Object.fromEntries(Object.entries(req.body).filter(([, value]) => String(value ?? '').trim() !== ''));
    if (Object.keys(item).length !== Object.keys(req.body).length) {
      return res.status(400).json({ error: 'Fill in all fields before adding.' });
    }
    const cleanItem = { id: ++nextId, ...item };
    db[col].push(cleanItem);
    res.status(201).json(cleanItem);
  });
  app.put(`/api/${col}/:id`, (req, res) => {
    const i = db[col].findIndex((r) => r.id == req.params.id);
    if (i < 0) return res.status(404).json({ error: 'Not found' });
    db[col][i] = { ...db[col][i], ...req.body, id: db[col][i].id };
    res.json(db[col][i]);
  });
  app.delete(`/api/${col}/:id`, (req, res) => {
    db[col] = db[col].filter((r) => r.id != req.params.id);
    res.json({ ok: true });
  });
});

// ---------- Analytics (rule-based, no AI key needed) ----------
app.get('/api/analytics', (req, res) => {
  const s = db.students;
  const avg = (k) => (s.reduce((a, b) => a + Number(b[k]), 0) / (s.length || 1)).toFixed(1);
  res.json({
    totalStudents: s.length,
    avgMarks: avg('marks'),
    avgAttendance: avg('attendance'),
    lowAttendance: s.filter((x) => x.attendance < 75),
    atRisk: s.filter((x) => x.marks < 50),
    toppers: [...s].sort((a, b) => b.marks - a.marks).slice(0, 3),
    resources: db.resources.length,
    events: db.events.length,
  });
});

// ---------- Feedback analysis (keyword based) ----------
const TOPICS = {
  Teaching: ['teach', 'lecture', 'faculty', 'explain'],
  Facilities: ['wifi', 'lab', 'classroom', 'canteen', 'library', 'hostel'],
  Exams: ['exam', 'marks', 'paper', 'result'],
  Administration: ['office', 'fee', 'admin', 'certificate'],
};
const NEG = ['bad', 'poor', 'slow', 'worst', 'not', 'never', 'issue', 'problem', 'late'];
app.post('/api/feedback/analyze', (req, res) => {
  const list = req.body.feedback || [];
  const topics = {};
  let negative = 0;
  list.forEach((t) => {
    const l = t.toLowerCase();
    if (NEG.some((w) => l.includes(w))) negative++;
    for (const [k, words] of Object.entries(TOPICS)) if (words.some((w) => l.includes(w))) topics[k] = (topics[k] || 0) + 1;
  });
  res.json({ total: list.length, negative, positive: list.length - negative, topics });
});

// ---------- Career guidance (rule-based) ----------
const CAREERS = {
  python: 'Data Scientist / AI Engineer', java: 'Backend Developer', design: 'UI/UX Designer',
  networking: 'Network Engineer', electronics: 'Embedded Systems Engineer', management: 'Product / Business Analyst',
  writing: 'Content Strategist', math: 'Data Analyst',
};
app.post('/api/career', (req, res) => {
  const text = (req.body.skills || '').toLowerCase();
  const hits = Object.entries(CAREERS).filter(([k]) => text.includes(k)).map(([, v]) => v);
  res.json({ suggestions: hits.length ? hits : ['Software Developer', 'Data Analyst'] });
});

// ---------- AI endpoint: chatbot, notes, quiz, content generation ----------
const SYSTEMS = {
  chatbot: 'You are the helpful assistant of GM University smart campus. Answer student questions about courses, campus and administration briefly. If unsure, tell the student to contact the university office.',
  notes: 'You are an academic assistant. Create clear study notes for the topic.',
  quiz: 'You are an academic assistant. Create 5 multiple-choice questions with answers for the topic.',
  summary: 'Summarize the given text in simple bullet points.',
  content: 'You write professional campus content: assignments, announcements, reports. Keep it formal and concise.',
};
const RESPONSIBLE =
  ' Follow responsible AI rules: do not reveal personal data, do not give harmful or biased answers, mention that AI output must be verified by a human.';

app.post('/api/ai', async (req, res) => {
  const { task = 'chatbot', prompt = '' } = req.body;
  if (!prompt.trim()) return res.status(400).json({ error: 'Prompt is required' });

  const provider = (process.env.AI_PROVIDER || 'ollama').toLowerCase();
  try {
    if (provider === 'ollama') {
      const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
      const r = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: process.env.OLLAMA_MODEL || 'llama3.2:1b',
          stream: false,
          messages: [
            { role: 'system', content: (SYSTEMS[task] || SYSTEMS.chatbot) + RESPONSIBLE },
            { role: 'user', content: prompt },
          ],
        }),
        signal: AbortSignal.timeout(180000),
      });
      const data = await r.json();
      if (!r.ok) return res.status(500).json({ error: data.error || 'Ollama returned an error' });
      return res.json({ answer: data.message?.content || 'No response returned by Ollama.' });
    }

    if (provider === 'groq') {
      const key = process.env.GROQ_API_KEY;
      if (!key) return res.status(503).json({ error: 'Hosted AI is not configured. Add GROQ_API_KEY in the hosting environment.' });

      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: process.env.AI_MODEL || 'llama-3.3-70b-versatile',
          max_tokens: 800,
          messages: [
            { role: 'system', content: (SYSTEMS[task] || SYSTEMS.chatbot) + RESPONSIBLE },
            { role: 'user', content: prompt },
          ],
        }),
      });
      const data = await r.json();
      if (!r.ok) return res.status(500).json({ error: data.error?.message || 'Hosted AI returned an error' });
      return res.json({ answer: data.choices?.[0]?.message?.content || 'No response returned by hosted AI.' });
    }

    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return res.status(503).json({ error: 'Anthropic live AI is not configured. Set ANTHROPIC_API_KEY or use AI_PROVIDER=ollama.' });

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.AI_MODEL || 'claude-sonnet-4-5',
        max_tokens: 800,
        system: (SYSTEMS[task] || SYSTEMS.chatbot) + RESPONSIBLE,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(500).json({ error: data.error?.message || 'AI error' });
    res.json({ answer: data.content.map((c) => c.text || '').join('\n') });
  } catch (e) {
    const message = provider === 'ollama'
      ? e.name === 'TimeoutError'
        ? 'Local AI timed out. Keep Ollama running and try a shorter prompt.'
        : 'Cannot reach local AI. Make sure Ollama is running.'
      : 'Cannot reach the hosted AI provider. Please try again later.';
    res.status(503).json({ error: message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Backend running at http://localhost:${PORT}`));