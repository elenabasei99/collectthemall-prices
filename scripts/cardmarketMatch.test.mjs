import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchProducts, nameAndMoves, productKey } from './cardmarketMatch.mjs';

const P = (idProduct, name, idExpansion = 1) => ({ idProduct, name, idExpansion });
const C = (set, localId, name, moves, product = null, extra = {}) => ({ id: `${set}-${localId}`, set, localId, name, moves, product, ...extra });
const run = (cards, products) => Object.fromEntries(matchProducts(cards, products).products);

test("Cardmarket names: attacks in the last brackets, Nidoran's sex and Unown's letter kept, [Special] apart", () => {
  assert.deepEqual(productKey('Nidoran [M] [Horn Hazard]'), { name: 'nidoranm', moves: ['hornhazard'], tag: undefined, special: false });
  assert.deepEqual(productKey('Unown [D] [Shuffle | Hidden Power]'), { name: 'unown', moves: ['shuffle', 'hiddenpower'], tag: 'D', special: false });
  assert.deepEqual(productKey('Darkness Energy [Special]'), { name: 'darknessenergy', moves: [], tag: undefined, special: true });
  assert.equal(productKey('Magneton Lv.40 [Magnetic Resonance]').name, productKey('Magneton [Magnetic Resonance]').name);
  assert.equal(productKey('Rayquaza Gold Star [Spiral Rush | Holy Star]').name, 'rayquazagoldstar');
});

test('TCGdex card files: English name, abilities and attacks, special energy', () => {
  const text = `const card = { name: { en: "Latias ☆", fr: "Latias ☆" }, abilities: [{ type: "Poke-Power", name: { en: "Healing Light" } }],
    attacks: [{ cost: ["Fire"], name: { en: "Shooting Star", fr: "Étoile filante" }, effect: { en: "…" } }], weaknesses: [{ type: "Colorless" }] }`;
  assert.deepEqual(nameAndMoves(text), { name: 'Latias ☆', moves: ['Healing Light', 'Shooting Star'], special: false });
  assert.equal(nameAndMoves('{ name: { en: "Darkness Energy" }, energyType: "Special" }').special, true);
});

const deoxys = [
  P(10, 'Hariyama ex [Commanding Aura | Knock Off]'), P(11, 'Deoxys [Form Change | Link Blast]'), P(12, 'Deoxys [Form Change | Energy Crush]'),
  P(13, 'Latias Gold Star [Healing Light | Shooting Star]'), P(14, 'Rayquaza [Dragon Aura | Tumbling Attack]'), P(15, 'Rayquaza Gold Star [Spiral Rush | Holy Star]'),
];

test('a missing product is found by name and attacks; a product of another card is replaced', () => {
  const cards = [
    C('ex8', '1', 'Hariyama ex', ['Commanding Aura', 'Knock Off'], 10),
    C('ex8', '16', 'Deoxys', ['Form Change', 'Link Blast'], 11),
    C('ex8', '17', 'Deoxys', ['Form Change', 'Energy Crush'], 11), // TCGdex: the other Deoxys's product
    C('ex8', '105', 'Latias ☆', ['Healing Light', 'Shooting Star']), // TCGdex: none
    C('ex8', '22', 'Rayquaza', ['Dragon Aura', 'Tumbling Attack'], 14),
    C('ex8', '107', 'Rayquaza ☆', ['Spiral Rush', 'Holy Star'], 14), // TCGdex: the plain Rayquaza
  ];
  assert.deepEqual(run(cards, deoxys), { 'ex8-1': 10, 'ex8-16': 11, 'ex8-17': 12, 'ex8-105': 13, 'ex8-22': 14, 'ex8-107': 15 });
});

test('prints with the same name and attacks: each next to the cards numbered next to it (TCGdex had them swapped)', () => {
  // Call of Legends: Shiny Legends listed first (SL9 Raikou, SL10 Rayquaza, SL11 Suicune), then holos 18 to 21.
  const products = [
    P(34, 'Raikou [Extreme Speed | Raging Thunder]'), P(35, 'Rayquaza [Inferno Spear]'), P(36, 'Suicune [Extreme Speed | Tsunami]'),
    P(61, 'Pachirisu [Self-Generation]'), P(62, 'Palkia [Wormhole]'), P(63, 'Rayquaza [Inferno Spear]'), P(64, 'Smeargle [Portrait | Tail Rap]'),
  ];
  const cards = [
    C('col1', 'SL9', 'Raikou', ['Extreme Speed', 'Raging Thunder'], 34), C('col1', 'SL11', 'Suicune', ['Extreme Speed', 'Tsunami'], 36),
    C('col1', '18', 'Pachirisu', ['Self-Generation'], 61), C('col1', '19', 'Palkia', ['Wormhole'], 62), C('col1', '21', 'Smeargle', ['Portrait', 'Tail Rap'], 64),
    C('col1', '20', 'Rayquaza', ['Inferno Spear'], 35), C('col1', 'SL10', 'Rayquaza', ['Inferno Spear'], 63),
  ];
  const out = run(cards, products);
  assert.equal(out['col1-20'], 63);
  assert.equal(out['col1-SL10'], 35);
});

test('prints sharing one product, neighbours unknown, expansion in number order: the prints in number order', () => {
  const products = [P(1, 'Abra [Psyshock]'), P(2, 'Hala'), P(3, 'Kadabra [Psychic]'), P(4, 'Lillie'), P(5, 'Hala'), P(6, 'Mallow'), P(9, 'Hala')];
  const cards = [
    C('sm2', '1', 'Abra', ['Psyshock'], 1), C('sm2', '3', 'Kadabra', ['Psychic'], 3), C('sm2', '140', 'Lillie', [], 4), C('sm2', '150', 'Mallow', [], 6),
    C('sm2', '126', 'Hala', [], 2), C('sm2', '143', 'Hala', [], 2),
  ];
  const out = run(cards, products);
  assert.equal(out['sm2-126'], 2);
  assert.equal(out['sm2-143'], 5);
});

test('special and basic energy are different products', () => {
  const products = [P(1, 'Darkness Energy [Special]'), P(2, 'Metal Energy [Special]'), P(3, 'Darkness Energy')];
  const cards = [C('col1', '86', 'Darkness Energy', [], 1, { special: true }), C('col1', '87', 'Metal Energy', [], 2, { special: true }), C('col1', '94', 'Darkness Energy', [], 1)];
  assert.deepEqual(run(cards, products), { 'col1-86': 1, 'col1-87': 2, 'col1-94': 3 });
});

test("sets Cardmarket doesn't sell (TCG Pocket) are left as TCGdex has them", () => {
  const cards = [C('A1', '1', 'Bulbasaur', ['Vine Whip']), C('A1', '2', 'Ivysaur', ['Razor Leaf']), C('A1', '3', 'Venusaur ex', ['Giant Bloom']), C('A1', '4', 'Mew ex', ['Genome Hacking'])];
  assert.deepEqual(run(cards, [P(1, 'Bulbasaur [Vine Whip]', 7)]), { 'A1-1': null, 'A1-2': null, 'A1-3': null, 'A1-4': null });
});

test('what changed is reported', () => {
  const { report } = matchProducts([C('ex8', '105', 'Latias ☆', ['Healing Light', 'Shooting Star']), C('ex8', '1', 'Hariyama ex', ['Commanding Aura', 'Knock Off'], 14)], deoxys);
  assert.deepEqual(report, { added: [['ex8-105', 13]], changed: [['ex8-1', 14, 10]], removed: [] });
});
