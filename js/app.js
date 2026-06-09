/**
 * Team Fines – app.js  (v3 – Firebase auth + Firestore sync + batch voice + nicknames)
 * ──────────────────────────────────────────────────────────────────────────────────────
 * Config at the top. No build step. Works as ES module loaded from index.html.
 */

import { auth, db } from './firebase.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ─── CONFIG ───────────────────────────────────────────────────────
const CONFIG = {
  PIN:      '1234',     // ← manager PIN (change this!)
  CURRENCY: 'CZK',     // ← EUR, GBP, …
  SEASON:   '2025/26', // ← update each season
  // Firestore document path – all team members share one document
  FIRESTORE_DOC: 'teamdata/main',
};

// ─── STATE ────────────────────────────────────────────────────────
let isManager     = false;
let editIndex     = -1;
let nickPlayerIdx = -1;
let currentUser   = null;
let unsubFirestore = null;   // listener cleanup

// Voice
let recognition    = null;
let voiceActive    = false;
let silenceTimer   = null;
let fullTranscript = '';

// Review queue
let reviewQueue = [];

// Local state (mirrored from Firestore)
let state = { players: [], fines: [] };

// ─── AUTH STATE LISTENER ──────────────────────────────────────────
onAuthStateChanged(auth, user => {
  currentUser = user;
  if (!user) {
    showScreen('auth');
    stopFirestoreListener();
    return;
  }
  if (!user.emailVerified) {
    showScreen('verify');
    updateVerifyScreen(user);
    stopFirestoreListener();
    return;
  }
  // Logged in and verified
  showScreen('app');
  document.getElementById('header-user').textContent = user.displayName || user.email;
  document.getElementById('season-label').textContent = `Sezona ${CONFIG.SEASON}`;
  startFirestoreListener();
});

function showScreen(name) {
  document.getElementById('auth-screen').style.display   = name === 'auth'   ? 'flex' : 'none';
  document.getElementById('verify-screen').style.display = name === 'verify' ? 'flex' : 'none';
  document.getElementById('app-screen').style.display    = name === 'app'    ? 'block' : 'none';
}

// ─── AUTH TABS ────────────────────────────────────────────────────
function showAuthTab(t) {
  document.querySelectorAll('.auth-tab').forEach((el, i) =>
    el.classList.toggle('active', ['login','register'][i] === t));
  document.getElementById('auth-login').classList.toggle('active', t === 'login');
  document.getElementById('auth-register').classList.toggle('active', t === 'register');
}
window.showAuthTab = showAuthTab;

// ─── REGISTER ─────────────────────────────────────────────────────
async function doRegister() {
  const name  = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pass  = document.getElementById('reg-password').value;
  const pass2 = document.getElementById('reg-password2').value;
  const err   = document.getElementById('reg-err');
  const btn   = document.getElementById('reg-btn');

  err.style.display = 'none';
  if (!name)              { showErr(err, 'Zadej jméno.'); return; }
  if (!email)             { showErr(err, 'Zadej e-mail.'); return; }
  if (pass.length < 6)    { showErr(err, 'Heslo musí mít alespoň 6 znaků.'); return; }
  if (pass !== pass2)     { showErr(err, 'Hesla se neshodují.'); return; }

  btn.disabled = true;
  btn.textContent = 'Vytváříme účet…';
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    // Update display name
    const { updateProfile } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
    await updateProfile(cred.user, { displayName: name });
    await sendEmailVerification(cred.user);
    // onAuthStateChanged will route to verify screen
  } catch (e) {
    showErr(err, friendlyAuthError(e.code));
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-user-plus"></i> Vytvořit účet';
  }
}
window.doRegister = doRegister;

// ─── LOGIN ────────────────────────────────────────────────────────
async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-password').value;
  const err   = document.getElementById('login-err');
  const btn   = document.getElementById('login-btn');

  err.style.display = 'none';
  if (!email || !pass) { showErr(err, 'Vyplň e-mail a heslo.'); return; }

  btn.disabled = true;
  btn.textContent = 'Přihlašuji…';
  try {
    await signInWithEmailAndPassword(auth, email, pass);
    // onAuthStateChanged handles routing
  } catch (e) {
    showErr(err, friendlyAuthError(e.code));
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-login"></i> Přihlásit se';
  }
}
window.doLogin = doLogin;

async function doLogout() {
  isManager = false;
  await signOut(auth);
}
window.doLogout = doLogout;

