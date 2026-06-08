# ⚽ Team Fines

A lightweight, mobile-friendly web app for managing football team fines — no backend, no database, no server required. Runs entirely in the browser.

## Features

- **Manager PIN lock** — only managers can add/edit/delete fines
- **Quick input** — type `Michal - Bago - 30` to log a fine instantly
- **Voice input** — speak the fine (Chrome/Edge only)
- **Full fine log** — searchable, filterable, with timestamps
- **Season summary** — per-player totals, fund overview
- **Email report** — generate a copy-paste message to send to players
- **Player roster** — manage names + email addresses
- **Persistent storage** — data saved in browser `localStorage`
- **Dark mode** — follows system preference
- **Mobile responsive**

## Setup

1. Clone or download this repository
2. Upload all files to your web hosting / domain
3. Open `index.html` in a browser — that's it!

No npm, no build step, no server needed.

## Configuration

Open `js/app.js` and change the top section:

```js
const CONFIG = {
  PIN: '1234',        // ← your manager PIN
  CURRENCY: 'CZK',   // ← currency symbol (EUR, CZK, GBP…)
  SEASON: '2025/26', // ← update each season
};
```

## File structure

```
team-fines/
├── index.html        ← main page
├── css/
│   └── style.css     ← all styles
├── js/
│   └── app.js        ← all logic
└── README.md
```

## Hosting

Works on any static hosting:
- **GitHub Pages** — push to a repo, enable Pages in Settings → Pages
- **Netlify / Vercel** — drag & drop the folder
- **Your own domain** — upload via FTP to your hosting

## Data & privacy

All data is stored in `localStorage` in the browser — nothing is sent to any server. If you clear browser data, fines are lost. For multi-device sync in the future, a small backend (e.g. Firebase) can be added.

## Future ideas

- [ ] Export to Excel / CSV
- [ ] Multiple seasons / archive
- [ ] Mark fines as "paid"
- [ ] Firebase sync for multi-device
- [ ] Push notifications before party deadline

## License

MIT — use freely, modify as needed.
