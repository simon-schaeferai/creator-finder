// creator-finder: Instagram-Creator einer Nische über Google-Boolean-Suche finden (Apify) → Profildaten → CSV-Dateien.
//   node scripts/creator-finder.mjs --lauf <name> [--trocken] [--netzwerk [--seeds N --je-seed M]] [--trocken-netz]
//        [--nur-auswertung] [--neu-suchen] [--ohne-profile] [--min-follower N] [--max-follower N] [--seiten N] [--budget USD] [--ja]
// Eingabe: output/creator-finder/<name>/suche.json (Vorlage: vorlage/suche.json)
// Ablauf:  1  Google (apify/google-search-scraper), nur noch nicht gesuchte Anfragen → google.json
//          2a Autoren gefundener Beiträge auflösen (apify/instagram-scraper, posts) → autoren.json
//          2  Profil-Links herausziehen, Dubletten zusammenführen
//          3  Profildaten (apify/instagram-scraper, details) → profile.json
//          3b Netzwerk, nur mit --netzwerk: wem die passenden Creator folgen (apify/instagram-followers-following-scraper) → netz.json
//          5  Urteil je Anfrage nach passenden Creatorn → anfragen.json · 6 Keyword-Ideen aus den Bios → keywords.json
//          4  CSV-Dateien zum Import in Google Sheets oder Excel: creator.csv · aussortiert.csv · suchanfragen.csv · keyword-ideen.csv · info.csv
// Bezahlte Daten werden nie doppelt abgerufen. --trocken / --trocken-netz / --nur-auswertung kosten nichts.
// Token: APIFY_TOKEN aus der Umgebung, aus ./.env oder aus <skill>/.env.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Apify-Preise im Free-Plan (Stand 30.10.2026, nur für die Schätzung; bezahlte Pläne sind günstiger).
const PREIS = { googleSeite: 0.0045, instagramProfil: 0.0027, following: 0.002 };

// ---- Argumente ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i < 0 ? d : argv[i + 1]; };
const has = n => argv.includes(`--${n}`);
const fail = m => { console.error(`✗ ${m}`); process.exit(1); };
if (has('help') || !argv.length) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(0, 12).join('\n')); process.exit(0); }
const lauf = flag('lauf') || fail('--lauf fehlt, z. B. --lauf fitness-coaches (Ordner unter output/creator-finder/)');
const DIR = path.isAbsolute(lauf) || lauf.startsWith('.') ? path.resolve(lauf) : path.resolve('output/creator-finder', lauf);
const datei = n => path.join(DIR, n);
const lies = n => JSON.parse(fs.readFileSync(datei(n), 'utf8'));
const schreib = (n, v) => fs.writeFileSync(datei(n), JSON.stringify(v, null, 2));
const BUDGET = Number(flag('budget', 0)) || 0; // wird unten aus suche.json ergänzt
if (!fs.existsSync(datei('suche.json'))) fail(`${datei('suche.json')} fehlt. Lege den Ordner an und kopiere vorlage/suche.json hinein.`);
const suche = lies('suche.json');
const plattform = 'instagram';
if (suche.plattform && suche.plattform.toLowerCase() !== 'instagram') fail(`Plattform „${suche.plattform}“: der Skill sucht nur Instagram-Creator`);
const budget = BUDGET || Number(suche.budget || 5); // Kostengrenze je Aufruf in USD, darüber nur mit --ja
const seiten = Number(flag('seiten', suche.seiten || 1)); // site:-Anfragen liefern selten mehr als eine Seite
const minF = Number(flag('min-follower', suche.min_follower || 0));
const maxF = Number(flag('max-follower', suche.max_follower || 0));
const queries = (suche.queries || []).map(q => typeof q === 'string' ? { query: q, zweck: '' } : q);
if (!queries.length) fail('suche.json enthält keine queries');
for (const q of queries) if (q.query.split(/\s+/).length > 32) fail(`Anfrage über 32 Wörter (Google-Grenze): ${q.query}`);

