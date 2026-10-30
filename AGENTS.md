<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules
- Slotegrator calls are signed (HMAC-SHA1 over sorted params + auth headers) inside `createServerFn` handlers in `src/lib/slotegrator.functions.ts`; the merchant key must never reach the browser.
- Signing helpers use Web Crypto (`crypto.subtle`), not Node `crypto`, to stay runtime-portable.
- All app data (players, sessions, balances, transactions) lives in a JSON file (`src/lib/filedb.server.ts`, `$DATA_DIR/db.json`, default `<cwd>/data/db.json`), not Lovable Cloud — the app is self-hosted on a VPS with Node/Bun; it needs a filesystem, so it does not run on Workers hosting.
- Every write goes through `withDb` (serialized read-modify-write, atomic rename) so concurrent wallet callbacks never lose balance updates; the data folder is gitignored so `git pull` never overwrites it.
- The database path comes only from server config, never from a request URL, to prevent reading arbitrary server files.
- Sign-in uses an httpOnly session cookie (`src/lib/auth.server.ts`); admin checks happen server-side in every admin server function; first admin requires `ADMIN_SETUP_CODE` from the server env and only works while no admin exists. No fixed admin credentials.
- Errors shown to users carry full detail through `ErrorDetails` with a copy button.
