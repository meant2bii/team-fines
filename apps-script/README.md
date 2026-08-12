# Notifikace nových registrací

Tento Apps Script pošle na `lyrixzz@gmail.com` e-mail, když nový Firebase uživatel dokončí registraci.

## Nasazení

1. Otevři [script.google.com](https://script.google.com/) pod účtem, ze kterého chceš e-maily odesílat, a vytvoř **Nový projekt**.
2. Obsah souboru `Code.gs` vlož do editoru a projekt pojmenuj třeba `Team Fines – registrace`.
3. V **Project Settings → Script properties** přidej hodnotu:
   - `FIREBASE_WEB_API_KEY`: Web API key z `js/firebase.js`.
4. Klikni **Deploy → New deployment → Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Při prvním nasazení potvrď oprávnění k odesílání pošty. Zkopíruj končící adresu **`/exec`**.
6. Pošli ji sem. Doplním ji do `CONFIG.APPS_SCRIPT_NOTIFICATION_URL` a publikuji.

Po otevření adresy `/exec` v prohlížeči se musí zobrazit text `Team Fines registration notifier is running.`. Tím ověříš, že nasazení funguje; e-mail se při tomto testu neposílá.

Skript ověřuje Firebase ID token na straně Googlu, takže e-mail neposílá anonymnímu požadavku. Jednomu Firebase účtu odešle maximálně jednu notifikaci za 24 hodin. Google Apps Script má u běžného Google účtu kvótu 100 e-mailových příjemců denně.

## Příjemci podle rolí

Notifikaci dostanou vždy všichni schválení uživatelé s rolí **Administrátor** nebo **Pokladník**. Seznam se čte přímo z kolekce `accessRequests` ve Firestore, takže ho není nutné spravovat dvakrát.

Před dalším nasazením v Apps Scriptu otevři **Project Settings** a zapni zobrazení souboru `appsscript.json` v editoru. Jeho obsah nahraď souborem `apps-script/appsscript.json` z tohoto repozitáře. Při nové autorizaci pak potvrď i oprávnění k Cloud Firestore. Účet `lyrixzz@gmail.com` musí mít v projektu `team-fines` oprávnění alespoň **Cloud Datastore User**; jako vlastník Firebase projektu ho obvykle již má.

Pokud se přístup k Firestore nepodaří nastavit, e-mail nadále vždy přijde hlavnímu administrátorovi `lyrixzz@gmail.com`; pouze další Pokladníci a Administrátoři se v takovém případě vynechají. Konkrétní důvod je v Apps Script → **Spuštění** u funkce `doPost`.

## Mazání registrace

Tlačítko koše posílá požadavek Apps Scriptu. **Apps Script pak jako jediný krok odstraní Firebase Authentication i dokument `accessRequests` ve Firestore.** Aplikace řádek nemaže předem: zmizí až po potvrzené změně z Firestore. Po úspěchu i při chybě přijde potvrzovací e-mail na `lyrixzz@gmail.com`.

Po každé změně `Code.gs` je nutné v Apps Scriptu použít **Deploy → Manage deployments → Edit → New version → Deploy**. Webová aplikace musí běžet jako **Me** a účet, pod kterým je nasazena, musí mít v projektu Firebase oprávnění k mazání uživatelů (u vlastníka projektu to bývá automatické). Pokud mazání selže, e-mail obsahuje přesný HTTP důvod z Firebase.

Vyžadované oprávnění Google Cloud je `firebaseauth.users.delete`; pro účet nasazující skript ho poskytuje role **Firebase Authentication Admin** nebo **Owner** v projektu `team-fines`.
