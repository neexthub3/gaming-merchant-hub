# Tasks
- [x] Move players, logins, balances and game transactions to a JSON file on the server (data/db.json, DATA_DIR override).
- [x] Show detailed, copyable errors on screen (games, sign-in, admin).
- [x] Slotegrator wallet callback and health check use the file database.
- [x] Admin setup code is read from ADMIN_SETUP_CODE in the server .env.
- [ ] Real game launch test: waiting on Slotegrator whitelisting the VPS IP and real secret values (preview has placeholders).
- [ ] Become first admin: waiting for the user to register on the VPS and enter their ADMIN_SETUP_CODE at /admin.
- [ ] Game shows balance 0 while the player's account has money: log every Slotegrator callback + admin "Test callback" button.
- [ ] Admin: show total player balance, total bets/wins/GGR, and a per-provider breakdown (plus Slotegrator limits) in a clean dashboard.
