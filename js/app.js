/**
 * Team Fines – app.js  v4
 * Fixes: login-after-logout bug, design badges, add-player nickname field,
 *        log column order, season/half-season switcher, WA CSV import,
 *        phone-number self-fine auth.
 */

import { auth, db } from './firebase.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut,
  RecaptchaVerifier,
  signInWithPhoneNumber,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  doc, setDoc, onSnapshot,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ─── CONFIG ───────────────────────────────────────────────────────
const CONFIG = {
  PIN:      '1234',
  CURRENCY: 'CZK',
  FIRESTORE_DOC: 'teamdata/main',
};

// WhatsApp group members embedded from CSV
const WA_MEMBERS = [
  { name: 'Adrian',                phone: '+420770679955' },
  { name: 'Cédric',                phone: '+32486559110'  },
  { name: 'Erik Klemš',            phone: '+420608325078' },
  { name: 'Honzicek Laska',        phone: '+420737073672' },
  { name: 'Jan Fojtíček',          phone: '+420608241316' },
  { name: 'Jan Tichy',             phone: '+420735023771' },
  { name: 'Jiří Horčička',         phone: '+420737282974' },
  { name: 'Kuba Hoppan',           phone: '+420604189424' },
  { name: 'Lukas Teichmann',       phone: '+420734169237' },
  { name: 'Michael Botur',         phone: '+420730973794' },
  { name: 'Milan Kuba',            phone: '+420737628229' },
  { name: 'Radek Sahula',          phone: '+420773646367' },
  { name: 'Tomáš Vízner',          phone: '+420732219689' },
  { name: 'Venca Forejtar',        phone: '+420776715064' },
  { name: 'Adam',                  phone: '+420736640967' },
  { name: 'Adam Hubálek',          phone: '+420604605226' },
  { name: 'Dan Urban',             phone: '+420602945056' },
  { name: 'DanielSurgent',         phone: '+420776701464' },
  { name: 'DanR',                  phone: '+420723943393' },
  { name: 'David',                 phone: '+420777627209' },
  { name: 'Egor',                  phone: '+420608458135' },
  { name: 'Emil',                  phone: '+420606059544' },
  { name: 'Ephraime Superstain',   phone: '+420731114434' },
  { name: 'Hugo',                  phone: '+420606223189' },
  { name: 'Igor Banga',            phone: '+420723880377' },
  { name: 'Jachym Nahlovsky',      phone: '+420773907207' },
  { name: 'Jakub',                 phone: '+420730510280' },
  { name: 'Jan Hlaváč',            phone: '+420777052697' },
  { name: 'Jindřich Ludmila',      phone: '+420602274598' },
  { name: 'Josef Tureček',         phone: '+420732246134' },
  { name: 'Karel Roskowetz',       phone: '+420731626257' },
  { name: 'kovanej',               phone: '+420773481996' },
  { name: 'Kuba',                  phone: '+420724324104' },
  { name: 'Lukáš Záhrobský',       phone: '+420732946704' },
  { name: 'lumy',                  phone: '+420773677997' },
  { name: 'Marek Tomaštík',        phone: '+420731977214' },
  { name: 'Martin Kuzmiak',        phone: '+420608218103' },
  { name: 'Marty',                 phone: '+420736137188' },
  { name: 'Matěj Svoboda',         phone: '+420774091681' },
  { name: 'Michal Nevřala',        phone: '+420605086775' },
  { name: 'Milan',                 phone: '+420604414776' },
  { name: 'Milan',                 phone: '+420723755981' },
  { name: 'Mykhaylo Shymonya',     phone: '+420775404893' },
  { name: 'Petr',                  phone: '+420725887748' },
  { name: 'RA',                    phone: '+420773833388' },
  { name: 'Rishabh Kumar',         phone: '+420608726573' },
  { name: 'Roman Sahula',          phone: '+420792274339' },
  { name: 'Sami',                  phone: '+420775017793' },
  { name: 'Shanan Toyalla',        phone: '+421910162810' },
  { name: 'Šimon Havelka',         phone: '+420603840402' },
  { name: 'Škubánek',              phone: '+420777932063' },
  { name: 'Štěpán Ondříšek Svoboda', phone: '+420778077003' },
  { name: 'Viktor',                phone: '+420702095259' },
  { name: 'Vojta',                 phone: '+420739002841' },
  { name: 'Vojtas.09',             phone: '+420776527900' },
  { name: 'Vojtíkk',              phone: '+420774275503' },
];

// ─── APP STATE ────────────────────────────────────────────────────
let isManager      = false;
let editIndex      = -1;
let nickPlayerIdx  = -1;
let currentUser    = null;
let phoneUser      = null;   // player logged in via phone
let unsubFirestore = null;

// Season picker state
let activeSeason   = null; // e.g. { year: 2025, half: 'Podzim' }

// Voice
let recognition    = null;
let voiceActive    = false;
let silenceTimer   = null;
let fullTranscript = '';

// Review
let reviewQueue = [];

// Firestore mirror
let state = { players: [], fines: [], seasons: [] };

// ─── SEASON HELPERS ───────────────────────────────────────────────
function seasonKey(s) { return `${s.year}-${s.half}`; }
function seasonLabel(s) { return `${s.half} ${s.year}`; }

function currentYear() { return new Date().getFullYear(); }

function getActiveSeason() { return activeSeason; }

