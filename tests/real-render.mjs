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
const view=(route,roles,extra={})=>{location.hash='#'+route;return html(React.createElement(AccountView,{user,deps:{auth,account:api},route,nav:noop,openDemo:noop,recovery:false,endRecovery:noop,banner:null,clearBanner:noop,signOut:noop,account:{profile,priv,roles},status:'ready',reload:async()=>{},...extra}))};

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
// Resetarea parolei are prioritate
has(view('home',['creator'],{recovery:true}),'Alege o','recuperare');
// Preferința de mod a altui cont nu este folosită
store.set('buildit-real-mode',JSON.stringify({userId:'B',role:'investor'}));has(view('profile',['creator','investor']),'aria-selected="true" class="active">Mod Creator','preferința altui cont ignorată');
store.set('buildit-real-mode',JSON.stringify({userId:'A',role:'investor'}));has(view('profile',['creator','investor']),'aria-selected="true" class="active">Mod Investitor','preferința proprie aplicată');

console.log(`${checks} verificări de randare pentru conturile reale (date simulate, fără Supabase).`);
