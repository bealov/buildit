// Interfața pentru conturile reale (etapa 1: autentificare, profil, roluri).
// Folosește aceleași componente și clase CSS ca prototipul. Nu citește și nu scrie datele demo.
import React,{useEffect,useState,type ReactNode} from 'react';
import {Home,Compass,Layers,Heart,ShoppingBag,Trophy,User,ChevronLeft,ArrowUpRight,ArrowRight,Check,LogOut,SlidersHorizontal,Sparkles} from 'lucide-react';
import {Button,Heading,Section,Empty,Modal,Field,Toggle} from '../ui';
import {Avatar,PhotoEditor} from '../ProfilePhoto';
import {t} from '../locales';
import {industries,stages} from '../model';
import type {RealConfig} from './config.ts';
import {cleanedUrl,isAuthHash,parseAuthCallback} from './authCallback.ts';
import {authErrorMessage,dataErrorMessage,nameProblem,passwordProblem,profileFormProblem,validEmail,type ProfileForm} from './validation.ts';
import {clearStoredMode,otherRole,readStoredMode,resolveMode,roleLabel,writeStoredMode,type RealRole} from './roles.ts';
import {formFromAccount,type Account,type AccountApi,type PhotoChange} from './account.ts';
import type {AuthApi,AuthError,SessionUser} from './auth.ts';

export type RealDeps={auth:AuthApi;account:AccountApi};
type Banner={kind:'ok'|'error';text:string}|null;
const storage=()=>typeof window==='undefined'?undefined:window.localStorage;
const errCode=(e:unknown)=>(e as AuthError|null)?.code;
const errStatus=(e:unknown)=>(e as AuthError|null)?.status;

async function loadDeps(config:RealConfig):Promise<RealDeps>{
 const [{getClient},{createAuthApi},{createAccountApi}]=await Promise.all([import('./client.ts'),import('./auth.ts'),import('./account.ts')]);
 const client=await getClient(config);
 return {auth:createAuthApi(client),account:createAccountApi(client)};
}

function routeFromHash(){const h=typeof location==='undefined'?'':location.hash;return isAuthHash(h)?'home':h.slice(1)||'home'}
function useRoute():[string,(r:string)=>void]{
 const [route,setRoute]=useState(routeFromHash);
 useEffect(()=>{const fn=()=>setRoute(routeFromHash());window.addEventListener('hashchange',fn);return()=>window.removeEventListener('hashchange',fn)},[]);
 const nav=(r:string)=>{if(location.hash.slice(1)!==r)location.hash=r;else setRoute(r);window.scrollTo(0,0)};
 return [route,nav];
}

// ---------------------------------------------------------------------------
// Aspect comun (identic cu prototipul)
// ---------------------------------------------------------------------------
function Shell({header,children,nav}:{header:ReactNode;children:ReactNode;nav?:ReactNode}){
 return <><aside className="desktop-context"><a className="brand" href="#home"><span className="brand-icon">b↗</span>Build<span>IT</span><sup>®</sup></a><span className="eyebrow">UN LOC PENTRU URMĂTORUL TĂU PAS</span><h2>Ambiții mari.<br/>Conexiuni<br/><em>cu sens.</em></h2><p>De la prima idee la oamenii care o pot duce mai departe.</p><div className="context-lines"><i/><i/><i/></div><span className="context-bottom">BUILDIT / CONT REAL · MEDIU DE TEST</span></aside>
  <div className="app"><header><a className="brand" href="#home"><span className="brand-icon">b↗</span>Build<span>IT</span></a><div className="header-actions">{header}</div></header>
   <main>{children}<footer>Cont real · mediu de test<br/>Datele demo rămân separate, doar în acest browser.</footer></main>{nav}</div></>;
}

function Input({label,value,onChange,type='text',autoComplete}:{label:string;value:string;onChange:(v:string)=>void;type?:string;autoComplete?:string}){
 return <label className="field"><span>{label}</span><input type={type} value={value} autoComplete={autoComplete} onChange={e=>onChange(e.target.value)}/></label>;
}

