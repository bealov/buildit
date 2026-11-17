// Teste pentru conturile reale (etapa 1), fără conexiune la Supabase.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {readRealConfig,isSecretKey,configProblemMessage} from '../src/real/config.ts';
import {parseAuthCallback,cleanedUrl,redirectUrl,isAuthHash} from '../src/real/authCallback.ts';
import {loadErrorInfo,passwordProblem,nameProblem,linkProblem,parseBudget,profileFormProblem,authErrorMessage,validEmail} from '../src/real/validation.ts';
import {resolveMode,readStoredMode,writeStoredMode,clearStoredMode,readAppMode,MODE_KEY} from '../src/real/roles.ts';
import {createAccountApi,profileUpdate,privateUpdate,formFromAccount,emptyForm,avatarPath} from '../src/real/account.ts';
import {createAuthApi} from '../src/real/auth.ts';
import {DESIRED_ROLES,emptyParticipation,hoursLabel,parseHours,participationFromStored,participationToStored,skillProblem,type DesiredRole} from '../src/participation.ts';

const migration=readFileSync(new URL('../supabase/migrations/20261102000000_profiles_and_roles.sql',import.meta.url),'utf8');
const b64=(o:object)=>Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt=(payload:object)=>`eyJhbGciOiJIUzI1NiJ9.${b64(payload)}.signature`;
const env=(extra:Record<string,string>)=>({VITE_ENABLE_REAL_ACCOUNTS:'true',VITE_SUPABASE_URL:'https://abc.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',...extra});

// ---------------------------------------------------------------------------
test('config: demo-only when the flag or configuration is missing',()=>{
 assert.equal(readRealConfig({}).problem,'disabled');
 assert.equal(readRealConfig({VITE_ENABLE_REAL_ACCOUNTS:'false',VITE_SUPABASE_URL:'https://a.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_x'}).problem,'disabled');
 assert.equal(readRealConfig(env({VITE_SUPABASE_URL:''})).problem,'missing-url');
 assert.equal(readRealConfig(env({VITE_SUPABASE_PUBLISHABLE_KEY:''})).problem,'missing-key');
 assert.equal(readRealConfig(env({VITE_SUPABASE_URL:'http://abc.supabase.co'})).problem,'invalid-url');
 assert.equal(readRealConfig(env({VITE_SUPABASE_URL:'http://127.0.0.1:54321'})).config?.url,'http://127.0.0.1:54321');
 assert.deepEqual(readRealConfig(env({VITE_SUPABASE_URL:'https://abc.supabase.co/'})).config,{url:'https://abc.supabase.co',publishableKey:'sb_publishable_test'});
});

test('config: secret keys are refused and never echoed',()=>{
 assert.equal(readRealConfig(env({VITE_SUPABASE_PUBLISHABLE_KEY:'sb_secret_abc123'})).problem,'secret-key');
 assert.equal(readRealConfig(env({VITE_SUPABASE_PUBLISHABLE_KEY:jwt({role:'service_role'})})).problem,'secret-key');
 assert.equal(isSecretKey(jwt({role:'anon'})),false);
 assert.equal(isSecretKey('sb_publishable_abc'),false);
 assert.ok(!configProblemMessage['secret-key'].includes('sb_secret_abc123'));
});

// ---------------------------------------------------------------------------
test('auth callback: PKCE code, token hash and intents',()=>{
 assert.deepEqual(parseAuthCallback('?auth=recovery&code=abc','#home'),{kind:'code',code:'abc',intent:'recovery'});
 assert.deepEqual(parseAuthCallback('?auth=confirm&code=xyz',''),{kind:'code',code:'xyz',intent:'confirm'});
 assert.deepEqual(parseAuthCallback('?token_hash=h1&type=email',''),{kind:'otp',tokenHash:'h1',type:'email',intent:'confirm'});
 assert.deepEqual(parseAuthCallback('?token_hash=h2&type=recovery',''),{kind:'otp',tokenHash:'h2',type:'recovery',intent:'recovery'});
 assert.equal(parseAuthCallback('?token_hash=h3&type=magiclink_admin','')?.kind,'error');
 assert.equal(parseAuthCallback('','#profile'),null);
 assert.equal(parseAuthCallback('?utm=1','#home'),null);
});

