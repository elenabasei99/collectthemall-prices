// Checks the Cardmarket product TCGdex names for each card against Cardmarket's own catalogue, and corrects it.
// TCGdex's data has slips: products missing (Latias ☆ in Deoxys), pointing to another card (Rayquaza ☆ → the plain
// Rayquaza) or to another set's cards, and prints with the same name swapped (Rayquaza 20 and SL10 in Call of Legends).
// Cardmarket names each product "Name [Attack | Attack]", so a card's name and attacks find its product in its set's
// expansion. Prints with the same name and attacks are told apart by Cardmarket's product order: a card's product
// sits next to the products of the cards numbered next to it.
import { squash } from './pokemonJa.mjs';

/** squash, with ♂/♀, ☆, δ and "Lv.42" written the way both catalogues agree on. */
export const norm = (s) => squash(String(s ?? '').replace(/♂/g, 'm').replace(/♀/g, 'f').replace(/[☆★]/g, 'goldstar')
  .replace(/δ|delta species/gi, 'delta').replace(/\blv\.?\s*(\d+|x)\b/gi, '')).replace(/(delta)+/g, 'delta');

/** "Nidoran [M] [Horn Hazard]" → { name: 'nidoranm', moves: ['hornhazard'] }; "Unown [D] [Shuffle]" also tag 'D'. */
export function productKey(cmName) {
  let base = cmName, moves = [];
  const m = /^(.*)\[([^\]]*)\]\s*$/.exec(cmName);
  if (m && !/^[MF]$/.test(m[2].trim())) { base = m[1]; moves = m[2].split('|').map(norm).filter(Boolean); }
  const special = moves.join() === 'special'; // "Darkness Energy [Special]", next to the basic "Darkness Energy"
  if (special) moves = [];
  if (/^Nidoran\b/i.test(base)) base = base.replace(/\[([MF])\]/g, '$1');
  const tag = /\[([^\]]{1,2})\]/.exec(base)?.[1];
  return { name: norm(base.replace(/\[[^\]]{1,2}\]/g, '')), moves, tag, special };
}

const en = (s) => /\ben\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(s)?.[1];

