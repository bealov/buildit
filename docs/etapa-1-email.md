# Etapa 1 · Emailuri și adrese de redirecționare (configurare separată)

Acest document pregătește configurarea emailurilor pentru buildit-dev. Nu presupune domenii sau
adrese: completează valorile tale reale acolo unde apar `<…>`. Până la această configurare,
conturile de test create cu **Auto Confirm** permit verificarea profilurilor și a regulilor de
acces, dar **nu** dovedesc funcționarea emailurilor.

## De ce este necesar un serviciu SMTP propriu

Serviciul de email implicit al Supabase este destinat doar explorării: trimite emailuri doar
membrilor echipei din organizația Supabase și are o limită foarte mică (aproximativ 2 emailuri
pe oră). În plus, în proiectele gratuite noi, șabloanele de email pot fi personalizate doar
după configurarea unui SMTP propriu. Fără SMTP propriu, utilizatorii obișnuiți nu pot primi
emailurile de confirmare și resetare.

Surse: [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp),
[Rate limits](https://supabase.com/docs/guides/auth/rate-limits),
[Email templates](https://supabase.com/docs/guides/auth/auth-email-templates).

## 1. Alege furnizorul și expeditorul

Ai nevoie de: un furnizor SMTP (de exemplu Resend, Brevo, Postmark, Amazon SES), o adresă de
expeditor verificată la acel furnizor și datele SMTP (host, port, utilizator, parolă).
Parola SMTP se introduce **doar** în Supabase, nu în cod și nu în Vercel.

## 2. Configurează SMTP în buildit-dev

**Authentication → Emails → SMTP Settings** → **Enable Custom SMTP**:

| Câmp | Valoare |
|---|---|
| Sender email | `<adresa-expeditor-verificată>` |
| Sender name | `BuildIT` |
| Host / Port / Username / Password | datele de la furnizor |

Apoi **Authentication → Rate Limits**: verifică limita de emailuri pe oră (după activarea SMTP,
pornește de la o valoare mică) și ajusteaz-o pentru testare.

## 3. Setări de autentificare

**Authentication → Sign In / Providers → Email**:

- **Confirm email**: activat.
- **Minimum password length**: `10` (aceeași regulă ca în aplicație).

## 4. Adresele de redirecționare

Aplicația trimite ca adresă de întoarcere adresa pe care este deschisă (de exemplu
`https://<adresa-preview>/`). Supabase acceptă doar adresele din listă.

**Authentication → URL Configuration**:

- **Site URL**: adresa principală a mediului de test, de exemplu
  `https://<adresa-preview-stabilă>/` sau `http://localhost:5173/` dacă testezi doar local.
  Nu folosi adresa de producție (producția rămâne demo).
- **Redirect URLs** (adaugă fiecare adresă reală pe care o folosești):
  - `http://localhost:5173/` (dezvoltare locală);
  - adresa Preview stabilă a ramurii, copiată din Vercel → Deployments → deployment-ul Preview
    → **Domains** (de forma `https://<proiect>-git-<ramura>-<echipa>.vercel.app/`);
  - opțional, un model pentru toate previzualizările, după ce verifici formatul real al
    adreselor în Vercel, de exemplu `https://<proiect>-*-<echipa>.vercel.app/**`.
    Supabase recomandă adrese exacte acolo unde se poate.

## 5. Șabloanele de email (în română)

**Authentication → Emails → Templates**. Linkurile folosesc `token_hash`, astfel încât
funcționează și dacă emailul este deschis pe alt dispozitiv decât cel pe care s-a creat contul.
`{{ .RedirectTo }}` este adresa de întoarcere trimisă de aplicație (din lista de mai sus).

### Confirm signup

Subiect: `Confirmă adresa de email pentru BuildIT`

```html
<h2>Bine ai venit în BuildIT</h2>
<p>Confirmă adresa de email pentru a-ți activa contul.</p>
<p><a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email">Confirmă adresa de email</a></p>
<p>Linkul poate fi folosit o singură dată și expiră după o perioadă limitată.</p>
<p>Dacă nu ai creat tu acest cont, poți ignora acest mesaj.</p>
```

### Reset password

Subiect: `Resetează parola BuildIT`

```html
<h2>Resetarea parolei</h2>
<p>Am primit o cerere de resetare a parolei pentru contul tău BuildIT.</p>
<p><a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery">Alege o parolă nouă</a></p>
<p>Dacă nu ai cerut tu resetarea, poți ignora acest mesaj; parola rămâne neschimbată.</p>
```

Celelalte șabloane (Magic link, Change email, Invite) nu sunt folosite în etapa 1.

> Fără șabloane personalizate, Supabase trimite linkul implicit, care se întoarce în aplicație
> cu `?code=…`. Aplicația acceptă și acest format, dar el funcționează doar în **același
> browser** în care s-a făcut înregistrarea sau cererea de resetare.

## 6. Verificări după configurare

1. Pe adresa Preview (sau local): **Cont real** → **Creează unul** → nume, email real, parolă,
   rol → **Creează contul**. Apare „Verifică-ți emailul”.
2. Emailul sosește în română; linkul deschide aplicația, apare „Adresa de email a fost
   confirmată” și ești autentificat(ă), cu profilul creat automat (nume și rol din formular).
3. Deschide linkul de confirmare a doua oară: apare „Linkul a expirat sau a fost deja folosit”.
4. Ieși din cont → **Ai uitat parola?** → emailul de resetare → linkul deschide „Alege o
   parolă nouă” → salvează → autentificare cu parola nouă.
5. Repetă confirmarea deschizând emailul pe telefon (alt dispozitiv).
6. Notează rezultatele în `TEST-REPORT.md`.
