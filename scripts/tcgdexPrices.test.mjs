import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCardFile, priceCards } from './tcgdexPrices.mjs';

test('newer card files: the first unstamped version names the product; stamped versions are left out', () => {
  const text = `const card: Card = {
    name: { en: "Bulbasaur" },
    variants: [
      { type: 'normal', thirdParty: { cardmarket: 733596, tcgplayer: 502552 } },
      { type: 'reverse', thirdParty: { cardmarket: 733596 } },
      { type: 'normal', stamp: ['set-logo'], thirdParty: { cardmarket: 720365 } },
      { type: "holo", subtype: "shadowless", stamp: ["1st-edition"], thirdParty: { cardmarket: 660224 } },
    ],
    retreat: 2,
  }`;
  assert.deepEqual(parseCardFile(text), { product: 733596, versions: ['normal', 'reverse', 'firstEdition'] });
});

test('older card files: versions as flags, the product at card level', () => {
  const text = `const card = { variants: { normal: false, holo: true, reverse: true, firstEdition: false }, thirdParty: { cardmarket: 12345 } }`;
  assert.deepEqual(parseCardFile(text), { product: 12345, versions: ['holo', 'reverse'] });
});

test('prices from the Cardmarket guide, with the versions', () => {
  const cards = [{ id: 'sv03.5-001', product: 733596, versions: ['normal', 'reverse'] }, { id: 'x-1', product: null, versions: [] }];
  const out = priceCards(cards, [{ idProduct: 733596, trend: 0.25, avg30: 0.2, avg: 0.22, 'trend-holo': 0.9, 'avg30-holo': 0.8, avg7: 0.3, avg1: 0.31 }]);
  assert.deepEqual(out, { 'sv03.5-001': [733596, 0.25, 0.2, 0.22, 0.9, 0.8, 'nr', 0.3, 0.31, null] });
});
