/**
 * Team Fines – app.js v5
 * Fixes: #1 bulk-delete checkboxes, #2 edit player + stats modal,
 *        #3 CSV file upload import, #4 logout btn contrast,
 *        #5 brand colors + logo (CSS), #6 reCAPTCHA mobile fix
 */

import { auth, db } from './firebase.js';
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  onAuthStateChanged, signOut,
  RecaptchaVerifier, signInWithPhoneNumber,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { doc, setDoc, onSnapshot, collection, deleteDoc }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { parseVoiceTranscript, resolveVoicePlayer, scoreVoiceAlternative }
  from './voice.js';
import { seasonForDate, seasonKey as calendarSeasonKey } from './season.js';

// ─── CONFIG ───────────────────────────────────────────────────────
const CONFIG = {
  CURRENCY:'CZK', FIRESTORE_DOC:'teamdata/main', PRIMARY_ADMIN_EMAIL:'lyrixzz@gmail.com',
  // Set after deploying apps-script/Code.gs as a Google Apps Script web app.
  // Empty means registration remains fully functional, without e-mail notification.
  APPS_SCRIPT_NOTIFICATION_URL:'https://script.google.com/macros/s/AKfycbwxHIR8tCvHo8k-_UpQEzaR-DmPX53g7pZs_imAE0vd7Nbs36Hmmwke2HEPAXvIAqJIaA/exec'
};
const PRIMARY_ADMIN_PROFILE={firstName:'Michal',lastName:'Nevřala',phone:'+420605086775',name:'Michal Nevřala'};
const UNKNOWN_REASON='Unknown reason';
// Each new season is imported as a dated catalogue.  Keep previous catalogues
// in this format: changing a price appends a new period; an omitted item is
// closed on the day before the new catalogue takes effect.
const RATE_CATALOG_2026_27={
  id:'2026-27-2026-07-15', season:'2026/27', effectiveFrom:'2026-07-15', source:'sazebnik_26_27.jpeg',
  items:[
    ['Bago – deset přihrávek nebo „housle“ (hráči v bagu)',30],
    ['Bago – devátá pokažená přihrávka',30],
    ['Přestřelení ochranné sítě',30],
    ['Nedaná penalta při tréninku',30],
    ['Dvě nedané penalty při tréninku',70],
    ['Prohra ve fotbálku o více než 5 gólů',30],
    ['Prohra ve fotbálku o více než 10 gólů',70],
    ['Prohra v individuálních soutěžích (břevna, přímáky…)',30],
    ['Pravidlo „pičovina“ (pět hlasujících)',30],
    ['Pravidlo „giga-pičovina“ (pět hlasujících)',50],
    ['Omluvená neúčast na tréninku při 5 a méně lidech',30],
    ['Neomluvená neúčast na tréninku při 5 a méně lidech',50],
    ['Nedisciplinovanost na tréninku nebo hrubé chování (max. 200 Kč)',200],
    ['Zapomenuté věci na zápas – kopačky, chrániče nebo ručník',30],
    ['Zapnuté zvonění v kabině',30],
    ['Žlutá karta za kecy nebo nesportovní chování',100],
    ['Červená karta',300],
    ['Neproměněná penalta',300],
    ['Hattrick',300],
    ['Nedodržení životosprávy před zápasem',300],
    ['Kapitánská páska při mistrovském utkání (jednou za sezónu)',300],
    ['Pozdní příchod na zápas omluvený',30],
    ['Pozdní příchod na zápas neomluvený',150],
    ['Omluva ze zápasu v den zápasu',150],
    ['Neomluvená neúčast na zápase',400],
    ['Hrubé nebo nesportovní chování před, během nebo po zápase',300],
    ['Dárek od pokladníka (max. 50 Kč)',50],
    ['První mistrák za Chuchli',300],
    ['První gól za Chuchli',300],
    ['Fotka nebo rozhovor v novinách či na internetu',100],
    ['Video nebo rozhovor v televizi',300],
  ]
};
const ONE_TIME_FINE_IMPORT_BOZKOV_2026={
  id:'soustredeni-bozkov-2026-v1', title:'Soustředění Bozkov 2026', date:'2026-07-15',
  aliases:{
    'Forejtar Václav':['Venca Forejtar','Venca'],
    'Hoppan Jakub':['Kuba Hoppan'],
    'Nushi Sámi':['Sami'],
    'Vláčucha Adrian':['Adrian'],
  },
  entries:[
    ['Botur Michael',[30]], ['Chroust Martin',[30,30]], ['Doležal Jakub',[100,50,50,30,30,90,30,30]],
    ['Forejtar Václav',[50,50,50,30,30,30]], ['Hlaváč Jan',[30,50]], ['Hoppan Jakub',[30,30]],
    ['Horčička Jiří',[30,50,50,30,30,50,50,50,30,30]], ['Hubálek Adam',[30,100]], ['Klemš Erik',[30,50,300]],
    ['Květ Jakub',[50]], ['Nevrála Michal',[300]], ['Ngo Liem',[30]], ['Nushi Sámi',[30]], ['Piaček Juraj',[30,-30,500]],
    ['Sahula Roman',[60]], ['Soudil Jan',[50,30]], ['Svoboda Matěj',[50,100,30]], ['Teichmann Lukáš',[60,60,30,300,300]],
    ['Tichý Jan',[50,30,30,30,60,30]], ['Urban Dan',[50,30,50]], ['Vízner Tomáš',[50,30]], ['Vláčucha Adrian',[30,30,90]],
  ]
};

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
let isManager=false, isAdmin=false, editIndex=-1, nickPlayerIdx=-1, editPlayerIdx=-1;
let currentUser=null, phoneUser=null, unsubFirestore=null, unsubAccess=null, unsubUserList=null, activeSeason=null;
let accessRequest=null, accessUsers=[], appSessionActive=false, verificationCooldownTimer=null;
let registrationIntent=null;
let recognition=null, voiceActive=false, silenceTimer=null, fullTranscript='';
let voiceRestartTimer=null, voiceStopRequested=false, voiceRestartAttempts=0;
let voiceMeterStream=null, voiceMeterContext=null, voiceMeterAnalyser=null, voiceMeterFrame=null;
let reviewQueue=[], reviewTranscript='';
let selectedFineIndices=new Set(); // FIX #1
let pendingCSVMembers=[];          // FIX #3
let state={players:[],fines:[]};
let catalogMigrationPending=false;
let oneTimeImportShown=false, reviewImportMeta=null;

function dayBefore(date){ return new Date(new Date(`${date}T12:00:00`).getTime()-86400000).toISOString().slice(0,10); }
function importRateCatalog(catalog,{reset=false}={}){
  if(reset){
    state.fines=[];
    state.rateHistory={};
    state.reasonList=[];
    state.reasonLists={};
    state.deletedRatePeriods={};
  }
  const history=state.rateHistory||{};
  const incoming=new Set(catalog.items.map(([label])=>label));
  if(!reset){
    Object.entries(history).forEach(([label,periods])=>{
      if(incoming.has(label)) return;
      const open=(periods||[]).filter(p=>p.from<catalog.effectiveFrom&&(!p.to||p.to>=catalog.effectiveFrom)).at(-1);
      if(open) open.to=dayBefore(catalog.effectiveFrom);
    });
  }
  catalog.items.forEach(([label,price])=>{
    const periods=history[label]||[];
    const existing=periods.find(p=>p.from===catalog.effectiveFrom);
    if(existing){ existing.price=price; existing.to=''; }
    else periods.push({from:catalog.effectiveFrom,to:'',price});
    history[label]=periods.sort((a,b)=>a.from.localeCompare(b.from));
  });
  state.rateHistory=history;
  state.catalogImports=state.catalogImports||{};
  state.catalogImports[catalog.season]={id:catalog.id,source:catalog.source,effectiveFrom:catalog.effectiveFrom,updatedAt:new Date().toISOString()};
}
function normalizedPlayerName(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
}
function playerNameWords(value){ return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().match(/[a-z0-9]+/g)||[]; }
function resolveImportedPlayer(name,aliases=[]){
  const sourceNames=[name,...aliases];
  const targets=new Set(sourceNames.flatMap(value=>[
    normalizedPlayerName(value),normalizedPlayerName(String(value).split(/\s+/).reverse().join(' '))
  ]));
  const matches=new Set();
  (state.players||[]).forEach(player=>{
    const names=[player.name,...(player.nicknames||[])];
    if(names.some(candidate=>{
      const value=normalizedPlayerName(candidate);
      return targets.has(value);
    })) matches.add(player.name);
  });
  if(matches.size===1) return [...matches][0];
  // Handwritten tables use surnames first. A unique surname is still a safe
  // match and keeps imports resilient to an abbreviated first name/profile.
  const surname=playerNameWords(name)[0];
  if(surname){
    (state.players||[]).forEach(player=>{
      const names=[player.name,...(player.nicknames||[])];
      if(names.some(candidate=>playerNameWords(candidate).includes(surname))) matches.add(player.name);
    });
  }
  return matches.size===1?[...matches][0]:null;
}
function prepareOneTimeFineImport(importData){
  const unresolved=[];
  const fines=[];
  importData.entries.forEach(([sourceName,amounts])=>{
    const player=resolveImportedPlayer(sourceName,importData.aliases?.[sourceName]||[]);
    if(!player) unresolved.push(sourceName);
    amounts.forEach((amount,index)=>fines.push({
      sourceName,player:player||'',reason:UNKNOWN_REASON,amount,ts:new Date(`${importData.date}T12:00:00`).getTime()+index,
      season:'2026/27',source:importData.title,allowNegative:amount<0
    }));
  });
  return {unresolved:[...new Set(unresolved)],fines};
}

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
function seasonKey(s){ return calendarSeasonKey(s); }
function seasonLabel(s){ return seasonKey(s); }
function currentYear(){ return new Date().getFullYear(); }
function parseSeasonKey(key){
  const match=String(key||'').match(/(\d{4})/);
  return {year:Number(match?.[1])||2025};
}
function seasonOrder(season){ return Number(season.year); }
function fineSeason(f){ return f?.season ? parseSeasonKey(f.season) : seasonForDate(new Date(f.ts)); }
function seasonFines(){
  if(!activeSeason) return state.fines||[];
  const key=seasonKey(activeSeason);
  return (state.fines||[]).filter(f=>seasonKey(fineSeason(f))===key);
}

// ─── AUTH ─────────────────────────────────────────────────────────
onAuthStateChanged(auth,user=>{
  currentUser=user; resetAuthButtons();
  if(!user){ if(!phoneUser) showScreen('auth'); stopFirestoreListener(); stopAccessListeners(); appSessionActive=false; return; }
  // The primary administrator must never be locked out by a historic account
  // that was created before e-mail verification was introduced.
  if(!primaryAdmin()&&!user.emailVerified){showVerification(user);stopFirestoreListener();stopAccessListeners();appSessionActive=false;return;}
  startAccessListener(user);
});

function resetAuthButtons(){
  const lb=document.getElementById('login-btn');
  if(lb){lb.disabled=false;lb.innerHTML='<i class="ti ti-login"></i> Přihlásit se';}
  const rb=document.getElementById('reg-btn');
  if(rb){rb.disabled=false;rb.innerHTML='<i class="ti ti-user-plus"></i> Vytvořit účet';}
}
function enterApp(name,{listen=true}={}){
  showScreen('app');
  const hu=document.getElementById('header-user'); if(hu) hu.textContent=name||'';
  if(!appSessionActive){ initSeasonPicker(); appSessionActive=true; }
  updateLockUI(); if(listen) startFirestoreListener();
  // #6: player email match checked after Firestore loads (see startFirestoreListener)
}

// Called after Firestore first load to check if current email user is a roster player
function checkEmailPlayerMatch(){
  if(!currentUser) return;
  if(phoneUser) return; // already in phone mode
  const userEmail=currentUser.email.toLowerCase();
  const match=(state.players||[]).find(p=>p.email&&p.email.toLowerCase()===userEmail);
  if(match&&phoneUser){
    // This user is a known player — show self-fine form, hide manager wall
    const sf=document.getElementById('self-fine-form');
    const mw=document.getElementById('manager-wall');
    if(sf){sf.style.display='block';document.getElementById('self-fine-name-label').textContent='Přihlášen jako: '+match.name;}
    if(mw) mw.style.display='none';
    // Pre-fill player in manual form too
    const fp=document.getElementById('f-player'); if(fp) fp.value=match.name;
    const ft=document.getElementById('f-player-text'); if(ft) ft.value=match.name;
    showToast(`Vítej, ${match.name}! Můžeš přidat pokutu sobě.`);
  }
}
function showScreen(n){
  document.getElementById('auth-screen').style.display  =n==='auth'  ?'flex':'none';
  document.getElementById('verify-screen').style.display=n==='verify'?'flex':'none';
  document.getElementById('pending-screen').style.display=n==='pending'?'flex':'none';
  document.getElementById('app-screen').style.display   =n==='app'   ?'block':'none';
}

