// Builds the small price files CollectThemAll reads, from Cardmarket's free daily price guide and product catalogue.
// Run: node scripts/build.mjs [--from <folder with downloaded files>]
// Writes data/onepiece.json, data/sealed.json, data/meta.json and, once a week, data/history/<date>.csv.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildJapanese, downloadJapanese } from './pokemonJa.mjs';
import { downloadEnglish, matchEnglishImages } from './pokemonImages.mjs';
import { buildReleaseDates, downloadReleaseSources } from './releaseDates.mjs';
import { cloneTcgdex, priceCards, readDataFolder } from './tcgdexPrices.mjs';
import { expansionLabels, onePieceExtras, pokemonExtras } from './cardmarketExtras.mjs';
import { tmpdir } from 'node:os';

const CM = 'https://downloads.s3.cardmarket.com/productCatalog';
const GAMES = { pokemon: 6, onepiece: 18 };
const OUT = new URL('../data/', import.meta.url).pathname;
const from = process.argv.includes('--from') ? process.argv[process.argv.indexOf('--from') + 1] : null;

async function load(path) {
  if (from) return JSON.parse(await readFile(join(from, path.split('/').pop()), 'utf8'));
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${CM}/${path}`, { headers: { 'User-Agent': 'collectthemall-prices (personal collection app)' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt >= 3) throw new Error(`${path}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
  }
}

const num = (x) => (typeof x === 'number' && x > 0 ? Math.round(x * 100) / 100 : null);
/** [trend, avg30, low, avg7, avg1] — the app uses trend, then the 30-day average; the 7- and 1-day averages show
 * where a price is going (added at the end, so older versions of the app read the rows as before). */
/** The names of these expansions only. */
const labelsFor = (labels, ids) => Object.fromEntries([...new Set(ids)].filter((id) => labels[id]).map((id) => [id, labels[id]]));
const priceRow = (g) => (g ? [num(g.trend), num(g.avg30), num(g.low), num(g.avg7), num(g.avg1)] : [null, null, null, null, null]);

const CODE = /\(([A-Z]{1,4}\d{0,2}-\d{2,3})\)/;

/**
 * One Piece singles: Cardmarket names every version of a card the same ("Shanks (OP01-120)"), in separate expansions
 * for English and for Japanese ("Non-English") prints. For each card code we find the main English and Japanese
 * expansion of its set (the expansion whose cards mostly carry that set's prefix, told apart by the "(Non-English)"
 * boxes in it) and list the versions in Cardmarket's product order: normal, then parallels.
 */
export function indexOnePiece(singles, nonsingles) {
  const boxNames = new Map();
  for (const p of nonsingles) boxNames.set(p.idExpansion, [...(boxNames.get(p.idExpansion) ?? []), p.name]);
  const kindOf = (exp) => {
    const names = boxNames.get(exp) ?? [];
    if (names.some((n) => /pre-errata/i.test(n))) return 'skip';
    if (names.some((n) => /non-english/i.test(n))) return 'ja';
    return 'en';
  };

  const byExp = new Map();
  for (const p of singles) {
    const m = CODE.exec(p.name);
    if (!m) continue;
    const code = m[1];
    if (!byExp.has(p.idExpansion)) byExp.set(p.idExpansion, new Map());
    const codes = byExp.get(p.idExpansion);
    codes.set(code, [...(codes.get(code) ?? []), p.idProduct]);
  }
  // Main expansions per prefix and language: most products with that prefix wins.
  const main = new Map();
  for (const [exp, codes] of byExp) {
    const kind = kindOf(exp);
    if (kind === 'skip') continue;
    const prefixes = new Map();
    for (const [code, ids] of codes) prefixes.set(code.split('-')[0], (prefixes.get(code.split('-')[0]) ?? 0) + ids.length);
    for (const [prefix, n] of prefixes) {
      if (prefix === 'P') continue;
      const key = `${prefix}|${kind}`;
      const cur = main.get(key);
      if (!cur || n > cur.n) main.set(key, { exp, n });
    }
  }
  return { byExp, main, kindOf };
}

