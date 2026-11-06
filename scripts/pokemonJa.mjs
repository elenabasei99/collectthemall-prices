// Japanese Pokémon cards: TCGdex's Japanese catalogue misses many sets and cards, TCGplayer's (published daily by
// tcgcsv.com) has them, with English names, numbers and pictures. This module builds the catalogue the app adds to
// TCGdex: every TCGplayer card with its Pokédex number, the TCGdex card it is (when TCGdex has it), and its price —
// Cardmarket's (matched to Cardmarket's product of the same Japanese set), else TCGplayer's converted to euros.
// Also Pokédex lists of the TCGdex Japanese and Traditional Chinese cards, many of which have no Pokédex number.

/* ------------------------------------------------------------------ text */

/** Lowercase letters and digits only, accents removed; "Pokémon" in any spelling (Pok?mon, Pokmon) counts as one. */
export const squash = (s) => String(s ?? '').replace(/pok[^a-z\s]?mon/gi, 'pokemon').normalize('NFD')
  .replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Versions TCGplayer lists apart but Cardmarket prices as the "reverse holo" of the same product. */
export const REVERSE = /mirror|reverse|ball pattern|energy symbol pattern|cosmos/i;

/* ------------------------------------------------------------------ TCGplayer cards */

const ext = (p) => Object.fromEntries((p.extendedData ?? []).map((e) => [e.name, e.value]));

/** Ability and attack names, as Cardmarket writes them after a card's name ("Rowlet [Sky Circus | Wind Shard]"). */
export function moveNames(e) {
  const out = [];
  const desc = e.Description ?? '';
  for (const m of desc.matchAll(/<strong>\s*([^<:]*?)\s*:\s*([^<]+?)\s*<\/strong>/g)) {
    if (/abilit|body|power|trait|held item/i.test(m[1])) out.push(m[2]);
  }
  for (const k of ['Attack 1', 'Attack 2', 'Attack 3', 'Attack 4']) {
    if (!e[k]) continue;
    const name = e[k].replace(/^(\s*\[[^\]]*\])*\s*/, '').split(/<br\s*\/?>|\s\(\d+[x+×\-]?\)|\s\d+[x+×\-]?$/)[0].trim();
    if (name && !/^\d+$/.test(name)) out.push(name); // some cards have a bare number as "Attack 1"
  }
  return out;
}

/** One TCGplayer product as a card, or null for sealed products and code cards. */
export function parseCard(p) {
  const e = ext(p);
  if (!e.Number) return null;
  const type = e.CardType ?? '';
  const raw = p.name.replace(/\s+-\s+[A-Za-z0-9-]*\d+\/[A-Za-z0-9-]+\s*$/, '').trim();
  const label = [...raw.matchAll(/\(([^)]+)\)/g)].map((m) => m[1]).join(' ');
  const name = raw.replace(/\s*\([^)]*\)/g, '').trim();
  const number = String(e.Number).split('/')[0].trim();
  const kind = /^trainer/i.test(type) ? 'trainer' : /energy/i.test(type) && !e.HP ? 'energy' : 'pokemon';
  return { productId: p.productId, name, label, number, rarity: e.Rarity && e.Rarity !== 'None' ? e.Rarity : '', kind, moves: moveNames(e) };
}

/** The key two listings of the same card share: its name and its abilities and attacks. */
export const cardKey = (name, moves) => `${squash(name)}|${moves.map(squash).filter(Boolean).sort().join(',')}`;

/** "Eternatus V [Power Accelerator | Dynamax Cannon]" → key; Cardmarket's names for Japanese singles. */
export function cmKey(cmName) {
  const m = /^(.*?)\s*\[([^\]]*)\]\s*$/.exec(cmName);
  return m ? cardKey(m[1], m[2].split('|').map((s) => s.trim())) : cardKey(cmName, []);
}

/** Just the card's name, for when the two sites translate attack names differently (Japanese cards). */
export const nameKey = (key) => key.split('|')[0];

/* ------------------------------------------------------------------ Pokédex numbers from names */

/**
 * Finds the Pokémon in card names, for one language of `species` ([dex, en, ja, zh-Hant, zh-Hans]).
 * English names are matched as whole words ("Team Rocket's Mewtwo ex", "Pikachu & Zekrom GX" → 25 and 644); Japanese
 * and Chinese, which have no spaces, by the longest name at each place ("ミュウツー" is Mewtwo, not Mew).
 */
