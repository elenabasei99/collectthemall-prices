// Pokémon prices for the cards TCGdex lists, in one file per language, so the app doesn't ask TCGdex card by card.
// TCGdex's card database is public (github.com/tcgdex/cards-database): each card names its Cardmarket product, and
// TCGdex's own prices are Cardmarket's price guide for that product — the guide this job already downloads.
import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const num = (x) => (typeof x === 'number' && x > 0 ? Math.round(x * 100) / 100 : null);

/** The top-level { … } objects of the array starting at `from` (a "[" in `text`). */
function arrayObjects(text, from) {
  const out = [];
  let depth = 0, start = -1;
  for (let i = from; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') { if (depth === 0) start = i; depth++; }
    else if (ch === '}') { depth--; if (depth === 0) out.push(text.slice(start, i + 1)); }
    else if (ch === ']' && depth === 0) break;
  }
  return out;
}

/**
 * A card file's Cardmarket product and versions. Newer files list versions ({ type, stamp?, thirdParty }), the first
 * unstamped one being the card itself; older ones have `variants: { normal: true, … }` and a card-level product.
 */
export function parseCardFile(text) {
  const at = text.search(/\bvariants\s*:/);
  const versions = new Set();
  let product = null;
  if (at >= 0) {
    const open = text.slice(at).search(/[[{]/) + at;
    if (text[open] === '[') {
      for (const v of arrayObjects(text, open)) {
        const type = /\btype\s*:\s*['"](\w+)['"]/.exec(v)?.[1];
        const stamps = /\bstamp\s*:\s*\[([^\]]*)\]/.exec(v)?.[1] ?? '';
        const cm = /\bcardmarket\s*:\s*(\d+)/.exec(v)?.[1];
        if (/1st-edition/.test(stamps)) versions.add('firstEdition');
        else if (type && !stamps && ['normal', 'holo', 'reverse'].includes(type)) versions.add(type);
        if (cm && !stamps && product == null) product = Number(cm);
      }
    } else {
      const obj = text.slice(open, text.indexOf('}', open) + 1);
      for (const [, k, v] of obj.matchAll(/\b(normal|holo|reverse|firstEdition)\s*:\s*(true|false)/g)) if (v === 'true') versions.add(k);
    }
  }
  if (product == null) { const cm = /\bcardmarket\s*:\s*(\d+)/.exec(text)?.[1]; if (cm) product = Number(cm); }
  return { product, versions: ['normal', 'holo', 'reverse', 'firstEdition'].filter((v) => versions.has(v)) };
}

/** Every card of a data folder (data/<serie>/<set>.ts with data/<serie>/<set>/<number>.ts): [{ id, product, versions }] */
export async function readDataFolder(root) {
  const cards = [];
  for (const serie of await readdir(root, { withFileTypes: true })) {
    if (!serie.isDirectory()) continue;
    const serieDir = join(root, serie.name);
    for (const f of await readdir(serieDir, { withFileTypes: true })) {
      if (!f.isFile() || !f.name.endsWith('.ts')) continue;
      const setDir = join(serieDir, f.name.slice(0, -3));
      if (!existsSync(setDir)) continue;
      const setId = /\bid\s*:\s*['"]([^'"]+)['"]/.exec(await readFile(join(serieDir, f.name), 'utf8'))?.[1];
      if (!setId) continue;
      for (const c of await readdir(setDir)) {
        if (!c.endsWith('.ts')) continue;
        const parsed = parseCardFile(await readFile(join(setDir, c), 'utf8'));
        cards.push({ id: `${setId}-${c.slice(0, -3)}`, ...parsed });
      }
    }
  }
  return cards;
}

const CODE = { normal: 'n', holo: 'h', reverse: 'r', firstEdition: 'f' };

/** id → [idProduct, trend, avg30, avg, trendHolo, avg30Holo, versions ("nhrf")] for cards with a product or versions. */
export function priceCards(cards, guide) {
  const g = new Map(guide.map((x) => [x.idProduct, x]));
  const out = {};
  for (const c of cards) {
    const p = c.product != null ? g.get(c.product) : null;
    const v = c.versions.map((x) => CODE[x]).join('');
    if (c.product == null && !v) continue;
    out[c.id] = [c.product, num(p?.trend), num(p?.avg30), num(p?.avg), num(p?.['trend-holo']), num(p?.['avg30-holo']), v];
  }
  return out;
}

/** TCGdex's card database, just the card folders (a partial clone, about a minute). */
export function cloneTcgdex(dir) {
  if (!existsSync(join(dir, '.git'))) {
    execFileSync('git', ['clone', '-q', '--depth', '1', '--filter=blob:none', '--sparse', 'https://github.com/tcgdex/cards-database', dir], { stdio: 'inherit' });
    execFileSync('git', ['-C', dir, 'sparse-checkout', 'set', 'data', 'data-asia'], { stdio: 'inherit' });
  }
  return { en: join(dir, 'data'), asia: join(dir, 'data-asia') };
}
