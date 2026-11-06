import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildJapanese, cardKey, cmKey, dexFinder, matchCards, matchExpansions, moveNames, parseCard } from './pokemonJa.mjs';

const species = JSON.parse(readFileSync(new URL('./species.json', import.meta.url), 'utf8')).species;
const product = (productId, name, ext) => ({ productId, name, extendedData: Object.entries(ext).map(([n, value]) => ({ name: n, value })) });

test('TCGplayer cards: name, version, number, abilities and attacks', () => {
  const c = parseCard(product(1, 'Rowlet - 001/190', {
    Number: '001/190', Rarity: 'None', CardType: 'Grass', HP: '50',
    Description: '<strong>Ability: Sky Circus</strong> If you played …',
    'Attack 1': "[Colorless][Colorless][Colorless] Wind Shard<br> This attack does 60 damage to 1 of your opponent's Benched Pokémon.",
  }));
  assert.deepEqual(c, { productId: 1, name: 'Rowlet', label: '', number: '001', rarity: '', kind: 'pokemon', moves: ['Sky Circus', 'Wind Shard'] });
  const mirror = parseCard(product(2, 'Cobalion (Mirror Holofoil)', { Number: '085/171', CardType: 'Metal', HP: '120', 'Attack 1': '[Metal] Quick Guard<br> Prevent …', 'Attack 2': '[Metal][Metal] Revenge Blast (30+)<br> …' }));
  assert.equal(mirror.name, 'Cobalion'); assert.equal(mirror.label, 'Mirror Holofoil'); assert.deepEqual(mirror.moves, ['Quick Guard', 'Revenge Blast']);
  assert.deepEqual(moveNames({ 'Attack 1': '2', 'Attack 2': '[Grass] Bind Down (10)<br> …' }), ['Bind Down']);
  assert.equal(parseCard(product(3, 'Shiny Star V Booster Box', { Description: '…' })), null);
  assert.equal(parseCard(product(4, 'Quick Ball', { Number: '160/190', CardType: 'Trainer - Item' })).kind, 'trainer');
});

test('the same card on Cardmarket has the same key', () => {
  assert.equal(cmKey('Eternatus V [Power Accelerator | Dynamax Cannon]'), cardKey('Eternatus V', ['Dynamax Cannon', 'Power Accelerator']));
  assert.equal(cmKey('Quick Ball'), cardKey('Quick Ball', []));
  assert.equal(cardKey('Pokémon Catcher', []), cardKey('Pok?mon Catcher', []));
});

test('Pokédex numbers from English, Japanese and Chinese names', () => {
  const en = dexFinder(species, 1), ja = dexFinder(species, 2), zh = dexFinder(species, 3);
  assert.deepEqual(en("Team Rocket's Mewtwo ex"), [150]);
  assert.deepEqual(en('Pikachu & Zekrom GX'), [25, 644]);
  assert.deepEqual(en('Mr. Mime'), [122]);
  assert.deepEqual(en("Farfetch'd"), [83]);
  assert.deepEqual(en('Mew ex'), [151]);
  assert.deepEqual(en('Pikachus Party'), []);
  assert.deepEqual(ja('ミュウツーex'), [150]);
  assert.deepEqual(ja('ミュウex'), [151]);
  assert.deepEqual(ja('リザードンVMAX'), [6]);
  assert.deepEqual(zh('皮卡丘V'), [25]);
});

test('versions are paired in card-number order; mirror versions use the reverse holo price', () => {
  const cards = [
    { productId: 10, name: 'Eternatus V', label: '', number: '124', moves: ['Power Accelerator', 'Dynamax Cannon'] },
    { productId: 11, name: 'Eternatus V', label: '', number: '327', moves: ['Power Accelerator', 'Dynamax Cannon'] },
    { productId: 12, name: 'Cobalion', label: '', number: '085', moves: ['Quick Guard'] },
    { productId: 13, name: 'Cobalion', label: 'Mirror Holofoil', number: '085', moves: ['Quick Guard'] },
    { productId: 14, name: 'Exeggcute', label: '', number: '001', moves: ['Filled with Fruit'] }, // translated differently
  ];
  const cm = [
    { idProduct: 520, name: 'Eternatus V [Power Accelerator | Dynamax Cannon]' },
    { idProduct: 535, name: 'Eternatus V [Power Accelerator | Dynamax Cannon]' },
    { idProduct: 600, name: 'Cobalion [Quick Guard]' },
    { idProduct: 700, name: 'Exeggcute [Jam-Packed]' },
  ];
  const m = matchCards(cards, cm, () => null, () => null);
  assert.deepEqual(m.get(10), [520, false]);
  assert.deepEqual(m.get(11), [535, false]);
  assert.deepEqual(m.get(13), [600, true]);
  assert.deepEqual(m.get(14), [700, false]);
});

