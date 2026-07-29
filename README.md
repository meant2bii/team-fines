# ⚽ Team Fines

A mobile-friendly web app for managing football team fines. Supports multi-device sync via Firebase, email authentication with verification, batch voice input, and nickname-based player matching.

## Features

- **Firebase Auth** — register/login with email + password; email verification link required before access
- **Firestore sync** — all data stored in the cloud, every device sees the same fines in real time
- **Shared team access** — every user with a verified team account can add, edit and delete fines
- **Batch voice session** — speak all post-training fines at once; app parses them and shows a review screen before saving
- **Nickname matching** — assign nicknames per player; voice/text input resolves nicknames to real names automatically
- **Review & confirm** — every voice batch shows editable cards before committing
- **Full fine log** — searchable, filterable, with timestamps, edit & delete
- **Season summary** — per-player totals, fund overview, % of pot
- **Email report** — generates a copy-paste message to send to players
- **Dark mode** — follows system preference
- **Mobile responsive**

## Project structure

```
team-fines/
├── index.html          ← full app (auth screens + main app)
├── css/
│   └── style.css       ← all styles (auth, voice, review, players, …)
├── js/
│   ├── firebase.js     ← Firebase config + exports  ← EDIT THIS
│   └── app.js          ← all application logic
└── README.md
```

## Setup — 5 steps

### 1. Create a Firebase project

Go to https://console.firebase.google.com → **Add project** → name it (e.g. `team-fines`).

### 2. Enable Email/Password Auth

Firebase Console → **Authentication** → **Sign-in method** → **Email/Password** → Enable.

### 3. Create Firestore database

Firebase Console → **Firestore Database** → **Create database** → production mode → choose a region.

Then set security rules (**Firestore → Rules**):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /teamdata/{document=**} {
      allow read, write: if request.auth != null
                         && request.auth.token.email_verified == true;
    }
  }
}
```

This means: only logged-in users with a **verified** email can read/write team data.

### 4. Add your Firebase config

Firebase Console → Project settings → **Your apps** → **Web app** (add one if needed) → copy the `firebaseConfig` object.

Open `js/firebase.js` and paste your values:

```js
const firebaseConfig = {
  apiKey:            "AIza...",
  authDomain:        "your-project.firebaseapp.com",
  projectId:         "your-project-id",
  storageBucket:     "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123...",
};
```

### 5. Deploy

Upload all files to any static host:

- **GitHub Pages** → push to repo → Settings → Pages → branch `main`
- **Netlify** → drag & drop the folder at app.netlify.com
- **Your own domain** → FTP/SFTP upload, point domain to the folder

No build step, no npm, no server needed.

## App config

Open `js/app.js` top section:

```js
const CONFIG = {
  CURRENCY: 'CZK',     // ← EUR, GBP, USD, …
  FIRESTORE_DOC: 'teamdata/main', // ← one shared document for the whole team
};
```

## How voice input works

1. A signed-in team member taps **Spustit nahrávání**
2. Says all fines in sequence: *„Michal – Bago a překopnutí – 90, Teichi – Píčovina – 120, Pepa – pokuta – 100"*
3. 3.5 s of silence auto-stops the recording
4. App splits by comma/semicolon, parses each chunk as `Name – Reason – Amount`
5. Nicknames are resolved to real player names automatically
6. A review screen appears — the user can correct any entry or skip it
7. Tap **Uložit** → all confirmed fines are written to Firestore instantly

Requires Chrome or Edge (Web Speech API).

## How nicknames work

In the **Hráči** tab, each player has a tag icon. Tap it to open the nickname editor. Add any number of nicknames (e.g. `Bago`, `Teichi`, `Pepan`). When voice or text input uses a nickname, the app automatically links it to the correct player.

## Future ideas

- [ ] Export to Excel / CSV
- [ ] Per-season archive / reset
- [ ] Mark fines as "paid"
- [ ] Push notification reminders before party date
- [ ] Role-based access stored in Firestore, if the team later needs different permissions

## License

MIT