/** Fines belonging to the active season window */
function seasonFines() {
  if (!activeSeason) return state.fines || [];
  const s = activeSeason;
  // Podzim: Aug 1 – Jan 31 next year; Jaro: Feb 1 – Jul 31
  return (state.fines || []).filter(f => {
    const d = new Date(f.ts);
    const y = d.getFullYear();
    const m = d.getMonth() + 1; // 1-12
    if (s.half === 'Podzim') {
      return (y === s.year && m >= 8) || (y === s.year + 1 && m <= 1);
    } else { // Jaro
      return y === s.year && m >= 2 && m <= 7;
    }
  });
}

// ─── AUTH STATE ───────────────────────────────────────────────────
onAuthStateChanged(auth, user => {
  currentUser = user;

  // Reset login button whenever auth state changes (fixes logout→re-login bug)
  resetLoginBtn();

  if (!user) {
    // Also clear phone session
    if (!phoneUser) showScreen('auth');
    stopFirestoreListener();
    return;
  }
  if (!user.emailVerified) {
    showScreen('verify');
    document.getElementById('verify-sub').textContent =
      `Na ${user.email} jsme odeslali ověřovací odkaz. Klikni na něj a pak se vrať sem.`;
    stopFirestoreListener();
    return;
  }
  enterApp(user.displayName || user.email);
});

function resetLoginBtn() {
  const btn = document.getElementById('login-btn');
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-login"></i> Přihlásit se';
  }
  const rbtn = document.getElementById('reg-btn');
  if (rbtn) {
    rbtn.disabled = false;
    rbtn.innerHTML = '<i class="ti ti-user-plus"></i> Vytvořit účet';
  }
}

function enterApp(displayName) {
  showScreen('app');
  document.getElementById('header-user').textContent = displayName;
  initSeasonPicker();
  startFirestoreListener();
}

function showScreen(name) {
  document.getElementById('auth-screen').style.display   = name === 'auth'   ? 'flex' : 'none';
  document.getElementById('verify-screen').style.display = name === 'verify' ? 'flex' : 'none';
  document.getElementById('app-screen').style.display    = name === 'app'    ? 'block': 'none';
}

// ─── AUTH TABS ────────────────────────────────────────────────────
window.showAuthTab = function(t) {
  document.querySelectorAll('.auth-tab').forEach(el =>
    el.classList.toggle('active', el.dataset.tab === t));
  ['auth-login','auth-register','auth-phone'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', id === 'auth-' + t);
  });
};

// ─── EMAIL REGISTER ───────────────────────────────────────────────
window.doRegister = async function() {
  const name  = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pass  = document.getElementById('reg-password').value;
  const pass2 = document.getElementById('reg-password2').value;
  const err   = document.getElementById('reg-err');
  const btn   = document.getElementById('reg-btn');

  err.style.display = 'none';
  if (!name)           { showErr(err,'Zadej jméno.'); return; }
  if (!email)          { showErr(err,'Zadej e-mail.'); return; }
  if (pass.length < 6) { showErr(err,'Heslo musí mít alespoň 6 znaků.'); return; }
  if (pass !== pass2)  { showErr(err,'Hesla se neshodují.'); return; }

  btn.disabled = true; btn.textContent = 'Vytváříme účet…';
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    const { updateProfile } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
    await updateProfile(cred.user, { displayName: name });
    await sendEmailVerification(cred.user);
  } catch(e) {
    showErr(err, friendlyAuthError(e.code));
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-user-plus"></i> Vytvořit účet';
  }
};

// ─── EMAIL LOGIN ──────────────────────────────────────────────────
// FIX: always re-enable button in finally; don't rely solely on onAuthStateChanged reset
window.doLogin = async function() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-password').value;
  const err   = document.getElementById('login-err');
  const btn   = document.getElementById('login-btn');

  err.style.display = 'none';
  if (!email || !pass) { showErr(err,'Vyplň e-mail a heslo.'); return; }

  btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader ti-spin"></i> Přihlašuji…';
  try {
    await signInWithEmailAndPassword(auth, email, pass);
    // onAuthStateChanged will call enterApp → success path
  } catch(e) {
    showErr(err, friendlyAuthError(e.code));
  } finally {
    // Always re-enable (onAuthStateChanged already calls resetLoginBtn on success too)
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-login"></i> Přihlásit se';
  }
};

window.doLogout = async function() {
  isManager = false;
  phoneUser = null;
  stopFirestoreListener();
  state = { players: [], fines: [], seasons: [] };
  await signOut(auth);
  // showScreen('auth') triggered by onAuthStateChanged
};

window.doForgotPassword = async function() {
  const email = document.getElementById('login-email').value.trim();
  if (!email) { showErr(document.getElementById('login-err'),'Zadej nejprve e-mail výše.'); return; }
  try {
    await sendPasswordResetEmail(auth, email);
    showToast('Odkaz pro reset hesla odeslán ✓');
  } catch(e) {
    showErr(document.getElementById('login-err'), friendlyAuthError(e.code));
  }
};

// ─── PHONE AUTH (self-fine) ───────────────────────────────────────
let confirmationResult = null;