test('auth callback: errors and legacy hash fragments do not become routes',()=>{
 const expired=parseAuthCallback('?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid','');
 assert.equal(expired?.kind,'error');
 assert.ok(expired&&'message' in expired&&expired.message.includes('expirat'));
 assert.ok(expired&&'message' in expired&&!expired.message.includes('Email link'),'mesajul nu copiază text din URL');
 assert.equal(parseAuthCallback('','#error=access_denied&error_code=otp_expired')?.kind,'error');
 assert.equal(parseAuthCallback('','#access_token=t&refresh_token=r&type=signup')?.kind,'implicit');
 assert.ok(isAuthHash('#access_token=x'));assert.ok(!isAuthHash('#settings'));
});

test('auth callback: URL is cleaned and the hash route preserved',()=>{
 assert.equal(cleanedUrl('/','?auth=recovery&code=abc','','password'),'/#password');
 assert.equal(cleanedUrl('/app','?utm=x&token_hash=h&type=email','#profile'),'/app?utm=x#profile');
 assert.equal(cleanedUrl('/','','#access_token=t&refresh_token=r'),'/#home');
 assert.equal(redirectUrl('https://preview.example','/'),'https://preview.example/');
 assert.equal(redirectUrl('http://localhost:5173','/'),'http://localhost:5173/');
});

// ---------------------------------------------------------------------------
test('validation: passwords, names, links and budgets',()=>{
 assert.ok(passwordProblem('short'));
 assert.equal(passwordProblem('0123456789'),null);
 assert.equal(passwordProblem('0123456789','0123456780'),'Parolele nu coincid.');
 assert.ok(passwordProblem('ș'.repeat(40)),'peste 72 de octeți');
 assert.ok(nameProblem(' a '));assert.equal(nameProblem('Ana Pop'),null);
 assert.ok(linkProblem('javascript:alert(1)'));assert.ok(linkProblem('www.exemplu.ro'));assert.equal(linkProblem('https://exemplu.ro/ana'),null);assert.equal(linkProblem(''),null);
 assert.deepEqual(parseBudget(''),{value:null,problem:null});
 assert.deepEqual(parseBudget('25 000'),{value:25000,problem:null});
 assert.ok(parseBudget('-5').problem);assert.ok(parseBudget('1,5').problem);
 assert.ok(validEmail('ana@exemplu.ro'));assert.ok(!validEmail('ana@'));
 const form={...emptyForm(),display_name:'Ana Pop',investor_min_budget:'5000',investor_max_budget:'100'};
 assert.equal(profileFormProblem(form,true),'Bugetul minim nu poate depăși bugetul maxim.');
 assert.equal(profileFormProblem(form,false),null,'bugetele contează doar cu rolul Investitor');
 assert.ok(profileFormProblem({...form,industries:'Altceva'},false));
});

test('validation: auth errors do not reveal whether an email has an account',()=>{
 assert.equal(authErrorMessage('invalid_credentials',400),'Email sau parolă incorectă.');
 for(const code of ['user_not_found','user_already_exists','email_exists'])assert.equal(authErrorMessage(code,400),'Operațiunea nu a reușit. Încearcă din nou.');
 assert.ok(authErrorMessage(undefined,429).includes('Prea multe'));
});

test('validation: profile load errors give a short code and a hint, without personal data',()=>{
 assert.equal(loadErrorInfo({name:'TypeError',message:'Failed to fetch'}).code,'rețea');
 assert.equal(loadErrorInfo({message:'TypeError: Failed to fetch',code:''}).code,'rețea');
 assert.match(loadErrorInfo({code:'PGRST301',message:'JWT expired'}).hint,/autentifică-te din nou/);
 assert.match(loadErrorInfo({code:'PGRST002'}).hint,/pauză/);
 assert.match(loadErrorInfo({status:503}).hint,/indisponibil/);
 assert.match(loadErrorInfo({code:'PGRST205'}).hint,/Data API/);
 assert.equal(loadErrorInfo({code:'42501'}).code,'42501');
 assert.match(loadErrorInfo({code:'42703',message:'column profiles.wants_to_develop does not exist'}).hint,/migrările noi/);
 assert.equal(loadErrorInfo(null).code,'necunoscut');
 assert.ok(!loadErrorInfo({code:'X',message:'ana@test.invalid'}).hint.includes('ana@'));
});