export function buildOnePiece(singles, nonsingles, guide, index = indexOnePiece(singles, nonsingles)) {
  const price = new Map(guide.map((g) => [g.idProduct, g]));
  const { byExp, main, kindOf } = index;
  const cards = {};
  const add = (code, lang, ids) => {
    const rows = ids.sort((a, b) => a - b).map((id) => [id, ...priceRow(price.get(id))]);
    (cards[code] ??= {})[lang] = rows;
  };
  for (const [key, { exp }] of main) {
    const [, lang] = key.split('|');
    const prefix = key.split('|')[0];
    for (const [code, ids] of byExp.get(exp)) if (code.startsWith(`${prefix}-`)) add(code, lang, [...ids]);
  }
  // Promos (P-001…) are spread over many event expansions: every product with the code, in release order.
  const promos = new Map();
  for (const [exp, codes] of byExp) {
    if (kindOf(exp) === 'skip') continue;
    for (const [code, ids] of codes) if (code.startsWith('P-')) promos.set(code, [...(promos.get(code) ?? []), ...ids]);
  }
  for (const [code, ids] of promos) add(code, 'en', ids);
  return cards;
}

/* ------------------------------------------------------------------ reprints (PRB, Extra Boosters, special cards, decks) */

/** The card-code prefixes of an OPTCG set: "OP-05" → OP05, "PRB-01" → PRB01, "OP14-EB04" → OP14 and EB04. */
export function setPrefixes(setId) {
  return /^[A-Z]+-\d+$/.test(setId) ? [setId.replace('-', '')] : setId.split('-');
}

