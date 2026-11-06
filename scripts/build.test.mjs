import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appIds, buildOnePiece, buildReprints, buildSealed, indexOnePiece, setPrefixes } from './build.mjs';

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
  assert.deepEqual(cards['OP01-120'].en, [[10, 4.64, null, null, null, null], [11, 91.96, 106.4, null, null, null]]);
  assert.deepEqual(cards['OP01-120'].ja, [[20, 3.52, null, null, null, null]]);
  assert.equal(cards['OP01-001'].en.length, 1);
  assert.deepEqual(cards['P-001'].en.map((r) => r[0]), [40, 41]);
});

test('sealed products skip lots, coins and sets', () => {
  const rows = buildSealed('pokemon', [
    { idProduct: 1, name: 'ETB', categoryName: 'Pokémon Elite Trainer Boxes' },
    { idProduct: 2, name: 'Lot', categoryName: 'Pokémon Lot' },
    { idProduct: 3, name: 'Coin', categoryName: 'Pokémon Coins' },
  ], [{ idProduct: 1, trend: 150.96, low: 85 }]);
  assert.deepEqual(rows, [[1, 'pokemon', 'ETB', 'Elite Trainer Boxes', 150.96, null, 85, null, null]]);
});

test('set prefixes', () => {
  assert.deepEqual(setPrefixes('OP-05'), ['OP05']);
  assert.deepEqual(setPrefixes('PRB-01'), ['PRB01']);
  assert.deepEqual(setPrefixes('OP14-EB04'), ['OP14', 'EB04']);
});

test('app ids: printings sharing a picture code get their version name', () => {
  const ids = appIds([
    { card_set_id: 'OP04-056', card_image_id: 'OP04-056_p2', card_name: 'Gum-Gum Red Roc (Alternate Art)' },
    { card_set_id: 'OP04-056', card_image_id: 'OP04-056_p2', card_name: 'Gum-Gum Red Roc (Jolly Roger Foil)' },
    { card_set_id: 'OP04-056', card_image_id: 'OP04-056_r1', card_name: 'Gum-Gum Red Roc' },
  ]).map((r) => r.id).sort();
  assert.deepEqual(ids, ['OP04-056_p2~alternate-art', 'OP04-056_p2~jolly-roger-foil', 'OP04-056_r1']);
});

test('reprints are priced from the reprinting set, versions matched by price rank', () => {
  // Romance Dawn (1 EN, 2 JA) and The Best (3 EN, 4 JA): Otama OP01-006 is reprinted in The Best.
  const singles = [
    { idProduct: 1, name: 'Otama (OP01-006)', idExpansion: 1 }, { idProduct: 2, name: 'Luffy (OP01-024)', idExpansion: 1 },
    { idProduct: 5, name: 'Otama (OP01-006)', idExpansion: 2 }, { idProduct: 6, name: 'Luffy (OP01-024)', idExpansion: 2 },
    { idProduct: 30, name: 'Otama (OP01-006)', idExpansion: 3 }, { idProduct: 31, name: 'Otama (OP01-006)', idExpansion: 3 },
    { idProduct: 32, name: 'Otama (OP01-006)', idExpansion: 3 }, { idProduct: 33, name: 'Nami (PRB01-001)', idExpansion: 3 },
    { idProduct: 40, name: 'Otama (OP01-006)', idExpansion: 4 }, { idProduct: 41, name: 'Otama (OP01-006)', idExpansion: 4 },
    { idProduct: 42, name: 'Nami (PRB01-001)', idExpansion: 4 },
  ];
  const nonsingles = [
    { idExpansion: 1, name: 'Romance Dawn Booster' }, { idExpansion: 2, name: 'Romance Dawn Booster (Non-English)' },
    { idExpansion: 3, name: 'The Best Booster' }, { idExpansion: 4, name: 'The Best Booster (Non-English)' },
  ];
  // Cardmarket's product order differs from the price order: the expensive Alternate Art came first.
  const guide = [{ idProduct: 30, trend: 9.5 }, { idProduct: 31, trend: 0.2 }, { idProduct: 32, trend: 0.4 }, { idProduct: 40, trend: 3.2 }, { idProduct: 41, trend: 0.1 }];
  const optcg = {
    'PRB-01': [
      { card_set_id: 'OP01-006', card_image_id: 'OP01-006_r1', card_name: 'Otama (Reprint)', market_price: 0.23 },
      { card_set_id: 'OP01-006', card_image_id: 'OP01-006_p3', card_name: 'Otama (Jolly Roger Foil)', market_price: 0.42 },
      { card_set_id: 'OP01-006', card_image_id: 'OP01-006_p5', card_name: 'Otama (Alternate Art)', market_price: 7.19 },
      { card_set_id: 'PRB01-001', card_image_id: 'PRB01-001', card_name: 'Nami', market_price: 0.7 },
    ],
  };
  const { byId, report } = buildReprints(optcg, guide, indexOnePiece(singles, nonsingles));
  assert.deepEqual(byId['PRB-01|OP01-006_r1'], { en: [31, 0.2, null, null, null, null] }); // no Japanese plain reprint
  assert.deepEqual(byId['PRB-01|OP01-006_p3'], { en: [32, 0.4, null, null, null, null], ja: [41, 0.1, null, null, null, null] });
  assert.deepEqual(byId['PRB-01|OP01-006_p5'], { en: [30, 9.5, null, null, null, null], ja: [40, 3.2, null, null, null, null] });
  assert.equal(byId['PRB-01|PRB01-001'], undefined); // the set's own codes keep the usual lookup
  assert.equal(report.unmatched.length, 0);
});

test('a version count that does not add up is left unmatched rather than guessed', () => {
  const singles = [
    { idProduct: 1, name: 'Nami (PRB01-001)', idExpansion: 3 },
    { idProduct: 30, name: 'Otama (OP01-006)', idExpansion: 3 }, { idProduct: 31, name: 'Otama (OP01-006)', idExpansion: 3 },
  ];
  const optcg = { 'PRB-01': [
    { card_set_id: 'OP01-006', card_image_id: 'OP01-006_p3', card_name: 'Otama (Jolly Roger Foil)', market_price: 0.4 },
    { card_set_id: 'OP01-006', card_image_id: 'OP01-006_p4', card_name: 'Otama (Full Art)', market_price: 6 },
    { card_set_id: 'OP01-006', card_image_id: 'OP01-006_p5', card_name: 'Otama (Alternate Art)', market_price: 7 },
  ] };
  const { byId, report } = buildReprints(optcg, [], indexOnePiece(singles, [{ idExpansion: 3, name: 'The Best Booster' }]));
  assert.deepEqual(byId, {});
  assert.equal(report.unmatched.length, 1);
});