function RolePicker({value,onChange}:{value:RealRole|null;onChange:(r:RealRole)=>void}){
 return <div className="segmented" role="radiogroup" aria-label="Rol inițial">{(['creator','investor'] as RealRole[]).map(r=><button key={r} type="button" role="radio" aria-checked={value===r} className={value===r?'active':''} onClick={()=>onChange(r)}>{roleLabel[r]}</button>)}</div>;
}

function Notice({banner}:{banner:Banner}){return banner?<p className={banner.kind==='error'?'notice error':'notice'} role={banner.kind==='error'?'alert':'status'}>{banner.text}</p>:null}

// ---------------------------------------------------------------------------
// Componenta principală
// ---------------------------------------------------------------------------
export function RealApp({config,openDemo,deps:injected}:{config:RealConfig;openDemo:(route?:string)=>void;deps?:RealDeps}){
 const [deps,setDeps]=useState<RealDeps|null>(injected??null);
 const [phase,setPhase]=useState<'starting'|'ready'|'failed'>('starting');
 const [user,setUser]=useState<SessionUser|null>(null);
 const [recovery,setRecovery]=useState(false);
 const [banner,setBanner]=useState<Banner>(null);
 const [route,nav]=useRoute();

 useEffect(()=>{
  let active=true,unsubscribe=()=>{};
  (async()=>{
   try{
    const d=injected??await loadDeps(config);
    if(!active)return;setDeps(d);
    const callback=parseAuthCallback(location.search,location.hash);
    if(callback){
     let nextRoute='home';
     if(callback.kind==='error')setBanner({kind:'error',text:callback.message});
     else try{
      const {recovery:isRecovery}=await d.auth.handleCallback(callback);
      if(isRecovery){setRecovery(true);nextRoute='password'}
      else setBanner({kind:'ok',text:'Adresa de email a fost confirmată. Bine ai venit!'});
     }catch(e){setBanner({kind:'error',text:authErrorMessage(errCode(e)??'otp_expired',errStatus(e)??400)})}
     history.replaceState(null,'',cleanedUrl(location.pathname,location.search,location.hash,nextRoute));
     nav(nextRoute);
    }
    const current=await d.auth.currentUser();
    if(!active)return;setUser(current);
    unsubscribe=d.auth.onChange((event,next)=>{
     if(event==='PASSWORD_RECOVERY')setRecovery(true);
     if(event==='SIGNED_OUT'){setRecovery(false);clearStoredMode(storage())}
     setUser(prev=>prev?.id===next?.id?prev:next);
    });
    setPhase('ready');
   }catch{if(active)setPhase('failed')}
  })();
  return ()=>{active=false;unsubscribe()};
 },[]);

 const signOut=async()=>{
  try{await deps?.auth.signOut()}catch{/* sesiunea locală este eliminată oricum */}
  clearStoredMode(storage());setUser(null);setRecovery(false);setBanner({kind:'ok',text:'Te-ai deconectat.'});nav('home');
 };

 if(phase==='starting')return <Shell header={<span className="demo-pill"><i/> Cont real</span>}><Empty>Se pregătește contul…</Empty></Shell>;
 if(phase==='failed'||!deps)return <Shell header={<button className="demo-pill" onClick={()=>openDemo()}><i/> Demo</button>}><Empty>Serviciul de conturi nu este disponibil momentan.<Button onClick={()=>location.reload()}>Încearcă din nou</Button><Button secondary onClick={()=>openDemo()}>Deschide modul demo</Button></Empty></Shell>;
 if(!user)return <AuthScreens auth={deps.auth} banner={banner} openDemo={openDemo}/>;
 return <SignedIn key={user.id} user={user} deps={deps} route={route} nav={nav} openDemo={openDemo} recovery={recovery} endRecovery={()=>setRecovery(false)} banner={banner} clearBanner={()=>setBanner(null)} signOut={signOut}/>;
}