window.showAuthTab=function(t){
  document.querySelectorAll('.auth-tab').forEach(el=>el.classList.toggle('active',el.dataset.tab===t));
  ['login','register','phone'].forEach(id=>{
    const el=document.getElementById('auth-'+id); if(el) el.classList.toggle('active',id===t);
  });
};

window.doRegister=async function(){
  const firstName=document.getElementById('reg-first-name').value.trim();
  const lastName=document.getElementById('reg-last-name').value.trim();
  const name=`${firstName} ${lastName}`.trim();
  const email=document.getElementById('reg-email').value.trim();
  const phone=registrationPhone();
  const pass=document.getElementById('reg-password').value;
  const pass2=document.getElementById('reg-password2').value;
  const err=document.getElementById('reg-err'),btn=document.getElementById('reg-btn');
  err.style.display='none';
  if(!firstName){showErr(err,'Zadej jméno.');return;}
  if(!lastName){showErr(err,'Zadej příjmení.');return;}
  if(!email){showErr(err,'Zadej e-mail.');return;}
  if(!phone){showErr(err,'Zadej platné devítimístné telefonní číslo.');return;}
  if(pass.length<6){showErr(err,'Heslo musí mít alespoň 6 znaků.');return;}
  if(pass!==pass2){showErr(err,'Hesla se neshodují.');return;}
  btn.disabled=true; btn.innerHTML='<i class="ti ti-loader-2 spin"></i> Vytváříme…';
  try{
    const {updateProfile}=await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
    // Firebase emits the auth-state event immediately after account creation.
    // Keep the completed form available so that listener cannot create a
    // placeholder request from the e-mail before updateProfile finishes.
    registrationIntent={firstName,lastName,phone,email:normalizedEmail(email)};
    const cred=await createUserWithEmailAndPassword(auth,email,pass);
    await updateProfile(cred.user,{displayName:name});
    stageRegistrationProfile(cred.user.uid,registrationIntent);
    await sendVerificationLink(cred.user);
    showVerification(cred.user);
    registrationIntent=null;
  }catch(e){
    registrationIntent=null;resetAuthButtons();
    // Auth state can already have switched to the verification screen. Surface
    // delivery errors there instead of hiding them in the register form.
    if(currentUser&&!currentUser.emailVerified){showVerification(currentUser);showErr(document.getElementById('verify-msg'),friendlyAuthError(e.code));}
    else showErr(err,friendlyAuthError(e.code));
  }
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
  isManager=false; isAdmin=false; phoneUser=null; accessRequest=null; accessUsers=[];
  stopFirestoreListener(); state={players:[],fines:[]};
  stopAccessListeners(); appSessionActive=false;
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
  const msg=document.getElementById('verify-msg'); if(msg) msg.style.display='none';
  try{
    await currentUser.reload();
    currentUser=auth.currentUser;
    if(currentUser?.emailVerified){startAccessListener(currentUser);showToast('E-mail ověřen ✓ Žádost byla předána správci.');}
    else showErr(msg,'E-mail ještě není ověřen. Otevři odkaz z doručené pošty (zkontroluj i spam).');
  }catch(error){console.error('Verification check:',error);showErr(msg,'⚠ Ověření se nepodařilo načíst. Zkus to znovu.');}
};
window.resendVerification=async function(){
  if(!currentUser) return;
  const remaining=verificationRemainingSeconds(currentUser.uid);
  if(remaining){showErr(document.getElementById('verify-msg'),`Další e-mail lze odeslat za ${remaining} sekund.`);return;}
  try{await sendVerificationLink(currentUser);showToast('Ověřovací e-mail odeslán ✓');}
  catch(e){showErr(document.getElementById('verify-msg'),friendlyAuthError(e.code));}
};

// ─── SEASON PICKER ────────────────────────────────────────────────
// ACCESS APPROVAL
function normalizedEmail(value){ return String(value||'').trim().toLowerCase(); }
function normalizedPhone(value){
  const digits=String(value||'').replace(/\D/g,'');
  return digits?`+${digits}`:'';
}
function phoneNumbersMatch(a,b){
  const left=normalizedPhone(a),right=normalizedPhone(b);
  if(!left||!right) return false;
  if(left===right) return true;
  // Older roster imports sometimes contain the same nine-digit number without
  // the country prefix. Only use that fallback when one side has a prefix.
  const leftDigits=left.slice(1),rightDigits=right.slice(1);
  return leftDigits.length===9&&rightDigits.length>9&&rightDigits.endsWith(leftDigits)
    || rightDigits.length===9&&leftDigits.length>9&&leftDigits.endsWith(rightDigits);
}
function normalizedPersonName(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLocaleLowerCase('cs-CZ').replace(/[^a-z0-9]+/g,' ').trim();
}
function suggestedRosterPlayer(user){
  const players=state.players||[];
  if(user.phone){
    const phoneMatch=players.find(player=>phoneNumbersMatch(player.phone,user.phone));
    if(phoneMatch) return {player:phoneMatch,kind:'phone'};
    return null; // A supplied phone is authoritative; do not guess by name.
  }
  const registeredName=normalizedPersonName(`${user.firstName||''} ${user.lastName||''}`.trim()||user.name);
  if(!registeredName) return null;
  const nameMatch=players.find(player=>normalizedPersonName(player.name)===registeredName);
  return nameMatch?{player:nameMatch,kind:'name'}:null;
}
function registrationPhone(){
  const prefix=document.getElementById('reg-phone-prefix')?.value||'+420';
  const national=String(document.getElementById('reg-phone')?.value||'').replace(/\D/g,'');
  return /^\d{9}$/.test(national)?`${prefix}${national}`:'';
}
function stagedRegistrationProfileKey(uid){return `team-fines:registration:${uid}`;}
function stageRegistrationProfile(uid,profile){
  try{localStorage.setItem(stagedRegistrationProfileKey(uid),JSON.stringify(profile));}
  catch(error){console.warn('Registration profile storage:',error);}
}
function stagedRegistrationProfile(user){
  const fallback=splitProfileName(user?.displayName||'');
  try{
    const stored=JSON.parse(localStorage.getItem(stagedRegistrationProfileKey(user.uid))||'null');
    if(stored&&normalizedEmail(stored.email)===normalizedEmail(user.email)) return stored;
  }catch(error){console.warn('Registration profile read:',error);}
  return {firstName:fallback.firstName,lastName:fallback.lastName,phone:'',email:normalizedEmail(user?.email)};
}
function clearStagedRegistrationProfile(uid){
  try{localStorage.removeItem(stagedRegistrationProfileKey(uid));}catch(error){console.warn('Registration profile cleanup:',error);}
}
function verificationCooldownKey(uid){return `team-fines:verification-sent:${uid}`;}
function verificationRemainingSeconds(uid){
  try{return Math.max(0,Math.ceil((90000-(Date.now()-Number(localStorage.getItem(verificationCooldownKey(uid))||0)))/1000));}
  catch(error){return 0;}
}
function renderVerificationCooldown(user=currentUser){
  const button=document.getElementById('verify-resend-btn'); if(!button||!user) return;
  clearTimeout(verificationCooldownTimer);
  const seconds=verificationRemainingSeconds(user.uid);
  button.disabled=seconds>0;
  button.innerHTML=seconds>0?`<i class="ti ti-clock"></i> Znovu odeslat za ${seconds} s`:'<i class="ti ti-mail"></i> Znovu odeslat e-mail';
  if(seconds>0) verificationCooldownTimer=setTimeout(()=>renderVerificationCooldown(user),1000);
}
async function sendVerificationLink(user){
  // Use Firebase's built-in authorised action domain. The user returns to the
  // app manually, so delivery does not depend on a GitHub Pages redirect.
  await sendEmailVerification(user);
  try{localStorage.setItem(verificationCooldownKey(user.uid),String(Date.now()));}catch(error){console.warn('Verification cooldown storage:',error);}
  renderVerificationCooldown(user);
}
function showVerification(user){
  isManager=false;isAdmin=false;appSessionActive=false;showScreen('verify');
  const s=document.getElementById('verify-sub');
  if(s) s.textContent=`Na ${user.email} jsme odeslali ověřovací odkaz. Klikni na něj a potom se vrať sem.`;
  renderVerificationCooldown(user);
}
async function notifyAdminOfRegistration(user,profile){
  const url=CONFIG.APPS_SCRIPT_NOTIFICATION_URL;
  if(!url) return;
  const idToken=await user.getIdToken();
  // A simple request avoids CORS preflight. The Apps Script validates the Firebase
  // token server-side before sending mail; its URL is never treated as a secret.
  await fetch(url,{method:'POST',mode:'no-cors',body:JSON.stringify({idToken,email:user.email,firstName:profile.firstName,lastName:profile.lastName,phone:profile.phone})});
}
async function requestAuthenticationAccountDeletion(targetUid){
  const url=CONFIG.APPS_SCRIPT_NOTIFICATION_URL;
  if(!url) throw new Error('Není nastavený administrační endpoint pro smazání účtu.');
  const idToken=await currentUser.getIdToken(true);
  // Apps Script cannot provide a CORS-readable response to a static GitHub Page.
  // `no-cors` still delivers the authenticated request; the script validates the
  // ID token again and deletes the Auth account with its own Google authority.
  await fetch(url,{method:'POST',mode:'no-cors',body:JSON.stringify({action:'deleteRegistration',idToken,targetUid})});
}
function splitProfileName(name){
  const parts=String(name||'').trim().split(/\s+/).filter(Boolean);
  return {firstName:parts.shift()||'',lastName:parts.join(' ')};
}
function profileParts(user,request){
  const fallback=splitProfileName(request?.name||user?.displayName||'');
  return {
    firstName:String(request?.firstName||fallback.firstName||'').trim(),
    lastName:String(request?.lastName||fallback.lastName||'').trim(),
  };
}
function accessRoleLabel(role){
  return role==='admin'?'Administrátor':role==='cashier'?'Pokladník':'Hráč';
}
function renderProfile(user=currentUser,request=accessRequest,role){
  const parts=profileParts(user,request);
  const fullName=`${parts.firstName} ${parts.lastName}`.trim()||user?.displayName||request?.name||user?.email||'Profil';
  const visibleRole=accessRoleLabel(role||((primaryAdmin()?'admin':request?.role)||'viewer'));
  const set=(id,value)=>{const el=document.getElementById(id);if(el) el.textContent=value||'—';};
  set('header-user',fullName);
  set('profile-full-name',fullName);
  set('profile-first-name',parts.firstName);
  set('profile-last-name',parts.lastName);
  set('profile-email',user?.email||request?.email);
  set('profile-phone',request?.phone);
  set('profile-role',visibleRole);
  set('profile-role-detail',visibleRole);
}
window.openProfile=function(){
  if(!currentUser) return;
  renderProfile();
  document.getElementById('profile-modal')?.classList.add('open');
};
window.closeProfile=function(){document.getElementById('profile-modal')?.classList.remove('open');};
function primaryAdmin(){ return normalizedEmail(currentUser?.email)===CONFIG.PRIMARY_ADMIN_EMAIL; }
function stopAccessListeners(){
  if(unsubAccess){unsubAccess();unsubAccess=null;}
  if(unsubUserList){unsubUserList();unsubUserList=null;}
}
async function createPendingAccessRequest(user,profile={}){
  const legacyName=typeof profile==='string'?profile:'';
  const fallback=splitProfileName(legacyName||user.displayName||'');
  const firstName=String(profile?.firstName||fallback.firstName||'').trim();
  const lastName=String(profile?.lastName||fallback.lastName||'').trim();
  const phone=String(profile?.phone||'').trim();
  const name=`${firstName} ${lastName}`.trim()||user.displayName||user.email;
  const request={uid:user.uid,email:normalizedEmail(user.email),name,status:'pending',role:'viewer',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  // A fallback listener must never erase fields already supplied by the
  // registration form while Firebase Auth is still settling the new account.
  if(firstName) request.firstName=firstName;
  if(lastName) request.lastName=lastName;
  if(phone) request.phone=phone;
  await setDoc(doc(db,'accessRequests',user.uid),request,{merge:true});
}
function startAccessListener(user){
  stopAccessListeners(); appSessionActive=false;
  const ref=doc(db,'accessRequests',user.uid);
  unsubAccess=onSnapshot(ref,async snap=>{
    if(!snap.exists()){
      try{
        if(primaryAdmin()){
          await setDoc(ref,{uid:user.uid,email:normalizedEmail(user.email),...PRIMARY_ADMIN_PROFILE,status:'approved',role:'admin',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
        }
        else {
          // This listener only starts once Firebase has confirmed the e-mail.
          // Therefore no unverified address can enter the approval queue.
          const intended=registrationIntent&&normalizedEmail(user.email)===registrationIntent.email
            ?registrationIntent:stagedRegistrationProfile(user);
          await createPendingAccessRequest(user,intended);
          clearStagedRegistrationProfile(user.uid);
          notifyAdminOfRegistration(user,intended).catch(error=>console.warn('Registration notification:',error));
        }
      }catch(error){console.error('Access request:',error);showPending(user,null);}
      return;
    }
    const request=snap.data();
    if(primaryAdmin()&&(
      request.firstName!==PRIMARY_ADMIN_PROFILE.firstName||request.lastName!==PRIMARY_ADMIN_PROFILE.lastName||
      request.phone!==PRIMARY_ADMIN_PROFILE.phone||request.name!==PRIMARY_ADMIN_PROFILE.name
    )){
      try{await setDoc(ref,{...PRIMARY_ADMIN_PROFILE,updatedAt:new Date().toISOString()},{merge:true});}
      catch(error){console.error('Primary admin profile:',error);}
      return;
    }
    accessRequest=request; applyAccessState(user,accessRequest);
  },error=>{console.error('Access state:',error);showPending(user,null);});
}
function applyAccessState(user,request){
  if(!(primaryAdmin()||request?.status==='approved')){showPending(user,request);return;}
  const role=primaryAdmin()?'admin':(request.role||'viewer');
  isAdmin=role==='admin'; isManager=isAdmin||role==='cashier';
  enterApp(user.displayName||request.name||user.email,{listen:true});
  renderProfile(user,request,role);
  if(isAdmin) startUserListListener();
}
function showPending(user,request){
  isManager=false;isAdmin=false;appSessionActive=false;stopFirestoreListener();showScreen('pending');
  const email=document.getElementById('pending-email'),stateEl=document.getElementById('pending-state');
  if(email) email.textContent=user.email||'';
  if(stateEl) stateEl.textContent=request?.status==='rejected'?'Žádost nebyla schválena. Pokud je to omyl, obrať se na správce týmu.':'Správce týmu byl o žádosti informován. Po schválení stránku znovu otevři.';
}
function startUserListListener(){
  if(unsubUserList) return;
  unsubUserList=onSnapshot(collection(db,'accessRequests'),snap=>{
    accessUsers=snap.docs.map(d=>d.data()).sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||'')));
    if(document.querySelector('.tab.active')?.dataset.tab==='users') renderUsers();
  },error=>console.error('User list:',error));
}
window.updateAccessUser=async function(uid){
  if(!isAdmin) return;
  const status=document.getElementById(`user-status-${uid}`)?.value,role=document.getElementById(`user-role-${uid}`)?.value;
  const linkedPlayerName=document.getElementById(`user-player-${uid}`)?.value||'';
  if(!status||!role) return;
  if(status==='approved'&&role==='viewer'&&!linkedPlayerName){showToast('⚠ Pro roli Hráč nejdřív přiřaď hráče ze soupisky.');return;}
  try{await setDoc(doc(db,'accessRequests',uid),{status,role,linkedPlayerName,updatedAt:new Date().toISOString(),approvedAt:status==='approved'?new Date().toISOString():null},{merge:true});showToast(status==='approved'?'Přístup schválen':'Práva uživatele uložena');}
  catch(error){console.error(error);showToast('⚠ Nepodařilo se uložit práva.');}
};
window.deleteAccessUser=async function(uid){
  if(!isAdmin||!currentUser){showToast('⚠ Smazání může provést pouze administrátor.');return;}
  const user=accessUsers.find(item=>item.uid===uid);
  if(!user){showToast('⚠ Tento uživatel už v seznamu není. Obnov stránku.');return;}
  if(normalizedEmail(user.email)===CONFIG.PRIMARY_ADMIN_EMAIL){showToast('⚠ Hlavní administrátorský účet nelze odstranit z aplikace.');return;}
  if(uid===currentUser.uid){showToast('⚠ Nemůžeš odstranit právě přihlášený účet.');return;}
  if(!confirm(`Opravdu chceš trvale odstranit účet uživatele ${user.email}?\n\nZáznam zmizí z Uživatelů, Firestore i Firebase Authentication.`)) return;
  if(!confirm(`Poslední potvrzení: smazat ${user.email} včetně možnosti přihlásit se?`)) return;
  try{
    await requestAuthenticationAccountDeletion(uid);
    await deleteDoc(doc(db,'accessRequests',uid));
    // The listener usually refreshes this immediately; remove it locally as well
    // so the card never remains visible while the next snapshot is arriving.
    accessUsers=accessUsers.filter(item=>item.uid!==uid);
    renderUsers();
    showToast('Účet byl odstraněn z Firestore; smazání přihlášení se dokončuje.');
  }catch(error){
    console.error(error);
    const detail=error?.code==='permission-denied'
      ?'Firestore smazání nepovolil. Přihlas se znovu jako administrátor.'
      :error?.code==='unavailable'
        ?'Firestore je momentálně nedostupný. Zkontroluj připojení a zkus to znovu.'
        :'Smazání se nepodařilo: '+(error?.message||'neznámá chyba');
    showToast('⚠ '+detail);
  }
};
function renderUsers(){
  const list=document.getElementById('user-list'),empty=document.getElementById('user-list-empty'); if(!list) return;
  const users=accessUsers.slice().sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||'')));
  if(empty) empty.style.display=users.length?'none':'block';
  list.innerHTML=users.map(user=>{
    const status=user.status||'pending',role=user.role||'viewer',uid=esc(user.uid),label=status==='approved'?'Schválen':status==='pending'?'Čeká na schválení':'Zamítnut';
    const suggestion=!user.linkedPlayerName?suggestedRosterPlayer(user):null;
    const linkedPlayerName=user.linkedPlayerName||suggestion?.player.name||'';
    const playerOptions=(state.players||[]).slice().sort((a,b)=>a.name.localeCompare(b.name,'cs')).map(player=>`<option value="${esc(player.name)}" ${player.name===linkedPlayerName?'selected':''}>${esc(player.name)}</option>`).join('');
    const suggestionHint=suggestion?`<small class="user-match-hint"><i class="ti ti-sparkles"></i> Doporučeno podle ${suggestion.kind==='phone'?'telefonu':'jména'} — potvrď uložením.</small>`:'';
    const created=user.createdAt?new Date(user.createdAt).toLocaleDateString('cs-CZ'):'—';
    return `<article class="user-row"><div class="user-row-main"><div class="user-avatar"><i class="ti ti-user"></i></div><div class="user-registration"><strong>${esc(user.name||'Bez jména')}</strong><div class="user-registration-details"><small><b>Jméno:</b> ${esc(user.firstName||splitProfileName(user.name).firstName||'—')}</small><small><b>Příjmení:</b> ${esc(user.lastName||splitProfileName(user.name).lastName||'—')}</small><small><b>E-mail:</b> ${esc(user.email||'—')}</small><small><b>Telefon:</b> ${esc(user.phone||'—')}</small><small><b>Žádost:</b> ${esc(created)}</small></div>${suggestionHint}</div><b class="user-status ${status}">${label}</b></div><div class="user-controls"><label>Hráč v soupisce<select id="user-player-${uid}" class="${suggestion?'suggested-player':''}"><option value="">— nepřiřazeno —</option>${playerOptions}</select></label><label>Stav<select id="user-status-${uid}"><option value="pending" ${status==='pending'?'selected':''}>Čeká</option><option value="approved" ${status==='approved'?'selected':''}>Schválen</option><option value="rejected" ${status==='rejected'?'selected':''}>Zamítnut</option></select></label><label>Práva<select id="user-role-${uid}"><option value="viewer" ${role==='viewer'?'selected':''}>Hráč</option><option value="cashier" ${role==='cashier'?'selected':''}>Pokladník</option><option value="admin" ${role==='admin'?'selected':''}>Administrátor</option></select></label><button class="btn btn-primary" type="button" onclick="updateAccessUser('${uid}')"><i class="ti ti-device-floppy"></i> Uložit</button><button class="btn-icon danger user-delete" type="button" onclick="deleteAccessUser('${uid}')" title="Trvale odstranit uživatele" aria-label="Trvale odstranit uživatele"><i class="ti ti-trash"></i></button></div></article>`;
  }).join('');
}

