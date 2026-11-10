/* StudyMate AI - script.js */
const $ = s => document.querySelector(s);

/* ---------- Storage ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
let settings = Object.assign({ lang: 'en', theme: 'dark', key: '', model: 'gemini-3.5-flash' }, store.get('sm_settings', {}));
let chat = store.get('sm_chat', []);
let notes = store.get('sm_notes', []);
let scores = store.get('sm_scores', []);
const saveSettings = () => store.set('sm_settings', settings);

/* ---------- Helpers ---------- */
const langRule = () => settings.lang === 'ur'
  ? 'Reply in Roman Urdu (Urdu written in English letters) using simple words.'
  : 'Reply in simple English.';

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.remove('hide');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hide'), 3000);
}

// Safe text -> HTML (escape, then simple bold/bullets)
function fmt(t) {
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/^\s*[\*\-]\s+/gm, '• ')
    .replace(/^#+\s*/gm, '')
    .replace(/\n/g, '<br>');
}

async function copyText(text, btn) {
  try { await navigator.clipboard.writeText(text); }
  catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (x) {}
    ta.remove();
  }
  const old = btn.textContent; btn.textContent = 'Copied ✓';
  setTimeout(() => btn.textContent = old, 1200);
}

function setLoading(btn, on, label) {
  btn.disabled = on;
  btn.innerHTML = on ? '<span class="spin"></span>Intezar...' : label;
}

/* ---------- AI call (change only this function to switch API) ---------- */
async function callAI(prompt) {
  if (!settings.key) throw new Error('Pehle Settings mein API key daalo.');
  if (!navigator.onLine) throw new Error('Internet nahi hai. Connection check karo.');
  const model = encodeURIComponent(settings.model || 'gemini-3.5-flash');
  let res;
  try {
    res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': settings.key },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] })
    });
  } catch (e) { throw new Error('Network error. Dobara try karo.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('API error: ' + ((data.error && data.error.message) || res.status));
  const parts = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
  const text = parts ? parts.map(p => p.text || '').join('') : '';
  if (!text) throw new Error('AI ne jawab nahi diya, dobara try karo.');
  return text;
}

/* ---------- Navigation, theme, language ---------- */
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === id));
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.v === id));
}
function applyTheme() {
  document.documentElement.dataset.theme = settings.theme;
  $('#themeBtn').textContent = settings.theme === 'dark' ? '🌙' : '☀️';
}
function applyLang() { $('#langBtn').textContent = settings.lang === 'ur' ? 'UR' : 'EN'; }

/* ---------- Chat ---------- */
let busy = false;
function addMsg(role, text) {
  const d = document.createElement('div'); d.className = 'msg ' + role;
  const b = document.createElement('div'); b.className = 'bub'; b.innerHTML = fmt(text);
  d.appendChild(b);
  if (role === 'ai') {
    const c = document.createElement('button'); c.className = 'copy'; c.textContent = 'Copy';
    c.onclick = () => copyText(text, c); d.appendChild(c);
  }
  $('#msgs').appendChild(d); $('#msgs').scrollTop = 1e9;
  return d;
}
function renderChat() {
  $('#msgs').innerHTML = '';
  if (!chat.length) addMsg('ai', 'Salam! Main StudyMate hoon. Koi bhi topic pucho, main asaan lafzon mein samjhaunga.');
  chat.forEach(m => addMsg(m.role, m.text));
}
async function sendChat() {
  const inp = $('#chatIn'); const q = inp.value.trim();
  if (!q || busy) return;
  inp.value = ''; chat.push({ role: 'user', text: q }); addMsg('user', q);
  const typing = addMsg('ai', 'Soch raha hoon...');
  typing.classList.add('typing'); typing.querySelector('.copy').remove();
  busy = true;
  const hist = chat.slice(-9, -1).map(m => (m.role === 'user' ? 'Student: ' : 'Tutor: ') + m.text).join('\n');
  try {
    const a = await callAI('You are a friendly study tutor. ' + langRule() + '\n' + hist + '\nStudent: ' + q + '\nTutor:');
    typing.remove(); chat.push({ role: 'ai', text: a }); addMsg('ai', a);
  } catch (e) { typing.remove(); addMsg('ai', '⚠️ ' + e.message); }
  chat = chat.slice(-50); store.set('sm_chat', chat); busy = false;
}

