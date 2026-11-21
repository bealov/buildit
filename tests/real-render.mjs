// Randare server a ecranelor pentru conturi reale, cu date simulate (fără Supabase).
import {build} from 'esbuild';import {renderToString} from 'react-dom/server';import React from 'react';import assert from 'node:assert/strict';
await build({entryPoints:['src/real/RealApp.tsx'],bundle:true,platform:'node',format:'esm',packages:'external',loader:{'.css':'empty'},outfile:'tests/.render-real.mjs'});
const {AuthScreens,AccountView}=await import('./.render-real.mjs');
const store=new Map();globalThis.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
globalThis.window={localStorage:globalThis.localStorage};globalThis.location={hash:'#home',search:'',pathname:'/'};
const html=el=>renderToString(el).replaceAll('<!-- -->','');
const noop=()=>{},auth={},api={};
const DEMO_NAMES=['Alex Marin','Mara Ionescu','Ritmo','Verde Atelier','Cont demo','Demo ·'];
let checks=0;const has=(h,t,label)=>{assert.ok(h.includes(t),`${label}: lipsește „${t}”`);checks++};const lacks=(h,t,label)=>{assert.ok(!h.includes(t),`${label}: nu trebuia „${t}”`);checks++};

for(const [view,terms] of Object.entries({login:['Bine ai','Intră în cont','Ai uitat parola?','Creează unul','Înapoi la modul demo'],signup:['Creează-ți','Rol inițial','Creator','Investitor','nu înseamnă investitor verificat','nu sunt importate','new-password'],forgot:['Trimite linkul de resetare'],sent:['Verifică-ți','Retrimite emailul de confirmare']})){
 const h=html(React.createElement(AuthScreens,{auth,banner:null,openDemo:noop,initial:view}));
 for(const t of terms)has(h,t,view);for(const t of DEMO_NAMES)lacks(h,t,view);
 if(view==='signup')lacks(h,'aria-checked="true"','niciun rol preselectat');
}

const user={id:'A',email:'ana@test.invalid'};
const profile={id:'A',display_name:'Ana Pop',avatar_path:null,bio:'Fondatoare',city:'Cluj',company:'Atelier',industries:'',objectives:'',updated_at:''};
const priv={link:'',show_email_after_match:false,show_link_after_match:false,investor_min_budget:null,investor_max_budget:null,investor_stage:''};
const view=(route,roles,extra={})=>{location.hash='#'+route;return html(React.createElement(AccountView,{user,deps:{auth,account:api,people:{}},route,nav:noop,openDemo:noop,recovery:false,endRecovery:noop,banner:null,clearBanner:noop,signOut:noop,account:{profile,priv,roles},status:'ready',reload:async()=>{},...extra}))};

for(const roles of [['creator'],['investor'],['creator','investor']]){
 const label=roles.join('+');
 for(const route of ['home','profile','settings','projects','explore','match','market','ranking','necunoscut']){
  const h=view(route,roles);assert.ok(h.length>500,route);lacks(h,'NaN',route);for(const t of DEMO_NAMES)lacks(h,t,`${label}/${route}`);has(h,'Cont real',`${label}/${route}`);
 }
 const p=view('profile',roles);
 if(roles.length===2){has(p,'Mod Creator',label);has(p,'Mod Investitor',label);has(p,'identitatea ta și proprietatea asupra datelor rămân aceleași',label);lacks(p,'Activează rolul',label)}
 else{lacks(p,'Mod Creator',label);lacks(p,'Mod Investitor',label);has(p,`Activează rolul ${roles[0]==='creator'?'Investitor':'Creator'}`,label)}
 has(p,'Rolul Investitor nu înseamnă investitor verificat',label);
 const s=view('settings',roles);has(s,'Date private',label);has(s,'ana@test.invalid',label);has(s,'readOnly',label);
 (roles.includes('investor')?has:lacks)(s,'Buget minim',label);
 const nav=view('home',roles);has(nav,roles[0]==='investor'&&roles.length===1?'Explore':'Proiecte',`${label} navigare`);
}
const market=view('market',['creator']);has(market,'independent de Match',  'market');has(market,'fără un proiect publicat','market');has(market,'Explorează în modul demo','market');
const match=view('match',['investor']);has(match,'Nu vei putea face Match cu propriile proiecte','match');
const ranking=view('ranking',['creator']);has(ranking,'separat de promovarea sponsorizată','ranking');
// Setări: contactul este ascuns implicit (comutatoare nebifate)
const settings=view('settings',['creator']);assert.equal((settings.match(/type="checkbox" checked=""/g)||[]).length,0,'contact ascuns implicit');checks++;
// Cont fără profil: flux de completare, fără nume sau rol inventat
const incomplete=view('home',['creator'],{account:{profile:null,priv:null,roles:[]}});has(incomplete,'COMPLETEAZĂ PROFILUL','fără profil');has(incomplete,'Creează profilul','fără profil');lacks(incomplete,'aria-checked="true"','fără profil');lacks(incomplete,'bottom-nav','fără profil');
// Încărcare și eroare
has(view('home',['creator'],{status:'loading',account:null}),'Se încarcă profilul','încărcare');
has(view('home',['creator'],{status:'error',account:null}),'Profilul nu a putut fi încărcat','eroare');
{const h=view('home',['creator'],{status:'error',account:null,loadError:{code:'rețea',hint:'Serverul nu răspunde.'}});has(h,'Cod tehnic: rețea','eroare cu cod');has(h,'Serverul nu răspunde.','eroare cu cod')}
// Resetarea parolei are prioritate
has(view('home',['creator'],{recovery:true}),'Alege o','recuperare');
// Preferința de mod a altui cont nu este folosită
store.set('buildit-real-mode',JSON.stringify({userId:'B',role:'investor'}));has(view('profile',['creator','investor']),'aria-selected="true" class="active">Mod Creator','preferința altui cont ignorată');
store.set('buildit-real-mode',JSON.stringify({userId:'A',role:'investor'}));has(view('profile',['creator','investor']),'aria-selected="true" class="active">Mod Investitor','preferința proprie aplicată');