// ---------------------------------------------------------------------------
// Ecrane fără sesiune: autentificare, înregistrare, resetare parolă
// ---------------------------------------------------------------------------
export function AuthScreens({auth,banner,openDemo,initial='login'}:{auth:AuthApi;banner:Banner;openDemo:(route?:string)=>void;initial?:'login'|'signup'|'forgot'|'sent'}){
 const [view,setView]=useState(initial);
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[name,setName]=useState('');
 const [role,setRole]=useState<RealRole|null>(null);
 const [message,setMessage]=useState<Banner>(banner),[busy,setBusy]=useState(false),[unconfirmed,setUnconfirmed]=useState(false);
 const go=(v:typeof view)=>{setView(v);setMessage(null);setUnconfirmed(false);setPassword('');setConfirm('')};
 const run=async(task:()=>Promise<void>)=>{if(busy)return;setBusy(true);try{await task()}finally{setBusy(false)}};

 const login=()=>run(async()=>{
  if(!validEmail(email)||!password){setMessage({kind:'error',text:'Completează emailul și parola.'});return}
  try{await auth.signIn(email,password)}catch(e){setUnconfirmed(errCode(e)==='email_not_confirmed');setMessage({kind:'error',text:authErrorMessage(errCode(e),errStatus(e))})}
 });
 const signup=()=>run(async()=>{
  const problem=nameProblem(name)??(!validEmail(email)?'Introdu o adresă de email validă.':null)??passwordProblem(password,confirm)??(!role?'Alege rolul inițial: Creator sau Investitor.':null);
  if(problem||!role){setMessage({kind:'error',text:problem??''});return}
  try{const {needsConfirmation}=await auth.signUp(email,password,name,role);if(needsConfirmation)go('sent')}
  catch(e){setMessage({kind:'error',text:authErrorMessage(errCode(e),errStatus(e))})}
 });
 const resend=()=>run(async()=>{
  try{await auth.resendConfirmation(email);setMessage({kind:'ok',text:'Dacă adresa poate primi emailuri, un nou link de confirmare a fost trimis.'})}
  catch(e){setMessage({kind:'error',text:authErrorMessage(errCode(e),errStatus(e))})}
 });
 const forgot=()=>run(async()=>{
  if(!validEmail(email)){setMessage({kind:'error',text:'Introdu o adresă de email validă.'});return}
  try{await auth.requestPasswordReset(email)}catch(e){if(errStatus(e)===429){setMessage({kind:'error',text:authErrorMessage(errCode(e),429)});return}}
  setMessage({kind:'ok',text:'Dacă există un cont pentru această adresă, vei primi un email cu linkul de resetare a parolei.'});
 });
 const submit=(fn:()=>void)=>(e:React.FormEvent)=>{e.preventDefault();fn()};

 let body:ReactNode;
 if(view==='signup')body=<><Heading title={'Creează-ți\ncontul.'} eyebrow="CONT REAL · MEDIU DE TEST"/><p className="intro">Un singur cont pentru o singură persoană. Alegi rolul inițial acum; celălalt rol îl poți activa oricând din Setări.</p>
  <form className="panel" onSubmit={submit(signup)} noValidate><Input label="Nume" value={name} onChange={setName} autoComplete="name"/><Input label="Email" type="email" value={email} onChange={setEmail} autoComplete="email"/><Input label="Parolă (minimum 10 caractere)" type="password" value={password} onChange={setPassword} autoComplete="new-password"/><Input label="Confirmă parola" type="password" value={confirm} onChange={setConfirm} autoComplete="new-password"/>
   <h3>Rol inițial</h3><RolePicker value={role} onChange={setRole}/><p className="caption">Rolul Investitor nu înseamnă investitor verificat. Datele din modul demo nu sunt importate în contul tău.</p>
   <Notice banner={message}/><Button type="submit" disabled={busy}>{busy?'Se creează…':'Creează contul'}</Button></form>
  <button className="settings-row" onClick={()=>go('login')}>Ai deja cont? Autentifică-te <ArrowUpRight size={18}/></button></>;
 else if(view==='sent')body=<><Heading title={'Verifică-ți\nemailul.'} eyebrow="CONFIRMAREA ADRESEI"/><div className="panel"><p>Dacă adresa <strong>{email.trim()}</strong> poate fi folosită, vei primi un email cu linkul de confirmare. Deschide linkul pentru a activa contul.</p><p className="caption">Nu găsești emailul? Verifică și dosarul Spam.</p><Notice banner={message}/><Button secondary onClick={resend} disabled={busy}>Retrimite emailul de confirmare</Button></div><button className="settings-row" onClick={()=>go('login')}>Înapoi la autentificare <ArrowUpRight size={18}/></button></>;
 else if(view==='forgot')body=<><Heading title={'Ai uitat\nparola?'} eyebrow="RESETAREA PAROLEI"/><p className="intro">Îți trimitem un link prin care poți alege o parolă nouă.</p><form className="panel" onSubmit={submit(forgot)} noValidate><Input label="Email" type="email" value={email} onChange={setEmail} autoComplete="email"/><Notice banner={message}/><Button type="submit" disabled={busy}>Trimite linkul de resetare</Button></form><button className="settings-row" onClick={()=>go('login')}>Înapoi la autentificare <ArrowUpRight size={18}/></button></>;
 else body=<><Heading title={'Bine ai\nrevenit.'} eyebrow="CONT REAL · MEDIU DE TEST"/><p className="intro">Intră în contul tău BuildIT. Modul demo rămâne disponibil separat, cu date fictive.</p>
  <form className="panel" onSubmit={submit(login)} noValidate><Input label="Email" type="email" value={email} onChange={setEmail} autoComplete="email"/><Input label="Parolă" type="password" value={password} onChange={setPassword} autoComplete="current-password"/><Notice banner={message}/>{unconfirmed&&<Button secondary onClick={resend} disabled={busy}>Retrimite emailul de confirmare</Button>}<Button type="submit" disabled={busy}>{busy?'Se verifică…':'Intră în cont'}</Button><button type="button" className="text-button" onClick={()=>go('forgot')}>Ai uitat parola?</button></form>
  <button className="settings-row" onClick={()=>go('signup')}>Nu ai cont? Creează unul <ArrowUpRight size={18}/></button></>;

 return <Shell header={<button className="demo-pill" onClick={()=>openDemo()}><i/> Deschide demo</button>}>{body}<button className="settings-row" onClick={()=>openDemo()}>Înapoi la modul demo <ArrowRight size={18}/></button></Shell>;
}