async function doForgotPassword() {
  const email = document.getElementById('login-email').value.trim();
  if (!email) { showErr(document.getElementById('login-err'), 'Zadej nejprve e-mail výše.'); return; }
  try {
    await sendPasswordResetEmail(auth, email);
    showToast('Odkaz pro reset hesla odeslán ✓');
  } catch (e) {
    showErr(document.getElementById('login-err'), friendlyAuthError(e.code));
  }
}
window.doForgotPassword = doForgotPassword;

// ─── EMAIL VERIFICATION ───────────────────────────────────────────
function updateVerifyScreen(user) {
  document.getElementById('verify-sub').textContent =
    `Na ${user.email} jsme odeslali ověřovací odkaz. Klikni na něj a pak se vrať sem.`;
}

async function checkVerification() {
  if (!currentUser) return;
  await currentUser.reload();
  if (currentUser.emailVerified) {
    showToast('E-mail ověřen ✓');
    // onAuthStateChanged fires automatically, routing to app
  } else {
    const msg = document.getElementById('verify-msg');
    showErr(msg, 'E-mail ještě není ověřen. Zkontroluj doručenou poštu (i spam).');
  }
}
window.checkVerification = checkVerification;

async function resendVerification() {
  if (!currentUser) return;
  try {
    await sendEmailVerification(currentUser);
    showToast('Ověřovací e-mail odeslán ✓');
  } catch (e) {
    showErr(document.getElementById('verify-msg'), 'Chyba: ' + e.message);
  }
}
window.resendVerification = resendVerification;

// ─── FIRESTORE SYNC ───────────────────────────────────────────────
function startFirestoreListener() {
  stopFirestoreListener();
  const ref = doc(db, CONFIG.FIRESTORE_DOC);
  unsubFirestore = onSnapshot(ref, snap => {
    if (snap.exists()) {
      state = snap.data();
      state.players = state.players || [];
      state.fines   = state.fines   || [];
    } else {
      state = { players: [], fines: [] };
    }
    // Re-render whatever tab is active
    const activeTab = document.querySelector('.tab.active');
    if (activeTab) {
      const t = activeTab.dataset.tab;
      if (t === 'log')     renderLog();
      if (t === 'summary') renderSummary();
      if (t === 'players') renderPlayers();
    }
    populatePlayerSelects();
  });
}

function stopFirestoreListener() {
  if (unsubFirestore) { unsubFirestore(); unsubFirestore = null; }
}

async function saveState() {
  if (!currentUser) return;
  try {
    await setDoc(doc(db, CONFIG.FIRESTORE_DOC), state);
  } catch (e) {
    console.error('Firestore save error', e);
    showToast('⚠ Nepodařilo se uložit data.');
  }
}

// ─── LOCK / PIN ───────────────────────────────────────────────────
function toggleLock() {
  if (isManager) { isManager = false; updateLockUI(); showToast('Manažer odhlášen'); return; }
  document.getElementById('pin-modal').classList.add('open');
  setTimeout(() => document.getElementById('pin-input').focus(), 80);
}
window.toggleLock = toggleLock;

function closePinModal() {
  document.getElementById('pin-modal').classList.remove('open');
  document.getElementById('pin-input').value = '';
  document.getElementById('pin-err').style.display = 'none';
}
window.closePinModal = closePinModal;

function checkPin() {
  if (document.getElementById('pin-input').value === CONFIG.PIN) {
    isManager = true; closePinModal(); updateLockUI();
    showToast('Manažer přihlášen ✓');
  } else {
    document.getElementById('pin-err').style.display = 'block';
    document.getElementById('pin-input').select();
  }
}
window.checkPin = checkPin;

function updateLockUI() {
  const btn   = document.getElementById('lock-btn');
  const lbl   = document.getElementById('lock-label');
  if (isManager) {
    lbl.textContent = 'Odhlásit';
    btn.classList.add('active');
    btn.querySelector('.ti').className = 'ti ti-lock-open';
    document.getElementById('manager-wall').style.display  = 'none';
    document.getElementById('manager-wall2').style.display = 'none';
    document.getElementById('add-form').style.display      = 'block';
    document.getElementById('players-form').style.display  = 'block';
    populatePlayerSelects();
  } else {
    lbl.textContent = 'Manager';
    btn.classList.remove('active');
    btn.querySelector('.ti').className = 'ti ti-lock';
    document.getElementById('manager-wall').style.display  = 'block';
    document.getElementById('manager-wall2').style.display = 'block';
    document.getElementById('add-form').style.display      = 'none';
    document.getElementById('players-form').style.display  = 'none';
  }
}

