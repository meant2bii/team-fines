/**
 * Team Fines – app.js v5
 * Fixes: #1 bulk-delete checkboxes, #2 edit player + stats modal,
 *        #3 CSV file upload import, #4 logout btn contrast,
 *        #5 brand colors + logo (CSS), #6 reCAPTCHA mobile fix
 */

import { auth, db } from './firebase.js';
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendEmailVerification, sendPasswordResetEmail,
  onAuthStateChanged, signOut,
  RecaptchaVerifier, signInWithPhoneNumber,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { doc, setDoc, onSnapshot }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ─── CONFIG ───────────────────────────────────────────────────────
const CONFIG = { PIN:'1234', CURRENCY:'CZK', FIRESTORE_DOC:'teamdata/main' };

// ─── WA MEMBERS ───────────────────────────────────────────────────
const WA_MEMBERS = [
  {name:'Adrian',phone:'+420770679955'},{name:'Cédric',phone:'+32486559110'},
  {name:'Erik Klemš',phone:'+420608325078'},{name:'Honzicek Laska',phone:'+420737073672'},
  {name:'Jan Fojtíček',phone:'+420608241316'},{name:'Jan Tichy',phone:'+420735023771'},
  {name:'Jiří Horčička',phone:'+420737282974'},{name:'Kuba Hoppan',phone:'+420604189424'},
  {name:'Lukas Teichmann',phone:'+420734169237'},{name:'Michael Botur',phone:'+420730973794'},
  {name:'Milan Kuba',phone:'+420737628229'},{name:'Radek Sahula',phone:'+420773646367'},
  {name:'Tomáš Vízner',phone:'+420732219689'},{name:'Venca Forejtar',phone:'+420776715064'},
  {name:'Adam',phone:'+420736640967'},{name:'Adam Hubálek',phone:'+420604605226'},
  {name:'Dan Urban',phone:'+420602945056'},{name:'DanielSurgent',phone:'+420776701464'},
  {name:'DanR',phone:'+420723943393'},{name:'David',phone:'+420777627209'},
  {name:'Egor',phone:'+420608458135'},{name:'Emil',phone:'+420606059544'},
  {name:'Ephraime Superstain',phone:'+420731114434'},{name:'Hugo',phone:'+420606223189'},
  {name:'Igor Banga',phone:'+420723880377'},{name:'Jachym Nahlovsky',phone:'+420773907207'},
  {name:'Jakub',phone:'+420730510280'},{name:'Jan Hlaváč',phone:'+420777052697'},
  {name:'Jindřich Ludmila',phone:'+420602274598'},{name:'Josef Tureček',phone:'+420732246134'},
  {name:'Karel Roskowetz',phone:'+420731626257'},{name:'kovanej',phone:'+420773481996'},
  {name:'Kuba',phone:'+420724324104'},{name:'Lukáš Záhrobský',phone:'+420732946704'},
  {name:'lumy',phone:'+420773677997'},{name:'Marek Tomaštík',phone:'+420731977214'},
  {name:'Martin Kuzmiak',phone:'+420608218103'},{name:'Marty',phone:'+420736137188'},
  {name:'Matěj Svoboda',phone:'+420774091681'},{name:'Michal Nevřala',phone:'+420605086775'},
  {name:'Milan (Kuba)',phone:'+420604414776'},{name:'Milan (Bezák)',phone:'+420723755981'},
  {name:'Mykhaylo Shymonya',phone:'+420775404893'},{name:'Petr',phone:'+420725887748'},
  {name:'RA',phone:'+420773833388'},{name:'Rishabh Kumar',phone:'+420608726573'},
  {name:'Roman Sahula',phone:'+420792274339'},{name:'Sami',phone:'+420775017793'},
  {name:'Shanan Toyalla',phone:'+421910162810'},{name:'Šimon Havelka',phone:'+420603840402'},
  {name:'Škubánek',phone:'+420777932063'},{name:'Štěpán Ondříšek Svoboda',phone:'+420778077003'},
  {name:'Viktor',phone:'+420702095259'},{name:'Vojta',phone:'+420739002841'},
  {name:'Vojtas.09',phone:'+420776527900'},{name:'Vojtíkk',phone:'+420774275503'},
];

// ─── STATE ────────────────────────────────────────────────────────
let isManager=false, editIndex=-1, nickPlayerIdx=-1, editPlayerIdx=-1;
let currentUser=null, phoneUser=null, unsubFirestore=null, activeSeason=null;
let recognition=null, voiceActive=false, silenceTimer=null, fullTranscript='';
let reviewQueue=[];
let selectedFineIndices=new Set(); // FIX #1
let pendingCSVMembers=[];          // FIX #3
let state={players:[],fines:[]};

// Role definitions
const ROLES=[
  {id:'A-tým',     label:'A-tým',              cls:'badge-role-a'},
  {id:'B-tým',     label:'B-tým',              cls:'badge-role-b'},
  {id:'Kapitán',   label:'Kapitán',            cls:'badge-role-captain'},
  {id:'Asistent kapitána',label:'Asist. kap.', cls:'badge-role-asst'},
  {id:'Trenér',    label:'Trenér',              cls:'badge-role-coach'},
];
function roleClass(id){ return (ROLES.find(r=>r.id===id)||{cls:'badge-season'}).cls; }

// ─── SEASON HELPERS ───────────────────────────────────────────────
function seasonKey(s){ return `${s.year}-${s.half}`; }
function seasonLabel(s){ return `${s.half} ${s.year}`; }
function currentYear(){ return new Date().getFullYear(); }
function seasonFines(){
  if(!activeSeason) return state.fines||[];
  const {year,half}=activeSeason;
  return (state.fines||[]).filter(f=>{
    const d=new Date(f.ts),y=d.getFullYear(),m=d.getMonth()+1;
    if(half==='Podzim') return (y===year&&m>=8)||(y===year+1&&m<=1);
    return y===year&&m>=2&&m<=7;
  });
}

// ─── AUTH ─────────────────────────────────────────────────────────
onAuthStateChanged(auth,user=>{
  currentUser=user; resetAuthButtons();
  if(!user){ if(!phoneUser) showScreen('auth'); stopFirestoreListener(); return; }
  if(!user.emailVerified){
    showScreen('verify');
    const s=document.getElementById('verify-sub');
    if(s) s.textContent=`Na ${user.email} jsme odeslali ověřovací odkaz. Klikni na něj a vrať se sem.`;
    stopFirestoreListener(); return;
  }
  enterApp(user.displayName||user.email);
});

function resetAuthButtons(){
  const lb=document.getElementById('login-btn');
  if(lb){lb.disabled=false;lb.innerHTML='<i class="ti ti-login"></i> Přihlásit se';}
  const rb=document.getElementById('reg-btn');
  if(rb){rb.disabled=false;rb.innerHTML='<i class="ti ti-user-plus"></i> Vytvořit účet';}
}
function enterApp(name){
  showScreen('app');
  const hu=document.getElementById('header-user'); if(hu) hu.textContent=name||'';
  initSeasonPicker(); startFirestoreListener();
}
function showScreen(n){
  document.getElementById('auth-screen').style.display  =n==='auth'  ?'flex':'none';
  document.getElementById('verify-screen').style.display=n==='verify'?'flex':'none';
  document.getElementById('app-screen').style.display   =n==='app'   ?'block':'none';
}