// ---------------------------------------------------------------------------
// Cont autentificat
// ---------------------------------------------------------------------------
type SignedInProps={user:SessionUser;deps:RealDeps;route:string;nav:(r:string)=>void;openDemo:(route?:string)=>void;recovery:boolean;endRecovery:()=>void;banner:Banner;clearBanner:()=>void;signOut:()=>void};

function SignedIn(props:SignedInProps){
 const {user,deps}=props;
 const [account,setAccount]=useState<Account|null>(null),[status,setStatus]=useState<'loading'|'ready'|'error'>('loading');
 const reload=async()=>{setStatus('loading');try{setAccount(await deps.account.load(user.id));setStatus('ready')}catch{setStatus('error')}};
 useEffect(()=>{void reload()},[]);
 return <AccountView {...props} account={account} status={status} reload={reload}/>;
}

/** Afișarea contului, separată de încărcare pentru a putea fi testată. */
export function AccountView({user,deps,route,nav,openDemo,recovery,endRecovery,banner,clearBanner,signOut,account,status,reload}:SignedInProps&{account:Account|null;status:'loading'|'ready'|'error';reload:()=>Promise<void>}){
 const [,setModeVersion]=useState(0); // modul se citește din preferința locală la fiecare randare
 const [modal,setModal]=useState<null|'account'|'role'>(null),[toast,setToast]=useState('');
 useEffect(()=>{if(!toast)return;const id=setTimeout(()=>setToast(''),2600);return()=>clearTimeout(id)},[toast]);
 const roles=account?.roles??[];
 const mode=resolveMode(roles,readStoredMode(storage()),user.id);
 const both=roles.includes('creator')&&roles.includes('investor');
 const missing:RealRole|null=mode&&!both?otherRole(mode):null;
 const setMode=(r:RealRole)=>{writeStoredMode(storage(),user.id,r);setModeVersion(v=>v+1);setModal(null)};
 const profile=account?.profile;
 const person={name:profile?.display_name||user.email||'Cont',photo:account?.avatarUrl};
 const first=person.name.split(' ')[0];
 const notify=(text:string)=>{setToast(text);clearBanner()};

 const header=<><button className="demo-pill" onClick={()=>setModal('account')}><i/> Cont real{profile?' · '+first:''}</button>{profile&&<button className="avatar" aria-label="Profil" onClick={()=>nav('profile')}><Avatar profile={person}/></button>}</>;
 const navItems=[['home',t.home,Home],[mode==='investor'?'explore':'projects',mode==='investor'?t.explore:t.projects,mode==='investor'?Compass:Layers],['match',t.match,Heart],['market',t.market,ShoppingBag],['ranking','Clasament',Trophy],['profile',t.profile,User]] as const;
 const bottom=profile&&!recovery?<nav className="bottom-nav">{navItems.map(([r,label,Icon])=><button key={r} className={route===r?'active':''} onClick={()=>nav(r)}><Icon size={21}/><span>{label}</span></button>)}</nav>:undefined;

 let body:ReactNode;
 if(recovery)body=<NewPassword auth={deps.auth} done={()=>{endRecovery();notify('Parola a fost schimbată.');nav('home')}}/>;
 else if(status==='loading')body=<Empty>Se încarcă profilul…</Empty>;
 else if(status==='error'||!account)body=<Empty>Profilul nu a putut fi încărcat.<Button onClick={()=>void reload()}>Încearcă din nou</Button><Button secondary onClick={signOut}>Ieși din cont</Button></Empty>;
 else if(!profile)body=<CompleteProfile account={deps.account} done={async()=>{await reload();notify('Profil creat.');nav('home')}} signOut={signOut}/>;
 else if(route==='home')body=<><Heading title={`Bună, ${first} 👋`} eyebrow={mode==='investor'?'O NOUĂ ZI. NOI POSIBILITĂȚI.':'SPAȚIUL TĂU DE CREȘTERE'}/><p className="intro">Contul tău real este activ. Profilul și rolurile sunt salvate în siguranță, separat de datele demo.</p>
  <div className="notice">Etapa 1 · Cont real: profil, fotografie, roluri și setări. Proiectele, Match-ul, Marketplace-ul și clasamentul pentru conturile reale urmează. Până atunci le poți explora în modul demo, cu date fictive.</div>
  <div className="quick-grid"><Quick name="Profilul tău" icon={<User size={20}/>} onClick={()=>nav('profile')}/><Quick name="Editează profilul" icon={<SlidersHorizontal size={20}/>} onClick={()=>nav('settings')}/><Quick name="Explorează demo-ul" icon={<Sparkles size={20}/>} onClick={()=>openDemo('home')}/></div></>;
 else if(route==='profile')body=<><Heading title={'Oamenii fac\ndiferența.'} eyebrow="PROFILUL TĂU"/><div className="profile-card panel"><div className="large-avatar"><Avatar profile={person}/></div><h2>{profile.display_name}</h2>{roles.map(r=><span className="tag" key={r}>{roleLabel[r]}</span>)} <span className="tag">Cont real</span><p>{profile.bio||'Adaugă o descriere profesională din Setări.'}</p>{(profile.city||profile.company)&&<small>{[profile.city,profile.company].filter(Boolean).join(' · ')}</small>}</div>
  <div className="quick-grid"><Quick name="Editează profilul" icon={<User size={20}/>} onClick={()=>nav('settings')}/><Quick name="Preferințe și contact" icon={<SlidersHorizontal size={20}/>} onClick={()=>nav('settings')}/></div>
  <RolesPanel both={both} mode={mode} missing={missing} setMode={setMode} askActivate={()=>setModal('role')}/>
  <button className="settings-row" onClick={()=>openDemo('home')}>Deschide modul demo <ArrowUpRight size={18}/></button><button className="settings-row" onClick={signOut}><LogOut size={18}/> Ieși din cont</button></>;
 else if(route==='settings')body=<><Heading title="Profil și preferințe" eyebrow={mode==='investor'?'CONT INVESTITOR':'CONT CREATOR'}/><ProfileSettings user={user} account={account} api={deps.account} investor={roles.includes('investor')} saved={async()=>{await reload();notify('Profil și preferințe salvate.');nav('profile')}}/><RolesPanel both={both} mode={mode} missing={missing} setMode={setMode} askActivate={()=>setModal('role')}/></>;
 else body=<Unavailable route={route} openDemo={openDemo}/>;

 return <Shell header={header} nav={bottom}>
  {!['home','profile','projects','explore','match','market','ranking'].includes(route)&&!recovery&&<button className="back" onClick={()=>history.length>1?history.back():nav('home')}><ChevronLeft size={16}/> Înapoi</button>}
  <Notice banner={banner}/>{body}
  {toast&&<div className="toast" role="status"><Check size={18}/>{toast}</div>}
  {modal==='account'&&<Modal title="Contul tău" onClose={()=>setModal(null)}><p><strong>{profile?.display_name??'Profil necompletat'}</strong><br/><small>{user.email}</small></p>{both&&mode&&<><p className="caption">Mod de utilizare</p><ModeSwitch mode={mode} setMode={setMode}/></>}<p className="caption">Conturile demo sunt fictive și separate. Schimbarea contului demo nu afectează contul tău real.</p><Button secondary onClick={()=>{setModal(null);openDemo('home')}}>Deschide modul demo</Button><Button onClick={()=>{setModal(null);signOut()}}>Ieși din cont</Button></Modal>}
  {modal==='role'&&missing&&<ActivateRole role={missing} api={deps.account} userId={user.id} close={()=>setModal(null)} done={async()=>{setModal(null);await reload();setMode(missing);notify(`Rolul ${roleLabel[missing]} a fost activat.`)}}/>}
 </Shell>;
}