function initSeasonPicker(){
  const current=seasonForDate();
  activeSeason=current;
  const y=currentYear();
  const ys=document.getElementById('season-year');
  if(!ys) return;
  ys.innerHTML='';
  for(let yr=y+1;yr>=2025;yr--){
    const o=document.createElement('option');
    o.value=yr; o.textContent=`${yr}/${String(yr+1).slice(-2)}`; if(yr===activeSeason.year) o.selected=true;
    ys.appendChild(o);
  }
  updateSeasonLabel();
}
function updateSeasonLabel(){
  const el=document.getElementById('season-label'); if(el&&activeSeason) el.textContent=seasonLabel(activeSeason);
}
window.changeSeason=function(){
  if(!isManager) return;
  activeSeason={year:parseInt(document.getElementById('season-year').value)};
  updateSeasonLabel(); renderDashboard(); renderLog(); renderSummary(); renderRates();
  showToast('Zobrazuji: '+seasonLabel(activeSeason));
};
window.resetSeasonToToday=function(){
  if(!isManager) return;
  activeSeason=seasonForDate();
  document.getElementById('season-year').value=String(activeSeason.year);
  updateSeasonLabel(); renderDashboard(); renderLog(); renderSummary(); renderRates();
  showToast('Nastaveno na aktuální sezónu: '+seasonLabel(activeSeason));
};

