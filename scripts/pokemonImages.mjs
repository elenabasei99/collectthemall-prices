// Pictures for English TCGdex cards that have none (promos, trainer kits, Shiny Vault / Galarian Gallery subsets,
// older sets): the same card's picture on TCGplayer (published daily by tcgcsv.com, category 3). Italian cards use the
// English ids, so they get the same pictures.
import { getJson, parseCard, pool, squash } from './pokemonJa.mjs';

const num = (n) => String(n).split('/')[0].trim().replace(/^0+(?=\d)/, '').toLowerCase();
/** "Pikachu - SM04" → "Pikachu": promos carry their code after the name. */
const baseName = (name) => name.replace(/\s+-\s+[A-Za-z]*\d[\w/-]*\s*$/, '');
const sameName = (a, b) => { const x = squash(a), y = squash(b); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)); };

/**
 * tcgdex: TCGdex's English card list ({ id, localId, name, image? }); groups: TCGplayer sets with their products.
 * Each TCGdex set with cards missing a picture is paired with the TCGplayer set sharing most of its cards (same number
 * and name); those cards then take the picture of the TCGplayer card with their number and name.
 * Returns { "<TCGdex id>": TCGplayer productId } and a report.
 */
export function matchEnglishImages(tcgdex, groups, setNames = {}) {
  const bySet = new Map();
  for (const c of tcgdex) {
    const set = c.id.slice(0, c.id.length - c.localId.length - 1);
    bySet.set(set, [...(bySet.get(set) ?? []), c]);
  }
  // TCGplayer cards by number, across all sets: { number → [{ groupId, productId, name }] }
  const byNumber = new Map();
  for (const g of groups) {
    for (const p of g.products ?? []) {
      const c = parseCard(p);
      if (!c || !p.imageUrl) continue;
      const k = num(c.number);
      const card = { groupId: g.groupId, productId: p.productId, name: baseName(c.name), full: p.name };
      byNumber.set(k, [...(byNumber.get(k) ?? []), card]);
      (g.cardsByName ??= new Map()).set(squash(card.name), [...(g.cardsByName.get(squash(card.name)) ?? []), card]);
    }
  }
  // Several decks in one TCGplayer set (trainer kits) share numbers: "Potion (Plusle)" / "Potion (Minun)".
  const words = (x) => new Set(String(x).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));
  const closest = (list, setName) => {
    if (list.length < 2) return list[0];
    const w = words(setName);
    return [...list].sort((a, b) => [...words(b.full)].filter((x) => w.has(x)).length - [...words(a.full)].filter((x) => w.has(x)).length)[0];
  };
  const out = {};
  const report = { missing: 0, found: 0, sets: 0, setsPaired: 0, unpaired: [] };
  for (const [set, cards] of bySet) {
    const missing = cards.filter((c) => !c.image);
    if (!missing.length) continue;
    report.sets++; report.missing += missing.length;
    // which TCGplayer set holds most of this set's cards
    const votes = new Map();
    for (const c of cards) {
      const seen = new Set();
      for (const t of byNumber.get(num(c.localId)) ?? []) {
        if (seen.has(t.groupId) || !sameName(t.name, c.name)) continue;
        seen.add(t.groupId);
        votes.set(t.groupId, (votes.get(t.groupId) ?? 0) + 1);
      }
    }
    const best = [...votes].sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] >= Math.max(2, cards.length * 0.5)) {
      report.setsPaired++;
      for (const c of missing) {
        const t = closest((byNumber.get(num(c.localId)) ?? []).filter((x) => x.groupId === best[0] && sameName(x.name, c.name)), setNames[set]);
        if (t) { out[c.id] = t.productId; report.found++; }
      }
      continue;
    }
    // Numbered differently (Classic Collections: their own numbers on one site, the originals on the other):
    // a TCGplayer set of about the same size holding most of these names, and cards whose name is unique in both.
    const names = new Map();
    for (const c of cards) names.set(squash(c.name), (names.get(squash(c.name)) ?? 0) + 1);
    let byName = null;
    for (const g of groups) {
      if (!g.cardsByName || g.cardsByName.size > cards.length * 1.5 + 2 || g.cardsByName.size < cards.length * 0.7) continue;
      let n = 0; for (const k of names.keys()) if (g.cardsByName.has(k)) n++;
      if (n >= cards.length * 0.7 && (!byName || n > byName.n)) byName = { g, n };
    }
    if (!byName) { report.unpaired.push(`${set} (${missing.length})`); continue; }
    report.setsPaired++;
    for (const c of missing) {
      const k = squash(c.name);
      const list = byName.g.cardsByName.get(k);
      if (names.get(k) === 1 && list?.length === 1) { out[c.id] = list[0].productId; report.found++; }
    }
  }
  return { images: out, report };
}

/** TCGplayer's English catalogue (category 3 on tcgcsv.com) with its prices, and TCGdex's English cards and sets. */
export async function downloadEnglish() {
  const groups = (await getJson('https://tcgcsv.com/tcgplayer/3/groups')).results;
  if (!Array.isArray(groups) || groups.length < 150) throw new Error(`tcgcsv: ${groups?.length} English sets`);
  await pool(groups, 4, async (g) => {
    [g.products, g.prices] = await Promise.all([
      getJson(`https://tcgcsv.com/tcgplayer/3/${g.groupId}/products`).then((d) => d.results).catch(() => null),
      getJson(`https://tcgcsv.com/tcgplayer/3/${g.groupId}/prices`).then((d) => d.results).catch(() => []),
    ]);
  });
  const missing = groups.filter((g) => !g.products).length;
  if (missing > groups.length / 10) throw new Error(`tcgcsv: ${missing} English sets could not be read`);
  const [cards, sets] = await Promise.all([getJson('https://api.tcgdex.net/v2/en/cards'), getJson('https://api.tcgdex.net/v2/en/sets')]);
  return { groups: groups.filter((g) => g.products), cards, setNames: Object.fromEntries(sets.map((s) => [s.id, s.name])) };
}