// ---------------------------------------------------------------------------
const memory=()=>{const m=new Map<string,string>();return {getItem:(k:string)=>m.get(k)??null,setItem:(k:string,v:string)=>void m.set(k,v),removeItem:(k:string)=>void m.delete(k),m}};

test('roles: browser mode is only a preference and never grants a role',()=>{
 assert.equal(resolveMode([],null,'u1'),null);
 assert.equal(resolveMode(['investor'],null,'u1'),'investor');
 assert.equal(resolveMode(['investor'],{userId:'u1',role:'creator'},'u1'),'investor','modul salvat nu activează un rol inexistent');
 assert.equal(resolveMode(['creator','investor'],{userId:'u1',role:'investor'},'u1'),'investor');
 assert.equal(resolveMode(['creator','investor'],{userId:'u2',role:'investor'},'u1'),'creator','preferința altui cont este ignorată');
 assert.equal(resolveMode(['creator','investor'],{userId:'u1',role:'admin'},'u1'),'creator');
 const s=memory();writeStoredMode(s,'u1','investor');assert.deepEqual(readStoredMode(s),{userId:'u1',role:'investor'});
 clearStoredMode(s);assert.equal(readStoredMode(s),null);
 s.setItem(MODE_KEY,'{broken');assert.equal(readStoredMode(s),null);
 const throwing={getItem:()=>{throw new Error('blocked')},setItem:()=>{throw new Error('blocked')},removeItem:()=>{throw new Error('blocked')}};
 assert.equal(readStoredMode(throwing),null);assert.equal(readAppMode(throwing),'demo');
 assert.doesNotThrow(()=>writeStoredMode(throwing,'u1','creator'));
});

