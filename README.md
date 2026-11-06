# collectthemall-prices

Daily price files for [CollectThemAll](../CollectThemAll), built from Cardmarket's free
[price guide and product catalogue downloads](https://news.cardmarket.com/en/Magic/were-making-the-price-guide-and-product-catalogue-available-for-download)
(the browser can't read those directly, and they are large). Only public Cardmarket prices live here.

A GitHub Action (`.github/workflows/prices.yml`) runs every morning, rebuilds the files and commits them when they change.
Run it by hand from the repository's **Actions** tab ("Daily prices" → "Run workflow").

| File | What |
| --- | --- |
| `data/onepiece.json` | One Piece singles by card code: `en` and `ja` (Cardmarket "Non-English") lists of versions in product order (normal, then parallels), each `[idProduct, trend, avg30, low]` in EUR |
| `data/sealed.json` | Pokémon and One Piece sealed products: `[idProduct, game, name, category, trend, avg30, low]` |
| `data/meta.json` | Date of the Cardmarket prices and counts |
| `data/history/<date>.csv` | Weekly snapshot of trend prices (One Piece singles and sealed) |

Pokémon singles are not here: the app reads their Cardmarket prices from TCGdex.

```bash
node scripts/build.mjs                 # download and build
node scripts/build.mjs --from <dir>    # build from already downloaded files
node --test scripts/                   # tests
```
