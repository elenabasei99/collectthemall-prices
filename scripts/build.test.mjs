import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appIds, buildOnePiece, buildReprints, buildSealed, indexOnePiece, orderVersions, setPrefixes } from './build.mjs';

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

test('reprint versions are ranked by a steady price: a trend far from the 30-day average is not trusted', () => {
  const singles = [
    { idProduct: 30, name: 'Otama (OP01-006)', idExpansion: 3 }, { idProduct: 31, name: 'Otama (OP01-006)', idExpansion: 3 },
    { idProduct: 33, name: 'Nami (PRB01-001)', idExpansion: 3 },
  ];
  // product 30 is the Alternate Art (about 9 €) but its trend fell to 0.02 € today
  const guide = [{ idProduct: 30, trend: 0.02, avg30: 9.1 }, { idProduct: 31, trend: 0.4, avg30: 0.35 }];
  const optcg = { 'PRB-01': [
    { card_set_id: 'OP01-006', card_image_id: 'OP01-006_p3', card_name: 'Otama (Jolly Roger Foil)', market_price: 0.42 },
    { card_set_id: 'OP01-006', card_image_id: 'OP01-006_p5', card_name: 'Otama (Alternate Art)', market_price: 7.19 },
  ] };
  const { byId } = buildReprints(optcg, guide, indexOnePiece(singles, [{ idExpansion: 3, name: 'The Best Booster' }]));
  assert.equal(byId['PRB-01|OP01-006_p5'].en[0], 30);
  assert.equal(byId['PRB-01|OP01-006_p3'].en[0], 31);
});

test('One Piece versions: paired with OPTCG by price, whatever order Cardmarket listed them in', () => {
  const row = (id, eur) => [id, eur, eur, eur, eur, eur];
  const optcg = { 'OP-02': [
    { card_set_id: 'OP02-026', card_image_id: 'OP02-026', market_price: 0.33, card_name: 'Sanji' },
    { card_set_id: 'OP02-026', card_image_id: 'OP02-026_p1', market_price: 122.66, card_name: 'Sanji (Alternate Art)' },
    { card_set_id: 'OP02-013', card_image_id: 'OP02-013', market_price: 3.26, card_name: 'Ace' },
    { card_set_id: 'OP02-013', card_image_id: 'OP02-013_p1', market_price: 44.31, card_name: 'Ace (Alternate Art)' },
    // OPTCG gives the Parallel the normal card's picture code
    { card_set_id: 'OP02-013', card_image_id: 'OP02-013', market_price: 900, card_name: 'Ace (Parallel)' },
  ], 'ST-01': [{ card_set_id: 'ST01-002', card_image_id: 'ST01-002', market_price: 1.08, card_name: 'Usopp' }] };
  const cards = {
    // the alternate art was listed first
    'OP02-026': { en: [row(696661, 109.23), row(700865, 0.14)] },
    // a print OPTCG doesn't list (2 €): left after the two versions
    'OP02-013': { en: [row(700493, 67.87), row(700821, 2.1), row(700823, 1.9)] },
    // no OPTCG for this card: yesterday's order of the same products
    'OP09-001': { en: [row(2, 50), row(1, 0.5)] },
    // only the normal card listed: the cheapest product
    'ST01-002': { en: [row(690967, 6.29), row(690968, 0.05)] },
  };
  const previous = { 'OP09-001': { en: [row(1, 0.4), row(2, 40)] } };
  const byId = {};
  assert.equal(orderVersions(cards, optcg, previous, byId), 4);
  // the Parallel sharing the normal card's picture code: the product left over, under its own app id
  assert.deepEqual(Object.keys(byId), ['OP-02|OP02-013~parallel']);
  assert.equal(byId['OP-02|OP02-013~parallel'].en[0], 700823);
  assert.deepEqual(cards['ST01-002'].en.map((r) => r[0]), [690968, 690967]);
  assert.deepEqual(cards['OP02-026'].en.map((r) => r[0]), [700865, 696661]);
  assert.deepEqual(cards['OP02-013'].en.map((r) => r[0]), [700821, 700493, 700823]);
  assert.deepEqual(cards['OP09-001'].en.map((r) => [r[0], r[1]]), [[1, 0.5], [2, 50]]);
});

test('One Piece expansions: a set\'s own wins over a promo expansion holding more of its cards', () => {
  const p = (idProduct, code, idExpansion) => ({ idProduct, name: `X (${code})`, idExpansion });
  const singles = [
    // Japanese promo packs: 3 ST01 cards among many others
    ...[1, 2, 3].map((i) => p(i, `ST01-00${i}`, 10)), ...[4, 5, 6, 7, 8, 9].map((i) => p(i, `OP0${i}-001`, 10)),
    // the Japanese starter deck: 2 ST01 cards, nothing else
    p(20, 'ST01-001', 11), p(21, 'ST01-002', 11),
    // an English deck sold only in Asia, next to the English one
    p(30, 'ST02-001', 12), p(31, 'ST02-002', 12), p(40, 'ST02-001', 13), p(41, 'ST02-002', 13),
  ];
  const nonsingles = [{ idExpansion: 10, name: 'DON!! Card Pack (Non-English)' }, { idExpansion: 11, name: 'Starter Deck (Non-English)' },
    { idExpansion: 12, name: 'Starter Deck (Asia Region Legal)' }, { idExpansion: 13, name: 'Starter Deck' }];
  const { main } = indexOnePiece(singles, nonsingles);
  assert.equal(main.get('ST01|ja').exp, 11);
  assert.equal(main.get('ST02|en').exp, 13);
});