// ─── TABS ─────────────────────────────────────────────────────────
function switchTab(t) {
  document.querySelectorAll('.tab').forEach(el => el.classList.toggle('active', el.dataset.tab === t));
  document.querySelectorAll('.panel').forEach(el => el.classList.remove('active'));
  document.getElementById('panel-' + t).classList.add('active');
  if (t === 'log')     renderLog();
  if (t === 'summary') renderSummary();
  if (t === 'players') renderPlayers();
}
window.switchTab = switchTab;

// ─── PLAYER SELECTS ───────────────────────────────────────────────
function populatePlayerSelects() {
  ['f-player','log-player-filter','edit-player'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const prev = el.value;
    el.innerHTML = id === 'log-player-filter'
      ? '<option value="">Všichni hráči</option>'
      : '<option value="">— vyber hráče —</option>';
    (state.players || []).forEach(p => {
      const o = document.createElement('option');
      o.value = p.name; o.textContent = p.name;
      el.appendChild(o);
    });
    if (prev) el.value = prev;
  });
}

// ─── NICKNAME RESOLUTION ──────────────────────────────────────────
function resolvePlayerName(raw) {
  const norm = raw.toLowerCase().trim();
  let p = state.players.find(p => p.name.toLowerCase() === norm);
  if (p) return p.name;
  p = state.players.find(p => (p.nicknames || []).some(n => n.toLowerCase() === norm));
  if (p) return p.name;
  // fuzzy containment
  p = state.players.find(p =>
    p.name.toLowerCase().includes(norm) || norm.includes(p.name.toLowerCase()) ||
    (p.nicknames || []).some(n => n.toLowerCase().includes(norm) || norm.includes(n.toLowerCase()))
  );
  return p ? p.name : null;
}

// ─── PARSE HELPERS ────────────────────────────────────────────────
function parseChunk(chunk) {
  const s = chunk.replace(/[–—]/g, '-').trim();
  if (!s) return null;
  const parts = s.split('-').map(x => x.trim()).filter(Boolean);
  if (parts.length < 3) return null;
  const rawName = parts[0];
  const amount  = parseFloat(parts[parts.length - 1].replace(/\s/g, ''));
  const reason  = parts.slice(1, -1).join(' – ');
  if (!rawName || !reason || isNaN(amount) || amount <= 0) return null;
  return { rawName, reason, amount };
}

function splitTranscript(text) {
  return text.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
}

// ─── QUICK TEXT ───────────────────────────────────────────────────
function parseQuick(val) {
  const preview = document.getElementById('parse-preview');
  const parsed  = parseChunk(val);
  if (parsed) {
    const resolved = resolvePlayerName(parsed.rawName);
    const label    = resolved || parsed.rawName;
    const isNew    = !resolved;
    const isAlias  = resolved && resolved.toLowerCase() !== parsed.rawName.toLowerCase();
    preview.innerHTML =
      `<strong>${esc(label)}</strong>`
      + (isAlias ? ` <span class="badge badge-alias">≡ ${esc(parsed.rawName)}</span>` : '')
      + (isNew   ? ` <span class="badge badge-new">Nový hráč</span>` : '')
      + ` &nbsp;·&nbsp; ${esc(parsed.reason)} &nbsp;·&nbsp; <strong>${parsed.amount} ${CONFIG.CURRENCY}</strong>`;
  } else {
    preview.innerHTML = `Formát: <strong>Hráč – Důvod – Částka</strong>`;
  }
}
window.parseQuick = parseQuick;

function submitQuick() {
  const val    = document.getElementById('quick-input').value.trim();
  const parsed = parseChunk(val);
  if (!parsed) { alert('Použij formát: Hráč - Důvod - Částka'); return; }
  const resolved = resolvePlayerName(parsed.rawName) || parsed.rawName;
  ensurePlayer(resolved);
  addFine(resolved, parsed.reason, parsed.amount);
  document.getElementById('quick-input').value = '';
  document.getElementById('parse-preview').innerHTML = `Formát: <strong>Hráč – Důvod – Částka</strong>`;
}
window.submitQuick = submitQuick;

