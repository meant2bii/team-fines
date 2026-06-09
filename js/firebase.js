/**
 * firebase.js — Firebase config & exports
 * ─────────────────────────────────────────────────────────────────
 * HOW TO SET UP:
 *
 *  1. Go to https://console.firebase.google.com
 *  2. Create a new project (e.g. "team-fines")
 *  3. Add a Web App ( </> icon on the project overview page)
 *  4. Copy YOUR firebaseConfig values below (replace the placeholders)
 *  5. In Firebase Console → Authentication → Sign-in method:
 *       Enable "Email/Password"
 *  6. In Firebase Console → Firestore Database:
 *       Create database → Start in production mode → choose region
 *  7. In Firebase Console → Firestore → Rules, paste:
 *
 *       rules_version = '2';
 *       service cloud.firestore {
 *         match /databases/{database}/documents {
 *           match /teamdata/{document=**} {
 *             allow read, write: if request.auth != null
 *                                && request.auth.token.email_verified == true;
 *           }
 *         }
 *       }
 *
 *  8. Deploy your site. Done — all devices share the same data!
 * ─────────────────────────────────────────────────────────────────
 */

import { initializeApp }        from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth }              from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore }         from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ▼▼▼  REPLACE WITH YOUR OWN CONFIG  ▼▼▼
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID",
};
// ▲▲▲  REPLACE WITH YOUR OWN CONFIG  ▲▲▲

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db   = getFirestore(app);