// Profil Creator: cum vrea utilizatorul să participe
for(const roles of [['creator'],['investor'],['creator','investor']]){
 const label='participare '+roles.join('+'),st=view('settings',roles),pr=view('profile',roles);
 (roles.includes('creator')?has:lacks)(st,'Cum vrei să participi?',label);
 if(roles.includes('creator')){has(st,'Dezvoltă un proiect sau contribuie la unul.',label);has(st,'Dezvolt un proiect',label);has(st,'Vreau să mă alătur unui proiect',label);lacks(st,'Rol dorit',label+' (alăturare nebifată: detalii ascunse)')}
 lacks(pr,'Vrea să se alăture',label+' (profil existent fără intenții)');
}
const joined={...profile,wants_to_join:true,wants_to_develop:true,skills:['Marketing','Analiză de date'],desired_roles:['cofondator'],weekly_hours:20};
const js=view('settings',['creator'],{account:{profile:joined,priv,roles:['creator']}});
for(const t of ['Competențe','Rol dorit','Disponibilitate (ore pe săptămână)','Analiză de date','value="20"','nu oferă automat un statut sau drepturi speciale','aria-pressed="true" class="active">Marketing','aria-pressed="false" class="">Design'])has(js,t,'alăturare bifată');
assert.equal((js.match(/type="checkbox" checked=""/g)||[]).length,2,'ambele intenții bifate');checks++;
const jp=view('profile',['creator'],{account:{profile:joined,priv,roles:['creator']}});
for(const t of ['Dezvoltă un proiect','Vrea să se alăture unui proiect','Marketing · Analiză de date','Cofondator','20 de ore pe săptămână'])has(jp,t,'profil cu participare');
const hidden=view('profile',['creator'],{account:{profile:{...joined,wants_to_join:false},priv,roles:['creator']}});has(hidden,'Dezvoltă un proiect','alăturare debifată');lacks(hidden,'Analiză de date','alăturare debifată: detaliile păstrate, dar ascunse');
lacks(view('profile',['investor'],{account:{profile:joined,priv,roles:['investor']}}),'Cum vrei','investitor');
has(view('home',['creator'],{account:{profile:null,priv:null,roles:[]}}),'Creator: dezvoltă un proiect sau contribuie la unul.','alegerea rolului');


// ---------------------------------------------------------------------------
// Match · Descoperă oameni (date simulate)
await build({entryPoints:['src/real/DiscoverPeople.tsx'],bundle:true,platform:'node',format:'esm',packages:'external',loader:{'.css':'empty'},outfile:'tests/.render-people.mjs'});
const {PeopleView,PersonProfileView}=await import('./.render-people.mjs');
const emptyF={skill:'',role:'',minHours:'',includeUnknown:false};
const pv=(extra={})=>html(React.createElement(PeopleView,{filters:emptyF,onFilters:noop,onReset:noop,filterError:null,active:false,status:'ready',error:null,people:[],hasMore:false,more:'idle',onMore:noop,onRetry:noop,onOpen:noop,...extra}));
const NO_ACTIONS=['Invită','Trimite','Mesaj','Like','Apreciază','Trimite cerere','swipe-actions','match-action','@','Email cont','Link adițional'];
const completeP={id:'b',display_name:'Bogdan Pop',avatar_path:'b/avatar.jpg',avatarUrl:'https://signed/b',bio:'',city:'Iași',skills:['Programare','Design','Marketing','Vânzări','Finanțe','Analiză','UX','Extra'],desired_roles:['cofondator','team_leader'],weekly_hours:20,wants_to_develop:true,created_at:'x'};
const incompleteP={id:'c',display_name:'Cora Nou',avatar_path:null,bio:'',city:'',skills:[],desired_roles:[],weekly_hours:null,wants_to_develop:false,created_at:'x'};
{const h=pv({people:[completeP,incompleteP]});
 for(const t of ['Descoperă oameni','MATCH · ÎNTRE CREATORI','Nu ai nevoie de un proiect propriu','Competență','Rol dorit','Minimum ore/săptămână','Câmpul gol înseamnă fără limită','nu este considerată 0','Bogdan Pop','Programare','+2','Cofondator · Team leader','20 de ore / săptămână','Dezvoltă și un proiect','Iași','https://signed/b','Cora Nou','Necompletate','Necompletat','Necompletată','Vrea să se alăture unui proiect','Vezi profilul','2 persoane','Emailul și datele private nu sunt afișate'])has(h,t,'listă');
 for(const t of NO_ACTIONS)lacks(h,t,'listă: fără acțiuni nefuncționale sau date private');
 assert.equal((h.match(/Vezi profilul/g)||[]).length,2,'un buton „Vezi profilul” pe card');checks++;
 assert.ok(!h.includes('0 ore'),'orele necompletate nu apar ca 0');checks++;
 lacks(h,'Resetează filtrele','fără filtre active nu apare resetarea');
 lacks(h,'Include și persoanele fără disponibilitate','bifa apare doar cu un minim de ore');}
