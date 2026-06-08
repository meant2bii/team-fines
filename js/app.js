/**
 * Team Fines – app.js
 * ───────────────────────────────────────────
 * Config: change PIN and currency below.
 */

const CONFIG = {
  PIN: '1234',        // ← change your manager PIN here
  CURRENCY: 'CZK',   // ← change currency symbol if needed
  SEASON: '2025/26', // ← update each season
};

// ─── STATE ─────────────────────────────────
let isManager = false;
let editIndex  = -1;
let recognition = null;

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem('team_fines_v1');
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore */ }
  return { players: [], fines: [] };
}

function saveState() {
  try {
    localStorage.setItem('team_fines_v1', JSON.stringify(state));
  } catch (e) {
    console.error('Storage error', e);
  }
}

// ─── INIT ──────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('season-label').textContent = `Sezona ${CONFIG.SEASON}`;
  updateLockUI();
  populatePlayerSelects();

  // Close modals on backdrop click
  document.querySelectorAll('.modal-backdrop').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target === el) {
        el.id === 'pin-modal'  ? closePinModal()  : closeEditModal();
      }
    });
  });
});

// ─── TABS ──────────────────────────────────
function switchTab(t) {
  document.querySelectorAll('.tab').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === t);
  });
  document.querySelectorAll('.panel').forEach(el => el.classList.remove('active'));
  document.getElementById('panel-' + t).classList.add('active');

  if (t === 'log')     renderLog();
  if (t === 'summary') renderSummary();
  if (t === 'players') renderPlayers();
}

// ─── LOCK / PIN ────────────────────────────
function toggleLock() {
  if (isManager) {
    isManager = false;
    updateLockUI();
    showToast('Odhlášen/a');
    return;
  }
  openPinModal();
}

function openPinModal() {
  document.getElementById('pin-modal').classList.add('open');
  setTimeout(() => document.getElementById('pin-input').focus(), 80);
}

function closePinModal() {
  document.getElementById('pin-modal').classList.remove('open');
  document.getElementById('pin-input').value = '';
  document.getElementById('pin-err').style.display = 'none';
}

function checkPin() {
  const val = document.getElementById('pin-input').value;
  if (val === CONFIG.PIN) {
    isManager = true;
    closePinModal();
    updateLockUI();
    showToast('Přihlášen/a jako manažer ✓');
  } else {
    document.getElementById('pin-err').style.display = 'block';
    document.getElementById('pin-input').select();
  }
}

function updateLockUI() {
  const btn  = document.getElementById('lock-btn');
  const lbl  = document.getElementById('lock-label');
  const wall  = document.getElementById('manager-wall');
  const wall2 = document.getElementById('manager-wall2');
  const form  = document.getElementById('add-form');
  const pform = document.getElementById('players-form');

  if (isManager) {
    lbl.textContent = 'Odhlásit se';
    btn.classList.add('active');
    btn.querySelector('.ti').className = 'ti ti-lock-open';
    wall.style.display  = 'none';
    wall2.style.display = 'none';
    form.style.display  = 'block';
    pform.style.display = 'block';
    populatePlayerSelects();
  } else {
    lbl.textContent = 'Manager login';
    btn.classList.remove('active');
    btn.querySelector('.ti').className = 'ti ti-lock';
    wall.style.display  = 'block';
    wall2.style.display = 'block';
    form.style.display  = 'none';
    pform.style.display = 'none';
  }
}

// ─── PLAYER SELECTS ────────────────────────
function populatePlayerSelects() {
  ['f-player', 'log-player-filter', 'edit-player'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const prev = el.value;
    const isFilter = id === 'log-player-filter';
    el.innerHTML = isFilter
      ? '<option value="">Všichni hráči</option>'
      : '<option value="">— vyber hráče —</option>';
    state.players.forEach(p => {
      const o = document.createElement('option');
      o.value = p.name;
      o.textContent = p.name;
      el.appendChild(o);
    });
    if (prev) el.value = prev;
  });
}