window.sendPhoneOTP = async function() {
  const phone = document.getElementById('phone-input').value.trim();
  const err   = document.getElementById('phone-err');
  err.style.display = 'none';
  if (!phone) { showErr(err,'Zadej telefonní číslo.'); return; }

  try {
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', { size: 'invisible' });
    }
    confirmationResult = await signInWithPhoneNumber(auth, phone, window.recaptchaVerifier);
    document.getElementById('otp-row').style.display = 'flex';
    document.getElementById('send-otp-btn').style.display = 'none';
    showToast('SMS odeslána ✓');
  } catch(e) {
    showErr(err, 'Chyba: ' + (e.message || e.code));
    if (window.recaptchaVerifier) { window.recaptchaVerifier.clear(); window.recaptchaVerifier = null; }
  }
};

window.verifyPhoneOTP = async function() {
  const code = document.getElementById('otp-input').value.trim();
  const err  = document.getElementById('phone-err');
  err.style.display = 'none';
  if (!code) { showErr(err,'Zadej kód z SMS.'); return; }
  try {
    const cred = await confirmationResult.confirm(code);
    // Find which player has this phone
    const phone   = document.getElementById('phone-input').value.trim();
    const member  = WA_MEMBERS.find(m => m.phone === phone);
    phoneUser     = { uid: cred.user.uid, phone, name: member ? member.name : phone };
    // Sign out from Firebase Auth (we handle session ourselves for phone users)
    await signOut(auth);
    // Don't let onAuthStateChanged show auth screen — we're in phone mode
    enterApp(phoneUser.name + ' (hráč)');
  } catch(e) {
    showErr(document.getElementById('phone-err'), 'Nesprávný kód nebo vypršela platnost.');
  }
};

// ─── EMAIL VERIFICATION ───────────────────────────────────────────
window.checkVerification = async function() {
  if (!currentUser) return;
  await currentUser.reload();
  if (currentUser.emailVerified) {
    showToast('E-mail ověřen ✓');
  } else {
    showErr(document.getElementById('verify-msg'),'E-mail ještě není ověřen. Zkontroluj doručenou poštu (i spam).');
  }
};
window.resendVerification = async function() {
  if (!currentUser) return;
  try { await sendEmailVerification(currentUser); showToast('Ověřovací e-mail odeslán ✓'); }
  catch(e) { showErr(document.getElementById('verify-msg'),'Chyba: ' + e.message); }
};

// ─── SEASON PICKER ────────────────────────────────────────────────
function initSeasonPicker() {
  const y = currentYear();
  // default to current half
  const m = new Date().getMonth() + 1;
  activeSeason = { year: y, half: m >= 8 || m === 1 ? 'Podzim' : 'Jaro' };
  renderSeasonPicker();
  updateSeasonLabel();
}

function renderSeasonPicker() {
  const yearSel = document.getElementById('season-year');
  const halfSel = document.getElementById('season-half');
  if (!yearSel || !halfSel) return;

  const y = currentYear();
  yearSel.innerHTML = '';
  for (let yr = y + 1; yr >= y - 3; yr--) {
    const o = document.createElement('option');
    o.value = yr; o.textContent = yr;
    if (yr === activeSeason.year) o.selected = true;
    yearSel.appendChild(o);
  }
  halfSel.value = activeSeason.half;
}

function updateSeasonLabel() {
  const el = document.getElementById('season-label');
  if (el && activeSeason) el.textContent = seasonLabel(activeSeason);
}

window.changeSeason = function() {
  if (!isManager) return;
  const y = parseInt(document.getElementById('season-year').value);
  const h = document.getElementById('season-half').value;
  activeSeason = { year: y, half: h };
  updateSeasonLabel();
  renderLog(); renderSummary();
  showToast(`Zobrazuji: ${seasonLabel(activeSeason)}`);
};

// ─── FIRESTORE ────────────────────────────────────────────────────
function startFirestoreListener() {
  stopFirestoreListener();
  const ref = doc(db, CONFIG.FIRESTORE_DOC);
  unsubFirestore = onSnapshot(ref, snap => {
    if (snap.exists()) {
      state = snap.data();
      state.players = state.players || [];
      state.fines   = state.fines   || [];
      state.seasons = state.seasons || [];
    } else {
      state = { players: [], fines: [], seasons: [] };
    }
    const t = document.querySelector('.tab.active')?.dataset.tab;
    if (t === 'log')     renderLog();
    if (t === 'summary') renderSummary();
    if (t === 'players') renderPlayers();
    populatePlayerSelects();
  });
}
function stopFirestoreListener() {
  if (unsubFirestore) { unsubFirestore(); unsubFirestore = null; }
}
async function saveState() {
  if (!currentUser && !phoneUser) return;
  try { await setDoc(doc(db, CONFIG.FIRESTORE_DOC), state); }
  catch(e) { console.error(e); showToast('⚠ Nepodařilo se uložit data.'); }
}

// ─── IMPORT WA MEMBERS ────────────────────────────────────────────
window.importWAMembers = async function() {
  if (!isManager) return;
  const sk = seasonKey(activeSeason);
  let added = 0;
  // Deduplicate by phone – use phone as unique key
  WA_MEMBERS.forEach((m, i) => {
    // Handle duplicate names (two Milans etc.) by appending index
    let name = m.name;
    const dupName = WA_MEMBERS.slice(0, i).some(x => x.name === m.name);
    if (dupName) name = m.name + ' ' + (i + 1);

    const exists = state.players.find(p => p.phone === m.phone);
    if (!exists) {
      state.players.push({ name, phone: m.phone, email: '', nicknames: [], seasons: [sk] });
      added++;
    } else {
      // Ensure season tag
      if (!exists.seasons) exists.seasons = [];
      if (!exists.seasons.includes(sk)) exists.seasons.push(sk);
    }
  });
  await saveState();
  renderPlayers(); populatePlayerSelects();
  showToast(`Import dokončen: ${added} nových hráčů přidáno`);
  document.getElementById('import-modal').classList.remove('open');
};

