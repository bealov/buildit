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