// ─── PARSE QUICK INPUT ─────────────────────
function parseQuick(val) {
  const prev = document.getElementById('parse-preview');
  const parts = val.split('-').map(s => s.trim());
  if (parts.length >= 3) {
    const player = parts[0];
    const reason = parts.slice(1, -1).join(' - ');
    const amt    = parseFloat(parts[parts.length - 1]);
    if (player && reason && !isNaN(amt) && amt > 0) {
      const exists = state.players.find(p => p.name.toLowerCase() === player.toLowerCase());
      prev.innerHTML = `<strong>${esc(player)}</strong> &nbsp;·&nbsp; ${esc(reason)} &nbsp;·&nbsp; `
        + `<strong>${amt} ${CONFIG.CURRENCY}</strong>`
        + (exists ? '' : ' &nbsp;<span class="badge badge-new">Nový hráč</span>');
      return;
    }
  }
  prev.innerHTML = `Formát: <strong>Hráč – Důvod – Částka</strong>`;
}

function submitQuick() {
  const val   = document.getElementById('quick-input').value.trim();
  const parts = val.split('-').map(s => s.trim());
  if (parts.length < 3) { alert('Použij formát: Hráč - Důvod - Částka'); return; }
  const player = parts[0];
  const reason = parts.slice(1, -1).join(' - ');
  const amt    = parseFloat(parts[parts.length - 1]);
  if (!player || !reason || isNaN(amt) || amt <= 0) { alert('Zkontroluj vstup.'); return; }
  ensurePlayer(player);
  addFine(player, reason, amt);
  document.getElementById('quick-input').value = '';
  document.getElementById('parse-preview').innerHTML = `Formát: <strong>Hráč – Důvod – Částka</strong>`;
}

function submitManual() {
  const player = document.getElementById('f-player').value;
  const reason = document.getElementById('f-reason').value.trim();
  const amt    = parseFloat(document.getElementById('f-amount').value);
  if (!player || !reason || isNaN(amt) || amt <= 0) { alert('Vyplň všechna pole.'); return; }
  addFine(player, reason, amt);
  document.getElementById('f-reason').value  = '';
  document.getElementById('f-amount').value  = '';
}

function ensurePlayer(name) {
  if (!state.players.find(p => p.name.toLowerCase() === name.toLowerCase())) {
    state.players.push({ name, email: '' });
    saveState();
    populatePlayerSelects();
  }
}

function addFine(player, reason, amount) {
  state.fines.unshift({ player, reason, amount, ts: Date.now() });
  saveState();
  populatePlayerSelects();
  showToast(`Pokuta přidána: ${player} – ${amount} ${CONFIG.CURRENCY}`);
}