function submitManual() {
  const player = document.getElementById('f-player').value;
  const reason = document.getElementById('f-reason').value.trim();
  const amt    = parseFloat(document.getElementById('f-amount').value);
  if (!player || !reason || isNaN(amt) || amt <= 0) { alert('Vyplň všechna pole.'); return; }
  addFine(player, reason, amt);
  document.getElementById('f-reason').value = '';
  document.getElementById('f-amount').value = '';
}
window.submitManual = submitManual;

// ─── VOICE SESSION ────────────────────────────────────────────────
function toggleVoiceSession() {
  voiceActive ? stopVoiceSession() : startVoiceSession();
}
window.toggleVoiceSession = toggleVoiceSession;

function startVoiceSession() {
  if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
    alert('Hlasový vstup není podporován. Zkuste Chrome nebo Edge.'); return;
  }
  voiceActive    = true;
  fullTranscript = '';

  const btn    = document.getElementById('voice-record-btn');
  const lbl    = document.getElementById('voice-record-label');
  const status = document.getElementById('voice-status');
  const live   = document.getElementById('voice-live');

  btn.classList.add('recording');
  lbl.textContent    = 'Zastavit nahrávání';
  status.textContent = '🔴 Nahrávám…';
  live.style.display = 'block';
  live.textContent   = '';

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SR();
  recognition.lang            = 'cs-CZ';
  recognition.continuous      = true;
  recognition.interimResults  = true;
  recognition.maxAlternatives = 1;

  recognition.onresult = e => {
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => { if (voiceActive) stopVoiceSession(); }, 3500);

    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) {
        fullTranscript += (fullTranscript ? ', ' : '') + t;
      } else {
        interim = t;
      }
    }
    live.textContent = fullTranscript + (interim ? ' ' + interim : '');
  };

  recognition.onerror = err => {
    if (['no-speech','audio-capture'].includes(err.error)) stopVoiceSession();
  };
  recognition.onend = () => {
    if (voiceActive) {
      try { recognition.start(); } catch(e) { stopVoiceSession(); }
    }
  };
  recognition.start();
}

function stopVoiceSession() {
  voiceActive = false;
  clearTimeout(silenceTimer);
  if (recognition) { recognition.onend = null; try { recognition.stop(); } catch(e) {} recognition = null; }

  const btn    = document.getElementById('voice-record-btn');
  const lbl    = document.getElementById('voice-record-label');
  const status = document.getElementById('voice-status');
  const live   = document.getElementById('voice-live');

  btn.classList.remove('recording');
  lbl.textContent    = 'Spustit nahrávání';
  status.textContent = '';
  live.style.display = 'none';

  const transcript = fullTranscript.trim();
  if (!transcript) { showToast('Žádný hlasový vstup.'); return; }
  buildReviewQueue(transcript);
}

// ─── REVIEW QUEUE ─────────────────────────────────────────────────
function buildReviewQueue(transcript) {
  const chunks = splitTranscript(transcript);
  reviewQueue  = [];

  for (const chunk of chunks) {
    const parsed = parseChunk(chunk);
    if (!parsed) continue;
    const resolved = resolvePlayerName(parsed.rawName);
    reviewQueue.push({
      rawName:        parsed.rawName,
      resolvedPlayer: resolved || parsed.rawName,
      reason:         parsed.reason,
      amount:         parsed.amount,
      isNew:          !resolved,
      isAlias:        !!(resolved && resolved.toLowerCase() !== parsed.rawName.toLowerCase()),
      skip:           false,
    });
  }

  if (reviewQueue.length === 0) {
    showToast('Nepodařilo se rozpoznat žádné pokuty. Zkus znovu.'); return;
  }
  renderReviewQueue();
  document.getElementById('voice-review').style.display = 'block';
  document.getElementById('voice-review').scrollIntoView({ behavior: 'smooth' });
}

