# Descoperă proiecte — aplicare și verificare

Implementare pe PR #2 (doar buildit-dev și Vercel Preview; Production rămâne demo). Decizii:
[propunere-descopera-proiecte.md](propunere-descopera-proiecte.md).

## Ce face

- **Investitor:** în meniu, poziția „Explore” devine **„Descoperă”** → „Descoperă proiecte” (doar în conturile reale; demo-ul este neschimbat).
- **Creator:** în **Match**, comutatorul **Oameni · Proiecte**. Nu este nevoie de un proiect propriu.
- **Carduri:** titlu, descriere scurtă, stadiu, industrie, locație (oraș / Remote / Online), „Caută: …”, investiția **doar** dacă proiectul caută investiție („Investiție căutată: … EUR” sau „Investiție de stabilit”; 0 EUR rămâne 0 EUR), proprietarul (fotografie, nume), data publicării, **Vezi proiectul**. Fără finanțe private, linkuri, contact sau butoane nefuncționale.
- **Filtre:** text în titlu și descriere (fără diferență de majuscule sau diacritice), ce caută proiectul (oricare dintre cele alese), industrie, stadiu, oraș (+ „Include și proiectele Remote / Online”, vizibil doar cu oraș), „Resetează filtrele”.
- **Doar Investitor:** „Investiție” preselectat (se poate debifa). Cu „Investiție” bifat apare „Investiție totală căutată de proiect (maximum, EUR)” — suma totală căutată de proiect, nu contribuția investitorului. Cu plafon: doar proiecte care caută investiție; „Investiție de stabilit” exclusă implicit, cu opțiunea „Include și proiectele cu «Investiție de stabilit»”. Debifarea „Investiție” golește plafonul și resetează opțiunea.
- **Ordine:** cele mai recent publicate întâi; câte 12, cu „Arată mai multe”; lista și filtrele rămân la revenirea din proiect.
- **Excluse:** ciornele (inclusiv cele proprii) și **toate proiectele proprii** (rămân în „Proiectele mele”).
- **Stări:** fără proiecte publicate ale altora; fără rezultate pentru filtre (cu resetare); Investitor implicit fără proiecte care caută investiție (cu „Arată toate proiectele publicate”); eroare cu cod tehnic.

## Pasul 1 · Aplică migrarea pe buildit-dev (înainte de Preview)

Fișier: `supabase/migrations/20261123000000_discover_projects.sql` — o singură funcție de citire, `discover_projects`. Nu modifică tabele, date sau reguli.

1. GitHub → fișierul pe ramura PR-ului → **Raw** → copiază tot (până la `commit;`).
2. Supabase → **buildit-dev** → **SQL Editor** → **New query** → lipește → **Run** (așteptat: *Success. No rows returned*).
3. Verificare (doar citire):

```sql
select proname,
       prosecdef as ruleaza_cu_drepturi_de_proprietar,
       provolatile = 's' as doar_citire,
       has_function_privilege('anon', oid, 'execute') as vizitatori,
       has_function_privilege('authenticated', oid, 'execute') as autentificati
from pg_proc
where proname = 'discover_projects';
```

Așteptat: un rând — `discover_projects`, `false`, `true`, `false`, `true`.

## Pasul 2 · Testul automat pe buildit-dev

Pe PR #2: scoate și pune la loc eticheta `verifica-buildit-dev`. Verificările noi sunt **doar de citire** (pentru A, B și C): vizitatorul nu poate apela funcția; funcția răspunde; fără proiecte proprii; doar câmpuri publice; doar proiecte publicate; investiția doar la proiectele care caută investiție; maximum 50 și paginare fără dubluri; plafonul și „de stabilit”; în plus, ciorna temporară a lui A nu apare în descoperire nici pentru A, nici pentru B. Filtrele detaliate se verifică manual sau local (ar necesita proiecte de test publicate).

## Pasul 3 · Verificarea manuală pe Vercel Preview

1. **Investitor (contul C):** meniul arată „Descoperă” → lista pornește cu „Investiție” bifat; apar doar proiectele care caută investiție. Completează un plafon: proiectele cu „Investiție de stabilit” dispar; bifează opțiunea → reapar. Debifează „Investiție”: câmpul de plafon dispare, apar toate proiectele publicate; rebifează → plafonul este gol.
2. **Creator (Maria sau Beatrice):** Match → **Proiecte**: apar proiectele publicate ale celorlalți, nu propriile proiecte și nici ciornele; investiția apare doar la proiectele care caută investiție.
3. Filtre: text, „ce caută”, industrie, stadiu, oraș (+ Remote); „Resetează filtrele”.
4. **Vezi proiectul** → pagina proiectului (fără date private sau butoane de editare) → **Înapoi**: filtrele și lista rămân.
5. Comutatorul **Oameni · Proiecte** păstrează fiecare listă.
6. Telefon și laptop.