function Quick({name,icon,onClick}:{name:string;icon:ReactNode;onClick:()=>void}){return <button className="quick" onClick={onClick}>{icon}<span>{name}</span><ArrowUpRight size={16}/></button>}

function ModeSwitch({mode,setMode}:{mode:RealRole;setMode:(r:RealRole)=>void}){
 return <div className="segmented" role="tablist" aria-label="Mod de utilizare">{(['creator','investor'] as RealRole[]).map(r=><button key={r} role="tab" aria-selected={mode===r} className={mode===r?'active':''} onClick={()=>setMode(r)}>Mod {roleLabel[r]}</button>)}</div>;
}

function RolesPanel({both,mode,missing,setMode,askActivate}:{both:boolean;mode:RealRole|null;missing:RealRole|null;setMode:(r:RealRole)=>void;askActivate:()=>void}){
 return <><Section title="Roluri și mod de utilizare"/><div className="panel">{both&&mode?<><p>Ambele roluri sunt active. Comutatorul schimbă doar interfața; identitatea ta și proprietatea asupra datelor rămân aceleași.</p><ModeSwitch mode={mode} setMode={setMode}/></>:missing?<><p>Rol activ: <strong>{mode?roleLabel[mode]:''}</strong>. Poți activa și rolul {roleLabel[missing]} pe același cont.</p><Button secondary onClick={askActivate}>Activează rolul {roleLabel[missing]}</Button></>:null}<p className="caption">Rolul Investitor nu înseamnă investitor verificat. Rolurile sunt verificate în baza de date, nu de modul selectat în browser.</p></div></>;
}

