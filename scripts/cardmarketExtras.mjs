// Versions Cardmarket sells that the app's catalogues don't list (OPTCG for One Piece; TCGdex and TCGplayer for
// Pokémon): Asian-exclusive promos, special prints, premium collections… Cardmarket's product list has no pictures
// or set names, so the app shows them with their price and a link to their Cardmarket page.

const CODE = /\(([A-Z]{1,5}\d{0,2}-\d{2,3})\)/;

/**
 * One Piece: by card code, the Cardmarket products of that code no catalogue version is matched to.
 * `kindOf(idExpansion)`: 'ja' for a "Non-English" expansion, else 'en' (the print the product is sold as).
 * Returns { code: [[idProduct, kind, idExpansion, ...priceRow]] }, priced products only.
 */
export function onePieceExtras(singles, guide, covered, kindOf, priceRow) {
  const price = new Map(guide.map((g) => [g.idProduct, g]));
  const out = {};
  for (const p of singles) {
    const m = CODE.exec(p.name);
    if (!m || covered.has(p.idProduct)) continue;
    const row = priceRow(price.get(p.idProduct));
    if (row[0] == null && row[1] == null) continue;
    (out[m[1]] ??= []).push([p.idProduct, kindOf(p.idExpansion), p.idExpansion, ...row]);
  }
  for (const list of Object.values(out)) list.sort((a, b) => a[0] - b[0]);
  return out;
}

/** The letter a Pokémon card's file is under: the first letter or digit of its name (accents removed). */
export const letterOf = (name) => {
  const s = String(name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/^[^a-z0-9]+/, '');
  return /^[a-z]/.test(s) ? s[0] : /^[0-9]/.test(s) ? '0' : '_';
};

/**
 * Pokémon: the priced Cardmarket singles no catalogue covers, by the letter their name starts with (so the app loads
 * only one small file for a search): { letter: [[idProduct, name, idExpansion, ...priceRow]] }.
 */
export function pokemonExtras(singles, guide, covered, priceRow) {
  const price = new Map(guide.map((g) => [g.idProduct, g]));
  const out = {};
  for (const p of singles) {
    if (covered.has(p.idProduct)) continue;
    const row = priceRow(price.get(p.idProduct));
    if (row[0] == null && row[1] == null) continue;
    (out[letterOf(p.name)] ??= []).push([p.idProduct, p.name, p.idExpansion, ...row]);
  }
  return out;
}

const PACKAGING = /\s*\b(booster|display|elite trainer|build & battle|\d+-pack|blister|tin|theme deck|box case|case)\b.*$/i;
const GENERIC = /^(starter|ultimate|demo|mini|premium|theme)( deck)?( ex)?$/i;
const tidy = (s) => s.replace(/[\s:\-–(]+$/, '').trim();

/**
 * A name for each Cardmarket expansion, which the product list doesn't give, from its sealed products' names: the
 * part before packaging words ("Two Legends Booster Box" → "Two Legends") or a colon ("Majestic Dawn: Polar Frost
 * Theme Deck"), the most common one; when they all differ, the words they start with. Without "(Non-English)".
 * Expansions with no sealed products get none.
 */
export function expansionLabels(nonsingles) {
  const names = new Map();
  for (const p of nonsingles) {
    if (/\blots?\b|coins/i.test(p.categoryName ?? '')) continue;
    const name = p.name.replace(/\s*\((non-english|japanese|\d+x [^)]*)\)/gi, '').trim();
    names.set(p.idExpansion, [...(names.get(p.idExpansion) ?? []), name]);
  }
  const out = {};
  for (const [exp, list] of names) {
    const count = new Map();
    for (const n of list) {
      // "Starter Deck: Straw Hat Crew" keeps its own name
      const head = n.split(':')[0];
      const base = tidy((GENERIC.test(tidy(head)) ? n : head).replace(PACKAGING, ''));
      if (base) count.set(base, (count.get(base) ?? 0) + 1);
    }
    const best = [...count].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0];
    let label = best?.[0] ?? '';
    if (list.length > 1 && best?.[1] === 1) {
      const words = list.map((n) => n.split(/\s+/));
      const common = [];
      for (let i = 0; words.every((w) => i < w.length && w[i].toLowerCase() === words[0][i].toLowerCase()); i++) common.push(words[0][i]);
      label = tidy(common.join(' '));
    }
    if (label && list.every((n) => /pre-errat/i.test(n)) && !/pre-errat/i.test(label)) label += ' (Pre-Errata)';
    if (label.length >= 3) out[exp] = label;
  }
  return out;
}
