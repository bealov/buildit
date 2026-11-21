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
// Necesită ambele migrări aplicate (inclusiv 20261115000000_creator_participation.sql).
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
const PARTICIPATION_COLS=['wants_to_develop','wants_to_join','skills','desired_roles','weekly_hours'];
const PROFILE_COLS=['display_name','avatar_path','bio','city','company','industries','objectives',...PARTICIPATION_COLS];
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
{const probe=await A.c.from('profiles').select(PARTICIPATION_COLS.join(',')).limit(1);if(probe.error){console.error(`Coloanele de participare lipsesc (cod ${codeOf(probe.error)}). Aplică întâi migrarea 20261115000000_creator_participation.sql pe buildit-dev. Nu am rulat niciun test.`);process.exit(2)}}

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
 const diff=(a,b,cols)=>Object.fromEntries(cols.filter(k=>!same(a[k],b[k])).map(k=>[k,a[k]]));
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
  await check(`${tag}: NU poate modifica intențiile și competențele`,async()=>{const v=yourInit.profile;mustBeDenied(await me.c.from('profiles').update({wants_to_develop:v.wants_to_develop,wants_to_join:v.wants_to_join,skills:v.skills,desired_roles:v.desired_roles,weekly_hours:v.weekly_hours}).eq('id',you.id).select('id'))});
  await check(`${me.label}: NU își poate seta fotografia celuilalt cont`,async()=>{if(!(await me.c.from('profiles').update({avatar_path:photoPath(you.id)}).eq('id',me.id)).error)fail('operațiunea a fost PERMISĂ')});
 }

 // 2b. Match · Descoperă oameni — DOAR CITIRE (nu modifică profiluri, roluri sau fotografii)
 const PUBLIC_KEYS=['id','display_name','avatar_path','bio','city','skills','desired_roles','weekly_hours','wants_to_develop','created_at'];
 const discoverable=u=>!!initial[u.label].profile.wants_to_join&&initial[u.label].roles.includes('creator');
 const ids=r=>(r.data??[]).map(x=>x.id);
 await check('vizitator: nu poate apela discover_people',async()=>{if(!(await anon.rpc('discover_people',{})).error)fail('operațiunea a fost PERMISĂ')});
 for(const me of [A,B]){
  const you=other(me),yi=initial[you.label].profile,tag=`${me.label}→${you.label}`;let rows=null;
  const call=args=>me.c.rpc('discover_people',{p_limit:50,...args});
  await check(`${me.label}: discover_people răspunde (migrarea 20261121000000 este aplicată)`,async()=>{const r=await call({});if(r.error)fail(codeOf(r.error)==='PGRST202'?'funcția lipsește: aplică migrarea 20261121000000_discover_people.sql':'eroare (cod '+codeOf(r.error)+')');rows=r.data??[]});
  await check(`${me.label}: Descoperă oameni nu include propriul profil`,async()=>{if(!rows)fail('lista nu a fost încărcată');if(rows.some(r=>r.id===me.id))fail('propriul profil apare în listă')});
  await check(`${me.label}: rezultatele conțin doar câmpuri publice`,async()=>{if(!rows)fail('lista nu a fost încărcată');if(rows.some(r=>Object.keys(r).some(k=>!PUBLIC_KEYS.includes(k))))fail('un rezultat conține un câmp neașteptat')});
  await check(`${me.label}: rezultatele sunt doar Creatori care vor să se alăture`,async()=>{
   if(!rows)fail('lista nu a fost încărcată');if(!rows.length)return 'omis';
   const list=rows.map(r=>r.id);
   const p=await me.c.from('profiles').select('id,wants_to_join').in('id',list);const ro=await me.c.from('profile_roles').select('user_id').in('user_id',list).eq('role','creator');
   if(p.error||ro.error)fail('verificarea nu a putut citi profilurile');
   if(p.data.some(x=>!x.wants_to_join))fail('apare cineva care nu vrea să se alăture');
   if(list.some(id=>!ro.data.some(x=>x.user_id===id)))fail('apare cineva fără rolul Creator');
  });
  await check(`${me.label}: maximum 50 de rezultate pe pagină`,async()=>{const r=await me.c.rpc('discover_people',{p_limit:1000});if(r.error)fail('cod '+codeOf(r.error));if(r.data.length>50)fail('peste 50')});
  await check(`${me.label}: paginarea nu repetă persoane`,async()=>{
   const a=await call({p_limit:1});if(a.error)fail('cod '+codeOf(a.error));if(!a.data.length)return 'omis';
   const b=await call({p_limit:50,p_after_created_at:a.data[0].created_at,p_after_id:a.data[0].id});if(b.error)fail('cod '+codeOf(b.error));
   if(ids(b).includes(a.data[0].id))fail('aceeași persoană apare pe două pagini');
  });
  await check(`${tag}: ${you.label} apare doar dacă are rolul Creator și „Vreau să mă alătur”`,async()=>{if(!rows)fail('lista nu a fost încărcată');const seen=rows.some(r=>r.id===you.id);if(!seen&&rows.length>=50)return 'omis';if(seen!==discoverable(you))fail(seen?'apare deși nu ar trebui':'nu apare deși ar trebui')});
  await check(`${tag}: filtrul de competență găsește ${you.label} (fără diferență de majuscule)`,async()=>{if(!discoverable(you)||!yi.skills?.length)return 'omis';const r=await call({p_skill:yi.skills[0].toLocaleUpperCase('ro')});if(r.error||!ids(r).includes(you.id))fail('nu a fost găsit')});
  await check(`${tag}: filtrul de rol dorit`,async()=>{
   if(!discoverable(you)||!yi.desired_roles?.length)return 'omis';
   const yes=await call({p_role:yi.desired_roles[0]});if(yes.error||!ids(yes).includes(you.id))fail('nu a fost găsit cu rolul propriu');
   const otherRole=['cofondator','membru_echipa','manager_proiect','team_leader'].find(x=>!yi.desired_roles.includes(x));
   if(otherRole){const no=await call({p_role:otherRole});if(no.error||ids(no).includes(you.id))fail('apare la un rol pe care nu l-a ales')}
  });
  await check(`${tag}: filtrul de ore (necompletat ≠ 0)`,async()=>{
   if(!discoverable(you))return 'omis';const h=yi.weekly_hours;
   if(h==null){
    const no=await call({p_min_hours:1});if(no.error||ids(no).includes(you.id))fail('profilul fără ore apare la un minim de ore');
    const yes=await call({p_min_hours:1,p_include_unknown_hours:true});if(yes.error||!ids(yes).includes(you.id))fail('nu apare deși s-au inclus orele necompletate');
   }else{
    const yes=await call({p_min_hours:h});if(yes.error||!ids(yes).includes(you.id))fail('nu apare la minimul egal cu orele sale');
    if(h<168){const no=await call({p_min_hours:h+1});if(no.error||ids(no).includes(you.id))fail('apare peste orele declarate')}
   }
  });
 }

 // 2c. Proiecte reale — o singură ciornă TEMPORARĂ pentru contul A, identificată prin ID-ul creat
 //     în această rulare și ștearsă la final. Proiectele existente nu sunt modificate. Fără publicare.
 await check('vizitator: nu poate citi proiecte',async()=>mustBeDenied(await anon.from('projects').select('id')));
 await check('vizitator: nu poate salva proiecte',async()=>{if(!(await anon.rpc('save_project',{p_id:null,p_expected_updated_at:null,p_status:'draft',p_public:{title:'x'},p_private:{}})).error)fail('operațiunea a fost PERMISĂ')});
 await check('B: nu poate crea proiecte dacă nu are rolul Creator',async()=>{
  if(initial.B.roles.includes('creator'))return 'omis'; // B are rolul Creator: nu creăm proiecte pentru B
  const r=await B.c.rpc('save_project',{p_id:null,p_expected_updated_at:null,p_status:'draft',p_public:{title:'Test B'},p_private:{}});
  if(!r.error){const id=r.data?.[0]?.id;if(id)await B.c.from('projects').delete().eq('id',id);fail('operațiunea a fost PERMISĂ (ciorna a fost ștearsă)')}
 });
 const before=await A.c.from('projects').select('id',{count:'exact',head:true}).eq('owner_id',A.id);
 projectCountBefore=before.count;
 const canCreate=initial.A.roles.includes('creator')&&!before.error&&(before.count??0)<20;
 let pid=null,pts=null;
 const P=(name,fn)=>check(`proiecte: ${name}`,async()=>{if(!canCreate||(!pid&&!name.startsWith('A creează')))return 'omis';return fn()});
 await P('A creează o ciornă temporară incompletă (cu 0, „Nu am estimat încă” și necompletat)',async()=>{
  const r=await A.c.rpc('save_project',{p_id:null,p_expected_updated_at:null,p_status:'draft',p_public:{title:'Test automat — se șterge'},p_private:{monthly_revenue:'0',unknown_financials:['fixed_costs'],plan_links:['https://exemplu.invalid/plan']}});
  if(r.error)fail('cod '+codeOf(r.error));pid=r.data?.[0]?.id;pts=r.data?.[0]?.updated_at;tempProject.id=pid;if(!pid)fail('fără ID');
 });
 await P('A își citește ciorna și datele private; valorile rămân distincte',async()=>{
  const v=await A.c.from('project_private').select('monthly_revenue,fixed_costs,variable_costs,unknown_financials,plan_links').eq('project_id',pid).single();
  if(v.error)fail('cod '+codeOf(v.error));
  if(Number(v.data.monthly_revenue)!==0||v.data.fixed_costs!==null||!v.data.unknown_financials.includes('fixed_costs')||v.data.variable_costs!==null||v.data.plan_links.length!==1)fail('valorile diferă');
 });
 await P('B NU vede ciorna lui A',async()=>{const r=await B.c.from('projects').select('id').eq('id',pid);if(r.error)return;if(r.data.length)fail('ciorna este vizibilă')});
 await P('B NU vede datele private (finanțe, linkuri)',async()=>{const r=await B.c.from('project_private').select('project_id').eq('project_id',pid);if(r.error)return;if(r.data.length)fail('datele private sunt vizibile')});
 await P('B NU poate salva peste proiectul lui A',async()=>{if(!(await B.c.rpc('save_project',{p_id:pid,p_expected_updated_at:pts,p_status:'draft',p_public:{title:'furat'},p_private:{}})).error)fail('operațiunea a fost PERMISĂ')});
 await P('B NU poate schimba starea proiectului lui A',async()=>{if(!(await B.c.rpc('set_project_status',{p_id:pid,p_expected_updated_at:pts,p_status:'published'})).error)fail('operațiunea a fost PERMISĂ')});
 await P('B NU poate modifica sau șterge proiectul lui A',async()=>{mustBeDenied(await B.c.from('projects').update({title:'furat'}).eq('id',pid).select('id'));mustBeDenied(await B.c.from('projects').delete().eq('id',pid).select('id'))});
 await P('B NU poate modifica datele private ale lui A',async()=>mustBeDenied(await B.c.from('project_private').update({plan_links:[]}).eq('project_id',pid).select('project_id')));
 await P('A NU poate schimba proprietarul',async()=>{if(!(await A.c.from('projects').update({owner_id:B.id}).eq('id',pid)).error)fail('operațiunea a fost PERMISĂ')});
 await P('A NU poate scrie direct suma publică a investiției',async()=>{if(!(await A.c.from('projects').update({investment_public:1}).eq('id',pid)).error)fail('operațiunea a fost PERMISĂ')});
 await P('publicarea ciornei incomplete este respinsă (rămâne ciornă)',async()=>{
  const r=await A.c.rpc('set_project_status',{p_id:pid,p_expected_updated_at:pts,p_status:'published'});if(!r.error)fail('proiectul incomplet a fost publicat');
  const s=await A.c.from('projects').select('status').eq('id',pid).single();if(s.data?.status!=='draft')fail('starea s-a schimbat');
 });
 await P('salvarea cu o versiune veche este refuzată (editare simultană)',async()=>{const r=await A.c.rpc('save_project',{p_id:pid,p_expected_updated_at:'2000-01-01T00:00:00Z',p_status:'draft',p_public:{title:'veche'},p_private:{}});if(codeOf(r.error)!=='PT409')fail('cod '+codeOf(r.error))});
 await P('valori nepermise respinse (3 zecimale, link, stadiu, „ce caută”)',async()=>{
  for(const [pub,priv] of [[{title:'t'},{unit_price:'1.234'}],[{title:'t'},{plan_links:['javascript:alert(1)']}],[{title:'t',stage:'MVP'},{}],[{title:'t',looking_for:['admin']},{}]]){
   const r=await A.c.rpc('save_project',{p_id:pid,p_expected_updated_at:pts,p_status:'draft',p_public:pub,p_private:priv});if(!r.error)fail('o valoare nepermisă a fost acceptată')}
  const s=await A.c.from('projects').select('title,updated_at').eq('id',pid).single();if(s.data?.title!=='Test automat — se șterge'||s.data?.updated_at!==pts)fail('salvarea respinsă a modificat proiectul');
 });
 await P('A salvează din nou ciorna cu versiunea curentă',async()=>{const r=await A.c.rpc('save_project',{p_id:pid,p_expected_updated_at:pts,p_status:'draft',p_public:{title:'Test automat — se șterge',city:'Test'},p_private:{monthly_revenue:'0'}});if(r.error)fail('cod '+codeOf(r.error));pts=r.data[0].updated_at});
 await P('A șterge ciorna temporară (doar ID-ul creat acum)',async()=>{const r=await A.c.from('projects').delete().eq('id',pid).eq('status','draft').select('id');if(r.error||r.data.length!==1)fail('ștergerea nu a reușit');tempProject.id=null;
  const left=await A.c.from('project_private').select('project_id').eq('project_id',pid);if(left.data?.length)fail('datele private au rămas')});

 // 3. Roluri nepermise și operațiile proprietarului
 for(const me of [A,B]){
  const init=initial[me.label];
  for(const role of ['admin','verified_investor','service_role'])
   await check(`${me.label}: NU își poate atribui rolul „${role}”`,async()=>{if(!(await me.c.from('profile_roles').insert({user_id:me.id,role})).error)fail('operațiunea a fost PERMISĂ')});
  await check(`${me.label}: NU poate crea un al doilea profil`,async()=>{if(!(await me.c.rpc('complete_profile',{p_display_name:'Al doilea profil',p_role:'creator'})).error)fail('operațiunea a fost PERMISĂ')});
  await check(`${me.label}: vede doar propriile date private`,async()=>{const r=await me.c.from('profiles_private').select('link');mustSucceed(r,1)});
  await check(`${me.label}: își poate salva profilul`,async()=>mustSucceed(await me.c.from('profiles').update({bio:init.profile.bio}).eq('id',me.id).select('id'),1));
  await check(`${me.label}: salvează intențiile, competențele, rolul dorit și orele; persistă și sunt vizibile celuilalt cont`,async()=>{
   const temp={wants_to_develop:!init.profile.wants_to_develop,wants_to_join:true,skills:['Test participare','Marketing'],desired_roles:['cofondator','team_leader'],weekly_hours:7};
   try{
    mustSucceed(await me.c.from('profiles').update(temp).eq('id',me.id).select('id'),1);
    const fresh=client();const {error:e}=await fresh.auth.signInWithPassword({email:env[`BUILDIT_TEST_${me.label}_EMAIL`],password:env[`BUILDIT_TEST_${me.label}_PASSWORD`]});if(e)fail('reconectarea a eșuat');
    const own=await fresh.from('profiles').select(PARTICIPATION_COLS.join(',')).eq('id',me.id).single();await fresh.auth.signOut({scope:'local'});
    if(own.error||!same(own.data,temp))fail('valorile citite după reconectare diferă');
    const seen=await other(me).c.from('profiles').select(PARTICIPATION_COLS.join(',')).eq('id',me.id).single();
    if(seen.error||!same(seen.data,temp))fail('celălalt cont nu vede aceleași valori');
    const roles=await me.c.from('profile_roles').select('role').eq('user_id',me.id);if(!same(roles.data.map(x=>x.role).sort(),init.roles))fail('rolurile de cont s-au schimbat');
   }finally{const v=init.profile;await me.c.from('profiles').update({wants_to_develop:v.wants_to_develop,wants_to_join:v.wants_to_join,skills:v.skills,desired_roles:v.desired_roles,weekly_hours:v.weekly_hours}).eq('id',me.id)}
  });
  await check(`${me.label}: valori nepermise de participare sunt refuzate`,async()=>{
   for(const bad of [{desired_roles:['admin']},{weekly_hours:0},{weekly_hours:169},{skills:['Design','design']},{skills:['x'.repeat(41)]}])
    if(!(await me.c.from('profiles').update(bad).eq('id',me.id)).error)fail('o valoare nepermisă a fost acceptată ('+Object.keys(bad)[0]+')');
  });
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
var tempProject={id:null},projectCountBefore=null;
try{await run()}
finally{
 // Curățenie: doar ciorna temporară creată în această rulare (după ID).
 if(tempProject.id){await A.c.from('projects').delete().eq('id',tempProject.id).eq('status','draft');tempProject.id=null}
 if(projectCountBefore!=null)await check('A: numărul de proiecte existente a rămas neschimbat',async()=>{const r=await A.c.from('projects').select('id',{count:'exact',head:true}).eq('owner_id',A.id);if(r.count!==projectCountBefore)fail('numărul de proiecte diferă')});
 for(const u of [A,B])restored[u.label]=await restore(u).catch(()=>['restaurarea a eșuat']);
 for(const u of [A,B])await check(`${u.label}: profilul, datele private, rolurile și fotografia au rămas neschimbate`,async()=>{if(!(await unchanged(u)))fail('starea finală diferă de cea inițială')});
 // scope local: închide doar sesiunile acestui script, nu și pe cele din browser sau telefon
 await Promise.all([A.c.auth.signOut({scope:'local'}),B.c.auth.signOut({scope:'local'})]);
}

for(const r of results)console.log(`${r.status.padEnd(4)} ${r.name}${r.why?' — '+r.why:''}`);
for(const u of ['A','B'])if(restored[u].length)console.log(`Atenție: pentru contul ${u} a fost necesară restaurarea (${restored[u].join(', ')}).`);
const failed=results.filter(r=>r.status==='FAIL').length,skipped=results.filter(r=>r.status==='omis').length;
console.log(`\nRezultat pe buildit-dev: ${results.length-failed-skipped} trecute, ${failed} eșuate, ${skipped} omise (date insuficiente pentru acea verificare, de ex. cont fără fotografie sau fără competențe).`);
process.exit(failed?1:0);
