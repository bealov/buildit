# BuildIT

Prototip interactiv pentru creatori și investitori, în română. React 19, TypeScript și Vite. Interfață mobilă cu șase destinații: Acasă, Proiecte/Explorează, Match, Marketplace, Clasament, Profil.

## Rulare și publicare independentă

Necesită Node.js 22.6+ (recomandat 24) pentru testele TypeScript (`--experimental-strip-types`).

```sh
npm ci
npx vite --host 0.0.0.0
npm test
npm run build
```

Build: `dist`. Pentru Vercel: importați sursa, preset Vite, build `npm run build`, output `dist`. Configurația este în `vercel.json` (și `netlify.toml` pentru Netlify). Rutele folosesc hash și funcționează pe hosting static, fără rescrieri de rute.

## Conturi demo și permisiuni

Butonul Demo din antet permite alegerea contului Creator sau a investitorului. Schimbarea creatorului din Match se aplică acum în întreaga aplicație: profil, proiecte, documente, oferte, statistici și promovare. Identitatea activă este păstrată în browser. Profilurile creatorilor au poze și preferințe separate.

Doar proprietarul poate edita/publica un proiect, publica o ofertă Marketplace sau activa un Boost. Verificările există atât pe pagini, cât și în funcțiile de mutație. Un Match confirmat permite consultarea planului proiectului, fără drept de editare sau vânzare. Nu există o bifă suplimentară de partajare. Creatorii sunt informați despre accesul reciproc înainte de trimitere/confirmare. Regula veche `shareDoc` este ignorată pentru compatibilitatea datelor existente.

Acestea sunt reguli ale prototipului în browser, nu autorizare reală pe server. Datele demo și fișierele din același browser pot fi inspectate de persoana care folosește browserul.

## Documente

În pasul Echipă și materiale al proiectului se poate încărca un PDF sau Word (.docx) de maximum 10 MB. Fișierul este salvat efectiv în IndexedDB și poate fi descărcat după Match confirmat sau de proprietar. Smart Analysis permite atașarea/înlocuirea aceluiași plan al proiectului.

Documentul comercializat în Marketplace se încarcă separat în formularul ofertei. Oferta include titlu, descriere publică, preț fix și fișier; pentru publicarea unei oferte noi sau actualizate este necesar un atașament. Cumpărătorul vede descrierea înainte de achiziție, iar fișierul se deblochează numai după confirmarea plății demonstrative. Match nu deblochează documentul comercializat. Ofertele sunt neexclusive și nu folosesc licitații. Datele seed fără fișier rămân exemple fictive, marcate explicit.

Validarea uploadului verifică extensia, dimensiunea și semnătura de început a fișierului; nu validează întregul conținut DOCX/PDF. Nu există OCR, scanare antivirus sau procesare AI. Fișierele rămân în browser și nu sunt sincronizate între utilizatori/dispozitive. Schimbarea contului demonstrează fluxul pe același dispozitiv. Resetarea șterge și fișierele locale. Eliminarea unui atașament detașează referința; resetarea curăță întregul storage.

## Smart Analysis

Titlu: „Verifică planul de afaceri”. Nu mai există casetă de text, exemplu derivat din rezumatul proiectului sau bife prin care creatorul confirmă calitatea planului. Nu mai este folosită verificarea prin cuvinte-cheie.

Fără API AI conectat, documentele proprii sunt marcate explicit drept neevaluate. Raportul demonstrativ este redactat exclusiv pentru documentul fictiv „Verde Atelier”, afișat integral în interfață. Are trimiteri la secțiuni, acoperire, lipsuri, ambiguități, recomandări și trei pași. Pregătirea pentru finanțare descrie documentarea, fără scor sau predicție de eligibilitate. Nu sunt generate automat SWOT, ROI, rezultat operațional sau proiecții financiare. Vechile funcții de analiză și tipuri rămân în cod pentru compatibilitate, fără utilizare în noul raport.

## Date financiare

Fiecare câmp are opțiunea „Nu am estimat încă”. La proiectele noi aceasta este debifată, iar câmpurile sunt goale și editabile. Valoarea neestimată este stocată distinct prin `unknownFinancials`; valorile numerice anterioare sunt păstrate pentru revenire, dar mascate în afișări și excluse din filtrarea după capital. Zero rămâne o valoare explicită. Estimările lipsă generează îndrumări demonstrative separate de analiza documentului, adaptate pentru câteva categorii de activitate și cu exemple prezentate ca posibilități, nu costuri confirmate.