test('sets find their Cardmarket expansion; small sets also need the set name', () => {
  const card = (name) => ({ name, label: '', moves: [] });
  const many = Array.from({ length: 20 }, (_, i) => `Mon${i}`);
  const groups = [
    { groupId: 1, name: 'S4a: Shiny Star V', cards: many.map(card) },
    { groupId: 2, name: 'DPt Gift Box (Pikachu)', cards: ['Mon1', 'Mon2'].map(card) },
  ];
  const singles = [...many.map((n, i) => ({ idProduct: i, name: n, idExpansion: 3580 })), ...many.map((n, i) => ({ idProduct: 100 + i, name: n, idExpansion: 9999 }))];
  const nonsingles = [{ idExpansion: 3580, name: 'Shiny Star V Booster Box' }, { idExpansion: 9999, name: 'Shining Fates Elite Trainer Box' }];
  const m = matchExpansions(groups, singles, nonsingles);
  assert.equal(m.get(1).exp, 3580);
  assert.equal(m.get(2), undefined);
});

test('catalogue rows: TCGdex twin, Pokédex number, Cardmarket price, else TCGplayer converted to euros', () => {
  const groups = [{
    groupId: 1, name: 'S4a: Shiny Star V', abbreviation: 'S4a', publishedOn: '2020-11-20T00:00:00',
    products: [
      product(10, 'Rowlet - 001/190', { Number: '001/190', CardType: 'Grass', HP: '50', 'Attack 1': '[C] Wind Shard<br>…' }),
      product(11, 'Dartrix - 002/190', { Number: '002/190', CardType: 'Grass', HP: '80', 'Attack 1': '[G] Razor Leaf (40)' }),
    ],
    prices: [{ productId: 10, marketPrice: 1.0, subTypeName: 'Normal' }, { productId: 11, marketPrice: 2.0, subTypeName: 'Normal' }],
  }];
  const out = buildJapanese({
    groups, species, eurPerUsd: 0.9,
    tcgdexJa: [{ id: 'S4a-001', localId: '001', name: 'モクロー', image: 'https://assets.tcgdex.net/ja/S/S4a/001' }],
    tcgdexZhTw: [{ id: 'S4a-001', localId: '001', name: '木木梟' }],
    cm: {
      // Dartrix is on Cardmarket without a price yet: TCGplayer's is used
      singles: [{ idProduct: 5, name: 'Rowlet [Wind Shard]', idExpansion: 3580 }, { idProduct: 6, name: 'Dartrix [Razor Leaf]', idExpansion: 3580 }],
      nonsingles: [{ idExpansion: 3580, name: 'Shiny Star V Booster Box' }],
      guide: [{ idProduct: 5, trend: 0.3, avg30: 0.25, low: 0.1 }],
    },
  });
  assert.deepEqual(out.sets, { 1: ['Shiny Star V', '2020-11-20', 'S4a'] });
  assert.deepEqual(out.cards[0], [10, 1, '001', 'Rowlet', '', '', 722, 'S4a-001', [5, 0.3, 0.25, 0.1, null, null], 0.9]);
  assert.deepEqual(out.cards[1], [11, 1, '002', 'Dartrix', '', '', 723, '', null, 1.8]);
  assert.deepEqual(out.tcgdexDex.ja[722], [['S4a-001', 'モクロー', 'https://assets.tcgdex.net/ja/S/S4a/001']]);
  assert.deepEqual(out.tcgdexDex['zh-tw'][722], [['S4a-001', '木木梟', '']]);
});