function ActivateRole({role,api,userId,close,done}:{role:RealRole;api:AccountApi;userId:string;close:()=>void;done:()=>Promise<void>}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const activate=async()=>{if(busy)return;setBusy(true);setError('');try{await api.activateRole(userId,role);await done()}catch(e){setError(dataErrorMessage(errCode(e)));setBusy(false)}};
 return <Modal title={`Activează rolul ${roleLabel[role]}`} onClose={close}><p>{role==='investor'?'Vei putea descoperi proiecte și cumpăra planuri din Marketplace când aceste module vor fi disponibile pentru conturile reale.':'Vei putea publica proiecte și vinde planuri în Marketplace, inclusiv fără un proiect pentru Match, când aceste module vor fi disponibile pentru conturile reale.'}</p><p className="notice">Este același cont și aceeași persoană. {role==='investor'?'Activarea nu înseamnă statut de investitor verificat.':'Rolul Investitor rămâne activ.'}</p>{error&&<p className="error" role="alert">{error}</p>}<Button onClick={activate} disabled={busy}>{busy?'Se activează…':'Activează rolul'}</Button><Button secondary onClick={close}>Renunță</Button></Modal>;
}

function CompleteProfile({account,done,signOut}:{account:AccountApi;done:()=>Promise<void>;signOut:()=>void}){
 const [name,setName]=useState(''),[role,setRole]=useState<RealRole|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const submit=async(e:React.FormEvent)=>{e.preventDefault();if(busy)return;const problem=nameProblem(name)??(!role?'Alege rolul inițial: Creator sau Investitor.':null);if(problem||!role){setError(problem??'');return}
  setBusy(true);setError('');try{await account.completeProfile(name,role);await done()}catch(err){setError(dataErrorMessage(errCode(err)));setBusy(false)}};
 return <><Heading title={'Să ne\ncunoaștem.'} eyebrow="COMPLETEAZĂ PROFILUL"/><p className="intro">Contul tău nu are încă un profil. Completează numele și alege rolul inițial; celălalt rol îl poți activa mai târziu.</p><form className="panel" onSubmit={submit} noValidate><Input label="Nume" value={name} onChange={setName} autoComplete="name"/><h3>Rol inițial</h3><RolePicker value={role} onChange={setRole}/>{error&&<p className="error" role="alert">{error}</p>}<Button type="submit" disabled={busy}>{busy?'Se salvează…':'Creează profilul'}</Button></form><button className="settings-row" onClick={signOut}><LogOut size={18}/> Ieși din cont</button></>;
}

