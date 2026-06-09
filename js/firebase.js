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
  apiKey: "AIzaSyCEE8syuFBK1Q54iO1GLJ7YVGS0UeJ3r74",
  authDomain: "team-fines.firebaseapp.com",
  projectId: "team-fines",
  storageBucket: "team-fines.firebasestorage.app",
  messagingSenderId: "477960485258",
  appId: "1:477960485258:web:5bae03db3b2e6f3d387073",
  measurementId: "G-E52NG0XMCK"
};
// ▲▲▲  REPLACE WITH YOUR OWN CONFIG  ▲▲▲

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db   = getFirestore(app);
