/**
 * Team Fines – e-mail notification for a new registration.
 *
 * 1. Create a new Apps Script project at https://script.google.com/
 * 2. Paste this entire file into Code.gs.
 * 3. In Project Settings → Script properties add FIREBASE_WEB_API_KEY.
 *    Use the Web API key from js/firebase.js (it identifies the Firebase project;
 *    it is not a secret). Do not put passwords or Firebase service-account keys here.
 * 4. Deploy → New deployment → Web app:
 *      Execute as: Me
 *      Who has access: Anyone
 *    Authorize the MailApp permission and copy the /exec URL into
 *    CONFIG.APPS_SCRIPT_NOTIFICATION_URL in js/app.js.
 */

const ADMIN_EMAIL = 'lyrixzz@gmail.com';
const FIREBASE_PROJECT_ID = 'team-fines';
const FIREBASE_LOOKUP_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=';
const FIRESTORE_ACCESS_URL = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT_ID + '/databases/(default)/documents/accessRequests';
// Administrative deletion is the v1 accounts:delete endpoint. With the Apps
// Script OAuth token it accepts localId + targetProjectId; the project-scoped
// URL used previously is not the Firebase Auth delete-user endpoint.
const FIREBASE_DELETE_ACCOUNT_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:delete';

// Opening the web-app URL in a browser sends GET. Keep this endpoint deliberately
// informational: notifications are accepted only through doPost with a Firebase ID token.
function doGet() {
  return response_('Team Fines registration notifier is running.');
}

function doPost(event) {
  try {
    const data = JSON.parse(event && event.postData ? event.postData.contents : '{}');
    if (data.action === 'deleteRegistration') return deleteRegistration_(data);
    const user = verifyFirebaseToken_(data.idToken);
    if (!user || !user.localId || !user.email) throw new Error('Neplatné ověření Firebase uživatele.');

    // One notification per newly created Firebase account within 24 hours.
    const cache = CacheService.getScriptCache();
    const cacheKey = 'registration:' + user.localId;
    if (cache.get(cacheKey)) return response_('already-notified');

    const firstName = clean_(data.firstName, 80);
    const lastName = clean_(data.lastName, 80);
    const phone = clean_(data.phone, 32);
    const fullName = [firstName, lastName].filter(Boolean).join(' ') || user.displayName || 'Bez jména';
    const subject = 'Pokuty: nová žádost o přístup – ' + fullName;
    const plain = [
      'Nový uživatel čeká na schválení.',
      '',
      'Jméno: ' + fullName,
      'E-mail: ' + user.email,
      'Telefon: ' + (phone || 'neuveden'),
      '',
      'Otevři aplikaci → Uživatelé, ručně přiřaď hráče ze soupisky a nastav práva.'
    ].join('\n');
    const recipients = notificationRecipients_();
    MailApp.sendEmail({to: recipients.join(','), subject: subject, body: plain, htmlBody: plain.replace(/\n/g, '<br>')});
    cache.put(cacheKey, '1', 21600);
    return response_('sent');
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    // A browser calling a public Apps Script endpoint cannot read a CORS
    // response. Send the principal admin the diagnostic instead, so a failed
    // deletion can never look like a successful one.
    try {
      const data = JSON.parse(event && event.postData ? event.postData.contents : '{}');
      if (data.action === 'deleteRegistration') {
        MailApp.sendEmail({
          to: ADMIN_EMAIL,
          subject: 'Pokuty: smazání účtu se nepodařilo',
          body: 'Apps Script neodstranil registraci (UID ' + clean_(data.targetUid, 128) + ').\n\nDůvod: ' + String(error && error.message ? error.message : error)
        });
      }
    } catch (mailError) { console.error(mailError && mailError.stack ? mailError.stack : mailError); }
    return response_('error');
  }
}