// ─── LOCK / PIN ───────────────────────────────────────────────────
window.toggleLock = function() {
  if (isManager) { isManager = false; updateLockUI(); showToast('Manažer odhlášen'); return; }
  document.getElementById('pin-modal').classList.add('open');
  setTimeout(() => document.getElementById('pin-input').focus(), 80);
};
window.closePinModal = function() {
  document.getElementById('pin-modal').classList.remove('open');
  document.getElementById('pin-input').value = '';
  document.getElementById('pin-err').style.display = 'none';
};
window.checkPin = function() {
  if (document.getElementById('pin-input').value === CONFIG.PIN) {
    isManager = true; window.closePinModal(); updateLockUI();
    showToast('Manažer přihlášen ✓');
  } else {
    document.getElementById('pin-err').style.display = 'block';
    document.getElementById('pin-input').select();
  }
};

function updateLockUI() {
  const btn = document.getElementById('lock-btn');
  const lbl = document.getElementById('lock-label');
  const seasonControls = document.getElementById('season-controls');

  if (isManager) {
    lbl.textContent = 'Odhlásit';
    btn.classList.add('active');
    btn.querySelector('.ti').className = 'ti ti-lock-open';
    if (seasonControls) seasonControls.style.display = 'flex';
    document.getElementById('manager-wall').style.display  = 'none';
    document.getElementById('manager-wall2').style.display = 'none';
    document.getElementById('add-form').style.display      = 'block';
    document.getElementById('players-form').style.display  = 'block';
    populatePlayerSelects();
    renderPlayers();
  } else {
    lbl.textContent = 'Manager';
    btn.classList.remove('active');
    btn.querySelector('.ti').className = 'ti ti-lock';
    if (seasonControls) seasonControls.style.display = 'none';
    document.getElementById('manager-wall').style.display  = 'block';
    document.getElementById('manager-wall2').style.display = 'block';
    document.getElementById('add-form').style.display      = 'none';
    document.getElementById('players-form').style.display  = 'none';
  }
}

// ─── TABS ─────────────────────────────────────────────────────────
window.switchTab = function(t) {
  document.querySelectorAll('.tab').forEach(el => el.classList.toggle('active', el.dataset.tab === t));
  document.querySelectorAll('.panel').forEach(el => el.classList.remove('active'));
  document.getElementById('panel-' + t).classList.add('active');
  if (t === 'log')     renderLog();
  if (t === 'summary') renderSummary();
  if (t === 'players') renderPlayers();
};

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

  // Phone-user self-fine: pre-select their name
  if (phoneUser) {
    const fp = document.getElementById('f-player');
    if (fp) fp.value = phoneUser.name;
  }
}

// ─── NICKNAME RESOLUTION ──────────────────────────────────────────
function resolvePlayerName(raw) {
  const norm = raw.toLowerCase().trim();
  let p = state.players.find(p => p.name.toLowerCase() === norm);
  if (p) return p.name;
  p = state.players.find(p => (p.nicknames||[]).some(n => n.toLowerCase() === norm));
  if (p) return p.name;
  p = state.players.find(p =>
    p.name.toLowerCase().includes(norm) || norm.includes(p.name.toLowerCase()) ||
    (p.nicknames||[]).some(n => n.toLowerCase().includes(norm) || norm.includes(n.toLowerCase()))
  );
  return p ? p.name : null;
}

// ─── PARSE HELPERS ────────────────────────────────────────────────
function parseChunk(chunk) {
  const s = chunk.replace(/[–—]/g,'-').trim();
  if (!s) return null;
  const parts = s.split('-').map(x => x.trim()).filter(Boolean);
  if (parts.length < 3) return null;
  const rawName = parts[0];
  const amount  = parseFloat(parts[parts.length-1].replace(/\s/g,''));
  const reason  = parts.slice(1,-1).join(' – ');
  if (!rawName || !reason || isNaN(amount) || amount <= 0) return null;
  return { rawName, reason, amount };
}
function splitTranscript(text) {
  return text.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
}

// ─── QUICK TEXT ───────────────────────────────────────────────────
window.parseQuick = function(val) {
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
};

window.submitQuick = function() {
  const val    = document.getElementById('quick-input').value.trim();
  const parsed = parseChunk(val);
  if (!parsed) { alert('Použij formát: Hráč - Důvod - Částka'); return; }
  const resolved = resolvePlayerName(parsed.rawName) || parsed.rawName;
  ensurePlayer(resolved);
  addFine(resolved, parsed.reason, parsed.amount);
  document.getElementById('quick-input').value = '';
  document.getElementById('parse-preview').innerHTML = `Formát: <strong>Hráč – Důvod – Částka</strong>`;
};

window.submitManual = function() {
  const player = document.getElementById('f-player').value;
  const reason = document.getElementById('f-reason').value.trim();
  const amt    = parseFloat(document.getElementById('f-amount').value);
  if (!player || !reason || isNaN(amt) || amt <= 0) { alert('Vyplň všechna pole.'); return; }
  addFine(player, reason, amt);
  document.getElementById('f-reason').value = '';
  document.getElementById('f-amount').value = '';
};

