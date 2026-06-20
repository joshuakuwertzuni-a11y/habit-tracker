if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}

function todayStr() { return new Date().toISOString().slice(0, 10); }

function formatDate(str) {
  return new Date(str + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
}

function dateMinusDays(d, n) {
  const dt = new Date(d + 'T12:00:00');
  dt.setDate(dt.getDate() - n);
  return dt.toISOString().slice(0, 10);
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const LS_KEY = 'habit-tracker-v1';

function lsGet() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; }
}
function lsSet(obj) {
  localStorage.setItem(LS_KEY, JSON.stringify(obj));
}

let habits = [], checked = {}, history = {}, today = todayStr();

function historyToObj() {
  const obj = {};
  for (const id in history) obj[id] = [...history[id]];
  return obj;
}

function load() {
  const data = lsGet();
  habits = data.habits || [];
  history = {};
  if (data.history) {
    for (const id in data.history) history[id] = new Set(data.history[id]);
  }

  const lastDate = data.lastDate || today;
  if (lastDate !== today) {
    habits.forEach(h => {
      if (!history[h.id]) history[h.id] = new Set();
      if (data.checked && data.checked[h.id]) {
        history[h.id].add(lastDate);
        h.streak = (h.streak || 0) + 1;
        h.lastChecked = lastDate;
      } else if (h.lastChecked) {
        const diff = (new Date(today) - new Date(h.lastChecked)) / 86400000;
        if (diff > 1) h.streak = 0;
      }
    });
    checked = {};
    save();
  } else {
    checked = data.checked || {};
  }
}

function save() {
  lsSet({ habits, checked, lastDate: today, history: historyToObj() });
}

/* ── TODAY ── */
function renderToday() {
  const list  = document.getElementById('habit-list');
  const empty = document.getElementById('empty-state');
  const bar   = document.getElementById('progress-bar');
  const label = document.getElementById('progress-label');

  list.innerHTML = '';

  if (habits.length === 0) {
    empty.classList.remove('hidden');
    bar.style.width = '0%';
    label.textContent = '0 / 0 erledigt';
    return;
  }
  empty.classList.add('hidden');

  const doneCount = habits.filter(h => checked[h.id]).length;
  bar.style.width = Math.round(doneCount / habits.length * 100) + '%';
  label.textContent = `${doneCount} / ${habits.length} erledigt`;

  for (const h of habits) {
    const isDone = !!checked[h.id];
    const li = document.createElement('li');
    li.className = 'habit-item' + (isDone ? ' checked' : '');

    const streak = h.streak || 0;
    const streakHtml = streak > 0
      ? `<span class="fire">🔥</span> ${streak} Tag${streak !== 1 ? 'e' : ''} Streak`
      : 'Noch kein Streak';

    li.innerHTML = `
      <button class="check-btn" aria-label="Abhaken">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3">
          <path d="M5 13l4 4L19 7"/>
        </svg>
      </button>
      <div class="habit-info">
        <div class="habit-name">${escHtml(h.name)}</div>
        <div class="habit-streak">${streakHtml}</div>
      </div>
      <button class="delete-btn" aria-label="Löschen">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    `;
    li.querySelector('.check-btn').addEventListener('click', () => {
      if (checked[h.id]) { delete checked[h.id]; } else { checked[h.id] = true; }
      save(); renderToday();
    });
    li.querySelector('.delete-btn').addEventListener('click', () => {
      if (!confirm(`"${h.name}" wirklich löschen?`)) return;
      habits = habits.filter(x => x.id !== h.id);
      delete checked[h.id]; delete history[h.id];
      save(); renderToday(); renderStats();
    });
    list.appendChild(li);
  }
}

/* ── STATS ── */
function completedDays(id) {
  const all = new Set(history[id] || []);
  if (checked[id]) all.add(today);
  return all;
}

function bestStreak(id) {
  const days = [...completedDays(id)].sort();
  if (!days.length) return 0;
  let best = 1, cur = 1;
  for (let i = 1; i < days.length; i++) {
    const diff = (new Date(days[i]) - new Date(days[i-1])) / 86400000;
    cur = diff === 1 ? cur + 1 : 1;
    if (cur > best) best = cur;
  }
  return best;
}

function rate30(id) {
  const set = completedDays(id);
  let count = 0;
  for (let i = 0; i < 30; i++) if (set.has(dateMinusDays(today, i))) count++;
  return Math.round(count / 30 * 100);
}

function renderStats() {
  const summary = document.getElementById('stats-summary');
  const cards   = document.getElementById('stat-cards');
  const empty   = document.getElementById('stats-empty');

  summary.innerHTML = ''; cards.innerHTML = '';

  if (habits.length === 0) {
    empty.classList.remove('hidden'); return;
  }
  empty.classList.add('hidden');

  const totalChecks = habits.reduce((s, h) => s + completedDays(h.id).size, 0);
  const avgRate = Math.round(habits.reduce((s, h) => s + rate30(h.id), 0) / habits.length);

  summary.innerHTML = `
    <div class="summary-card"><div class="val">${habits.length}</div><div class="lbl">Habits</div></div>
    <div class="summary-card"><div class="val">${totalChecks}</div><div class="lbl">Gesamte Checks</div></div>
    <div class="summary-card"><div class="val">${avgRate}%</div><div class="lbl">Ø Rate (30 T.)</div></div>
  `;

  for (const h of habits) {
    const done  = completedDays(h.id);
    const r     = rate30(h.id);
    const best  = bestStreak(h.id);
    const cur   = h.streak || 0;

    let dots = '';
    for (let i = 27; i >= 0; i--) {
      const d = dateMinusDays(today, i);
      dots += `<div class="dot${done.has(d) ? ' done' : ''}${i === 0 ? ' today' : ''}" title="${d}"></div>`;
    }

    const startFmt = new Date(dateMinusDays(today, 27) + 'T12:00:00')
      .toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
    const todayFmt = new Date(today + 'T12:00:00')
      .toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });

    const card = document.createElement('div');
    card.className = 'stat-card';
    card.innerHTML = `
      <div class="stat-card-header">
        <div class="stat-card-name">${escHtml(h.name)}</div>
        <div class="stat-badge">${r}% diese 30 T.</div>
      </div>
      <div class="stat-row">
        <div class="stat-cell"><div class="n">${done.size}</div><div class="u">Tage gesamt</div></div>
        <div class="stat-cell"><div class="n">${cur}</div><div class="u">Akt. Streak</div></div>
        <div class="stat-cell"><div class="n">${best}</div><div class="u">Bester Streak</div></div>
        <div class="stat-cell"><div class="n">${r}%</div><div class="u">30-T. Rate</div></div>
      </div>
      <div class="dot-grid">${dots}</div>
      <div class="dot-legend"><span>${startFmt}</span><span>${todayFmt}</span></div>
    `;
    cards.appendChild(card);
  }
}

/* ── TABS ── */
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b === btn));
    const isStats = btn.dataset.tab === 'stats';
    document.getElementById('view-today').classList.toggle('hidden', isStats);
    document.getElementById('view-stats').classList.toggle('hidden', !isStats);
    document.getElementById('add-form').classList.toggle('hidden', isStats);
    if (isStats) renderStats();
  });
});

/* ── ADD FORM ── */
document.getElementById('add-form').addEventListener('submit', e => {
  e.preventDefault();
  const input = document.getElementById('habit-input');
  const val = input.value.trim();
  if (!val) return;
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  habits.push({ id, name: val, streak: 0, lastChecked: null });
  save(); renderToday();
  input.value = '';
  input.blur();
});

document.getElementById('today-date').textContent = formatDate(today);

load();
renderToday();
