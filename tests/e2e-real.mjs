// Test în browser (Chromium/Playwright) al conturilor reale, cu un server LOCAL care imită
// API-ul Supabase (Auth, PostgREST, Storage). Nu se conectează la Supabase găzduit.
// Serverul simulat aplică reguli de proprietar similare RLS doar pentru a putea rula fluxul;
// regulile reale sunt testate în baza de date cu tests/db/run-local.sh.
import {createServer} from 'node:http';import {readFile} from 'node:fs/promises';import {join,extname} from 'node:path';import {execFileSync} from 'node:child_process';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');

const PORT=Number(process.env.E2E_PORT||4391),ORIGIN=`http://127.0.0.1:${PORT}`;
const out=mkdtempSync(join(tmpdir(),'buildit-e2e-'));
const env={...process.env,VITE_ENABLE_REAL_ACCOUNTS:'true',VITE_SUPABASE_URL:ORIGIN,VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_local_e2e'};
execFileSync('npx',['vite','build','--outDir',out,'--emptyOutDir','--logLevel','error'],{env,stdio:'inherit'});
const demoOut=mkdtempSync(join(tmpdir(),'buildit-e2e-demo-'));
const demoEnv={...process.env};for(const k of ['VITE_ENABLE_REAL_ACCOUNTS','VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY'])delete demoEnv[k];
execFileSync('npx',['vite','build','--outDir',demoOut,'--emptyOutDir','--logLevel','error'],{env:demoEnv,stdio:'inherit'});

// ---------------------------------------------------------------------------
// Date simulate
const users={
 A:{id:'aaaaaaaa-0000-4000-8000-000000000001',email:'ana@test.invalid',password:'parola-ana-123'},
 B:{id:'bbbbbbbb-0000-4000-8000-000000000002',email:'bogdan@test.invalid',password:'parola-bogdan-123'}
};
const db={
 profiles:{[users.A.id]:{id:users.A.id,display_name:'Ana Pop',avatar_path:null,bio:'Fondatoare Atelier',city:'Cluj',company:'Atelier',industries:'',objectives:'',updated_at:'2026-11-02T10:00:00Z'}},
 profiles_private:{[users.A.id]:{id:users.A.id,link:'',show_email_after_match:false,show_link_after_match:false,investor_min_budget:null,investor_max_budget:null,investor_stage:''}},
 profile_roles:[{user_id:users.A.id,role:'creator',activated_at:'2026-11-02T10:00:00Z'}],
 objects:{}
};
const tokens=new Map(),codes=new Map(),log=[];
const session=u=>{const t='tok-'+u.id+'-'+Math.random().toString(36).slice(2);tokens.set(t,u);return {access_token:t,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'ref-'+t,user:authUser(u)}};
const authUser=u=>({id:u.id,aud:'authenticated',role:'authenticated',email:u.email,email_confirmed_at:'2026-11-02T10:00:00Z',app_metadata:{provider:'email'},user_metadata:{},identities:[],created_at:'2026-11-02T10:00:00Z',updated_at:'2026-11-02T10:00:00Z'});
const who=req=>tokens.get((req.headers.authorization||'').replace(/^Bearer /,''))||null;

const send=(res,status,body,headers={})=>{res.writeHead(status,{'content-type':'application/json','access-control-allow-origin':'*','access-control-expose-headers':'*','x-supabase-api-version':'2024-01-01',...headers});res.end(body===undefined?'':typeof body==='string'||Buffer.isBuffer(body)?body:JSON.stringify(body))};
const readBody=req=>new Promise(r=>{const c=[];req.on('data',d=>c.push(d));req.on('end',()=>r(Buffer.concat(c)))});
const JPEG=Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==','base64');

const serveStatic=async(root,path,res)=>{
 const file=join(root,path==='/'?'index.html':path);
 try{const data=await readFile(file);res.writeHead(200,{'content-type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[extname(file)]||'application/octet-stream'});res.end(data)}catch{send(res,404,{})}
};
const demoServer=createServer((req,res)=>serveStatic(demoOut,new URL(req.url,ORIGIN).pathname,res));
await new Promise(r=>demoServer.listen(PORT+1,'127.0.0.1',r));
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,ORIGIN),path=url.pathname,method=req.method;
 if(method==='OPTIONS')return send(res,204,undefined,{'access-control-allow-methods':'GET,POST,PATCH,PUT,DELETE','access-control-allow-headers':'*'});
 const raw=await readBody(req),body=raw.length&&(req.headers['content-type']||'').includes('json')?JSON.parse(raw):{};
 if(!path.startsWith('/auth/')&&!path.startsWith('/rest/')&&!path.startsWith('/storage/')){
  return serveStatic(out,path,res);
 }
 log.push(`${method} ${path}${url.search}`);
 const me=who(req);
 // ---- Auth
 if(path==='/auth/v1/token'&&url.searchParams.get('grant_type')==='password'){
  const u=Object.values(users).find(u=>u.email===body.email&&u.password===body.password);
  return u?send(res,200,session(u)):send(res,400,{code:'invalid_credentials',error_code:'invalid_credentials',msg:'Invalid login credentials'});
 }
 if(path==='/auth/v1/token'&&url.searchParams.get('grant_type')==='pkce'){
  const u=codes.get(body.auth_code);if(!u||!body.code_verifier)return send(res,400,{code:'flow_state_not_found',msg:'invalid'});
  codes.delete(body.auth_code);return send(res,200,session(u));
 }
 if(path==='/auth/v1/token'&&url.searchParams.get('grant_type')==='refresh_token'){const t=String(body.refresh_token||'').replace(/^ref-/,'');const u=tokens.get(t);return u?send(res,200,session(u)):send(res,400,{code:'refresh_token_not_found'})}
 if(path==='/auth/v1/user'&&method==='GET')return me?send(res,200,authUser(me)):send(res,401,{code:'no_authorization'});
 if(path==='/auth/v1/user'&&method==='PUT'){if(!me)return send(res,401,{});if(body.password)me.password=body.password;return send(res,200,authUser(me))}
 if(path==='/auth/v1/logout'){tokens.delete((req.headers.authorization||'').replace(/^Bearer /,''));return send(res,204)}
 if(path==='/auth/v1/recover'){const u=Object.values(users).find(u=>u.email===body.email);if(u)codes.set('recovery-code-'+u.id.slice(0,8),u);return send(res,200,{})}
 // ---- PostgREST (proprietar = utilizatorul din token, ca RLS)
 const rest=path.match(/^\/rest\/v1\/(\w+)$/);
 if(rest){
  if(!me)return send(res,401,{code:'42501'});
  const table=rest[1],id=(url.searchParams.get('id')||url.searchParams.get('user_id')||'').replace(/^eq\./,'');
  const single=(req.headers.accept||'').includes('vnd.pgrst.object');
  const reply=rows=>single?(rows.length===1?send(res,200,rows[0]):send(res,406,{code:'PGRST116',message:'0 rows'})):send(res,200,rows);
  if(table==='profiles'&&method==='GET')return reply(id?[db.profiles[id]].filter(Boolean):Object.values(db.profiles));
  if(table==='profiles_private'&&method==='GET')return reply(id===me.id&&db.profiles_private[id]?[db.profiles_private[id]]:[]);
  if(table==='profile_roles'&&method==='GET')return reply(db.profile_roles.filter(r=>!id||r.user_id===id));
  if((table==='profiles'||table==='profiles_private')&&method==='PATCH'){
   if(id!==me.id||!db[table][id])return send(res,200,[]);
   Object.assign(db[table][id],body);return send(res,200,[{id}]);
  }
  if(table==='profile_roles'&&method==='POST'){
   if(body.user_id!==me.id||!['creator','investor'].includes(body.role))return send(res,403,{code:'42501'});
   if(db.profile_roles.some(r=>r.user_id===me.id&&r.role===body.role))return send(res,409,{code:'23505'});
   db.profile_roles.push({...body,activated_at:new Date().toISOString()});return send(res,201,'');
  }
 }
 if(path==='/rest/v1/rpc/complete_profile'){
  if(!me)return send(res,401,{});if(db.profiles[me.id])return send(res,409,{code:'23505'});
  db.profiles[me.id]={id:me.id,display_name:body.p_display_name,avatar_path:null,bio:'',city:'',company:'',industries:'',objectives:'',updated_at:new Date().toISOString()};
  db.profiles_private[me.id]={id:me.id,link:'',show_email_after_match:false,show_link_after_match:false,investor_min_budget:null,investor_max_budget:null,investor_stage:''};
  db.profile_roles.push({user_id:me.id,role:body.p_role,activated_at:new Date().toISOString()});return send(res,200,'');
 }
 // ---- Storage
 const sign=path.match(/^\/storage\/v1\/object\/sign\/avatars\/(.+)$/);
 if(sign&&method==='POST'){if(!me)return send(res,400,{statusCode:'403',error:'Unauthorized'});return send(res,200,{signedURL:`/object/sign/avatars/${sign[1]}?token=signed-${Date.now()}`})}
 if(sign&&method==='GET')return send(res,200,JPEG,{'content-type':'image/jpeg'});
 const obj=path.match(/^\/storage\/v1\/object\/avatars\/(.+)$/);
 if(obj&&(method==='POST'||method==='PUT')){if(!me||obj[1]!==`${me.id}/avatar.jpg`)return send(res,403,{statusCode:'403',error:'Unauthorized',message:'new row violates row-level security policy'});db.objects[obj[1]]=raw.length;return send(res,200,{Key:'avatars/'+obj[1]})}
 return send(res,404,{message:'not mocked',path});
});
await new Promise(r=>server.listen(PORT,'127.0.0.1',r));

// ---------------------------------------------------------------------------
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:390,height:844}});
const page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errors.push(m.text())});
const shot=async n=>{if(process.env.E2E_SHOTS)await page.screenshot({path:join(process.env.E2E_SHOTS,n+'.png'),fullPage:true})};
let steps=0;const step=async(name,fn)=>{await fn();steps++;console.log('ok -',name)};
const text=()=>page.locator('body').innerText();
const ls=()=>page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)])));
const login=async u=>{await page.getByLabel('Email',{exact:true}).fill(u.email);await page.getByLabel('Parolă',{exact:true}).fill(u.password);await page.getByRole('button',{name:'Intră în cont'}).click()};