// Self-fine for phone users
window.submitSelfFine = function() {
  if (!phoneUser) return;
  const reason = document.getElementById('self-reason').value.trim();
  const amt    = parseFloat(document.getElementById('self-amount').value);
  if (!reason || isNaN(amt) || amt <= 0) { alert('Vyplň důvod a částku.'); return; }
  const name = phoneUser.name;
  ensurePlayer(name);
  addFine(name, reason, amt);
  document.getElementById('self-reason').value = '';
  document.getElementById('self-amount').value = '';
};

// ─── VOICE SESSION ────────────────────────────────────────────────
window.toggleVoiceSession = function() { voiceActive ? stopVoiceSession() : startVoiceSession(); };

function startVoiceSession() {
  if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
    alert('Hlasový vstup není podporován. Zkuste Chrome nebo Edge.'); return;
  }
  voiceActive = true; fullTranscript = '';
  const btn = document.getElementById('voice-record-btn');
  btn.classList.add('recording');
  document.getElementById('voice-record-label').textContent = 'Zastavit nahrávání';
  document.getElementById('voice-status').textContent = '🔴 Nahrávám…';
  document.getElementById('voice-live').style.display = 'block';
  document.getElementById('voice-live').textContent   = '';

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SR();
  recognition.lang = 'cs-CZ'; recognition.continuous = true; recognition.interimResults = true;
  recognition.onresult = e => {
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => { if (voiceActive) stopVoiceSession(); }, 3500);
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) fullTranscript += (fullTranscript ? ', ' : '') + t;
      else interim = t;
    }
    document.getElementById('voice-live').textContent = fullTranscript + (interim ? ' ' + interim : '');
  };
  recognition.onerror = err => { if (['no-speech','audio-capture'].includes(err.error)) stopVoiceSession(); };
  recognition.onend   = () => { if (voiceActive) { try { recognition.start(); } catch(e) { stopVoiceSession(); } } };
  recognition.start();
}

function stopVoiceSession() {
  voiceActive = false; clearTimeout(silenceTimer);
  if (recognition) { recognition.onend = null; try { recognition.stop(); } catch(e){} recognition = null; }
  document.getElementById('voice-record-btn').classList.remove('recording');
  document.getElementById('voice-record-label').textContent = 'Spustit nahrávání';
  document.getElementById('voice-status').textContent = '';
  document.getElementById('voice-live').style.display = 'none';
  const t = fullTranscript.trim();
  if (!t) { showToast('Žádný hlasový vstup.'); return; }
  buildReviewQueue(t);
}

// ─── REVIEW QUEUE ─────────────────────────────────────────────────
function buildReviewQueue(transcript) {
  reviewQueue = [];
  splitTranscript(transcript).forEach(chunk => {
    const parsed = parseChunk(chunk);
    if (!parsed) return;
    const resolved = resolvePlayerName(parsed.rawName);
    reviewQueue.push({
      rawName: parsed.rawName,
      resolvedPlayer: resolved || parsed.rawName,
      reason: parsed.reason, amount: parsed.amount,
      isNew: !resolved,
      isAlias: !!(resolved && resolved.toLowerCase() !== parsed.rawName.toLowerCase()),
      skip: false,
    });
  });
  if (reviewQueue.length === 0) { showToast('Nepodařilo se rozpoznat žádné pokuty.'); return; }
  renderReviewQueue();
  document.getElementById('voice-review').style.display = 'block';
  document.getElementById('voice-review').scrollIntoView({ behavior:'smooth' });
}

function renderReviewQueue() {
  const active = reviewQueue.filter(r => !r.skip);
  document.getElementById('confirm-btn').innerHTML =
    `<i class="ti ti-device-floppy"></i> Uložit ${active.length} pokut${active.length===1?'u':active.length<5?'y':''}`;

  document.getElementById('review-list').innerHTML = reviewQueue.map((r,i) => {
    const opts = (state.players||[]).map(p =>
      `<option value="${esc(p.name)}"${p.name===r.resolvedPlayer?' selected':''}>${esc(p.name)}</option>`
    ).join('');
    const newOpt = r.isNew ? `<option value="${esc(r.resolvedPlayer)}" selected>${esc(r.resolvedPlayer)} (nový)</option>` : '';
    return `
    <div class="review-item${r.skip?' skipped':''}">
      <div class="review-item-header">
        <span class="review-item-num">${i+1}</span>
        <span class="review-item-tags">
          ${r.isAlias?`<span class="badge badge-alias">≡ ${esc(r.rawName)}</span>`:''}
          ${r.isNew  ?`<span class="badge badge-new">Nový hráč</span>`:''}
        </span>
        <button class="btn-icon${r.skip?'':' danger'}" onclick="toggleSkip(${i})" title="${r.skip?'Obnovit':'Přeskočit'}">
          <i class="ti ${r.skip?'ti-rotate-clockwise':'ti-trash'}"></i>
        </button>
      </div>
      <div class="review-fields"${r.skip?' style="opacity:.4;pointer-events:none;"':''}>
        <div class="review-field"><label>Hráč</label><select onchange="updateReview(${i},'resolvedPlayer',this.value)">${newOpt}${opts}</select></div>
        <div class="review-field review-field-reason"><label>Důvod</label><input type="text" value="${esc(r.reason)}" oninput="updateReview(${i},'reason',this.value)"/></div>
        <div class="review-field review-field-amt"><label>Částka</label><input type="number" value="${r.amount}" oninput="updateReview(${i},'amount',parseFloat(this.value))"/></div>
      </div>
    </div>`;
  }).join('');
}