/** A TCGdex card file's English name and its abilities' and attacks' names. */
export function nameAndMoves(text) {
  const name = en(/\bname\s*:\s*\{[^}]*\}/.exec(text)?.[0] ?? '') ?? '';
  const moves = [];
  for (const block of ['abilities', 'attacks']) {
    const at = text.search(new RegExp(`\\b${block}\\s*:\\s*\\[`));
    if (at < 0) continue;
    let i = text.indexOf('[', at), depth = 0;
    const start = i;
    for (; i < text.length; i++) { if (text[i] === '[') depth++; else if (text[i] === ']' && --depth === 0) break; }
    for (const m of text.slice(start, i).matchAll(/\bname\s*:\s*\{([^}]*)\}/g)) { const n = en(m[1]); if (n) moves.push(n); }
  }
  const tcgplayer = Number(/\btcgplayer\s*:\s*(\d+)/.exec(text)?.[1]) || null;
  const dexIds = (/\bdexId\s*:\s*\[([^\]]*)\]/.exec(text)?.[1] ?? '').split(',').map(Number).filter(Boolean);
  return { name, moves, special: /\benergyType\s*:\s*["']Special["']/.test(text), tcgplayer, dexIds };
}

/** How well a product fits a card: 0 another card (or the same name with other attacks), 0.5 to 1 as more attacks agree. */
function fit(card, prod) {
  if (card.key.name !== prod.key.name) return 0;
  if (prod.key.tag && prod.key.tag.toLowerCase() !== card.localId.toLowerCase()) return 0; // Unown [D] is card D
  if (BASIC_ENERGY.test(card.key.name) && card.key.special !== prod.key.special) return 0;
  const a = card.key.moves, b = prod.key.moves;
  if (!a.length && !b.length) return 1;
  if (!a.length || !b.length) return 0.5;
  const shared = a.filter((x) => b.includes(x)).length;
  return shared ? 0.5 + shared / new Set([...a, ...b]).size / 2 : 0;
}
const BASIC_ENERGY = /^(grass|fire|water|lightning|psychic|fighting|darkness|metal|fairy)energy$/;
const good = (q) => q >= 0.5;
const keyText = (k) => `${k.name}|${[...k.moves].sort().join(',')}|${k.special ? 'special' : ''}`;

/** "SL10" and "SL9" are next to each other; "20" and "SL10" are not. */
const numberOf = (localId) => { const m = /^(\D*)(\d+)(\D*)$/.exec(localId); return m ? [m[1], Number(m[2]), m[3]] : null; };
const byNumber = (a, b) => a.localeCompare(b, undefined, { numeric: true });
const nextTo = (a, b) => { const x = numberOf(a), y = numberOf(b); return !!x && !!y && x[0] === y[0] && x[2] === y[2] && Math.abs(x[1] - y[1]) === 1; };

function arrangements(items, k) {
  if (k === 0) return [[]];
  return items.flatMap((x, i) => arrangements([...items.slice(0, i), ...items.slice(i + 1)], k - 1).map((rest) => [x, ...rest]));
}

/**
 * cards: TCGdex cards [{ id, set, localId, name, moves, product, tcgplayer? }]; products: Cardmarket singles
 * [{ idProduct, name, idExpansion }]; usd: TCGplayer productId → price, eur: idProduct → Cardmarket price (optional).
 * Returns id → idProduct (null when no product is certain) and what changed.
 */
export function matchProducts(cards, products, { usd = new Map(), eur = new Map() } = {}) {
  const byId = new Map(), byName = new Map(), byExp = new Map();
  for (const p of products) {
    const prod = { id: p.idProduct, exp: p.idExpansion, key: productKey(p.name) };
    byId.set(prod.id, prod);
    byName.set(prod.key.name, [...(byName.get(prod.key.name) ?? []), prod]);
    byExp.set(prod.exp, [...(byExp.get(prod.exp) ?? []), prod]);
  }
  for (const list of byExp.values()) list.sort((a, b) => a.id - b.id);

  const out = new Map();
  const report = { added: [], changed: [], removed: [] };
  const bySet = new Map();
  for (const c of cards) bySet.set(c.set, [...(bySet.get(c.set) ?? []), { ...c, key: { name: norm(c.name), moves: (c.moves ?? []).map(norm).filter(Boolean), special: !!c.special } }]);

  for (const setCards of bySet.values()) {
    // The set's expansions: where its cards are found by name and attacks, TCGdex's products that fit counting extra.
    const score = new Map(), hinted = new Map();
    for (const c of setCards) {
      const best = new Map();
      for (const p of byName.get(c.key.name) ?? []) { const q = fit(c, p); if (good(q)) best.set(p.exp, Math.max(best.get(p.exp) ?? 0, q)); }
      for (const [exp, q] of best) score.set(exp, (score.get(exp) ?? 0) + q);
      const h = byId.get(c.product);
      if (h && good(fit(c, h))) { score.set(h.exp, (score.get(h.exp) ?? 0) + 1); hinted.set(h.exp, (hinted.get(h.exp) ?? 0) + 1); }
    }
    let exps = [...score].sort((a, b) => b[1] - a[1]).map(([exp]) => exp).filter((exp, i) => i === 0 || (hinted.get(exp) ?? 0) >= 3);
    // Sets Cardmarket doesn't sell (TCG Pocket) only have namesakes in other expansions: TCGdex's data stays as it is.
    if ((score.get(exps[0]) ?? 0) < setCards.length / 2) exps = [];

    // Each card: the product of its expansions that fits it best (TCGdex's when it fits as well), else TCGdex's.
    const pick = new Map();
    const unsure = [];
    for (const c of setCards) {
      const h = byId.get(c.product);
      let best = null;
      for (const exp of exps) {
        const cands = (byExp.get(exp) ?? []).map((p) => [p, fit(c, p)]).filter(([, q]) => q > 0);
        if (!cands.length) continue;
        const top = Math.max(...cands.map(([, q]) => q));
        best = cands.filter(([, q]) => q === top).map(([p]) => p);
        if (h && good(fit(c, h)) && fit(c, h) >= top) best = [h];
        break;
      }
      if (!best) pick.set(c.id, c.product ?? null);
      else if (best.every((p) => keyText(p.key) === keyText(best[0].key))) pick.set(c.id, best.includes(h) ? h.id : best[0].id); // same-name prints: settled below
      else unsure.push([c, best]);
    }
    // Cards that fit several products as well ("Psychic Burst" is Cardmarket's "Psyburst"): the one no other card took.
    const taken = new Set(pick.values());
    for (const [c, best] of unsure) {
      const free = best.filter((p) => !taken.has(p.id));
      pick.set(c.id, free.length === 1 ? free[0].id : c.product ?? null);
    }

    // Prints with the same name and attacks: the arrangement putting most of them next to their neighbours' products.
    // First against neighbours with a single print only (a chain of swapped pairs agrees with itself), then all.
    const printed = new Map();
    for (const exp of exps) for (const p of byExp.get(exp) ?? []) printed.set(keyText(p.key), (printed.get(keyText(p.key)) ?? 0) + 1);
    for (let round = 0; round < 2; round++) {
      for (const exp of exps) {
        const list = byExp.get(exp) ?? [];
        // Does this expansion list cards in number order? (Checked on cards with a single print.)
        const anchors = list.map((p) => setCards.find((c) => pick.get(c.id) === p.id && printed.get(keyText(c.key)) === 1)).filter(Boolean);
        const inOrder = anchors.slice(1).filter((c, i) => byNumber(anchors[i].localId, c.localId) < 0).length / Math.max(1, anchors.length - 1);
        const groups = new Map();
        for (const p of list) groups.set(keyText(p.key), [...(groups.get(keyText(p.key)) ?? []), p]);
        for (const group of groups.values()) {
          if (group.length < 2 || group.length > 5) continue;
          const twins = setCards.filter((c) => keyText(c.key) === keyText(group[0].key));
          if (!twins.length || twins.length > group.length) continue;
          // Where the other cards are; a product two cards share tells nothing.
          const cardAt = new Map(), shared = new Set();
          for (const c of setCards) {
            if (pick.get(c.id) == null || twins.includes(c) || (round === 0 && (printed.get(keyText(c.key)) ?? 0) > 1)) continue;
            if (cardAt.has(pick.get(c.id))) shared.add(pick.get(c.id));
            cardAt.set(pick.get(c.id), c);
          }
          for (const p of shared) cardAt.delete(p);
          const adjacency = (arr) => {
            const at = new Map(cardAt);
            arr.forEach((p, i) => at.set(p.id, twins[i]));
            let n = 0;
            arr.forEach((p, i) => {
              const k = list.indexOf(p);
              for (const nb of [list[k - 1], list[k + 1]]) if (nb && at.has(nb.id) && nextTo(twins[i].localId, at.get(nb.id).localId)) n++;
            });
            return n;
          };
          const current = twins.map((c) => group.find((p) => p.id === pick.get(c.id)));
          const valid = current.every(Boolean) && new Set(current).size === current.length;
          const options = arrangements(group, twins.length).map((a) => [a, adjacency(a)]);
          const top = Math.max(...options.map(([, s]) => s));
          const tops = options.filter(([, s]) => s === top).map(([a]) => a);
          if (top > 0 && (!valid || top > adjacency(current))) {
            // Prints the neighbours place; the others (an alternate print without neighbours) as below.
            const sure = twins.map((_, i) => (tops.every((a) => a[i] === tops[0][i]) ? tops[0][i] : null));
            const free = group.filter((p) => !sure.includes(p));
            const rest = twins.filter((_, i) => !sure[i]).sort((a, b) => byNumber(a.localId, b.localId));
            twins.forEach((c, i) => {
              if (sure[i]) return pick.set(c.id, sure[i].id);
              const own = current[i] && free.includes(current[i]) && current.indexOf(current[i]) === current.lastIndexOf(current[i]);
              pick.set(c.id, inOrder >= 0.8 ? free[rest.indexOf(c)]?.id ?? null : own ? current[i].id : null);
            });
          }
          // No neighbour tells them apart, in an expansion listed in number order: the prints in number order
          // (variants added later come last).
          else if (!valid && round === 1 && inOrder >= 0.8) {
            [...twins].sort((a, b) => byNumber(a.localId, b.localId)).forEach((c, i) => pick.set(c.id, group[i].id));
          }
          // Can't tell them apart: cards sharing a product (or with another card's) lose it; no link beats a wrong one.
          else if (!valid && round === 1) twins.forEach((c, i) => { if (!current[i] || current.indexOf(current[i]) !== current.lastIndexOf(current[i])) pick.set(c.id, null); });
        }
      }
    }

    // Prints with the same name and attacks whose prices differ clearly (a holo H-card and its plain print, an SL and
    // the regular card) on both sites: the dearer print on TCGplayer gets the dearer product on Cardmarket.
    const prints = new Map();
    for (const c of setCards) { const p = byId.get(pick.get(c.id)); if (p && good(fit(c, p))) prints.set(keyText(c.key), [...(prints.get(keyText(c.key)) ?? []), c]); }
    for (const cs of prints.values()) {
      const ps = cs.map((c) => pick.get(c.id));
      if (cs.length < 2 || new Set(ps).size < cs.length) continue;
      const byUsd = [...cs].sort((a, b) => (usd.get(a.tcgplayer) ?? 0) - (usd.get(b.tcgplayer) ?? 0));
      const byEur = [...ps].sort((a, b) => (eur.get(a) ?? 0) - (eur.get(b) ?? 0));
      const apart = (vals) => vals.every((v) => v > 0) && vals.slice(1).every((v, i) => v >= 2 * vals[i]);
      if (!apart(byUsd.map((c) => usd.get(c.tcgplayer))) || !apart(byEur.map((p) => eur.get(p)))) continue;
      byUsd.forEach((c, i) => pick.set(c.id, byEur[i]));
    }

    // A product two cards claim stays with the cards it fits. Another card's product goes; a namesake's only when
    // another claimant fits it (attack names TCGdex and Cardmarket translate differently, in the newest sets).
    const claims = new Map();
    for (const c of setCards) { const p = pick.get(c.id); if (p != null) claims.set(p, [...(claims.get(p) ?? []), c]); }
    for (const [p, cs] of claims) {
      if (cs.length < 2) continue;
      const prod = byId.get(p);
      const fits = cs.some((c) => prod && good(fit(c, prod)));
      for (const c of cs) if (!prod || (!good(fit(c, prod)) && (fits || c.key.name !== prod.key.name))) pick.set(c.id, null);
    }

    for (const c of setCards) {
      const now = pick.get(c.id) ?? null, was = c.product ?? null;
      out.set(c.id, now);
      if (now === was) continue;
      if (was == null) report.added.push([c.id, now]);
      else if (now == null) report.removed.push([c.id, was]);
      else report.changed.push([c.id, was, now]);
    }
  }
  return { products: out, report };
}

/**
 * Japanese TCGdex cards (names in Japanese, so not matched by name) checked against the Japanese catalogue's match
 * (ja.json: TCGplayer's English names and attacks matched to Cardmarket). Where they differ:
 * - the same card in another expansion (30th Celebration: TCGdex names the Simplified Chinese print): the catalogue's;
 * - two different cards: the one named after the card's Pokémon (Pokédex number), else the one in the expansion the
 *   set's cards are in; trainers stay as TCGdex has them (the catalogue pairs by number, which can be shifted).
 * cards: [{ id, set, product, dexIds }], jaRows: ja.json rows, species: [[dex, en, …]].
 */
export function checkJapanese(cards, jaRows, products, species) {
  const byId = new Map(products.map((p) => [p.idProduct, { exp: p.idExpansion, key: productKey(p.name) }]));
  const theirs = new Map();
  for (const r of jaRows) if (r[7] && r[8]?.[0] && (!theirs.has(r[7]) || !r[4])) theirs.set(r[7], r[8][0]); // regular version first
  const enName = new Map(species.map((s) => [s[0], norm(s[1])]));
  const main = new Map(); // set → the expansion the catalogue finds most of its cards in
  for (const c of cards) if (byId.has(theirs.get(c.id))) {
    const m = main.get(c.set) ?? new Map(), exp = byId.get(theirs.get(c.id)).exp;
    m.set(exp, (m.get(exp) ?? 0) + 1); main.set(c.set, m);
  }
  const mainOf = (set) => [...(main.get(set) ?? [])].sort((a, b) => b[1] - a[1])[0]?.[0];
  const out = new Map(), report = { added: [], changed: [] };
  for (const c of cards) {
    const t = c.product ?? null, j = theirs.get(c.id) ?? null;
    let now = t;
    if (j && !t) now = j;
    else if (j && t !== j && byId.has(t) && byId.has(j)) {
      const pt = byId.get(t), pj = byId.get(j);
      const named = (p) => (c.dexIds ?? []).some((d) => enName.get(d) && p.key.name.includes(enName.get(d)));
      if (keyText(pt.key) === keyText(pj.key)) { if (pt.exp !== pj.exp) now = j; }
      else if (named(pj) !== named(pt)) now = named(pj) ? j : t;
      else if (pj.exp === mainOf(c.set) && pt.exp !== pj.exp) now = j;
    }
    out.set(c.id, now);
    if (now !== t) (t == null ? report.added : report.changed).push(t == null ? [c.id, now] : [c.id, t, now]);
  }
  return { products: out, report };
}
