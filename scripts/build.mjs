// Builds the small price files CollectThemAll reads, from Cardmarket's free daily price guide and product catalogue.
// Run: node scripts/build.mjs [--from <folder with downloaded files>]
// Writes data/onepiece.json, data/sealed.json, data/meta.json and, once a week, data/history/<date>.csv.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

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
/** [trend, avg30, low] — the app uses trend, then the 30-day average. */
const priceRow = (g) => (g ? [num(g.trend), num(g.avg30), num(g.low)] : [null, null, null]);

const CODE = /\(([A-Z]{1,4}\d{0,2}-\d{2,3})\)/;

/**
 * One Piece singles: Cardmarket names every version of a card the same ("Shanks (OP01-120)"), in separate expansions
 * for English and for Japanese ("Non-English") prints. For each card code we find the main English and Japanese
 * expansion of its set (the expansion whose cards mostly carry that set's prefix, told apart by the "(Non-English)"
 * boxes in it) and list the versions in Cardmarket's product order: normal, then parallels.
 */
export function buildOnePiece(singles, nonsingles, guide) {
  const price = new Map(guide.map((g) => [g.idProduct, g]));
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

const SEALED_SKIP = /lots?$|^PCG Set|Set$|Coins$/i;

export function buildSealed(game, nonsingles, guide) {
  const price = new Map(guide.map((g) => [g.idProduct, g]));
  return nonsingles
    .filter((p) => !SEALED_SKIP.test(p.categoryName))
    .map((p) => [p.idProduct, game, p.name, p.categoryName.replace(/^(Pokémon|One Piece)\s*/, ''), ...priceRow(price.get(p.idProduct))]);
}

async function main() {
  const [pkGuide, pkSealed, opGuide, opSingles, opSealed] = await Promise.all([
    load(`priceGuide/price_guide_${GAMES.pokemon}.json`),
    load(`productList/products_nonsingles_${GAMES.pokemon}.json`),
    load(`priceGuide/price_guide_${GAMES.onepiece}.json`),
    load(`productList/products_singles_${GAMES.onepiece}.json`),
    load(`productList/products_nonsingles_${GAMES.onepiece}.json`),
  ]);
  const check = (f, key, min) => { if (!Array.isArray(f?.[key]) || f[key].length < min) throw new Error(`unexpected file: ${key} has ${f?.[key]?.length}`); };
  check(pkGuide, 'priceGuides', 10000); check(opGuide, 'priceGuides', 3000);
  check(pkSealed, 'products', 1000); check(opSingles, 'products', 3000); check(opSealed, 'products', 100);

  const updated = opGuide.createdAt ?? pkGuide.createdAt ?? new Date().toISOString();
  const onepiece = buildOnePiece(opSingles.products, opSealed.products, opGuide.priceGuides);
  const sealed = [
    ...buildSealed('pokemon', pkSealed.products, pkGuide.priceGuides),
    ...buildSealed('onepiece', opSealed.products, opGuide.priceGuides),
  ];
  await mkdir(join(OUT, 'history'), { recursive: true });
  await writeFile(join(OUT, 'onepiece.json'), JSON.stringify({ updated, columns: ['idProduct', 'trend', 'avg30', 'low'], cards: onepiece }));
  await writeFile(join(OUT, 'sealed.json'), JSON.stringify({ updated, columns: ['idProduct', 'game', 'name', 'category', 'trend', 'avg30', 'low'], products: sealed }));
  await writeFile(join(OUT, 'meta.json'), JSON.stringify({ updated, built: new Date().toISOString(), onepieceCards: Object.keys(onepiece).length, sealedProducts: sealed.length }, null, 2) + '\n');

  // Weekly snapshot of trend prices (One Piece singles and all sealed), for price history.
  const day = updated.slice(0, 10);
  if (new Date(day).getUTCDay() === 1 || process.argv.includes('--history')) {
    const lines = ['idProduct,trend'];
    for (const langs of Object.values(onepiece)) for (const rows of Object.values(langs)) for (const r of rows) if (r[1] != null) lines.push(`${r[0]},${r[1]}`);
    for (const r of sealed) if (r[4] != null) lines.push(`${r[0]},${r[4]}`);
    await writeFile(join(OUT, 'history', `${day}.csv`), lines.join('\n') + '\n');
  }
  console.log(`Prices of ${updated}: ${Object.keys(onepiece).length} One Piece cards, ${sealed.length} sealed products.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}
