# Etapa 1 · Conturi reale și profiluri — ghid de configurare

Acest ghid te conduce, pas cu pas, de la codul din Pull Request la un cont real funcțional în
proiectul Supabase **buildit-dev**. Producția rămâne demo: nu adăugăm nicio setare Supabase în
mediul Production din Vercel.

> **Reguli de siguranță**
> - Nu trimite parole sau chei în conversații, issue-uri sau commit-uri.
> - În aplicație și în Vercel se folosește **doar** cheia *publishable* (`sb_publishable_…`).
>   Cheia *secret* (`sb_secret_…`) nu se pune nicăieri în acest proiect.
> - `.env.local` rămâne doar pe calculatorul tău (este exclus din Git prin `.gitignore`).

Configurarea emailurilor (SMTP, șabloane, adrese de redirecționare) este descrisă separat, în
[etapa-1-email.md](etapa-1-email.md). Pașii de mai jos funcționează și fără ea.

---

## Pasul 1 · Aplică migrarea pe buildit-dev

Migrarea creează tabelele pentru profiluri, date private și roluri, permisiunile, regulile RLS,
crearea automată a profilului și bucket-ul privat pentru fotografii.

1. Deschide [supabase.com/dashboard](https://supabase.com/dashboard) → organizația **BuildIT** →
   proiectul **buildit-dev**.
2. În meniul din stânga: **SQL Editor** → **New query**.
3. Deschide în GitHub fișierul
   `supabase/migrations/20261102000000_profiles_and_roles.sql`, apasă **Raw**, copiază tot
   conținutul și lipește-l în editor.
4. Apasă **Run**. Rezultatul așteptat: *Success. No rows returned* (sau un tabel gol).
   Dacă Supabase afișează un avertisment despre operațiuni distructive (din cauza liniilor
   `drop policy if exists` / `drop trigger if exists`), confirmă: ele elimină doar regulile cu
   același nume, ca migrarea să poată fi rulată din nou fără erori. Mesajele de tip
   *NOTICE … does not exist, skipping* sunt normale la prima rulare.

> Alternativ, cu Supabase CLI: `supabase link --project-ref <referinta>` și apoi
> `supabase db push`. Nu este necesar pentru această etapă.

### Verifică rezultatul (doar citire)

Într-un query nou, rulează pe rând:

```sql
-- 1. RLS activ pe toate cele trei tabele (rowsecurity = true)
select tablename, rowsecurity from pg_tables
where schemaname = 'public' and tablename in ('profiles', 'profiles_private', 'profile_roles');
```

```sql
-- 2. Permisiuni: doar „authenticated”, niciuna pentru „anon”
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name in ('profiles', 'profiles_private', 'profile_roles')
  and grantee in ('anon', 'authenticated')
order by grantee, table_name, privilege_type;
```

Rezultat așteptat: exact 3 rânduri, toate pentru `authenticated`, cu `SELECT` pe fiecare tabel.
**Niciun rând pentru `anon`.** Drepturile de modificare (`UPDATE` pe câmpurile editabile ale
profilului și ale datelor private) și dreptul de a adăuga un rol (`INSERT` pe `user_id` și
`role`) sunt acordate pe coloane, deci apar în `information_schema.column_privileges`, nu aici.

```sql
-- 3. Bucket-ul de fotografii este privat (public = false), max. 1 MB, doar JPEG
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'avatars';
```

```sql
-- 4. Regulile de acces create
select schemaname, tablename, policyname, cmd from pg_policies
where (schemaname = 'public' and tablename in ('profiles', 'profiles_private', 'profile_roles'))
   or (schemaname = 'storage' and policyname like 'avatars_%')
order by 1, 2, 3;
```

Rezultat așteptat: 10 reguli (6 pe tabelele `public`, 4 pe `storage.objects`).

---

## Pasul 2 · Creează două conturi de test

Abia după migrare, ca mecanismul de profil să fie deja instalat.

1. **Authentication** → **Users** → **Add user** → **Create new user**.
2. Introdu o adresă de email pe care o controlezi și o parolă de cel puțin 10 caractere.
3. Bifează **Auto Confirm User**.
4. Repetă pentru al doilea cont (contul B), cu altă adresă.

Conturile create din Dashboard nu au nume și rol. Aplicația **nu le inventează**: la prima
autentificare vei vedea ecranul „Completează profilul”, unde alegi numele și rolul inițial.

> *Auto Confirm* sare peste emailul de confirmare. Aceste conturi **nu dovedesc** că emailurile
> funcționează; acestea se testează după configurarea din `etapa-1-email.md`.

---

## Pasul 3 · Rulează aplicația local cu buildit-dev (opțional, dar recomandat)

1. În Supabase: butonul **Connect** (sus) sau **Project Settings → API Keys**. Copiază:
   - **Project URL** (de forma `https://<referinta>.supabase.co`);
   - **Publishable key** (`sb_publishable_…`).
2. În folderul proiectului, copiază `.env.example` ca `.env.local` și completează
   `VITE_SUPABASE_URL` și `VITE_SUPABASE_PUBLISHABLE_KEY`. Lasă `VITE_ENABLE_REAL_ACCOUNTS=true`.
3. Rulează:

```bash
npm ci
```

```bash
npx vite
```

4. Deschide `http://localhost:5173` → butonul **Demo** din antet → **Cont real · mediu de test**.
5. Intră cu contul A și completează profilul (de exemplu rol **Creator**). Apoi ieși din cont,
   intră cu contul B și completează profilul (de exemplu rol **Investitor**).

---

## Pasul 4 · Verificarea automată cu două conturi

Scriptul `tests/rls-remote.mjs` folosește aceeași cheie publishable ca browserul (fără
`service_role`, fără dezactivarea RLS) și încearcă operațiuni permise și nepermise între
contul A și contul B, în ambele direcții.

**Păstrarea datelor.** Încercările asupra celuilalt cont folosesc valori identice cu cele
existente, deci nu pot schimba nimic nici dacă o regulă ar fi greșită (testul semnalează doar
că operațiunea a fost permisă). Înainte de teste, scriptul păstrează în memorie profilul, datele
private, rolurile și fotografia fiecărui cont; la final compară starea și o restaurează dacă e
nevoie. Nu activează roluri, nu creează conturi și închide doar propriile sesiuni (nu te
deconectează din browser sau de pe telefon). Singura urmă normală: data ultimei modificări a
profilului (`updated_at`).

### Varianta din browser (GitHub Actions) — recomandată dacă nu ai mediu local

1. GitHub → repository → **Settings** → **Environments** → **New environment** → nume
   `buildit-dev` → **Configure environment**.
2. La **Environment secrets** → **Add environment secret**, adaugă pe rând:

   | Nume | Valoare |
   |---|---|
   | `BUILDIT_DEV_SUPABASE_URL` | Project URL din buildit-dev |
   | `BUILDIT_DEV_PUBLISHABLE_KEY` | cheia `sb_publishable_…` din buildit-dev |
   | `BUILDIT_TEST_A_EMAIL` / `BUILDIT_TEST_A_PASSWORD` | datele contului de test A |
   | `BUILDIT_TEST_B_EMAIL` / `BUILDIT_TEST_B_PASSWORD` | datele contului de test B |

3. În Pull Request, adaugă eticheta `verifica-buildit-dev` (o creezi din **Issues → Labels →
   New label** dacă nu există). Verificarea pornește automat.
4. Rezultatul apare în tab-ul **Actions** → **Permisiuni buildit-dev**. Pentru o nouă rulare:
   **Re-run jobs**.

GitHub ascunde automat valorile secretelor din jurnale, iar scriptul nu afișează emailuri,
identificatori sau date din profil.

### Varianta locală

Completează în `.env.local`: `BUILDIT_TEST_A_EMAIL`, `BUILDIT_TEST_A_PASSWORD`,
`BUILDIT_TEST_B_EMAIL`, `BUILDIT_TEST_B_PASSWORD` și lasă `BUILDIT_TEST_TARGET=buildit-dev`,
apoi rulează:

```bash
npm run test:remote
```

Ambele conturi trebuie să aibă profilul completat. Dacă proiectul Supabase a fost pus pe pauză
din lipsă de activitate, reactivează-l din Dashboard înainte de rulare.

---

## Pasul 5 · Vercel Preview (doar pentru mediul de test)

1. Vercel → proiectul BuildIT → **Settings** → **Environment Variables**.
2. Adaugă trei variabile, bifând **doar Preview** (nu Production, nu Development):

   | Nume | Valoare |
   |---|---|
   | `VITE_ENABLE_REAL_ACCOUNTS` | `true` |
   | `VITE_SUPABASE_URL` | Project URL din buildit-dev |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | cheia `sb_publishable_…` din buildit-dev |

3. Variabilele se aplică doar build-urilor noi. Din **Deployments**, alege ultimul deployment
   Preview al ramurii și apasă **Redeploy** (sau trimite un commit nou pe ramură).
4. Deschide adresa Preview → **Demo** → **Cont real · mediu de test**.
5. Recomandat: în **Settings → Deployment Protection**, verifică dacă previzualizările sunt
   protejate (vizibile doar membrilor echipei).

### Verifică faptul că producția a rămas demo

- În **Environment Variables**, nicio variabilă `VITE_SUPABASE_*` sau `VITE_ENABLE_REAL_ACCOUNTS`
  nu are bifat **Production**.
- Pe adresa de producție, fereastra **Demo** nu conține opțiunea „Cont real”.

---

## Ce face fiecare parte (pe scurt)

| Element | Rol |
|---|---|
| `profiles` | Profil public: nume, fotografie, descriere, oraș, companie, industrie, obiective. Vizibil doar utilizatorilor autentificați. Fără email. |
| `profiles_private` | Link adițional, preferințe de afișare a contactului (implicit ascunse), preferințe de investitor. Vizibil doar proprietarului. |
| `profile_roles` | Rolurile active: `creator`, `investor`. Utilizatorul își poate **adăuga** doar aceste roluri, doar pentru sine. Nu le poate modifica sau șterge. |
| `complete_profile` | Creează profilul pentru conturile fără profil, cu numele și rolul alese de utilizator. |
| Trigger `on_auth_user_created` | La înregistrarea din aplicație, creează profilul cu numele și rolul trimise. Dacă lipsesc sau sunt invalide, nu creează nimic. |
| Bucket `avatars` | Privat. Fiecare utilizator poate scrie doar `<id-ul-său>/avatar.jpg`. Citire doar pentru autentificați, prin linkuri temporare. |
| `VITE_ENABLE_REAL_ACCOUNTS` | Afișează sau ascunde interfața conturilor reale. **Nu** este o măsură de securitate: protecția vine din permisiuni și RLS. |