const versionOf = (imageId) => { const m = /_p(\d+)$/i.exec(imageId); return m ? Number(m[1]) : 0; };
function compareNumbers(a, b) {
  const na = parseInt(a, 10), nb = parseInt(b, 10);
  const ia = isNaN(na), ib = isNaN(nb);
  if (ia !== ib) return ia ? 1 : -1;
  if (!ia && na !== nb) return na - nb;
  return a.localeCompare(b, undefined, { numeric: true });
}
function versionSlug(name) {
  const labels = [...name.matchAll(/\(([^)]+)\)/g)].map((m) => m[1]).filter((l) => !/^\d+$/.test(l));
  return labels.join(' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** The ids the app gives the cards of a set (same order and rules as its sortCards and refsFromOP). */
export function appIds(cards) {
  const sorted = [...cards].sort((a, b) => compareNumbers(a.card_set_id.split('-').pop() ?? '', b.card_set_id.split('-').pop() ?? '')
    || a.card_set_id.localeCompare(b.card_set_id) || versionOf(a.card_image_id) - versionOf(b.card_image_id));
  const count = new Map();
  sorted.forEach((c) => count.set(c.card_image_id, (count.get(c.card_image_id) ?? 0) + 1));
  const used = new Set();
  return sorted.map((c, i) => {
    let id = c.card_image_id;
    if ((count.get(id) ?? 0) > 1) id = `${c.card_image_id}~${versionSlug(c.card_name) || i}`;
    while (used.has(id)) id = `${id}-${i}`;
    used.add(id);
    return { id, card: c };
  });
}

const isReprint = (c) => /_r\d+$/i.test(c.card_image_id) || /\(Reprint\)/i.test(c.card_name);
const byNumber = (a, b) => (a === b ? 0 : a === Infinity ? 1 : b === Infinity ? -1 : a - b);

/**
 * Cards a set reprints from other sets (every PRB card, Extra Booster and deck reprints, special cards in boosters).
 * Cardmarket lists them in the reprinting set's own English and Japanese expansions, every version under the same
 * name; OPTCG tells the versions apart and has a (US) market price for each. Within one card code, versions and
 * Cardmarket products are matched by price rank. The Japanese print usually has no plain "Reprint" version: when a
 * language has fewer products, reprints are left out of the match. Any other difference in count is left unmatched.
 * Returns prices keyed by "<set id>|<the app's card id>".
 */
export function buildReprints(optcgSets, guide, index) {
  const price = new Map(guide.map((g) => [g.idProduct, g]));
  // Ranked by trend, unless it is far from the 30-day average (it jumps for cards that rarely sell): then the average.
  const value = (id) => {
    const g = price.get(id); const tr = num(g?.trend), a30 = num(g?.avg30);
    const steady = tr != null && a30 != null && (tr < a30 / 3 || tr > a30 * 3) ? a30 : tr ?? a30;
    return steady ?? num(g?.low) ?? Infinity;
  };
  const { byExp, main } = index;
  const byId = {};
  const report = { sets: 0, matched: 0, unmatched: [], noExpansion: [] };
  for (const [setId, list] of Object.entries(optcgSets)) {
    const prefixes = setPrefixes(setId);
    const exps = Object.fromEntries(['en', 'ja'].map((lang) => [lang, prefixes.map((p) => main.get(`${p}|${lang}`)?.exp).filter((e) => e != null)]));
    if (!exps.en.length && !exps.ja.length) { report.noExpansion.push(setId); continue; }
    report.sets++;
    const guests = new Map();
    for (const ref of appIds(list)) {
      const code = ref.card.card_set_id;
      if (prefixes.some((p) => code.startsWith(`${p}-`))) continue;
      guests.set(code, [...(guests.get(code) ?? []), ref]);
    }
    for (const [code, versions] of guests) {
      for (const lang of ['en', 'ja']) {
        const products = [...new Set(exps[lang].flatMap((e) => byExp.get(e)?.get(code) ?? []))];
        if (!products.length) continue;
        let vs = versions;
        if (products.length < vs.length) vs = vs.filter((v) => !isReprint(v.card));
        if (products.length !== vs.length) { report.unmatched.push(`${setId} ${code} ${lang}: ${versions.length} versions, ${products.length} products`); continue; }
        const v = [...vs].sort((a, b) => byNumber(a.card.market_price ?? Infinity, b.card.market_price ?? Infinity) || versionOf(a.card.card_image_id) - versionOf(b.card.card_image_id));
        const p = [...products].sort((a, b) => byNumber(value(a), value(b)) || a - b);
        v.forEach((ref, i) => { (byId[`${setId}|${ref.id}`] ??= {})[lang] = [p[i], ...priceRow(price.get(p[i]))]; report.matched++; });
      }
    }
  }
  return { byId, report };
}

const OPTCG = 'https://optcgapi.com/api';
async function getJson(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'collectthemall-prices (personal collection app)' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt >= 3) throw new Error(`${url}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
}

/** Every OPTCG booster set and starter deck with its cards; a set that can't be read today is left out (null). */
async function loadOptcgSets() {
  const [sets, decks] = await Promise.all([getJson(`${OPTCG}/allSets/`), getJson(`${OPTCG}/allDecks/`)]);
  const ids = [...sets.map((s) => ['sets', s.set_id]), ...decks.map((d) => ['decks', d.structure_deck_id])];
  const out = {};
  for (const [kind, id] of ids) {
    try { const list = await getJson(`${OPTCG}/${kind}/${encodeURIComponent(id)}/`); out[id] = Array.isArray(list) ? list : null; }
    catch { out[id] = null; }
  }
  return out;
}

const SEALED_SKIP = /lots?$|^PCG Set|Set$|Coins$/i;

export function buildSealed(game, nonsingles, guide) {
  const price = new Map(guide.map((g) => [g.idProduct, g]));
  return nonsingles
    .filter((p) => !SEALED_SKIP.test(p.categoryName))
    .map((p) => [p.idProduct, game, p.name, p.categoryName.replace(/^(Pokémon|One Piece)\s*/, ''), ...priceRow(price.get(p.idProduct))]);
}

async function main() {
  const [pkGuide, pkSealed, pkSingles, opGuide, opSingles, opSealed] = await Promise.all([
    load(`priceGuide/price_guide_${GAMES.pokemon}.json`),
    load(`productList/products_nonsingles_${GAMES.pokemon}.json`),
    load(`productList/products_singles_${GAMES.pokemon}.json`),
    load(`priceGuide/price_guide_${GAMES.onepiece}.json`),
    load(`productList/products_singles_${GAMES.onepiece}.json`),
    load(`productList/products_nonsingles_${GAMES.onepiece}.json`),
  ]);
  const check = (f, key, min) => { if (!Array.isArray(f?.[key]) || f[key].length < min) throw new Error(`unexpected file: ${key} has ${f?.[key]?.length}`); };
  check(pkGuide, 'priceGuides', 10000); check(opGuide, 'priceGuides', 3000);
  check(pkSealed, 'products', 1000); check(pkSingles, 'products', 30000); check(opSingles, 'products', 3000); check(opSealed, 'products', 100);

  const updated = opGuide.createdAt ?? pkGuide.createdAt ?? new Date().toISOString();
  // What each part of today's build did, published in meta.json (anyone can read it) and, on GitHub, as warnings on
  // the run's page: a part that can't be rebuilt keeps yesterday's files without failing the whole run.
  const parts = {};
  const done = (name, detail) => { parts[name] = { ok: true, ...detail }; };
  const keptPart = (name, err) => {
    parts[name] = { ok: false, kept: 'yesterday', error: String(err?.message ?? err) };
    console.warn(`${name} not updated: ${parts[name].error}`);
    if (process.env.GITHUB_ACTIONS) console.log(`::warning title=${name} kept from yesterday::${parts[name].error.replace(/\r?\n/g, ' ')}`);
  };
  const index = indexOnePiece(opSingles.products, opSealed.products);
  const onepiece = buildOnePiece(opSingles.products, opSealed.products, opGuide.priceGuides, index);

  // Reprints need OPTCG's version list. If OPTCG can't be reached, yesterday's matches are kept (with today's prices
  // where the product is the same).
  let previous = {};
  try { previous = JSON.parse(await readFile(join(OUT, 'onepiece.json'), 'utf8')); } catch { /* first run */ }
  let optcgSets = {};
  let optcgError = null;
  try { optcgSets = await loadOptcgSets(); } catch (err) { optcgError = err; }
  const available = Object.fromEntries(Object.entries(optcgSets).filter(([, list]) => list));
  const { byId, report } = buildReprints(available, opGuide.priceGuides, index);
  const guidePrice = new Map(opGuide.priceGuides.map((g) => [g.idProduct, g]));
  const kept = new Set();
  for (const [key, langs] of Object.entries(previous.byId ?? {})) {
    const setId = key.split('|')[0];
    if (available[setId]) continue;
    kept.add(setId);
    byId[key] = Object.fromEntries(Object.entries(langs).map(([lang, row]) => [lang, [row[0], ...priceRow(guidePrice.get(row[0]))]]));
  }
  const reprintSets = [...new Set([...Object.keys(available), ...kept])].sort();
  if (optcgError || kept.size) keptPart('One Piece reprints', optcgError ?? `OPTCG didn't give: ${[...kept].join(', ')}`);
  else done('One Piece reprints', { versions: report.matched, sets: report.sets, unmatchedCodes: report.unmatched.length });
  console.log(`Reprints: ${report.matched} versions matched in ${report.sets} sets; ${report.unmatched.length} codes left unmatched; kept from yesterday: ${[...kept].join(', ') || 'none'}; sets without a Cardmarket expansion: ${report.noExpansion.join(', ') || 'none'}.`);
  const sealed = [
    ...buildSealed('pokemon', pkSealed.products, pkGuide.priceGuides),
    ...buildSealed('onepiece', opSealed.products, opGuide.priceGuides),
  ];
  await mkdir(join(OUT, 'history'), { recursive: true });
  // Versions Cardmarket sells that OPTCG doesn't list (Asian-exclusive promos, special prints…), by code.
  const opCovered = new Set();
  for (const langs of Object.values(onepiece)) for (const rows of Object.values(langs)) for (const r of rows) opCovered.add(r[0]);
  for (const langs of Object.values(byId)) for (const r of Object.values(langs)) opCovered.add(r[0]);
  const opBoxes = new Map();
  for (const x of opSealed.products) opBoxes.set(x.idExpansion, [...(opBoxes.get(x.idExpansion) ?? []), x.name]);
  const opKind = (exp) => ((opBoxes.get(exp) ?? []).some((n) => /non-english|asia/i.test(n)) ? 'ja' : 'en');
  const extras = onePieceExtras(opSingles.products, opGuide.priceGuides, opCovered, opKind, priceRow);
  done('One Piece special versions', { versions: Object.values(extras).reduce((n, l) => n + l.length, 0), codes: Object.keys(extras).length });
  await writeFile(join(OUT, 'onepiece.json'), JSON.stringify({ updated, columns: ['idProduct', 'trend', 'avg30', 'low', 'avg7', 'avg1'], cards: onepiece, reprintSets, byId, extras, extraSets: labelsFor(expansionLabels(opSealed.products), Object.values(extras).flat().map((r) => r[2])) }));
  await writeFile(join(OUT, 'sealed.json'), JSON.stringify({ updated, columns: ['idProduct', 'game', 'name', 'category', 'trend', 'avg30', 'low', 'avg7', 'avg1'], products: sealed }));

  // Japanese Pokémon catalogue (TCGplayer via tcgcsv.com, matched to Cardmarket). If a source can't be read today,
  // yesterday's files stay as they are.
  let jaGroups = null;
  try {
    const species = JSON.parse(await readFile(new URL('./species.json', import.meta.url), 'utf8')).species;
    const downloaded = await downloadJapanese();
    jaGroups = downloaded.groups;
    const ja = buildJapanese({ ...downloaded, species, cm: { singles: pkSingles.products, nonsingles: pkSealed.products, guide: pkGuide.priceGuides } });
    if (ja.cards.length < 20000) throw new Error(`only ${ja.cards.length} Japanese cards`);
    await mkdir(join(OUT, 'pokemon'), { recursive: true });
    await writeFile(join(OUT, 'pokemon', 'ja.json'), JSON.stringify({
      updated, eurPerUsd: Math.round(downloaded.eurPerUsd * 10000) / 10000,
      columns: ['productId', 'setId', 'number', 'name', 'version', 'rarity', 'dex', 'tcgdexId', 'cardmarket [idProduct, trend, avg30, low, avg7, avg1]', 'eurFromUsd'],
      sets: ja.sets, cards: ja.cards,
    }));
    await writeFile(join(OUT, 'pokemon', 'tcgdex-dex.json'), JSON.stringify({ updated, columns: ['id', 'name', 'image'], ...ja.tcgdexDex }));
    console.log(`Japanese Pokémon: ${JSON.stringify(ja.report)}`);
    done('Japanese Pokémon catalogue', { cards: ja.report.cards, cardmarket: ja.report.cardmarket, tcgplayerOnly: ja.report.tcgplayerOnly });
  } catch (err) {
    keptPart('Japanese Pokémon catalogue', err);
  }

  // Pictures for English (and so Italian) TCGdex cards without one, from TCGplayer. Kept from yesterday on failure.
  try {
    const en = await downloadEnglish();
    const { images, report } = matchEnglishImages(en.cards, en.groups, en.setNames);
    if (Object.keys(images).length < 500) throw new Error(`only ${Object.keys(images).length} pictures`);
    await mkdir(join(OUT, 'pokemon'), { recursive: true });
    await writeFile(join(OUT, 'pokemon', 'en-images.json'), JSON.stringify({ updated, base: 'https://tcgplayer-cdn.tcgplayer.com/product/', images }));
    console.log(`English pictures: ${report.found} of ${report.missing} missing found; sets not on TCGplayer: ${report.unpaired.join(', ') || 'none'}`);
    done('English pictures', { found: report.found, missing: report.missing });
  } catch (err) {
    keptPart('English pictures', err);
  }

  // Prices of every card TCGdex lists (Cardmarket's guide for the product each card names), one file per language, so
  // the app reads one file instead of asking TCGdex card by card. Kept from yesterday if TCGdex's data can't be read.
  try {
    const dirs = cloneTcgdex(process.env.TCGDEX_DIR ?? join(tmpdir(), 'tcgdex-cards-database'));
    const columns = ['idProduct', 'trend', 'avg30', 'avg', 'trendHolo', 'avg30Holo', 'versions (n normal, h holo, r reverse, f 1st edition)', 'avg7', 'avg1', 'avg7Holo'];
    for (const [name, dir] of [['en', dirs.en], ['asia', dirs.asia]]) {
      const cards = priceCards(await readDataFolder(dir), pkGuide.priceGuides);
      if (Object.keys(cards).length < (name === 'en' ? 15000 : 8000)) throw new Error(`only ${Object.keys(cards).length} ${name} cards`);
      await mkdir(join(OUT, 'pokemon'), { recursive: true });
      await writeFile(join(OUT, 'pokemon', `tcgdex-${name}.json`), JSON.stringify({ updated, columns, cards }));
      console.log(`TCGdex ${name}: ${Object.keys(cards).length} cards priced`);
      done(`Pokémon prices (${name})`, { cards: Object.keys(cards).length });
    }
  } catch (err) {
    keptPart('Pokémon prices', err);
  }

  // Pokémon cards Cardmarket sells that no catalogue covers (searched in the app on request), one file per letter.
  try {
    const covered = new Set();
    const read = async (f) => JSON.parse(await readFile(join(OUT, 'pokemon', f), 'utf8'));
    for (const f of ['tcgdex-en.json', 'tcgdex-asia.json']) for (const r of Object.values((await read(f)).cards)) if (r[0]) covered.add(r[0]);
    for (const r of (await read('ja.json')).cards) if (r[8]) covered.add(r[8][0]);
    const extras = pokemonExtras(pkSingles.products, pkGuide.priceGuides, covered, priceRow);
    await mkdir(join(OUT, 'pokemon', 'cm'), { recursive: true });
    const letters = ['_', '0', ...'abcdefghijklmnopqrstuvwxyz'];
    const labels = expansionLabels(pkSealed.products);
    for (const l of letters) {
      const cards = extras[l] ?? [];
      await writeFile(join(OUT, 'pokemon', 'cm', `${l}.json`), JSON.stringify({ updated, columns: ['idProduct', 'name', 'idExpansion', 'trend', 'avg30', 'low', 'avg7', 'avg1'], cards, expansions: labelsFor(labels, cards.map((r) => r[2])) }));
    }
    done('Pokémon cards on Cardmarket only', { cards: Object.values(extras).reduce((n, l) => n + l.length, 0) });
  } catch (err) {
    keptPart('Pokémon cards on Cardmarket only', err);
  }

  // Release days of sets (the app filters cards by year). A part whose source can't be read keeps yesterday's.
  {
    let previous = {};
    try { previous = JSON.parse(await readFile(join(OUT, 'release-dates.json'), 'utf8')); } catch { /* first run */ }
    const src = await downloadReleaseSources();
    const built = buildReleaseDates({ tcgdexSets: src.tcgdexSets ?? [], jaGroups: jaGroups ?? [], opGroups: src.opGroups ?? [] });
    const dates = {
      updated,
      pokemon: src.tcgdexSets ? built.pokemon : previous.pokemon ?? {},
      pokemonJa: jaGroups ? built.pokemonJa : previous.pokemonJa ?? {},
      onepiece: src.opGroups ? built.onepiece : previous.onepiece ?? {},
    };
    await writeFile(join(OUT, 'release-dates.json'), JSON.stringify(dates));
    const missing = [!src.tcgdexSets && 'TCGdex sets', !jaGroups && 'Japanese sets', !src.opGroups && 'One Piece sets'].filter(Boolean);
    if (missing.length) keptPart('Release days', `kept from yesterday: ${missing.join(', ')}`);
    else done('Release days', { pokemon: Object.keys(dates.pokemon).length, japanese: Object.keys(dates.pokemonJa).length, onepiece: Object.keys(dates.onepiece).length });
    console.log(`Release days: ${Object.keys(dates.pokemon).length} Pokémon sets, ${Object.keys(dates.pokemonJa).length} Japanese, ${Object.keys(dates.onepiece).length} One Piece.`);
  }

  // Weekly snapshot of trend prices (One Piece singles and all sealed), for price history.
  const day = updated.slice(0, 10);
  if (new Date(day).getUTCDay() === 1 || process.argv.includes('--history')) {
    const lines = ['idProduct,trend'];
    const seen = new Set();
    const addLine = (r) => { if (r[1] != null && !seen.has(r[0])) { seen.add(r[0]); lines.push(`${r[0]},${r[1]}`); } };
    for (const langs of Object.values(onepiece)) for (const rows of Object.values(langs)) rows.forEach(addLine);
    for (const langs of Object.values(byId)) Object.values(langs).forEach(addLine);
    for (const r of sealed) if (r[4] != null) lines.push(`${r[0]},${r[4]}`);
    await writeFile(join(OUT, 'history', `${day}.csv`), lines.join('\n') + '\n');
  }
  await writeFile(join(OUT, 'meta.json'), JSON.stringify({
    updated, built: new Date().toISOString(), onepieceCards: Object.keys(onepiece).length, reprintVersions: Object.keys(byId).length,
    sealedProducts: sealed.length, allPartsUpdated: Object.values(parts).every((x) => x.ok), parts,
  }, null, 2) + '\n');
  console.log(`Prices of ${updated}: ${Object.keys(onepiece).length} One Piece cards, ${sealed.length} sealed products.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}