// ─── FIRESTORE ────────────────────────────────────────────────────
function startFirestoreListener(){
  if(unsubFirestore) return;
  let firstLoad=true;
  unsubFirestore=onSnapshot(doc(db,CONFIG.FIRESTORE_DOC),snap=>{
    if(snap.exists()){state=snap.data();state.players=state.players||[];state.fines=state.fines||[];}
    else state={players:[],fines:[]};
    // The 2026/27 upload deliberately starts with a clean fines ledger and
    // catalogue. This runs once, only for the primary admin, and is recorded
    // in Firestore so every other device simply receives the imported data.
    if(primaryAdmin()&&state.catalogImports?.['2026/27']?.id!==RATE_CATALOG_2026_27.id&&!catalogMigrationPending){
      catalogMigrationPending=true;
      importRateCatalog(RATE_CATALOG_2026_27,{reset:true});
      saveState().then(saved=>{if(saved) showToast('Sazebník 2026/27 byl nahrán – začínáme s čistým štítem.');})
        .finally(()=>{catalogMigrationPending=false;});
      return;
    }
    if(primaryAdmin()&&state.oneTimeImports?.bozkov2026?.id!==ONE_TIME_FINE_IMPORT_BOZKOV_2026.id&&!oneTimeImportShown){
      oneTimeImportShown=true;
      const prepared=prepareOneTimeFineImport(ONE_TIME_FINE_IMPORT_BOZKOV_2026);
      buildOneTimeFineReview(ONE_TIME_FINE_IMPORT_BOZKOV_2026,prepared);
    }
    const t=document.querySelector('.tab.active')?.dataset.tab;
    if(t==='add'){ renderDashboard(); renderRecentPlayers(); renderReasonOptions(); }
    if(t==='log') renderLog();
    if(t==='summary') renderSummary();
    if(t==='rates') renderRates();
    if(t==='players') renderPlayers();
    populatePlayerSelects();
    if(firstLoad){ firstLoad=false; checkEmailPlayerMatch(); }
  });
}
function stopFirestoreListener(){ if(unsubFirestore){unsubFirestore();unsubFirestore=null;} }
async function saveState(){
  if((!isManager&&!phoneUser)||(!currentUser&&!phoneUser)) return false;
  try{await setDoc(doc(db,CONFIG.FIRESTORE_DOC),state);return true;}
  catch(e){
    console.error(e);
    const message=e?.code==='permission-denied'
      ?'Nemáš oprávnění data uložit. Zkontroluj prosím roli Pokladník nebo Admin.'
      :e?.code==='invalid-argument'
        ?'Záznam obsahuje neplatnou hodnotu. Obnov stránku a zkus uložení znovu.'
        :'Nepodařilo se uložit data. Zkus to prosím znovu.';
    showToast(`⚠ ${message}`);return false;
  }
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

// ─── ACCESS UI ─────────────────────────────────────────────────────
function updateLockUI(){
  const sc=document.getElementById('season-controls');
  const mw=document.getElementById('manager-wall'),mw2=document.getElementById('manager-wall2');
  const af=document.getElementById('add-form'),pf=document.getElementById('players-form');
  const usersTab=document.querySelector('.tab[data-tab="users"]');
  const rateAdd=document.querySelector('.rate-add-row');
  if(usersTab) usersTab.style.display=isAdmin?'':'none';
  if(rateAdd) rateAdd.style.display=isManager?'grid':'none';
  if(isManager){
    if(sc) sc.style.display='flex';
    if(mw) mw.style.display='none'; if(mw2) mw2.style.display='none';
    if(af) af.style.display='block'; if(pf) pf.style.display='block';
    populatePlayerSelects(); renderPlayers(); renderReasonOptions();
  }else{
    if(sc) sc.style.display='none';
    if(mw) mw.style.display='block'; if(mw2) mw2.style.display='block';
    if(af) af.style.display='none'; if(pf) pf.style.display='none';
  }
  if(phoneUser){if(mw)mw.style.display='none'; updatePhoneUserUI();}
}

// ─── TABS ─────────────────────────────────────────────────────────
window.switchTab=function(t){
  if(t==='users'&&!isAdmin){showToast('Tato sekce je jen pro administrátory.');return;}
  document.querySelectorAll('.tab').forEach(el=>el.classList.toggle('active',el.dataset.tab===t));
  document.querySelectorAll('.panel').forEach(el=>el.classList.remove('active'));
  document.getElementById('panel-'+t).classList.add('active');
  if(t==='add'){ renderDashboard(); renderRecentPlayers(); renderReasonOptions(); }
  if(t==='log'){selectedFineIndices.clear();renderLog();}
  if(t==='summary') renderSummary();
  if(t==='rates') renderRates();
  if(t==='players') renderPlayers();
  if(t==='users') renderUsers();
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
  const match=resolveVoicePlayer(raw,state.players||[]);
  return (match.status==='exact'||match.status==='fuzzy')?match.player:null;
}

// ─── REASONS (3 categories, each with price) – Fix #6 ─────────────
// structure: { label, price, cat: 'yellow'|'orange'|'red' }
const DEFAULT_REASON_LIST = [
  {label:'Pozdní příchod',    price:50,  cat:'yellow'},
  {label:'Housle',            price:50,  cat:'yellow'},
  {label:'Bago',              price:100, cat:'yellow'},
  {label:'Překopnutá branka', price:100, cat:'orange'},
  {label:'Píčovina',          price:200, cat:'orange'},
  {label:'Červená karta',     price:500, cat:'red'},
];
// Each offence has a price history.  Legacy season lists are read as history so
// existing installations keep their prices without a data migration.
const CATALOG_START='2025-07-01';
const CATALOG_MIN_DATE='2025-07-01';
function legacyRateStart(value){
  const text=String(value||'');
  const year=Number(text.match(/(\d{4})/)?.[1])||2025;
  if(text.includes('Jaro')) return `${year}-01-01`;
  return `${year}-07-01`;
}
function seasonStartDate(season){ return `${season.year}-07-01`; }
function seasonEndDate(season){ return `${season.year+1}-06-30`; }
function seasonReferenceDate(season){
  const today=new Date().toISOString().slice(0,10),start=seasonStartDate(season),end=seasonEndDate(season);
  return today<start?start:today>end?end:today;
}
function getRateHistory(){
  const history={};
  const add=(label,price,from,to='')=>{
    if(!label||!Number.isFinite(Number(price))) return;
    const key=from||CATALOG_START;
    if(key<CATALOG_MIN_DATE) return;
    if(!history[label]) history[label]=[];
    const entry=history[label].find(x=>x.from===key);
    if(entry){ entry.price=Number(price); entry.to=to||''; } else history[label].push({from:key,to:to||'',price:Number(price)});
  };
  const base=Array.isArray(state.reasonList)
    ?state.reasonList
    :(state.catalogImports?[]:DEFAULT_REASON_LIST);
  base.forEach(r=>add(r.label,r.price,CATALOG_START));
  Object.entries(state.reasonLists||{}).forEach(([key,list])=>{
    (list||[]).forEach(r=>add(r.label,r.price,legacyRateStart(key)));
  });
  Object.entries(state.rateHistory||{}).forEach(([label,items])=>{
    (items||[]).forEach(item=>add(label,item.price,item.from||legacyRateStart(item.season),item.to));
  });
  Object.entries(history).forEach(([label,items])=>{
    const removed=new Set(state.deletedRatePeriods?.[label]||[]);
    history[label]=items.filter(item=>!removed.has(item.from)).sort((a,b)=>a.from.localeCompare(b.from));
  });
  return history;
}
function calculatedRateEnd(items,index){
  const item=items[index],next=items[index+1]?.from;
  if(item.to) return item.to;
  return next?new Date(new Date(`${next}T12:00:00`).getTime()-86400000).toISOString().slice(0,10):null;
}
function rateAtDate(label,date=seasonReferenceDate(activeSeason||seasonForDate())){
  const target=typeof date==='string'?date:new Date(date).toISOString().slice(0,10);
  const items=getRateHistory()[label]||[];
  return items.filter((item,index)=>item.from<=target&&(!calculatedRateEnd(items,index)||calculatedRateEnd(items,index)>=target)).at(-1)||null;
}
function normaliseReasonTag(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function tagsForReason(label){return (state.reasonTags?.[label]||[]).filter(Boolean);}
function getReasonList(season=activeSeason||seasonForDate()){
  return Object.entries(getRateHistory()).map(([label,items])=>{
    const start=seasonStartDate(season),end=seasonEndDate(season);
    const overlapping=items.filter((item,index)=>item.from<=end&&(!calculatedRateEnd(items,index)||calculatedRateEnd(items,index)>=start));
    const rate=rateAtDate(label,seasonReferenceDate(season));
    if(!rate&&!overlapping.length) return null;
    const prices=overlapping.map(item=>item.price);
    return {label,tags:tagsForReason(label),price:rate?.price??overlapping.at(-1).price,minPrice:Math.min(...prices),maxPrice:Math.max(...prices)};
  }).filter(Boolean);
}
function getReasons(){ return getReasonList().map(r=>r.label); }
function reasonPrice(label,season=activeSeason||seasonForDate(),atDate=null){
  const date=atDate||seasonReferenceDate(season);
  return rateAtDate(label,date)?.price??null;
}
async function saveRatePeriod(label,price,from,to=''){
  if(!isManager){showToast('Nemáš právo upravovat sazebník.');return false;}
  if(!state.rateHistory) state.rateHistory={};
  if(state.deletedRatePeriods?.[label]) state.deletedRatePeriods[label]=state.deletedRatePeriods[label].filter(date=>date!==from);
  if(!state.rateHistory[label]) state.rateHistory[label]=[];
  const items=state.rateHistory[label];
  const existing=items.find(item=>(item.from||legacyRateStart(item.season))===from);
  if(existing){ existing.price=Number(price); existing.from=from; existing.to=to||''; delete existing.season; }
  else items.push({from,to:to||'',price:Number(price)});
  items.sort((a,b)=>(a.from||legacyRateStart(a.season)).localeCompare(b.from||legacyRateStart(b.season)));
  await saveState(); return true;
}

// ─── PARSE (flexible: dashes optional, reason optional, auto-price) ─
// Supports: "Michal - Bago - 30" / "Michal Bago 30" / "Michal 30" / "Erik 50"
// Fix #4: reason is optional — "Erik 70" is valid → reason = '' (empty)
// Fix #5: voice delimiters "a" / "další" / comma separate players
function parseChunk(chunk){
  chunk=String(chunk).replace(/\s*(?:k\u010d|kc|korun|koruny|koruna|czk)\s*$/iu,'');
  // Normalise dashes, strip trailing kč/czk
  const s=chunk.replace(/[–—]/g,'-').replace(/\s*(kč|czk)\s*$/i,'').trim();
  if(!s) return null;

  // 1) Dash-separated: Name - Reason - Amount  OR  Name - Amount
  if(s.includes('-')){
    const parts=s.split('-').map(x=>x.trim()).filter(Boolean);
    if(parts.length>=2){
      const rawName=parts[0];
      const lastAmt=parseFloat(parts[parts.length-1].replace(/\s/g,''));
      if(!isNaN(lastAmt)&&lastAmt>0){
        const reason=parts.length>=3?parts.slice(1,-1).join(' – '):'';
        if(rawName) return{rawName,reason,amount:lastAmt};
      }
      const reason=parts.slice(1).join(' – ');
      const catalogAmount=reasonPrice(reason);
      if(rawName&&catalogAmount!=null) return{rawName,reason,amount:catalogAmount};
    }
  }

  // 2) Space-separated: extract trailing number
  const tokens=s.split(/\s+/);
  if(tokens.length<2) return null;
  const lastToken=tokens[tokens.length-1];
  const amount=parseFloat(lastToken.replace(/[^\d.]/g,''));
  if(isNaN(amount)||amount<=0) return null;
  const withoutAmt=tokens.slice(0,-1).join(' ').trim();
  if(!withoutAmt) return null;

  // Try to match longest known player name/nickname as prefix
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
  if(bestMatch){
    const reason=withoutAmt.slice(bestLen).trim();
    // Auto-fill price from reason list if no explicit amount given via reason match
    return{rawName:bestMatch,reason,amount};
  }

  // Fix #4: if only 2 tokens and last is number → Name + Amount (no reason)
  if(tokens.length===2){
    return{rawName:tokens[0],reason:'',amount};
  }

  // Last fallback: first word = name, rest = reason
  return{rawName:tokens[0],reason:tokens.slice(1,-1).join(' '),amount};
}

// Fix #5: voice split – handle comma, semicolon, newline AND spoken "a"/"další"/"a pak" as entry delimiter
function splitTranscript(t){
  // Replace spoken delimiters between entries
  // "Erik 50 a Pepa 60" → "Erik 50, Pepa 60"
  // "Erik 50 další Pepa 60" → "Erik 50, Pepa 60"
  // "Erik 50, a Pepa 60" → "Erik 50, Pepa 60"
  let s = t
    // Remove "a pak", "a taky", "a ještě" connectors
    .replace(/\s+a\s+(pak|taky|ještě|také)\s+/gi, ', ')
    // ", a" or ", další" → just ","
    .replace(/,\s*(a|další|potom|pak)\s+/gi, ', ')
    // " další " standalone → ","
    .replace(/\s+další\s+/gi, ', ')
    // " a Capitalised" — "a" between entries where next word starts with capital or is a known player first token
    // This replaces " a " when followed by a word that looks like a name (capital or known)
    .replace(/\s+a\s+([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]*)/g, ', $1');

  return s.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
}

// Auto-fill price from reason list when a reason tile is selected or matched in voice
function autoFillPrice(reason){
  if(!reason) return;
  const price=reasonPrice(reason);
  if(price!=null){
    const amtEl=document.getElementById('f-amount');
    if(amtEl) amtEl.value=price;
  }
}

// ─── QUICK TEXT ───────────────────────────────────────────────────
window.parseQuick=function(val){
  const p=document.getElementById('parse-preview'),parsed=parseChunk(val);
  if(parsed){
    const resolved=resolvePlayerName(parsed.rawName),label=resolved||parsed.rawName;
    const priceTag=parsed.reason?reasonPrice(parsed.reason):null;
    p.innerHTML=`<strong>${esc(label)}</strong>`
      +(resolved&&resolved.toLowerCase()!==parsed.rawName.toLowerCase()?` <span class="badge badge-alias">≡ ${esc(parsed.rawName)}</span>`:'')
      +(!resolved?` <span class="badge badge-new">Nový hráč</span>`:'')
      +(parsed.reason?` &nbsp;·&nbsp; ${esc(parsed.reason)}`:'')
      +` &nbsp;·&nbsp; <strong>${parsed.amount} ${CONFIG.CURRENCY}</strong>`
      +(priceTag&&priceTag!==parsed.amount?` <span class="badge badge-alias">katalog: ${priceTag}</span>`:'');
  }else{p.innerHTML=`Příklady: <strong>Erik 50</strong> &nbsp;·&nbsp; <strong>Michal Bago 30</strong> &nbsp;·&nbsp; <strong>Jirka – Červená karta – 500</strong>`;}
};
window.submitQuick=function(){
  const val=document.getElementById('quick-input').value.trim();
  const parsed=parseChunk(val);
  if(!parsed){alert('Zadej alespoň: Jméno Částka');return;}
  // Auto-price from reason if amount not in input but reason matches
  let amount=parsed.amount;
  if(!amount&&parsed.reason){const p=reasonPrice(parsed.reason);if(p)amount=p;}
  if(!amount){alert('Nepodařilo se určit částku.');return;}
  const resolved=resolvePlayerName(parsed.rawName)||parsed.rawName;
  ensurePlayer(resolved); addFine(resolved,parsed.reason||UNKNOWN_REASON,amount);
  document.getElementById('quick-input').value='';
  document.getElementById('parse-preview').innerHTML=`Příklady: <strong>Erik 50</strong> &nbsp;·&nbsp; <strong>Michal Bago 30</strong>`;
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

// ─── REASON TILES – 3 categories (Fix #6) ────────────────────────
/* Legacy colour/category editor retired in favour of the rate card.
const CAT_META={
  yellow:{label:'Žlutá',   cls:'tile-yellow'},
  orange:{label:'Oranžová',cls:'tile-orange'},
  red:   {label:'Červená', cls:'tile-red'},
};
function reasonCategory(reason,list){
  if(reason.cat) return reason.cat;
  const prices=list.map(r=>Number(r.price)||0),min=Math.min(...prices),max=Math.max(...prices);
  const ratio=max===min?.5:(Number(reason.price)-min)/(max-min);
  return ratio<.34?'yellow':ratio<.67?'orange':'red';
}

function renderReasonTiles(){
  const selected=document.getElementById('f-reason')?.value||'';
  const list=getReasonList();
  const managerRow=document.getElementById('reason-manage-row');
  if(managerRow) managerRow.style.display=isManager?'block':'none';

  ['yellow','orange','red'].forEach(cat=>{
    const row=document.getElementById('reason-tiles-'+cat); if(!row) return;
    const items=list.filter(r=>reasonCategory(r,list)===cat);
    if(!items.length){row.innerHTML='<span style="font-size:12px;color:var(--tx-m);">—</span>';return;}
    row.innerHTML=items.map((r,localI)=>{
      const globalI=list.indexOf(r);
      const isSel=r.label===selected;
      return`<div class="tile tile-reason ${CAT_META[cat].cls}${isSel?' selected':''}"
        onclick="selectReason('${esc(r.label)}',${r.price})" title="${r.price} CZK">
        ${esc(r.label)}<span class="tile-price">${r.price}</span>
        ${isManager?`<span class="tile-del" onclick="event.stopPropagation();deleteReason(${globalI})" title="Smazat">✕</span>`:''}
      </div>`;
    }).join('');
  });
}

window.selectReason=function(label,price){
  const inp=document.getElementById('f-reason'); if(inp) inp.value=label;
  // Auto-fill amount if field is empty
  if(price!=null){
    const amtEl=document.getElementById('f-amount');
    if(amtEl&&!amtEl.value) amtEl.value=price;
  }
  renderReasonTiles();
};

window.addReason=async function(){
  const labelEl=document.getElementById('new-reason-input');
  const priceEl=document.getElementById('new-reason-price');
  const catEl  =document.getElementById('new-reason-cat');
  if(!labelEl) return;
  const label=labelEl.value.trim();
  const price=parseInt(priceEl?.value||'0')||0;
  const cat  =catEl?.value||'red';
  if(!label){showToast('Zadej název důvodu.');return;}
  const list=getReasonList();
  if(list.find(r=>r.label.toLowerCase()===label.toLowerCase())){showToast('Důvod již existuje.');return;}
  list.push({label,price,cat});
  await saveReasonList(list);
  labelEl.value=''; if(priceEl) priceEl.value='';
  renderReasonTiles();
  showToast(`Důvod „${label}" přidán ✓`);
};

window.deleteReason=async function(i){
  const list=getReasonList(); list.splice(i,1);
  await saveReasonList(list); renderReasonTiles();
};
*/

function renderReasonOptions(){
  const options=document.getElementById('reason-options'); if(!options) return;
  options.innerHTML=getReasonList().sort((a,b)=>a.label.localeCompare(b.label,'cs'))
    .map(r=>`<option value="${esc(r.label)}">${r.price} ${CONFIG.CURRENCY}</option>`).join('');
}

// ── RATE CARD ───────────────────────────────────────────────────────────────
/* Previous one-season rate card implementation.
function rateColor(price,list){
  const values=list.map(r=>Number(r.price)||0);
  const min=Math.min(...values),max=Math.max(...values);
  const ratio=max===min?.5:(Number(price)-min)/(max-min);
  return `hsl(${Math.round(48*(1-ratio))} 88% ${44+Math.round((1-ratio)*7)}%)`;
}
function renderRates(){
  const label=document.getElementById('rate-season-label'); if(label) label.textContent=seasonLabel(activeSeason);
  const rateAdd=document.querySelector('.rate-add-row'); if(rateAdd) rateAdd.style.display=isManager?'grid':'none';
  const list=getReasonList();
  const search=(document.getElementById('rate-search')?.value||'').trim().toLowerCase();
  const sort=document.getElementById('rate-sort')?.value||'price';
  const rows=list.filter(r=>r.label.toLowerCase().includes(search)).slice().sort((a,b)=>sort==='name'?a.label.localeCompare(b.label,'cs'):Number(a.price)-Number(b.price)||a.label.localeCompare(b.label,'cs'));
  const el=document.getElementById('rate-list'),empty=document.getElementById('rate-empty'); if(!el||!empty)return;
  empty.style.display=rows.length?'none':'block';
  el.innerHTML=rows.map(r=>{
    const originalIndex=list.indexOf(r),color=rateColor(r.price,list);
    return `<div class="rate-row"><span class="rate-dot" style="--rate-color:${color}" title="Cena ${r.price} CZK"></span><span class="rate-name">${esc(r.label)}</span><strong class="rate-price">${Number(r.price).toLocaleString('cs-CZ')} ${CONFIG.CURRENCY}</strong><button class="btn-icon danger" title="Smazat prohřešek" onclick="deleteRate(${originalIndex})"><i class="ti ti-trash"></i></button></div>`;
  }).join('');
}
window.renderRates=renderRates;
window.addRate=async function(){
  const nameEl=document.getElementById('rate-name'),priceEl=document.getElementById('rate-price'),err=document.getElementById('rate-error');
  const label=nameEl.value.trim(),price=Number(priceEl.value);
  err.style.display='none';
  if(!label||!Number.isFinite(price)||price<=0){err.textContent='Zadej název prohřešku a cenu vyšší než 0.';err.style.display='block';return;}
  const list=getReasonList();
  if(list.some(r=>r.label.toLowerCase()===label.toLowerCase())){err.textContent='Tento prohřešek už v sazebníku je.';err.style.display='block';return;}
  list.push({label,price});await saveReasonList(list);nameEl.value='';priceEl.value='';renderRates();renderReasonTiles();showToast(`Sazba „${label}“ přidána`);
};
window.deleteRate=async function(index){
  const list=getReasonList(),item=list[index];if(!item)return;
  if(!confirm(`Smazat prohřešek „${item.label}“ ze sazebníku ${seasonLabel(activeSeason)}?`))return;
  list.splice(index,1);await saveReasonList(list);renderRates();renderReasonTiles();
};
*/

function rateColor(price,list){
  const values=list.map(r=>Number(r.price)||0),min=Math.min(...values),max=Math.max(...values);
  const ratio=max===min?.5:(Number(price)-min)/(max-min);
  return `hsl(${Math.round(48*(1-ratio))} 88% ${44+Math.round((1-ratio)*7)}%)`;
}
function timelineForRate(label){ return (getRateHistory()[label]||[]).slice().sort((a,b)=>a.from.localeCompare(b.from)); }
function todayLocalISO(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function renderRates(){
  const label=document.getElementById('rate-season-label'); if(label) label.textContent=seasonLabel(activeSeason);
  const rateAdd=document.querySelector('.rate-add-row'); if(rateAdd) rateAdd.style.display=isManager?'grid':'none';
  const list=getReasonList(),search=(document.getElementById('rate-search')?.value||'').trim().toLowerCase();
  const sort=document.getElementById('rate-sort')?.value||'price';
  const rows=list.filter(r=>r.label.toLowerCase().includes(search)).slice().sort((a,b)=>sort==='name'?a.label.localeCompare(b.label,'cs'):Number(a.price)-Number(b.price)||a.label.localeCompare(b.label,'cs'));
  const el=document.getElementById('rate-list'),empty=document.getElementById('rate-empty'); if(!el||!empty)return;
  empty.style.display=rows.length?'none':'block';
  el.innerHTML=rows.map(r=>{
    const color=rateColor(r.price,list);
    const display=r.minPrice!==r.maxPrice?`${Number(r.minPrice).toLocaleString('cs-CZ')}–${Number(r.maxPrice).toLocaleString('cs-CZ')} ${CONFIG.CURRENCY}`:`${Number(r.price).toLocaleString('cs-CZ')} ${CONFIG.CURRENCY}`;
    return `<button type="button" class="rate-row rate-row-open" onclick="openRateHistory(${JSON.stringify(r.label).replace(/\"/g,'&quot;')})" aria-label="Zobrazit historii sazby ${esc(r.label)}"><span class="rate-dot" style="--rate-color:${color}"></span><span class="rate-name">${esc(r.label)}</span><strong class="rate-price">${display}</strong><i class="ti ti-chevron-right"></i></button>`;
  }).join('');
  renderReasonOptions();
}
window.renderRates=renderRates;
window.addRate=async function(){
  const nameEl=document.getElementById('rate-name'),priceEl=document.getElementById('rate-price'),err=document.getElementById('rate-error');
  const label=nameEl.value.trim(),price=Number(priceEl.value);
  err.style.display='none';
  if(!label||!Number.isFinite(price)||price<=0){err.textContent='Zadej název prohřešku a cenu vyšší než 0.';err.style.display='block';return;}
  if(!isManager)return;
  await saveRatePeriod(label,price,seasonStartDate(activeSeason));
  nameEl.value='';priceEl.value='';renderRates();showToast(`Sazba „${label}“ platná od začátku ${seasonLabel(activeSeason)} uložena`);
};
window.openRateHistory=function(label){
  const items=timelineForRate(label),title=document.getElementById('rate-history-title');
  const chart=document.getElementById('rate-history-chart'),list=document.getElementById('rate-history-list');
  if(!items.length||!title||!chart||!list)return;
  title.textContent=`Vývoj sazby: ${label}`;
  const max=Math.max(...items.map(i=>i.price),1);
  chart.innerHTML=items.map(item=>`<div class="rate-chart-point"><span class="rate-chart-value">${item.price}</span><span class="rate-chart-bar" style="height:${Math.max(12,Math.round(item.price/max*100))}%"></span><span class="rate-chart-label">${item.from.split('-').reverse().join('. ')}</span></div>`).join('');
  list.innerHTML=items.map((item,index)=>{
    const end=calculatedRateEnd(items,index),until=end?`do ${new Date(`${end}T12:00:00`).toLocaleDateString('cs-CZ')}`:'dosud';
    const today=todayLocalISO(),active=item.from<=today&&(!end||end>=today);
    return `<button type="button" class="rate-history-item" onclick="editRatePeriod('${item.from}',${item.price},'${item.to||''}')"><div><strong>${Number(item.price).toLocaleString('cs-CZ')} ${CONFIG.CURRENCY}</strong><span>Platí od ${new Date(`${item.from}T12:00:00`).toLocaleDateString('cs-CZ')}, ${until}</span></div><i class="ti ti-pencil"></i></button>`;
  }).join('');
  list.querySelectorAll('.rate-history-item').forEach((button,index)=>{
    const end=calculatedRateEnd(items,index),today=todayLocalISO();
    if(items[index].from<=today&&(!end||end>=today)){
      button.classList.add('is-current');
      button.insertAdjacentHTML('beforeend','<em>Aktuální</em>');
    }
  });
  document.querySelector('#rate-history-modal .rate-period-editor').style.display=isManager?'grid':'none';
  const tagsEditor=document.getElementById('rate-tags-editor');
  if(tagsEditor) tagsEditor.style.display=isManager?'block':'none';
  document.getElementById('rate-period-date').value=todayLocalISO();
  document.getElementById('rate-period-end').value='';
  document.getElementById('rate-period-price').value='';
  document.getElementById('rate-period-editor-title').textContent='Přidat sazbu v období';
  document.getElementById('rate-period-delete').style.display='none';
  document.getElementById('rate-history-modal').dataset.label=label;
  renderRateTags(label);
  delete document.getElementById('rate-history-modal').dataset.editFrom;
  document.getElementById('rate-history-modal').classList.add('open');
};
function renderRateTags(label){
  const chips=document.getElementById('rate-tag-chips'),input=document.getElementById('rate-tag-input'),error=document.getElementById('rate-tag-error');
  if(!chips) return;
  const tags=tagsForReason(label);
  chips.innerHTML=tags.length?tags.map(tag=>`<span class="rate-tag-chip">${esc(tag)}<button type="button" aria-label="Odstranit tag ${esc(tag)}" onclick="removeRateTag(${JSON.stringify(tag).replace(/"/g,'&quot;')})"><i class="ti ti-x"></i></button></span>`).join(''):'<span class="label-hint">Zatím bez tagů.</span>';
  if(input) input.value='';
  if(error) error.style.display='none';
}
function rateTagConflict(tag,label){
  const key=normaliseReasonTag(tag);
  if(!key) return 'Zadej tag.';
  const labels=Object.keys(getRateHistory());
  for(const otherLabel of labels){
    if(normaliseReasonTag(otherLabel)===key) return 'Tag se shoduje s názvem položky sazebníku.';
    for(const otherTag of tagsForReason(otherLabel)){
      if(normaliseReasonTag(otherTag)===key) return otherLabel===label?'Tento tag už tato položka má.':'Tento tag už používá jiná položka sazebníku.';
    }
  }
  return '';
}
window.addRateTag=async function(){
  if(!isManager) return;
  const modal=document.getElementById('rate-history-modal'),label=modal.dataset.label,input=document.getElementById('rate-tag-input'),error=document.getElementById('rate-tag-error');
  const tag=input?.value.trim()||'',problem=rateTagConflict(tag,label);
  if(problem){error.textContent=problem;error.style.display='block';return;}
  state.reasonTags=state.reasonTags||{};
  state.reasonTags[label]=[...tagsForReason(label),tag];
  const saved=await saveState();if(saved){renderRateTags(label);showToast(`Tag „${tag}“ přidán`);}
};
window.removeRateTag=async function(tag){
  if(!isManager) return;
  const label=document.getElementById('rate-history-modal').dataset.label;
  state.reasonTags[label]=tagsForReason(label).filter(item=>item!==tag);
  if(!state.reasonTags[label].length) delete state.reasonTags[label];
  const saved=await saveState();if(saved){renderRateTags(label);showToast('Tag odebrán');}
};
window.editRatePeriod=function(from,price,to=''){
  if(!isManager)return;
  document.getElementById('rate-period-date').value=from;document.getElementById('rate-period-end').value=to;document.getElementById('rate-period-price').value=price;
  document.getElementById('rate-period-editor-title').textContent='Upravit vybrané období';
  document.getElementById('rate-period-delete').style.display='inline-flex';
  document.getElementById('rate-history-modal').dataset.editFrom=from;
  document.getElementById('rate-period-price').focus();
};
window.saveRatePeriod=async function(){
  if(!isManager)return;
  const modal=document.getElementById('rate-history-modal'),label=modal.dataset.label;
  const from=document.getElementById('rate-period-date').value,to=document.getElementById('rate-period-end').value,price=Number(document.getElementById('rate-period-price').value);
  if(!label||!from||from<CATALOG_MIN_DATE||!Number.isFinite(price)||price<=0||to&&to<from){showToast('Zadej datum od 1. 7. 2025, správné datum do a cenu vyšší než 0.');return;}
  const original=modal.dataset.editFrom;
  if(original&&original!==from){const items=state.rateHistory?.[label]||[];const entry=items.find(item=>(item.from||legacyRateStart(item.season))===original);if(entry) entry.from=from;}
  await saveRatePeriod(label,price,from,to);renderRates();openRateHistory(label);showToast('Sazba pro zvolené období uložena');
};
window.deleteRatePeriod=async function(){
  if(!isManager)return;
  const modal=document.getElementById('rate-history-modal'),label=modal.dataset.label,from=modal.dataset.editFrom;
  if(!label||!from){showToast('Nejdřív klepni na období, které chceš smazat.');return;}
  if(!confirm('Opravdu smazat celé vybrané období sazby?'))return;
  if(!state.rateHistory) state.rateHistory={};
  const items=state.rateHistory?.[label]||[];
  state.rateHistory[label]=items.filter(item=>(item.from||legacyRateStart(item.season))!==from);
  if(!state.rateHistory[label].length)delete state.rateHistory[label];
  if(!state.deletedRatePeriods)state.deletedRatePeriods={};
  if(!state.deletedRatePeriods[label])state.deletedRatePeriods[label]=[];
  if(!state.deletedRatePeriods[label].includes(from))state.deletedRatePeriods[label].push(from);
  await saveState();renderRates();openRateHistory(label);showToast('Období sazby smazáno');
};
window.closeRateHistory=function(){document.getElementById('rate-history-modal').classList.remove('open');};

// ─── REASON AUTOCOMPLETE (Fix #3) ─────────────────────────────────
let acReasonIndex=-1, acReasonFiltered=[];
window.hideReasonAutocomplete=function(){
  const list=document.getElementById('reason-ac-list');
  if(list) list.style.display='none';
};
window.reasonAutocomplete=function(val){
  const list=document.getElementById('reason-ac-list');
  const norm=val.trim().toLowerCase();
  const all=getReasonList();
  acReasonFiltered=all.filter(r=>!norm||r.label.toLowerCase().includes(norm)||(r.tags||[]).some(tag=>tag.toLowerCase().includes(norm)));
  if(!acReasonFiltered.length){if(list)list.style.display='none';return;}
  acReasonIndex=-1;
  if(list){
    const catColor={yellow:'#b45309',orange:'#c2410c',red:'#b91c1c'};
    list.innerHTML=acReasonFiltered.map((r,i)=>`
      <div class="ac-item" onclick="selectReasonAC('${esc(r.label)}',${r.price})" data-i="${i}">
        ${esc(r.label)}
        <span class="ac-sub" style="color:${catColor[r.cat]||'var(--tx-m)'};">${r.price} CZK</span>
      </div>`).join('');
    list.style.display='block';
  }
};
window.reasonAutocompleteKey=function(e){
  const list=document.getElementById('reason-ac-list'); if(!list) return;
  const items=list.querySelectorAll('.ac-item');
  if(e.key==='ArrowDown'){acReasonIndex=Math.min(acReasonIndex+1,items.length-1);items.forEach((el,i)=>el.classList.toggle('active',i===acReasonIndex));e.preventDefault();}
  else if(e.key==='ArrowUp'){acReasonIndex=Math.max(acReasonIndex-1,0);items.forEach((el,i)=>el.classList.toggle('active',i===acReasonIndex));e.preventDefault();}
  else if(e.key==='Enter'&&acReasonIndex>=0&&acReasonFiltered[acReasonIndex]){
    const r=acReasonFiltered[acReasonIndex];
    selectReasonAC(r.label,r.price);e.preventDefault();
  }else if(e.key==='Escape'){list.style.display='none';}
};
window.selectReasonAC=function(label,price){
  const inp=document.getElementById('f-reason'); if(inp) inp.value=label;
  const list=document.getElementById('reason-ac-list'); if(list) list.style.display='none';
  // Auto-fill price
  if(price!=null){
    const amtEl=document.getElementById('f-amount');
    if(amtEl) amtEl.value=price;
  }
};
window.submitManual=function(){
  const player=document.getElementById('f-player').value;
  const reason=document.getElementById('f-reason').value.trim()||UNKNOWN_REASON;
  const amt=reasonPrice(reason)??Number(document.getElementById('f-amount').value);
  if(!player){alert('Vyber hráče.');return;}
  if(!reason||amt==null){alert('Vyber prohřešek z platného sazebníku.');return;}
  addFine(player,reason||UNKNOWN_REASON,amt);
  document.getElementById('f-player-text').value='';
  document.getElementById('f-player').value='';
  document.getElementById('f-reason').value='';
  document.getElementById('f-amount').value='';
  renderReasonOptions(); renderRecentPlayers();
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
function isBraveBrowser(){return !!navigator.brave||/Brave\//i.test(navigator.userAgent);}
function voiceNetworkMessage(){
  return isBraveBrowser()
    ?'Brave neposkytuje spolehlivě službu rozpoznávání řeči, i když je mikrofon povolený. Pro hlasové zadávání na PC otevři aplikaci v aktuálním Chrome nebo Edge.'
    :'Rozpoznávání řeči potřebuje internetové připojení. Zkontroluj síť a zkus to znovu.';
}
window.toggleVoiceSession=function(){voiceActive?stopVoiceSession():startVoiceSession();};
function startVoiceSession(){
  if(!('webkitSpeechRecognition'in window||'SpeechRecognition'in window)){
    showVoiceProblem('Tento prohlížeč nepodporuje diktování. Otevři aplikaci v aktuálním Chrome nebo Edge a povol mikrofon.');return;
  }
  if(!window.isSecureContext){
    showVoiceProblem('Diktování vyžaduje zabezpečené připojení HTTPS. Otevři aplikaci přes její veřejnou adresu, ne z lokálního souboru.');return;
  }
  if(recognition){try{recognition.abort();}catch(e){}recognition=null;}
  clearTimeout(voiceRestartTimer);clearTimeout(silenceTimer);
  voiceActive=true;voiceStopRequested=false;voiceRestartAttempts=0;fullTranscript='';

  const btn=document.getElementById('voice-record-btn');
  btn.classList.add('recording');
  document.getElementById('voice-wave')?.classList.add('active');
  startVoiceMeter();
  document.getElementById('voice-record-label').textContent='Zastavit nahrávání';
  document.getElementById('voice-status').textContent='🔴 Poslouchám… po každé pokutě řekni „další“.';
  const live=document.getElementById('voice-live');
  live.style.display='block';live.textContent='';

  function createAndStart(){
    if(!voiceActive||voiceStopRequested) return;
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    const r=new SR();
    r.lang='cs-CZ';
    r.continuous=true;
    r.interimResults=true;
    r.maxAlternatives=3;

    r.onresult=e=>{
      clearTimeout(silenceTimer);
      // A pause after a final phrase is enough to finish a batch. Interims do
      // not trigger it, so the recognizer never cuts a speaker mid-sentence.
      let interim='';
      for(let i=e.resultIndex;i<e.results.length;i++){
        const result=e.results[i];
        const alternatives=Array.from(result).map(a=>a.transcript);
        const t=alternatives.sort((a,b)=>scoreVoiceAlternative(b,state.players||[],getReasonList())-scoreVoiceAlternative(a,state.players||[],getReasonList()))[0]||'';
        if(result.isFinal){
          const endsSession=/\b(?:konec|stop)\b/iu.test(t);
          const spoken=t.split(/\b(?:konec|stop)\b/iu)[0].trim();
          if(spoken) fullTranscript+=(fullTranscript?', ':'')+spoken;
          if(endsSession){
            live.textContent=fullTranscript;
            setTimeout(()=>{if(voiceActive)stopVoiceSession();},0);
            return;
          }
          silenceTimer=setTimeout(()=>{if(voiceActive)stopVoiceSession();},6500);
        }else interim=t;
      }
      live.textContent=fullTranscript+(interim?' '+interim:'');
    };

    r.onerror=err=>{
      if(err.error==='aborted'||voiceStopRequested) return;
      console.warn('Speech error:',err.error);
      const fatal={
        'not-allowed':'Mikrofon není povolen. V adresním řádku klikni na ikonu zámku, povol mikrofon a spusť diktování znovu.',
        'service-not-allowed':isBraveBrowser()?voiceNetworkMessage():'Služba rozpoznávání řeči není v tomto prohlížeči povolena. Použij aktuální Chrome nebo Edge.',
        'audio-capture':'Počítač nenalezl mikrofon. Zkontroluj připojení a výchozí mikrofon ve Windows.',
        'language-not-supported':'Čeština není v tomto prohlížeči pro diktování dostupná. Použij aktuální Chrome nebo Edge.',
        'network':voiceNetworkMessage(),
      };
      if(fatal[err.error]){
        voiceActive=false;voiceStopRequested=true;clearTimeout(voiceRestartTimer);clearTimeout(silenceTimer);
        resetVoiceUI();showVoiceProblem(fatal[err.error]);
      }
    };

    r.onend=()=>{
      if(!voiceActive||voiceStopRequested) return;
      voiceRestartAttempts++;
      if(voiceRestartAttempts>8){
        voiceActive=false;resetVoiceUI();showVoiceProblem('Diktování se opakovaně ukončilo. Zkontroluj mikrofon a obnov stránku.');return;
      }
      document.getElementById('voice-status').textContent='Znovu připojuji diktování…';
      voiceRestartTimer=setTimeout(createAndStart,Math.min(900,150+voiceRestartAttempts*100));
    };

    recognition=r;
    try{r.start();}catch(e){
      console.warn('start() failed:',e);
      if(voiceActive) voiceRestartTimer=setTimeout(createAndStart,400);
    }
  }
  createAndStart();
}

function showVoiceProblem(message){
  const status=document.getElementById('voice-status');
  if(status) status.textContent='⚠️ '+message;
  showToast(message);
}

function resetVoiceUI(){
  const btn=document.getElementById('voice-record-btn');
  if(btn) btn.classList.remove('recording');
  document.getElementById('voice-wave')?.classList.remove('active');
  stopVoiceMeter();
  const lbl=document.getElementById('voice-record-label');
  if(lbl) lbl.textContent='Spustit nahrávání';
  const st=document.getElementById('voice-status');
  if(st) st.textContent='';
  const live=document.getElementById('voice-live');
  if(live) live.style.display='none';
}

function stopVoiceSession(){
  voiceActive=false;voiceStopRequested=true;
  clearTimeout(silenceTimer);clearTimeout(voiceRestartTimer);
  if(recognition){
    recognition.onend=null; // prevent restart loop
    recognition.onerror=null;
    try{recognition.abort();}catch(e){}
    recognition=null;
  }
  resetVoiceUI();
  const t=fullTranscript.trim();
  if(!t){showToast('Žádný hlasový vstup.');return;}
  buildReviewQueue(t);
}

// ─── REVIEW ───────────────────────────────────────────────────────
function buildReviewQueue(transcript){
  reviewImportMeta=null;
  reviewTranscript=String(transcript||'').trim();
  reviewQueue=[];
  parseVoiceTranscript(reviewTranscript,state.players||[],getReasonList()).forEach(parsed=>{
    const resolved=parsed.resolution.player;
    reviewQueue.push({
      raw:parsed.raw,rawName:parsed.rawName,resolvedPlayer:resolved||'',reason:parsed.reason||UNKNOWN_REASON,amount:parsed.amount||0,
      needsPlayer:!resolved,needsAmount:!parsed.amount,candidates:parsed.resolution.candidates||[],
      reasonCandidates:parsed.reasonCandidates||[],isAlias:parsed.resolution.status==='fuzzy',skip:false
    });
  });
  if(!reviewQueue.length){showToast('Nepodařilo se rozpoznat žádné pokuty.');return;}
  renderReviewTranscriptEditor();
  renderReviewQueue();
  document.getElementById('voice-review').style.display='block';
  document.getElementById('voice-review').scrollIntoView({behavior:'smooth'});
  const unknown=[...new Set(reviewQueue.filter(r=>r.needsPlayer).map(r=>voiceDisplayName(r.rawName)))];
  if(unknown.length) setTimeout(()=>alert(`Hráč ${unknown.join(', ')} není v databázi. Nejdřív ho přidej v kontrole níže a zadej telefon ve formátu +420 nebo +421.`),0);
}
function buildOneTimeFineReview(importData,prepared){
  reviewImportMeta={key:'bozkov2026',id:importData.id,title:importData.title};
  reviewTranscript='';
  reviewQueue=prepared.fines.map(fine=>({
    raw:`${fine.sourceName} – ${fine.amount} Kč`,rawName:fine.sourceName,resolvedPlayer:fine.player,
    reason:fine.reason,amount:fine.amount,needsPlayer:!fine.player,needsAmount:false,candidates:[],
    isAlias:!!fine.player&&normalizedPlayerName(fine.sourceName)!==normalizedPlayerName(fine.player),skip:false,
    source:fine.source,ts:fine.ts,season:fine.season,allowNegative:fine.allowNegative
  }));
  renderReviewTranscriptEditor();
  renderReviewQueue();
  document.getElementById('voice-review').style.display='block';
  document.getElementById('voice-review').scrollIntoView({behavior:'smooth'});
  if(prepared.unresolved.length) showToast(`Bozkov: ručně vyber hráče u ${prepared.unresolved.join(', ')}.`);
  else showToast(`Bozkov: zkontroluj ${reviewQueue.length} záznamů před uložením.`);
}

async function startVoiceMeter(){
  if(!navigator.mediaDevices?.getUserMedia||voiceMeterStream) return;
  try{
    voiceMeterStream=await navigator.mediaDevices.getUserMedia({audio:true});
    if(!voiceActive){voiceMeterStream.getTracks().forEach(track=>track.stop());voiceMeterStream=null;return;}
    voiceMeterContext=new (window.AudioContext||window.webkitAudioContext)();
    voiceMeterAnalyser=voiceMeterContext.createAnalyser();
    voiceMeterAnalyser.fftSize=512;
    voiceMeterContext.createMediaStreamSource(voiceMeterStream).connect(voiceMeterAnalyser);
    const data=new Uint8Array(voiceMeterAnalyser.fftSize),wave=document.getElementById('voice-wave');
    const render=()=>{
      if(!voiceMeterAnalyser||!wave)return;
      voiceMeterAnalyser.getByteTimeDomainData(data);
      let sum=0;for(const value of data){const sample=(value-128)/128;sum+=sample*sample;}
      const level=Math.min(1,Math.max(.02,Math.sqrt(sum/data.length)*7));
      wave.style.setProperty('--voice-level',level.toFixed(3));
      voiceMeterFrame=requestAnimationFrame(render);
    };
    render();
  }catch(error){console.warn('Voice meter unavailable',error);}
}
function stopVoiceMeter(){
  if(voiceMeterFrame)cancelAnimationFrame(voiceMeterFrame);
  voiceMeterFrame=null;
  voiceMeterStream?.getTracks().forEach(track=>track.stop());
  voiceMeterStream=null;voiceMeterAnalyser=null;
  if(voiceMeterContext){voiceMeterContext.close();voiceMeterContext=null;}
}
function voiceDisplayName(name=''){
  return String(name).trim().split(/\s+/).filter(Boolean).map(part=>part.charAt(0).toUpperCase()+part.slice(1).toLowerCase()).join(' ');
}
function renderReviewTranscriptEditor(){
  const editor=document.getElementById('review-transcript-editor');
  const field=document.getElementById('review-transcript');
  if(!editor||!field) return;
  const visible=!reviewImportMeta&&!!reviewTranscript;
  editor.style.display=visible?'block':'none';
  if(visible) field.value=reviewTranscript;
}
window.reparseVoiceReview=function(){
  const transcript=document.getElementById('review-transcript')?.value.trim()||'';
  if(!transcript){showToast('Nejdřív zadej text k vyhodnocení.');return;}
  buildReviewQueue(transcript);
  showToast('Kontrolní řádky byly znovu vytvořeny z upraveného textu.');
};
function renderReviewQueue(){
  const n=reviewQueue.filter(r=>!r.skip).length;
  document.getElementById('confirm-btn').innerHTML=`<i class="ti ti-device-floppy"></i> Uložit ${n} pokut${n===1?'u':n<5?'y':''}`;
  document.getElementById('review-list').innerHTML=reviewQueue.map((r,i)=>{
    const opts=(state.players||[]).map(p=>`<option value="${esc(p.name)}"${p.name===r.resolvedPlayer?' selected':''}>${esc(p.name)}</option>`).join('');
    const candidateHint=r.needsPlayer&&r.candidates.length?`<div class="review-warning">Nejbližší shoda: ${r.candidates.map(c=>`${esc(c.player)} (${Math.round(c.score*100)} % )`).join(', ')}</div>`:'';
    const unknownPlayer=r.needsPlayer?`<div class="review-warning review-new-player"><strong>Hráč „${esc(voiceDisplayName(r.rawName))}“ není v databázi.</strong><span>Pro přidání zadej číslo s +420 nebo +421.</span><div><input id="review-phone-${i}" type="tel" inputmode="tel" placeholder="+420 123 456 789" /><button type="button" class="btn btn-primary" onclick="addReviewPlayer(${i})"><i class="ti ti-user-plus"></i> Přidat hráče</button></div></div>`:'';
    const reasonHint=r.reasonCandidates?.length?`<div class="review-warning review-reason-hint"><strong>Možná sazebníková položka:</strong>${r.reasonCandidates.map(c=>`<button type="button" class="review-suggestion" onclick="applyReviewReason(${i},${JSON.stringify(c.label).replace(/"/g,'&quot;')})">${esc(c.label)} · ${c.price} ${CONFIG.CURRENCY}</button>`).join('')}</div>`:'';
    const reviewSeason=r.season?parseSeasonKey(r.season):seasonForDate(new Date(r.ts||Date.now()));
    const catalogPrice=reasonPrice(r.reason,reviewSeason,r.ts?new Date(r.ts):null);
    const priceHint=catalogPrice!=null&&Number(r.amount)!==Number(catalogPrice)
      ?`<div class="review-warning review-price-hint">Sazebník pro tento důvod uvádí <strong>${catalogPrice} ${CONFIG.CURRENCY}</strong>, nadiktováno je <strong>${r.amount} ${CONFIG.CURRENCY}</strong>. Ověř, že chceš ponechat vlastní částku.</div>`:'';
    return`<div class="review-item${r.skip?' skipped':''}">
      <div class="review-item-header">
        <span class="review-item-num">${i+1}</span>
        <span class="review-item-tags">${r.isAlias?`<span class="badge badge-alias">≈ opraveno z „${esc(r.rawName)}“</span>`:''} ${r.needsPlayer?`<span class="badge badge-new">Vyžaduje hráče</span>`:''} ${r.needsAmount?`<span class="badge badge-new">Vyžaduje částku</span>`:''}</span>
        <button class="btn-icon${r.skip?'':' danger'}" onclick="toggleSkip(${i})"><i class="ti ${r.skip?'ti-rotate-clockwise':'ti-trash'}"></i></button>
      </div>
      <div class="review-fields"${r.skip?' style="opacity:.4;pointer-events:none;"':''}>
        <div class="review-field"><label>Hráč</label><select onchange="updateReview(${i},'resolvedPlayer',this.value)"><option value=""${r.resolvedPlayer?'':' selected'}>— vyber hráče —</option>${opts}</select>${candidateHint}</div>
        ${unknownPlayer}
        <div class="review-field review-field-reason"><label>Důvod</label><input type="text" value="${esc(r.reason)}" oninput="updateReview(${i},'reason',this.value)"/>${reasonHint}${priceHint}</div>
        <div class="review-field review-field-amt"><label>Částka</label><input type="number" value="${r.amount}" oninput="updateReview(${i},'amount',parseFloat(this.value))"/></div>
      </div></div>`;
  }).join('');
}
window.addReviewPlayer=async function(index){
  const review=reviewQueue[index]; if(!review||!review.needsPlayer)return;
  const phone=document.getElementById(`review-phone-${index}`)?.value.replace(/\s+/g,'')||'';
  if(!/^\+(?:420|421)\d{9}$/.test(phone)){alert('Zadej telefon přesně ve formátu +420123456789 nebo +421123456789.');return;}
  const name=voiceDisplayName(review.rawName);
  if(!name){alert('Nepodařilo se určit jméno hráče.');return;}
  if(state.players.some(p=>p.phone===phone)){alert('Toto telefonní číslo už patří jinému hráči.');return;}
  state.players.push({name,phone,email:'',nicknames:[],seasons:[seasonKey(activeSeason)],roles:{}});
  review.resolvedPlayer=name;review.needsPlayer=false;review.isAlias=false;
  await saveState();renderReviewQueue();showToast(`Hráč ${name} přidán`);
};
function validReviewAmount(review){ return Number.isFinite(Number(review.amount))&&(review.allowNegative?Number(review.amount)!==0:Number(review.amount)>0); }
window.applyReviewReason=function(index,label){
  const review=reviewQueue[index]; if(!review) return;
  review.reason=label;review.reasonCandidates=[];
  renderReviewQueue();
};
window.updateReview=function(i,k,v){reviewQueue[i][k]=v;if(k==='resolvedPlayer'){reviewQueue[i].needsPlayer=!v;reviewQueue[i].isAlias=false;}if(k==='amount')reviewQueue[i].needsAmount=!validReviewAmount(reviewQueue[i]);const n=reviewQueue.filter(r=>!r.skip).length;document.getElementById('confirm-btn').innerHTML=`<i class="ti ti-device-floppy"></i> Uložit ${n} pokut${n===1?'u':n<5?'y':''}`;};
window.toggleSkip=function(i){reviewQueue[i].skip=!reviewQueue[i].skip;renderReviewQueue();};
window.confirmReview=async function(){
  const toSave=reviewQueue.filter(r=>!r.skip);if(!toSave.length){window.discardReview();return;}
  const invalid=toSave.find(r=>!r.resolvedPlayer||!state.players.some(p=>p.name===r.resolvedPlayer)||!validReviewAmount(r));
  if(invalid){showToast('Před uložením vyber hráče a částku u všech nezahozených pokut.');return;}
  const previousFines=state.fines,previousImports=state.oneTimeImports;
  state.fines=[...(state.fines||[])];
  toSave.forEach(r=>{
    const fine={player:r.resolvedPlayer,reason:r.reason,amount:Number(r.amount),ts:r.ts||Date.now(),season:r.season||seasonKey(activeSeason)};
    if(r.source) fine.source=r.source;
    state.fines.unshift(fine);
  });
  if(reviewImportMeta){
    state.oneTimeImports=state.oneTimeImports||{};
    state.oneTimeImports[reviewImportMeta.key]={id:reviewImportMeta.id,title:reviewImportMeta.title,importedAt:new Date().toISOString(),count:toSave.length};
  }
  const saved=await saveState();
  if(!saved){state.fines=previousFines;state.oneTimeImports=previousImports;return;}
  showToast(`✓ Uloženo ${toSave.length} pokut`);window.discardReview();populatePlayerSelects();
};
window.discardReview=function(){reviewQueue=[];reviewTranscript='';reviewImportMeta=null;document.getElementById('voice-review').style.display='none';};

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
        <button type="button" class="btn-icon" aria-label="Upravit pokutu" onclick="event.stopPropagation();openEdit(${idx})"><i class="ti ti-edit"></i></button>
        <button type="button" class="btn-icon danger" aria-label="Smazat pokutu" onclick="event.stopPropagation();deleteFine(${idx})"><i class="ti ti-trash"></i></button>
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
  // The selected checkboxes are an explicit destructive action; native dialogs
  // are unreliable on some mobile browsers and previously made this appear inert.
  const sorted=[...selectedFineIndices].sort((a,b)=>b-a);
  sorted.forEach(idx=>state.fines.splice(idx,1));
  selectedFineIndices.clear();
  await saveState();renderLog();showToast('Pokuty smazány ✓');
};

window.deleteFine=async function(idx){
  const fine=state.fines?.[idx];
  if(!fine) { showToast('Záznam už neexistuje. Obnovuji seznam.'); renderLog(); return; }
  if(!confirm(`Smazat pokutu ${fine.player} – ${fine.amount} ${CONFIG.CURRENCY}?`)) return;
  try{
    state.fines.splice(idx,1);
    selectedFineIndices.clear();
    await saveState();
    renderLog();
    showToast('Pokuta smazána');
  }catch(error){
    console.error('Fine deletion failed',error);
    showToast('Pokutu se nepodařilo smazat. Zkus to prosím znovu.');
  }
};
window.openEdit=function(idx){
  editIndex=idx;const f=state.fines[idx];
  populatePlayerSelects();
  document.getElementById('edit-player').value=f.player;
  document.getElementById('edit-reason').value=f.reason;
  document.getElementById('edit-amount').value=f.amount;
  document.getElementById('edit-reason-ac-list').style.display='none';
  document.getElementById('edit-catalog-choice').style.display='none';
  document.getElementById('edit-modal').classList.add('open');
};
window.closeEditModal=function(){
  document.getElementById('edit-modal').classList.remove('open');
  document.getElementById('edit-reason-ac-list').style.display='none';
};
let editReasonAcIndex=-1,editReasonAcFiltered=[];
window.hideEditReasonAutocomplete=function(){
  const list=document.getElementById('edit-reason-ac-list'); if(list) list.style.display='none';
};
window.editReasonAutocomplete=function(value){
  const f=state.fines[editIndex]; if(!f) return;
  const list=document.getElementById('edit-reason-ac-list'),query=String(value||'').trim().toLowerCase();
  editReasonAcFiltered=getReasonList(fineSeason(f)).filter(reason=>!query||reason.label.toLowerCase().includes(query)||(reason.tags||[]).some(tag=>tag.toLowerCase().includes(query)));
  if(!editReasonAcFiltered.length){window.hideEditReasonAutocomplete();return;}
  editReasonAcIndex=-1;
  list.innerHTML=editReasonAcFiltered.map((reason,index)=>{
    const price=reasonPrice(reason.label,fineSeason(f),new Date(f.ts))??reason.price;
    return `<div class="ac-item" onclick="selectEditReason(${JSON.stringify(reason.label).replace(/"/g,'&quot;')},${price})" data-i="${index}">${esc(reason.label)}<span class="ac-sub">${price} ${CONFIG.CURRENCY}</span></div>`;
  }).join('');
  list.style.display='block';
};
window.editReasonAutocompleteKey=function(event){
  const list=document.getElementById('edit-reason-ac-list'),items=list?.querySelectorAll('.ac-item')||[];
  if(event.key==='ArrowDown'){editReasonAcIndex=Math.min(editReasonAcIndex+1,items.length-1);items.forEach((item,index)=>item.classList.toggle('active',index===editReasonAcIndex));event.preventDefault();}
  else if(event.key==='ArrowUp'){editReasonAcIndex=Math.max(editReasonAcIndex-1,0);items.forEach((item,index)=>item.classList.toggle('active',index===editReasonAcIndex));event.preventDefault();}
  else if(event.key==='Enter'&&editReasonAcFiltered[editReasonAcIndex]){const reason=editReasonAcFiltered[editReasonAcIndex],f=state.fines[editIndex];window.selectEditReason(reason.label,reasonPrice(reason.label,fineSeason(f),new Date(f.ts))??reason.price);event.preventDefault();}
  else if(event.key==='Escape') window.hideEditReasonAutocomplete();
};
window.selectEditReason=function(label,price){
  document.getElementById('edit-reason').value=label;
  window.hideEditReasonAutocomplete();
  const choice=document.getElementById('edit-catalog-choice'),current=Number(document.getElementById('edit-amount').value);
  if(Number(current)===Number(price)){
    choice.style.display='block';choice.textContent=`Cena ${price} ${CONFIG.CURRENCY} odpovídá sazebníku.`;return;
  }
  choice.style.display='block';
  choice.innerHTML=`<strong>Cena v sazebníku je ${price} ${CONFIG.CURRENCY}.</strong><span>Chceš přepsat současných ${current} ${CONFIG.CURRENCY}?</span><div><button type="button" class="btn btn-secondary" onclick="keepEditAmount()">Ponechat ${current} ${CONFIG.CURRENCY}</button><button type="button" class="btn btn-primary" onclick="applyEditCatalogPrice(${price})">Přepsat na ${price} ${CONFIG.CURRENCY}</button></div>`;
};
window.keepEditAmount=function(){document.getElementById('edit-catalog-choice').style.display='none';};
window.applyEditCatalogPrice=function(price){document.getElementById('edit-amount').value=price;document.getElementById('edit-catalog-choice').style.display='none';};
window.syncEditCatalogPrice=function(){
  const f=state.fines[editIndex]; if(!f)return;
  const label=document.getElementById('edit-reason').value.trim(),price=reasonPrice(label,fineSeason(f),new Date(f.ts));
  if(price!=null) window.selectEditReason(label,price);
};
window.saveEdit=async function(){
  const f=state.fines[editIndex];
  if(!f){showToast('Záznam už neexistuje. Obnovuji seznam.');window.closeEditModal();renderLog();return;}
  f.player=document.getElementById('edit-player').value;
  f.reason=document.getElementById('edit-reason').value.trim();
  const amount=Number(document.getElementById('edit-amount').value);
  if(!f.player||!f.reason||!Number.isFinite(amount)||amount===0){alert('Vyber hráče, zadej důvod a platnou nenulovou částku.');return;}
  f.amount=amount;
  const saved=await saveState();
  if(saved){window.closeEditModal();renderLog();showToast('Pokuta upravena ✓');}
};

// ─── DASHBOARD ───────────────────────────────────────────────────
const SEASON_BUDGET = 10000; // CZK target per half-season

function renderDashboard(){
  const el=document.getElementById('main-dashboard'); if(!el) return;
  const fines=seasonFines();
  const sl=activeSeason?seasonLabel(activeSeason):'sezóna';

  if(!fines.length){
    el.innerHTML=`<div class="dash-empty"><i class="ti ti-chart-bar"></i> Zatím žádné pokuty – ${sl}</div>`;
    return;
  }

  const total=fines.reduce((a,f)=>a+f.amount,0);
  const count=fines.length;
  const pct=Math.min(100,Math.round((total/SEASON_BUDGET)*100));
  const missing=Math.max(0,SEASON_BUDGET-total);
  const budgetColor=pct>=100?'#16a34a':pct>=60?'#d97706':'#1B3A6B';

  // Top 4 players by fine total
  const byPlayer={};
  fines.forEach(f=>{byPlayer[f.player]=(byPlayer[f.player]||0)+f.amount;});
  const topPlayers=Object.entries(byPlayer).sort((a,b)=>b[1]-a[1]).slice(0,4);
  const maxP=topPlayers[0]?topPlayers[0][1]:1;

  // Top 5 reasons
  const byReason={};
  fines.forEach(f=>{if(f.reason)byReason[f.reason]=(byReason[f.reason]||0)+1;});
  const topReasons=Object.entries(byReason).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const maxR=topReasons[0]?topReasons[0][1]:1;

  // ── Last 7 days ──────────────────────────────────────────────
  const now=Date.now(),DAY=86400000;
  const days7=Array.from({length:7},(_,i)=>{
    const from=now-(6-i)*DAY, to=from+DAY;
    return{
      sum:fines.filter(f=>f.ts>=from&&f.ts<to).reduce((a,f)=>a+f.amount,0),
      count:fines.filter(f=>f.ts>=from&&f.ts<to).length,
    };
  });
  const maxDay=Math.max(...days7.map(d=>d.sum),1);
  const todayDow=(new Date().getDay()+6)%7;
  const dayLabels=['Po','Út','St','Čt','Pá','So','Ne'];
  const spark7=days7.map((d,i)=>{
    const lbl=dayLabels[(todayDow-6+i+7)%7];
    const h=Math.max(4,Math.round((d.sum/maxDay)*44));
    const isToday=i===6;
    return`<div class="spark-col">
      <div class="spark-val">${d.sum>0?d.sum:''}</div>
      <div class="spark-bar${isToday?' spark-bar-today':''}" style="height:${h}px" title="${d.sum} CZK, ${d.count} pokut"></div>
      <div class="spark-lbl${isToday?' spark-lbl-today':''}">${lbl}</div>
    </div>`;
  }).join('');

  // ── Last 7 weeks ─────────────────────────────────────────────
  const WEEK=DAY*7;
  const weeks7=Array.from({length:7},(_,i)=>{
    const from=now-(6-i)*WEEK, to=from+WEEK;
    const wFines=fines.filter(f=>f.ts>=from&&f.ts<to);
    return{sum:wFines.reduce((a,f)=>a+f.amount,0),count:wFines.length};
  });
  const maxWeek=Math.max(...weeks7.map(d=>d.sum),1);
  // Week label: "W23" style
  function weekNum(offsetWeeks){
    const d=new Date(now-(6-offsetWeeks)*WEEK);
    const jan1=new Date(d.getFullYear(),0,1);
    return `T${Math.ceil(((d-jan1)/DAY+jan1.getDay()+1)/7)}`;
  }
  const spark7w=weeks7.map((d,i)=>{
    const h=Math.max(4,Math.round((d.sum/maxWeek)*44));
    const isNow=i===6;
    return`<div class="spark-col">
      <div class="spark-val">${d.sum>0?d.sum:''}</div>
      <div class="spark-bar${isNow?' spark-bar-today':''}" style="height:${h}px" title="${d.sum} CZK, ${d.count} pokut"></div>
      <div class="spark-lbl${isNow?' spark-lbl-today':''}">${weekNum(i)}</div>
    </div>`;
  }).join('');

  el.innerHTML=`
  <div class="dash-grid">

    <!-- Fond sezóny with budget progress -->
    <div class="dash-card dash-fond">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">
        <div>
          <div class="dash-label">Fond sezóny · ${esc(sl)}</div>
          <div class="dash-val">${total} <span class="dash-unit">CZK</span></div>
          <div class="dash-sub">${count} pokut · cíl ${SEASON_BUDGET.toLocaleString('cs-CZ')} CZK</div>
        </div>
        <div class="budget-ring">
          <svg viewBox="0 0 42 42" width="72" height="72">
            <circle cx="21" cy="21" r="16" fill="none" stroke="rgba(255,255,255,.2)" stroke-width="4"/>
            <circle cx="21" cy="21" r="16" fill="none" stroke="${pct>=100?'#4ade80':'#fff'}" stroke-width="4"
              stroke-dasharray="${Math.round(pct/100*100.53)} 100.53"
              stroke-linecap="round" transform="rotate(-90 21 21)"/>
            <text x="21" y="25" text-anchor="middle" font-size="9" font-weight="700" fill="#fff">${pct}%</text>
          </svg>
        </div>
      </div>
      <div class="budget-bar-track" style="margin-top:10px;">
        <div class="budget-bar-fill" style="width:${pct}%;background:${budgetColor};"></div>
      </div>
      <div class="dash-sub" style="margin-top:5px;">${pct>=100?'🎉 Cíl splněn!':'Chybí '+missing.toLocaleString('cs-CZ')+' CZK ('+( 100-pct)+'%)'}</div>
    </div>

    <!-- Největší dlužníci -->
    <div class="dash-card">
      <div class="dash-label">Největší dlužníci</div>
      ${topPlayers.map(([name,amt])=>`
        <div class="dash-bar-row">
          <span class="dash-bar-name">${esc(name.split(' ')[0])}</span>
          <div class="dash-bar-track"><div class="dash-bar-fill" style="width:${Math.round(amt/maxP*100)}%"></div></div>
          <span class="dash-bar-amt">${amt}</span>
        </div>`).join('')}
    </div>

    <!-- Nejčastější přestupky -->
    <div class="dash-card">
      <div class="dash-label">Nejčastější přestupky</div>
      ${topReasons.map(([r,c])=>`
        <div class="dash-bar-row">
          <span class="dash-bar-name" title="${esc(r)}">${esc(r.slice(0,15))}</span>
          <div class="dash-bar-track"><div class="dash-bar-fill dash-bar-red" style="width:${Math.round(c/maxR*100)}%"></div></div>
          <span class="dash-bar-amt">${c}×</span>
        </div>`).join('')}
    </div>

    <!-- Posledních 7 dní -->
    <div class="dash-card">
      <div class="dash-label">Posledních 7 dní</div>
      <div class="spark-wrap">${spark7}</div>
    </div>

    <!-- Posledních 7 týdnů -->
    <div class="dash-card">
      <div class="dash-label">Posledních 7 týdnů</div>
      <div class="spark-wrap">${spark7w}</div>
    </div>

  </div>`;
}
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
  document.getElementById('ep-telegram-id').value=p.telegramId||'';
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
  p.telegramId=document.getElementById('ep-telegram-id').value.trim();
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
  const map={'auth/email-already-in-use':'Tento e-mail je již zaregistrován.','auth/invalid-email':'Neplatný e-mail.','auth/weak-password':'Heslo je příliš slabé (min. 6 znaků).','auth/user-not-found':'Účet s tímto e-mailem neexistuje.','auth/wrong-password':'Nesprávné heslo.','auth/invalid-credential':'Nesprávný e-mail nebo heslo.','auth/too-many-requests':'Firebase dočasně zablokoval další odesílání. Vyčkej alespoň hodinu a pak zkus jeden e-mail.','auth/network-request-failed':'Chyba sítě. Zkontroluj připojení.','auth/unauthorized-continue-uri':'Ověřovací odkaz zatím není povolen pro adresu aplikace. Kontaktuj správce.'};
  return map[code]||`Chyba: ${code}`;
}

// Backdrop close
document.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('.modal-backdrop').forEach(el=>{
    el.addEventListener('click',e=>{
      if(e.target!==el) return;
      if(el.id==='edit-modal')         window.closeEditModal();
      if(el.id==='nick-modal')         window.closeNickModal();
      if(el.id==='edit-player-modal')  window.closeEditPlayerModal();
    });
  });
});