window.showAuthTab=function(t){
  document.querySelectorAll('.auth-tab').forEach(el=>el.classList.toggle('active',el.dataset.tab===t));
  ['login','register','phone'].forEach(id=>{
    const el=document.getElementById('auth-'+id); if(el) el.classList.toggle('active',id===t);
  });
};

window.doRegister=async function(){
  const name=document.getElementById('reg-name').value.trim();
  const email=document.getElementById('reg-email').value.trim();
  const pass=document.getElementById('reg-password').value;
  const pass2=document.getElementById('reg-password2').value;
  const err=document.getElementById('reg-err'),btn=document.getElementById('reg-btn');
  err.style.display='none';
  if(!name){showErr(err,'Zadej jméno.');return;}
  if(!email){showErr(err,'Zadej e-mail.');return;}
  if(pass.length<6){showErr(err,'Heslo musí mít alespoň 6 znaků.');return;}
  if(pass!==pass2){showErr(err,'Hesla se neshodují.');return;}
  btn.disabled=true; btn.innerHTML='<i class="ti ti-loader-2 spin"></i> Vytváříme…';
  try{
    const {updateProfile}=await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
    const cred=await createUserWithEmailAndPassword(auth,email,pass);
    await updateProfile(cred.user,{displayName:name});
    await sendEmailVerification(cred.user);
  }catch(e){showErr(err,friendlyAuthError(e.code));resetAuthButtons();}
};

window.doLogin=async function(){
  const email=document.getElementById('login-email').value.trim();
  const pass=document.getElementById('login-password').value;
  const err=document.getElementById('login-err'),btn=document.getElementById('login-btn');
  err.style.display='none';
  if(!email||!pass){showErr(err,'Vyplň e-mail a heslo.');return;}
  btn.disabled=true; btn.innerHTML='<i class="ti ti-loader-2 spin"></i> Přihlašuji…';
  try{ await signInWithEmailAndPassword(auth,email,pass); }
  catch(e){showErr(err,friendlyAuthError(e.code));resetAuthButtons();}
};

window.doLogout=async function(){
  isManager=false; phoneUser=null;
  stopFirestoreListener(); state={players:[],fines:[]};
  updateLockUI(); await signOut(auth);
};
window.doForgotPassword=async function(){
  const email=document.getElementById('login-email').value.trim();
  if(!email){showErr(document.getElementById('login-err'),'Zadej nejprve e-mail výše.');return;}
  try{await sendPasswordResetEmail(auth,email);showToast('Odkaz pro reset hesla odeslán ✓');}
  catch(e){showErr(document.getElementById('login-err'),friendlyAuthError(e.code));}
};

// ─── PHONE AUTH (FIX #6: recreate verifier each time, handle mobile) ─
let confirmationResult=null;

window.sendPhoneOTP=async function(){
  const phone=document.getElementById('phone-input').value.trim();
  const err=document.getElementById('phone-err');
  err.style.display='none';
  if(!phone){showErr(err,'Zadej telefonní číslo.');return;}

  const btn=document.getElementById('send-otp-btn');
  btn.disabled=true; btn.innerHTML='<i class="ti ti-loader-2 spin"></i> Odesílám…';

  try{
    // FIX #6: always clear old verifier, create fresh one
    if(window._rcv){try{window._rcv.clear();}catch(e){} window._rcv=null;}
    // Use a visible (non-invisible) size on mobile to avoid reCAPTCHA issues
    const container=document.getElementById('recaptcha-container');
    container.innerHTML=''; // reset DOM node
    container.style.display='block';
    window._rcv=new RecaptchaVerifier(auth,'recaptcha-container',{
      size:'normal',
      callback:()=>{},
      'expired-callback':()=>{
        showErr(err,'reCAPTCHA vypršela, zkus znovu.');
        btn.disabled=false; btn.innerHTML='<i class="ti ti-message"></i> Poslat SMS kód';
      }
    });
    await window._rcv.render();
    confirmationResult=await signInWithPhoneNumber(auth,phone,window._rcv);
    container.style.display='none';
    document.getElementById('otp-row').style.display='block';
    document.getElementById('send-otp-btn').style.display='none';
    document.getElementById('verify-otp-btn').style.display='block';
    showToast('SMS odeslána ✓');
  }catch(e){
    showErr(err,'Chyba: '+(e.message||e.code));
    btn.disabled=false; btn.innerHTML='<i class="ti ti-message"></i> Poslat SMS kód';
    if(window._rcv){try{window._rcv.clear();}catch(ex){} window._rcv=null;}
    document.getElementById('recaptcha-container').style.display='none';
  }
};

window.verifyPhoneOTP=async function(){
  const code=document.getElementById('otp-input').value.trim();
  const err=document.getElementById('phone-err'); err.style.display='none';
  if(!code){showErr(err,'Zadej kód z SMS.');return;}
  try{
    const cred=await confirmationResult.confirm(code);
    const phone=document.getElementById('phone-input').value.trim();
    const member=WA_MEMBERS.find(m=>m.phone===phone);
    phoneUser={uid:cred.user.uid,phone,name:member?member.name:phone};
    await signOut(auth);
    enterApp(phoneUser.name+' (hráč)');
    updatePhoneUserUI();
  }catch(e){showErr(err,'Nesprávný kód nebo vypršela platnost.');}
};

function updatePhoneUserUI(){
  if(!phoneUser) return;
  const sf=document.getElementById('self-fine-form');
  const mw=document.getElementById('manager-wall');
  if(sf) sf.style.display='block';
  if(mw) mw.style.display='none';
  const lbl=document.getElementById('self-fine-name-label');
  if(lbl) lbl.textContent='Přihlášen jako: '+phoneUser.name;
}

window.checkVerification=async function(){
  if(!currentUser) return;
  await currentUser.reload();
  if(currentUser.emailVerified) showToast('E-mail ověřen ✓');
  else showErr(document.getElementById('verify-msg'),'E-mail ještě není ověřen. Zkontroluj doručenou poštu (i spam).');
};
window.resendVerification=async function(){
  if(!currentUser) return;
  try{await sendEmailVerification(currentUser);showToast('Ověřovací e-mail odeslán ✓');}
  catch(e){showErr(document.getElementById('verify-msg'),'Chyba: '+e.message);}
};

// ─── SEASON PICKER ────────────────────────────────────────────────
function initSeasonPicker(){
  const m=new Date().getMonth()+1,y=currentYear();
  activeSeason={year:y,half:(m>=8||m===1)?'Podzim':'Jaro'};
  const ys=document.getElementById('season-year'),hs=document.getElementById('season-half');
  if(!ys||!hs) return;
  ys.innerHTML='';
  for(let yr=y+1;yr>=y-4;yr--){
    const o=document.createElement('option');
    o.value=yr; o.textContent=yr; if(yr===activeSeason.year) o.selected=true;
    ys.appendChild(o);
  }
  hs.value=activeSeason.half; updateSeasonLabel();
}
function updateSeasonLabel(){
  const el=document.getElementById('season-label'); if(el&&activeSeason) el.textContent=seasonLabel(activeSeason);
}
window.changeSeason=function(){
  if(!isManager) return;
  activeSeason={year:parseInt(document.getElementById('season-year').value),half:document.getElementById('season-half').value};
  updateSeasonLabel(); renderLog(); renderSummary();
  showToast('Zobrazuji: '+seasonLabel(activeSeason));
};