has(pv({status:'loading'}),'Se caută persoane','încărcare');
{const h=pv({status:'error',error:{code:'rețea',hint:'Serverul nu răspunde.'}});has(h,'Lista nu a putut fi încărcată','eroare');has(h,'Cod tehnic: rețea','eroare');has(h,'Încearcă din nou','eroare');}
{const h=pv();has(h,'Încă nu există alți creatori care vor să se alăture','gol');has(h,'Vreau să mă alătur unui proiect','gol');lacks(h,'Resetează filtrele','gol fără filtre');lacks(h,'Bogdan','gol: fără profiluri fictive');}
{const f={...emptyF,skill:'xyz',minHours:'10'};const h=pv({filters:f,active:true});has(h,'Nicio persoană nu corespunde filtrelor','fără rezultate');has(h,'Resetează filtrele','fără rezultate');has(h,'Include și persoanele fără disponibilitate completată','bifă cu minim de ore');}
has(pv({filters:{...emptyF,minHours:'0'},filterError:'Minimum ore/săptămână: scrie un număr întreg între 1 și 168 sau lasă câmpul gol.'}),'între 1 și 168','filtru invalid');
{const h=pv({people:[completeP],hasMore:true});has(h,'Arată mai multe','paginare');has(h,'1+ persoană','paginare');}
has(pv({people:[completeP],hasMore:true,more:'error'}),'Nu am putut încărca restul listei','paginare eroare');
// Profil public
{const person={...completeP,company:'Atelier',industries:'IT & Tech',objectives:'Echipă mică',wants_to_join:true,roles:['creator','investor']};
 const h=html(React.createElement(PersonProfileView,{state:{status:'ready',person},onRetry:noop,back:noop}));
 for(const t of ['Bogdan Pop','Creator','Investitor','Dezvoltă un proiect','Vrea să se alăture unui proiect','Programare','Extra','Cofondator','20 de ore','Atelier','IT &amp; Tech','Echipă mică','Contactul nu este afișat','Înapoi la Descoperă oameni'])has(h,t,'profil public');
 for(const t of NO_ACTIONS)lacks(h,t,'profil public: fără acțiuni nefuncționale sau date private');
 const inc=html(React.createElement(PersonProfileView,{state:{status:'ready',person:{...incompleteP,company:'',industries:'',objectives:'',wants_to_join:true,roles:['creator']}},onRetry:noop,back:noop}));
 has(inc,'nu a adăugat încă o descriere','profil incomplet');has(inc,'Necompletată','profil incomplet');lacks(inc,'0 ore','profil incomplet');
 has(html(React.createElement(PersonProfileView,{state:{status:'missing'},onRetry:noop,back:noop})),'nu mai este disponibil','profil inexistent');
 has(html(React.createElement(PersonProfileView,{state:{status:'error',error:{code:'42501',hint:'Accesul a fost refuzat'}},onRetry:noop,back:noop})),'Cod tehnic: 42501','profil eroare');}
// Integrare în cont: Creator vs Investitor
store.set('buildit-real-mode',JSON.stringify({userId:'A',role:'creator'}));
{const h=view('match',['creator']);has(h,'Descoperă oameni','Creator → Match');has(h,'Se caută persoane','Creator → Match (încărcare)');lacks(h,'Match-ul pentru conturile reale este în pregătire','Creator → Match');}
{const h=view('match',['creator','investor']);has(h,'Descoperă oameni','ambele roluri, mod Creator');}
store.set('buildit-real-mode',JSON.stringify({userId:'A',role:'investor'}));
{const h=view('match',['creator','investor']);has(h,'Match-ul pentru conturile reale este în pregătire','mod Investitor neschimbat');lacks(h,'Descoperă oameni','mod Investitor neschimbat');}
{const h=view('match',['investor']);has(h,'Match-ul pentru conturile reale este în pregătire','doar Investitor neschimbat');lacks(h,'Descoperă oameni','doar Investitor');}
store.delete('buildit-real-mode');
has(view('home',['creator']),'Descoperă oameni','acasă: acces rapid în modul Creator');
has(view('people/b',['creator']),'Se încarcă profilul','profil public în cont');
console.log(`${checks} verificări de randare pentru conturile reale (date simulate, fără Supabase).`);
