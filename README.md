# BuildIT

Prototip interactiv mobil pentru prezentare universitară. React 19, TypeScript strict, Vite, Lucide; CSS propriu pentru un design întunecat coerent. Alternativa CSS la Tailwind evită o dependență suplimentară; rutarea prin hash permite refresh și găzduire statică pe orice platformă.

## Rulare

Necesită Node.js 24 (testele folosesc eliminarea nativă a tipurilor TypeScript).

```sh
npm ci
npx vite --host 0.0.0.0
npm run lint
npm test
npm run build
npx vite preview
```

Build-ul independent este în `dist/`. Nu sunt necesare chei API sau un cont ChatGPT pentru aplicație când este găzduită public.

## Structură

- `src/model.ts`: tipuri, date fictive, calcule financiare, matching, ownership, achiziții și clasament.
- `src/main.tsx`: orchestrarea rutelor, starea centrală și modulele aplicației.
- `src/Wizard.tsx`: creare și editare proiect în șase etape.
- `src/ui.tsx`: componente comune și dialoguri native accesibile.
- `src/locales.ts`: dicționar de bază română, structură engleză, formatare numerică.
- `src/style.css`: design adaptiv, safe areas și reduced motion.
- `tests/business.test.ts`: verificări ale regulilor și calculelor.
- `tests/render.mjs`: randare server pentru pagini și roluri.

## Demo în 5 minute

1. Intră ca **Creator** (Alex Marin). Conturile sunt fictive, fără parolă.
2. Proiecte → Creează un proiect. Completează titlu, locație și descriere. Salvează ciorna. Reîncarcă și redeschide-o din Proiecte.
3. Editează, completează datele și publică. Preferințele de investiție, parteneriat, fuziune și vânzare sunt independente.
4. Deschide Stocly → Smart Analysis. Schimbă venitul sau costurile în formular și regenerează raportul pentru rezultate diferite.
5. În proiect, publică o ofertă în Marketplace. Activează un Boost și verifică eticheta Promovat de pe Acasă.
6. Din butonul Demo din antet, intră ca **Investitor** (Mara Ionescu). Datele anterioare rămân salvate.
7. Explore → filtrează după industrie / capital / stadiu / locație / colaborare, salvează Stocly și trimite interes.
8. Match permite glisare stânga/dreapta și butoane alternative. Solicitarea este inițial în așteptare.
9. Revino ca Creator → Match → acceptă solicitarea. Doar acum apar contactele permise. Match nu reprezintă investiție și nu cumpără documente Marketplace.
10. Ca Investitor, deschide Marketplace și cumpără demonstrativ un plan. Confirmarea deblochează documentul în Achizițiile mele. Anularea sau eșecul păstrează accesul blocat.
11. Profil → Resetează datele demo → confirmă, pentru a restaura cele 18 proiecte și conturile inițiale.

## Reguli și calcule

Toate sumele sunt EUR, fără conversii artificiale.

- Rezultat operațional lunar = venit − cost fix − cost variabil.
- Prag de rentabilitate în unități = cost fix / (preț unitar − cost variabil unitar), rotunjit în sus. Dacă marja sau prețul nu sunt pozitive, arată date insuficiente.
- ROI simplificat pe 12 luni = rezultat lunar × 12 / investiția inițială × 100. Rezultat constant, fără taxe, dobânzi sau actualizare; nu este randament promis.
- Proiecții: venitul și costul variabil cresc la rata lunară declarată, costul fix rămâne constant.
- Sensibilitate: venitul scade cu 20%, costurile rămân constante.
- Readiness: 8 criterii cu pondere egală, scor de completitudine. Nu reprezintă eligibilitate pentru finanțări.
- Scor organic = vizualizări + 5 × salvări unice + 20 × match-uri confirmate. Perioadă demo fixă: 19–25 octombrie 2026. Datele seed sunt fictive. O vizualizare locală se numără o dată per proiect.
- Boost nu modifică scorul organic. Start: 19 EUR / 24 h; Growth: 49 EUR / 7 zile; Spotlight: 89 EUR / 7 zile și prioritate în zona sponsorizată. Expirarea se calculează din timestampuri reale.

## Persistență și limite

Datele sunt salvate în localStorage sub `buildit-demo-v1`. Sunt specifice browserului și originii, fără sincronizare între dispozitive sau utilizatori. Ștergerea datelor browserului le elimină. Nu există autentificare reală, AI extern, plăți, investiții reale sau mesagerie internă.

Încarcarea documentelor este simulată: se păstrează doar numele fișierelor; conținutul lor nu este încărcat sau stocat. Previzualizările arată documente fictive construite din datele proiectului. Originalul și ediția Marketplace au reguli separate de acces. Browserul conține toate datele demo: verificările din interfață nu oferă confidențialitate reală. Folosiți exclusiv date fictive.

Aceasta este o aplicație React optimizată mobil, nu un APK și nu o PWA offline instalabilă. Interfața este în română. Baza de localizare există, dar unele texte sunt încă în componente și trebuie extrase înainte de o traducere completă în engleză. Preferințele investitorului folosesc o singură industrie și un singur stadiu; recomandările utilizează industria, stadiul și bugetul. Câmpurile de locație și obiective sunt păstrate în profil, dar nu filtrează recomandările automat. Configurarea inițială reutilizează formularul de profil și poate fi omisă.

Formularele numerice permit zero pentru proiecte timpurii. Setul demo oferă informație structurată pentru toate proiectele; cifrele nu sunt verificate extern. Acțiunile unor module sunt coordonate de componenta principală; pentru un produs de producție se recomandă extragerea pe servicii și module mai mici.

## Pentru un produs real

Ar fi necesare API/backend, autentificare reală, autorizare pe server, bază de date, storage privat, linkuri semnate pentru documente, procesator de plăți cu webhook-uri validate, audit, validări server, politici de confidențialitate și consimțământ, monitorizare, testare browser/dispozitive și integrare AI explicită dacă este dorită. Niciunul dintre acestea nu este pretins ca implementat.

## Publicare independentă

- **Netlify**: importați directorul sursă, build `npm run build`, output `dist`; alternativ încărcați `dist` în interfața de deploy.
- **Vercel**: importați sursa, preset Vite, build `npm run build`, output `dist`.
- Orice server static HTTPS poate servi `dist`. Rutele sunt după `#`, deci nu sunt necesare reguli speciale de rescriere. Nu folosiți o adresă temporară de dezvoltare pentru prezentare.
- Site-ul livrat prin Sites utilizează același build static. Configurarea sa este separată în `.openai/hosting.json` și nu este necesară la Netlify/Vercel.

Consultați `TEST-REPORT.md` pentru rezultatele executate și limitele verificării.

## Match Creator ↔ Creator

În contul Creator, Match include „Descoperă creatori” și „Solicitări”. Alege Parteneriat sau Fuziune și un proiect propriu publicat cu preferința corespunzătoare activată. Sunt afișate numai proiecte publicate ale altor creatori, deschise la același tip de colaborare. Solicitările sunt independente de matching-ul cu investitorii; acesta rămâne accesibil prin „Vezi solicitările investitorilor”.

După trimitere, solicitarea rămâne în așteptare. Folosește „Demo: vezi solicitarea ca destinatar” pentru a demonstra acceptarea sau refuzul. Această schimbare de perspectivă este explicit demonstrativă și afectează doar secțiunea Match între creatori. La acceptare sunt afișate contactele fictive permise. Nu reprezintă o fuziune efectuată sau un acord juridic. Datele vechi sunt păstrate: noua listă de solicitări se inițializează la prima utilizare, fără resetarea progresului.
