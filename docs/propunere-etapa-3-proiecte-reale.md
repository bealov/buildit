# Propunere · Etapa 3: proiecte reale (ciorne private și proiecte publicate)

Stare: **propunere, neimplementată.** Pregătită pe 21 noiembrie 2026, pe ramura PR #2. Deciziile din
secțiunea 5 trebuie confirmate înainte de implementare.

Scop: Creatorii își pot crea, salva și edita propriile proiecte în Supabase, cu o separare clară între
**ciorne private** și **proiecte publicate**. Etapa pregătește datele pentru „Descoperă proiecte” și
pentru colaborările asociate unui proiect, care vor veni ulterior.

---

## 1. Ce există în demo (analiză)

### Formularul (`src/Wizard.tsx`): 6 pași, cu „Salvează ciorna” disponibil oricând

| Pas | Câmpuri | Reguli |
|---|---|---|
| 1. Informații generale | Titlu, Locație, Industrie (listă), Stadiu (Idee / Validare / MVP / Creștere), Descriere scurtă | Titlul, locația și descrierea sunt obligatorii pentru a continua |
| 2. Problema și soluția | Problema, Soluția, Clienți și piață, Diferențiere | texte libere |
| 3. Model de business | Surse de venit și preț, Marketing, Strategie de creștere, Obiective | texte libere |
| 4. Date financiare | 8 sume în EUR: venit lunar, costuri fixe, costuri variabile, investiție inițială, capital căutat, creștere lunară (%), preț, cost unitar | fiecare are „Nu am estimat încă”; **0 ≠ neestimat ≠ necompletat**; zecimale cu virgulă sau punct |
| 5. Echipă și materiale | Echipa, Validare / clienți pilot, Linkuri; documentul planului (PDF/DOCX în browser) | documentul se vede de partener doar după Match |
| 6. Colaborare și publicare | Caut investiție, Caut parteneriat / colaborare, Sunt deschis la fuziune, Vreau să vând planul în Marketplace; previzualizare; „Confirmă publicarea” | la publicare sunt obligatorii titlul, descrierea și locația |

### Comportamentul
- **Ciornă / publicat:** un singur câmp `published`. Ciorna se vede doar de proprietar. Pe pagina proiectului, proprietarul are „Editează” și „Publică / Retrage”; ceilalți văd „Acest proiect nu este publicat”.
- **Editarea** folosește același formular. Regula „doar proprietarul” există doar în browser (`saveProject`, `ownsProject`).
- **Funcții care depind de proiecte:**
  - Explore, cu filtre: industrie, stadiu, oraș, capital maxim, obiectiv;
  - proiecte salvate și contoare: vizualizări, salvări, Match-uri;
  - clasament, Boost, statistici;
  - Smart Analysis;
  - accesul la document după Match;
  - interesul investitorilor;
  - colaborările între proiectele creatorilor;
  - ofertele Marketplace legate opțional de un proiect.
- **De nu preluat în varianta reală:**
  - contoarele editabile în același obiect cu proiectul (în demo sunt fictive);
  - câmpul vechi `shareDoc`;
  - culoarea aleatorie;
  - bifa „vând planul”: Marketplace-ul este independent, iar o ofertă poate indica opțional un proiect, nu invers.

---

## 2. Ce propun pentru prima implementare

### Inclus
1. **Proiectele mele** (Mod Creator → Proiecte): lista propriilor proiecte, cu eticheta *Ciornă* sau *Publicat*, plus butonul „Creează un proiect”.
2. **Formularul în 6 pași**, cu aceleași texte, același aspect și aceleași reguli ca în demo:
   - „Salvează ciorna” oricând;
   - „Publică” doar cu câmpurile obligatorii completate;
   - datele financiare păstrează distincția 0 / neestimat / necompletat.
3. **Editarea propriilor proiecte**, ciorne sau publicate.
4. **Publicare și retragere**: un proiect retras revine la ciornă și dispare imediat pentru ceilalți.
5. **Ștergerea ciornelor proprii**, cu confirmare.
6. **Pagina proiectului:**
   - proprietarul vede orice proiect propriu, cu acțiunile Editează / Publică / Retrage;
   - ceilalți utilizatori autentificați văd doar proiectele publicate, fără butoane de interes sau colaborare.
7. **Protecție împotriva suprascrierii:** dacă același proiect e editat de pe laptop și de pe telefon, a doua salvare este oprită cu mesajul „Proiectul a fost modificat între timp”.

### Exclus (etape ulterioare)
- „Descoperă proiecte” (lista publică, cu filtre): în etapa 3 pregătim doar datele și regulile.
- Documentele planului (vor avea un spațiu privat propriu, după același model ca fotografiile).
- Interesul investitorilor, colaborările pe proiect, Match-ul.
- Contoarele, clasamentul, Boost, statisticile, Smart Analysis, legătura cu Marketplace.
- Modul Investitor și demo-ul rămân neschimbate.

---

## 3. Date și reguli de acces (o migrare nouă)

### Tabelul `public.projects`
- **Identificare:** `id`, `owner_id` (proprietarul, legat de profil), `status` (`draft` sau `published`), `created_at`, `updated_at`, `published_at`.
- **Câmpurile pașilor 1–5:** titlu, oraș, industrie, stadiu, descriere scurtă, problemă, soluție, piață, diferențiere, model de business, marketing, strategie de creștere, obiective, echipă, validare, linkuri.
- **Obiectivele de colaborare:** caut investiție, caut parteneriat, deschis la fuziune.
- **Cele 8 valori financiare**, ca sume cu zecimale, plus lista câmpurilor marcate „Nu am estimat încă”. „Necompletat” = valoare goală și nemarcată, deci diferit de 0 și de „neestimat”.

