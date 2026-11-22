# Propunere · „Descoperă proiecte” (conturi reale)

Stare: **implementată pe PR #2 (23 noiembrie 2026)** cu deciziile aprobate de mai jos; ghid:
[etapa-4-descopera-proiecte.md](etapa-4-descopera-proiecte.md).

## Decizii aprobate

| Decizie | Rezultat |
|---|---|
| Investitor: „Explore” → „Descoperă” | Da (doar conturile reale) |
| Creator: „Oameni · Proiecte” în Match | Da |
| Proiectele proprii | Excluse; rămân în „Proiectele mele” |
| Investitor: „Investiție” preselectat | Da, se poate debifa |
| Plafonul investiției | Doar Investitor; „Investiție totală căutată de proiect (maximum, EUR)” = suma totală căutată de proiect, nu contribuția individuală. Câmpul apare doar cu „Investiție” bifat; debifarea golește plafonul și resetează opțiunea pentru sumele necunoscute. Cu plafon: doar proiecte care caută investiție; „Investiție de stabilit” exclusă implicit, cu opțiune explicită de includere. Fără plafon: apar normal. |
| Ordinea | Cele mai recent publicate întâi (republicarea readuce proiectul în față) |
| Competențe și roluri căutate în proiect | Etapă separată, imediat după descoperire |
| Vizibilitate și protecția datelor | Reguli existente, neschimbate |

**Decizie rămasă (neimplementată):** proiectele care caută investiție pot avea suma 0 EUR, afișată „Investiție căutată: 0 EUR”. Comportamentul existent se păstrează (0 nu devine „Investiție de stabilit”); o eventuală validare la publicare rămâne de decis separat.

Precizare de formulare: faptul că proprietarul își vede propriile ciorne este comportamentul corect;
excluderea lor din „Descoperă” este o cerință a căutării.


Scop: utilizatorii autentificați găsesc proiectele publicate direct în aplicație, fără să primească
linkul. Prima versiune: **descoperire, filtrare și deschiderea proiectului**. Fără swipe, solicitări
de colaborare sau interes de investiție (și fără butoane pentru ele).

## 1. Ce există acum

- **Meniul de jos (conturi reale):** în Mod Creator, a doua poziție este „Proiecte” (= Proiectele mele);
  în Mod Investitor, aceeași poziție este „Explore”, care afișează doar „în pregătire”.
- **Match (Mod Creator):** „Descoperă oameni” — listă de carduri, filtre, „Arată mai multe” câte 12,
  „Vezi profilul”; datele vin din funcția `discover_people` (SQL, cu drepturile utilizatorului).
- **Pagina proiectului** (`#project/<id>`) există deja: arată proiectul publicat altor utilizatori, cu
  proprietarul și investiția (doar dacă proiectul caută investiție), fără date private sau acțiuni.
- **Demo-ul** are un Explore cu căutare, filtre (industrie, stadiu, oraș, capital maxim, obiectiv),
  sortare, salvare și promovare — o parte depinde de funcții reale inexistente (salvare, contoare,
  sponsorizare), deci nu se preia acum.
- **Datele:** `projects` are tot ce trebuie pentru carduri și filtre (titlu, descriere, industrie,
  stadiu, oraș / Remote, ce caută, `investment_public`, `published_at`). Indexul
  `(status, published_at desc)` există deja.

## 2. Unde apare

| Rol | Recomandare | De ce |
|---|---|---|
| Investitor | Poziția existentă din meniu („Explore”) devine „Descoperă proiecte”. | Locul există deja și este gol; nu schimbă structura meniului. |
| Creator | În **Match**, un comutator în partea de sus: **Oameni · Proiecte** (Descoperă oameni / Descoperă proiecte). | Creatorii caută proiecte ca să li se alăture — exact sensul Match-ului. „Proiecte” rămâne „Proiectele mele” (care are deja file Publicate/Ciorne; încă un nivel de file acolo ar fi confuz). Nu cere proiect propriu. |

O singură componentă și o singură funcție de date pentru ambele roluri; diferă doar filtrele
implicite (secțiunea 4). Pe pagina Acasă, un acces rapid „Descoperă proiecte”.

Alternativă mai simplă (de ales dacă preferi un singur loc): „Descoperă proiecte” ca pagină separată,
accesibilă din Acasă pentru Creator și din meniu pentru Investitor, fără comutator în Match. Mai puțin
vizibilă pentru Creator.

## 3. Cardul de proiect

Același stil ca „Descoperă oameni” și „Proiectele mele” (panou, etichete), nu cardurile ilustrate din
demo (acelea folosesc culori și contoare fictive).

- titlul și descrierea scurtă (maximum 3 rânduri);
- etichete: stadiu, industrie; locație (oraș și/sau „Remote / Online”);
- „Caută: Colegi · Parteneri · Investiție”;
- **doar dacă proiectul caută investiție:** „Investiție căutată: … EUR” sau „Investiție de stabilit”;
- proprietarul: fotografie mică sau inițiale și nume;
- „Publicat la …”;
- o singură acțiune: **Vezi proiectul** (deschide pagina existentă, de unde „Vezi profilul” duce la
  proprietar).

Nu apar: finanțe, linkuri către plan, email, contact, contoare, butoane de interes sau colaborare.

## 4. Filtre

Puține, utile cu un număr mic de proiecte, toate aplicate pe server:

| Filtru | Creator | Investitor |
|---|---|---|
| Căutare în titlu și descriere (fără diferență de majuscule sau diacritice) | da | da |
| Ce caută proiectul (Colegi / Parteneri / Investiție, selecție multiplă; „oricare dintre cele alese”) | da — implicit nimic selectat | da — implicit **Investiție** selectat (se poate scoate) |
| Industrie | da | da |
| Stadiu (Idee / În dezvoltare / Deja lansat) | da | da |
| Locație: oraș (potrivire parțială) + „Include Remote / Online” | da | da |
| Investiție maximă (EUR), cu „Include «Investiție de stabilit»” | — | da |
| „Resetează filtrele” | da | da |

Investiția maximă tratează „de stabilit” ca necunoscută, nu ca 0 (aceeași regulă ca la ore în
„Descoperă oameni”).

**Limită de semnalat:** pentru Creatorii care vor să se alăture, cel mai util filtru ar fi „caută
competențele mele” — dar proiectele nu au încă un câmp de competențe/roluri căutate. Nu îl inventăm
din descriere; propun un câmp separat într-o etapă ulterioară (decizia 7).

## 5. Ordinea și încărcarea

- **Implicit: cele mai recent publicate întâi** (`published_at`, apoi `id` pentru ordine stabilă).
  Fără „relevanță” sau scor: clasamentul organic și promovarea sunt separate și neimplementate.
- **12 rezultate pe pagină**, „Arată mai multe”, paginare prin cursor (fără dubluri), maximum 50 pe
  cerere — ca la „Descoperă oameni”.
- Lista și filtrele se păstrează la deschiderea unui proiect și revenire.

**De semnalat:** `published_at` se actualizează la fiecare republicare, deci retragerea și
republicarea aduc proiectul în față. Pentru o primă versiune e acceptabil; dacă devine abuz, se
ordonează după prima publicare (decizia 6).

## 6. Stări goale și erori

- **Nu există proiecte publicate:** „Încă nu există proiecte publicate. Revino mai târziu.” Pentru
  Creator, în plus: „Poți publica propriul proiect din Proiecte.” (link spre o funcție existentă).
- **Filtrele nu dau rezultate:** „Niciun proiect nu corespunde filtrelor.” + „Resetează filtrele”;
  pentru Investitor cu filtrul implicit „Investiție”: „Niciun proiect publicat nu caută investiție
  momentan.”
- **Eroare:** mesaj, cod tehnic, „Încearcă din nou” (ca în restul aplicației).
- Fără proiecte fictive în conturile reale.

## 7. Proiectele proprii

**Recomandare: excluse din rezultate, în ambele moduri.**
- Le gestionezi deja în „Proiectele mele”; în descoperire ar fi zgomot.
- Consecvent cu „Descoperă oameni” (propriul profil este exclus).
- Pregătește regula viitoare: nu poți colabora cu propriul proiect sau investi în el.

Pentru „cum îl văd ceilalți”, o variantă mai utilă decât apariția în listă este o previzualizare pe
pagina proiectului propriu — se poate adăuga ulterior, dacă e nevoie.

## 8. Decizii care necesită acordul tău

| # | Decizie | Recomandare |
|---|---|---|
| 1 | Investitor: poziția „Explore” din meniu devine „Descoperă proiecte” | Da. Eticheta din meniu va fi „Descoperă” (scurt, încape pe telefon); doar în conturile reale, demo-ul rămâne neschimbat. |
| 2 | Creator: comutator „Oameni · Proiecte” în Match | Da (alternativa: pagină separată din Acasă). |
| 3 | Proiectele proprii excluse din rezultate | Da. |
| 4 | Investitor: filtrul „Investiție” preselectat | Da, se poate scoate. |
| 5 | Filtrul „Investiție maximă” în prima versiune | Da, doar pentru Investitor (cost mic, datele există). |
| 6 | Ordinea: cele mai recent publicate întâi (republicarea readuce proiectul în față) | Da pentru prima versiune. |
| 7 | Câmp viitor „Competențe / roluri căutate” în proiect | Nu acum; separat, după prima versiune. |
| 8 | Vizibilitate neschimbată: doar autentificați; ciornele și datele private protejate | Confirmat (nu schimbăm regulile). |

## 9. Implementare (după acord)

- **Migrare nouă, doar o funcție de citire:** `discover_projects(...)`, cu drepturile utilizatorului
  (RLS activ), doar pentru autentificați. Filtrează explicit `status = 'published'` (proprietarul își
  vede corect ciornele prin RLS, dar descoperirea arată doar proiecte publicate) și exclude `owner_id =
  auth.uid()`. Întoarce doar coloane publice + numele și calea fotografiei proprietarului (din
  `profiles`, deja vizibile autentificaților). Fără modificări de tabele, date sau reguli.
- **Interfață:** o componentă comună (filtre, carduri, „Arată mai multe”, stări), refolosind tiparul
  „Descoperă oameni”; fotografiile proprietarilor semnate într-un singur apel.
- **Teste:** bază de date (doar publicate, fără ciorne — inclusiv ciornele proprii —, fără propriile
  proiecte, fără date private, filtre, investiție „de stabilit” ≠ 0, paginare, vizitator refuzat);
  unitare și de afișare; browser simulat pe telefon și laptop; pe buildit-dev, verificări **doar de
  citire** (funcția răspunde, doar proiecte publicate, fără proprii, fără coloane private), folosind
  proiectele existente și ciorna temporară a lui A ca să confirme că nu apare.
- Ordine pentru tine: migrare pe buildit-dev → verificare SQL → test cu eticheta → verificare manuală.
