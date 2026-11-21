# Verificare BuildIT — actualizare 27 octombrie 2026

## Verificări automate

- 30 teste ale regulilor: trecute.
- 63 verificări de randare server (21 rute × Creator/Investitor/vizitator): trecute.
- Verificări suplimentare de randare: raportul nou, lipsa casetei de text și a rezultatelor financiare automate, profilul Ritmo în toate paginile relevante, interzicerea rutelor de editare/vânzare/promovare/analiză pentru proiectul lui Alex, separarea Sponsorizat/organic, Marketplace și Clasament în navigare, Link adițional, lipsa secvenței literale backslash-n.
- TypeScript strict și build Vite sunt executate ca poartă obligatorie la împachetare; arhiva nu este publicată dacă eșuează.

Teste de regresie importante: Ritmo nu poate reasigna, modifica, vinde sau promova proiectul lui Alex; încercarea de a indica un alt actor fără schimbarea contului este respinsă; Match confirmat acordă acces la documentul proiectului inclusiv pentru date vechi shareDoc=false; accesul nu deblochează Marketplace și nu transferă proprietatea; datele neestimate rămân distincte de zero după serializare; scorul organic rămâne neschimbat de estimări și Boost.

## Limite

În revizia precedentă nu a fost disponibil instrumentul de control al browserului. Verificările desktop din revizia finală sunt descrise mai jos; nu au fost executate teste pe dispozitive mobile reale. Randarea server nu testează selectarea fișierelor, IndexedDB, descărcarea, focusul ori persistența efectivă după refresh. Uploadul și raportul exemplificativ nu reprezintă analiză AI reală.

Pentru verificare manuală: încărcare PDF/DOCX → salvare → refresh → schimbare cont → Match/cumpărare → descărcare; respingerea fișierelor prea mari sau cu extensii invalide; cele șase butoane de navigare la 360 px; modificarea unei cifre și alternarea între 0/Neestimat; resetarea datelor și fișierelor.

## Ultima revizie — 27 octombrie 2026

TypeScript și build Vite verificate. Testele de reguli și randare includ rutele noi de publicare/administrare Marketplace, izolarea proprietarului, lipsa Smart Analysis din home Investitor, un singur card Creator și feedback pentru date necompletate.

Verificări manuale în browser desktop pe preview: alegere cont Creator, trecere la următorul creator, deschidere proiect și revenire la același card cu Înapoi, tab conexiuni investitori, formular nou cu opt bife debifate/câmpuri goale, salvarea unei sume cu virgulă și a unui zero, bifare explicită a unui cost neestimat, sortare descrescătoare, acces direct la alegerea proiectului pentru Marketplace și aspectul compact Sponsored.

Limite: nu s-a verificat gestul tactil pe dispozitiv mobil real; upload/download IndexedDB nu a fost repetat în această revizie. AI și plățile rămân demonstrative.

## Marketplace independent — 1 noiembrie 2026

Build TypeScript/Vite și 31 teste de reguli trecute. Test nou: Creator fără proiecte poate crea/retrage ofertă independentă; alt Creator nu o poate prelua; cumpărarea deblochează documentul după confirmare. Randare server verificată pentru catalog, detalii, publicare, editare, administrare și istoric de cumpărări/vânzări, fără proiect asociat. Uploadul și descărcarea în browser nu au fost retestate în această revizie.

## Conturi reale — etapa 1 · 2 noiembrie 2026

Mediu: Node 22.23.4, npm 10.9.9, Postgres 16 local, Chromium (Playwright). Nicio verificare nu a folosit proiectul Supabase găzduit.

### Executate și trecute

| Comandă | Rezultat |
|---|---|
| `npm run lint` | 0 erori |
| `npm run build` | TypeScript strict și Vite reușite; Supabase este într-un fișier separat, încărcat doar când conturile reale sunt configurate |
| `npm test` | 44/44 teste (31 existente + 13 noi), 63 verificări de randare demo, 299 verificări de randare pentru conturile reale |
| `npm run test:db` | 75/75 verificări ale migrării, rulate de două ori: cu expunerea automată a tabelelor dezactivată (ca în buildit-dev) și activată; migrarea poate fi aplicată de două ori fără erori |
| `npm run test:e2e` | 14/14 pași în Chromium, cu server Supabase **simulat** local |