export function dexFinder(species, column) {
  const latin = column === 1;
  const norm = (s) => (latin ? ` ${String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’`]/g, "'").replace(/[^a-z0-9♀♂.:' -]/g, ' ').replace(/\s+/g, ' ')} ` : String(s).normalize('NFKC'));
  const names = species.filter((r) => r[column]).map((r) => [norm(r[column]).trim(), r[0]]).sort((a, b) => b[0].length - a[0].length);
  const byFirst = new Map();
  for (const [n, dex] of names) { const k = n[0]; byFirst.set(k, [...(byFirst.get(k) ?? []), [n, dex]]); }
  return (cardName) => {
    const s = norm(cardName);
    const found = [];
    for (let i = 0; i < s.length; i++) {
      if (latin && s[i - 1] !== ' ' && i > 0) continue;
      for (const [n, dex] of byFirst.get(s[i]) ?? []) {
        if (!s.startsWith(n, i)) continue;
        if (latin && !/^[ ']/.test(s.slice(i + n.length) || ' ')) continue;
        if (!found.includes(dex)) found.push(dex);
        i += n.length - 1;
        break;
      }
    }
    return found;
  };
}

/* ------------------------------------------------------------------ Cardmarket */

const STOP = new Set(['booster', 'boosters', 'box', 'boxes', 'pack', 'packs', 'display', 'case', 'set', 'bundle', 'collection', 'premium', 'limited', 'japanese', 'sealed', 'of', 'the', 'and', 'x', 'deck', 'decks', 'special', 'expansion', 'high', 'class', 'starter', 'pokemon', 'card', 'cards', 'ex', 'v']);
const words = (s) => new Set(String(s).replace(/pok[^a-z\s]?mon/gi, 'pokemon').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w)));
const overlap = (a, b) => { if (!a.size || !b.size) return 0; let n = 0; for (const w of a) if (b.has(w)) n++; return n / Math.min(a.size, b.size); };

/**
 * Cardmarket's expansion for each TCGplayer set: the one holding most of its cards (by name), with the
 * set's name in Cardmarket's sealed product names breaking ties between a Japanese set and its English counterpart.
 * Sets with too little in common stay unmatched.
 */
export function matchExpansions(groups, cmSingles, cmNonsingles) {
  const keysByExp = new Map();
  const expsByKey = new Map();
  for (const p of cmSingles) {
    const k = nameKey(cmKey(p.name));
    if (!keysByExp.has(p.idExpansion)) keysByExp.set(p.idExpansion, new Set());
    keysByExp.get(p.idExpansion).add(k);
    if (!expsByKey.has(k)) expsByKey.set(k, new Set());
    expsByKey.get(k).add(p.idExpansion);
  }
  const boxWords = new Map();
  for (const p of cmNonsingles) boxWords.set(p.idExpansion, new Set([...(boxWords.get(p.idExpansion) ?? []), ...words(p.name)]));
  const out = new Map();
  for (const g of groups) {
    const keys = new Set(g.cards.filter((c) => !REVERSE.test(c.label)).map((c) => squash(c.name)));
    if (!keys.size) continue;
    const shared = new Map();
    for (const k of keys) for (const e of expsByKey.get(k) ?? []) shared.set(e, (shared.get(e) ?? 0) + 1);
    const setWords = words(g.name.replace(/^[^:]*:\s*/, ''));
    let best = null;
    for (const [e, n] of shared) {
      const coverage = n / keys.size;
      const precision = n / keysByExp.get(e).size;
      const named = overlap(setWords, boxWords.get(e) ?? new Set());
      const score = coverage + 0.3 * precision + 0.5 * named;
      if (!best || score > best.score) best = { exp: e, score, coverage, named };
    }
    // Small sets (a gift box, a deck) fit into any big expansion by card names alone: they also need the set's name.
    const small = keys.size < 15;
    if (best && (small ? best.coverage >= 0.6 && best.named >= 0.5 : best.coverage >= 0.6 || (best.coverage >= 0.3 && best.named >= 0.5))) out.set(g.groupId, best);
  }
  return out;
}

const num = (x) => (typeof x === 'number' && x > 0 ? Math.round(x * 100) / 100 : null);
const byNumber = (a, b) => (a === b ? 0 : a === Infinity ? 1 : b === Infinity ? -1 : a - b);

/**
 * Cardmarket product of each card of a set. First cards whose name and attacks agree on both sites; then, as attack
 * names on Japanese cards are unofficial translations that differ between the sites, the rest by name. Versions of
 * the same card (regular, secret rare, ...) are paired by price rank when both sites have as many. "Mirror" and
 * "ball pattern" versions are the reverse holo of the regular product. Returns productId → [idProduct, holo].
 */
export function matchCards(cards, cmProducts, usd, cmValue, order = 'number') {
  const out = new Map();
  const base = cards.filter((c) => !REVERSE.test(c.label));
  const reverse = cards.filter((c) => REVERSE.test(c.label));
  let left = base.map((c) => ({ c, key: cardKey(c.name, c.moves) }));
  let cmLeft = cmProducts.map((p) => ({ id: p.idProduct, key: cmKey(p.name) }));
  const pair = (keyOf) => {
    const a = new Map(); for (const x of left) a.set(keyOf(x.key), [...(a.get(keyOf(x.key)) ?? []), x]);
    const b = new Map(); for (const x of cmLeft) b.set(keyOf(x.key), [...(b.get(keyOf(x.key)) ?? []), x]);
    const done = new Set(); const doneCm = new Set();
    for (const [k, ours] of a) {
      const theirs = b.get(k);
      if (!theirs || theirs.length !== ours.length) continue;
      const byCardNumber = (x, y) => x.c.number.localeCompare(y.c.number, undefined, { numeric: true });
      const o = [...ours].sort(order === 'number' ? byCardNumber : (x, y) => byNumber(usd(x.c.productId) ?? Infinity, usd(y.c.productId) ?? Infinity) || byCardNumber(x, y));
      const t = [...theirs].sort(order === 'number' ? (x, y) => x.id - y.id : (x, y) => byNumber(cmValue(x.id) ?? Infinity, cmValue(y.id) ?? Infinity) || x.id - y.id);
      o.forEach((x, i) => { out.set(x.c.productId, [t[i].id, false]); done.add(x); doneCm.add(t[i]); });
    }
    left = left.filter((x) => !done.has(x));
    cmLeft = cmLeft.filter((x) => !doneCm.has(x));
  };
  pair((k) => k);
  pair(nameKey);
  // reverse versions: the regular product of the same card (its cheapest version)
  const regular = new Map();
  for (const c of base) {
    const m = out.get(c.productId); if (!m) continue;
    const k = squash(c.name); const u = usd(c.productId) ?? Infinity;
    if (!regular.has(k) || u < regular.get(k).u) regular.set(k, { id: m[0], u });
  }
  for (const c of reverse) { const r = regular.get(squash(c.name)); if (r) out.set(c.productId, [r.id, true]); }
  return out;
}

/* ------------------------------------------------------------------ the catalogue */

const setCode = (g) => (g.name.includes(':') ? g.name.split(':')[0].trim() : (g.abbreviation ?? '').trim());
const numKey = (set, number) => `${String(set).toLowerCase()}|${String(number).replace(/^0+(?=\d)/, '').toLowerCase()}`;

/**
 * groups: TCGplayer sets, each { groupId, name, abbreviation, publishedOn, products, prices };
 * tcgdexJa: TCGdex's Japanese card list ({ id, localId, name, image }); species: Pokémon names;
 * cm: { singles, nonsingles, guide } (Cardmarket Pokémon); eurPerUsd: today's rate.
 */
export function buildJapanese({ groups, tcgdexJa, tcgdexZhTw, species, cm, eurPerUsd, order = 'number' }) {
  const findEn = dexFinder(species, 1);
  const findJa = dexFinder(species, 2);
  const findZh = dexFinder(species, 3);
  const guide = new Map(cm.guide.map((g) => [g.idProduct, g]));
  const cmValue = (id) => { const g = guide.get(id); return num(g?.trend) ?? num(g?.avg30) ?? num(g?.low); };

  const parsed = groups.map((g) => {
    const usdBy = new Map();
    for (const pr of g.prices ?? []) {
      const v = num(pr.marketPrice) ?? num(pr.midPrice) ?? num(pr.lowPrice);
      if (v != null && (!usdBy.has(pr.productId) || pr.subTypeName === 'Normal')) usdBy.set(pr.productId, v);
    }
    return { ...g, code: setCode(g), cards: (g.products ?? []).map(parseCard).filter(Boolean), usdBy };
  });

  const expansions = matchExpansions(parsed, cm.singles, cm.nonsingles);
  const cmByExp = new Map();
  for (const p of cm.singles) cmByExp.set(p.idExpansion, [...(cmByExp.get(p.idExpansion) ?? []), p]);

  const tcgdexBySetNumber = new Map(tcgdexJa.map((c) => [numKey(c.id.slice(0, c.id.length - c.localId.length - 1), c.localId), c.id]));
  const sets = {};
  const cards = [];
  const report = { sets: parsed.length, cards: 0, inTcgdex: 0, cardmarket: 0, tcgplayerOnly: 0, noPrice: 0, setsOnCardmarket: expansions.size };
  for (const g of parsed) {
    if (!g.cards.length) continue;
    // Keyed by TCGplayer's set id: several sets share a code (or have none). [name, release day, code]
    sets[g.groupId] = [g.name.replace(/^[^:]*:\s*/, ''), (g.publishedOn ?? '').slice(0, 10), g.code];
    const exp = expansions.get(g.groupId);
    const usd = (id) => g.usdBy.get(id) ?? null;
    const matched = exp ? matchCards(g.cards, cmByExp.get(exp.exp) ?? [], usd, cmValue, order) : new Map();
    for (const c of g.cards) {
      report.cards++;
      const tcgdexId = tcgdexBySetNumber.get(numKey(g.code, c.number)) ?? '';
      if (tcgdexId) report.inTcgdex++;
      const dex = c.kind === 'pokemon' ? findEn(c.name) : [];
      const m = matched.get(c.productId);
      let cmRow = null;
      if (m) {
        const pg = guide.get(m[0]);
        cmRow = m[1]
          ? [m[0], num(pg?.['trend-holo']), num(pg?.['avg30-holo']), num(pg?.['low-holo']), num(pg?.['avg7-holo']), num(pg?.['avg1-holo'])]
          : [m[0], num(pg?.trend), num(pg?.avg30), num(pg?.low), num(pg?.avg7), num(pg?.avg1)];
        if (cmRow[1] == null && cmRow[2] == null) cmRow = null; // no Cardmarket price: TCGplayer's below
      }
      const u = usd(c.productId);
      const eur = u != null && eurPerUsd ? Math.round(u * eurPerUsd * 100) / 100 : null;
      if (cmRow) report.cardmarket++; else if (eur != null) report.tcgplayerOnly++; else report.noPrice++;
      // [productId, set (TCGplayer set id), number, name, version, rarity, dex, tcgdexId, cardmarket, eur]
      cards.push([c.productId, g.groupId, c.number, c.name, c.label, c.rarity, dex.length > 1 ? dex : dex[0] ?? 0, tcgdexId, cmRow, eur]);
    }
  }

  // TCGdex cards by Pokémon, found from their Japanese / Chinese names (many have no Pokédex number in TCGdex).
  const dexLists = (list, find) => {
    const out = {};
    for (const c of list) for (const d of find(c.name)) (out[d] ??= []).push([c.id, c.name, c.image ?? '']);
    return out;
  };
  return {
    sets,
    cards,
    tcgdexDex: { ja: dexLists(tcgdexJa, findJa), 'zh-tw': dexLists(tcgdexZhTw, findZh) },
    report,
  };
}

/* ------------------------------------------------------------------ download */

const UA = { 'User-Agent': 'collectthemall-prices (personal collection app)' };
export async function getJson(url, tries = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: UA });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt >= tries) throw new Error(`${url}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
}

export async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

/** Today's TCGplayer Japanese catalogue and prices (category 85 on tcgcsv.com), TCGdex lists and the euro rate. */
export async function downloadJapanese() {
  const groups = (await getJson('https://tcgcsv.com/tcgplayer/85/groups')).results;
  if (!Array.isArray(groups) || groups.length < 300) throw new Error(`tcgcsv: ${groups?.length} groups`);
  await pool(groups, 4, async (g) => {
    const [products, prices] = await Promise.all([
      getJson(`https://tcgcsv.com/tcgplayer/85/${g.groupId}/products`).then((d) => d.results).catch(() => null),
      getJson(`https://tcgcsv.com/tcgplayer/85/${g.groupId}/prices`).then((d) => d.results).catch(() => []),
    ]);
    g.products = products;
    g.prices = prices;
  });
  const missing = groups.filter((g) => !g.products).length;
  if (missing > groups.length / 10) throw new Error(`tcgcsv: ${missing} sets could not be read`);
  const [tcgdexJa, tcgdexZhTw, ecb] = await Promise.all([
    getJson('https://api.tcgdex.net/v2/ja/cards'),
    getJson('https://api.tcgdex.net/v2/zh-tw/cards'),
    fetch('https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml', { headers: UA }).then((r) => r.text()),
  ]);
  const usd = /currency=['"]USD['"]\s+rate=['"]([\d.]+)['"]/.exec(ecb);
  if (!usd) throw new Error('ECB: no USD rate');
  return { groups: groups.filter((g) => g.products), tcgdexJa, tcgdexZhTw, eurPerUsd: 1 / Number(usd[1]) };
}