window.updateReview = function(i,key,val) {
  reviewQueue[i][key] = val;
  if (key==='resolvedPlayer') { reviewQueue[i].isNew = !state.players.find(p=>p.name===val); reviewQueue[i].isAlias=false; }
  const active = reviewQueue.filter(r=>!r.skip);
  document.getElementById('confirm-btn').innerHTML =
    `<i class="ti ti-device-floppy"></i> Uložit ${active.length} pokut${active.length===1?'u':active.length<5?'y':''}`;
};
window.toggleSkip = function(i) { reviewQueue[i].skip=!reviewQueue[i].skip; renderReviewQueue(); };

window.confirmReview = async function() {
  const toSave = reviewQueue.filter(r=>!r.skip);
  if (!toSave.length) { window.discardReview(); return; }
  toSave.forEach(r => {
    ensurePlayer(r.resolvedPlayer);
    state.fines.unshift({ player:r.resolvedPlayer, reason:r.reason, amount:r.amount, ts:Date.now(), season: seasonKey(activeSeason) });
  });
  await saveState();
  showToast(`✓ Uloženo ${toSave.length} pokut`);
  window.discardReview(); populatePlayerSelects();
};
window.discardReview = function() { reviewQueue=[]; document.getElementById('voice-review').style.display='none'; };

// ─── CORE FINE OPS ────────────────────────────────────────────────
function ensurePlayer(name) {
  if (!state.players.find(p=>p.name.toLowerCase()===name.toLowerCase()))
    state.players.push({ name, email:'', phone:'', nicknames:[], seasons:[] });
}

async function addFine(player, reason, amount) {
  state.fines.unshift({ player, reason, amount, ts:Date.now(), season: seasonKey(activeSeason) });
  await saveState();
  showToast(`Pokuta přidána: ${player} – ${amount} ${CONFIG.CURRENCY}`);
}

// ─── LOG  (FIX: timestamp first, DD/MM/YY HH:mm) ─────────────────
window.renderLog = function() {
  populatePlayerSelects();
  const search  = (document.getElementById('log-search').value||'').toLowerCase();
  const pf      = (document.getElementById('log-player-filter').value||'').toLowerCase();
  const list    = document.getElementById('log-list');
  const empty   = document.getElementById('log-empty');

  const fines = seasonFines().filter(f => {
    if (pf && f.player.toLowerCase()!==pf) return false;
    if (search && !f.player.toLowerCase().includes(search) && !f.reason.toLowerCase().includes(search)) return false;
    return true;
  });

  if (!fines.length) { list.innerHTML=''; empty.style.display='block'; return; }
  empty.style.display = 'none';

  list.innerHTML = fines.map(f => {
    const idx = state.fines.indexOf(f);
    const d   = new Date(f.ts);
    const dd  = String(d.getDate()).padStart(2,'0');
    const mm  = String(d.getMonth()+1).padStart(2,'0');
    const yy  = String(d.getFullYear()).slice(2);
    const hh  = String(d.getHours()).padStart(2,'0');
    const min = String(d.getMinutes()).padStart(2,'0');
    const ds  = `${dd}/${mm}/${yy} ${hh}:${min}`;
    return `
      <div class="fine-row">
        <span class="fine-time">${ds}</span>
        <span class="fine-player">${esc(f.player)}</span>
        <span class="fine-reason">${esc(f.reason)}</span>
        <span class="fine-amt">${f.amount} ${CONFIG.CURRENCY}</span>
        ${isManager ? `
        <div class="fine-actions">
          <button class="btn-icon" onclick="openEdit(${idx})" title="Upravit"><i class="ti ti-edit"></i></button>
          <button class="btn-icon danger" onclick="deleteFine(${idx})" title="Smazat"><i class="ti ti-trash"></i></button>
        </div>` : ''}
      </div>`;
  }).join('');
};

window.deleteFine = async function(idx) {
  if (!confirm('Smazat tuto pokutu?')) return;
  state.fines.splice(idx,1); await saveState(); renderLog();
};

window.openEdit = function(idx) {
  editIndex = idx;
  const f = state.fines[idx];
  populatePlayerSelects();
  document.getElementById('edit-player').value = f.player;
  document.getElementById('edit-reason').value  = f.reason;
  document.getElementById('edit-amount').value  = f.amount;
  document.getElementById('edit-modal').classList.add('open');
};
window.closeEditModal = function() { document.getElementById('edit-modal').classList.remove('open'); };

window.saveEdit = async function() {
  const f = state.fines[editIndex];
  f.player = document.getElementById('edit-player').value;
  f.reason = document.getElementById('edit-reason').value.trim();
  f.amount = parseFloat(document.getElementById('edit-amount').value);
  if (!f.player||!f.reason||isNaN(f.amount)||f.amount<=0) { alert('Zkontroluj všechna pole.'); return; }
  await saveState(); window.closeEditModal(); renderLog();
  showToast('Pokuta upravena ✓');
};