// ---------------------------------------------------------------------------
// Toate migrările, în ordine: permisiunile se pot adăuga în migrări noi.
const allMigrations=readdirSync(new URL('../supabase/migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort().map(f=>readFileSync(new URL('../supabase/migrations/'+f,import.meta.url),'utf8')).join('\n');
const granted=(table:string)=>{
 const all=[...allMigrations.matchAll(new RegExp(`grant update \\(([^)]*)\\)\\s*on table public\\.${table} to authenticated`,'gs'))];
 assert.ok(all.length,`GRANT UPDATE pentru ${table}`);
 return all.flatMap(m=>m[1].split(',').map(c=>c.trim()).filter(Boolean));
};

test('account: updates only send the columns granted in the migration',()=>{
 const form={...emptyForm(),display_name:' Ana ',investor_min_budget:'10',investor_max_budget:'20',investor_stage:'MVP'};
 const profileCols=granted('profiles'),privateCols=granted('profiles_private');
 for(const key of Object.keys(profileUpdate(form)))assert.ok(profileCols.includes(key),key);
 for(const key of Object.keys(privateUpdate(form,true)))assert.ok(privateCols.includes(key),key);
 assert.ok(!('id' in profileUpdate(form))&&!('created_at' in profileUpdate(form)));
 assert.deepEqual(Object.keys(privateUpdate(form,false)).sort(),['link','show_email_after_match','show_link_after_match']);
 assert.equal(profileUpdate(form).display_name,'Ana');
 assert.deepEqual(formFromAccount({profile:null,priv:null,roles:[]}),emptyForm());
});

test('migration: no email column, private bucket, contact hidden by default, explicit RLS',()=>{
 assert.ok(!/^\s+email\b/m.test(migration),'fără coloană email');
 assert.match(migration,/values \('avatars', 'avatars', false/);
 assert.match(migration,/show_email_after_match boolean not null default false/);
 assert.match(migration,/show_link_after_match boolean not null default false/);
 for(const t of ['profiles','profiles_private','profile_roles'])assert.match(migration,new RegExp(`alter table public\\.${t} enable row level security`));
 assert.match(migration,/check \(role in \('creator', 'investor'\)\)/);
 assert.ok(!/to anon/.test(migration.replace(/from public, anon[^;]*;/g,'')),'nicio permisiune acordată vizitatorilor');
});

// Client Supabase simulat: înregistrează cererile pentru a verifica limitarea la contul curent.
function fakeClient(opts:{updateRows?:number}={}){
 const calls:string[]=[];
 const query=(table:string)=>{
  const q={
   select(cols:string){calls.push(`${table}.select(${cols.split(',')[0]})`);return q},
   eq(col:string,v:string){calls.push(`${table}.eq(${col}=${v})`);return q},
   order(){return q},
   update(v:object){calls.push(`${table}.update(${Object.keys(v).sort().join(',')})`);return q},
   insert(v:{user_id:string;role:string}){calls.push(`${table}.insert(${v.user_id}:${v.role})`);return Promise.resolve({error:null})},
   maybeSingle(){return Promise.resolve({data:table==='profiles'?{id:'A',display_name:'Ana',avatar_path:'A/avatar.jpg'}:{link:''},error:null})},
   then(resolve:(v:unknown)=>void){resolve({data:table==='profile_roles'?[{role:'creator'},{role:'admin'}]:Array(opts.updateRows??1).fill({id:'A'}),error:null})}
  };
  return q;
 };
 const storage={from(bucket:string){return {
  upload(path:string){calls.push(`storage.${bucket}.upload(${path})`);return Promise.resolve({error:null})},
  remove(paths:string[]){calls.push(`storage.${bucket}.remove(${paths.join()})`);return Promise.resolve({error:null})},
  createSignedUrl(path:string,ttl:number){calls.push(`storage.${bucket}.sign(${path},${ttl})`);return Promise.resolve({data:{signedUrl:'https://signed/'+path},error:null})}
 }}};
 return {calls,client:{from:query,storage,rpc:(fn:string,args:object)=>{calls.push(`rpc.${fn}(${Object.values(args).join(',')})`);return Promise.resolve({error:null})}}};
}

test('account api: every request is scoped to the signed-in user; photo goes to own folder',async()=>{
 const {calls,client}=fakeClient();
 // @ts-expect-error client simulat parțial
 const api=createAccountApi(client);
 globalThis.fetch=(async()=>({blob:async()=>new Blob(['x'],{type:'image/jpeg'})})) as unknown as typeof fetch;
 const account=await api.load('A');
 assert.deepEqual(account.roles,['creator'],'roluri necunoscute ignorate');
 assert.equal(account.avatarUrl,'https://signed/A/avatar.jpg');
 assert.ok(calls.includes('storage.avatars.sign(A/avatar.jpg,3600)'),'URL temporar, nu public');
 await api.save('A',{...emptyForm(),display_name:'Ana'},false,{kind:'set',dataUrl:'data:image/jpeg;base64,eA=='});
 assert.ok(calls.includes(`storage.avatars.upload(${avatarPath('A')})`));
 assert.ok(calls.includes('profiles.update(avatar_path,bio,city,company,desired_roles,display_name,industries,objectives,skills,wants_to_develop,wants_to_join,weekly_hours)'));
 assert.ok(calls.filter(c=>c.includes('.eq(')).every(c=>c.endsWith('=A)')),'toate filtrele folosesc contul curent');
 await api.activateRole('A','investor');assert.ok(calls.includes('profile_roles.insert(A:investor)'));
 await api.completeProfile(' Ana ','creator');assert.ok(calls.includes('rpc.complete_profile(Ana,creator)'));
});

test('account api: savePhoto uploads only the framed photo to the own folder and sets avatar_path',async()=>{
 const {calls,client}=fakeClient();
 // @ts-expect-error client simulat parțial
 const api=createAccountApi(client);
 globalThis.fetch=(async()=>({blob:async()=>new Blob(['x'],{type:'image/jpeg'})})) as unknown as typeof fetch;
 await api.savePhoto('A','data:image/jpeg;base64,eA==');
 assert.deepEqual(calls.filter(c=>c.startsWith('storage.')),[`storage.avatars.upload(${avatarPath('A')})`],'o singură încărcare, în folderul propriu');
 assert.ok(calls.includes('profiles.update(avatar_path)'),'doar avatar_path, fără alte câmpuri');
 assert.ok(!calls.some(c=>c.startsWith('profiles_private')),'datele private nu sunt atinse');
 assert.ok(calls.filter(c=>c.includes('.eq(')).every(c=>c.endsWith('=A)')));
});

test('account api: the signed avatar URL is reused while valid, so the browser can cache the photo',async()=>{
 const store=new Map<string,string>();const prev=globalThis.localStorage;
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>store.set(k,v),removeItem:(k:string)=>store.delete(k)}});
 try{
  const {calls,client}=fakeClient();
  // @ts-expect-error client simulat parțial
  const api=createAccountApi(client);
  const first=await api.load('A'),second=await api.load('A');
  assert.equal(second.avatarUrl,first.avatarUrl,'aceeași adresă la a doua deschidere');
  assert.equal(calls.filter(c=>c.startsWith('storage.avatars.sign')).length,1,'o singură semnare');
  store.clear();await api.load('A');
  assert.equal(calls.filter(c=>c.startsWith('storage.avatars.sign')).length,2,'fără cache se semnează din nou');
 }finally{Object.defineProperty(globalThis,'localStorage',{configurable:true,value:prev})}
});

