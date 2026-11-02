// Verificare cu DOUĂ conturi reale pe proiectul Supabase de dezvoltare (buildit-dev).
// Se rulează manual, doar după aplicarea migrării și crearea conturilor de test:
//   npm run test:remote
// Citește datele din .env.local (exclus din Git). Nu afișează parole sau chei.
// Folosește doar cheia publishable: aceleași drepturi ca aplicația din browser.
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';

const env=process.env;
const need=['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY','BUILDIT_TEST_A_EMAIL','BUILDIT_TEST_A_PASSWORD','BUILDIT_TEST_B_EMAIL','BUILDIT_TEST_B_PASSWORD'];
const missing=need.filter(k=>!env[k]);
if(missing.length){console.error('Lipsesc din .env.local: '+missing.join(', '));process.exit(2)}
if(env.BUILDIT_TEST_TARGET!=='buildit-dev'){console.error('Setează BUILDIT_TEST_TARGET=buildit-dev în .env.local pentru a confirma că rulezi pe proiectul de dezvoltare.');process.exit(2)}
const key=env.VITE_SUPABASE_PUBLISHABLE_KEY;
if(key.startsWith('sb_secret_')||!key.startsWith('sb_publishable_')){console.error('Folosește cheia publishable (sb_publishable_…), nu o cheie secretă.');process.exit(2)}

const opts={auth:{persistSession:false,autoRefreshToken:false}};
const anon=createClient(env.VITE_SUPABASE_URL,key,opts);
const A=createClient(env.VITE_SUPABASE_URL,key,opts),B=createClient(env.VITE_SUPABASE_URL,key,opts);
let passed=0;const results=[];
const check=async(name,fn)=>{try{await fn();passed++;results.push(['ok  ',name])}catch(e){results.push(['FAIL',name+' — '+(e?.message||e)])}};
const deny=r=>assert.ok(r.error||(Array.isArray(r.data)&&r.data.length===0),'operațiunea trebuia refuzată');
const JPEG=Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==','base64');

async function signIn(client,label){
 const {data,error}=await client.auth.signInWithPassword({email:env[`BUILDIT_TEST_${label}_EMAIL`],password:env[`BUILDIT_TEST_${label}_PASSWORD`]});
 if(error)throw new Error(`Autentificarea contului ${label} a eșuat (${error.code||error.status}). Verifică datele din .env.local și confirmarea contului.`);
 const id=data.user.id;
 const {data:profile}=await client.from('profiles').select('id').eq('id',id).maybeSingle();
 if(!profile)throw new Error(`Contul ${label} nu are profil. Intră o dată în aplicație cu acest cont și completează profilul, apoi rulează din nou.`);
 return id;
}

const idA=await signIn(A,'A'),idB=await signIn(B,'B');
assert.notEqual(idA,idB,'A și B trebuie să fie conturi diferite');
const snapshot=async()=>({
 profile:(await B.from('profiles').select('*').eq('id',idB).single()).data,
 priv:(await B.from('profiles_private').select('*').eq('id',idB).single()).data,
 roles:(await B.from('profile_roles').select('role').eq('user_id',idB)).data
});
const beforeB=await snapshot();
const ownA=(await A.from('profiles').select('bio,avatar_path').eq('id',idA).single()).data;

// ---- Vizitator neautentificat
await check('anon nu poate citi profiluri',async()=>deny(await anon.from('profiles').select('id')));
await check('anon nu poate citi date private',async()=>deny(await anon.from('profiles_private').select('id')));
await check('anon nu poate citi roluri',async()=>deny(await anon.from('profile_roles').select('role')));
await check('anon nu poate apela complete_profile',async()=>assert.ok((await anon.rpc('complete_profile',{p_display_name:'X',p_role:'creator'})).error));

// ---- Citire
await check('A vede profilul public al lui B, fără email',async()=>{const {data,error}=await A.from('profiles').select('*').eq('id',idB);assert.ifError(error);assert.equal(data.length,1);assert.ok(!Object.keys(data[0]).some(k=>k.includes('email')))});
await check('A NU vede datele private ale lui B',async()=>{const {data}=await A.from('profiles_private').select('*').eq('id',idB);assert.equal(data?.length??0,0)});
await check('A vede doar propriile date private',async()=>{const {data}=await A.from('profiles_private').select('id');assert.deepEqual(data.map(r=>r.id),[idA])});