**Baza de date (`test:db`)**, pe un Postgres local care imită schemele `auth` și `storage` din Supabase, cu cinci conturi: profilul se creează automat doar cu nume și rol valide (fără profil pentru metadate lipsă, rol `admin` sau nume gol); vizitatorii nu pot citi profiluri, date private, roluri sau fotografii; A nu poate modifica profilul, datele private, rolurile sau fotografia lui B (0 rânduri sau eroare); A nu poate schimba `id`, `created_at`, `activated_at`, nu poate crea sau șterge profiluri, nu poate activa `admin` sau „investitor verificat”; A nu poate încărca în folderul lui B, alt nume de fișier sau alt bucket; utilizatorii autentificați văd fotografiile celorlalți (aliniat cu vizibilitatea profilurilor); linkuri `javascript:` și bugete min > max respinse; completarea profilului funcționează o singură dată; ștergerea contului elimină profilul; datele lui B rămân neschimbate după încercările lui A.

**Unitare (`tests/real.test.ts`):** configurare (demo fără variabile, cheie secretă refuzată), linkuri din email (`?code`, `?token_hash`, erori, fragmente vechi `#access_token` care nu devin rute), validări, mesaje de eroare care nu dezvăluie existența unui cont, modul din browser nu acordă roluri și nu se transmite altui cont, cererile sunt limitate la contul curent, coloanele trimise coincid cu `GRANT UPDATE` din migrare.

**Browser (`test:e2e`):** demo neschimbat și intrare în contul real; parolă greșită; autentificare; sesiune păstrată după reîncărcare; editare profil; fotografie încărcată în folderul propriu și afișată prin URL semnat; activarea rolului Investitor și comutarea modului (păstrată după reîncărcare); modulele neimplementate trimit spre demo; selectorul demo nu schimbă contul real; deconectarea elimină datele private din interfață și din browser; contul B fără profil completează profilul și nu vede nimic din A; modul salvat de A nu se aplică lui B; resetarea parolei prin link `?code=…`; link expirat; build-ul fără configurare face zero cereri către API.

### Pregătite, dar încă nerulate

- `npm run test:remote` — două conturi reale pe buildit-dev (după aplicarea migrării și crearea conturilor; vezi `docs/etapa-1-conturi-reale.md`).
- Verificările de email din `docs/etapa-1-email.md` (după configurarea SMTP, a șabloanelor și a adreselor de redirecționare).
- Verificarea manuală pe Vercel Preview și pe telefon.

### Limite

- Serverul din `test:e2e` imită API-ul Supabase; regulile reale sunt testate doar în `test:db`, pe o simulare a schemelor Supabase, nu pe serviciul găzduit.
- Conturile create cu Auto Confirm nu dovedesc funcționarea emailurilor.
- Limitele de dimensiune și tip de fișier ale bucket-ului sunt aplicate de serviciul Storage găzduit; local s-au verificat doar regulile de acces.

## Verificare pe buildit-dev cu două conturi · 11 noiembrie 2026

