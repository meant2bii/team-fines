# Security Policy

## Firebase API Key

The `js/firebase.js` file contains a Firebase Web API Key. This is **intentional and safe** for a client-side web app.

### Why it's safe to commit

Firebase web API keys are **not secrets** — they are public project identifiers, similar to a Google Maps embed key. They tell Firebase *which project* to connect to. Actual security is enforced by:

1. **Firestore Security Rules** — only authenticated, email-verified users can read/write data
2. **Firebase Authentication** — access requires a valid account
3. **HTTP Referrer Restrictions** — set in Google Cloud Console → APIs & Services → Credentials to lock the key to your domain only

### How to restrict the key to your domain (recommended)

1. Open [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Click your Browser key (auto-created by Firebase)
3. Under **Application restrictions** → select **HTTP referrers**
4. Add your allowed domains:
   - `https://yourdomain.com/*`
   - `https://team-fines.firebaseapp.com/*`
   - `https://team-fines.web.app/*`
5. Save → GitHub secret scanning alert can then be dismissed as **"Used in tests"**

### References
- [Firebase docs: API key best practices](https://firebase.google.com/docs/projects/api-keys)
- [Firebase docs: Security rules](https://firebase.google.com/docs/firestore/security/get-started)