// ─── FIRESTORE ────────────────────────────────────────────────────
function startFirestoreListener(){
  stopFirestoreListener();
  unsubFirestore=onSnapshot(doc(db,CONFIG.FIRESTORE_DOC),snap=>{
    if(snap.exists()){state=snap.data();state.players=state.players||[];state.fines=state.fines||[];}
    else state={players:[],fines:[]};
    const t=document.querySelector('.tab.active')?.dataset.tab;
    if(t==='add'){ renderRecentPlayers(); renderReasonTiles(); }
    if(t==='log') renderLog();
    if(t==='summary') renderSummary();
    if(t==='players') renderPlayers();
    populatePlayerSelects();
  });
}
function stopFirestoreListener(){ if(unsubFirestore){unsubFirestore();unsubFirestore=null;} }
async function saveState(){
  if(!currentUser&&!phoneUser) return;
  try{await setDoc(doc(db,CONFIG.FIRESTORE_DOC),state);}
  catch(e){console.error(e);showToast('⚠ Nepodařilo se uložit data.');}
}

// ─── CSV IMPORT (FIX #3) ──────────────────────────────────────────
window.handleCSVUpload=function(e){
  const file=e.target.files[0]; if(!file) return;
  document.getElementById('csv-filename').textContent=file.name;
  const reader=new FileReader();
  reader.onload=ev=>{
    const lines=ev.target.result.split('\n');
    // parse header from first line
    const header=lines[0].split(',').map(h=>h.trim().replace(/^\uFEFF/,''));
    const nameIdx=header.findIndex(h=>h.toLowerCase().includes('name'));
    const phoneIdx=header.findIndex(h=>h.toLowerCase().includes('phone'));
    if(nameIdx<0||phoneIdx<0){showToast('⚠ CSV nemá sloupce Name a Phone.');return;}
    pendingCSVMembers=[];
    for(let i=1;i<lines.length;i++){
      const cols=lines[i].split(',');
      if(cols.length<2) continue;
      const name=(cols[nameIdx]||'').trim();
      // phone col might have spaces
      const phone=(cols[phoneIdx]||'').trim().replace(/\s+/g,'');
      if(name&&phone) pendingCSVMembers.push({name,phone});
    }
    // dedupe names
    const seen={}; pendingCSVMembers=pendingCSVMembers.map(m=>{
      if(seen[m.name]){seen[m.name]++;return{...m,name:m.name+' ('+seen[m.name]+')'};}
      seen[m.name]=1; return m;
    });
    const sk=seasonKey(activeSeason);
    const newCount=pendingCSVMembers.filter(m=>!state.players.find(p=>p.phone===m.phone)).length;
    const pv=document.getElementById('csv-preview');
    const pt=document.getElementById('csv-preview-text');
    pt.textContent=`Nalezeno ${pendingCSVMembers.length} hráčů v souboru. ${newCount} nových pro sezónu ${seasonLabel(activeSeason)}.`;
    pv.style.display='block';
  };
  reader.readAsText(file,'utf-8');
};

window.cancelCSVImport=function(){
  pendingCSVMembers=[];
  document.getElementById('csv-preview').style.display='none';
  document.getElementById('csv-filename').textContent='Soubor nevybrán';
  document.getElementById('csv-upload').value='';
};

window.confirmCSVImport=async function(){
  if(!isManager||!pendingCSVMembers.length) return;
  const sk=seasonKey(activeSeason); let added=0;
  pendingCSVMembers.forEach(m=>{
    const exists=state.players.find(p=>p.phone===m.phone);
    if(!exists){state.players.push({name:m.name,phone:m.phone,email:'',nicknames:[],seasons:[sk],roles:{}});added++;}
    else{if(!exists.seasons)exists.seasons=[];if(!exists.seasons.includes(sk))exists.seasons.push(sk);}
  });
  await saveState(); renderPlayers(); populatePlayerSelects();
  showToast(`Import dokončen: ${added} nových hráčů`);
  window.cancelCSVImport();
};

// ─── LOCK / PIN ───────────────────────────────────────────────────
window.toggleLock=function(){
  if(isManager){isManager=false;updateLockUI();showToast('Manažer odhlášen');return;}
  document.getElementById('pin-modal').classList.add('open');
  setTimeout(()=>document.getElementById('pin-input').focus(),80);
};
window.closePinModal=function(){
  document.getElementById('pin-modal').classList.remove('open');
  document.getElementById('pin-input').value='';
  document.getElementById('pin-err').style.display='none';
};
window.checkPin=function(){
  if(document.getElementById('pin-input').value===CONFIG.PIN){
    isManager=true;window.closePinModal();updateLockUI();showToast('Manažer přihlášen ✓');
  }else{
    document.getElementById('pin-err').style.display='block';
    document.getElementById('pin-input').select();
  }
};

function updateLockUI(){
  const btn=document.getElementById('lock-btn'),lbl=document.getElementById('lock-label');
  const sc=document.getElementById('season-controls');
  const mw=document.getElementById('manager-wall'),mw2=document.getElementById('manager-wall2');
  const af=document.getElementById('add-form'),pf=document.getElementById('players-form');
  if(isManager){
    if(lbl) lbl.textContent='Odhlásit';
    if(btn){btn.classList.add('active');btn.querySelector('.ti').className='ti ti-lock-open';}
    if(sc) sc.style.display='flex';
    if(mw) mw.style.display='none'; if(mw2) mw2.style.display='none';
    if(af) af.style.display='block'; if(pf) pf.style.display='block';
    populatePlayerSelects(); renderPlayers(); renderReasonTiles();
  }else{
    if(lbl) lbl.textContent='Manager';
    if(btn){btn.classList.remove('active');btn.querySelector('.ti').className='ti ti-lock';}
    if(sc) sc.style.display='none';
    if(mw) mw.style.display='block'; if(mw2) mw2.style.display='block';
    if(af) af.style.display='none'; if(pf) pf.style.display='none';
  }
  if(phoneUser){if(mw)mw.style.display='none'; updatePhoneUserUI();}
}

// ─── TABS ─────────────────────────────────────────────────────────
window.switchTab=function(t){
  document.querySelectorAll('.tab').forEach(el=>el.classList.toggle('active',el.dataset.tab===t));
  document.querySelectorAll('.panel').forEach(el=>el.classList.remove('active'));
  document.getElementById('panel-'+t).classList.add('active');
  if(t==='add'){ renderRecentPlayers(); renderReasonTiles(); }
  if(t==='log'){selectedFineIndices.clear();renderLog();}
  if(t==='summary') renderSummary();
  if(t==='players') renderPlayers();
};

// ─── PLAYER SELECTS ───────────────────────────────────────────────
function populatePlayerSelects(){
  // log filter and edit-player are real selects; f-player is now hidden
  ['log-player-filter','edit-player'].forEach(id=>{
    const el=document.getElementById(id); if(!el) return;
    const prev=el.value;
    el.innerHTML=id==='log-player-filter'?'<option value="">Všichni hráči</option>':'<option value="">— vyber hráče —</option>';
    (state.players||[]).forEach(p=>{const o=document.createElement('option');o.value=p.name;o.textContent=p.name;el.appendChild(o);});
    if(prev) el.value=prev;
  });
  if(phoneUser){
    const fp=document.getElementById('f-player'); if(fp) fp.value=phoneUser.name;
    const ft=document.getElementById('f-player-text'); if(ft) ft.value=phoneUser.name;
  }
}

