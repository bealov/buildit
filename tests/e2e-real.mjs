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
 B:{id:'bbbbbbbb-0000-4000-8000-000000000002',email:'bogdan@test.invalid',password:'parola-bogdan-123'},
 C:{id:'cccccccc-0000-4000-8000-000000000003',email:'cora@test.invalid',password:'parola-cora-12345'}
};
const db={
 profiles:{[users.A.id]:{id:users.A.id,display_name:'Ana Pop',avatar_path:null,bio:'Fondatoare Atelier',city:'Cluj',company:'Atelier',industries:'',objectives:'',updated_at:'2026-11-02T10:00:00Z'}},
 profiles_private:{[users.A.id]:{id:users.A.id,link:'',show_email_after_match:false,show_link_after_match:false,investor_min_budget:null,investor_max_budget:null,investor_stage:''}},
 profile_roles:[{user_id:users.A.id,role:'creator',activated_at:'2026-11-02T10:00:00Z'}],
 objects:{}
};
// Match · Descoperă oameni: profiluri suplimentare (doar în serverul simulat)
const person=(id,name,extra={})=>({id,display_name:name,avatar_path:null,bio:'',city:'',company:'',industries:'',objectives:'',wants_to_develop:false,wants_to_join:true,skills:[],desired_roles:[],weekly_hours:null,updated_at:'2026-11-02T10:00:00Z',created_at:'2026-11-10T10:00:00Z',...extra});
const extraPeople=[
 person(users.C.id,'Cora Pop',{city:'Iași',wants_to_develop:true,skills:['Programare','Design'],desired_roles:['membru_echipa'],weekly_hours:20,avatar_path:`${users.C.id}/avatar.jpg`,created_at:'2026-11-20T10:00:00Z',bio:'Dezvoltatoare web.'}),
 person('dddddddd-0000-4000-8000-000000000004','Dan Nou',{created_at:'2026-11-19T10:00:00Z'}),
 person('eeeeeeee-0000-4000-8000-000000000005','Emil Investitor',{skills:['Finanțe'],weekly_hours:30}),
 person('ffffffff-0000-4000-8000-000000000006','Filip Solo',{wants_to_join:false,skills:['Marketing'],weekly_hours:40}),
 ...Array.from({length:12},(_,i)=>person(`99999999-0000-4000-8000-0000000000${String(i).padStart(2,'0')}`,`Membru ${i+1}`,{skills:['Vânzări'],weekly_hours:5,created_at:`2026-11-0${(i%9)+1}T1${i%10}:00:00Z`}))
];
const extraRoles=[{user_id:users.C.id,role:'creator'},{user_id:'dddddddd-0000-4000-8000-000000000004',role:'creator'},{user_id:'eeeeeeee-0000-4000-8000-000000000005',role:'investor'},{user_id:'ffffffff-0000-4000-8000-000000000006',role:'creator'},...extraPeople.slice(4).map(p=>({user_id:p.id,role:'creator'}))];
const sim={failDiscover:false};
function discoverPeople(me,b){
 const fold=v=>String(v).toLocaleLowerCase('ro').replace(/[ăâ]/g,'a').replace(/î/g,'i').replace(/[șş]/g,'s').replace(/[țţ]/g,'t');
 const skill=String(b.p_skill??'').trim(),role=String(b.p_role??'').trim(),lim=Math.min(Math.max(Number(b.p_limit??12)||12,1),50);
 let rows=Object.values(db.profiles).filter(p=>p.id!==me.id&&p.wants_to_join&&db.profile_roles.some(r=>r.user_id===p.id&&r.role==='creator'))
  .filter(p=>!skill||(p.skills||[]).some(s=>fold(s).includes(fold(skill))))
  .filter(p=>!role||(p.desired_roles||[]).includes(role))
  .filter(p=>b.p_min_hours==null||(p.weekly_hours!=null&&p.weekly_hours>=b.p_min_hours)||(p.weekly_hours==null&&b.p_include_unknown_hours))
  .sort((x,y)=>(y.created_at||'').localeCompare(x.created_at||'')||y.id.localeCompare(x.id));
 if(b.p_after_created_at&&b.p_after_id)rows=rows.filter(p=>(p.created_at||'')<b.p_after_created_at||((p.created_at||'')===b.p_after_created_at&&p.id<b.p_after_id));
 return rows.slice(0,lim).map(({id,display_name,avatar_path,bio,city,skills,desired_roles,weekly_hours,wants_to_develop,created_at})=>({id,display_name,avatar_path,bio,city,skills,desired_roles,weekly_hours,wants_to_develop,created_at}));
}
// ---- Proiecte (simulare a regulilor din 20261122000000_projects.sql)
const PROJECT_TEXT=['problem','solution','market','difference','business_model','marketing','growth_plan','objectives','team','traction'];
const FIN=['monthly_revenue','fixed_costs','variable_costs','initial_investment','investment_amount','monthly_growth_pct','unit_price','unit_cost'];
const LOOK=['colegi','parteneri','investitie'],STAGES=['','idee','in_dezvoltare','lansat'];
db.projects={};db.project_private={};let clock=0;
const stamp=()=>new Date(Date.parse('2026-11-22T10:00:00Z')+(++clock)*1000).toISOString().replace('Z','123+00:00');
const pgErr=(code,message)=>({error:{code,message}});
function projectInvestment(p){const v=db.project_private[p.id];return p.looking_for.includes('investitie')&&v&&!v.unknown_financials.includes('investment_amount')&&v.investment_amount!=null?Number(v.investment_amount):null}
function validProject(p,v){
 if(!STAGES.includes(p.stage))return pgErr('23514','stage');
 if(p.looking_for.some(x=>!LOOK.includes(x)))return pgErr('23514','looking_for');
 for(const k of FIN){const x=v[k];if(x!=null&&!/^\d+(\.\d{1,2})?$/.test(String(x)))return pgErr('23514',k)}
 if(v.plan_links.some(l=>!/^https?:\/\/\S+$/i.test(l)))return pgErr('23514','links');
 if(p.status==='published'&&!(p.title.trim()&&p.summary.trim()&&p.industry&&p.stage&&(p.is_remote||p.city.trim())&&p.looking_for.length))return pgErr('23514','projects_publish_required');
 return null;
}
function saveProject(me,b){
 const pub=b.p_public||{},priv=b.p_private||{};
 let p;
 if(!b.p_id){
  if(!db.profile_roles.some(r=>r.user_id===me.id&&r.role==='creator'))return pgErr('42501','new row violates row-level security policy');
  if(Object.values(db.projects).filter(x=>x.owner_id===me.id).length>=20)return pgErr('PT422','limit');
  p={id:'proj-'+Math.random().toString(36).slice(2,10),owner_id:me.id,created_at:stamp(),published_at:null};
 }else{
  const cur=db.projects[b.p_id];
  if(!cur||cur.owner_id!==me.id)return pgErr('42501','not owner');
  if(cur.updated_at!==b.p_expected_updated_at)return pgErr('PT409','conflict');
  p={...cur};
 }
 Object.assign(p,{status:b.p_status,title:pub.title??'',summary:pub.summary??'',industry:pub.industry??'',stage:pub.stage??'',city:pub.city??'',is_remote:!!pub.is_remote,looking_for:LOOK.filter(x=>(pub.looking_for||[]).includes(x))},Object.fromEntries(PROJECT_TEXT.map(k=>[k,pub[k]??''])));
 if((pub.looking_for||[]).some(x=>!LOOK.includes(x)))return pgErr('23514','looking_for');
 const v={...Object.fromEntries(FIN.map(k=>[k,priv[k]??null])),unknown_financials:[...new Set(priv.unknown_financials||[])].sort(),plan_links:priv.plan_links||[]};
 const err=validProject(p,v);if(err)return err;
 const prev=db.projects[p.id];
 if(p.status==='published'&&prev?.status!=='published')p.published_at=stamp();
 p.updated_at=stamp();db.projects[p.id]=p;db.project_private[p.id]=v;p.investment_public=projectInvestment(p);
 return {data:[{id:p.id,status:p.status,updated_at:p.updated_at}]};
}
function setProjectStatus(me,b){
 const cur=db.projects[b.p_id];
 if(!cur||cur.owner_id!==me.id)return pgErr('42501','not owner');
 if(cur.updated_at!==b.p_expected_updated_at)return pgErr('PT409','conflict');
 const next={...cur,status:b.p_status};const err=validProject(next,db.project_private[cur.id]);if(err)return err;
 if(b.p_status==='published'&&cur.status!=='published')next.published_at=stamp();
 next.updated_at=stamp();db.projects[cur.id]=next;return {data:[{id:next.id,status:next.status,updated_at:next.updated_at}]};
}
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
 // ---- Proiecte (RLS: ciorne doar pentru proprietar; date private doar pentru proprietar)
 if(path==='/rest/v1/rpc/save_project'||path==='/rest/v1/rpc/set_project_status'){
  if(!me)return send(res,401,{code:'42501'});
  const out=path.endsWith('save_project')?saveProject(me,body):setProjectStatus(me,body);
  return out.error?send(res,out.error.code==='PT409'?409:out.error.code==='PT422'?422:400,out.error):send(res,200,out.data);
 }
 if(path==='/rest/v1/projects'||path==='/rest/v1/project_private'){
  if(!me)return send(res,401,{code:'42501'});
  const q=k=>(url.searchParams.get(k)||'').replace(/^eq\./,'');
  const single=(req.headers.accept||'').includes('vnd.pgrst.object');
  const reply=rows=>single?(rows.length===1?send(res,200,rows[0]):send(res,406,{code:'PGRST116',message:'0 rows'})):send(res,200,rows);
  if(path==='/rest/v1/project_private'){
   const p=db.projects[q('project_id')];return reply(p&&p.owner_id===me.id?[db.project_private[p.id]]:[]);
  }
  const visible=Object.values(db.projects).filter(p=>p.owner_id===me.id||p.status==='published');
  if(method==='GET'){
   let rows=visible;if(q('id'))rows=rows.filter(p=>p.id===q('id'));if(q('owner_id'))rows=rows.filter(p=>p.owner_id===q('owner_id'));
   return reply(rows.sort((a,b)=>b.updated_at.localeCompare(a.updated_at)).slice(0,Number(url.searchParams.get('limit')||1000)));
  }
  if(method==='DELETE'){
   const p=db.projects[q('id')];
   if(p&&p.owner_id===me.id&&p.status==='draft'&&(!q('status')||q('status')==='draft')){delete db.projects[p.id];delete db.project_private[p.id];return send(res,200,[{id:p.id}])}
   return send(res,200,[]);
  }
 }
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
 if(path==='/rest/v1/rpc/discover_people'){
  if(!me)return send(res,401,{code:'42501',message:'permission denied for function discover_people'});
  if(sim.failDiscover)return send(res,503,{code:'PGRST002',message:'Service unavailable'});
  return send(res,200,discoverPeople(me,body));
 }
 // ---- Storage
 if(path==='/storage/v1/object/sign/avatars'&&method==='POST'){
  if(!me)return send(res,400,{statusCode:'403',error:'Unauthorized'});
  return send(res,200,(body.paths||[]).map(p=>({path:p,error:null,signedURL:`/object/sign/avatars/${p}?token=batch-${Date.now()}`})));
 }
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
const context=await browser.newContext({viewport:{width:Number(process.env.E2E_WIDTH||390),height:844}});
const page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errors.push(m.text())});
const shot=async n=>{if(process.env.E2E_SHOTS)await page.waitForTimeout(400),await page.screenshot({path:join(process.env.E2E_SHOTS,n+'.png'),fullPage:true})};
let steps=0;const step=async(name,fn)=>{try{await fn()}catch(e){if(process.env.E2E_DEBUG){await page.screenshot({path:process.env.E2E_DEBUG,fullPage:true});console.log('DEBUG',await page.evaluate(()=>JSON.stringify({dialogs:[...document.querySelectorAll('dialog')].map(d=>({open:d.open,text:d.innerText.slice(0,80)})),labels:[...document.querySelectorAll('label')].filter(l=>l.innerText.includes('Descriere')).map(l=>l.outerHTML.slice(0,300))})))}throw e}steps++;console.log('ok -',name)};
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
 await step('Creator fără proiect: „Vreau să mă alătur” cu competențe, rol și ore se salvează și rămâne după reîncărcare',async()=>{
  await page.getByRole('button',{name:'Editează profilul'}).click();
  const toggle=name=>page.locator('label.toggle',{hasText:name}).locator('input');
  assert.equal(await toggle('Vreau să mă alătur').isChecked(),false,'profil existent fără intenții');
  await toggle('Vreau să mă alătur').check();
  await page.getByRole('button',{name:'Marketing',exact:true}).click();
  await page.getByLabel('Altă competență').fill('Juridic');await page.getByRole('button',{name:'Adaugă',exact:true}).click();
  await page.getByRole('button',{name:'Cofondator'}).click();
  await page.getByLabel('Disponibilitate (ore pe săptămână)').fill('12');
  await page.getByRole('button',{name:'Salvează modificările'}).click();await page.getByText('Profil și preferințe salvate.').waitFor();
  const row=db.profiles[users.A.id];
  assert.deepEqual([row.wants_to_develop,row.wants_to_join,row.skills,row.desired_roles,row.weekly_hours],[false,true,['Marketing','Juridic'],['cofondator'],12]);
  assert.deepEqual(db.profile_roles.filter(r=>r.user_id===users.A.id).map(r=>r.role),['creator'],'intențiile nu schimbă rolurile de cont');
  await page.reload();
  assert.equal(await toggle('Vreau să mă alătur').isChecked(),true,'bifa rămâne după reîncărcare');
  assert.equal(await page.getByLabel('Disponibilitate (ore pe săptămână)').inputValue(),'12');
  await page.locator('.bottom-nav button',{hasText:'Profil'}).click();await page.getByText('Vrea să se alăture unui proiect').waitFor();
  assert.ok((await text()).includes('12 ore pe săptămână'));
  await page.getByText('Profil și preferințe salvate.').waitFor({state:'detached'}).catch(()=>{});
 });
 await step('fotografia se încarcă în folderul propriu și se afișează prin URL temporar',async()=>{
  await page.getByRole('button',{name:'Editează profilul'}).click();
  await page.locator('input[type=file]').setInputFiles({name:'poza.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64')});
  // Fereastra de încadrare: „Salvează fotografia” încarcă direct rezultatul decupat.
  await page.locator('dialog.crop-dialog[open]').waitFor();
  await page.getByRole('button',{name:'Salvează fotografia'}).click();
  await page.getByText('Fotografia de profil a fost salvată.').waitFor();
  await page.locator('dialog.crop-dialog').waitFor({state:'detached'});
  assert.ok(db.objects[`${users.A.id}/avatar.jpg`]>0);assert.equal(db.profiles[users.A.id].avatar_path,`${users.A.id}/avatar.jpg`);
  // Previzualizarea din formular arată imediat poza încadrată; antetul se reîncarcă prin URL semnat.
  await page.waitForFunction(()=>document.querySelector('header .avatar img')?.getAttribute('src')?.includes('/object/sign/avatars/'));
  const src=await page.locator('header .avatar img').getAttribute('src');assert.ok(src.includes('/object/sign/avatars/')&&src.includes('token='),'URL semnat, nu public');
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
 // ---- Match · Descoperă oameni (server simulat; regulile reale sunt testate în test:db)
 const grid=()=>page.locator('.people-grid');
 const cards=()=>page.locator('.people-grid .person-card');
 const names=async()=>(await cards().locator('strong').allInnerTexts());
 const waitCards=async n=>{await page.waitForFunction(k=>document.querySelectorAll('.people-grid .person-card').length===k&&!document.body.innerText.includes('Se caută persoane'),n)};
 await step('Descoperă oameni (A, mod Creator): profilurile reale cu „Vreau să mă alătur”, fără propriul profil, fără Investitori sau Creatori care nu vor',async()=>{
  for(const p of extraPeople)db.profiles[p.id]=p;db.profile_roles.push(...extraRoles);
  for(const p of Object.values(db.profiles))p.created_at??='2026-11-02T10:00:00Z';
  db.profiles[users.A.id].wants_to_join=true;
  await page.getByRole('button',{name:'Match',exact:true}).click();
  await page.getByRole('heading',{name:'Descoperă oameni'}).waitFor();
  await waitCards(12);
  const first=await names();
  assert.ok(first.includes('Cora Pop')&&first.includes('Dan Nou'),'Creatori care vor să se alăture');
  for(const n of ['Ana Pop','Emil Investitor','Filip Solo'])assert.ok(!first.includes(n),'exclus: '+n);
  const t=await text();assert.ok(!t.includes('@test.invalid'),'fără emailuri');
  assert.ok(await page.getByText('Necompletată').first().isVisible(),'profil incomplet: disponibilitatea nu devine 0');
  for(const b of ['Invită','Mesaj','Like'])assert.equal(await page.getByRole('button',{name:b}).count(),0,'fără buton '+b);
  const img=await cards().filter({hasText:'Cora Pop'}).locator('img').getAttribute('src');assert.ok(img.includes('/object/sign/avatars/')&&img.includes('token=batch-'),'fotografii semnate într-un singur apel');
  await shot('5-descopera-oameni');
 });
 await step('paginare: „Arată mai multe” aduce restul, fără dubluri',async()=>{
  await page.getByRole('button',{name:'Arată mai multe'}).click();await waitCards(14);
  const all=await names();assert.equal(new Set(all).size,14);
  assert.equal(await page.getByRole('button',{name:'Arată mai multe'}).count(),0);
 });
 await step('filtre: competență, rol, minimum ore (necompletat ≠ 0), resetare, valoare invalidă',async()=>{
  await page.getByLabel('Competență').fill('PROGRAM');await waitCards(1);assert.deepEqual(await names(),['Cora Pop']);
  await page.getByLabel('Competență').fill('zzz');await page.getByText('Nicio persoană nu corespunde filtrelor').waitFor();
  await page.getByRole('button',{name:'Resetează filtrele'}).first().click();await waitCards(12);
  await page.getByLabel('Rol dorit').selectOption('membru_echipa');await waitCards(1);assert.deepEqual(await names(),['Cora Pop']);
  await page.getByRole('button',{name:'Resetează filtrele'}).first().click();await waitCards(12);
  await page.getByLabel('Minimum ore/săptămână').fill('10');await waitCards(1);assert.deepEqual(await names(),['Cora Pop'],'Dan (necompletat) nu este tratat ca 0, membrii cu 5 ore sunt excluși');
  await page.getByLabel('Include și persoanele fără disponibilitate completată').check();await waitCards(2);
  assert.deepEqual((await names()).sort(),['Cora Pop','Dan Nou']);
  await page.getByLabel('Minimum ore/săptămână').fill('0');await page.getByText('între 1 și 168').waitFor();
  await page.getByRole('button',{name:'Resetează filtrele'}).first().click();await waitCards(12);
 });
 await step('„Vezi profilul”: detalii publice, fără contact; la revenire filtrele și lista rămân',async()=>{
  await page.getByLabel('Rol dorit').selectOption('membru_echipa');await waitCards(1);
  await cards().filter({hasText:'Cora Pop'}).getByRole('button',{name:'Vezi profilul'}).click();
  await page.getByRole('heading',{name:'Cora Pop',level:2}).waitFor();
  const t=await text();for(const s of ['Dezvoltatoare web.','Programare','Design','Membru al echipei','20 de ore','Iași','Contactul nu este afișat'])assert.ok(t.includes(s),s);
  assert.ok(!t.includes('@test.invalid'));
  assert.ok((await page.locator('.large-avatar img').getAttribute('src')).includes('/object/sign/avatars/'));
  await page.getByRole('button',{name:'Înapoi la Descoperă oameni'}).click();
  await waitCards(1);assert.equal(await page.getByLabel('Rol dorit').inputValue(),'membru_echipa');
  await page.getByRole('button',{name:'Resetează filtrele'}).first().click();await waitCards(12);
  await shot('6-profil-public');
 });
 await step('erori cu reîncercare și listă goală fără profiluri fictive',async()=>{
  sim.failDiscover=true;await page.getByLabel('Rol dorit').selectOption('cofondator');
  await page.getByText('Lista nu a putut fi încărcată').waitFor();await page.getByText('Cod tehnic: PGRST002').waitFor();
  sim.failDiscover=false;await page.getByRole('button',{name:'Încearcă din nou'}).click();
  await page.getByText('Nicio persoană nu corespunde filtrelor').waitFor();
  const saved=Object.values(db.profiles).filter(p=>p.wants_to_join&&p.id!==users.A.id);saved.forEach(p=>p.wants_to_join=false);
  await page.getByRole('button',{name:'Resetează filtrele'}).first().click();
  await page.getByText('Încă nu există alți creatori care vor să se alăture').waitFor();
  assert.equal(await cards().count(),0);
  saved.forEach(p=>p.wants_to_join=true);
 });
 await step('al doilea cont (C): vede profilul lui A, nu se vede pe sine',async()=>{
  await page.getByRole('button',{name:/Cont real · Ana/}).click();await page.getByRole('button',{name:'Ieși din cont'}).click();
  await page.getByText('Te-ai deconectat.').waitFor();
  await login(users.C);await page.getByRole('heading',{name:/Bună, Cora/}).waitFor();
  await page.getByRole('button',{name:'Match',exact:true}).click();await waitCards(12);
  const n=await names();assert.ok(n.includes('Ana Pop'),'A este vizibil pentru C');assert.ok(!n.includes('Cora Pop'),'C nu se vede pe sine');
 });
 await step('Investitor (B): Match rămâne neschimbat (în pregătire)',async()=>{
  await page.getByRole('button',{name:/Cont real · Cora/}).click();await page.getByRole('button',{name:'Ieși din cont'}).click();
  await page.getByText('Te-ai deconectat.').waitFor();
  await login(users.B);await page.getByRole('heading',{name:/Bună, Bogdan/}).waitFor();
  await page.getByRole('button',{name:'Match',exact:true}).click();
  await page.getByText('Match-ul pentru conturile reale este în pregătire').waitFor();
  assert.equal(await grid().count(),0);
 });
 // ---- Proiecte reale (server simulat; regulile reale sunt testate în test:db)
 const input=label=>page.locator('label.field').filter({has:page.locator('span',{hasText:new RegExp('^'+label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$')})}).locator('input,textarea');
 const goStep=async n=>{for(let i=0;i<12;i++){const label=await page.locator('.eyebrow').filter({hasText:/PASUL \d DIN 6/}).first().innerText();const cur=Number(label.match(/PASUL (\d)/)[1])-1;if(cur===n)return;await page.getByRole('button',{name:cur<n?'Continuă →':'Înapoi',exact:true}).click();await page.locator('.eyebrow').filter({hasText:`PASUL ${cur<n?cur+2:cur} DIN 6`}).waitFor()}throw new Error('pasul '+n+' nu a fost atins')};
 const projectId=()=>Object.keys(db.projects).find(id=>db.projects[id].owner_id===users.A.id);
 await step('proiecte: Creator salvează o ciornă incompletă, care rămâne după reîncărcare',async()=>{
  await page.getByRole('button',{name:/Cont real · Bogdan/}).click();await page.getByRole('button',{name:'Ieși din cont'}).click();
  await page.getByText('Te-ai deconectat.').waitFor();
  await login(users.A);await page.getByRole('heading',{name:/Bună, Ana/}).waitFor();
  await page.getByRole('button',{name:'Proiecte',exact:true}).click();
  await page.getByText('Nu ai încă proiecte').waitFor();
  await page.getByRole('button',{name:'Creează un proiect'}).click();
  await input('Titlul proiectului').fill('Atelier verde');
  await page.getByRole('button',{name:'Salvează ciorna'}).click();await page.getByText('Ciorna a fost salvată.').waitFor();
  const id=projectId();assert.ok(id);assert.equal(db.projects[id].status,'draft');assert.equal(db.projects[id].summary,'');
  assert.ok(page.url().endsWith('#project-edit/'+id));
  await page.reload();await page.getByText('PASUL 1 DIN 6').waitFor();
  assert.equal(await input('Titlul proiectului').inputValue(),'Atelier verde','persistă după reîncărcare');
 });
 await step('proiecte: publicarea incompletă este refuzată cu lista câmpurilor lipsă',async()=>{
  await goStep(5);await page.getByRole('button',{name:'Publică proiectul'}).click();
  await page.getByText(/Pentru publicare completează: descrierea scurtă, industria, stadiul, locația/).waitFor();
  assert.equal(db.projects[projectId()].status,'draft');
  await page.getByText('PASUL 1 DIN 6').waitFor();
 });
 await step('proiecte: 0, necunoscut și necompletat; maxim 2 zecimale; Remote; investiție; publicare',async()=>{
  await input('Descriere scurtă').fill('Mobilier din materiale reciclate.');
  await page.getByLabel('Industrie').selectOption('Producție');await page.getByLabel('Stadiu').selectOption('in_dezvoltare');
  await page.getByLabel('Remote / Online').check();
  await goStep(3);
  await input('Venit lunar estimat (€)').fill('0');
  await page.locator('.financial-field').filter({hasText:'Costuri fixe lunare'}).getByLabel('Nu am estimat încă').check();
  await input('Investiție căutată (€)').fill('25000,50');
  await input('Preț unitar (€), dacă se aplică').fill('1,234');
  await goStep(4);await page.getByLabel('Linkuri către planul de afaceri (câte unul pe rând)').fill('https://plan.example/secret');
  await goStep(5);
  await page.getByRole('button',{name:'Colegi',exact:true}).click();await page.getByRole('button',{name:'Investiție',exact:true}).click();
  await page.getByText('Investiție căutată: 25000,50 EUR').first().waitFor();
  await page.getByRole('button',{name:'Publică proiectul'}).click();
  await page.getByText(/Verifică „Preț unitar.*cel mult două zecimale/).waitFor();
  await input('Preț unitar (€), dacă se aplică').fill('12,5');
  await goStep(5);await page.getByRole('button',{name:'Publică proiectul'}).click();
  await page.getByText('Proiectul a fost publicat.').waitFor();
  await page.getByText('Investiție căutată: 25.000,5 EUR').waitFor();
  const id=projectId(),p=db.projects[id],v=db.project_private[id];
  assert.equal(p.status,'published');assert.ok(p.is_remote&&p.city==='');assert.deepEqual(p.looking_for,['colegi','investitie']);
  assert.equal(v.monthly_revenue,'0','zero');assert.equal(v.fixed_costs,null);assert.deepEqual(v.unknown_financials,['fixed_costs'],'neestimat');assert.equal(v.variable_costs,null,'necompletat');
  assert.equal(v.unit_price,'12.5');assert.deepEqual(v.plan_links,['https://plan.example/secret']);
  const t=await text();for(const s of ['Date private (vizibile doar ție)','Nu am estimat încă','Necompletat','0 EUR','https://plan.example/secret','Remote / Online'])assert.ok(t.includes(s),s);
  await shot('7-proiect-proprietar');
 });
 const asC=async fn=>{const ctx=await browser.newContext({viewport:{width:Number(process.env.E2E_WIDTH||390),height:844}});const p2=await ctx.newPage();
  await p2.goto(ORIGIN+'/');await p2.getByRole('button',{name:'Demo'}).click();await p2.getByRole('button',{name:/Cont real · mediu de test/}).click();
  await p2.getByLabel('Email',{exact:true}).fill(users.C.email);await p2.getByLabel('Parolă',{exact:true}).fill(users.C.password);await p2.getByRole('button',{name:'Intră în cont'}).click();
  await p2.getByRole('heading',{name:/Bună, Cora/}).waitFor();try{return await fn(p2)}finally{await ctx.close()}};
 await step('proiecte: alt utilizator vede proiectul publicat, proprietarul și investiția, dar nu finanțele, linkurile sau acțiunile',async()=>{
  const id=projectId();
  await asC(async p2=>{await p2.goto(ORIGIN+'/#project/'+id);await p2.getByRole('heading',{name:'Atelier verde'}).waitFor();
   const t=await p2.locator('body').innerText();
   for(const s of ['Mobilier din materiale reciclate.','Investiție căutată: 25.000,5 EUR','Ana Pop','Vezi profilul','Caută: Colegi · Investiție'])assert.ok(t.includes(s),s);
   for(const s of ['plan.example','Date private','Nu am estimat încă','Editează proiectul','Retrage din publicare','Șterge','@test.invalid'])assert.ok(!t.includes(s),'ascuns: '+s);
   await p2.getByRole('button',{name:/Vezi profilul/}).click();await p2.getByText('MATCH · PROFIL PUBLIC').waitFor();await p2.getByRole('heading',{name:'Ana Pop',level:2}).waitFor();
   if(process.env.E2E_SHOTS)await p2.goto(ORIGIN+'/#project/'+id),await p2.getByRole('heading',{name:'Atelier verde'}).waitFor(),await p2.screenshot({path:join(process.env.E2E_SHOTS,'8-proiect-alt-utilizator.png'),fullPage:true});});
 });
 await step('proiecte: editarea unui proiect publicat devine vizibilă doar după „Actualizează proiectul publicat”; suma investiției se păstrează',async()=>{
  const id=projectId();
  await page.getByRole('button',{name:'Editează proiectul'}).click();await page.getByText('Editează proiectul publicat').waitFor();
  await goStep(5);await page.getByRole('button',{name:'Investiție',exact:true}).click();await page.getByRole('button',{name:'Parteneri',exact:true}).click();
  await page.getByRole('button',{name:'Salvează modificările'}).click();
  await page.getByRole('heading',{name:'Actualizează proiectul publicat'}).waitFor();
  assert.deepEqual(db.projects[id].looking_for,['colegi','investitie'],'înainte de confirmare, versiunea publică nu se schimbă');
  await page.getByRole('button',{name:'Actualizează proiectul publicat'}).click();
  await page.getByText('Proiectul publicat a fost actualizat.').waitFor();
  assert.deepEqual(db.projects[id].looking_for,['colegi','parteneri']);assert.equal(db.projects[id].investment_public,null);
  assert.equal(Number(db.project_private[id].investment_amount),25000.5,'suma rămâne salvată privat');
  await asC(async p2=>{await p2.goto(ORIGIN+'/#project/'+id);await p2.getByRole('heading',{name:'Atelier verde'}).waitFor();assert.ok(!(await p2.locator('body').innerText()).includes('Investiție'),'fără investiție: nu apare public')});
 });
 await step('proiecte: „Renunță” păstrează versiunea anterioară',async()=>{
  const id=projectId();
  await page.getByRole('button',{name:'Editează proiectul'}).click();await input('Titlul proiectului').fill('Titlu abandonat');
  await page.getByRole('button',{name:'Renunță'}).click();await page.getByRole('button',{name:'Renunță la modificări'}).click();
  await page.getByRole('heading',{name:'Atelier verde'}).waitFor();assert.equal(db.projects[id].title,'Atelier verde');
 });
 await step('proiecte: conflict între două dispozitive — avertizare, modificările rămân în formular; reîncărcare sau salvare explicită',async()=>{
  const id=projectId();
  await page.getByRole('button',{name:'Editează proiectul'}).click();await page.getByText('PASUL 1 DIN 6').waitFor();
  await input('Descriere scurtă').fill('Descriere de pe laptop.');
  Object.assign(db.projects[id],{title:'Atelier verde (telefon)',updated_at:stamp()}); // salvare de pe alt dispozitiv
  await page.getByRole('button',{name:'Salvează modificările'}).click();await page.getByRole('button',{name:'Actualizează proiectul publicat'}).click();
  await page.getByText('Proiectul a fost modificat între timp, pe alt dispozitiv.').first().waitFor();
  assert.equal(await input('Descriere scurtă').inputValue(),'Descriere de pe laptop.','modificările rămân în formular');
  assert.equal(db.projects[id].summary,'Mobilier din materiale reciclate.','nimic suprascris');
  await page.getByRole('button',{name:'Încarcă versiunea salvată'}).click();
  await page.waitForFunction(()=>document.querySelector('input')&&[...document.querySelectorAll('input')].some(i=>i.value==='Atelier verde (telefon)'));
  await input('Descriere scurtă').fill('Descriere finală.');
  Object.assign(db.projects[id],{updated_at:stamp()});
  await page.getByRole('button',{name:'Salvează modificările'}).click();await page.getByRole('button',{name:'Actualizează proiectul publicat'}).click();
  await page.getByText('Proiectul a fost modificat între timp, pe alt dispozitiv.').first().waitFor();
  assert.equal(await input('Descriere scurtă').inputValue(),'Descriere finală.');
  await page.getByRole('button',{name:'Salvează modificările mele'}).click();
  await page.getByRole('heading',{name:'Atelier verde (telefon)'}).waitFor();
  assert.equal(db.projects[id].summary,'Descriere finală.');assert.equal(db.projects[id].title,'Atelier verde (telefon)');
 });
 await step('proiecte: retragerea → ciornă privată (fără pierderi); ștergerea doar a ciornei',async()=>{
  const id=projectId();
  await page.getByRole('button',{name:'Retrage din publicare'}).click();await page.getByRole('dialog').getByRole('button',{name:'Retrage din publicare'}).click();
  await page.getByText('Proiectul a fost retras din publicare').waitFor();
  assert.equal(db.projects[id].status,'draft');assert.equal(Number(db.project_private[id].investment_amount),25000.5);
  await asC(async p2=>{await p2.goto(ORIGIN+'/#project/'+id);await p2.getByText('nu există sau nu este publicat').waitFor()});
  await page.getByRole('button',{name:'Șterge ciorna'}).click();await page.getByRole('button',{name:'Șterge definitiv'}).click();
  await page.getByText('Ciorna a fost ștearsă definitiv.').waitFor();await page.getByText('Nu ai încă proiecte').waitFor();
  assert.equal(projectId(),undefined);assert.equal(db.project_private[id],undefined);
 });
 await step('proiecte: file „Publicate” / „Ciorne” — fila implicită și trecerea proiectului între categorii',async()=>{
  const full=(id,status,title)=>({id,owner_id:users.A.id,status,title,summary:'Rezumat.',industry:'Retail',stage:'idee',city:'Iași',is_remote:false,looking_for:['colegi'],investment_public:null,created_at:stamp(),updated_at:stamp(),published_at:status==='published'?stamp():null,...Object.fromEntries(PROJECT_TEXT.map(k=>[k,'']))});
  for(const [id,st,t] of [['tab-p1','published','Proiect publicat unu'],['tab-p2','draft','Ciornă completă doi']]){db.projects[id]=full(id,st,t);db.project_private[id]={...Object.fromEntries(FIN.map(k=>[k,null])),unknown_financials:[],plan_links:[]}}
  const tabs=()=>page.getByRole('tablist',{name:'Categorii de proiecte'});
  const selected=async()=>(await tabs().getByRole('tab',{selected:true}).innerText()).trim();
  const listed=async()=>page.locator('.project-row strong').allInnerTexts();
  const toList=async()=>{await page.getByRole('button',{name:'Proiecte',exact:true}).click();await tabs().waitFor();await page.waitForFunction(()=>!document.body.innerText.includes('Se încarcă proiectele'))};
  await page.reload();await tabs().waitFor();await page.waitForFunction(()=>!document.body.innerText.includes('Se încarcă proiectele'));
  assert.equal(await selected(),'Publicate (1)','implicit: Publicate, pentru că există proiecte publicate');
  assert.deepEqual(await listed(),['Proiect publicat unu']);
  await page.getByText('2 din 20 proiecte (publicate și ciorne)').waitFor();
  assert.ok((await page.locator('main').innerText()).indexOf('Creează un proiect')<(await page.locator('main').innerText()).indexOf('Publicate (1)'),'butonul de creare deasupra filelor');
  await tabs().getByRole('tab',{name:'Ciorne (1)'}).click();assert.deepEqual(await listed(),['Ciornă completă doi']);
  await shot('10-file-ciorne');
  // publicare → fila Publicate
  await page.getByRole('button',{name:/Ciornă completă doi/}).click();await page.getByRole('button',{name:'Publică',exact:true}).click();await page.getByText('Proiectul a fost publicat.').waitFor();
  await toList();assert.equal(await selected(),'Publicate (2)');assert.ok((await listed()).includes('Ciornă completă doi'),'proiectul publicat este în fila Publicate');
  await tabs().getByRole('tab',{name:'Ciorne (0)'}).click();await page.getByText('Nu ai ciorne. Proiectele noi și cele retrase').waitFor();
  await shot('11-file-ciorne-goala');
  // retragere → fila Ciorne
  await tabs().getByRole('tab',{name:'Publicate (2)'}).click();
  await page.getByRole('button',{name:/Proiect publicat unu/}).click();await page.getByRole('button',{name:'Retrage din publicare'}).click();await page.getByRole('dialog').getByRole('button',{name:'Retrage din publicare'}).click();
  await page.getByText('Proiectul a fost retras din publicare').waitFor();
  await toList();assert.equal(await selected(),'Ciorne (1)');assert.deepEqual(await listed(),['Proiect publicat unu']);
  // alegerea manuală se păstrează la revenire; salvarea unei ciorne selectează Ciorne
  await tabs().getByRole('tab',{name:'Publicate (1)'}).click();await page.getByRole('button',{name:/Ciornă completă doi/}).click();await page.getByRole('heading',{name:'Ciornă completă doi'}).waitFor();
  await toList();assert.equal(await selected(),'Publicate (1)','fila aleasă manual rămâne');
  await page.goto(ORIGIN+'/#project-edit/tab-p1');await page.getByText('PASUL 1 DIN 6').waitFor();
  await input('Titlul proiectului').fill('Proiect retras, editat');await page.getByRole('button',{name:'Salvează ciorna'}).click();await page.getByText('Ciorna a fost salvată.').waitFor();
  await toList();assert.equal(await selected(),'Ciorne (1)','după salvarea ciornei: Ciorne');assert.deepEqual(await listed(),['Proiect retras, editat']);
  for(const id of ['tab-p1','tab-p2']){delete db.projects[id];delete db.project_private[id]}
 });
 await step('proiecte: limita de 20 — butonul de creare se dezactivează',async()=>{
  for(let i=0;i<20;i++){const pid='seed-'+i;db.projects[pid]={id:pid,owner_id:users.A.id,status:'draft',title:'Ciornă '+i,summary:'',industry:'',stage:'',city:'',is_remote:false,looking_for:[],investment_public:null,created_at:stamp(),updated_at:stamp(),published_at:null,...Object.fromEntries(PROJECT_TEXT.map(k=>[k,'']))};db.project_private[pid]={...Object.fromEntries(FIN.map(k=>[k,null])),unknown_financials:[],plan_links:[]}}
  await page.reload();await page.getByText('20 din 20 proiecte').waitFor();
  assert.ok(await page.getByRole('button',{name:'Creează un proiect'}).isDisabled());await page.getByText('Ai atins limita').waitFor();
  await shot('9-proiectele-mele');
  for(let i=0;i<20;i++){delete db.projects['seed-'+i];delete db.project_private['seed-'+i]}
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