function renderReviewQueue() {
  const list = document.getElementById('review-list');
  const btn  = document.getElementById('confirm-btn');
  const active = reviewQueue.filter(r => !r.skip);
  btn.innerHTML = `<i class="ti ti-device-floppy"></i> Uložit ${active.length} pokut${active.length === 1 ? 'u' : active.length < 5 ? 'y' : ''}`;

  list.innerHTML = reviewQueue.map((r, i) => {
    const opts = (state.players || []).map(p =>
      `<option value="${esc(p.name)}"${p.name === r.resolvedPlayer ? ' selected' : ''}>${esc(p.name)}</option>`
    ).join('');
    const newOpt = r.isNew ? `<option value="${esc(r.resolvedPlayer)}" selected>${esc(r.resolvedPlayer)} (nový)</option>` : '';

    return `
    <div class="review-item${r.skip ? ' skipped' : ''}" id="ri-${i}">
      <div class="review-item-header">
        <span class="review-item-num">${i + 1}</span>
        <span class="review-item-tags">
          ${r.isAlias ? `<span class="badge badge-alias">≡ ${esc(r.rawName)}</span>` : ''}
          ${r.isNew   ? `<span class="badge badge-new">Nový hráč</span>` : ''}
        </span>
        <button class="btn-icon${r.skip ? '' : ' danger'}" onclick="toggleSkip(${i})" title="${r.skip ? 'Obnovit' : 'Přeskočit'}">
          <i class="ti ${r.skip ? 'ti-rotate-clockwise' : 'ti-trash'}"></i>
        </button>
      </div>
      <div class="review-fields"${r.skip ? ' style="opacity:.4;pointer-events:none;"' : ''}>
        <div class="review-field">
          <label>Hráč</label>
          <select onchange="updateReview(${i},'resolvedPlayer',this.value)">${newOpt}${opts}</select>
        </div>
        <div class="review-field review-field-reason">
          <label>Důvod</label>
          <input type="text" value="${esc(r.reason)}" oninput="updateReview(${i},'reason',this.value)" />
        </div>
        <div class="review-field review-field-amt">
          <label>Částka</label>
          <input type="number" value="${r.amount}" oninput="updateReview(${i},'amount',parseFloat(this.value))" />
        </div>
      </div>
    </div>`;
  }).join('');
}
window.renderReviewQueue = renderReviewQueue;

function updateReview(i, key, val) {
  reviewQueue[i][key] = val;
  if (key === 'resolvedPlayer') {
    reviewQueue[i].isNew   = !state.players.find(p => p.name === val);
    reviewQueue[i].isAlias = false;
  }
  const active = reviewQueue.filter(r => !r.skip);
  document.getElementById('confirm-btn').innerHTML =
    `<i class="ti ti-device-floppy"></i> Uložit ${active.length} pokut${active.length === 1 ? 'u' : active.length < 5 ? 'y' : ''}`;
}
window.updateReview = updateReview;

function toggleSkip(i) { reviewQueue[i].skip = !reviewQueue[i].skip; renderReviewQueue(); }
window.toggleSkip = toggleSkip;

async function confirmReview() {
  const toSave = reviewQueue.filter(r => !r.skip);
  if (toSave.length === 0) { discardReview(); return; }
  toSave.forEach(r => {
    ensurePlayer(r.resolvedPlayer);
    state.fines.unshift({ player: r.resolvedPlayer, reason: r.reason, amount: r.amount, ts: Date.now() });
  });
  await saveState();
  showToast(`✓ Uloženo ${toSave.length} pokut`);
  discardReview();
  populatePlayerSelects();
}
window.confirmReview = confirmReview;

function discardReview() {
  reviewQueue = [];
  document.getElementById('voice-review').style.display = 'none';
}
window.discardReview = discardReview;

// ─── CORE FINE OPS ────────────────────────────────────────────────
function ensurePlayer(name) {
  if (!state.players.find(p => p.name.toLowerCase() === name.toLowerCase())) {
    state.players.push({ name, email: '', nicknames: [] });
  }
}

async function addFine(player, reason, amount) {
  state.fines.unshift({ player, reason, amount, ts: Date.now() });
  await saveState();
  showToast(`Pokuta přidána: ${player} – ${amount} ${CONFIG.CURRENCY}`);
}