// ─── NICKNAME RESOLUTION ──────────────────────────────────────────
function resolvePlayerName(raw){
  const norm=raw.toLowerCase().trim();
  let p=state.players.find(p=>p.name.toLowerCase()===norm); if(p) return p.name;
  p=state.players.find(p=>(p.nicknames||[]).some(n=>n.toLowerCase()===norm)); if(p) return p.name;
  p=state.players.find(p=>p.name.toLowerCase().includes(norm)||norm.includes(p.name.toLowerCase())||(p.nicknames||[]).some(n=>n.toLowerCase().includes(norm)||norm.includes(n.toLowerCase())));
  return p?p.name:null;
}

// ─── DEFAULT REASONS ──────────────────────────────────────────────
const DEFAULT_REASONS = ['Píčovina','Červená karta','Pozdní příchod','Bago','Housle','Překopnutá branka'];
function getReasons(){ return state.reasons && state.reasons.length ? state.reasons : [...DEFAULT_REASONS]; }
async function saveReasons(list){ state.reasons=list; await saveState(); }

// ─── PARSE (FIX #2: flexible format – dashes optional) ────────────
// Supports: "Michal - Bago - 30"  AND  "Michal Bago 30"  AND  "Michal Bago 30 Kč"
function parseChunk(chunk){
  const s=chunk.replace(/[–—]/g,'-').replace(/\s*kč\s*$/i,'').trim();
  if(!s) return null;

  // Try dash-separated first  (Name - Reason - Amount)
  if(s.includes('-')){
    const parts=s.split('-').map(x=>x.trim()).filter(Boolean);
    if(parts.length>=3){
      const rawName=parts[0],amount=parseFloat(parts[parts.length-1].replace(/\s/g,''));
      const reason=parts.slice(1,-1).join(' – ');
      if(rawName&&reason&&!isNaN(amount)&&amount>0) return{rawName,reason,amount};
    }
  }

  // Fallback: last token is number = amount, first word(s) = name, middle = reason
  // Heuristic: try splitting off the trailing number, then match name prefix against known players
  const tokens=s.split(/\s+/);
  if(tokens.length<3) return null;
  const lastToken=tokens[tokens.length-1];
  const amount=parseFloat(lastToken.replace(/[^\d.]/g,''));
  if(isNaN(amount)||amount<=0) return null;
  const withoutAmt=tokens.slice(0,-1).join(' ').trim();

  // Try to match longest known player name prefix
  const players=state.players||[];
  let bestMatch=null,bestLen=0;
  for(const p of players){
    const nm=p.name.toLowerCase();
    if(withoutAmt.toLowerCase().startsWith(nm)&&nm.length>bestLen){bestMatch=p.name;bestLen=nm.length;}
    for(const nick of(p.nicknames||[])){
      const nk=nick.toLowerCase();
      if(withoutAmt.toLowerCase().startsWith(nk)&&nk.length>bestLen){bestMatch=p.name;bestLen=nk.length;}
    }
  }
  if(bestMatch&&bestLen<withoutAmt.length){
    const reason=withoutAmt.slice(bestLen).trim();
    if(reason) return{rawName:bestMatch,reason,amount};
  }
  // Fallback: first word = name, rest = reason
  if(tokens.length>=3){
    const rawName=tokens[0],reason=tokens.slice(1,-1).join(' ');
    if(rawName&&reason) return{rawName,reason,amount};
  }
  return null;
}
function splitTranscript(t){ return t.split(/[,;\n]+/).map(s=>s.trim()).filter(Boolean); }

// ─── QUICK TEXT ───────────────────────────────────────────────────
window.parseQuick=function(val){
  const p=document.getElementById('parse-preview'),parsed=parseChunk(val);
  if(parsed){
    const resolved=resolvePlayerName(parsed.rawName),label=resolved||parsed.rawName;
    p.innerHTML=`<strong>${esc(label)}</strong>`
      +(resolved&&resolved.toLowerCase()!==parsed.rawName.toLowerCase()?` <span class="badge badge-alias">≡ ${esc(parsed.rawName)}</span>`:'')
      +(!resolved?` <span class="badge badge-new">Nový hráč</span>`:'')
      +` &nbsp;·&nbsp; ${esc(parsed.reason)} &nbsp;·&nbsp; <strong>${parsed.amount} ${CONFIG.CURRENCY}</strong>`;
  }else{p.innerHTML=`Formát: <strong>Hráč Důvod Částka</strong> nebo <strong>Hráč – Důvod – Částka</strong>`;}
};
window.submitQuick=function(){
  const val=document.getElementById('quick-input').value.trim();
  const parsed=parseChunk(val); if(!parsed){alert('Zadej: Jméno Důvod Částka');return;}
  const resolved=resolvePlayerName(parsed.rawName)||parsed.rawName;
  ensurePlayer(resolved); addFine(resolved,parsed.reason,parsed.amount);
  document.getElementById('quick-input').value='';
  document.getElementById('parse-preview').innerHTML=`Formát: <strong>Hráč Důvod Částka</strong> nebo <strong>Hráč – Důvod – Částka</strong>`;
};

// ─── PLAYER AUTOCOMPLETE (FIX #3) ─────────────────────────────────
let acIndex=-1,acFiltered=[];
window.playerAutocomplete=function(val){
  const hidden=document.getElementById('f-player');
  hidden.value=''; // reset until confirmed
  const list=document.getElementById('player-ac-list');
  if(!val.trim()){list.style.display='none';acFiltered=[];return;}
  const norm=val.toLowerCase();
  acFiltered=(state.players||[]).filter(p=>
    p.name.toLowerCase().includes(norm)||
    (p.nicknames||[]).some(n=>n.toLowerCase().includes(norm))
  );
  if(!acFiltered.length){list.style.display='none';return;}
  acIndex=-1;
  list.innerHTML=acFiltered.map((p,i)=>{
    const nicks=(p.nicknames||[]).filter(n=>n.toLowerCase().includes(norm));
    return`<div class="ac-item" onmousedown="selectPlayer('${esc(p.name)}')" data-i="${i}">
      ${esc(p.name)}${nicks.length?` <span class="ac-sub">(${esc(nicks[0])})</span>`:''}
    </div>`;
  }).join('');
  list.style.display='block';
};
window.playerAutocompleteKey=function(e){
  const list=document.getElementById('player-ac-list');
  const items=list.querySelectorAll('.ac-item');
  if(e.key==='ArrowDown'){acIndex=Math.min(acIndex+1,items.length-1);items.forEach((el,i)=>el.classList.toggle('active',i===acIndex));e.preventDefault();}
  else if(e.key==='ArrowUp'){acIndex=Math.max(acIndex-1,0);items.forEach((el,i)=>el.classList.toggle('active',i===acIndex));e.preventDefault();}
  else if(e.key==='Enter'&&acIndex>=0&&acFiltered[acIndex]){selectPlayer(acFiltered[acIndex].name);e.preventDefault();}
  else if(e.key==='Escape'){list.style.display='none';}
};
window.selectPlayer=function(name){
  document.getElementById('f-player-text').value=name;
  document.getElementById('f-player').value=name;
  document.getElementById('player-ac-list').style.display='none';
  renderRecentPlayers();
};