function NewPassword({auth,done}:{auth:AuthApi;done:()=>void}){
 const [password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const submit=async(e:React.FormEvent)=>{e.preventDefault();if(busy)return;const problem=passwordProblem(password,confirm);if(problem){setError(problem);return}
  setBusy(true);setError('');try{await auth.updatePassword(password);done()}catch(err){setError(authErrorMessage(errCode(err),errStatus(err)));setBusy(false)}};
 return <><Heading title={'Alege o\nparolă nouă.'} eyebrow="RESETAREA PAROLEI"/><form className="panel" onSubmit={submit} noValidate><Input label="Parolă nouă (minimum 10 caractere)" type="password" value={password} onChange={setPassword} autoComplete="new-password"/><Input label="Confirmă parola nouă" type="password" value={confirm} onChange={setConfirm} autoComplete="new-password"/>{error&&<p className="error" role="alert">{error}</p>}<Button type="submit" disabled={busy}>{busy?'Se salvează…':'Salvează parola'}</Button></form></>;
}

function ProfileSettings({user,account,api,investor,saved}:{user:SessionUser;account:Account;api:AccountApi;investor:boolean;saved:()=>Promise<void>}){
 const [form,setForm]=useState<ProfileForm>(()=>formFromAccount(account));
 const [photo,setPhoto]=useState<PhotoChange>({kind:'keep'}),[photoBusy,setPhotoBusy]=useState(false);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 const preview={name:form.display_name||account.profile?.display_name||'',photo:photo.kind==='set'?photo.dataUrl:photo.kind==='remove'?undefined:account.avatarUrl};
 const set=<K extends keyof ProfileForm>(k:K)=>(v:ProfileForm[K])=>setForm(f=>({...f,[k]:v}));
 const submit=async(e:React.FormEvent)=>{e.preventDefault();if(busy)return;const problem=profileFormProblem(form,investor);if(problem){setError(problem);return}
  setBusy(true);setError('');try{await api.save(user.id,form,investor,photo);await saved()}catch(err){setError(dataErrorMessage(errCode(err)));setBusy(false)}};
 return <form className="panel" onSubmit={submit} noValidate>
  <PhotoEditor note="JPG, PNG sau WebP · maximum 5 MB. Încărcăm o miniatură vizibilă doar utilizatorilor autentificați." profile={preview} onChange={p=>setPhoto(p?{kind:'set',dataUrl:p}:{kind:'remove'})} onBusy={setPhotoBusy}/>
  <h3>Profil public</h3><p className="caption">Vizibil doar utilizatorilor autentificați BuildIT.</p>
  <Field label="Nume" value={form.display_name} onChange={set('display_name')}/><Field label="Descriere profesională" type="textarea" value={form.bio} onChange={set('bio')}/><Field label="Locație" value={form.city} onChange={set('city')}/><Field label="Companie" value={form.company} onChange={set('company')}/><Field label="Industrie de interes" value={form.industries} options={['',...industries]} onChange={set('industries')}/><Field label="Obiective și interese" type="textarea" value={form.objectives} onChange={set('objectives')}/>
  <h3>Date private</h3><p className="caption">Vizibile doar ție.</p>
  <label className="field"><span>Email cont</span><input type="email" value={user.email} readOnly aria-readonly="true"/></label>
  <Field label="Link adițional" value={form.link} onChange={set('link')}/><p className="caption">Opțional — profil LinkedIn, portofoliu profesional sau site web.</p>
  {investor&&<><Field label="Buget minim (€)" value={form.investor_min_budget} onChange={set('investor_min_budget')}/><Field label="Buget maxim (€)" value={form.investor_max_budget} onChange={set('investor_max_budget')}/><Field label="Stadiu preferat" value={form.investor_stage} options={['',...stages]} onChange={set('investor_stage')}/></>}
  <h3>Vizibilitate după Match</h3><Toggle label="Arată emailul după confirmare" checked={form.show_email_after_match} onChange={()=>set('show_email_after_match')(!form.show_email_after_match)}/><Toggle label="Arată linkul adițional după confirmare" checked={form.show_link_after_match} onChange={()=>set('show_link_after_match')(!form.show_link_after_match)}/>
  <p className="caption">Implicit, contactul rămâne ascuns. Preferințele vor fi aplicate când Match-ul va fi disponibil pentru conturile reale.</p>
  {error&&<p role="alert" className="error">{error}</p>}<Button type="submit" disabled={busy||photoBusy}>{busy?'Se salvează…':'Salvează modificările'}</Button></form>;
}

const MODULES:Record<string,{title:string;eyebrow:string;text:string}>={
 projects:{title:'Proiectele tale',eyebrow:'PORTOFOLIU CREATOR',text:'Proiectele pentru conturile reale sunt în pregătire.'},
 explore:{title:'Descoperă idei',eyebrow:'EXPLOREAZĂ POSIBILITĂȚILE',text:'Explorarea proiectelor reale este în pregătire.'},
 match:{title:'Match',eyebrow:'PARTENERIATE ȘI CONEXIUNI',text:'Match-ul pentru conturile reale este în pregătire. Nu vei putea face Match cu propriile proiecte.'},
 market:{title:'Marketplace',eyebrow:'PLANURI DE AFACERI',text:'Marketplace-ul pentru conturile reale este în pregătire. Va funcționa independent de Match: Creatorii vor putea vinde planuri fără un proiect publicat, iar ambele roluri vor putea cumpăra planurile altora.'},
 ranking:{title:'Clasament',eyebrow:'CLASAMENTUL SĂPTĂMÂNII',text:'Clasamentul pentru proiectele reale este în pregătire. Scorul organic va rămâne separat de promovarea sponsorizată.'}
};

function Unavailable({route,openDemo}:{route:string;openDemo:(route?:string)=>void}){
 const m=MODULES[route.split('/')[0]];
 if(!m)return <Empty>Pagina nu este disponibilă pentru conturile reale.<Button onClick={()=>{location.hash='home'}}>Înapoi acasă</Button></Empty>;
 return <><Heading title={m.title} eyebrow={m.eyebrow}/><Empty>{m.text} Până atunci, poți explora funcția în modul demo, cu date fictive.<Button onClick={()=>openDemo(route)}>Explorează în modul demo</Button></Empty></>;
}
