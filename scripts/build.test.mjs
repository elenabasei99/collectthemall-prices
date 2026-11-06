import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOnePiece, buildSealed } from './build.mjs';

test('One Piece versions are split by English and Japanese expansion, in product order', () => {
  const singles = [
    { idProduct: 11, name: 'Shanks (OP01-120)', idExpansion: 1 },
    { idProduct: 10, name: 'Shanks (OP01-120)', idExpansion: 1 },
    { idProduct: 12, name: 'Zoro (OP01-001)', idExpansion: 1 },
    { idProduct: 20, name: 'Shanks (OP01-120)', idExpansion: 2 },
    { idProduct: 30, name: 'Shanks (OP01-120)', idExpansion: 3 },
    { idProduct: 40, name: 'Luffy (P-001)', idExpansion: 4 },
    { idProduct: 41, name: 'Luffy (P-001)', idExpansion: 5 },
  ];
  const nonsingles = [
    { idExpansion: 1, name: 'Romance Dawn Booster' },
    { idExpansion: 2, name: 'Romance Dawn Booster (Non-English)' },
    { idExpansion: 3, name: 'Romance Dawn Booster Box (Pre-Errata)' },
  ];
  const guide = [{ idProduct: 10, trend: 4.64 }, { idProduct: 11, trend: 91.96, avg30: 106.4 }, { idProduct: 20, trend: 3.52 }];
  const cards = buildOnePiece(singles, nonsingles, guide);
  assert.deepEqual(cards['OP01-120'].en, [[10, 4.64, null, null], [11, 91.96, 106.4, null]]);
  assert.deepEqual(cards['OP01-120'].ja, [[20, 3.52, null, null]]);
  assert.equal(cards['OP01-001'].en.length, 1);
  assert.deepEqual(cards['P-001'].en.map((r) => r[0]), [40, 41]);
});

test('sealed products skip lots, coins and sets', () => {
  const rows = buildSealed('pokemon', [
    { idProduct: 1, name: 'ETB', categoryName: 'Pokémon Elite Trainer Boxes' },
    { idProduct: 2, name: 'Lot', categoryName: 'Pokémon Lot' },
    { idProduct: 3, name: 'Coin', categoryName: 'Pokémon Coins' },
  ], [{ idProduct: 1, trend: 150.96, low: 85 }]);
  assert.deepEqual(rows, [[1, 'pokemon', 'ETB', 'Elite Trainer Boxes', 150.96, null, 85]]);
});
