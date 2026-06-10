/**
 * firebase.js — Firebase config
 *
 * SECURITY NOTE:
 * Firebase web API keys are NOT secret by themselves — they identify your
 * project to Firebase servers. Access is controlled by:
 *   • Firestore Security Rules  (who can read/write data)
 *   • Authentication            (only verified users)
 *   • HTTP Referrer Restrictions in Google Cloud Console
 *
 * To silence GitHub secret-scanning alerts, add your domain restrictions:
 *   Google Cloud Console → APIs & Services → Credentials
 *   → your API key → Application restrictions → HTTP referrers
 *   → Add: https://yourdomain.com/*  and  https://*.firebaseapp.com/*
 *
 * Then dismiss the GitHub alert as "Used in tests / won't fix".
 */

import { initializeApp }  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
<<<<<<< HEAD
import { getAuth, browserLocalPersistence, setPersistence }
                          from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
=======
import { getAuth }         from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
>>>>>>> 6d52e5b05c3d04d13f8c974b4e028b22c84a04d8
import { getFirestore }    from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey:            "AIzaSyCEE8syuFBK1Q54iO1GLJ7YVGS0UeJ3r74",
  authDomain:        "team-fines.firebaseapp.com",
  projectId:         "team-fines",
  storageBucket:     "team-fines.firebasestorage.app",
  messagingSenderId: "477960485258",
  appId:             "1:477960485258:web:5bae03db3b2e6f3d387073",
  measurementId:     "G-E52NG0XMCK",
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Keep user logged in permanently across browser sessions (tabs, restarts)
// Firebase's default for web is already browserLocalPersistence, but being explicit
// ensures GitHub Pages / static hosting doesn't fall back to session-only.
setPersistence(auth, browserLocalPersistence).catch(e => console.warn('Persistence:', e));

export { auth };
export const db = getFirestore(app);
