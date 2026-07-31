let cachedToken=null;

const season=()=>{const d=new Date();const y=d.getFullYear();return `${d.getMonth()<6?y-1:y}/${String((d.getMonth()<6?y:y+1)).slice(-2)}`;};
const decode=v=>{
  if('nullValue'in v)return null;if('stringValue'in v)return v.stringValue;if('booleanValue'in v)return v.booleanValue;
  if('integerValue'in v)return Number(v.integerValue);if('doubleValue'in v)return v.doubleValue;
  if('timestampValue'in v)return v.timestampValue;if('arrayValue'in v)return (v.arrayValue.values||[]).map(decode);
  if('mapValue'in v)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decode(x)]));return null;
};
const encode=v=>{
  if(v===null)return {nullValue:null};if(Array.isArray(v))return {arrayValue:{values:v.map(encode)}};
  if(typeof v==='string')return {stringValue:v};if(typeof v==='boolean')return {booleanValue:v};
  if(typeof v==='number')return Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v};
  return {mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x)]))}};
};

async function token(env){
  if(cachedToken&&cachedToken.until>Date.now())return cachedToken.value;
  const response=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${env.FIREBASE_API_KEY}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:env.FIREBASE_BOT_EMAIL,password:env.FIREBASE_BOT_PASSWORD,returnSecureToken:true})});
  if(!response.ok)throw new Error('Firebase bot login failed');
  const data=await response.json();cachedToken={value:data.idToken,until:Date.now()+(Number(data.expiresIn)-60)*1000};return data.idToken;
}
async function firebaseFine(env,telegramId,amount,reason,sourceId){
  const idToken=await token(env),url=`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/teamdata/main`;
  for(let attempt=0;attempt<3;attempt++){
    const get=await fetch(url,{headers:{authorization:`Bearer ${idToken}`}});if(!get.ok)throw new Error('Nelze načíst týmová data');
    const document=await get.json(),data=decode({mapValue:{fields:document.fields||{}}});
    const player=(data.players||[]).find(p=>String(p.telegramId||'')===String(telegramId));
    if(!player)return {error:'Tvůj Telegram účet zatím není spárovaný s hráčem. Pošli adminovi své ID z příkazu /start.'};
    const fines=data.fines||[];
    if(fines.some(f=>f.sourceId===sourceId))return {ok:true,duplicate:true,player:player.name};
    fines.unshift({player:player.name,reason,amount,ts:Date.now(),season:season(),source:'telegram',sourceId});
    const patch=await fetch(`${url}?updateMask.fieldPaths=fines&currentDocument.updateTime=${encodeURIComponent(document.updateTime)}`,{method:'PATCH',headers:{authorization:`Bearer ${idToken}`,'content-type':'application/json'},body:JSON.stringify({fields:{fines:encode(fines)}})});
    if(patch.ok)return {ok:true,player:player.name};
    if(patch.status!==409&&patch.status!==412)throw new Error('Zápis pokuty selhal');
  }
  throw new Error('Data se právě mění, zkus to prosím znovu.');
}
async function reply(env,chatId,text){
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:chatId,text})});
}

export default {
  async fetch(request,env){
    if(request.method==='GET')return new Response('Team Fines Telegram bot is online.');
    if(request.method!=='POST')return new Response('Method not allowed',{status:405});
    if(request.headers.get('X-Telegram-Bot-Api-Secret-Token')!==env.TELEGRAM_WEBHOOK_SECRET)return new Response('Unauthorized',{status:401});
    const update=await request.json(),message=update.message;
    if(!message||message.chat?.type!=='private')return Response.json({ok:true});
    const text=(message.text||'').trim(),chatId=message.chat.id;
    if(/^\/start\b/i.test(text)){await reply(env,chatId,`Ahoj! Tvoje Telegram ID je ${message.from.id}. Pošli ho správci týmu, který ho uloží k tvému hráčskému profilu. Potom zapisuj: /pokuta 30 - důvod`);return Response.json({ok:true});}
    if(/^\/(help|pomoc)\b/i.test(text)){await reply(env,chatId,'Použití: /pokuta 30 - důvod\nNapř.: /pokuta 30 - pozdní příchod');return Response.json({ok:true});}
    const match=text.match(/^\/pokuta(?:@\w+)?\s+(\d{1,5})(?:\s*[-–]\s*|\s+)?(.*)$/iu);
    if(!match){await reply(env,chatId,'Nerozumím. Použij: /pokuta 30 - důvod');return Response.json({ok:true});}
    const amount=Number(match[1]),reason=match[2].trim()||'Pokuta z Telegramu';
    if(amount<1||amount>10000){await reply(env,chatId,'Částka musí být od 1 do 10 000 Kč.');return Response.json({ok:true});}
    try{const result=await firebaseFine(env,message.from.id,amount,reason,`telegram:${update.update_id}`);await reply(env,chatId,result.error||`Zapsáno: ${result.player} – ${amount} Kč (${reason}).`);}
    catch(error){console.error(error);await reply(env,chatId,'Pokutu se nepodařilo zapsat. Zkus to později.');}
    return Response.json({ok:true});
  }
};