// Deletes the Auth account and its matching Firestore access document together.
// The request is accepted only from an approved administrator and is never
// available to a browser without a valid Firebase ID token.
function deleteRegistration_(data) {
  const caller = verifyFirebaseToken_(data.idToken);
  const targetUid = clean_(data.targetUid, 128);
  if (!caller || !targetUid) throw new Error('Invalid delete request.');
  if (String(caller.email || '').toLowerCase() === ADMIN_EMAIL && caller.localId === targetUid) {
    throw new Error('The signed-in administrator cannot delete their own account.');
  }
  if (!isApprovedAdmin_(caller)) throw new Error('Only an approved administrator can delete registrations.');
  const target = getFirestoreDocument_(targetUid);
  const targetFields = firestoreFields_(target.fields || {});
  if (String(targetFields.email || '').toLowerCase() === ADMIN_EMAIL) {
    throw new Error('The principal administrator account cannot be deleted by this endpoint.');
  }
  const deleted = UrlFetchApp.fetch(FIREBASE_DELETE_ACCOUNT_URL, {
    method: 'post', contentType: 'application/json',
    headers: {Authorization: 'Bearer ' + ScriptApp.getOAuthToken()},
    payload: JSON.stringify({localId: targetUid, targetProjectId: FIREBASE_PROJECT_ID}), muteHttpExceptions: true
  });
  if (deleted.getResponseCode() !== 200) {
    throw new Error('Firebase Authentication delete failed: HTTP ' + deleted.getResponseCode() + ' — ' + deleted.getContentText());
  }
  const removed = UrlFetchApp.fetch(FIRESTORE_ACCESS_URL + '/' + encodeURIComponent(targetUid), {
    method: 'delete', headers: {Authorization: 'Bearer ' + ScriptApp.getOAuthToken()}, muteHttpExceptions: true
  });
  if (removed.getResponseCode() !== 200) {
    throw new Error('Authentication account was deleted, but Firestore delete failed: HTTP ' + removed.getResponseCode() + ' — ' + removed.getContentText());
  }
  try {
    MailApp.sendEmail({
      to: ADMIN_EMAIL,
      subject: 'Pokuty: účet byl odstraněn',
      body: 'Účet ' + String(targetFields.email || targetUid) + ' byl odstraněn z Firebase Authentication i z accessRequests ve Firestore.'
    });
  } catch (mailError) {
    // Both deletes already succeeded. A notification issue must not turn this
    // irreversible operation into a reported failure.
    console.error(mailError && mailError.stack ? mailError.stack : mailError);
  }
  return response_('deleted');
}

function isApprovedAdmin_(user) {
  if (String(user.email || '').toLowerCase() === ADMIN_EMAIL) return true;
  const document = getFirestoreDocument_(user.localId);
  const fields = firestoreFields_(document.fields || {});
  return fields.status === 'approved' && fields.role === 'admin';
}

function getFirestoreDocument_(uid) {
  const result = UrlFetchApp.fetch(FIRESTORE_ACCESS_URL + '/' + encodeURIComponent(uid), {
    headers: {Authorization: 'Bearer ' + ScriptApp.getOAuthToken()}, muteHttpExceptions: true
  });
  if (result.getResponseCode() !== 200) throw new Error('Firestore access request could not be read: HTTP ' + result.getResponseCode());
  return JSON.parse(result.getContentText());
}

// This uses the administrator's Google OAuth token, never a browser user's
// token. Notification recipients therefore always follow the current roles in
// the Users screen without exposing e-mail addresses to a new registrant.
function notificationRecipients_() {
  try {
    const result = UrlFetchApp.fetch(FIRESTORE_ACCESS_URL, {
      headers: {Authorization: 'Bearer ' + ScriptApp.getOAuthToken()},
      muteHttpExceptions: true
    });
    if (result.getResponseCode() !== 200) {
      throw new Error('Firestore accessRequests could not be read: HTTP ' + result.getResponseCode());
    }
    const documents = (JSON.parse(result.getContentText()).documents || []);
    const recipients = documents
      .map(document => firestoreFields_(document.fields || {}))
      .filter(user => user.status === 'approved' && (user.role === 'admin' || user.role === 'cashier'))
      .map(user => String(user.email || '').trim().toLowerCase())
      .filter(email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
    const unique = [...new Set(recipients)];
    return unique.includes(ADMIN_EMAIL) ? unique : [ADMIN_EMAIL].concat(unique);
  } catch (error) {
    // Delivery to the principal administrator must never depend on the optional
    // recipient lookup. The Apps Script execution log retains the exact reason.
    console.error('Additional recipient lookup failed:', error);
    return [ADMIN_EMAIL];
  }
}

function firestoreFields_(fields) {
  const output = {};
  Object.keys(fields).forEach(key => {
    const value = fields[key];
    output[key] = value.stringValue !== undefined ? value.stringValue
      : value.integerValue !== undefined ? String(value.integerValue)
      : value.booleanValue !== undefined ? String(value.booleanValue) : '';
  });
  return output;
}

function verifyFirebaseToken_(idToken) {
  if (!idToken) return null;
  const apiKey = PropertiesService.getScriptProperties().getProperty('FIREBASE_WEB_API_KEY');
  if (!apiKey) throw new Error('Chybí Script Property FIREBASE_WEB_API_KEY.');
  const result = UrlFetchApp.fetch(FIREBASE_LOOKUP_URL + encodeURIComponent(apiKey), {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({idToken: idToken}), muteHttpExceptions: true
  });
  if (result.getResponseCode() !== 200) return null;
  const body = JSON.parse(result.getContentText());
  return body.users && body.users[0] ? body.users[0] : null;
}

function clean_(value, maxLength) {
  return String(value || '').replace(/[<>]/g, '').trim().slice(0, maxLength);
}

function response_(text) {
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.TEXT);
}