/* ---------- Notes ---------- */
function renderNotes() {
  const box = $('#noteList'); box.innerHTML = '';
  if (!notes.length) { box.innerHTML = '<div class="empty">Abhi koi note nahi. Upar topic likho.</div>'; return; }
  notes.forEach(n => {
    const c = document.createElement('div'); c.className = 'note';
    const h = document.createElement('h4'); h.textContent = n.topic;
    const p = document.createElement('div'); p.innerHTML = fmt(n.text);
    const acts = document.createElement('div'); acts.className = 'acts';
    const cp = document.createElement('button'); cp.textContent = 'Copy'; cp.onclick = () => copyText(n.text, cp);
    const del = document.createElement('button'); del.className = 'del'; del.textContent = 'Delete';
    del.onclick = () => { notes = notes.filter(x => x.id !== n.id); store.set('sm_notes', notes); renderNotes(); };
    acts.append(cp, del); c.append(h, p, acts); box.appendChild(c);
  });
}
async function genNotes() {
  const t = $('#noteTopic').value.trim();
  if (!t) return toast('Pehle topic likho.');
  const b = $('#noteGen'); setLoading(b, true);
  try {
    const a = await callAI('Make short, clear bullet-point study notes (maximum 10 bullets) on: ' + t + '. ' + langRule());
    notes.unshift({ id: Date.now(), topic: t, text: a });
    store.set('sm_notes', notes); renderNotes(); $('#noteTopic').value = '';
  } catch (e) { toast(e.message); }
  setLoading(b, false, 'Notes banao');
}

/* ---------- Quiz ---------- */
let Q = [], qi = 0, score = 0, quizTopic = '';
function renderScores() {
  const box = $('#scoreList'); box.innerHTML = '';
  if (!scores.length) { box.innerHTML = '<div class="empty">Abhi koi score nahi.</div>'; return; }
  scores.forEach(s => {
    const r = document.createElement('div'); r.className = 'srow';
    r.innerHTML = '<span></span><b>' + s.score + '/' + s.total + '</b>';
    r.firstChild.textContent = s.topic + ' (' + s.date + ')'; box.appendChild(r);
  });
}
async function startQuiz() {
  const t = $('#quizTopic').value.trim(); const n = +$('#quizN').value;
  if (!t) return toast('Pehle quiz ka topic likho.');
  const b = $('#quizGo'); setLoading(b, true);
  try {
    const a = await callAI('Create ' + n + ' multiple choice questions on "' + t + '". ' + langRule() +
      ' Return ONLY a JSON array with no markdown and no extra text. Each item: ' +
      '{"q":"question","options":["A","B","C","D"],"answer":0,"explanation":"short reason"} ' +
      'where answer is the index (0-3) of the correct option. Exactly 4 options per question. Keep JSON keys in English.');
    const s = a.replace(/```json|```/g, '').trim();
    const arr = JSON.parse(s.slice(s.indexOf('['), s.lastIndexOf(']') + 1));
    Q = arr.filter(x => x && x.q && Array.isArray(x.options) && x.options.length === 4 && x.answer >= 0 && x.answer <= 3);
    if (!Q.length) throw new Error('Quiz ban nahi saka, dobara try karo.');
    quizTopic = t; qi = 0; score = 0;
    $('#quizSetup').classList.add('hide'); $('#quizBox').classList.remove('hide'); showQ();
  } catch (e) { toast(e instanceof SyntaxError ? 'Quiz ka format theek nahi aaya, dobara try karo.' : e.message); }
  setLoading(b, false, 'Quiz shuru karo');
}
function showQ() {
  const q = Q[qi], box = $('#quizBox'); box.innerHTML = ''; box.dataset.done = '0';
  const h = document.createElement('div'); h.className = 'qh'; h.textContent = 'Sawal ' + (qi + 1) + ' / ' + Q.length;
  const p = document.createElement('p'); p.className = 'qt'; p.textContent = q.q;
  box.append(h, p);
  const ex = document.createElement('div'); ex.className = 'expl hide';
  const nx = document.createElement('button'); nx.className = 'btn full hide';
  nx.textContent = qi === Q.length - 1 ? 'Result dekho' : 'Agla sawal';
  nx.onclick = () => { qi++; qi < Q.length ? showQ() : finishQuiz(); };
  const opts = [];
  q.options.forEach((o, i) => {
    const b = document.createElement('button'); b.className = 'opt'; b.textContent = o;
    b.onclick = () => {
      if (box.dataset.done === '1') return; box.dataset.done = '1';
      opts.forEach((x, j) => { if (j === q.answer) x.classList.add('ok'); else if (j === i) x.classList.add('bad'); });
      if (i === q.answer) score++;
      ex.textContent = '💡 ' + (q.explanation || ''); ex.classList.remove('hide'); nx.classList.remove('hide');
    };
    opts.push(b); box.appendChild(b);
  });
  box.append(ex, nx);
}
function finishQuiz() {
  scores.unshift({ topic: quizTopic, score, total: Q.length, date: new Date().toLocaleDateString() });
  scores = scores.slice(0, 10); store.set('sm_scores', scores);
  const box = $('#quizBox'); box.innerHTML = '';
  const h = document.createElement('h4'); h.textContent = 'Quiz khatam!';
  const s = document.createElement('div'); s.className = 'score'; s.textContent = score + ' / ' + Q.length;
  const m = document.createElement('p'); m.style.textAlign = 'center';
  m.textContent = score / Q.length >= 0.7 ? 'Shabash! Bohat acha.' : 'Thori aur practice karo, tum kar loge.';
  const b = document.createElement('button'); b.className = 'btn full'; b.textContent = 'Naya quiz';
  b.onclick = () => { box.classList.add('hide'); $('#quizSetup').classList.remove('hide'); renderScores(); };
  box.append(h, s, m, b);
}

