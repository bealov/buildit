# Match · „Descoperă oameni” (conturi reale) — aplicare și verificare

Prima funcție Match pentru conturile reale. În **modul Creator**, secțiunea Match arată persoanele cu
rolul Creator care au bifat „Vreau să mă alătur unui proiect” (inclusiv cele care dezvoltă și un
proiect), fără propriul profil. Nu este nevoie de un proiect propriu.

- Carduri: fotografie sau inițiale, nume, oraș, competențe, rol dorit, disponibilitate. Câmpurile
  necompletate apar ca „Necompletat(e/ă)”; disponibilitatea necompletată nu este afișată ca 0.
- Filtre: competență (potrivire parțială, fără diferență de majuscule sau diacritice), rol dorit, „Minimum
  ore/săptămână” și „Resetează filtrele”. Cu un minim de ore, persoanele fără disponibilitate
  completată apar doar dacă bifezi „Include și persoanele fără disponibilitate completată”.
- Singura acțiune: „Vezi profilul” (profil public, fără email, link sau alte date private). Nu există
  like, invitații sau mesaje.
- Rezultate câte 12, cu „Arată mai multe”. Lista și filtrele se păstrează la revenirea din profil.
- Modul Investitor nu se schimbă: Match rămâne „în pregătire”. Demo-ul nu se schimbă.

## Pasul 1 · Aplică migrarea pe buildit-dev (înainte de a testa Preview-ul)

Fișierul: `supabase/migrations/20261121000000_discover_people.sql`. Adaugă o singură funcție de
căutare (`public.discover_people`); **nu** modifică tabele, date, permisiuni pe tabele sau reguli RLS.
Funcția rulează cu drepturile utilizatorului care o apelează, deci RLS rămâne în vigoare, și este
disponibilă doar utilizatorilor autentificați.

1. Deschide fișierul în GitHub, pe ramura PR-ului, și apasă **Raw**; copiază tot conținutul, de la
   primul rând până la `commit;`.
2. Supabase → **buildit-dev** → **SQL Editor** → **New query** → lipește → **Run**.
   Rezultat așteptat: *Success. No rows returned*.
3. Verificare (doar citire), într-un query nou:

```sql
select proname,
       prosecdef as ruleaza_cu_drepturi_de_proprietar,
       provolatile = 's' as doar_citire,
       has_function_privilege('anon', oid, 'execute') as vizitatori,
       has_function_privilege('authenticated', oid, 'execute') as autentificati
from pg_proc
where proname = 'discover_people';
```

Rezultat așteptat: un singur rând cu `ruleaza_cu_drepturi_de_proprietar = false`,
`doar_citire = true`, `vizitatori = false`, `autentificati = true`.

Dacă Preview-ul este deschis înainte de migrare, Match afișează „Lista nu a putut fi încărcată” cu
codul `PGRST202` și indicația de a aplica această migrare.

## Pasul 2 · Pregătește conturile pentru verificarea manuală

Ca o persoană să apară în „Descoperă oameni”, contul ei trebuie să aibă **rolul Creator** și, în
Setări → „Cum vrei să participi?”, bifa **„Vreau să mă alătur unui proiect”**. Competențele, rolul
dorit și orele sunt opționale (profilurile incomplete apar și ele).

Recomandare pentru două conturi de test (A = cel care caută, B = cel care trebuie găsit):

- A: rol Creator, **Mod Creator** activ.
- B: rol Creator și bifa „Vreau să mă alătur unui proiect”, cu cel puțin o competență, un rol dorit
  și un număr de ore (pentru a putea testa filtrele).

Atenție: activarea unui rol este **permanentă** (nu există dezactivare). Dacă B are doar rolul
Investitor, activarea rolului Creator pe B rămâne activă. Bifa „Vreau să mă alătur” și competențele
pot fi schimbate oricând din Setări.

## Pasul 3 · Verificarea manuală pe Vercel Preview

1. Autentifică-te cu **A**, în Mod Creator → **Match**. Apare „Descoperă oameni”.
2. B apare în listă; A **nu** apare (propriul profil este exclus). Nu apar emailuri.
3. Filtre:
   - scrie o parte din competența lui B, cu altă combinație de litere mari/mici (ex. „MARK” pentru
     „Marketing”) → B rămâne în listă; scrie un text inexistent → mesaj „Nicio persoană nu
     corespunde filtrelor” și buton „Resetează filtrele”;
   - alege rolul dorit al lui B → B apare; alege alt rol → B dispare;
   - „Minimum ore/săptămână” egal cu orele lui B → B apare; cu o oră în plus → B dispare;
   - scrie `0` → mesaj de validare; **Resetează filtrele** golește toate filtrele.
4. **Vezi profilul** pe cardul lui B → profil public (descriere, competențe, rol dorit, ore), fără
   email sau link; **Înapoi la Descoperă oameni** → lista și filtrele sunt la fel ca înainte.
5. Comută în **Mod Investitor** (dacă A are ambele roluri) → Match arată „în pregătire”, ca înainte.
6. Opțional: autentifică-te cu **B** → B nu se vede pe sine; A apare doar dacă A are și bifa
   „Vreau să mă alătur unui proiect”.
7. Pe telefon: filtrele sunt unul sub altul, cardurile pe o coloană; pe laptop, filtrele pe un rând
   și cardurile pe două coloane.

## Pasul 4 · Verificarea automată pe buildit-dev (GitHub Actions)

Pe PR, scoate și pune la loc eticheta `verifica-buildit-dev`. Verificările noi pentru „Descoperă
oameni” sunt **doar de citire**: vizitatorii nu pot apela funcția; propriul profil nu apare;
rezultatele conțin doar câmpuri publice, doar Creatori care vor să se alăture, maximum 50 pe pagină,
fără dubluri între pagini; iar filtrele (competență, rol, ore, inclusiv ore necompletate) se verifică
pe datele existente ale celuilalt cont. Verificările care au nevoie de date pe care conturile nu le au
(de exemplu, competențe) apar ca „omis”, nu ca eșec.