// ---- Plattform-Regeln --------------------------------------------------------------------
const KEIN_PROFIL = new Set(['p', 'reel', 'reels', 'explore', 'stories', 'tv', 'accounts', 'about', 'developer', 'legal', 'directory', 'popular', 'web', 'direct', 'tags', 'locations']);
const PLATTFORM = {
  instagram: { profil(u) { const m = u.match(/instagram\.com\/([A-Za-z0-9._]{1,30})\/?(?:[?#].*)?$/i) || u.match(/instagram\.com\/([A-Za-z0-9._]{1,30})\/(?:reels?|tagged)\/?$/i); if (!m || KEIN_PROFIL.has(m[1].toLowerCase())) return null; const h = m[1].toLowerCase(); return { handle: h, link: `https://www.instagram.com/${h}/` }; } },
};

// Instagram-Beiträge/Reels: Google-Snippet „12 likes, 0 comments - handle on May 18, 2026: …“ bzw. „… - handle am 18. Mai 2026: …“ → Autor als Creator.
function beitragsAutor(t) {
  if (!/instagram\.com\/(?:[A-Za-z0-9._]+\/)?(?:p|reels?|tv)\//i.test(t.url || '')) return null;
  const m = `${t.snippet || ''} ${t.titel || ''}`.match(/(?:comments?|Kommentare?)\s*[-–]\s*([A-Za-z0-9._]{2,30})\s+(?:on|am)\s/i)
    || (t.url || '').match(/instagram\.com\/([A-Za-z0-9._]{2,30})\/(?:p|reels?)\//i);
  if (!m || KEIN_PROFIL.has(m[1].toLowerCase())) return null;
  const h = m[1].toLowerCase(); return { handle: h, link: `https://www.instagram.com/${h}/`, beitrag: true };
}

// „12K Followers“, „12.300 Follower“, „1,2 Mio. Abonnenten“, „5.4K subscribers“ → Zahl
function zahl(s) {
  if (!s) return null;
  const m = String(s).trim().match(/^([\d.,\s]+)\s*(k|tsd\.?|m|mio\.?)?$/i); if (!m) return null;
  let t = m[1].replace(/\s/g, ''); const e = (m[2] || '').toLowerCase();
  if (e) t = t.replace(',', '.'); else t = t.replace(/[.,](?=\d{3}(\D|$))/g, '');
  const n = parseFloat(t.replace(',', '.')); if (isNaN(n)) return null;
  return Math.round(n * (e.startsWith('k') || e.startsWith('t') ? 1e3 : e.startsWith('m') ? 1e6 : 1));
}
const FOLLOWER_RX = /([\d.,]+\s?(?:k|m|mio\.?|tsd\.?)?)\s*(?:followers?|abonnenten|subscribers|abonnent\*innen)/i;
const POSTS_RX = /([\d.,]+\s?(?:k|m)?)\s*(?:posts|beiträge|videos)/i;
const EMAIL_RX = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

// ---- Apify -------------------------------------------------------------------------------
// Reihenfolge: Umgebung → ./.env (Arbeitsordner) → <skill>/.env
function envWert(name) {
  if (process.env[name]) return process.env[name].trim();
  for (const f of [path.resolve('.env'), path.join(SKILL, '.env')]) {
    if (!fs.existsSync(f)) continue;
    const v = fs.readFileSync(f, 'utf8').match(new RegExp(`^\\s*${name}\\s*=\\s*(.*)$`, 'm'))?.[1]?.trim().replace(/^["']|["']$/g, '');
    if (v) return v;
  }
  return '';
}
function apifyKey() {
  return envWert('APIFY_TOKEN') || envWert('APIFY_API_KEY') || fail('APIFY_TOKEN fehlt. Token anlegen unter https://console.apify.com/settings/integrations und in eine .env-Datei schreiben: APIFY_TOKEN=apify_api_…');
}
async function actor(name, input) {
  const key = apifyKey(); const base = 'https://api.apify.com/v2'; const auth = { Authorization: `Bearer ${key}` };
  const start = await fetch(`${base}/acts/${name}/runs`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...auth }, body: JSON.stringify(input) });
  if (start.status === 401) fail('Apify lehnt den Token ab (HTTP 401). Prüfe APIFY_TOKEN.');
  if (start.status === 402 || start.status === 403) fail(`Apify verweigert den Start (HTTP ${start.status}): meist ist das Monatsguthaben aufgebraucht. ${await start.text()}`);
  if (!start.ok) fail(`${name} Start: HTTP ${start.status} ${await start.text()}`);
  let run = (await start.json()).data; console.log(`  ${name} läuft (Run ${run.id})`);
  while (!['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(run.status)) {
    const r = await fetch(`${base}/actor-runs/${run.id}?waitForFinish=60`, { headers: auth }); run = (await r.json()).data;
  }
  if (run.status !== 'SUCCEEDED') fail(`${name}: Run ${run.id} endete mit ${run.status}`);
  const items = await (await fetch(`${base}/datasets/${run.defaultDatasetId}/items?clean=true&format=json`, { headers: auth })).json();
  // Apify verbucht die Kosten erst kurz nach Laufende (Test 30.10.2026: 0,00 $ direkt danach, 0,32 $ eine Minute später).
  // Deshalb einmal nachladen und zusätzlich aus den abgerechneten Events nachrechnen; der höhere Wert zählt.
  await new Promise(r => setTimeout(r, 5000));
  run = (await (await fetch(`${base}/actor-runs/${run.id}`, { headers: auth })).json()).data || run;
  const preise = run.pricingInfo?.pricingPerEvent?.actorChargeEvents || {};
  const events = Object.entries(run.chargedEventCounts || {}).reduce((n, [e, c]) => n + c * (preise[e]?.eventPriceUsd || 0), 0);
  const kosten = Math.max(run.usageTotalUsd || 0, events) || null;
  console.log(`  ${name}: ${items.length} Datensätze, ${kosten != null ? '$' + kosten.toFixed(2) : 'Kosten siehe Apify-Konsole'}`);
  return { items, kosten, run: run.id };
}

// ---- Trockenlauf -------------------------------------------------------------------------
const schonGesucht = fs.existsSync(datei('google.json')) && !has('neu-suchen') ? new Set(lies('google.json').seiten.map(s => s.query)) : new Set();
const offeneQ = queries.filter(q => !schonGesucht.has(q.query));
const schaetzProfile = offeneQ.length * seiten * 8; // Obergrenze: ~8 Profile je Ergebnisseite vor Dubletten (Instagram: Beitrag auflösen + Profil laden)
const profilPreis = PREIS.instagramProfil;
const schaetzung = offeneQ.length * seiten * PREIS.googleSeite + (has('ohne-profile') ? 0 : schaetzProfile * profilPreis * 2); // Beitrag auflösen + Profil laden
if (has('trocken')) {
  console.log(`Nische: ${suche.nische} · Plattform: ${plattform} · ${queries.length} Anfragen, davon ${offeneQ.length} neu × ${seiten} Seiten = ${offeneQ.length * seiten} Google-Seiten`);
  offeneQ.forEach((q, i) => console.log(`  ${String(i + 1).padStart(2)}. ${q.query}${q.zweck ? `   (${q.zweck})` : ''}`));
  console.log(`Geschätzt: bis ~${schaetzProfile} Profile, Kosten ca. $${schaetzung.toFixed(2)} (Obergrenze; Dubletten senken sie). Budget je Aufruf: $${budget}.`);
  process.exit(0);
}
if (!has('nur-auswertung') && offeneQ.length && schaetzung > budget && !has('ja')) fail(`Geschätzte Kosten $${schaetzung.toFixed(2)} liegen über dem Budget von $${budget}. Weniger Anfragen nehmen, --budget erhöhen oder bewusst mit --ja starten.`);

// ---- 1 Google ----------------------------------------------------------------------------
// Nur Anfragen abfragen, die noch nicht in google.json stehen (neue Anfragen in suche.json ergänzen = Erweiterungsrunde ohne Doppelkosten).
// --neu-suchen verwirft google.json und fragt alles neu ab.
let google = fs.existsSync(datei('google.json')) && !has('neu-suchen') ? lies('google.json') : { seiten: [], kosten: 0 };
const gesucht = new Set(google.seiten.map(s => s.query));
const neueQ = queries.filter(q => !gesucht.has(q.query));
if (has('nur-auswertung') || !neueQ.length) {
  console.log(`1 Google: vorhandene google.json (${google.seiten.length} Seiten${neueQ.length ? `, ${neueQ.length} neue Anfragen übersprungen (--nur-auswertung)` : ''})`);
} else {
  console.log(`1 Google: ${neueQ.length} ${gesucht.size ? 'neue ' : ''}Anfragen × ${seiten} Seiten`);
  const r = await actor('apify~google-search-scraper', {
    queries: neueQ.map(q => q.query).join('\n'), maxPagesPerQuery: seiten,
    countryCode: flag('land', suche.land || 'de'), languageCode: flag('sprache', suche.sprache || 'de'),
    ...(suche.nur_sprache ? { searchLanguage: suche.nur_sprache } : {}), // lr-Filter: kostet bei Social-Profilen fast alle Treffer, nur bewusst setzen
    saveHtmlToKeyValueStore: false, includeUnfilteredResults: false,
  });
  const neu = r.items.map(p => ({ query: p.searchQuery?.term, seite: p.searchQuery?.page, treffer: (p.organicResults || []).map(o => ({ url: o.url, titel: o.title, snippet: o.description, position: o.position })) }));
  // Anfragen ohne Ergebnisseite trotzdem vermerken, damit sie nicht bei jedem Lauf erneut bezahlt werden
  for (const q of neueQ) if (!neu.some(s => s.query === q.query)) neu.push({ query: q.query, seite: 1, treffer: [] });
  google = { seiten: [...google.seiten, ...neu], kosten: (google.kosten || 0) + (r.kosten || 0), runs: [...(google.runs || (google.run ? [google.run] : [])), r.run] };
  schreib('google.json', google);
}

// ---- 2 Profile herausziehen --------------------------------------------------------------
// Instagram-Beiträge ohne Handle im Snippet: Autor über den Beitrag selbst auflösen (apify~instagram-scraper, ownerUsername), Ergebnis in autoren.json.
const istBeitrag = u => /instagram\.com\/(?:[A-Za-z0-9._]+\/)?(?:p|reels?|tv)\/([A-Za-z0-9_-]+)/i.test(u || '');
const kurz = u => (u || '').match(/\/(?:p|reels?|tv)\/([A-Za-z0-9_-]+)/i)?.[1];
let autoren = fs.existsSync(datei('autoren.json')) ? lies('autoren.json') : { autor: {}, kosten: 0 };
const offen = [...new Set(google.seiten.flatMap(s => s.treffer).filter(t => istBeitrag(t.url) && !beitragsAutor(t) && !(kurz(t.url) in autoren.autor)).map(t => t.url.split('?')[0]))];
if (offen.length && !has('nur-auswertung') && !has('ohne-profile')) {
  console.log(`2a Beitrags-Autoren: ${offen.length} Beiträge auflösen`);
  const r = await actor('apify~instagram-scraper', { directUrls: offen, resultsType: 'posts', resultsLimit: 1, addParentData: false });
  for (const d of r.items) if (d.shortCode && d.ownerUsername) autoren.autor[d.shortCode] = d.ownerUsername.toLowerCase();
  for (const u of offen) if (!(kurz(u) in autoren.autor)) autoren.autor[kurz(u)] = null; // nicht auflösbar (gelöscht/privat), nicht erneut bezahlen
  autoren.kosten += r.kosten || 0; schreib('autoren.json', autoren);
}
const aufgeloest = t => { if (!istBeitrag(t.url)) return null; const h = autoren.autor[kurz(t.url)]; return h && !KEIN_PROFIL.has(h) ? { handle: h, link: `https://www.instagram.com/${h}/`, beitrag: true } : null; };

const creator = new Map(); const proQuery = new Map(queries.map(q => [q.query, { treffer: 0, profile: new Set(), neu: 0 }]));
for (const s of google.seiten) for (const t of s.treffer) {
  const p = PLATTFORM[plattform].profil(t.url || '') || beitragsAutor(t) || aufgeloest(t); const st = proQuery.get(s.query) || proQuery.set(s.query, { treffer: 0, profile: new Set(), neu: 0 }).get(s.query);
  st.treffer++; if (!p) continue;
  if (!st.profile.has(p.handle)) { st.profile.add(p.handle); if (!creator.has(p.handle)) st.neu++; }
  const c = creator.get(p.handle) || creator.set(p.handle, { handle: p.handle, link: p.link, queries: new Set(), fundstellen: new Set(), bestePosition: 99 }).get(p.handle);
  c.queries.add(s.query); c.fundstellen.add(p.beitrag ? 'Beitrag' : 'Profil');
  // Titel/Snippet bevorzugt von der Profilseite (dort stehen Name und Follower), sonst vom bestplatzierten Beitrag
  const besser = !p.beitrag && !c.profilTreffer || (!!p.beitrag === !c.profilTreffer && (t.position ?? 99) < c.bestePosition);
  if (besser || c.titel === undefined) Object.assign(c, { bestePosition: t.position ?? 99, titel: t.titel, snippet: t.snippet, profilTreffer: c.profilTreffer || !p.beitrag });
  if (p.beitrag) c.beispiel = c.beispiel || t.url;
}
for (const c of creator.values()) {
  const txt = `${c.titel || ''} ${c.snippet || ''}`;
  c.follower_snippet = zahl(txt.match(FOLLOWER_RX)?.[1]); c.posts_snippet = zahl(txt.match(POSTS_RX)?.[1]);
  c.name_snippet = c.profilTreffer ? (c.titel || '').replace(/\s*[(•|].*$/, '').replace(/ on Instagram.*$/i, '').trim() : '';
  if (!c.profilTreffer) c.follower_snippet = c.posts_snippet = null; // Beitrags-Snippets zählen Likes, keine Follower
}
console.log(`2 Profile: ${creator.size} eindeutige ${plattform}-Profile aus ${google.seiten.reduce((n, s) => n + s.treffer.length, 0)} Treffern`);

// ---- 3 Profildaten -----------------------------------------------------------------------
let profile = fs.existsSync(datei('profile.json')) ? lies('profile.json') : { daten: {}, kosten: 0, fehlt: [] };
profile.fehlt ||= [];
async function ladeProfile(stufe) {
const fehlend = [...creator.keys()].filter(h => !profile.daten[h] && !profile.fehlt.includes(h));
if (!has('ohne-profile') && !has('nur-auswertung') && fehlend.length) {
  console.log(`${stufe} Profildaten: ${fehlend.length} ${plattform}-Profile`);
  for (let i = 0; i < fehlend.length; i += 200) {
    const teil = fehlend.slice(i, i + 200);
    const r = await actor('apify~instagram-scraper', { directUrls: teil.map(h => `https://www.instagram.com/${h}/`), resultsType: 'details', resultsLimit: 1, addParentData: false });
    for (const d of r.items) { if (!d.username || d.error) continue; profile.daten[d.username.toLowerCase()] = {
      name: d.fullName?.trim() || '', follower: d.followersCount ?? null, folgt: d.followsCount ?? null, posts: d.postsCount ?? null,
      verifiziert: d.verified ?? null, privat: d.private ?? null, business: d.isBusinessAccount ?? null, kategorie: d.businessCategoryName && d.businessCategoryName !== 'None' ? d.businessCategoryName : '',
      bio: (d.biography || '').trim(), website: d.externalUrl || (d.externalUrls || [])[0]?.url || '', email: d.businessEmail || d.publicEmail || '',
      telefon: d.businessPhoneNumber || '', letzter_post: (d.latestPosts || []).map(p => p.timestamp).filter(Boolean).sort().pop() || '' }; }
    profile.kosten += r.kosten || 0;
    for (const h of teil) if (!profile.daten[h] && !profile.fehlt.includes(h)) profile.fehlt.push(h); // nicht ladbar (umbenannt/gesperrt): nicht erneut bezahlen
    schreib('profile.json', profile);
  }
} else console.log(`${stufe} Profildaten: ${has('ohne-profile') ? 'übersprungen (--ohne-profile)' : 'alle vorhanden'}`);
}
await ladeProfile('3');

// ---- Zeilen + Nischenprüfung --------------------------------------------------------------
const baueZeilen = () => [...creator.values()].map(c => {
  const d = profile.daten[c.handle] || {};
  const follower = d.follower ?? c.follower_snippet ?? null;
  const email = d.email || (d.bio || '').match(EMAIL_RX)?.[0] || (c.snippet || '').match(EMAIL_RX)?.[0] || '';
  const name = d.name || c.name_snippet || '', bio = d.bio || '';
  return { handle: '@' + c.handle, name: name.replace(/\s*\n+\s*/g, ' '), link: c.link, follower,
    follower_quelle: d.follower != null ? 'Profil' : c.follower_snippet != null ? 'Google-Snippet' : '', posts: d.posts ?? c.posts_snippet ?? '',
    folgt: d.folgt ?? '', verifiziert: d.verifiziert == null ? '' : d.verifiziert ? 'ja' : 'nein', privat: d.privat == null ? '' : d.privat ? 'ja' : 'nein',
    business: d.business == null ? '' : d.business ? 'ja' : 'nein', kategorie: d.kategorie || '', bio: bio.replace(/\s*\n+\s*/g, ' · '), email, telefon: d.telefon || '', website: d.website || '',
    letzter_post: (d.letzter_post || '').slice(0, 10), gefunden_als: [...c.fundstellen].join(' + '), beispiel: c.beispiel || '', anfragen: c.queries.size, gefunden_ueber: [...c.queries].join(' | '), google_titel: c.titel || '', google_snippet: c.snippet || '',
    profildaten: profile.daten[c.handle] ? 'ja' : 'nein', netz: c.netz ? [...c.netz] : [], netz_txt: c.netz ? `${c.netz.size}: ${[...c.netz].slice(0, 8).map(h => '@' + h).join(', ')}` : '' };
}).sort((a, b) => (b.follower ?? -1) - (a.follower ?? -1));
// Aussortieren mit Grund: privat · Follower-Spanne · Organisation (Kategorie/Name) · Bio und Name ohne Nischenwort (nur wenn suche.nischen_woerter gesetzt)
const NISCHE = (suche.nischen_woerter || []).map(w => w.toLowerCase());
const ORGA_RX = new RegExp(suche.organisation_rx || 'government|ministerium|universit|college|hochschule|school|schule|volkshochschule|vhs|bank|nonprofit|museum|theater|media\\/news|news company|magazin|regional website|stadt |gemeinde|verband|official account|offizieller account', 'i');
const wort = (text, w) => new RegExp(`(^|[^a-zäöüß0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-zäöüß0-9]|$)`, 'i').test(text);
// Sprache der Bio (nur Deutsch umgesetzt): Funktionswörter DE gegen EN zählen, Umlaute und das deutsche „KI“ zählen für DE. Kalibriert 28.10.2026 an 206 Bios.
const DE_W = new Set('und für mit ich dein deine deinen dich dir wie nicht mehr zu der die das ohne auf bei von ist sind wir uns euch ihr sie zum zur im ins einfach jetzt hier alles werden wird kein keine meine mein mich mir oder auch nur noch schon über unter vom weniger ganz helfe zeige lerne erklärt gründer tipps'.split(' '));
const EN_W = new Set('the and you your with for to of my is are we our it in on at this that how what from be by i me helping help daily follow get'.split(' '));
function istDeutsch(t) {
  let d = 0, e = 0;
  for (const w of (t.toLowerCase().match(/[a-zäöüß]+/g) || [])) { if (DE_W.has(w)) d++; if (EN_W.has(w)) e++; if (/[äöüß]/.test(w)) d += 0.5; }
  if (/(^|[^a-zäöüß])ki([^a-zäöüß]|$)/i.test(t)) d += 1.5;
  return d >= 1.5 && d > e;
}
const SPRACHE = (suche.sprache_filter || '').toLowerCase();
// Ort aus dem Google-Snippet („München, Bayern, Deutschland“) bzw. 📍 in der Bio. Ein DACH-Ort zählt beim Sprachfilter DE als deutsch,
// weil deutsche Creator ihre Bio oft englisch schreiben (📍-Ort in der Bio).
const ORT_RX = /([A-ZÄÖÜ][A-Za-zÄÖÜäöüß.\- ]{1,40},\s*(?:[A-ZÄÖÜ][A-Za-zÄÖÜäöüß.\- ]{1,40},\s*)?)?(Deutschland|Germany|Österreich|Austria|Schweiz|Switzerland)\b/;
const ortVon = t => ((t || '').match(ORT_RX) || [''])[0].split(/[.·|•]\s+/).pop().trim(); // „… Monate. Hamburg, Deutschland“ → „Hamburg, Deutschland“
function grund(z) {
  if (z.privat === 'ja') return 'privat';
  if (minF && (z.follower ?? 0) < minF) return z.follower == null ? 'Follower unbekannt' : `unter ${minF} Follower`;
  if (maxF && (z.follower ?? 0) > maxF) return `über ${maxF} Follower`;
  if (ORGA_RX.test(`${z.kategorie} ${z.name} ${z.bio.slice(0, 80)}`)) return 'Organisation';
  if (NISCHE.length && !NISCHE.some(w => wort(`${z.name} ${z.bio} ${z.kategorie}`, w))) return 'Bio ohne Nischenwort';
  if (SPRACHE === 'de' && z.profildaten === 'ja' && !z.ort && !istDeutsch(`${z.name} ${z.bio}`)) return 'Bio nicht deutschsprachig';
  return '';
}
// Creator-Signal: Hinweis in Name/Bio, dass jemand selbst Inhalte macht (nicht nur berät oder verkauft).
const CREATOR_RX = /creator|influencer|podcast|newsletter|youtube|tiktok|follower|abonnent|community|kanal|blogger|autor(in)?\b|speaker/i;
const bewerte = zs => { for (const z of zs) {
  z.ort = ortVon(`${z.bio} ${z.google_snippet}`);
  z.sprache = z.profildaten === 'ja' ? (istDeutsch(`${z.name} ${z.bio}`) ? 'deutsch' : z.ort ? 'andere (Ort DACH)' : 'andere') : '';
  z.creator_signal = (`${z.name} ${z.bio}`.match(CREATOR_RX) || [''])[0].toLowerCase();
  z.grund = grund(z); } return zs; };
let zeilen = bewerte(baueZeilen());

// ---- 3b Netzwerk: wem die passenden Creator folgen (nur Instagram) --------------------------
// apify~instagram-followers-following-scraper, Modus following. Kandidat = von ≥ min_gemeinsam Seeds gefolgt ODER Nischenwort im Namen/Handle.
// Jeder Aufruf mit --netzwerk nimmt die nächsten noch nicht abgefragten passenden Creator als Seeds (Schneeball über mehrere Läufe).
let netz = fs.existsSync(datei('netz.json')) ? lies('netz.json') : { folgt: {}, kosten: 0 };
const NETZ = { seeds: 20, je_seed: 200, min_gemeinsam: 2, max_kandidaten: 600, ...(suche.netzwerk || {}) };
if (flag('seeds')) NETZ.seeds = Number(flag('seeds'));
if (flag('je-seed')) NETZ.je_seed = Number(flag('je-seed'));
// Nischenwort als eigener Teil des Handles („laufcoach.anna“) oder, ab 5 Zeichen, irgendwo darin („annaslaufcoach“).
const handleTreffer = h => h.split(/[._\d]+/).some(t => NISCHE.includes(t)) || NISCHE.some(w => w.length >= 5 && !/\s/.test(w) && h.includes(w));
if ((has('netzwerk') || has('trocken-netz')) && !has('nur-auswertung')) {
  const seeds = zeilen.filter(z => !z.grund && !(z.handle.slice(1) in netz.folgt)).slice(0, NETZ.seeds).map(z => z.handle.slice(1));
  const netzKosten = seeds.length * NETZ.je_seed * PREIS.following;
  if (has('trocken-netz')) { console.log(`3b Netzwerk (Schätzung): ${seeds.length} Seeds × ${NETZ.je_seed} = bis ${seeds.length * NETZ.je_seed} Einträge, ca. $${netzKosten.toFixed(2)} + Profile der Kandidaten (je $${PREIS.instagramProfil})`); process.exit(0); }
  if (seeds.length && netzKosten > budget && !has('ja')) fail(`Netzwerk-Runde geschätzt $${netzKosten.toFixed(2)} (ohne Kandidaten-Profile), Budget $${budget}. --seeds/--je-seed senken, --budget erhöhen oder --ja.`);
  if (seeds.length) {
    console.log(`3b Netzwerk: ${seeds.length} Seeds × bis ${NETZ.je_seed} gefolgte Konten`);
    const r = await actor('apify~instagram-followers-following-scraper', { usernames: seeds, dataToScrape: 'following', resultsLimit: NETZ.je_seed });
    for (const s of seeds) netz.folgt[s] ||= [];
    for (const d of r.items) if (d.sourceUsername && d.username) netz.folgt[d.sourceUsername.toLowerCase()]?.push({ u: d.username.toLowerCase(), n: d.fullName || '', p: !!d.isPrivate, v: !!d.isVerified });
    netz.kosten += r.kosten || 0; schreib('netz.json', netz);
  }
}
if (Object.keys(netz.folgt).length) {
  const kand = new Map();
  for (const [seed, liste] of Object.entries(netz.folgt)) for (const k of liste) {
    if (k.p) continue;
    const e = kand.get(k.u) || kand.set(k.u, { ...k, von: new Set() }).get(k.u); e.von.add(seed);
  }
  // Nischensignal im Handle/Namen; bei Sprachfilter DE zählt „ki“ bzw. ein Umlaut im Namen als deutsches Signal und rückt nach vorn.
  const nische = k => handleTreffer(k.u) || NISCHE.some(w => wort(k.n, w));
  // Deutsches Signal: Umlaut im Namen; „ki“ im Handle/Namen nur, wenn „KI“ zu den Nischenwörtern gehört.
  const kiNische = NISCHE.includes('ki');
  const deSignal = k => /[äöüß]/i.test(k.n) || (kiNische && (/(^|[._\d])ki([._\d]|$)/.test(k.u) || /(^|[^a-zäöüß])ki([^a-zäöüß]|$)/i.test(k.n)));
  const punkte = k => k.von.size + (nische(k) ? 2 : 0) + (SPRACHE === 'de' && deSignal(k) ? 3 : 0);
  // Gemessen 28.10.2026 (429 Kandidaten): Nischen- + DE-Signal passten zu 57–100 %, alle anderen Gruppen zu 3–15 %.
  // Mit Sprachfilter DE werden deshalb nur Kandidaten mit DE-Signal (plus Nische oder ≥2 Seeds) oder sehr breit gefolgte (≥4 Seeds) geladen.
  // Ohne „KI“ als Nischenwort (Frischtest Laufcoaches 30.10.2026: 2 Kandidaten aus 173 Konten) zählt auch Nische + mehrere Seeds.
  const lohnt = k => SPRACHE === 'de'
    ? (deSignal(k) && (nische(k) || k.von.size >= NETZ.min_gemeinsam)) || (!kiNische && nische(k) && k.von.size >= NETZ.min_gemeinsam) || k.von.size >= 4
    : k.von.size >= NETZ.min_gemeinsam || nische(k);
  // Bereits geladene Kandidaten bleiben im Lauf, auch wenn sie die verschärfte Auswahl nicht mehr treffen (Daten sind bezahlt).
  const auswahl = [...kand.values()].filter(k => !creator.has(k.u) && !KEIN_PROFIL.has(k.u) && (lohnt(k) || profile.daten[k.u]))
    .sort((a, b) => punkte(b) - punkte(a)).slice(0, NETZ.max_kandidaten);
  for (const k of auswahl) creator.set(k.u, { handle: k.u, link: `https://www.instagram.com/${k.u}/`, queries: new Set(), fundstellen: new Set(['Netzwerk']), netz: k.von, bestePosition: 99 });
  for (const c of creator.values()) if (c.netz === undefined && kand.has(c.handle)) { c.netz = kand.get(c.handle).von; c.fundstellen.add('Netzwerk'); }
  console.log(`3b Netzwerk: ${kand.size} gefolgte Konten aus ${Object.keys(netz.folgt).length} Seeds, ${auswahl.length} neue Kandidaten${SPRACHE === "de" ? " (DE-Signal + Nische/≥2 Seeds, Nische + ≥2 Seeds oder ≥4 Seeds)" : ` (≥${NETZ.min_gemeinsam} Seeds oder Nischenwort im Namen)`}`);
  await ladeProfile('3c');
  zeilen = bewerte(baueZeilen());
}
const drin = zeilen.filter(z => !z.grund), draussen = zeilen.filter(z => z.grund);
schreib('creator.json', zeilen);
const gruende = draussen.reduce((m, z) => (m[z.grund] = (m[z.grund] || 0) + 1, m), {});
console.log(`  ${drin.length} passende Creator, ${draussen.length} aussortiert (${Object.entries(gruende).map(([g, n]) => `${g}: ${n}`).join(', ') || '–'})`);

// ---- 5 Auswertung je Anfrage: wie viele PASSENDE Creator hat sie gebracht? ---------------------
// Maßstab für die nächste Runde ist „passende Creator“, nicht „Profile“: im Lasttest 28.10. brachten 19 von 49 Anfragen Profile, aber keinen einzigen passenden Creator.
const passtSet = new Set(drin.map(z => z.handle.slice(1)));
const bewertung = queries.map(q => {
  const st = proQuery.get(q.query) || { treffer: 0, profile: new Set(), neu: 0 };
  const passend = [...st.profile].filter(h => passtSet.has(h));
  return { query: q.query, zweck: q.zweck || '', treffer: st.treffer, profile: st.profile.size, passend: passend.length,
    urteil: !st.treffer ? 'tot (0 Treffer)' : !passend.length ? 'raus (nur Fremdtreffer)' : passend.length >= 3 ? 'stark' : 'behalten' };
}).sort((a, b) => b.passend - a.passend || b.treffer - a.treffer);
schreib('anfragen.json', bewertung);

// ---- 6 Keyword-Recherche aus den Bios der passenden Creator (0 $) ------------------------------
// Wie beschreiben sich die gefundenen Creator selbst? Wortgruppen mit Nischenwort (z. B. „KI für Coaches“, „KI Mentorin“), die in ≥2 passenden Bios
// vorkommen und noch keine Anfrage sind, werden als nächste Suchanfragen vorgeschlagen. Liefert die nächste Runde aus echten Daten statt aus Vermutungen.
const STOP = new Set([...DE_W, ...EN_W, 'a', 'an', 'als', 'am', 'an', 'aus', 'bis', 'da', 'dass', 'du', 'ein', 'eine', 'einen', 'einem', 'er', 'es', 'man', 'so', 'was', 'wenn', 'z', 'b', 'co']);
const benutzt = queries.map(q => q.query.toLowerCase());
const phrasen = new Map();
for (const z of drin) {
  const toks = `${z.name} · ${z.bio}`.replace(/(\S)[.&]+(\s|$)/g, '$1 # ').replace(/\s&\s/g, ' # ').replace(/[|•·,;:!?()"“”„\[\]{}/+]+/g, ' # ').split(/\s+/).map(t => t.replace(/^[^a-zäöüß0-9-]+|[^a-zäöüß0-9-]+$/gi, '')).filter(Boolean);
  const gesehen = new Set();
  for (let i = 0; i < toks.length; i++) {
    if (!NISCHE.includes(toks[i].toLowerCase())) continue;
    for (const [von, bis] of [[i, i + 1], [i - 1, i], [i, i + 2], [i - 2, i]]) {
      if (von < 0 || bis >= toks.length) continue;
      const teil = toks.slice(von, bis + 1);
      if (teil.includes('#') || teil.some(t => /^\d+$/.test(t)) || STOP.has(teil[0].toLowerCase()) || STOP.has(teil[teil.length - 1].toLowerCase())) continue;
      // Sinnvolle Wortgruppe: „KI für X“ / „X mit KI“ (Verbindungswort in der Mitte) oder Nischenwort + großgeschriebene Wörter („KI Mentorin“, „Claude Code“).
      // Kleingeschriebene Bruchstücke („KI digitale“) und doppelte Nischenwörter („AI KI“) fallen raus.
      const rest = teil.filter(t => !NISCHE.includes(t.toLowerCase()));
      const verbund = teil.length === 3 && ['für', 'mit', 'ohne', 'im', 'in', 'statt'].includes(teil[1].toLowerCase()) && !STOP.has(teil[0].toLowerCase()) && !STOP.has(teil[2].toLowerCase());
      if (!rest.length || (!verbund && !rest.every(t => /^[A-ZÄÖÜ0-9]/.test(t)))) continue;
      if (!verbund && !NISCHE.includes(teil[0].toLowerCase())) continue; // ohne Verbund steht das Nischenwort vorn („KI Systeme“, „AI Content Creator“), nicht „Zeit KI“
      const ph = teil.join(' '); const key = ph.toLowerCase();
      if (gesehen.has(key) || key.length < 5) continue; gesehen.add(key);
      const e = phrasen.get(key) || phrasen.set(key, { phrase: ph, creator: [] }).get(key); e.creator.push(z.handle);
    }
  }
}
const basis = 'site:instagram.com';
const keywords = [...phrasen.values()].filter(e => e.creator.length >= 2 && !benutzt.some(b => b.includes(`"${e.phrase.toLowerCase()}"`)))
  .sort((a, b) => b.creator.length - a.creator.length).slice(0, 60)
  .map(e => ({ phrase: e.phrase, creator: e.creator.length, beispiele: e.creator.slice(0, 4).join(', '), anfrage: `${basis} "${e.phrase}"` }));
schreib('keywords.json', keywords);
console.log(`5 Auswertung: ${bewertung.filter(b => b.urteil === 'stark').length} starke, ${bewertung.filter(b => b.urteil.startsWith('raus') || b.urteil.startsWith('tot')).length} wirkungslose Anfragen · 6 Keyword-Ideen: ${keywords.length} neue Wortgruppen aus ${drin.length} Bios`);

// ---- 4 CSV-Dateien ------------------------------------------------------------------------
// UTF-8 mit BOM und Komma als Trenner: Google Sheets (Datei → Importieren) und Excel erkennen Umlaute so richtig.
const KOPF = ['Handle', 'Name', 'Profil-Link', 'Follower', 'Follower-Quelle', 'Beiträge', 'Folgt', 'Verifiziert', 'Privat', 'Business-Konto', 'Kategorie', 'Bio', 'Creator-Signal', 'Ort', 'E-Mail', 'Telefon', 'Website', 'Letzter Beitrag', 'Bio-Sprache', 'Gefunden als', 'Beispiel-Beitrag', 'Treffer in Anfragen', 'Gefunden über', 'Gefolgt von (Seeds)', 'Google-Titel', 'Google-Snippet', 'Profildaten geladen', 'Status', 'Notiz'];
const FELDER = ['handle', 'name', 'link', 'follower', 'follower_quelle', 'posts', 'folgt', 'verifiziert', 'privat', 'business', 'kategorie', 'bio', 'creator_signal', 'ort', 'email', 'telefon', 'website', 'letzter_post', 'sprache', 'gefunden_als', 'beispiel', 'anfragen', 'gefunden_ueber', 'netz_txt', 'google_titel', 'google_snippet', 'profildaten'];
const sicher = v => typeof v === 'string' && /^[=+\-@]/.test(v) ? `'${v}` : (v ?? ''); // keine Formeln aus fremden Bios
const blatt = (zs, mitGrund) => [[...KOPF, ...(mitGrund ? ['Grund'] : [])], ...zs.map(z => [...FELDER.map(f => sicher(z[f])), mitGrund ? 'raus' : 'offen', '', ...(mitGrund ? [z.grund] : [])])];
const anfragenBlatt = [['Anfrage', 'Zweck', 'Google-Treffer', 'Profile gefunden', 'Passende Creator', 'Urteil'], ...bewertung.map(b => [sicher(b.query), b.zweck, b.treffer, b.profile, b.passend, b.urteil])];
const keywordBlatt = [['Wortgruppe', 'In passenden Bios', 'Beispiele', 'Vorgeschlagene Anfrage'], ...keywords.map(k => [sicher(k.phrase), k.creator, sicher(k.beispiele), sicher(k.anfrage)])];
const kostenGesamt = (google.kosten || 0) + (autoren.kosten || 0) + (profile.kosten || 0) + (netz.kosten || 0);
const infoBlatt = [['Feld', 'Wert'], ['Nische', suche.nische || ''], ['Plattform', plattform], ['Stand', new Date().toLocaleString('sv-SE').slice(0, 16)], ['Anfragen', queries.length], ['Netzwerk-Seeds', Object.keys(netz.folgt).length], ['Seiten je Anfrage', seiten], ['Profile gesamt', zeilen.length], ['Passende Creator', drin.length], ['Mit E-Mail', drin.filter(z => z.email).length], ['Aussortiert', `${draussen.length} (${Object.entries(gruende).map(([g, n]) => `${g}: ${n}`).join(', ') || '–'})`], ['Nischenwörter', NISCHE.join(', ') || '– (keine Nischenprüfung)'], ['Sprachfilter', SPRACHE || '– (aus)'], ['Follower-Spanne', `${minF || 0} bis ${maxF || 'offen'}`], ['Apify-Kosten', kostenGesamt ? `$${kostenGesamt.toFixed(2)}` : 'siehe Apify-Konsole'], ['Rohdaten', DIR], ['Hinweis', 'Follower-Quelle „Google-Snippet“ = Stand der Google-Indexierung, kann Wochen alt sein. Status-Spalte zum Abarbeiten: offen · passt · kontaktiert · raus.']];
const csvZelle = v => { const t = String(v ?? ''); return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
const csv = rows => '\ufeff' + rows.map(r => r.map(csvZelle).join(',')).join('\r\n') + '\r\n';
const DATEIEN = [['creator.csv', blatt(drin)], ['aussortiert.csv', blatt(draussen, true)], ['suchanfragen.csv', anfragenBlatt], ['keyword-ideen.csv', keywordBlatt], ['info.csv', infoBlatt]];
for (const [n, rows] of DATEIEN) fs.writeFileSync(datei(n), csv(rows));
console.log(`4 CSV: ${DATEIEN.map(([n]) => n).join(' · ')} in ${DIR}`);
console.log(`Fertig: ${drin.length} passende Creator (${drin.filter(z => z.email).length} mit E-Mail), ${draussen.length} aussortiert, Kosten ${kostenGesamt ? '$' + kostenGesamt.toFixed(2) : 'siehe Apify'}`);