/* ---------- Essay ---------- */
async function genEssay() {
  const t = $('#essayTopic').value.trim(); const len = $('#essayLen').value;
  if (!t) return toast('Pehle topic likho.');
  const b = $('#essayGo'); setLoading(b, true);
  try {
    const a = await callAI('Write a clear essay/answer of about ' + len + ' words on: ' + t + '. ' + langRule());
    const out = $('#essayOut'); out.innerHTML = '';
    const c = document.createElement('div'); c.className = 'note';
    const p = document.createElement('div'); p.innerHTML = fmt(a);
    const acts = document.createElement('div'); acts.className = 'acts';
    const cp = document.createElement('button'); cp.textContent = 'Copy'; cp.onclick = () => copyText(a, cp);
    acts.appendChild(cp); c.append(p, acts); out.appendChild(c);
  } catch (e) { toast(e.message); }
  setLoading(b, false, 'Likho');
}

/* ---------- Init ---------- */
document.querySelectorAll('nav button').forEach(b => b.onclick = () => showView(b.dataset.v));
$('#themeBtn').onclick = () => { settings.theme = settings.theme === 'dark' ? 'light' : 'dark'; saveSettings(); applyTheme(); };
$('#langBtn').onclick = () => { settings.lang = settings.lang === 'en' ? 'ur' : 'en'; saveSettings(); applyLang(); toast(settings.lang === 'ur' ? 'Ab jawab Roman Urdu mein aayenge' : 'Answers will now be in English'); };
$('#chatSend').onclick = sendChat;
$('#chatIn').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
$('#noteGen').onclick = genNotes;
$('#quizGo').onclick = startQuiz;
$('#essayGo').onclick = genEssay;
$('#saveSet').onclick = () => {
  settings.key = $('#keyIn').value.trim();
  settings.model = $('#modelIn').value.trim() || 'gemini-3.5-flash';
  saveSettings(); toast('Settings save ho gayi ✓');
};
$('#clearAll').onclick = () => {
  if (!confirm('Chat, notes aur scores sab delete ho jayenge. Pakka?')) return;
  chat = []; notes = []; scores = [];
  store.set('sm_chat', chat); store.set('sm_notes', notes); store.set('sm_scores', scores);
  renderChat(); renderNotes(); renderScores(); toast('Data delete ho gaya.');
};

$('#keyIn').value = settings.key; $('#modelIn').value = settings.model;
applyTheme(); applyLang(); renderChat(); renderNotes(); renderScores();