### Reguli impuse în baza de date (nu doar în interfață)

| Cine | Ce poate face |
|---|---|
| Vizitator neautentificat | nimic |
| Proprietarul | își vede toate proiectele (ciorne și publicate); creează doar pentru sine și doar dacă are rolul Creator; editează și șterge doar proiectele proprii |
| Alt utilizator autentificat | vede **doar** proiectele publicate, niciodată ciornele; nu poate modifica nimic |

Reguli suplimentare:
- **Proprietarul nu poate fi schimbat** după creare, nici direct, nici prin editare.
- **Publicarea este validată de baza de date:** un proiect `published` trebuie să aibă titlu, oraș, industrie, stadiu și descriere scurtă. Un client modificat nu poate publica un proiect incomplet.
- **Valori validate:** industria și stadiul din listele existente; lungimi maxime pentru texte; sume ≥ 0; linkuri doar `https://` sau `http://`.
- **Limită de proiecte pe cont**, de exemplu 20, ca protecție împotriva abuzului (vezi deciziile).
- **Fără contoare** în acest tabel. Vizualizările și Match-urile vor avea tabele separate, pe care proprietarul nu le poate modifica.

### Pregătire pentru etapele următoare
- **Descoperă proiecte:** o funcție de citire, similară cu `discover_people`, peste proiectele publicate.
- **Colaborările** vor face trimitere la `projects.id`. Regula „nu poți colabora cu propriul proiect” se va verifica în baza de date.
- **Documentele** vor fi în spațiul privat `project-docs/<id-proiect>/…`, cu acces după Match.
- **Ofertele Marketplace** vor putea face trimitere opțional la un proiect propriu.

---

## 4. Teste propuse

- **Baza de date (`test:db`)**, cu mai multe conturi:
  - ciornele sunt invizibile pentru ceilalți;
  - proiectele publicate sunt vizibile doar autentificaților;
  - un utilizator nu poate crea un proiect pentru altul și nu poate schimba proprietarul;
  - un cont fără rolul Creator nu poate crea proiecte;
  - un proiect incomplet nu poate fi publicat;
  - retragerea ascunde proiectul;
  - 0, neestimat și necompletat rămân distincte;
  - limitele și valorile nepermise sunt respinse;
  - ștergerea afectează doar proiectele proprii.
- **Unitare și de afișare:** formularul în modul real, transformarea valorilor financiare, mesajele de validare, etichetele Ciornă/Publicat, pagina pentru proprietar și pentru alți utilizatori.
- **Browser (server simulat):**
  - creare ciornă → reîncărcare → editare → publicare;
  - celălalt cont vede proiectul publicat și nu vede ciorna;
  - retragere;
  - salvări în conflict de pe două dispozitive;
  - telefon și laptop.
- **buildit-dev (GitHub Actions):** scriptul ar crea o **ciornă temporară** pentru contul A, ar verifica regulile cu contul B și ar șterge ciorna la final. Proiectele existente nu sunt atinse. Necesită acordul tău (decizia 10).

---

## 5. Decizii de stabilit înainte de implementare

| # | Decizie | Recomandare |
|---|---|---|
| 1 | Cine poate crea proiecte? | Doar conturile cu rolul **Creator** (indiferent de modul activ). |
| 2 | Cine vede proiectele publicate? | Doar **utilizatorii autentificați**, ca profilurile. Vizitatorii pot fi adăugați ulterior. |
| 3 | Sunt datele financiare publice când proiectul e publicat? | **Capitalul căutat** public (dacă e completat); celelalte sume (venit, costuri, investiție, preț, cost unitar, creștere) **ascunse implicit**, cu opțiunea „Arată reperele financiare” pe proiect. Alternativă: toate publice, ca în demo. |
| 4 | Ce câmpuri sunt obligatorii pentru publicare? | Titlu, oraș, industrie, stadiu, descriere scurtă (ca în demo, plus industria și stadiul, care au mereu o valoare). |
| 5 | Editarea unui proiect publicat | Modificările devin vizibile **imediat** după salvare, cu o confirmare. Alternativa „ciornă a versiunii publicate” e mai complexă. |
| 6 | Retragere și ștergere | Retragerea → ciornă. Se pot șterge **doar ciornele** (definitiv); un proiect publicat se retrage întâi. |
| 7 | Limita de proiecte pe cont | **20** (ciorne + publicate). |
| 8 | Bifa „Vreau să vând planul în Marketplace” | **Eliminată** din proiectele reale: Marketplace-ul rămâne independent. |
| 9 | Documentul planului | **Amânat** pentru etapa documentelor; în etapa 3 rămân doar linkurile. |
| 10 | Test automat pe buildit-dev cu o ciornă temporară creată și ștearsă | Da, doar pentru contul de test A. |
| 11 | Moneda și formatul sumelor | Doar **EUR**, maximum 2 zecimale, fără separatori de mii (ca în demo). |
| 12 | Proiectul arată numele proprietarului? | Da: nume, fotografie și link spre profilul public, fără contact. |

---

## 6. Pași după confirmare

1. Migrarea nouă (SQL complet, pași în Supabase Dashboard și interogare de verificare), plus testele bazei de date.
2. Interfața „Proiectele mele”, formularul real și pagina proiectului, cu același aspect ca demo-ul.
3. Testele unitare, de afișare și din browser; verificările pe buildit-dev.
4. Ordinea pentru tine, din browser: aplici migrarea pe buildit-dev → verificarea SQL → testul cu eticheta → verificarea manuală pe Preview.
