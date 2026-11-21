# Etapa 3 · Proiecte reale — aplicare și verificare

Implementare pe ramura PR #2 (doar buildit-dev și Vercel Preview; Production rămâne demo).
Decizii și justificare: [propunere-etapa-3-proiecte-reale.md](propunere-etapa-3-proiecte-reale.md).

## Ce face

- **Proiectele mele** (Mod Creator → Proiecte): butonul „Creează un proiect” și contorul total „X din 20 proiecte (publicate și ciorne)”, apoi două file: **Publicate (n)** și **Ciorne (n)**, cu aceleași carduri. Implicit se deschide „Publicate” dacă există proiecte publicate, altfel „Ciorne”. După salvarea unei ciorne, publicare, retragere sau ștergere, lista se deschide pe fila în care se află proiectul; fila aleasă manual se păstrează la revenire. Fiecare filă goală are un mesaj explicativ. La 20 de proiecte, crearea este dezactivată.
- **Formular în 6 pași** (ca în demo): Informații generale · Problema și soluția · Model de business · Date financiare · Echipă și materiale · Ce caută proiectul și publicare. Ciorna se salvează oricând, incompletă.
- **Publicare** — obligatorii: titlu, descriere scurtă, industrie, stadiu (Idee / În dezvoltare / Deja lansat), locație (oraș sau „Remote / Online”), ce caută proiectul (Colegi / Parteneri / Investiție, selecție multiplă). Lipsurile sunt listate, iar baza de date refuză oricum un proiect incomplet.
- **Finanțe** (EUR, max. 2 zecimale): 0, necompletat și „Nu am estimat încă” (nebifat implicit) rămân distincte. Toate sunt **private**. Public apare doar „Investiție căutată: … EUR” sau „Investiție de stabilit”, și numai dacă proiectul caută investiție. Debifarea investiției nu șterge suma.
- **Linkuri către planul de afaceri**: private, inclusiv după publicare. Fără încărcare de documente.
- **Proiect publicat**: vizibil utilizatorilor autentificați, cu numele, fotografia și „Vezi profilul” pentru proprietar (fără email sau date private). Fără butoane pentru funcții neimplementate.
- **Editarea unui proiect publicat**: versiunea vizibilă nu se schimbă până la confirmarea „Actualizează proiectul publicat”; „Renunță” păstrează versiunea anterioară.
- **Editare simultană**: dacă proiectul a fost salvat între timp de pe alt dispozitiv, salvarea este oprită, modificările rămân în formular și alegi „Încarcă versiunea salvată” sau „Salvează modificările mele”.
- **Retrage din publicare** → ciornă privată, fără pierderi. **Ștergere definitivă**: doar pentru ciorne, cu confirmare.
- Investitorul, demo-ul și celelalte funcții nu se schimbă. Bifa „Vreau să vând planul în Marketplace” nu există în proiectele reale.

## Pasul 1 · Aplică migrarea pe buildit-dev (înainte de a testa Preview-ul)

Fișier: `supabase/migrations/20261122000000_projects.sql`. Creează tabelele `projects` și `project_private`, regulile RLS, permisiunile, validările, limita de 20 și funcțiile `save_project` / `set_project_status`. Nu modifică tabelele existente.

1. GitHub → fișierul de mai sus pe ramura PR-ului → **Raw** → copiază tot (până la `commit;`).
2. Supabase → **buildit-dev** → **SQL Editor** → **New query** → lipește → **Run**. Așteptat: *Success. No rows returned*. Mesajele *NOTICE … does not exist, skipping* sunt normale.
3. Verificare (doar citire), într-un query nou:

