import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchEnglishImages } from './pokemonImages.mjs';

const product = (productId, name, number) => ({ productId, name, imageUrl: `x/${productId}`, extendedData: number ? [{ name: 'Number', value: number }, { name: 'CardType', value: 'Lightning' }] : [] });

test('a card without a picture takes the picture of the same card on TCGplayer', () => {
  const tcgdex = [
    { id: 'smp-SM04', localId: 'SM04', name: 'Pikachu' },
    { id: 'smp-SM05', localId: 'SM05', name: 'Snorlax', image: 'https://assets.tcgdex.net/en/sm/smp/SM05' },
    { id: 'smp-SM06', localId: 'SM06', name: 'Lurantis' },
  ];
  const groups = [
    { groupId: 1, products: [product(10, 'Pikachu - SM04', 'SM04'), product(11, 'Snorlax - SM05', 'SM05'), product(12, 'Lurantis - SM06', 'SM06')] },
    { groupId: 2, products: [product(20, 'Pikachu - SM04', 'SM04')] }, // another set with the same number: not chosen
  ];
  const { images, report } = matchEnglishImages(tcgdex, groups);
  assert.deepEqual(images, { 'smp-SM04': 10, 'smp-SM06': 12 });
  assert.equal(report.found, 2);
});

test('trainer kits: two decks in one TCGplayer set, the deck named in the set name wins', () => {
  const tcgdex = [{ id: 'tk-ex-m-9', localId: '9', name: 'Potion' }, { id: 'tk-ex-m-1', localId: '1', name: 'Minun', image: 'y' }];
  const groups = [{ groupId: 1, products: [product(30, 'Potion (Plusle)', '9'), product(31, 'Potion (Minun)', '9'), product(32, 'Minun', '1')] }];
  assert.deepEqual(matchEnglishImages(tcgdex, groups, { 'tk-ex-m': 'EX trainer Kit (Minun)' }).images, { 'tk-ex-m-9': 31 });
});

test('sets numbered differently on the two sites are paired by names', () => {
  const tcgdex = [
    { id: 'cel25cc-CC001', localId: 'CC001', name: 'Blastoise' },
    { id: 'cel25cc-CC002', localId: 'CC002', name: 'Charizard' },
    { id: 'cel25cc-CC003', localId: 'CC003', name: 'Venusaur', image: 'z' },
  ];
  const groups = [{ groupId: 5, products: [product(40, 'Blastoise', '2/102'), product(41, 'Charizard', '4/102'), product(42, 'Venusaur', '15/102')] }];
  assert.deepEqual(matchEnglishImages(tcgdex, groups).images, { 'cel25cc-CC001': 40, 'cel25cc-CC002': 41 });
});
