// Verificarea permisiunilor efective între DOUĂ conturi reale, pe proiectul de dezvoltare
// buildit-dev. Folosește doar cheia publishable (aceleași drepturi ca aplicația din browser);
// nu folosește service_role și nu modifică setările proiectului.
//
// Păstrarea datelor:
//  * Încercările de modificare a datelor celuilalt cont folosesc valori identice cu cele
//    existente (sau filtre care nu pot schimba nimic): dacă o regulă ar fi greșită, testul
//    detectează că operațiunea a fost permisă, fără ca datele să se schimbe.
//  * Înainte de teste se salvează în memorie profilul, datele private, rolurile și fotografia
//    fiecărui cont; la final (și la orice eroare) se compară și, dacă e nevoie, se restaurează.
//  * Singura urmă normală: câmpul updated_at al profilurilor se actualizează la testul
//    „proprietarul își poate modifica profilul” (salvare fără schimbarea valorilor).
//  * Nu activează roluri și nu creează conturi.
//
// Rezultatele nu conțin emailuri, identificatori, parole sau date din profil.
// Rulare: GitHub Actions (vezi .github/workflows/buildit-dev-permissions.yml) sau local:
//   npm run test:remote   (citește .env.local)
import {createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';

const env=process.env;
const need=['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY','BUILDIT_TEST_A_EMAIL','BUILDIT_TEST_A_PASSWORD','BUILDIT_TEST_B_EMAIL','BUILDIT_TEST_B_PASSWORD'];
const missing=need.filter(k=>!env[k]);
if(missing.length){console.error('Lipsesc variabilele: '+missing.join(', '));process.exit(2)}
if(env.BUILDIT_TEST_TARGET!=='buildit-dev'){console.error('Setează BUILDIT_TEST_TARGET=buildit-dev pentru a confirma că rulezi pe proiectul de dezvoltare.');process.exit(2)}
const key=env.VITE_SUPABASE_PUBLISHABLE_KEY;
if(!key.startsWith('sb_publishable_')){console.error('Folosește cheia publishable (sb_publishable_…). Cheile secrete nu sunt acceptate.');process.exit(2)}

const BUCKET='avatars';
const PROFILE_COLS=['display_name','avatar_path','bio','city','company','industries','objectives'];
const PRIVATE_COLS=['link','show_email_after_match','show_link_after_match','investor_min_budget','investor_max_budget','investor_stage'];
const TINY_JPEG=Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==','base64');
const opts={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const client=()=>createClient(env.VITE_SUPABASE_URL,key,opts);
const sha=buf=>createHash('sha256').update(buf).digest('hex');
const photoPath=id=>`${id}/avatar.jpg`;

// ---------------------------------------------------------------------------
// Raportare fără date personale
const results=[];
class Fail extends Error{}
const fail=why=>{throw new Fail(why)};
async function check(name,fn){
 try{const note=await fn();results.push({status:note==='omis'?'omis':'ok',name})}
 catch(e){results.push({status:'FAIL',name,why:e instanceof Fail?e.message:'eroare neașteptată ('+(e?.code||e?.name||'necunoscută')+')'})}
}
const codeOf=e=>String(e?.code??e?.statusCode??e?.status??'');
/** Operațiunea trebuie refuzată: eroare sau 0 rânduri afectate. */
function mustBeDenied(r){if(r.error)return;if(Array.isArray(r.data)&&r.data.length===0)return;fail('operațiunea a fost PERMISĂ')}
function mustSucceed(r,rows){if(r.error)fail('refuzată (cod '+codeOf(r.error)+')');if(rows!==undefined&&(r.data?.length??0)!==rows)fail(`rânduri afectate: ${r.data?.length??0}, așteptat ${rows}`)}

// ---------------------------------------------------------------------------
// Autentificare
async function signIn(label){
 const c=client();
 const {data,error}=await c.auth.signInWithPassword({email:env[`BUILDIT_TEST_${label}_EMAIL`],password:env[`BUILDIT_TEST_${label}_PASSWORD`]});
 if(error){console.error(`Autentificarea contului ${label} a eșuat (cod ${error.code||error.status}). Verifică datele de acces și dacă proiectul nu este pus pe pauză.`);process.exit(2)}
 return {label,c,id:data.user.id};
}
const A=await signIn('A'),B=await signIn('B'),anon=client();
if(A.id===B.id){console.error('A și B trebuie să fie conturi diferite.');process.exit(2)}

// ---------------------------------------------------------------------------
// Copie de siguranță (în memorie), citită de fiecare proprietar
async function readPhoto(u,path){
 const {data,error}=await u.c.storage.from(BUCKET).download(path);
 if(error)return null;
 const buf=Buffer.from(await data.arrayBuffer());
 return buf.length?{buf,type:data.type||'image/jpeg',hash:sha(buf)}:null;
}
async function snapshot(u){
 const p=await u.c.from('profiles').select(PROFILE_COLS.join(',')).eq('id',u.id).maybeSingle();
 const v=await u.c.from('profiles_private').select(PRIVATE_COLS.join(',')).eq('id',u.id).maybeSingle();
 const r=await u.c.from('profile_roles').select('role').eq('user_id',u.id);
 if(p.error||v.error||r.error||!p.data||!v.data)return null;
 return {profile:p.data,priv:v.data,roles:r.data.map(x=>x.role).sort(),photo:await readPhoto(u,photoPath(u.id))};
}
const initial={A:await snapshot(A),B:await snapshot(B)};
for(const u of [A,B])if(!initial[u.label]){console.error(`Nu am putut citi profilul contului ${u.label}. Intră o dată în aplicație cu acest cont și completează profilul. Nu am rulat niciun test.`);process.exit(2)}
const other=u=>u===A?B:A;

async function restore(u){
 const init=initial[u.label],now=await snapshot(u),actions=[];
 if(!now)return ['profilul nu a putut fi recitit'];
 const diff=(a,b,cols)=>Object.fromEntries(cols.filter(k=>a[k]!==b[k]).map(k=>[k,a[k]]));
 const p=diff(init.profile,now.profile,PROFILE_COLS);
 if(Object.keys(p).length){await u.c.from('profiles').update(p).eq('id',u.id);actions.push('profil')}
 const v=diff(init.priv,now.priv,PRIVATE_COLS);
 if(Object.keys(v).length){await u.c.from('profiles_private').update(v).eq('id',u.id);actions.push('date private')}
 for(const role of init.roles.filter(r=>!now.roles.includes(r))){await u.c.from('profile_roles').insert({user_id:u.id,role});actions.push('rol')}
 if(init.photo&&now.photo?.hash!==init.photo.hash){await u.c.storage.from(BUCKET).upload(photoPath(u.id),init.photo.buf,{contentType:init.photo.type,upsert:true});actions.push('fotografie')}
 if(!init.photo&&now.photo){await u.c.storage.from(BUCKET).remove([photoPath(u.id)]);actions.push('fotografie temporară')}
 return actions;
}
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
async function unchanged(u){
 const init=initial[u.label],now=await snapshot(u);
 return !!now&&same(init.profile,now.profile)&&same(init.priv,now.priv)&&same(init.roles,now.roles)&&(init.photo?.hash??null)===(now.photo?.hash??null);
}

// ---------------------------------------------------------------------------
async function run(){
 // 1. Vizitator neautentificat
 await check('vizitator: nu poate citi profiluri',async()=>mustBeDenied(await anon.from('profiles').select('id')));
 await check('vizitator: nu poate citi date private',async()=>mustBeDenied(await anon.from('profiles_private').select('id')));
 await check('vizitator: nu poate citi roluri',async()=>mustBeDenied(await anon.from('profile_roles').select('role')));
 await check('vizitator: nu poate apela complete_profile',async()=>{if(!(await anon.rpc('complete_profile',{p_display_name:'Test',p_role:'creator'})).error)fail('operațiunea a fost PERMISĂ')});
 await check('vizitator: nu poate lista fotografiile',async()=>mustBeDenied(await anon.storage.from(BUCKET).list('')));
 for(const u of [A,B]){
  await check(`vizitator: nu poate obține link pentru fotografia lui ${u.label}`,async()=>{if(!initial[u.label].photo)return 'omis';if(!(await anon.storage.from(BUCKET).createSignedUrl(photoPath(u.id),60)).error)fail('operațiunea a fost PERMISĂ')});
  await check(`vizitator: fotografia lui ${u.label} nu este publică`,async()=>{if(!initial[u.label].photo)return 'omis';const {data}=anon.storage.from(BUCKET).getPublicUrl(photoPath(u.id));if((await fetch(data.publicUrl)).status===200)fail('fotografia este accesibilă public')});
 }

 // 2. Fiecare cont față de celălalt
 for(const me of [A,B]){
  const you=other(me),tag=`${me.label}→${you.label}`,yourInit=initial[you.label];
  await check(`${tag}: vede profilul public, fără email`,async()=>{const r=await me.c.from('profiles').select('*').eq('id',you.id);mustSucceed(r,1);if(Object.keys(r.data[0]).some(k=>k.includes('email')))fail('profilul conține un câmp email')});
  await check(`${tag}: vede rolurile publice`,async()=>{const r=await me.c.from('profile_roles').select('role').eq('user_id',you.id);mustSucceed(r);if(!same(r.data.map(x=>x.role).sort(),yourInit.roles))fail('rolurile vizibile diferă')});
  await check(`${tag}: NU vede datele private`,async()=>{const r=await me.c.from('profiles_private').select('link').eq('id',you.id);if(r.error)return;if(r.data.length)fail('datele private sunt vizibile')});
  await check(`${tag}: vede fotografia prin link temporar`,async()=>{if(!yourInit.photo)return 'omis';const s=await me.c.storage.from(BUCKET).createSignedUrl(photoPath(you.id),60);if(s.error)fail('link refuzat (cod '+codeOf(s.error)+')');if((await fetch(s.data.signedUrl)).status!==200)fail('fotografia nu poate fi descărcată')});
  // Încercări de modificare, fără efect chiar dacă ar fi permise (aceleași valori)
  await check(`${tag}: NU poate modifica profilul`,async()=>mustBeDenied(await me.c.from('profiles').update({bio:yourInit.profile.bio}).eq('id',you.id).select('id')));
  await check(`${tag}: NU poate modifica datele private`,async()=>{
   for(const val of [true,false])mustBeDenied(await me.c.from('profiles_private').update({show_email_after_match:val}).eq('id',you.id).eq('show_email_after_match',val).select('id'));
  });
  await check(`${tag}: NU poate adăuga roluri celuilalt cont`,async()=>{
   const r=await me.c.from('profile_roles').insert({user_id:you.id,role:yourInit.roles[0]});
   if(!r.error)fail('operațiunea a fost PERMISĂ');
   if(codeOf(r.error)==='23505')fail('regula de acces nu a oprit cererea (a ajuns la verificarea de duplicat)');
  });
  await check(`${tag}: NU poate șterge rolurile`,async()=>mustBeDenied(await me.c.from('profile_roles').delete().eq('user_id',you.id).select('role')));
  await check(`${tag}: NU poate scrie în folderul de fotografii`,async()=>{
   const body=yourInit.photo?yourInit.photo.buf:TINY_JPEG;
   const r=await me.c.storage.from(BUCKET).upload(photoPath(you.id),body,{contentType:'image/jpeg',upsert:!!yourInit.photo});
   if(!r.error)fail('operațiunea a fost PERMISĂ');
  });
  await check(`${tag}: NU poate șterge fotografia`,async()=>{if(!yourInit.photo)return 'omis';const r=await me.c.storage.from(BUCKET).remove([photoPath(you.id)]);if(!r.error&&r.data?.length)fail('fotografia a fost ștearsă (va fi restaurată)')});
  await check(`${me.label}: NU își poate seta fotografia celuilalt cont`,async()=>{if(!(await me.c.from('profiles').update({avatar_path:photoPath(you.id)}).eq('id',me.id)).error)fail('operațiunea a fost PERMISĂ')});
 }

 // 3. Roluri nepermise și operațiile proprietarului
 for(const me of [A,B]){
  const init=initial[me.label];
  for(const role of ['admin','verified_investor','service_role'])
   await check(`${me.label}: NU își poate atribui rolul „${role}”`,async()=>{if(!(await me.c.from('profile_roles').insert({user_id:me.id,role})).error)fail('operațiunea a fost PERMISĂ')});
  await check(`${me.label}: NU poate crea un al doilea profil`,async()=>{if(!(await me.c.rpc('complete_profile',{p_display_name:'Al doilea profil',p_role:'creator'})).error)fail('operațiunea a fost PERMISĂ')});
  await check(`${me.label}: vede doar propriile date private`,async()=>{const r=await me.c.from('profiles_private').select('link');mustSucceed(r,1)});
  await check(`${me.label}: își poate salva profilul`,async()=>mustSucceed(await me.c.from('profiles').update({bio:init.profile.bio}).eq('id',me.id).select('id'),1));
  await check(`${me.label}: își poate salva datele private`,async()=>mustSucceed(await me.c.from('profiles_private').update({link:init.priv.link}).eq('id',me.id).select('id'),1));
  await check(`${me.label}: regula permite adăugarea rolurilor proprii (verificat fără activare)`,async()=>{
   const r=await me.c.from('profile_roles').insert({user_id:me.id,role:init.roles[0]});
   if(!r.error)fail('rolul a fost adăugat de două ori');
   if(codeOf(r.error)!=='23505')fail('cererea a fost oprită de regula de acces (cod '+codeOf(r.error)+')');
  });
  await check(`${me.label}: își poate încărca propria fotografie`,async()=>{
   const body=init.photo?init.photo.buf:TINY_JPEG,type=init.photo?init.photo.type:'image/jpeg';
   mustSucceed(await me.c.storage.from(BUCKET).upload(photoPath(me.id),body,{contentType:type,upsert:true}));
   const after=await readPhoto(me,photoPath(me.id));
   if(after?.hash!==sha(body))fail('fotografia încărcată nu corespunde');
   if(!init.photo)await me.c.storage.from(BUCKET).remove([photoPath(me.id)]);
  });
  await check(`${me.label}: bucket-ul refuză alte tipuri de fișiere`,async()=>{if(!(await me.c.storage.from(BUCKET).upload(photoPath(me.id),Buffer.from('test'),{contentType:'text/html',upsert:true})).error)fail('fișierul a fost acceptat (va fi restaurat)')});
  await check(`${me.label}: bucket-ul refuză fișiere peste 1 MB`,async()=>{if(!(await me.c.storage.from(BUCKET).upload(photoPath(me.id),Buffer.concat([TINY_JPEG,Buffer.alloc(1100*1024)]),{contentType:'image/jpeg',upsert:true})).error)fail('fișierul a fost acceptat (va fi restaurat)')});
 }
}

let restored={A:[],B:[]};
try{await run()}
finally{
 for(const u of [A,B])restored[u.label]=await restore(u).catch(()=>['restaurarea a eșuat']);
 for(const u of [A,B])await check(`${u.label}: profilul, datele private, rolurile și fotografia au rămas neschimbate`,async()=>{if(!(await unchanged(u)))fail('starea finală diferă de cea inițială')});
 // scope local: închide doar sesiunile acestui script, nu și pe cele din browser sau telefon
 await Promise.all([A.c.auth.signOut({scope:'local'}),B.c.auth.signOut({scope:'local'})]);
}

for(const r of results)console.log(`${r.status.padEnd(4)} ${r.name}${r.why?' — '+r.why:''}`);
for(const u of ['A','B'])if(restored[u].length)console.log(`Atenție: pentru contul ${u} a fost necesară restaurarea (${restored[u].join(', ')}).`);
const failed=results.filter(r=>r.status==='FAIL').length,skipped=results.filter(r=>r.status==='omis').length;
console.log(`\nRezultat pe buildit-dev: ${results.length-failed-skipped} trecute, ${failed} eșuate, ${skipped} omise (cont fără fotografie).`);
process.exit(failed?1:0);
