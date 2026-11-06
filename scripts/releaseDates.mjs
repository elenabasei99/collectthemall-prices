// When each set came out, so the app can filter cards by year of release.
//   pokemon:   TCGdex English set id → day (Italian sets share the ids)
//   pokemonJa: Japanese set code, lowercase (TCGdex and TCGplayer use the same codes: "s4a") → day;
//              TCGplayer sets without a code as "tp<groupId>" (the app's ids for them)
//   onepiece:  set code without punctuation ("OP01", "ST01", "PRB01", "OP14EB04") → day
import { getJson } from './pokemonJa.mjs';

const day = (s) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);
export const opCode = (code) => String(code).toUpperCase().replace(/[^A-Z0-9]/g, '');

export function buildReleaseDates({ tcgdexSets = [], jaGroups = [], opGroups = [] }) {
  const pokemon = {};
  for (const s of tcgdexSets) if (day(s.releaseDate)) pokemon[s.id] = day(s.releaseDate);
  const pokemonJa = {};
  for (const g of jaGroups) {
    const d = day(g.publishedOn); if (!d) continue;
    const code = (g.name.includes(':') ? g.name.split(':')[0] : '').trim().toLowerCase() || `tp${g.groupId}`;
    if (!pokemonJa[code] || d < pokemonJa[code]) pokemonJa[code] = d; // a code shared by several products: the first
  }
  const onepiece = {};
  for (const g of opGroups) {
    const d = day(g.publishedOn);
    const abbr = (g.abbreviation ?? '').trim();
    // "OP05 PRE", "OP10 RE", "OP13 ANN": pre-release and event cards, not the set itself
    if (!d || !abbr || /\s/.test(abbr)) continue;
    const code = opCode(abbr);
    if (!onepiece[code] || d < onepiece[code]) onepiece[code] = d;
  }
  return { pokemon, pokemonJa, onepiece };
}

export async function downloadReleaseSources() {
  const [tcgdex, op] = await Promise.allSettled([
    fetch('https://api.tcgdex.net/v2/graphql', { method: 'POST', headers: { 'content-type': 'application/json', 'User-Agent': 'collectthemall-prices (personal collection app)' }, body: JSON.stringify({ query: '{ sets { id releaseDate } }' }) })
      .then((r) => r.json()).then((d) => { if (!Array.isArray(d?.data?.sets) || d.data.sets.length < 100) throw new Error('TCGdex sets'); return d.data.sets; }),
    getJson('https://tcgcsv.com/tcgplayer/68/groups').then((d) => { if (!Array.isArray(d.results) || d.results.length < 30) throw new Error('One Piece sets'); return d.results; }),
  ]);
  return { tcgdexSets: tcgdex.status === 'fulfilled' ? tcgdex.value : null, opGroups: op.status === 'fulfilled' ? op.value : null };
}