// Recent players tiles
function renderRecentPlayers(){
  const row=document.getElementById('recent-players-row'); if(!row) return;
  const selected=document.getElementById('f-player')?.value||'';
  // Last 5 unique players from fines
  const recent=[...new Map((seasonFines()||[]).map(f=>[f.player,f])).values()].slice(0,5).map(f=>f.player);
  if(!recent.length){row.innerHTML='';return;}
  row.innerHTML=recent.map(name=>`
    <div class="tile${name===selected?' selected':''}" onclick="selectPlayer('${esc(name)}')">${esc(name)}</div>
  `).join('');
}

// ─── REASONS TILES (FIX #3) ───────────────────────────────────────
function renderReasonTiles(){
  const row=document.getElementById('reason-tiles-row'); if(!row) return;
  const selected=document.getElementById('f-reason')?.value||'';
  const reasons=getReasons();
  const managerRow=document.getElementById('reason-manage-row');
  if(managerRow) managerRow.style.display=isManager?'block':'none';
  row.innerHTML=reasons.map((r,i)=>`
    <div class="tile tile-reason${r===selected?' selected':''}" onclick="selectReason('${esc(r)}')">${esc(r)}${isManager?`<span class="tile-del" onclick="event.stopPropagation();deleteReason(${i})" title="Smazat">✕</span>`:''}</div>
  `).join('');
}
window.selectReason=function(r){
  const inp=document.getElementById('f-reason'); if(inp){inp.value=r;}
  renderReasonTiles();
};
window.addReason=async function(){
  const inp=document.getElementById('new-reason-input'); if(!inp) return;
  const val=inp.value.trim(); if(!val) return;
  const reasons=getReasons();
  if(reasons.includes(val)){showToast('Důvod již existuje.');return;}
  reasons.push(val); await saveReasons(reasons); inp.value=''; renderReasonTiles();
  showToast(`Důvod „${val}" přidán ✓`);
};
window.deleteReason=async function(i){
  const reasons=getReasons(); reasons.splice(i,1); await saveReasons(reasons); renderReasonTiles();
};

window.submitManual=function(){
  const player=document.getElementById('f-player').value;
  const reason=document.getElementById('f-reason').value.trim();
  const amt=parseFloat(document.getElementById('f-amount').value);
  if(!player){alert('Vyber hráče.');return;}
  if(!reason){alert('Vyplň důvod.');return;}
  if(isNaN(amt)||amt<=0){alert('Zadej platnou částku.');return;}
  addFine(player,reason,amt);
  document.getElementById('f-player-text').value='';
  document.getElementById('f-player').value='';
  document.getElementById('f-reason').value='';
  document.getElementById('f-amount').value='';
  renderReasonTiles(); renderRecentPlayers();
};
window.submitSelfFine=function(){
  if(!phoneUser) return;
  const reason=document.getElementById('self-reason').value.trim();
  const amt=parseFloat(document.getElementById('self-amount').value);
  if(!reason||isNaN(amt)||amt<=0){alert('Vyplň důvod a částku.');return;}
  ensurePlayer(phoneUser.name); addFine(phoneUser.name,reason,amt);
  document.getElementById('self-reason').value=''; document.getElementById('self-amount').value='';
};

// ─── VOICE ────────────────────────────────────────────────────────
window.toggleVoiceSession=function(){voiceActive?stopVoiceSession():startVoiceSession();};
function startVoiceSession(){
  if(!('webkitSpeechRecognition'in window||'SpeechRecognition'in window)){alert('Hlasový vstup není podporován. Zkuste Chrome nebo Edge.');return;}
  voiceActive=true;fullTranscript='';
  const btn=document.getElementById('voice-record-btn');
  btn.classList.add('recording');
  document.getElementById('voice-record-label').textContent='Zastavit nahrávání';
  document.getElementById('voice-status').textContent='🔴 Nahrávám…';
  const live=document.getElementById('voice-live');live.style.display='block';live.textContent='';
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  recognition=new SR();recognition.lang='cs-CZ';recognition.continuous=true;recognition.interimResults=true;
  recognition.onresult=e=>{
    clearTimeout(silenceTimer);silenceTimer=setTimeout(()=>{if(voiceActive)stopVoiceSession();},3500);
    let interim='';
    for(let i=e.resultIndex;i<e.results.length;i++){
      const t=e.results[i][0].transcript;
      if(e.results[i].isFinal)fullTranscript+=(fullTranscript?', ':'')+t; else interim=t;
    }
    live.textContent=fullTranscript+(interim?' '+interim:'');
  };
  recognition.onerror=err=>{if(['no-speech','audio-capture'].includes(err.error))stopVoiceSession();};
  recognition.onend=()=>{if(voiceActive){try{recognition.start();}catch(e){stopVoiceSession();}}};
  recognition.start();
}
function stopVoiceSession(){
  voiceActive=false;clearTimeout(silenceTimer);
  if(recognition){recognition.onend=null;try{recognition.stop();}catch(e){}recognition=null;}
  document.getElementById('voice-record-btn').classList.remove('recording');
  document.getElementById('voice-record-label').textContent='Spustit nahrávání';
  document.getElementById('voice-status').textContent='';
  document.getElementById('voice-live').style.display='none';
  const t=fullTranscript.trim(); if(!t){showToast('Žádný hlasový vstup.');return;}
  buildReviewQueue(t);
}

// ─── REVIEW ───────────────────────────────────────────────────────
function buildReviewQueue(transcript){
  reviewQueue=[];
  splitTranscript(transcript).forEach(chunk=>{
    const parsed=parseChunk(chunk); if(!parsed) return;
    const resolved=resolvePlayerName(parsed.rawName);
    reviewQueue.push({rawName:parsed.rawName,resolvedPlayer:resolved||parsed.rawName,reason:parsed.reason,amount:parsed.amount,isNew:!resolved,isAlias:!!(resolved&&resolved.toLowerCase()!==parsed.rawName.toLowerCase()),skip:false});
  });
  if(!reviewQueue.length){showToast('Nepodařilo se rozpoznat žádné pokuty.');return;}
  renderReviewQueue();
  document.getElementById('voice-review').style.display='block';
  document.getElementById('voice-review').scrollIntoView({behavior:'smooth'});
}
function renderReviewQueue(){
  const n=reviewQueue.filter(r=>!r.skip).length;
  document.getElementById('confirm-btn').innerHTML=`<i class="ti ti-device-floppy"></i> Uložit ${n} pokut${n===1?'u':n<5?'y':''}`;
  document.getElementById('review-list').innerHTML=reviewQueue.map((r,i)=>{
    const opts=(state.players||[]).map(p=>`<option value="${esc(p.name)}"${p.name===r.resolvedPlayer?' selected':''}>${esc(p.name)}</option>`).join('');
    const newOpt=r.isNew?`<option value="${esc(r.resolvedPlayer)}" selected>${esc(r.resolvedPlayer)} (nový)</option>`:'';
    return`<div class="review-item${r.skip?' skipped':''}">
      <div class="review-item-header">
        <span class="review-item-num">${i+1}</span>
        <span class="review-item-tags">${r.isAlias?`<span class="badge badge-alias">≡ ${esc(r.rawName)}</span>`:''} ${r.isNew?`<span class="badge badge-new">Nový hráč</span>`:''}</span>
        <button class="btn-icon${r.skip?'':' danger'}" onclick="toggleSkip(${i})"><i class="ti ${r.skip?'ti-rotate-clockwise':'ti-trash'}"></i></button>
      </div>
      <div class="review-fields"${r.skip?' style="opacity:.4;pointer-events:none;"':''}>
        <div class="review-field"><label>Hráč</label><select onchange="updateReview(${i},'resolvedPlayer',this.value)">${newOpt}${opts}</select></div>
        <div class="review-field review-field-reason"><label>Důvod</label><input type="text" value="${esc(r.reason)}" oninput="updateReview(${i},'reason',this.value)"/></div>
        <div class="review-field review-field-amt"><label>Částka</label><input type="number" value="${r.amount}" oninput="updateReview(${i},'amount',parseFloat(this.value))"/></div>
      </div></div>`;
  }).join('');
}
window.updateReview=function(i,k,v){reviewQueue[i][k]=v;if(k==='resolvedPlayer'){reviewQueue[i].isNew=!state.players.find(p=>p.name===v);reviewQueue[i].isAlias=false;}const n=reviewQueue.filter(r=>!r.skip).length;document.getElementById('confirm-btn').innerHTML=`<i class="ti ti-device-floppy"></i> Uložit ${n} pokut${n===1?'u':n<5?'y':''}`;};
window.toggleSkip=function(i){reviewQueue[i].skip=!reviewQueue[i].skip;renderReviewQueue();};
window.confirmReview=async function(){
  const toSave=reviewQueue.filter(r=>!r.skip);if(!toSave.length){window.discardReview();return;}
  toSave.forEach(r=>{ensurePlayer(r.resolvedPlayer);state.fines.unshift({player:r.resolvedPlayer,reason:r.reason,amount:r.amount,ts:Date.now(),season:seasonKey(activeSeason)});});
  await saveState();showToast(`✓ Uloženo ${toSave.length} pokut`);window.discardReview();populatePlayerSelects();
};
window.discardReview=function(){reviewQueue=[];document.getElementById('voice-review').style.display='none';};

