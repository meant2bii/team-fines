// Voice parsing is deliberately deterministic. Speech recognition is
// probabilistic, but the financial record must never be: uncertain players
// are returned for review instead of being silently created or charged.

const DIACRITICS = /[\u0300-\u036f]/g;

export function normalise(text = '') {
  return String(text)
    .normalize('NFD').replace(DIACRITICS, '')
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function editDistance(a, b) {
  const rows = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = rows[0]; rows[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const stored = rows[j];
      rows[j] = Math.min(rows[j] + 1, rows[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = stored;
    }
  }
  return rows[b.length];
}

function similarity(a, b) {
  const left = normalise(a), right = normalise(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  return 1 - editDistance(left, right) / Math.max(left.length, right.length);
}

function playerTerms(player) {
  return [player.name, ...(player.nicknames || [])].map(normalise).filter(Boolean);
}

/**
 * Returns a player only for a clearly unique match. A fuzzy match needs a
 * high score and a visible margin over the runner-up; this prevents a fine
 * from moving from one similarly named player to another.
 */
export function resolveVoicePlayer(rawName, players = []) {
  const query = normalise(rawName);
  if (!query) return { status: 'unresolved', player: null, candidates: [] };
  const scored = players.map(player => {
    const terms = playerTerms(player);
    const score = Math.max(...terms.map(term => {
      if (term === query) return 1;
      // A spoken first name is useful only when it identifies one player.
      // If several roster names share it, the ambiguity margin below rejects it.
      if (term.startsWith(query) || query.startsWith(term)) return .9;
      return similarity(term, query);
    }), 0);
    return { player: player.name, score };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0], next = scored[1];
  if (!best || best.score < .82) return { status: 'unresolved', player: null, candidates: scored.slice(0, 3).filter(x => x.score >= .58) };
  if (next && best.score - next.score < .09) return { status: 'ambiguous', player: null, candidates: scored.slice(0, 3) };
  return { status: best.score === 1 ? 'exact' : 'fuzzy', player: best.player, score: best.score, candidates: scored.slice(0, 3) };
}

const WORD_NUMBERS = new Map([
  ['nula', 0], ['jedna', 1], ['jeden', 1], ['jedno', 1], ['dva', 2], ['dve', 2], ['dvě', 2], ['tri', 3], ['tři', 3], ['ctyri', 4], ['čtyři', 4], ['pet', 5], ['pět', 5], ['sest', 6], ['šest', 6], ['sedm', 7], ['osm', 8], ['devet', 9], ['devět', 9],
  ['deset', 10], ['jedenact', 11], ['jedenáct', 11], ['dvanact', 12], ['dvanáct', 12], ['trinact', 13], ['třináct', 13], ['ctrnact', 14], ['čtrnáct', 14], ['patnact', 15], ['patnáct', 15], ['sestnact', 16], ['šestnáct', 16], ['sedmnact', 17], ['sedmnáct', 17], ['osmnact', 18], ['osmnáct', 18], ['devatenact', 19], ['devatenáct', 19],
  ['dvacet', 20], ['tricet', 30], ['třicet', 30], ['ctyricet', 40], ['čtyřicet', 40], ['padesat', 50], ['padesát', 50], ['sedesat', 60], ['šedesát', 60], ['sedmdesat', 70], ['sedmdesát', 70], ['osmdesat', 80], ['osmdesát', 80], ['devadesat', 90], ['devadesát', 90],
]);

function parseSpokenAmount(tokens) {
  if (!tokens.length || tokens.length > 4) return null;
  let total = 0, current = 0, used = false;
  for (const original of tokens) {
    const word = normalise(original);
    if (word === 'sto' || word === 'sta' || word === 'ste' || word === 'set') { current = Math.max(1, current) * 100; used = true; continue; }
    if (word === 'tisic' || word === 'tisice' || word === 'tisicu') { total += Math.max(1, current) * 1000; current = 0; used = true; continue; }
    const value = WORD_NUMBERS.get(word);
    if (value === undefined) return null;
    current += value; used = true;
  }
  return used ? total + current : null;
}

function takeAmount(text) {
  // Recognizers commonly retain punctuation after a final phrase, e.g.
  // "Erik 30 korun.". Remove that punctuation before looking for the amount;
  // otherwise the number would be incorrectly passed to the reason parser.
  let value = String(text)
    // Do not use \b here: JavaScript treats Czech "č" as a non-word
    // character, so a trailing "Kč" would otherwise remain in the reason.
    .replace(/(?:^|\s)(?:kc|kč|korun|koruny|koruna|czk)(?=\s|[.,;:!?]|$)/giu, ' ')
    .replace(/[.!?]+\s*$/g, '')
    .trim();
  const numeric = value.match(/(?:^|\s)(\d{1,5}(?:[.,]\d{1,2})?)\s*$/);
  if (numeric) return { amount: Number(numeric[1].replace(',', '.')), text: value.slice(0, numeric.index).trim() };
  const words = value.split(/\s+/);
  for (let count = Math.min(4, words.length); count >= 1; count--) {
    const amount = parseSpokenAmount(words.slice(-count));
    if (amount !== null && amount > 0) return { amount, text: words.slice(0, -count).join(' ').trim() };
  }
  return { amount: null, text: value };
}

function takeLeadingNumericAmount(text) {
  const value=String(text).replace(/^\s+/, '');
  const match=value.match(/^(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:kč|kc|korun|koruny|koruna|czk)?\s+(.+)$/iu);
  if(!match) return null;
  const amount=Number(match[1].replace(',', '.'));
  return Number.isFinite(amount)&&amount>0?{amount,text:match[2].trim()}:null;
}

const MULTIPLIERS = new Map([
  ['dvakrat', 2], ['třikrát', 3], ['trikrat', 3], ['čtyřikrát', 4], ['ctyrikrat', 4],
  ['pěkrát', 5], ['pe krat', 5], ['peťkrát', 5], ['petkrat', 5], ['šestkrát', 6], ['sestkrat', 6],
  ['sedmkrát', 7], ['sedmkrat', 7], ['osmkrát', 8], ['osmkrat', 8], ['devěťkrát', 9], ['devetkrat', 9],
  ['desetkrát', 10], ['desetkrat', 10]
]);
function takeMultiplier(text) {
  const value=String(text).replace(/[.!?,;:]+\s*$/g,'').trim();
  const match=value.match(/(?:^|\s)(\d{1,2})\s*x$|(?:^|\s)(dvakrát|třikrát|trikrat|čtyřikrát|ctyrikrat|pěkrát|petkrat|pěťkrát|šestkrát|sestkrat|sedmkrát|sedmkrat|osmkrát|osmkrat|devěťkrát|devetkrat|desetkrát|desetkrat)$/iu);
  if(!match) return {multiplier:1,text:value};
  const multiplier=match[1]?Number(match[1]):MULTIPLIERS.get(normalise(match[2]))||1;
  return {multiplier:Math.max(1,Math.min(99,multiplier)),text:value.slice(0,match.index).trim()};
}

function takeMultiplierAnywhere(text) {
  const value=String(text).replace(/[.!?,;:]+\s*$/g,'').trim();
  const match=value.match(/(?:^|\s)(\d{1,2})\s*(?:x|kr\u00e1t)|(?:^|\s)(dvakr\u00e1t|t\u0159ikr\u00e1t|trikrat|\u010dty\u0159ikr\u00e1t|ctyrikrat|p\u011bkr\u00e1t|petkrat|\u0161estkr\u00e1t|sestkrat|sedmkr\u00e1t|sedmkrat|osmkr\u00e1t|osmkrat|dev\u011btkr\u00e1t|devetkrat|desetkr\u00e1t|desetkrat)/iu);
  if(!match) return {multiplier:1,text:value};
  const multiplier=match[1]?Number(match[1]):MULTIPLIERS.get(normalise(match[2]))||1;
  const cleaned=(value.slice(0,match.index)+' '+value.slice(match.index+match[0].length)).replace(/[.!?,;:]+/g,' ').replace(/\s+/g,' ').trim();
  return {multiplier:Math.max(1,Math.min(99,multiplier)),text:cleaned};
}

function findPlayerPrefix(text, players) {
  const normalised = normalise(text);
  let exact = null;
  for (const player of players) for (const term of playerTerms(player)) {
    if (normalised === term || normalised.startsWith(`${term} `)) {
      if (!exact || term.length > exact.term.length) exact = { player: player.name, term };
    }
  }
  if (exact) return { rawName: exact.term, resolution: { status: 'exact', player: exact.player }, remainder: normalised.slice(exact.term.length).trim() };

  const words = normalised.split(' ').filter(Boolean);
  const maxWords = Math.min(3, words.length);
  for (let count = maxWords; count >= 1; count--) {
    const rawName = words.slice(0, count).join(' ');
    const resolution = resolveVoicePlayer(rawName, players);
    if (resolution.status === 'exact' || resolution.status === 'fuzzy') return { rawName, resolution, remainder: words.slice(count).join(' ') };
  }
  return { rawName: words.slice(0, Math.min(2, words.length)).join(' '), resolution: resolveVoicePlayer(words.slice(0, Math.min(2, words.length)).join(' '), players), remainder: words.slice(Math.min(2, words.length)).join(' ') };
}

function matchReason(text, reasons) {
  const cleaned = normalise(text).replace(/^-+|-+$/g, '').trim();
  if (!cleaned) return { reason: '', price: null };
  const matches = reasons.flatMap(reason => [reason.label,...(reason.tags||[])].map(variant=>({reason,variant,score:similarity(cleaned,variant)}))).sort((a, b) => b.score - a.score);
  const best = matches[0];
  const nextDifferent=matches.find(item=>item.reason.label!==best?.reason.label);
  if (best && best.score >= .88 && (!nextDifferent || best.score - nextDifferent.score >= .08)) return { reason: best.reason.label, price: best.reason.price };
  return { reason: text.replace(/^-+|-+$/g, '').trim(), price: null };
}

// A transcriber often changes just one phoneme ("bago" → "blogo"). Keep
// the original text for the reviewer, but offer only genuinely close catalogue
// items. The phonetic key deliberately models common Czech ASR/transliteration
// variants (for example "pitchovina" → "picovina") without hard-coding fines.
function czechPhonetic(value){
  return normalise(value)
    .replace(/t(?:sch|ch)/g,'c').replace(/sch|sh/g,'s').replace(/ch/g,'h')
    .replace(/ph/g,'f').replace(/w/g,'v').replace(/y/g,'i')
    .replace(/q/g,'k').replace(/x/g,'ks');
}
export function suggestVoiceReasons(text, reasons = [], limit = 3) {
  const query = normalise(text).replace(/^-+|-+$/g, '').trim();
  if (!query) return [];
  const queryFirst = query.split(' ')[0];
  const consonants=value=>value.replace(/[aeiouy]/g,'');
  const phoneticQuery=czechPhonetic(queryFirst);
  return reasons.map(reason => {
    const variants=[reason.label,...(reason.tags||[])];
    const score=Math.max(...variants.map(variant=>{
      const label=normalise(variant),words=label.split(' ').filter(Boolean);
      const wordScore=Math.max(...words.map(word=>Math.max(
        similarity(queryFirst,word),similarity(phoneticQuery,czechPhonetic(word)),
        similarity(consonants(phoneticQuery),consonants(czechPhonetic(word)))
      )),0);
      return Math.max(similarity(query,label),wordScore);
    }));
    return { label: reason.label, price: reason.price, score };
  }).filter(item => item.score >= .64)
    .sort((a, b) => b.score - a.score || String(a.label).localeCompare(String(b.label), 'cs'))
    .slice(0, limit);
}

function splitVoiceTranscriptLegacy(transcript, players = []) {
  let text = String(transcript || '')
    .replace(/\s+(?:další|dalsi|potom|následuje|nasleduje)\s+/gi, ', ')
    .replace(/\s+a\s+(?:pak|ještě|jeste|taky|také)\s+/gi, ', ');
  // A spoken "další" is the reliable separator. Punctuation is retained as
  // a convenience for recognizers that insert it after a pause.
  // A recognizer may insert a comma/period between the spoken name and
  // amount ("Michal., 30 korun"). Do not split before a numeric token; a
  // comma followed by a name still separates two fines.
  return text.split(/(?:(?<=\s),(?=\s*\d+\s)|,(?!\s*(?:\d|dvakr\u00e1t|t\u0159ikr\u00e1t|trikrat|\u010dty\u0159ikr\u00e1t|ctyrikrat|p\u011bkr\u00e1t|petkrat|\u0161estkr\u00e1t|sestkrat|sedmkr\u00e1t|sedmkrat|osmkr\u00e1t|osmkrat|dev\u011btkr\u00e1t|devetkrat|desetkr\u00e1t|desetkrat))|;|\n)+/iu).map(part => part.trim()).filter(Boolean);
}

export function splitVoiceTranscript(transcript, players = []) {
  const text = String(transcript || '')
    .split(/\b(?:konec|stop)\b/iu)[0]
    .replace(/\s+(?:st\u0159edn\u00edk|dal\u0161\u00ed|dalsi|d\u00e1le|dale|a\s+dal\u0161\u00ed|je\u0161t\u011b|jeste|plus|nav\u00edc|a\s+tak\u00e9|a\s+taky|taky|potom|n\u00e1sleduje|nasleduje)(?=\s|[,;:.]|$)\s*[,;:.]?\s*/giu, '; ');
  return text.split(/(?:(?<=\s),(?=\s*\d+\s)|,(?!\s*(?:\d|dvakr\u00e1t|t\u0159ikr\u00e1t|trikrat|\u010dty\u0159ikr\u00e1t|ctyrikrat|p\u011bkr\u00e1t|petkrat|\u0161estkr\u00e1t|sestkrat|sedmkr\u00e1t|sedmkrat|osmkr\u00e1t|osmkrat|dev\u011btkr\u00e1t|devetkrat|desetkr\u00e1t|desetkrat))|;|\n)+/iu).map(part => part.trim()).filter(Boolean);
}

export function parseVoiceChunk(chunk, players = [], reasons = []) {
  const original = String(chunk || '').trim();
  if (!original) return null;
  const {multiplier,text:withoutMultiplier}=takeMultiplierAnywhere(original);
  const leadingAmount=takeLeadingNumericAmount(withoutMultiplier);
  const { amount: trailingAmount, text: withoutAmount } = takeAmount(leadingAmount?.text||withoutMultiplier);
  const spokenAmount=leadingAmount?.amount??trailingAmount;
  const cleanText = withoutAmount.replace(/[–—]/g, '-').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  const playerPart = findPlayerPrefix(cleanText, players);
  // Keep the original spelling for a custom reason. The normalised variant is
  // used only to identify a player and catalogue entry.
  const originalWords = cleanText.split(/\s+/);
  const consumedWords = playerPart.rawName ? playerPart.rawName.split(/\s+/).length : 0;
  const reasonMatch = matchReason(originalWords.slice(consumedWords).join(' '), reasons);
  const reasonCandidates=reasonMatch.price===null&&reasonMatch.reason
    ?suggestVoiceReasons(reasonMatch.reason,reasons)
    :[];
  const rate = spokenAmount ?? reasonMatch.price;
  const amount = rate==null?null:rate*multiplier;
  const issues = [];
  if (!playerPart.resolution.player) issues.push('player');
  if (!rate || rate <= 0) issues.push('amount');
  return { raw: original, rawName: playerPart.rawName, resolution: playerPart.resolution, reason: reasonMatch.reason, reasonCandidates, amount: amount || 0, rate: rate || 0, multiplier, usedCatalogPrice: spokenAmount === null && reasonMatch.price !== null, issues };
}

function applySpokenCorrections(transcript) {
  let text=String(transcript||'');
  const corrections=[];
  // Treat a spoken correction as an instruction, not as another fine. It is
  // intentionally limited to a single phrase on each side so normal reasons
  // and player names remain untouched.
  const command=/((?:^|[,;\n])\s*oprav(?:it)?\s+)([^,;\n]+?)\s+na\s+([^,;\n]+?)(?=\s*[,;\n]|\s*$)/giu;
  text=text.replace(command,(_,prefix,wrong,right)=>{
    const cleanWrong=wrong.replace(/[.!?]+$/g,'').trim();
    const cleanRight=right.replace(/[.!?]+$/g,'').trim();
    if(cleanWrong&&cleanRight) corrections.push({wrong:cleanWrong,right:cleanRight});
    return '';
  });
  for(const {wrong,right} of corrections){
    if(!/\s/.test(wrong)){
      const wanted=normalise(wrong);
      text=text.replace(/[\p{L}\d]+/gu,token=>normalise(token)===wanted?right:token);
    }else{
      const escaped=wrong.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      text=text.replace(new RegExp(`\\b${escaped}\\b`,'giu'),right);
    }
  }
  return text;
}

export function parseVoiceTranscript(transcript, players = [], reasons = []) {
  const corrected=applySpokenCorrections(transcript);
  return splitVoiceTranscript(corrected, players).map(chunk => parseVoiceChunk(chunk, players, reasons)).filter(Boolean);
}

export function scoreVoiceAlternative(text, players = [], reasons = []) {
  return parseVoiceTranscript(text, players, reasons).reduce((score, item) => score + (item.resolution.player ? 4 : 0) + (item.amount ? 2 : 0) + (item.reason ? 1 : 0), 0);
}