Editarea păstrează textul brut până la continuare/salvare. Sunt acceptate punctul și virgula zecimală, fără separatori de mii. Câmpurile estimate nu acceptă gol, negative sau valori nefinite. Focusul selectează valoarea pentru înlocuire.

## Clasament și promovare

Scorul organic rămâne: vizualizări + 5 × salvări + 20 × Match-uri confirmate cu investitori, incluzând activitatea fictivă inițială. Analiza planului, estimările și plățile de promovare nu schimbă formula. Clasamentul reflectă interesul comunității, nu calitatea planului. Perioada și valorile inițiale sunt demonstrative.

Cardul Sponsorizat apare deasupra listei organice, fără poziție. Selecția folosește campaniile active și proiectele publicate, cu prioritate Spotlight. În absența campaniilor, apare un exemplu de amplasare etichetat explicit. Sponsorizarea nu adaugă puncte. Boost rămâne o plată simulată.

## Alte funcții și limite

Poza de profil acceptă JPG/PNG/WebP de maximum 5 MB, cu miniatură locală de 256 × 256 px. „Link adițional” are explicația LinkedIn/portofoliu/site web. Titlurile normalizează secvențele literale `\n`.

Starea este păstrată în localStorage (`buildit-demo-v1`), iar documentele în IndexedDB (`buildit-files`). Datele vechi sunt păstrate, fără resetare la actualizare. Nu există autentificare, plăți, investiții, AI real sau mesagerie. Pentru un produs real sunt necesare backend, autorizare server, storage privat și integrarea explicită a serviciilor respective.

## Traseu de demonstrație

1. Creator → proiect → Date financiare: marchează un cost neestimat și salvează.
2. Smart Analysis: consultă explicația costului lipsă, atașează un fișier și deschide separat exemplul Verde Atelier.
3. Proiect → Vinde planul în Marketplace: completează oferta și atașează documentul comercializat.
4. Intră ca Investitor: cumpără demonstrativ oferta și descarcă fișierul din Achiziții, în același browser.
5. Intră ca Alex, trimite un parteneriat către Ritmo și schimbă global contul la destinatar. Acceptă după citirea informării. Planul poate fi consultat, dar nu editat sau vândut de celălalt creator.
6. Deschide Clasament și verifică separarea Sponsorizat/organic. Activează un Boost pentru proiectul propriu pentru a înlocui exemplul de amplasare.

Consultați TEST-REPORT.md pentru verificările executate și limitele lor.

## Ultima revizie a prototipului

Match Creator afișează un singur card, cu glisare și butoane, iar cele trei taburi includ conexiunile cu investitorii. Descoperirea își păstrează cardul și tabul la revenirea din proiect. Navigarea Înapoi folosește istoricul sesiunii și restaurează poziția de derulare; filtrele rămân în memorie la revenire.

Marketplace are acces direct la „Publică un plan” și „Planurile mele de vânzare”, formular independent, cu opțiunea de a porni de la un proiect propriu, document separat, previzualizare și confirmarea publicării. Sortarea include preț descrescător. Promovarea din Clasament folosește un rând compact, separat de scorul organic. Smart Analysis nu apare pe pagina principală a Investitorului.

Proiectele noi pornesc cu câmpuri financiare goale și bife debifate. `unfilledFinancials` păstrează câmpurile necompletate separat de `unknownFinancials` (alegerea explicită „Nu am estimat încă”) și de zero. Editarea păstrează alegerile salvate anterior; zecimalele sunt păstrate și la afișarea sumelor.

## Marketplace independent — 1 noiembrie 2026

Un Creator poate vinde planuri fără niciun proiect pentru Match. Ofertele au proprietar și categorie proprii; asocierea cu un proiect este opțională. Publicarea nu creează proiecte și nu înscrie planul în Match sau în clasamentul proiectelor. Ofertele vechi își păstrează proprietarul și categoria din proiectul asociat. Documentele cumpărate sunt accesate după ID-ul ofertei, separat de documentele Match. Administrarea și istoricul vânzărilor includ ofertele independente.