// ─── FINE OPS ─────────────────────────────────────────────────────
function ensurePlayer(name){
  if(!state.players.find(p=>p.name.toLowerCase()===name.toLowerCase()))
    state.players.push({name,email:'',phone:'',nicknames:[],seasons:[],roles:{}});
}
async function addFine(player,reason,amount){
  state.fines.unshift({player,reason,amount,ts:Date.now(),season:seasonKey(activeSeason)});
  await saveState();showToast(`Pokuta přidána: ${player} – ${amount} ${CONFIG.CURRENCY}`);
}

// ─── LOG (FIX #1: checkbox multi-delete) ─────────────────────────
function renderLog(){
  populatePlayerSelects();
  const search=(document.getElementById('log-search').value||'').toLowerCase();
  const pf=(document.getElementById('log-player-filter').value||'').toLowerCase();
  const list=document.getElementById('log-list'),empty=document.getElementById('log-empty');
  const fines=seasonFines().filter(f=>{
    if(pf&&f.player.toLowerCase()!==pf) return false;
    if(search&&!f.player.toLowerCase().includes(search)&&!f.reason.toLowerCase().includes(search)) return false;
    return true;
  });
  if(!fines.length){list.innerHTML='';empty.style.display='block';return;}
  empty.style.display='none';
  list.innerHTML=fines.map(f=>{
    const idx=state.fines.indexOf(f);
    const d=new Date(f.ts);
    const ds=`${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getFullYear()).slice(2)}`;
    const ts=`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    const checked=selectedFineIndices.has(idx)?'checked':'';
    return`<div class="fine-row${selectedFineIndices.has(idx)?' selected':''}" id="fr-${idx}">
      ${isManager?`<input type="checkbox" class="fine-check" ${checked} onchange="toggleFineSelect(${idx},this.checked)" onclick="event.stopPropagation()" />`:''}
      <span class="fine-time">${ds}<br><span class="fine-time-clock">${ts}</span></span>
      <span class="fine-player">${esc(f.player)}</span>
      <span class="fine-reason">${esc(f.reason)}</span>
      <span class="fine-amt">${f.amount} ${CONFIG.CURRENCY}</span>
      ${isManager?`<div class="fine-actions">
        <button class="btn-icon" onclick="openEdit(${idx})"><i class="ti ti-edit"></i></button>
        <button class="btn-icon danger" onclick="deleteFine(${idx})"><i class="ti ti-trash"></i></button>
      </div>`:''}
    </div>`;
  }).join('');
  updateBulkBar();
}
window.renderLog=renderLog;

// checkbox handling
window.toggleFineSelect=function(idx,checked){
  if(checked) selectedFineIndices.add(idx); else selectedFineIndices.delete(idx);
  const row=document.getElementById('fr-'+idx);
  if(row) row.classList.toggle('selected',checked);
  updateBulkBar();
};
function updateBulkBar(){
  const bar=document.getElementById('log-bulk-bar');
  const cnt=document.getElementById('log-selected-count');
  if(!bar||!cnt) return;
  const n=selectedFineIndices.size;
  bar.style.display=n>0?'flex':'none';
  cnt.textContent=`${n} vybráno`;
}
window.clearSelection=function(){selectedFineIndices.clear();renderLog();};
window.deleteSelected=async function(){
  if(!selectedFineIndices.size) return;
  if(!confirm(`Smazat ${selectedFineIndices.size} pokut?`)) return;
  const sorted=[...selectedFineIndices].sort((a,b)=>b-a);
  sorted.forEach(idx=>state.fines.splice(idx,1));
  selectedFineIndices.clear();
  await saveState();renderLog();showToast('Pokuty smazány ✓');
};

window.deleteFine=async function(idx){
  if(!confirm('Smazat tuto pokutu?')) return;
  state.fines.splice(idx,1);await saveState();renderLog();
};
window.openEdit=function(idx){
  editIndex=idx;const f=state.fines[idx];
  populatePlayerSelects();
  document.getElementById('edit-player').value=f.player;
  document.getElementById('edit-reason').value=f.reason;
  document.getElementById('edit-amount').value=f.amount;
  document.getElementById('edit-modal').classList.add('open');
};
window.closeEditModal=function(){document.getElementById('edit-modal').classList.remove('open');};
window.saveEdit=async function(){
  const f=state.fines[editIndex];
  f.player=document.getElementById('edit-player').value;
  f.reason=document.getElementById('edit-reason').value.trim();
  f.amount=parseFloat(document.getElementById('edit-amount').value);
  if(!f.player||!f.reason||isNaN(f.amount)||f.amount<=0){alert('Zkontroluj všechna pole.');return;}
  await saveState();window.closeEditModal();renderLog();showToast('Pokuta upravena ✓');
};

// ─── SUMMARY ──────────────────────────────────────────────────────
function renderSummary(){
  const fines=seasonFines(),totals={};
  (state.players||[]).forEach(p=>{totals[p.name]={total:0,count:0};});
  fines.forEach(f=>{if(!totals[f.player])totals[f.player]={total:0,count:0};totals[f.player].total+=f.amount;totals[f.player].count+=1;});
  const allTotal=fines.reduce((a,f)=>a+f.amount,0);
  document.getElementById('summary-stats').innerHTML=`
    <div class="stat-card"><div class="stat-label">Celkem ve fondu</div><div class="stat-value">${allTotal}<span class="stat-unit"> ${CONFIG.CURRENCY}</span></div></div>
    <div class="stat-card"><div class="stat-label">Počet pokut</div><div class="stat-value">${fines.length}</div></div>
    <div class="stat-card"><div class="stat-label">Hráčů</div><div class="stat-value">${(state.players||[]).length}</div></div>`;
  const sorted=Object.entries(totals).sort((a,b)=>b[1].total-a[1].total);
  const listEl=document.getElementById('summary-list');
  if(!sorted.length){listEl.innerHTML='<div class="empty-state"><i class="ti ti-chart-bar"></i><p>Zatím žádná data.</p></div>';return;}
  listEl.innerHTML=sorted.map(([name,d])=>{
    const initials=name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    const pct=allTotal>0?Math.round((d.total/allTotal)*100):0;
    return`<div class="player-summary-row">
      <div class="avatar">${initials}</div>
      <div style="flex:1;min-width:0;"><div class="ps-name">${esc(name)}</div><div class="ps-count">${d.count}× · ${pct}%</div></div>
      <div class="ps-total">${d.total} ${CONFIG.CURRENCY}</div>
    </div>`;
  }).join('');
}
window.renderSummary=renderSummary;

window.generateEmailReport=function(){
  const fines=seasonFines(),totals={};
  (state.players||[]).forEach(p=>{totals[p.name]={total:0,count:0};});
  fines.forEach(f=>{if(!totals[f.player])totals[f.player]={total:0,count:0};totals[f.player].total+=f.amount;totals[f.player].count+=1;});
  const sorted=Object.entries(totals).filter(([,d])=>d.total>0).sort((a,b)=>b[1].total-a[1].total);
  const grandTotal=sorted.reduce((a,[,d])=>a+d.total,0);
  const today=new Date().toLocaleDateString('cs-CZ');
  const sl=activeSeason?seasonLabel(activeSeason):'';
  const lines=sorted.map(([n,d])=>`  ${n}: ${d.total} ${CONFIG.CURRENCY} (${d.count}×)`).join('\n');
  const report=`Ahoj tým! 👋\n\nPřehled pokut k ${today} (${sl}):\n\n${lines}\n\nCelkem ve fondu: ${grandTotal} ${CONFIG.CURRENCY} 🎉\n\nDo konce sezóny prosím uhraďte svůj příspěvek – jdeme na párty!`;
  const el=document.getElementById('email-report');el.style.display='block';
  el.innerHTML=`<div class="email-report-box"><textarea id="report-text" readonly>${report}</textarea></div>
    <button class="btn btn-secondary" style="margin-top:8px;" onclick="copyReport()"><i class="ti ti-copy"></i> Kopírovat</button>`;
};
window.copyReport=function(){navigator.clipboard.writeText(document.getElementById('report-text').value).then(()=>showToast('Zkopírováno ✓'));};

// ─── PLAYERS (FIX #2: edit modal + stats) ─────────────────────────
window.addPlayer=async function(){
  const name=document.getElementById('new-player-name').value.trim();
  const email=document.getElementById('new-player-email').value.trim();
  const nick=document.getElementById('new-player-nick').value.trim();
  const phone=document.getElementById('new-player-phone').value.trim();
  const err=document.getElementById('add-player-err');
  if(!name){showErr(err,'Jméno je povinné.');return;}
  if(state.players.find(p=>p.name.toLowerCase()===name.toLowerCase())){showErr(err,'Hráč s tímto jménem již existuje.');return;}
  if(email&&!email.includes('@')){showErr(err,'Neplatný e-mail.');return;}
  const nicknames=nick?nick.split(',').map(s=>s.trim()).filter(Boolean):[];
  const sk=seasonKey(activeSeason);
  state.players.push({name,email,phone:phone||'',nicknames,seasons:[sk],roles:{}});
  await saveState();err.style.display='none';
  ['new-player-name','new-player-email','new-player-nick','new-player-phone'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  renderPlayers();populatePlayerSelects();showToast(`Hráč ${name} přidán ✓`);
};

function renderPlayers(){
  const list=document.getElementById('player-list'),empty=document.getElementById('player-list-empty');
  if(!state.players||!state.players.length){list.innerHTML='';empty.style.display='block';return;}
  empty.style.display='none';
  const sk=seasonKey(activeSeason);
  list.innerHTML=state.players.map((p,i)=>{
    const initials=p.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    const fineCount=(state.fines||[]).filter(f=>f.player===p.name).length;
    const fineTotal=(state.fines||[]).filter(f=>f.player===p.name).reduce((a,f)=>a+f.amount,0);
    const nicks=(p.nicknames||[]);
    const nickHtml=nicks.length?nicks.map(n=>`<span class="badge badge-alias">${esc(n)}</span>`).join(' '):`<span class="no-nick">bez přezdívky</span>`;
    // Roles for current season
    const roles=(p.roles&&p.roles[sk])||[];
    const roleBadges=roles.map(r=>`<span class="badge ${roleClass(r)}">${esc(r)}</span>`).join(' ');
    return`<div class="player-row" onclick="openEditPlayerModal(${i})">
      <div class="avatar" style="width:36px;height:36px;font-size:12px;flex-shrink:0;">${initials}</div>
      <div style="flex:1;min-width:0;">
        <div class="player-row-name">${esc(p.name)}</div>
        <div class="player-row-meta">
          ${p.phone?`<span class="meta-chip"><i class="ti ti-phone"></i> ${esc(p.phone)}</span>`:''}
          ${p.email?`<span class="meta-chip"><i class="ti ti-mail"></i> ${esc(p.email)}</span>`:''}
          <span class="badge badge-fine-count">${fineCount}× &middot; ${fineTotal} ${CONFIG.CURRENCY}</span>
        </div>
        <div class="player-row-nicks">${nickHtml}</div>
        ${roleBadges?`<div class="player-row-roles">${roleBadges}</div>`:''}
      </div>
      <div class="player-row-actions">
        <button class="btn-icon" onclick="event.stopPropagation();openEditPlayerModal(${i})" title="Upravit"><i class="ti ti-edit"></i></button>
        <button class="btn-icon danger" onclick="event.stopPropagation();removePlayer(${i})" title="Odebrat"><i class="ti ti-trash"></i></button>
      </div>
    </div>`;
  }).join('');
}
window.renderPlayers=renderPlayers;

window.removePlayer=async function(i){
  const p=state.players[i];
  if(!confirm(`Odebrat ${p.name}? Jejich pokuty zůstanou v logu.`)) return;
  state.players.splice(i,1);await saveState();renderPlayers();populatePlayerSelects();showToast(`${p.name} odebrán/a`);
};

// ─── EDIT PLAYER MODAL (FIX #2) ───────────────────────────────────
window.openEditPlayerModal=function(i){
  editPlayerIdx=i;
  const p=state.players[i];
  const sk=seasonKey(activeSeason);
  document.getElementById('edit-player-title').textContent='Upravit hráče – '+p.name;
  document.getElementById('ep-name').value=p.name||'';
  document.getElementById('ep-phone').value=p.phone||'';
  document.getElementById('ep-email').value=p.email||'';
  document.getElementById('ep-nicks').value=(p.nicknames||[]).join(', ');
  document.getElementById('ep-season-badge').textContent=seasonLabel(activeSeason);
  // roles
  const roles=(p.roles&&p.roles[sk])||[];
  ['ep-role-a','ep-role-b','ep-role-captain','ep-role-asst','ep-role-coach'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.checked=roles.includes(el.value);
  });
  // stats
  renderPlayerStats(p);
  document.getElementById('edit-player-modal').classList.add('open');
};
window.closeEditPlayerModal=function(){document.getElementById('edit-player-modal').classList.remove('open');editPlayerIdx=-1;};

function renderPlayerStats(p){
  const el=document.getElementById('ep-stats'); if(!el) return;
  const allFines=(state.fines||[]).filter(f=>f.player===p.name);
  if(!allFines.length){el.innerHTML='<p style="font-size:13px;color:var(--tx-m);">Žádné pokuty.</p>';return;}

  // Group by season
  const bySeason={};
  allFines.forEach(f=>{
    const sk=f.season||'nezařazeno';
    if(!bySeason[sk]) bySeason[sk]={total:0,count:0};
    bySeason[sk].total+=f.amount; bySeason[sk].count+=1;
  });

  // Reason frequency
  const byReason={};
  allFines.forEach(f=>{byReason[f.reason]=(byReason[f.reason]||0)+1;});
  const reasonSorted=Object.entries(byReason).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const maxR=reasonSorted[0]?reasonSorted[0][1]:1;

  const seasonHtml=Object.entries(bySeason).map(([sk,d])=>`
    <div class="ep-season-block">
      <div class="ep-season-title">${esc(sk.replace('-',' '))}</div>
      <div><span class="ep-season-stat">${d.total}</span><span class="stat-unit"> ${CONFIG.CURRENCY}</span></div>
      <div class="ep-season-sub">${d.count} pokut${d.count===1?'a':d.count<5?'y':''}</div>
    </div>`).join('');

  const reasonHtml=reasonSorted.map(([r,c])=>`
    <div class="reason-bar-row">
      <span class="reason-bar-label" title="${esc(r)}">${esc(r)}</span>
      <div class="reason-bar-track"><div class="reason-bar-fill" style="width:${Math.round(c/maxR*100)}%"></div></div>
      <span class="reason-bar-count">${c}×</span>
    </div>`).join('');

  el.innerHTML=`
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px;">${seasonHtml}</div>
    ${reasonSorted.length?`<div style="font-size:11px;font-weight:700;color:var(--tx-m);text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;">Nejčastější důvody</div><div class="reason-bars">${reasonHtml}</div>`:''}`;
}

window.saveEditPlayer=async function(){
  if(editPlayerIdx<0) return;
  const p=state.players[editPlayerIdx];
  const newName=document.getElementById('ep-name').value.trim();
  const err=document.getElementById('ep-err'); err.style.display='none';
  if(!newName){showErr(err,'Jméno je povinné.');return;}
  // check name uniqueness (allow same)
  if(newName.toLowerCase()!==p.name.toLowerCase()&&state.players.find((x,i)=>i!==editPlayerIdx&&x.name.toLowerCase()===newName.toLowerCase())){showErr(err,'Hráč s tímto jménem již existuje.');return;}

  const oldName=p.name;
  p.name=newName;
  p.phone=document.getElementById('ep-phone').value.trim();
  p.email=document.getElementById('ep-email').value.trim();
  p.nicknames=document.getElementById('ep-nicks').value.split(',').map(s=>s.trim()).filter(Boolean);

  // collect roles
  const sk=seasonKey(activeSeason);
  if(!p.roles) p.roles={};
  p.roles[sk]=['ep-role-a','ep-role-b','ep-role-captain','ep-role-asst','ep-role-coach']
    .filter(id=>document.getElementById(id)?.checked)
    .map(id=>document.getElementById(id).value);

  // rename fines if name changed
  if(oldName!==newName) (state.fines||[]).forEach(f=>{if(f.player===oldName)f.player=newName;});

  await saveState();
  window.closeEditPlayerModal();renderPlayers();populatePlayerSelects();showToast(`${newName} uložen ✓`);
};

// ─── NICKNAMES ────────────────────────────────────────────────────
window.openNickModal=function(i){
  nickPlayerIdx=i;const p=state.players[i];
  document.getElementById('nick-modal-title').textContent='Přezdívky – '+p.name;
  document.getElementById('nick-input').value='';
  document.getElementById('nick-err').style.display='none';
  renderNickChips();document.getElementById('nick-modal').classList.add('open');
  setTimeout(()=>document.getElementById('nick-input').focus(),80);
};
window.closeNickModal=function(){document.getElementById('nick-modal').classList.remove('open');nickPlayerIdx=-1;};
function renderNickChips(){
  const p=state.players[nickPlayerIdx],nicks=p?(p.nicknames||[]):[];
  document.getElementById('nick-chips').innerHTML=nicks.length
    ?nicks.map((n,j)=>`<span class="nick-chip">${esc(n)}<button onclick="removeNick(${j})"><i class="ti ti-x"></i></button></span>`).join('')
    :`<span class="no-nick">Žádné přezdívky.</span>`;
}
window.addNick=async function(){
  const val=document.getElementById('nick-input').value.trim(),err=document.getElementById('nick-err');
  if(!val){showErr(err,'Zadej přezdívku.');return;}
  const p=state.players[nickPlayerIdx];p.nicknames=p.nicknames||[];
  const conflict=state.players.find((pl,i)=>i!==nickPlayerIdx&&(pl.name.toLowerCase()===val.toLowerCase()||(pl.nicknames||[]).some(n=>n.toLowerCase()===val.toLowerCase())));
  if(conflict){showErr(err,`Tato přezdívka patří hráči ${conflict.name}.`);return;}
  if(p.nicknames.some(n=>n.toLowerCase()===val.toLowerCase())){showErr(err,'Přezdívka již existuje.');return;}
  p.nicknames.push(val);await saveState();err.style.display='none';
  document.getElementById('nick-input').value='';renderNickChips();renderPlayers();showToast(`Přezdívka „${val}" přidána ✓`);
};
window.removeNick=async function(j){state.players[nickPlayerIdx].nicknames.splice(j,1);await saveState();renderNickChips();renderPlayers();};

// ─── UTILS ────────────────────────────────────────────────────────
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
let toastTimer=null;
function showToast(msg){const el=document.getElementById('toast');el.textContent=msg;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2800);}
function showErr(el,msg){el.textContent=msg;el.style.display='block';}
function friendlyAuthError(code){
  const map={'auth/email-already-in-use':'Tento e-mail je již zaregistrován.','auth/invalid-email':'Neplatný e-mail.','auth/weak-password':'Heslo je příliš slabé (min. 6 znaků).','auth/user-not-found':'Účet s tímto e-mailem neexistuje.','auth/wrong-password':'Nesprávné heslo.','auth/invalid-credential':'Nesprávný e-mail nebo heslo.','auth/too-many-requests':'Příliš mnoho pokusů. Zkus to za chvíli.','auth/network-request-failed':'Chyba sítě. Zkontroluj připojení.'};
  return map[code]||`Chyba: ${code}`;
}

// Backdrop close
document.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('.modal-backdrop').forEach(el=>{
    el.addEventListener('click',e=>{
      if(e.target!==el) return;
      if(el.id==='pin-modal')          window.closePinModal();
      if(el.id==='edit-modal')         window.closeEditModal();
      if(el.id==='nick-modal')         window.closeNickModal();
      if(el.id==='edit-player-modal')  window.closeEditPlayerModal();
    });
  });
});
