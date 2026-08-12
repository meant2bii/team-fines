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
const FIREBASE_LOOKUP_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=';

function doPost(event) {
  try {
    const data = JSON.parse(event && event.postData ? event.postData.contents : '{}');
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
    MailApp.sendEmail({to: ADMIN_EMAIL, subject: subject, body: plain, htmlBody: plain.replace(/\n/g, '<br>')});
    cache.put(cacheKey, '1', 21600);
    return response_('sent');
  } catch (error) {
    console.error(error);
    return response_('error');
  }
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