test('account api: an update blocked by RLS (0 rows) is reported as an error',async()=>{
 const {client}=fakeClient({updateRows:0});
 // @ts-expect-error client simulat parțial
 const api=createAccountApi(client);
 await assert.rejects(api.save('A',{...emptyForm(),display_name:'Ana'},false,{kind:'keep'}),(e:{code:string})=>e.code==='42501');
});

test('auth api: signup metadata, redirect URLs, local sign-out and callbacks',async()=>{
 const calls:Record<string,unknown>[]=[];
 const rec=(name:string,result:object={error:null})=>(...args:unknown[])=>{calls.push({name,args});return Promise.resolve(result)};
 const client={auth:{
  signUp:rec('signUp',{data:{session:null},error:null}),exchangeCodeForSession:rec('exchange',{data:{redirectType:'recovery'},error:null}),signInWithPassword:rec('signIn',{error:{code:'invalid_credentials',status:400,message:'Invalid login credentials'}}),
  signOut:rec('signOut'),resetPasswordForEmail:rec('reset'),resend:rec('resend'),verifyOtp:rec('verify'),updateUser:rec('updateUser'),
  getSession:()=>Promise.resolve({data:{session:{user:{id:'A',email:'a@x.ro'}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})
 }};
 (globalThis as unknown as {window:object}).window={location:{origin:'https://preview.example',pathname:'/'}};
 // @ts-expect-error client simulat parțial
 const auth=createAuthApi(client);
 assert.deepEqual(await auth.currentUser(),{id:'A',email:'a@x.ro'});
 assert.deepEqual(await auth.signUp(' ana@x.ro ','0123456789',' Ana ','investor'),{needsConfirmation:true});
 assert.deepEqual(calls[0].args,[{email:'ana@x.ro',password:'0123456789',options:{data:{display_name:'Ana',initial_role:'investor'},emailRedirectTo:'https://preview.example/'}}]);
 await assert.rejects(auth.signIn('a@x.ro','wrong'),(e:object)=>JSON.stringify(e)==='{"code":"invalid_credentials","status":400}');
 await auth.requestPasswordReset('a@x.ro');
 assert.deepEqual(calls.at(-1)?.args,['a@x.ro',{redirectTo:'https://preview.example/'}]);
 await auth.signOut();assert.deepEqual(calls.at(-1)?.args,[{scope:'local'}]);
 assert.deepEqual(await auth.handleCallback({kind:'code',code:'c1',intent:'unknown'}),{recovery:true},'resetarea detectată din codul PKCE');assert.deepEqual(calls.at(-1),{name:'exchange',args:['c1']});
 assert.deepEqual(await auth.handleCallback({kind:'otp',tokenHash:'h',type:'recovery',intent:'recovery'}),{recovery:true});
 assert.deepEqual(await auth.handleCallback({kind:'otp',tokenHash:'h',type:'email',intent:'confirm'}),{recovery:false});assert.deepEqual(calls.at(-1),{name:'verify',args:[{token_hash:'h',type:'email'}]});
});

// ---------------------------------------------------------------------------
// Profil Creator: cum vrea utilizatorul să participe
// ---------------------------------------------------------------------------
test('participation: each intent alone, both together, saved without a project',()=>{
 const base={...emptyForm(),display_name:'Ana'};
 for(const [develop,join] of [[true,false],[false,true],[true,true],[false,false]]){
  const form={...base,participation:{...emptyParticipation(),develop,join}};
  assert.equal(profileFormProblem(form,false),null,`${develop}/${join}: se salvează fără proiect`);
  const u=profileUpdate(form);assert.equal(u.wants_to_develop,develop);assert.equal(u.wants_to_join,join);
 }
});

test('participation: join details are normalized, unchecking join keeps them',()=>{
 const part={develop:false,join:true,skills:['  Analiză   de date ','Marketing','marketing'],roles:['team_leader','cofondator'] as DesiredRole[],hours:' 12 '};
 const stored=participationToStored(part);
 assert.deepEqual(stored,{develop:false,join:true,skills:['Analiză de date','Marketing'],roles:['cofondator','team_leader'],hours:12});
 const unchecked=participationToStored({...part,join:false});
 assert.deepEqual([unchecked.skills,unchecked.roles,unchecked.hours],[stored.skills,stored.roles,stored.hours],'debifarea nu șterge');
 const back=formFromAccount({profile:{id:'A',display_name:'Ana',avatar_path:null,bio:'',city:'',company:'',industries:'',objectives:'',updated_at:'',wants_to_develop:false,wants_to_join:false,skills:stored.skills,desired_roles:stored.roles,weekly_hours:12},priv:null,roles:['creator']});
 assert.deepEqual(back.participation,{develop:false,join:false,skills:['Analiză de date','Marketing'],roles:['cofondator','team_leader'],hours:'12'});
});

test('participation: existing profiles and old demo data get no intents',()=>{
 const old=formFromAccount({profile:{id:'A',display_name:'Ana',avatar_path:null,bio:'',city:'',company:'',industries:'',objectives:'',updated_at:''},priv:null,roles:['creator','investor']});
 assert.deepEqual(old.participation,emptyParticipation());
 assert.deepEqual(participationFromStored(undefined),emptyParticipation());
 assert.deepEqual(participationFromStored({skills:'x',roles:['admin','cofondator']}).roles,['cofondator'],'roluri necunoscute ignorate');
});

test('participation: limits match the migration',()=>{
 assert.equal(parseHours('').value,null);assert.equal(parseHours('40').value,40);
 for(const bad of ['0','169','2.5','-3','zece'])assert.ok(parseHours(bad).problem,bad);
 assert.ok(skillProblem([],'  '));assert.ok(skillProblem([],'x'.repeat(41)));assert.ok(skillProblem(['Design'],'design'));
 assert.ok(skillProblem(Array.from({length:15},(_,i)=>'c'+i),'nou'));assert.equal(skillProblem([],'Juridic'),null);
 const m=readFileSync(new URL('../supabase/migrations/20261115000000_creator_participation.sql',import.meta.url),'utf8');
 assert.match(m,/cardinality\(skills\) <= 15/);assert.match(m,/char_length\(s\) not between 1 and 40/);assert.match(m,/weekly_hours between 1 and 168/);
 for(const [id] of DESIRED_ROLES)assert.ok(m.includes(`'${id}'`),id);
 assert.ok(!/profile_roles/.test(m.replace(/--.*$/gm,'')),'intențiile nu ating rolurile de cont');
 assert.equal(hoursLabel(1),'1 oră');assert.equal(hoursLabel(10),'10 ore');assert.equal(hoursLabel(20),'20 de ore');
});