```sql
select
  (select bool_and(relrowsecurity) from pg_class where oid in ('public.projects'::regclass, 'public.project_private'::regclass)) as rls_activ,
  (select count(*) from pg_policies where schemaname = 'public' and tablename in ('projects', 'project_private')) as reguli_acces,
  (select bool_and(not prosecdef) from pg_proc where proname in ('save_project', 'set_project_status')) as functii_cu_drepturile_utilizatorului,
  (select has_table_privilege('anon', 'public.projects', 'select') or has_table_privilege('anon', 'public.project_private', 'select')) as vizitatori_au_acces,
  (select has_function_privilege('anon', 'public.save_project(uuid, timestamptz, text, jsonb, jsonb)', 'execute')) as vizitatori_pot_salva,
  (select has_column_privilege('authenticated', 'public.projects', 'owner_id', 'update')) as proprietar_modificabil,
  (select has_column_privilege('authenticated', 'public.projects', 'investment_public', 'update')) as suma_publica_modificabila;
```

Rezultat așteptat (un rând): `true`, `7`, `true`, `false`, `false`, `false`, `false`.

Dacă Preview-ul este deschis înainte de migrare, „Proiectele mele” arată „Proiectele nu au putut fi încărcate” cu un cod tehnic (de ex. `PGRST205`).

## Pasul 2 · Verificarea automată pe buildit-dev

Pe PR #2: scoate și pune la loc eticheta `verifica-buildit-dev`. Verificările noi creează **o singură ciornă temporară** pentru contul A (identificată prin ID-ul creat în rulare), verifică regulile cu contul B și o șterg la final; proiectele existente nu sunt atinse, iar numărul lor este verificat la sfârșit. Publicarea nu se testează pe proiectul real (doar respingerea publicării unei ciorne incomplete).

## Pasul 3 · Verificarea manuală pe Vercel Preview

Cont A (Creator, Mod Creator):
1. **Proiecte** → „Creează un proiect” → scrie doar titlul → **Salvează ciorna** → reîncarcă pagina (F5): titlul rămâne.
2. Mergi la pasul 6 → **Publică proiectul**: apare lista câmpurilor lipsă; proiectul rămâne ciornă.
3. Completează: descriere scurtă, industrie, stadiu, bifează **Remote / Online** (fără oraș); la pasul 4: venit `0`, „Nu am estimat încă” la costurile fixe, lasă costurile variabile goale, investiție căutată (ex. `25000,50`); la pasul 5 un link `https://…`; la pasul 6 **Colegi** + **Investiție** → **Publică proiectul**. Pe pagina proiectului: „Investiție căutată: 25.000,5 EUR”; în „Date private”: `0 EUR`, „Nu am estimat încă”, „Necompletat”, linkul.
4. Cu **contul B**, deschide adresa paginii proiectului (copiaz-o din bara browserului lui A): vezi titlul, investiția, numele și fotografia lui A și „Vezi profilul”; **nu** vezi datele private, linkul sau butoanele de editare.
5. Cu A: **Editează proiectul** → la pasul 6 debifează Investiție, bifează Parteneri → **Salvează modificările** → înainte de confirmare, B (reîncărcare) vede încă investiția → **Actualizează proiectul publicat** → B nu mai vede investiția; A vede suma în continuare în „Date private”.
6. Cu A: editează titlul → **Renunță** → „Renunță la modificări”: titlul vechi rămâne.
7. Conflict: deschide editarea aceluiași proiect pe laptop și pe telefon; salvează pe telefon, apoi încearcă să salvezi pe laptop → mesaj de conflict, modificările rămân în formular; alege una dintre opțiuni.
8. **Retrage din publicare** → B nu mai vede proiectul; **Șterge ciorna** → proiectul dispare din listă.
9. În **Proiecte**, urmărește filele: proiectul publicat apare în „Publicate (n)”, cel retras sau salvat ca ciornă în „Ciorne (n)”; o filă goală afișează un mesaj; contorul „X din 20” rămâne total.
10. Verifică pe telefon și pe laptop. Opțional: contul doar Investitor vede „Proiecte” neschimbat (în pregătire).

Limita de 20 este verificată automat (local); manual ar necesita 20 de proiecte.