// ─── LOG ───────────────────────────────────
function renderLog() {
  populatePlayerSelects();
  const search  = (document.getElementById('log-search').value || '').toLowerCase();
  const pf      = (document.getElementById('log-player-filter').value || '').toLowerCase();
  const list    = document.getElementById('log-list');
  const empty   = document.getElementById('log-empty');

  const fines = state.fines.filter(f => {
    if (pf && f.player.toLowerCase() !== pf) return false;
    if (search && !f.player.toLowerCase().includes(search) && !f.reason.toLowerCase().includes(search)) return false;
    return true;
  });

  if (fines.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  list.innerHTML = fines.map(f => {
    const idx = state.fines.indexOf(f);
    const d   = new Date(f.ts);
    const ds  = d.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit' })
              + ' ' + d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
    const editBtn   = `<button class="btn-icon" onclick="openEdit(${idx})" title="Upravit"><i class="ti ti-edit"></i></button>`;
    const deleteBtn = `<button class="btn-icon danger" onclick="deleteFine(${idx})" title="Smazat"><i class="ti ti-trash"></i></button>`;
    return `
      <div class="fine-row">
        <span class="fine-player">${esc(f.player)}</span>
        <span class="fine-reason">${esc(f.reason)}</span>
        <span class="fine-amt">${f.amount} ${CONFIG.CURRENCY}</span>
        <span class="fine-time">${ds}</span>
        ${isManager ? `<div class="fine-actions">${editBtn}${deleteBtn}</div>` : ''}
      </div>`;
  }).join('');
}

function deleteFine(idx) {
  if (!confirm('Smazat tuto pokutu?')) return;
  state.fines.splice(idx, 1);
  saveState();
  renderLog();
}

function openEdit(idx) {
  editIndex = idx;
  const f = state.fines[idx];
  populatePlayerSelects();
  document.getElementById('edit-player').value = f.player;
  document.getElementById('edit-reason').value  = f.reason;
  document.getElementById('edit-amount').value  = f.amount;
  document.getElementById('edit-modal').classList.add('open');
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.remove('open');
}

function saveEdit() {
  const f = state.fines[editIndex];
  f.player = document.getElementById('edit-player').value;
  f.reason = document.getElementById('edit-reason').value.trim();
  f.amount = parseFloat(document.getElementById('edit-amount').value);
  if (!f.player || !f.reason || isNaN(f.amount) || f.amount <= 0) {
    alert('Zkontroluj všechna pole.'); return;
  }
  saveState();
  closeEditModal();
  renderLog();
  showToast('Pokuta upravena ✓');
}

// ─── SUMMARY ───────────────────────────────
function renderSummary() {
  const totals = {};
  state.players.forEach(p => { totals[p.name] = { total: 0, count: 0 }; });
  state.fines.forEach(f => {
    if (!totals[f.player]) totals[f.player] = { total: 0, count: 0 };
    totals[f.player].total  += f.amount;
    totals[f.player].count  += 1;
  });

  const allTotal = state.fines.reduce((a, f) => a + f.amount, 0);
  document.getElementById('summary-stats').innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Celkem ve fondu</div>
      <div class="stat-value">${allTotal}<span class="stat-unit">${CONFIG.CURRENCY}</span></div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Počet pokut</div>
      <div class="stat-value">${state.fines.length}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Hráčů</div>
      <div class="stat-value">${state.players.length}</div>
    </div>`;

  const sorted = Object.entries(totals).sort((a, b) => b[1].total - a[1].total);
  const listEl = document.getElementById('summary-list');

  if (sorted.length === 0) {
    listEl.innerHTML = '<div class="empty-state"><i class="ti ti-chart-bar"></i><p>Zatím žádná data.</p></div>';
    return;
  }

  listEl.innerHTML = sorted.map(([name, d]) => {
    const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const pct = allTotal > 0 ? Math.round((d.total / allTotal) * 100) : 0;
    return `
      <div class="player-summary-row">
        <div class="avatar">${initials}</div>
        <div style="flex:1; min-width:0;">
          <div class="ps-name">${esc(name)}</div>
          <div class="ps-count">${d.count} pokuta${d.count !== 1 ? (d.count < 5 ? 'y' : '') : ''} · ${pct}% fondu</div>
        </div>
        <div class="ps-total">${d.total} ${CONFIG.CURRENCY}</div>
      </div>`;
  }).join('');
}

function generateEmailReport() {
  const totals = {};
  state.players.forEach(p => { totals[p.name] = { total: 0, count: 0 }; });
  state.fines.forEach(f => {
    if (!totals[f.player]) totals[f.player] = { total: 0, count: 0 };
    totals[f.player].total += f.amount;
    totals[f.player].count += 1;
  });

  const sorted    = Object.entries(totals).filter(([, d]) => d.total > 0).sort((a, b) => b[1].total - a[1].total);
  const grandTotal = sorted.reduce((a, [, d]) => a + d.total, 0);
  const today     = new Date().toLocaleDateString('cs-CZ');
  const lines     = sorted.map(([name, d]) => `  ${name}: ${d.total} ${CONFIG.CURRENCY} (${d.count}×)`).join('\n');

  const report = `Ahoj tým! 👋\n\nPřehled pokut k ${today} (sezona ${CONFIG.SEASON}):\n\n${lines}\n\nCelkem ve fondu: ${grandTotal} ${CONFIG.CURRENCY} 🎉\n\nDo konce sezóny prosím uhraďte svůj příspěvek – jdeme na párty!`;

  const el = document.getElementById('email-report');
  el.style.display = 'block';
  el.innerHTML = `
    <div class="email-report-box">
      <textarea id="report-text" readonly>${report}</textarea>
    </div>
    <button class="btn btn-secondary" style="margin-top:8px;" onclick="copyReport()">
      <i class="ti ti-copy"></i> Kopírovat
    </button>`;
}

function copyReport() {
  const ta = document.getElementById('report-text');
  navigator.clipboard.writeText(ta.value).then(() => showToast('Zkopírováno do schránky ✓'));
}

// ─── PLAYERS ───────────────────────────────
function addPlayer() {
  const name  = document.getElementById('new-player-name').value.trim();
  const email = document.getElementById('new-player-email').value.trim();
  const err   = document.getElementById('add-player-err');

  if (!name) { showErr(err, 'Jméno je povinné.'); return; }
  if (state.players.find(p => p.name.toLowerCase() === name.toLowerCase())) {
    showErr(err, 'Hráč s tímto jménem již existuje.'); return;
  }
  if (email && !email.includes('@')) { showErr(err, 'Neplatný e-mail.'); return; }

  state.players.push({ name, email });
  saveState();
  err.style.display = 'none';
  document.getElementById('new-player-name').value  = '';
  document.getElementById('new-player-email').value = '';
  renderPlayers();
  populatePlayerSelects();
  showToast(`Hráč ${name} přidán ✓`);
}

function renderPlayers() {
  const list  = document.getElementById('player-list');
  const empty = document.getElementById('player-list-empty');

  if (state.players.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  list.innerHTML = state.players.map((p, i) => {
    const initials   = p.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const fineCount  = state.fines.filter(f => f.player === p.name).length;
    const fineTotal  = state.fines.filter(f => f.player === p.name).reduce((a, f) => a + f.amount, 0);
    return `
      <div class="player-row">
        <div class="avatar" style="width:32px;height:32px;font-size:11px;">${initials}</div>
        <span class="player-row-name">${esc(p.name)}</span>
        <span class="player-row-email">
          ${p.email
            ? `<i class="ti ti-mail" style="font-size:12px;vertical-align:-2px;margin-right:3px;"></i>${esc(p.email)}`
            : '<span style="color:var(--text-muted);font-style:italic;">bez e-mailu</span>'}
        </span>
        <span class="badge badge-amber">${fineCount}× · ${fineTotal} ${CONFIG.CURRENCY}</span>
        <div class="player-row-actions">
          <button class="btn-icon" onclick="editPlayerEmail(${i})" title="Upravit e-mail"><i class="ti ti-edit"></i></button>
          <button class="btn-icon danger" onclick="removePlayer(${i})" title="Odebrat hráče"><i class="ti ti-trash"></i></button>
        </div>
      </div>`;
  }).join('');
}

function editPlayerEmail(i) {
  const p     = state.players[i];
  const email = prompt(`E-mail pro ${p.name}:`, p.email || '');
  if (email === null) return;
  state.players[i].email = email.trim();
  saveState();
  renderPlayers();
  showToast('E-mail uložen ✓');
}

function removePlayer(i) {
  const p = state.players[i];
  if (!confirm(`Odebrat ${p.name}? Jejich pokuty zůstanou v logu.`)) return;
  state.players.splice(i, 1);
  saveState();
  renderPlayers();
  populatePlayerSelects();
  showToast(`${p.name} odebrán/a`);
}

// ─── VOICE INPUT ───────────────────────────
function toggleVoice() {
  const btn = document.getElementById('voice-btn');

  if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
    alert('Hlasový vstup není v tomto prohlížeči podporován. Zkuste Chrome.');
    return;
  }

  if (recognition) {
    recognition.stop();
    recognition = null;
    btn.classList.remove('listening');
    return;
  }

  const SR    = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SR();
  recognition.lang        = 'cs-CZ';
  recognition.continuous  = false;
  recognition.interimResults = false;

  btn.classList.add('listening');

  recognition.onresult = e => {
    const text = e.results[0][0].transcript;
    document.getElementById('quick-input').value = text;
    parseQuick(text);
    recognition = null;
    btn.classList.remove('listening');
  };
  recognition.onerror = () => { recognition = null; btn.classList.remove('listening'); };
  recognition.onend   = () => { recognition = null; btn.classList.remove('listening'); };
  recognition.start();
}

// ─── UTILS ─────────────────────────────────
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

function showErr(el, msg) {
  el.textContent = msg;
  el.style.display = 'block';
}
