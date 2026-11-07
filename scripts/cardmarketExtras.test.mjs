import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expansionLabels, letterOf, onePieceExtras, pokemonExtras } from './cardmarketExtras.mjs';

const priceRow = (g) => (g ? [g.trend ?? null, g.avg30 ?? null, null, null, null] : [null, null, null, null, null]);

test('One Piece: Cardmarket versions of a code that no catalogue version is matched to, priced, with their print', () => {
  const singles = [
    { idProduct: 690809, name: 'Sanji (OP01-013)', idExpansion: 5229 },
    { idProduct: 773703, name: 'Sanji (OP01-013)', idExpansion: 5510 },
    { idProduct: 792762, name: 'Sanji (OP01-013)', idExpansion: 5744 },
    { idProduct: 1, name: 'Sanji (OP01-013)', idExpansion: 9 }, // no price
    { idProduct: 2, name: 'Booster Box', idExpansion: 9 },
  ];
  const guide = [{ idProduct: 690809, trend: 0.8 }, { idProduct: 773703, trend: 649.07 }, { idProduct: 792762, avg30: 453 }];
  const out = onePieceExtras(singles, guide, new Set([690809]), (e) => (e === 5744 ? 'ja' : 'en'), priceRow);
  assert.deepEqual(out, { 'OP01-013': [[773703, 'en', 5510, 649.07, null, null, null, null], [792762, 'ja', 5744, null, 453, null, null, null]] });
});

test('Pokémon: uncovered priced singles, filed by the first letter of their name', () => {
  assert.equal(letterOf('Éevee'), 'e');
  assert.equal(letterOf("_____'s Pikachu"), 's');
  assert.equal(letterOf('2 Pikachu'), '0');
  const out = pokemonExtras(
    [{ idProduct: 5, name: 'Pikachu [Gnaw]', idExpansion: 1 }, { idProduct: 6, name: 'Pikachu [Spark]', idExpansion: 1 }, { idProduct: 7, name: 'Mew', idExpansion: 2 }],
    [{ idProduct: 5, trend: 3 }, { idProduct: 7, trend: 9 }], new Set([7]), priceRow);
  assert.deepEqual(out, { p: [[5, 'Pikachu [Gnaw]', 1, 3, null, null, null, null]] });
});

test('expansion names from the sealed products sold in them', () => {
  const p = (idExpansion, name, categoryName = 'Booster') => ({ idExpansion, name, categoryName });
  assert.deepEqual(expansionLabels([
    p(1, 'Two Legends Booster (Non-English)'), p(1, 'Two Legends Booster Box (Non-English)'), p(1, 'Two Legends Booster Box Case (12x Booster Box) (Non-English)'),
    p(2, 'Revision Pack'),
    p(3, 'Kingdoms of Intrigue Dash Pack'), p(3, 'Uta Deck Battle Participation Pack'),
    p(4, 'Romance Dawn Booster Box (Pre-Errata)'), p(4, 'Romance Dawn Sleeved Booster (Pre-Errata)'),
    p(5, 'Demo Deck: Monkey.D.Luffy (OP01-003)'), p(5, 'Demo Deck: Roronoa Zoro (OP01-001)'),
    p(6, 'Lot of 10 cards', 'One Piece Lots'),
    p(7, 'Majestic Dawn Booster'), p(7, 'Majestic Dawn: Polar Frost Theme Deck'), p(7, 'Majestic Dawn: Lucario Coin (Blisters)', 'Pokémon Coins'),
    p(8, 'Premium Card Collection 25th Edition'), p(8, 'Premium Card Collection - Best Selection Vol.1'),
  ]), { 1: 'Two Legends', 2: 'Revision Pack', 4: 'Romance Dawn (Pre-Errata)', 5: 'Demo Deck', 7: 'Majestic Dawn', 8: 'Premium Card Collection' });
});
