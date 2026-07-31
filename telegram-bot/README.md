# Telegram bot pro Pokuty

Tento Worker je bezplatný webhook pro Telegram. Přijímá pouze soukromé zprávy, podle Telegram ID vyhledá hráče a zapíše pokutu do stávajícího Firestore dokumentu.

## Příkazy hráče

- `/start` — vrátí Telegram ID, které administrátor uloží do profilu hráče v aplikaci.
- `/pokuta 30 - pozdní příchod` — zapíše hráči pokutu 30 Kč.
- `/help` — nápověda.

## Jednorázové nastavení

1. V Telegramu otevři `@BotFather`, použij `/newbot` a bezpečně si ulož token.
2. V Cloudflare vytvoř bezplatný účet, zkopíruj `wrangler.toml.example` na `wrangler.toml` a nasaď Worker příkazem `npx wrangler deploy`.
3. V Firebase Authentication založ samostatný e-mailový účet pro bota, například `telegram-bot@...`. V aplikaci jej schval jako **Pokladník**.
4. V Cloudflare zadej všech šest secrets z komentářů v `wrangler.toml.example`. `FIREBASE_API_KEY` a `FIREBASE_PROJECT_ID` jsou v `js/firebase.js`; heslo bot účtu zůstane jen v Cloudflare secret.
5. Nastav Telegram webhook:

```text
https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<worker>.workers.dev&secret_token=<TVUJ_TAJNY_RETEZEC>
```

6. Každý hráč pošle botovi `/start`. Jeho zobrazené ID vlož do pole **Telegram ID** při editaci hráče.

Nepoužívej stejný Firebase účet jako vlastní administrátorský účet. Worker má dostat pouze roli Pokladník.
