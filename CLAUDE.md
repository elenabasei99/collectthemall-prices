# collectthemall-prices: notes for Claude

Daily price files for the CollectThemAll app. The app's notes are in `../CollectThemAll/CLAUDE.md` (section "Prices: data and repo"); read that first.

- The Action "Daily prices" (`.github/workflows/prices.yml`, cron 04:20 UTC, often hours late) runs `node scripts/build.mjs` and commits `data/`.
  - `data/meta.json` says which parts were updated (`parts`, `allPartsUpdated`).
  - A part that fails keeps yesterday's file and adds a `::warning` annotation.
- **Build locally:** `source ~/.nvm/nvm.sh && node scripts/build.mjs --from <folder with Cardmarket files>`. Set `TCGDEX_DIR` to reuse a TCGdex clone. It takes about 3.5 min and rewrites `data/`.
- **Tests:** `node --test scripts/*.test.mjs`. List every new test file in the workflow's test step too.
- The bot commits daily: `git pull` before committing. **Push only when Elena says so.**
- **Changing formats:** price rows only ever get new columns at the end (older app versions read them). When a file changes in a way the app needs at once, raise the app's version constant for that file (e.g. `ONE_PIECE_FILE_VERSION` in `src/services/cmPrices.ts`).