Executată pe proiectul Supabase **găzduit** buildit-dev, prin GitHub Actions („Permisiuni buildit-dev”, [rularea 43034933535](https://github.com/bealov/buildit/actions/runs/43034933535), commit `628eeb1`), cu cheia publishable și două conturi de test (fără `service_role`, RLS activ).

**Rezultat: 55 trecute, 0 eșuate, 0 omise.**

- Vizitator neautentificat: nu poate citi profiluri, date private sau roluri, nu poate apela `complete_profile`, nu poate lista fotografiile și nu poate obține linkuri pentru ele; fotografiile nu sunt publice.
- În ambele direcții (A→B, B→A): profilul public este vizibil fără email, rolurile sunt vizibile, fotografia este vizibilă prin link temporar; datele private ale celuilalt nu sunt vizibile; profilul, datele private, rolurile și fotografia celuilalt nu pot fi modificate sau șterse; un cont nu își poate seta fotografia celuilalt.
- Roluri nepermise refuzate pentru ambele conturi: `admin`, `verified_investor`, `service_role`; al doilea profil prin `complete_profile` refuzat.
- Operațiile proprietarului: salvarea profilului și a datelor private, regula de adăugare a rolurilor proprii (verificată fără activare), încărcarea propriei fotografii; bucket-ul refuză alte tipuri de fișiere și fișiere peste 1 MB.
- Verificarea finală: profilul, datele private, rolurile și fotografia ambelor conturi au rămas neschimbate (singura urmă: `updated_at`).

Avertismentele din rulare (acțiuni pe Node.js 20, deprecările `punycode` și `url.parse()` din `actions/setup-node`) nu au afectat rezultatul. Workflow-ul a fost actualizat la `actions/checkout` v7.0.1 și `actions/setup-node` v7.1.0 (Node.js 24, fixate prin commit), fără cache npm.

Verificări manuale raportate pe buildit-dev (Vercel Preview, laptop și telefon): autentificare cu două conturi, profil păstrat după reîncărcare, încărcarea și păstrarea fotografiei, activarea ambelor roluri și comutarea modului, păstrarea fotografiei și rolurilor după deconectare și reconectare.

Neverificate încă: emailurile de confirmare și resetare (conturile de test au fost create cu Auto Confirm).

## De urmărit (notat 11 noiembrie 2026, nemodificat încă)

- Fotografia de profil a contului real apare cu câteva secunde după restul datelor la prima încărcare (laptop și telefon); la revenirea în profil fără reîncărcare apare imediat. Ipoteze de verificat: linkul temporar (semnat) este nou la fiecare încărcare, deci nu poate fi preluat din memoria browserului, iar imaginea se descarcă abia după ce profilul este afișat.

## Fotografia de profil — 15 noiembrie 2026

Încadrarea fotografiei (previzualizare circulară, mutare cu mouse-ul sau degetul, zoom, JPEG pătrat de 256 px), reîncadrarea din originalul păstrat doar în browser și afișarea mai rapidă a avatarului (adresa semnată cerută în paralel și refolosită cât timp este validă; inițiale cât timp se descarcă poza). Verificate automat în Chromium, pe desktop și pe iPhone 13 emulat, cu un serviciu simulat (66 de verificări), și manual, de proprietar, în Vercel Preview pe laptop și telefon. Încărcarea propriu-zisă în bucket nu a fost reverificată cu `rls-remote.mjs`; regulile Storage nu s-au schimbat. Întârzierea notată la 11 noiembrie a fost tratată în cod; efectul pe Supabase-ul găzduit nu a fost măsurat.

## Profil Creator: cum vrei să participi — 15 noiembrie 2026

Migrare nouă: `supabase/migrations/20261115000000_creator_participation.sql` (migrarea din 2 noiembrie nu a fost modificată).

### Executate și trecute

| Comandă | Rezultat |
|---|---|
| `npm run lint` | 0 erori |
| `npm run build` | TypeScript strict și Vite reușite |
| `npm test` | 51/51 teste (5 noi), 63 verificări de randare demo, 331 verificări de randare pentru conturile reale (32 noi) |
| `npm run test:db` | 97/97 verificări (22 noi), rulate în ambele moduri de expunere a tabelelor; ambele migrări aplicate de două ori fără erori |
| `npm run test:e2e` | 15/15 pași (1 nou) în Chromium, cu server Supabase **simulat** local; pasul pentru fotografie actualizat la fluxul cu fereastra de încadrare |
| Chromium (Playwright), desktop 1366 px și iPhone 13 emulat | 36 de verificări ale interfeței, cu rândul din baza de date simulat |

**Baza de date (Postgres local, schemele Supabase simulate):** profilurile existente nu primesc intenții; RLS rămâne activ; A salvează doar „alătur” cu competențe, roluri și ore, apoi doar „dezvolt” (fără proiect), apoi ambele; debifarea păstrează competențele, rolurile și orele; rolurile de cont rămân Creator/Investitor; A nu poate modifica participarea lui B și invers (0 rânduri); B vede participarea publică a lui A; vizitatorul anonim nu o vede; sunt refuzate rolul dorit `admin`, 0 sau 169 de ore, competențe goale, peste 40 de caractere, duplicate (indiferent de majuscule), peste 15 competențe și roluri dorite duplicate.

**Interfață (desktop și telefon):** profil existent fără intenții și cu detaliile ascunse; fiecare intenție separat și ambele împreună; salvare fără proiect; competențe sugerate și proprii (duplicat respins cu mesaj, spații normalizate, adăugare cu Enter); roluri dorite; ore invalide respinse cu mesaj clar fără salvare; valorile se recitesc după reîncărcare; debifarea ascunde fără a șterge, iar rebifarea le readuce; secțiunea apare pentru Creator și pentru ambele roluri, nu și doar pentru Investitor; salvarea ca Investitor nu șterge participarea; fără derulare orizontală. Demo: date vechi fără intenții; salvare și păstrare după refresh; ceilalți creatori demo nu moștenesc intențiile creatorului principal.

### De verificat după aplicarea migrării pe buildit-dev

- `tests/rls-remote.mjs` (GitHub Actions, eticheta `verifica-buildit-dev`): salvare, persistență după reconectare, vizibilitate pentru celălalt cont, imposibilitatea modificării datelor celuilalt cont, refuzul valorilor nepermise. **Nerulat încă**: migrarea nu era aplicată pe buildit-dev la data commit-ului.
- Manual, în Vercel Preview, pe laptop și telefon: salvarea și persistența pe alt dispozitiv.

### Limite

- Testele de interfață și E2E au folosit un serviciu simulat; regulile reale sunt verificate local în `test:db` și, după aplicarea migrării, în `rls-remote.mjs`.
- Datele de participare sunt publice pentru utilizatorii autentificați, ca restul profilului public. Matching-ul care le va folosi nu este implementat.


## Incident buildit-dev · 17 noiembrie 2026 — profilul nu se încărca

- Simptom: după autentificare, pe Vercel Preview apărea „Profilul nu a putut fi încărcat” pentru conturile de test.
- Cauză: codul de pe ramură (secțiunea „Cum vrei să participi”) cerea coloane noi din `profiles`, dar migrarea `20261115000000_creator_participation.sql` nu fusese aplicată pe buildit-dev (verificat în SQL Editor: 0 din 5 coloane). Reprodus local: cererea eșua cu `42703 column "wants_to_develop" does not exist`.
- Rezolvare: migrarea a fost aplicată pe buildit-dev; profilurile se încarcă din nou (confirmat manual). Datele, rolurile și fotografiile nu au fost afectate.
- Prevenire: ecranul de eroare afișează acum un cod tehnic și o explicație (pentru coloane lipsă: „aplică migrările noi, în ordine”). Regula de lucru: orice migrare nouă din `supabase/migrations` se aplică pe buildit-dev înainte de testarea Preview-ului care o folosește.

## Match · „Descoperă oameni” pentru conturile reale · 21 noiembrie 2026

Funcție nouă în modul Creator; migrare nouă `20261121000000_discover_people.sql` (doar o funcție de citire, `SECURITY INVOKER`, fără modificări de tabele sau RLS). Ghid: `docs/etapa-2a-descopera-oameni.md`.

### Executate și trecute (local, fără buildit-dev)

| Comandă | Rezultat |
|---|---|
| `npm run lint` | 0 erori |
| `npm run build` | reușit |
| `npm test` | 56/56 teste unitare; 63 verificări de randare demo; 427 verificări de randare pentru conturile reale |
| `npm run test:db` | 128/128, cu expunerea automată dezactivată și activată (Postgres 16 local, simulare a schemelor Supabase). Baza de test este creată acum în UTF-8, ca în Supabase (înainte era `SQL_ASCII`, care trata greșit diacriticele); toate verificările anterioare trec și în UTF-8 |
| `npm run test:e2e` | 22/22 pași în Chromium (telefon 390 px și laptop 1366 px), cu server Supabase **simulat** |

**Baza de date (`test:db`), 32 de verificări noi:** funcția rulează cu drepturile apelantului și este doar de citire; vizitatorii sunt refuzați; rezultatul nu conține câmpuri private; apar doar Creatorii cu „Vreau să mă alătur” (inclusiv cei care dezvoltă și un proiect și profilurile incomplete); sunt excluși propriul profil, Investitorii fără rol Creator și Creatorii care nu vor să se alăture; filtru de competență parțial, fără diferență de majuscule sau diacritice („analiza” găsește „Analiză”), cu `%` tratat ca text; filtru de rol (rol necunoscut → listă goală); minimum de ore cu orele necompletate tratate ca necunoscute, nu ca 0, și opțiunea de a le include; ordine stabilă, paginare fără dubluri, limită între 1 și 50; datele celorlalți rămân protejate la modificare.

**Browser (`test:e2e`), 8 pași noi:** listă cu profilurile corecte (fără propriul profil, Investitori sau Creatori care nu vor să se alăture), fără emailuri și fără butoane de like/invitație/mesaj; fotografii prin linkuri semnate obținute într-un singur apel; „Arată mai multe”; filtrele de competență, rol și ore (inclusiv necompletat ≠ 0) și „Resetează filtrele”; valoare invalidă; „Vezi profilul” cu date publice și revenire cu filtrele păstrate; eroare cu reîncercare (cod tehnic) și listă goală fără profiluri fictive; al doilea cont (C) îl vede pe A și nu se vede pe sine; contul doar Investitor vede Match neschimbat.

### Pregătite, încă nerulate pe buildit-dev

- Aplicarea migrării `20261121000000_discover_people.sql` și interogarea de verificare din ghid.
- `verifica-buildit-dev` (GitHub Actions): verificări noi **doar de citire** pentru „Descoperă oameni”. Verificate pe un server simulat: stare finală identică cu cea inițială.
- Verificarea manuală pe Vercel Preview cu două conturi (pașii din ghid).

### Limite

- Serverul din `test:e2e` imită API-ul; regulile reale ale funcției sunt testate în `test:db`, pe o simulare locală a schemelor Supabase.