// ---- Modificări asupra lui B (trebuie refuzate)
await check('A NU poate modifica profilul lui B',async()=>deny(await A.from('profiles').update({bio:'modificat de A'}).eq('id',idB).select('id')));
await check('A NU poate modifica datele private ale lui B',async()=>deny(await A.from('profiles_private').update({show_email_after_match:true}).eq('id',idB).select('id')));
await check('A NU poate activa un rol pentru B',async()=>assert.ok((await A.from('profile_roles').insert({user_id:idB,role:beforeB.roles.some(r=>r.role==='creator')?'investor':'creator'})).error));
await check('A NU poate activa un rol administrativ',async()=>assert.ok((await A.from('profile_roles').insert({user_id:idA,role:'admin'})).error));
await check('A NU poate seta statut verificat',async()=>assert.ok((await A.from('profile_roles').insert({user_id:idA,role:'verified_investor'})).error));
await check('A NU poate șterge rolurile lui B',async()=>deny(await A.from('profile_roles').delete().eq('user_id',idB).select('role')));
await check('A NU poate indica fotografia lui B',async()=>assert.ok((await A.from('profiles').update({avatar_path:`${idB}/avatar.jpg`}).eq('id',idA)).error));
await check('A NU poate crea un profil nou prin complete_profile',async()=>assert.ok((await A.rpc('complete_profile',{p_display_name:'Al doilea',p_role:'creator'})).error));

// ---- Fotografii
await check('A NU poate încărca în folderul lui B',async()=>assert.ok((await A.storage.from('avatars').upload(`${idB}/avatar.jpg`,JPEG,{contentType:'image/jpeg',upsert:true})).error));
await check('A își încarcă propria fotografie',async()=>assert.ifError((await A.storage.from('avatars').upload(`${idA}/avatar.jpg`,JPEG,{contentType:'image/jpeg',upsert:true})).error));
await check('bucket-ul respinge alte tipuri de fișiere',async()=>assert.ok((await A.storage.from('avatars').upload(`${idA}/avatar.jpg`,Buffer.from('<html></html>'),{contentType:'text/html',upsert:true})).error));
await check('B poate vedea fotografia lui A prin URL temporar',async()=>{const {data,error}=await B.storage.from('avatars').createSignedUrl(`${idA}/avatar.jpg`,60);assert.ifError(error);assert.equal((await fetch(data.signedUrl)).status,200)});
await check('anon NU poate crea URL pentru fotografia lui A',async()=>assert.ok((await anon.storage.from('avatars').createSignedUrl(`${idA}/avatar.jpg`,60)).error));
await check('fotografia NU este publică',async()=>{const {data}=anon.storage.from('avatars').getPublicUrl(`${idA}/avatar.jpg`);assert.notEqual((await fetch(data.publicUrl)).status,200)});
await check('B NU poate șterge fotografia lui A',async()=>{await B.storage.from('avatars').remove([`${idA}/avatar.jpg`]);const {error}=await A.storage.from('avatars').createSignedUrl(`${idA}/avatar.jpg`,60);assert.ifError(error)});

// ---- Propriul profil
await check('A își modifică propriul profil',async()=>{const {data,error}=await A.from('profiles').update({bio:'Verificare automată'}).eq('id',idA).select('bio');assert.ifError(error);assert.equal(data[0].bio,'Verificare automată')});
await check('activarea dublă a unui rol existent este refuzată',async()=>{const {data}=await A.from('profile_roles').select('role').eq('user_id',idA);assert.ok((await A.from('profile_roles').insert({user_id:idA,role:data[0].role})).error)});
if(env.BUILDIT_TEST_ALLOW_ROLE_ACTIVATION==='1'){
 await check('A își activează al doilea rol (permanent în buildit-dev)',async()=>{const {data}=await A.from('profile_roles').select('role').eq('user_id',idA);const missingRole=['creator','investor'].find(r=>!data.some(x=>x.role===r));if(!missingRole)return;assert.ifError((await A.from('profile_roles').insert({user_id:idA,role:missingRole})).error)});
}

// ---- B neschimbat
await check('datele lui B au rămas neschimbate',async()=>assert.deepEqual(await snapshot(),beforeB));

// ---- Restaurare pentru A
await A.from('profiles').update({bio:ownA.bio}).eq('id',idA);
if(!ownA.avatar_path)await A.storage.from('avatars').remove([`${idA}/avatar.jpg`]);
await Promise.all([A.auth.signOut(),B.auth.signOut()]);

for(const [s,n] of results)console.log(s,n);
console.log(`${passed}/${results.length} verificări trecute pe buildit-dev (două conturi).`);
process.exit(passed===results.length?0:1);