// ─── LOG ──────────────────────────────────────────────────────────
function renderLog() {
  populatePlayerSelects();
  const search = (document.getElementById('log-search').value || '').toLowerCase();
  const pf     = (document.getElementById('log-player-filter').value || '').toLowerCase();
  const list   = document.getElementById('log-list');
  const empty  = document.getElementById('log-empty');

  const fines = (state.fines || []).filter(f => {
    if (pf && f.player.toLowerCase() !== pf) return false;
    if (search && !f.player.toLowerCase().includes(search) && !f.reason.toLowerCase().includes(search)) return false;
    return true;
  });

  if (fines.length === 0) { list.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';

  list.innerHTML = fines.map(f => {
    const idx = state.fines.indexOf(f);
    const d   = new Date(f.ts);
    const ds  = d.toLocaleDateString('cs-CZ', { day:'2-digit', month:'2-digit' })
              + ' ' + d.toLocaleTimeString('cs-CZ', { hour:'2-digit', minute:'2-digit' });
    return `
      <div class="fine-row">
        <span class="fine-player">${esc(f.player)}</span>
        <span class="fine-reason">${esc(f.reason)}</span>
        <span class="fine-amt">${f.amount} ${CONFIG.CURRENCY}</span>
        <span class="fine-time">${ds}</span>
        ${isManager ? `
        <div class="fine-actions">
          <button class="btn-icon" onclick="openEdit(${idx})" title="Upravit"><i class="ti ti-edit"></i></button>
          <button class="btn-icon danger" onclick="deleteFine(${idx})" title="Smazat"><i class="ti ti-trash"></i></button>
        </div>` : ''}
      </div>`;
  }).join('');
}
window.renderLog = renderLog;

async function deleteFine(idx) {
  if (!confirm('Smazat tuto pokutu?')) return;
  state.fines.splice(idx, 1);
  await saveState(); renderLog();
}
window.deleteFine = deleteFine;

function openEdit(idx) {
  editIndex = idx;
  const f = state.fines[idx];
  populatePlayerSelects();
  document.getElementById('edit-player').value = f.player;
  document.getElementById('edit-reason').value  = f.reason;
  document.getElementById('edit-amount').value  = f.amount;
  document.getElementById('edit-modal').classList.add('open');
}
window.openEdit = openEdit;

function closeEditModal() { document.getElementById('edit-modal').classList.remove('open'); }
window.closeEditModal = closeEditModal;

async function saveEdit() {
  const f = state.fines[editIndex];
  f.player = document.getElementById('edit-player').value;
  f.reason = document.getElementById('edit-reason').value.trim();
  f.amount = parseFloat(document.getElementById('edit-amount').value);
  if (!f.player || !f.reason || isNaN(f.amount) || f.amount <= 0) { alert('Zkontroluj všechna pole.'); return; }
  await saveState(); closeEditModal(); renderLog();
  showToast('Pokuta upravena ✓');
}
window.saveEdit = saveEdit;

// ─── SUMMARY ──────────────────────────────────────────────────────
function renderSummary() {
  const totals = {};
  (state.players || []).forEach(p => { totals[p.name] = { total:0, count:0 }; });
  (state.fines || []).forEach(f => {
    if (!totals[f.player]) totals[f.player] = { total:0, count:0 };
    totals[f.player].total += f.amount;
    totals[f.player].count += 1;
  });

  const allTotal = (state.fines || []).reduce((a,f) => a + f.amount, 0);
  document.getElementById('summary-stats').innerHTML = `
    <div class="stat-card"><div class="stat-label">Celkem ve fondu</div><div class="stat-value">${allTotal}<span class="stat-unit"> ${CONFIG.CURRENCY}</span></div></div>
    <div class="stat-card"><div class="stat-label">Počet pokut</div><div class="stat-value">${(state.fines||[]).length}</div></div>
    <div class="stat-card"><div class="stat-label">Hráčů</div><div class="stat-value">${(state.players||[]).length}</div></div>`;

  const sorted = Object.entries(totals).sort((a,b) => b[1].total - a[1].total);
  const listEl = document.getElementById('summary-list');
  if (sorted.length === 0) { listEl.innerHTML = '<div class="empty-state"><i class="ti ti-chart-bar"></i><p>Zatím žádná data.</p></div>'; return; }

  listEl.innerHTML = sorted.map(([name, d]) => {
    const initials = name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
    const pct = allTotal > 0 ? Math.round((d.total / allTotal) * 100) : 0;
    return `
      <div class="player-summary-row">
        <div class="avatar">${initials}</div>
        <div style="flex:1;min-width:0;">
          <div class="ps-name">${esc(name)}</div>
          <div class="ps-count">${d.count}× &nbsp;·&nbsp; ${pct}% fondu</div>
        </div>
        <div class="ps-total">${d.total} ${CONFIG.CURRENCY}</div>
      </div>`;
  }).join('');
}
window.renderSummary = renderSummary;

function generateEmailReport() {
  const totals = {};
  (state.players||[]).forEach(p => { totals[p.name] = { total:0, count:0 }; });
  (state.fines||[]).forEach(f => {
    if (!totals[f.player]) totals[f.player] = { total:0, count:0 };
    totals[f.player].total += f.amount;
    totals[f.player].count += 1;
  });
  const sorted     = Object.entries(totals).filter(([,d]) => d.total > 0).sort((a,b) => b[1].total - a[1].total);
  const grandTotal = sorted.reduce((a,[,d]) => a + d.total, 0);
  const today      = new Date().toLocaleDateString('cs-CZ');
  const lines      = sorted.map(([n,d]) => `  ${n}: ${d.total} ${CONFIG.CURRENCY} (${d.count}×)`).join('\n');
  const report     = `Ahoj tým! 👋\n\nPřehled pokut k ${today} (sezona ${CONFIG.SEASON}):\n\n${lines}\n\nCelkem ve fondu: ${grandTotal} ${CONFIG.CURRENCY} 🎉\n\nDo konce sezóny prosím uhraďte svůj příspěvek – jdeme na párty!`;

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
window.generateEmailReport = generateEmailReport;

function copyReport() {
  navigator.clipboard.writeText(document.getElementById('report-text').value)
    .then(() => showToast('Zkopírováno do schránky ✓'));
}
window.copyReport = copyReport;

// ─── PLAYERS ──────────────────────────────────────────────────────
async function addPlayer() {
  const name  = document.getElementById('new-player-name').value.trim();
  const email = document.getElementById('new-player-email').value.trim();
  const err   = document.getElementById('add-player-err');
  if (!name) { showErr(err,'Jméno je povinné.'); return; }
  if (state.players.find(p => p.name.toLowerCase() === name.toLowerCase())) { showErr(err,'Hráč s tímto jménem již existuje.'); return; }
  if (email && !email.includes('@')) { showErr(err,'Neplatný e-mail.'); return; }
  state.players.push({ name, email, nicknames: [] });
  await saveState();
  err.style.display = 'none';
  document.getElementById('new-player-name').value  = '';
  document.getElementById('new-player-email').value = '';
  showToast(`Hráč ${name} přidán ✓`);
}
window.addPlayer = addPlayer;

function renderPlayers() {
  const list  = document.getElementById('player-list');
  const empty = document.getElementById('player-list-empty');
  if (!state.players || state.players.length === 0) { list.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';

  list.innerHTML = state.players.map((p, i) => {
    const initials  = p.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    const fineCount = (state.fines||[]).filter(f=>f.player===p.name).length;
    const fineTotal = (state.fines||[]).filter(f=>f.player===p.name).reduce((a,f)=>a+f.amount,0);
    const nicks     = p.nicknames || [];
    const nickHtml  = nicks.length
      ? nicks.map(n=>`<span class="badge badge-alias">${esc(n)}</span>`).join(' ')
      : `<span class="no-nick">bez přezdívky</span>`;

    return `
      <div class="player-row">
        <div class="avatar" style="width:34px;height:34px;font-size:12px;flex-shrink:0;">${initials}</div>
        <div style="flex:1;min-width:0;">
          <div class="player-row-name">${esc(p.name)}</div>
          <div class="player-row-meta">
            ${p.email ? `<span class="player-email"><i class="ti ti-mail"></i> ${esc(p.email)}</span>` : ''}
            <span class="badge badge-amber">${fineCount}× · ${fineTotal} ${CONFIG.CURRENCY}</span>
          </div>
          <div class="player-row-nicks" onclick="openNickModal(${i})" title="Přezdívky">
            <i class="ti ti-tag" style="font-size:11px;color:var(--text-muted);"></i>
            ${nickHtml}
            <span class="nick-edit-hint">upravit</span>
          </div>
        </div>
        <div class="player-row-actions">
          <button class="btn-icon" onclick="editPlayerEmail(${i})" title="E-mail"><i class="ti ti-mail"></i></button>
          <button class="btn-icon" onclick="openNickModal(${i})" title="Přezdívky"><i class="ti ti-tag"></i></button>
          <button class="btn-icon danger" onclick="removePlayer(${i})" title="Odebrat"><i class="ti ti-trash"></i></button>
        </div>
      </div>`;
  }).join('');
}
window.renderPlayers = renderPlayers;

async function editPlayerEmail(i) {
  const p = state.players[i];
  const email = prompt(`E-mail pro ${p.name}:`, p.email || '');
  if (email === null) return;
  state.players[i].email = email.trim();
  await saveState(); renderPlayers(); showToast('E-mail uložen ✓');
}
window.editPlayerEmail = editPlayerEmail;

async function removePlayer(i) {
  const p = state.players[i];
  if (!confirm(`Odebrat ${p.name}? Jejich pokuty zůstanou v logu.`)) return;
  state.players.splice(i,1);
  await saveState(); renderPlayers(); populatePlayerSelects();
  showToast(`${p.name} odebrán/a`);
}
window.removePlayer = removePlayer;

// ─── NICKNAME MODAL ───────────────────────────────────────────────
function openNickModal(i) {
  nickPlayerIdx = i;
  const p = state.players[i];
  document.getElementById('nick-modal-title').textContent = `Přezdívky – ${p.name}`;
  document.getElementById('nick-input').value = '';
  document.getElementById('nick-err').style.display = 'none';
  renderNickChips();
  document.getElementById('nick-modal').classList.add('open');
  setTimeout(() => document.getElementById('nick-input').focus(), 80);
}
window.openNickModal = openNickModal;

function closeNickModal() { document.getElementById('nick-modal').classList.remove('open'); nickPlayerIdx = -1; }
window.closeNickModal = closeNickModal;

function renderNickChips() {
  const p     = state.players[nickPlayerIdx];
  const nicks = p ? (p.nicknames || []) : [];
  const chips = document.getElementById('nick-chips');
  if (nicks.length === 0) {
    chips.innerHTML = `<span style="color:var(--text-muted);font-size:13px;">Žádné přezdívky.</span>`;
    return;
  }
  chips.innerHTML = nicks.map((n,j) =>
    `<span class="nick-chip">${esc(n)}<button onclick="removeNick(${j})" title="Odebrat"><i class="ti ti-x"></i></button></span>`
  ).join('');
}

async function addNick() {
  const val = document.getElementById('nick-input').value.trim();
  const err = document.getElementById('nick-err');
  if (!val) { showErr(err,'Zadej přezdívku.'); return; }

  const p = state.players[nickPlayerIdx];
  p.nicknames = p.nicknames || [];

  const conflict = state.players.find((pl,i) =>
    i !== nickPlayerIdx && (
      pl.name.toLowerCase() === val.toLowerCase() ||
      (pl.nicknames||[]).some(n => n.toLowerCase() === val.toLowerCase())
    )
  );
  if (conflict) { showErr(err,`Tato přezdívka patří hráči ${conflict.name}.`); return; }
  if (p.nicknames.some(n => n.toLowerCase() === val.toLowerCase())) { showErr(err,'Přezdívka již existuje.'); return; }

  p.nicknames.push(val);
  await saveState();
  err.style.display = 'none';
  document.getElementById('nick-input').value = '';
  renderNickChips(); renderPlayers();
  showToast(`Přezdívka „${val}" přidána ✓`);
}
window.addNick = addNick;

async function removeNick(j) {
  state.players[nickPlayerIdx].nicknames.splice(j,1);
  await saveState(); renderNickChips(); renderPlayers();
}
window.removeNick = removeNick;

// ─── UTILS ────────────────────────────────────────────────────────
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

function showErr(el, msg) { el.textContent = msg; el.style.display = 'block'; }

function friendlyAuthError(code) {
  const map = {
    'auth/email-already-in-use':    'Tento e-mail je již zaregistrován.',
    'auth/invalid-email':           'Neplatný e-mail.',
    'auth/weak-password':           'Heslo je příliš slabé (min. 6 znaků).',
    'auth/user-not-found':          'Účet s tímto e-mailem neexistuje.',
    'auth/wrong-password':          'Nesprávné heslo.',
    'auth/invalid-credential':      'Nesprávný e-mail nebo heslo.',
    'auth/too-many-requests':       'Příliš mnoho pokusů. Zkus to za chvíli.',
    'auth/network-request-failed':  'Chyba sítě. Zkontroluj připojení.',
  };
  return map[code] || `Chyba: ${code}`;
}

// Init modals close-on-backdrop
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.modal-backdrop').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target !== el) return;
      if (el.id === 'pin-modal')  closePinModal();
      if (el.id === 'edit-modal') closeEditModal();
      if (el.id === 'nick-modal') closeNickModal();
    });
  });
});