try{
 await step('demo pornește normal și oferă intrarea în contul real',async()=>{
  await page.goto(ORIGIN+'/');await page.getByRole('button',{name:'Demo'}).click();
  await page.getByRole('button',{name:/Cont real · mediu de test/}).click();
  await page.getByRole('heading',{name:/Bine ai/}).waitFor();await shot('1-login');
 });
 await step('parolă greșită: mesaj generic',async()=>{
  await login({...users.A,password:'gresita-123456'});await page.getByText('Email sau parolă incorectă.').waitFor();
 });
 await step('autentificare A → acasă și profil propriu',async()=>{
  await login(users.A);await page.getByRole('heading',{name:/Bună, Ana/}).waitFor();
  await page.getByRole('button',{name:'Profil',exact:true}).last().click();
  await page.getByRole('heading',{name:'Ana Pop'}).waitFor();
  const t=await text();assert.ok(t.includes('Activează rolul Investitor'));assert.ok(!t.includes('Mod Investitor'));
 });
 await step('sesiunea rămâne după reîncărcare',async()=>{
  await page.reload();await page.getByRole('heading',{name:'Ana Pop'}).waitFor();await shot('2-profil');
 });
 await step('editarea profilului se salvează în baza de date simulată',async()=>{
  await page.getByRole('button',{name:'Editează profilul'}).click();
  await page.getByLabel('Descriere profesională').fill('Fondatoare și mentor');
  await page.getByLabel('Link adițional').fill('https://exemplu.ro/ana');
  await page.getByRole('button',{name:'Salvează modificările'}).click();
  await page.getByText('Profil și preferințe salvate.').waitFor();
  assert.equal(db.profiles[users.A.id].bio,'Fondatoare și mentor');assert.equal(db.profiles_private[users.A.id].link,'https://exemplu.ro/ana');
  assert.equal(db.profiles_private[users.A.id].show_email_after_match,false,'contact ascuns implicit');
 });
 await step('fotografia se încarcă în folderul propriu și se afișează prin URL temporar',async()=>{
  await page.getByRole('button',{name:'Editează profilul'}).click();
  await page.locator('input[type=file]').setInputFiles({name:'poza.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64')});
  await page.getByRole('button',{name:'Schimbă poza'}).waitFor();
  await page.getByText('Profil și preferințe salvate.').waitFor({state:'detached'});
  await page.getByRole('button',{name:'Salvează modificările'}).click();await page.getByText('Profil și preferințe salvate.').waitFor();
  assert.ok(db.objects[`${users.A.id}/avatar.jpg`]>0);assert.equal(db.profiles[users.A.id].avatar_path,`${users.A.id}/avatar.jpg`);
  const src=await page.locator('.large-avatar img').getAttribute('src');assert.ok(src.includes('/object/sign/avatars/')&&src.includes('token='),'URL semnat, nu public');
 });
 await step('activarea rolului Investitor și comutarea modului',async()=>{
  await page.getByRole('button',{name:'Activează rolul Investitor'}).click();
  await page.getByText('nu înseamnă statut de investitor verificat').waitFor();
  await page.getByRole('button',{name:'Activează rolul',exact:true}).click();
  await page.getByText('Rolul Investitor a fost activat.').waitFor();
  assert.equal(db.profile_roles.filter(r=>r.user_id===users.A.id).length,2);
  await page.getByRole('tab',{name:'Mod Investitor'}).first().waitFor();
  assert.equal(await page.getByRole('tab',{name:'Mod Investitor'}).first().getAttribute('aria-selected'),'true');
  await page.getByRole('button',{name:'Explore',exact:true}).waitFor();
  await page.getByRole('tab',{name:'Mod Creator'}).first().click();await page.getByRole('button',{name:'Proiecte',exact:true}).waitFor();
  await page.reload();await page.getByRole('button',{name:'Proiecte',exact:true}).waitFor();await shot('3-profil-ambele-roluri');
 });
 await step('modulele neimplementate trimit spre demo; selectorul demo nu schimbă contul real',async()=>{
  await page.getByRole('button',{name:'Marketplace'}).click();
  await page.getByText('fără un proiect publicat').waitFor();await shot('4-marketplace');
  await page.getByRole('button',{name:'Explorează în modul demo'}).click();
  await page.getByRole('button',{name:/^Demo/}).waitFor();
  assert.ok(!(await text()).includes('Ana Pop'),'datele reale nu apar în demo');
  await page.getByRole('button',{name:/^Demo/}).click();
  const select=page.getByLabel('Alege creatorul demo');await select.selectOption({index:1});
  await page.getByRole('button',{name:/^Demo/}).click();
  await page.getByRole('button',{name:/Cont real · mediu de test/}).click();
  await page.getByRole('button',{name:/Cont real · Ana/}).waitFor();
 });
 await step('deconectare: datele private dispar din interfață și din browser',async()=>{
  await page.getByRole('button',{name:/Cont real · Ana/}).click();await page.getByRole('button',{name:'Ieși din cont'}).click();
  await page.getByText('Te-ai deconectat.').waitFor();
  const t=await text();for(const s of ['Ana Pop','Fondatoare și mentor','ana@test.invalid','exemplu.ro/ana'])assert.ok(!t.includes(s),s);
  const store=await ls();assert.ok(!('buildit-real-mode' in store));assert.ok(!Object.keys(store).some(k=>k==='buildit-auth'&&store[k].includes('access_token')),'sesiune eliminată');
 });
 await step('B (cont fără profil) completează profilul; nu vede nimic din contul A',async()=>{
  await login(users.B);await page.getByText('COMPLETEAZĂ PROFILUL').waitFor();
  const t=await text();for(const s of ['Ana Pop','Fondatoare','exemplu.ro/ana'])assert.ok(!t.includes(s),s);
  await page.getByRole('button',{name:'Creează profilul'}).click();await page.getByRole('alert').filter({hasText:'Completează numele'}).waitFor();
  await page.getByLabel('Nume').fill('Bogdan Ionescu');await page.getByRole('button',{name:'Creează profilul'}).click();
  await page.getByRole('alert').filter({hasText:'Alege rolul inițial'}).waitFor();
  await page.getByRole('radio',{name:'Investitor'}).click();await page.getByRole('button',{name:'Creează profilul'}).click();
  await page.getByRole('heading',{name:/Bună, Bogdan/}).waitFor();
  assert.equal(db.profile_roles.find(r=>r.user_id===users.B.id).role,'investor');
  await page.getByRole('button',{name:'Explore',exact:true}).waitFor();
 });
 await step('modul salvat de A nu se aplică lui B',async()=>{
  await page.getByRole('button',{name:'Profil',exact:true}).last().click();
  await page.getByRole('heading',{name:'Bogdan Ionescu'}).waitFor();
  const t=await text();assert.ok(t.includes('Activează rolul Creator'));assert.ok(!t.includes('Mod Creator'));
 });
 await step('resetarea parolei: link de recuperare (?code=…, fără alți parametri) → parolă nouă → URL curățat',async()=>{
  await page.getByRole('button',{name:'Ieși din cont'}).click();await page.getByText('Te-ai deconectat.').waitFor();
  await page.getByRole('button',{name:'Ai uitat parola?'}).click();
  await page.getByLabel('Email').fill(users.A.email);await page.getByRole('button',{name:'Trimite linkul de resetare'}).click();
  await page.getByText('Dacă există un cont pentru această adresă').waitFor();
  await page.goto(`${ORIGIN}/?code=recovery-code-${users.A.id.slice(0,8)}`);
  await page.getByRole('heading',{name:/parolă nouă/}).waitFor();
  assert.equal(new URL(page.url()).search,'','parametrii de autentificare au fost eliminați');
  await page.getByLabel('Parolă nouă (minimum 10 caractere)').fill('parola-noua-ana-1');await page.getByLabel('Confirmă parola nouă').fill('parola-noua-ana-1');
  await page.getByRole('button',{name:'Salvează parola'}).click();await page.getByText('Parola a fost schimbată.').waitFor();
  assert.equal(users.A.password,'parola-noua-ana-1');
 });
 await step('link expirat: mesaj clar, fără rută stricată',async()=>{
  await page.goto(`${ORIGIN}/?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid#home`);
  await page.getByText('Linkul a expirat sau a fost deja folosit').waitFor();assert.equal(new URL(page.url()).search,'');
 });
 await step('build fără configurare: doar demo, fără cereri spre Supabase',async()=>{
  const p2=await (await browser.newContext()).newPage();const before=log.length;
  await p2.goto(`http://127.0.0.1:${PORT+1}/`);await p2.getByRole('button',{name:'Demo'}).click();
  await p2.getByText('Intră în contul Creator selectat').waitFor();
  assert.ok(!(await p2.locator('body').innerText()).includes('Cont real'));
  assert.equal(log.length,before,'nicio cerere către API');
 });
 assert.deepEqual(errors,[],'erori în consola browserului');
 console.log(`${steps} pași E2E trecuți (Chromium, server Supabase simulat local).`);
}finally{
 await browser.close();server.close();demoServer.close();rmSync(out,{recursive:true,force:true});rmSync(demoOut,{recursive:true,force:true});
}
