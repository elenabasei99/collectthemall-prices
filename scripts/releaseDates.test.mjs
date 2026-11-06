import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReleaseDates, opCode } from './releaseDates.mjs';

test('release days of Pokémon, Japanese and One Piece sets', () => {
  const r = buildReleaseDates({
    tcgdexSets: [{ id: 'sv03.5', releaseDate: '2023-09-22' }, { id: 'odd', releaseDate: null }],
    jaGroups: [
      { groupId: 1, name: 'S4a: Shiny Star V', publishedOn: '2020-11-20T00:00:00' },
      { groupId: 2, name: 'Vending Machine cards Series 3 (Green)', publishedOn: '1998-06-01T00:00:00' },
    ],
    opGroups: [
      { abbreviation: 'OP01', publishedOn: '2022-12-02T00:00:00' },
      { abbreviation: 'OP02 PRE', publishedOn: '2023-03-01T00:00:00' },
      { abbreviation: 'OP02', publishedOn: '2023-03-10T00:00:00' },
      { abbreviation: 'ST-01', publishedOn: '2022-12-02T00:00:00' },
      { abbreviation: 'OP14-EB04', publishedOn: '2026-01-16T00:00:00' },
    ],
  });
  assert.deepEqual(r.pokemon, { 'sv03.5': '2023-09-22' });
  assert.deepEqual(r.pokemonJa, { s4a: '2020-11-20', tp2: '1998-06-01' });
  assert.deepEqual(r.onepiece, { OP01: '2022-12-02', OP02: '2023-03-10', ST01: '2022-12-02', OP14EB04: '2026-01-16' });
  assert.equal(opCode('PRB-01'), 'PRB01');
});