// ─── SUMMARY ──────────────────────────────────────────────────────
window.renderSummary = function() {
  const fines    = seasonFines();
  const totals   = {};
  (state.players||[]).forEach(p => { totals[p.name]={total:0,count:0}; });
  fines.forEach(f => {
    if (!totals[f.player]) totals[f.player]={total:0,count:0};
    totals[f.player].total += f.amount;
    totals[f.player].count += 1;
  });
  const allTotal = fines.reduce((a,f)=>a+f.amount,0);
  document.getElementById('summary-stats').innerHTML = `
    <div class="stat-card"><div class="stat-label">Celkem ve fondu</div><div class="stat-value">${allTotal}<span class="stat-unit"> ${CONFIG.CURRENCY}</span></div></div>
    <div class="stat-card"><div class="stat-label">Počet pokut</div><div class="stat-value">${fines.length}</div></div>
    <div class="stat-card"><div class="stat-label">Hráčů</div><div class="stat-value">${(state.players||[]).length}</div></div>`;

  const sorted = Object.entries(totals).sort((a,b)=>b[1].total-a[1].total);
  const listEl = document.getElementById('summary-list');
  if (!sorted.length) { listEl.innerHTML='<div class="empty-state"><i class="ti ti-chart-bar"></i><p>Zatím žádná data.</p></div>'; return; }
  listEl.innerHTML = sorted.map(([name,d]) => {
    const initials = name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    const pct = allTotal>0?Math.round((d.total/allTotal)*100):0;
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
};

window.generateEmailReport = function() {
  const fines  = seasonFines();
  const totals = {};
  (state.players||[]).forEach(p=>{totals[p.name]={total:0,count:0};});
  fines.forEach(f=>{
    if(!totals[f.player])totals[f.player]={total:0,count:0};
    totals[f.player].total+=f.amount; totals[f.player].count+=1;
  });
  const sorted     = Object.entries(totals).filter(([,d])=>d.total>0).sort((a,b)=>b[1].total-a[1].total);
  const grandTotal = sorted.reduce((a,[,d])=>a+d.total,0);
  const today      = new Date().toLocaleDateString('cs-CZ');
  const sl         = activeSeason ? seasonLabel(activeSeason) : '';
  const lines      = sorted.map(([n,d])=>`  ${n}: ${d.total} ${CONFIG.CURRENCY} (${d.count}×)`).join('\n');
  const report     = `Ahoj tým! 👋\n\nPřehled pokut k ${today} (${sl}):\n\n${lines}\n\nCelkem ve fondu: ${grandTotal} ${CONFIG.CURRENCY} 🎉\n\nDo konce sezóny prosím uhraďte svůj příspěvek – jdeme na párty!`;
  const el = document.getElementById('email-report');
  el.style.display='block';
  el.innerHTML=`<div class="email-report-box"><textarea id="report-text" readonly>${report}</textarea></div>
    <button class="btn btn-secondary" style="margin-top:8px;" onclick="copyReport()"><i class="ti ti-copy"></i> Kopírovat</button>`;
};
window.copyReport = function() {
  navigator.clipboard.writeText(document.getElementById('report-text').value).then(()=>showToast('Zkopírováno ✓'));
};

// ─── PLAYERS ──────────────────────────────────────────────────────
window.addPlayer = async function() {
  const name  = document.getElementById('new-player-name').value.trim();
  const email = document.getElementById('new-player-email').value.trim();
  const nick  = document.getElementById('new-player-nick').value.trim();
  const phone = document.getElementById('new-player-phone').value.trim();
  const err   = document.getElementById('add-player-err');

  if (!name) { showErr(err,'Jméno je povinné.'); return; }
  if (state.players.find(p=>p.name.toLowerCase()===name.toLowerCase())) { showErr(err,'Hráč s tímto jménem již existuje.'); return; }
  if (email && !email.includes('@')) { showErr(err,'Neplatný e-mail.'); return; }

  const nicknames = nick ? nick.split(',').map(s=>s.trim()).filter(Boolean) : [];
  const sk = seasonKey(activeSeason);
  state.players.push({ name, email, phone: phone||'', nicknames, seasons:[sk] });
  await saveState();
  err.style.display='none';
  ['new-player-name','new-player-email','new-player-nick','new-player-phone'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  renderPlayers(); populatePlayerSelects();
  showToast(`Hráč ${name} přidán ✓`);
};

window.renderPlayers = function() {
  const list  = document.getElementById('player-list');
  const empty = document.getElementById('player-list-empty');
  if (!state.players||!state.players.length) { list.innerHTML=''; empty.style.display='block'; return; }
  empty.style.display='none';

  list.innerHTML = state.players.map((p,i)=>{
    const initials  = p.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    const fineCount = (state.fines||[]).filter(f=>f.player===p.name).length;
    const fineTotal = (state.fines||[]).filter(f=>f.player===p.name).reduce((a,f)=>a+f.amount,0);
    const nicks     = p.nicknames||[];
    const nickHtml  = nicks.length
      ? nicks.map(n=>`<span class="badge badge-alias">${esc(n)}</span>`).join(' ')
      : `<span class="no-nick">bez přezdívky</span>`;
    return `
      <div class="player-row">
        <div class="avatar" style="width:34px;height:34px;font-size:12px;flex-shrink:0;">${initials}</div>
        <div style="flex:1;min-width:0;">
          <div class="player-row-name">${esc(p.name)}</div>
          <div class="player-row-meta">
            ${p.phone?`<span class="player-meta-chip"><i class="ti ti-phone"></i> ${esc(p.phone)}</span>`:''}
            ${p.email?`<span class="player-meta-chip"><i class="ti ti-mail"></i> ${esc(p.email)}</span>`:''}
            <span class="badge badge-amber">${fineCount}× · ${fineTotal} ${CONFIG.CURRENCY}</span>
          </div>
          <div class="player-row-nicks" onclick="openNickModal(${i})" title="Přezdívky">
            <i class="ti ti-tag" style="font-size:11px;color:var(--text-muted);"></i>
            ${nickHtml}
            <span class="nick-edit-hint">upravit</span>
          </div>
        </div>
        <div class="player-row-actions">
          <button class="btn-icon" onclick="openNickModal(${i})" title="Přezdívky"><i class="ti ti-tag"></i></button>
          <button class="btn-icon danger" onclick="removePlayer(${i})" title="Odebrat"><i class="ti ti-trash"></i></button>
        </div>
      </div>`;
  }).join('');
};

window.removePlayer = async function(i) {
  const p = state.players[i];
  if (!confirm(`Odebrat ${p.name}? Jejich pokuty zůstanou v logu.`)) return;
  state.players.splice(i,1);
  await saveState(); renderPlayers(); populatePlayerSelects();
  showToast(`${p.name} odebrán/a`);
};

// ─── NICKNAME MODAL ───────────────────────────────────────────────
window.openNickModal = function(i) {
  nickPlayerIdx=i;
  const p=state.players[i];
  document.getElementById('nick-modal-title').textContent=`Přezdívky – ${p.name}`;
  document.getElementById('nick-input').value='';
  document.getElementById('nick-err').style.display='none';
  renderNickChips();
  document.getElementById('nick-modal').classList.add('open');
  setTimeout(()=>document.getElementById('nick-input').focus(),80);
};
window.closeNickModal = function() { document.getElementById('nick-modal').classList.remove('open'); nickPlayerIdx=-1; };

function renderNickChips() {
  const p     = state.players[nickPlayerIdx];
  const nicks = p?(p.nicknames||[]):[];
  const chips = document.getElementById('nick-chips');
  chips.innerHTML = nicks.length
    ? nicks.map((n,j)=>`<span class="nick-chip">${esc(n)}<button onclick="removeNick(${j})" title="Odebrat"><i class="ti ti-x"></i></button></span>`).join('')
    : `<span style="color:var(--text-muted);font-size:13px;">Žádné přezdívky.</span>`;
}

window.addNick = async function() {
  const val = document.getElementById('nick-input').value.trim();
  const err = document.getElementById('nick-err');
  if (!val) { showErr(err,'Zadej přezdívku.'); return; }
  const p = state.players[nickPlayerIdx];
  p.nicknames = p.nicknames||[];
  const conflict = state.players.find((pl,i)=>i!==nickPlayerIdx&&(pl.name.toLowerCase()===val.toLowerCase()||(pl.nicknames||[]).some(n=>n.toLowerCase()===val.toLowerCase())));
  if (conflict) { showErr(err,`Tato přezdívka patří hráči ${conflict.name}.`); return; }
  if (p.nicknames.some(n=>n.toLowerCase()===val.toLowerCase())) { showErr(err,'Přezdívka již existuje.'); return; }
  p.nicknames.push(val);
  await saveState(); err.style.display='none';
  document.getElementById('nick-input').value='';
  renderNickChips(); renderPlayers();
  showToast(`Přezdívka „${val}" přidána ✓`);
};
window.removeNick = async function(j) {
  state.players[nickPlayerIdx].nicknames.splice(j,1);
  await saveState(); renderNickChips(); renderPlayers();
};

// ─── IMPORT MODAL ─────────────────────────────────────────────────
window.openImportModal  = function() { document.getElementById('import-modal').classList.add('open'); };
window.closeImportModal = function() { document.getElementById('import-modal').classList.remove('open'); };

// ─── UTILS ────────────────────────────────────────────────────────
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
let toastTimer=null;
function showToast(msg) {
  const el=document.getElementById('toast');
  el.textContent=msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('show'),2800);
}
function showErr(el,msg) { el.textContent=msg; el.style.display='block'; }
function friendlyAuthError(code) {
  const map={
    'auth/email-already-in-use':'Tento e-mail je již zaregistrován.',
    'auth/invalid-email':'Neplatný e-mail.',
    'auth/weak-password':'Heslo je příliš slabé (min. 6 znaků).',
    'auth/user-not-found':'Účet s tímto e-mailem neexistuje.',
    'auth/wrong-password':'Nesprávné heslo.',
    'auth/invalid-credential':'Nesprávný e-mail nebo heslo.',
    'auth/too-many-requests':'Příliš mnoho pokusů. Zkus to za chvíli.',
    'auth/network-request-failed':'Chyba sítě. Zkontroluj připojení.',
  };
  return map[code]||`Chyba: ${code}`;
}

// Modal backdrop close
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.modal-backdrop').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target!==el) return;
      if (el.id==='pin-modal')    window.closePinModal();
      if (el.id==='edit-modal')   window.closeEditModal();
      if (el.id==='nick-modal')   window.closeNickModal();
      if (el.id==='import-modal') window.closeImportModal();
    });
  });
});
