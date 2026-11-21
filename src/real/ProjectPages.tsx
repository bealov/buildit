// Proiecte reale: „Proiectele mele”, formularul în 6 pași și pagina proiectului.
// Același aspect ca formularul din demo. Fără butoane pentru acțiuni care încă nu funcționează.
import {useEffect,useRef,useState} from 'react';
import {Plus,ArrowUpRight,MapPin,Lock} from 'lucide-react';
import {Button,Heading,Section,Empty,Modal,Toggle} from '../ui';
import {Avatar} from '../ProfilePhoto';
import {industries} from '../model';
import {loadErrorInfo} from './validation.ts';
import {FIN_FIELDS,LOOKING_FOR,MAX_PROJECTS,STAGES,TEXT_FIELDS,emptyProjectForm,finDisplay,formFromProject,formatProblems,investmentLabel,locationLabel,lookingName,parseLinks,
 projectErrorMessage,publishMissing,stageName,type FinKey,type LookingFor,type ProjectBundle,type ProjectForm,type ProjectsApi,type PublicProject,type TextKey} from './projects.ts';

type ErrorInfo={code:string;hint:string};
const codeOf=(e:unknown)=>(e as {code?:string}|null)?.code??null;
const STEPS=['Informații generale','Problema și soluția','Model de business','Date financiare','Echipă și materiale','Ce caută proiectul și publicare'];
const dateRo=(s:string|null)=>s?new Date(s).toLocaleDateString('ro-RO'):'';

// ---------------------------------------------------------------------------
// Proiectele mele
// ---------------------------------------------------------------------------
export function MyProjects({api,userId,nav}:{api:ProjectsApi;userId:string;nav:(r:string)=>void}){
 const [state,setState]=useState<{status:'loading'|'ready'|'error';items:PublicProject[];error?:ErrorInfo}>({status:'loading',items:[]});
 const load=async()=>{setState(s=>({...s,status:'loading'}));try{setState({status:'ready',items:await api.mine(userId)})}catch(e){setState({status:'error',items:[],error:loadErrorInfo(e)})}};
 useEffect(()=>{void load()},[]);
 return <MyProjectsView state={state} onRetry={()=>void load()} nav={nav}/>;
}

export function MyProjectsView({state,onRetry,nav}:{state:{status:'loading'|'ready'|'error';items:PublicProject[];error?:ErrorInfo};onRetry:()=>void;nav:(r:string)=>void}){
 const full=state.items.length>=MAX_PROJECTS;
 const drafts=state.items.filter(p=>p.status==='draft').length;
 return <>
  <Heading title={'Ideile tale,\nîn mișcare.'} eyebrow="PROIECTELE MELE"/>
  <p className="intro">Ciornele sunt vizibile doar ție. Proiectele publicate sunt vizibile utilizatorilor autentificați. Nu ai nevoie de un proiect ca să te alături altora.</p>
  {state.status==='ready'&&<><Button onClick={()=>nav('project-new')} disabled={full}><Plus size={18}/> Creează un proiect</Button>
   <p className="caption">{state.items.length} din {MAX_PROJECTS} proiecte{state.items.length?` · ${drafts} ${drafts===1?'ciornă':'ciorne'}`:''}{full?' · Ai atins limita; șterge o ciornă pentru a crea alta.':''}</p></>}
  {state.status==='loading'?<Empty>Se încarcă proiectele…</Empty>
   :state.status==='error'?<Empty>Proiectele nu au putut fi încărcate.{state.error&&<><br/><small>{state.error.hint}</small><br/><small>Cod tehnic: {state.error.code}</small></>}<Button onClick={onRetry}>Încearcă din nou</Button></Empty>
   :!state.items.length?<Empty>Nu ai încă proiecte. Creează o ciornă și public-o când este gata.</Empty>
   :<div className="project-list">{state.items.map(p=><button key={p.id} className="panel project-row" onClick={()=>nav('project/'+p.id)}>
     <span className="row"><strong>{p.title.trim()||'Proiect fără titlu'}</strong><span className={'tag'+(p.status==='published'?' green':'')}>{p.status==='published'?'Publicat':'Ciornă'}</span></span>
     <small>{[stageName(p.stage),p.industry,locationLabel(p)].filter(Boolean).join(' · ')||'Informații generale necompletate'}</small>
     <small>Actualizat la {dateRo(p.updated_at)}</small>
    </button>)}</div>}
 </>;
}

// ---------------------------------------------------------------------------
// Formularul în 6 pași
// ---------------------------------------------------------------------------
type Loaded={id:string|null;updated_at:string|null;status:'draft'|'published';form:ProjectForm};

export function ProjectEditor({api,userId,id,nav,notify}:{api:ProjectsApi;userId:string;id:string|null;nav:(r:string)=>void;notify:(t:string)=>void}){
 const [loaded,setLoaded]=useState<Loaded|null>(id?null:{id:null,updated_at:null,status:'draft',form:emptyProjectForm()});
 const [error,setError]=useState<ErrorInfo|null>(null);
 useEffect(()=>{if(!id)return;(async()=>{try{const b=await api.get(id,userId);if(!b||b.project.owner_id!==userId){setError({code:'42501',hint:'Proiectul nu există sau nu îți aparține.'});return}
  setLoaded({id:b.project.id,updated_at:b.project.updated_at,status:b.project.status,form:formFromProject(b.project,b.priv)})}catch(e){setError(loadErrorInfo(e))}})()},[id]);
 if(error)return <Empty>Proiectul nu poate fi editat.<br/><small>{error.hint}</small><br/><small>Cod tehnic: {error.code}</small><Button secondary onClick={()=>nav('projects')}>Înapoi la proiectele mele</Button></Empty>;
 if(!loaded)return <Empty>Se încarcă proiectul…</Empty>;
 return <ProjectWizard key={loaded.id??'nou'} api={api} userId={userId} initial={loaded} nav={nav} notify={notify}/>;
}

export function ProjectWizard({api,userId,initial,nav,notify,startStep=0}:{api:ProjectsApi;userId:string;initial:Loaded;nav:(r:string)=>void;notify:(t:string)=>void;startStep?:number}){
 const [form,setForm]=useState<ProjectForm>(initial.form);
 const [saved,setSaved]=useState({id:initial.id,updated_at:initial.updated_at,status:initial.status,form:initial.form});
 const [step,setStep]=useState(startStep);
 const [busy,setBusy]=useState(false),[problems,setProblems]=useState<string[]>([]),[conflict,setConflict]=useState(false);
 const [modal,setModal]=useState<null|'update'|'discard'>(null);
 const dirty=JSON.stringify(form)!==JSON.stringify(saved.form);
 const dirtyRef=useRef(dirty);dirtyRef.current=dirty;
 useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{if(dirtyRef.current){e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[]);
 const set=<K extends keyof ProjectForm>(k:K,v:ProjectForm[K])=>{setForm(f=>({...f,[k]:v}));setProblems([])};
 const published=saved.status==='published';

 const save=async(status:'draft'|'published',overwrite=false)=>{
  if(busy)return;
  const fmt=formatProblems(form);
  if(fmt.length){setProblems(fmt.map(p=>p.text));setStep(fmt[0].step);return}
  if(status==='published'){const miss=publishMissing(form);if(miss.length){setProblems([`Pentru publicare completează: ${miss.map(m=>m.text).join(', ')}.`]);setStep(miss[0].step);return}}
  setBusy(true);setProblems([]);
  try{
   let expected=saved.updated_at;
   if(overwrite&&saved.id){const latest=await api.get(saved.id,userId);expected=latest?.project.updated_at??expected}
   const r=await api.save(saved.id,expected,status,form);
   setSaved({id:r.id,updated_at:r.updated_at,status:r.status,form});setConflict(false);setModal(null);
   if(status==='published'){notify(published?'Proiectul publicat a fost actualizat.':'Proiectul a fost publicat.');nav('project/'+r.id)}
   else{notify('Ciorna a fost salvată.');if(!saved.id)history.replaceState(null,'','#project-edit/'+r.id)}
  }catch(e){
   const code=codeOf(e);setModal(null);
   if(code==='PT409')setConflict(true);
   else setProblems([projectErrorMessage(code)]);
  }finally{setBusy(false)}
 };
 const reloadSaved=async()=>{if(!saved.id)return;setBusy(true);try{const b=await api.get(saved.id,userId);if(b){const f=formFromProject(b.project,b.priv);setSaved({id:b.project.id,updated_at:b.project.updated_at,status:b.project.status,form:f});setForm(f);setConflict(false)}}catch(e){setProblems([projectErrorMessage(codeOf(e))])}finally{setBusy(false)}};
 const leave=()=>nav(saved.id?'project/'+saved.id:'projects');

 const text=(k:TextKey|'title'|'summary'|'city',label:string,area=true,max?:number)=><label className="field" key={k}><span>{label}</span>{area?<textarea value={form[k]} maxLength={max} onChange={e=>set(k,e.target.value)}/>:<input value={form[k]} maxLength={max} onChange={e=>set(k,e.target.value)}/>}</label>;
 const toggleLooking=(l:LookingFor)=>set('looking_for',form.looking_for.includes(l)?form.looking_for.filter(x=>x!==l):[...form.looking_for,l]);
 const toggleUnknown=(k:FinKey)=>set('unknown',form.unknown.includes(k)?form.unknown.filter(x=>x!==k):[...form.unknown,k]);
 const previewInvestment=form.looking_for.includes('investitie')?(form.unknown.includes('investment_amount')||!form.fin.investment_amount.trim()?'Investiție de stabilit':`Investiție căutată: ${form.fin.investment_amount.trim()} EUR`):null;

 return <>
  <Heading eyebrow={`PASUL ${step+1} DIN 6`} title={saved.id?(published?'Editează proiectul publicat':'Editează ciorna'):'Dă formă ideii tale'}/>
  <div className="progress"><i style={{width:`${(step+1)/6*100}%`}}/></div>
  <h2>{STEPS[step]}</h2>
  <p className="muted">{published?'Modificările devin vizibile celorlalți doar după ce confirmi actualizarea proiectului publicat.':'Salvează o ciornă oricând; o poți completa mai târziu.'} Toate valorile financiare sunt în EUR.</p>
  {conflict&&<div className="notice error" role="alert"><strong>Proiectul a fost modificat între timp, pe alt dispozitiv.</strong> Modificările tale sunt păstrate în formular. Poți încărca versiunea salvată (pierzi modificările din acest formular) sau poți salva modificările tale peste ea.
   <div className="actions"><Button secondary onClick={()=>void reloadSaved()} disabled={busy}>Încarcă versiunea salvată</Button><Button onClick={()=>void save(published?'published':'draft',true)} disabled={busy}>Salvează modificările mele</Button></div></div>}
  <form className="panel form-panel" noValidate onSubmit={e=>{e.preventDefault();setStep(s=>Math.min(5,s+1));window.scrollTo(0,0)}}>
   {step===0&&<>
    {text('title','Titlul proiectului',false,LIMITS_TITLE)}
    {text('summary','Descriere scurtă',true,600)}
    <label className="field"><span>Industrie</span><select value={form.industry} onChange={e=>set('industry',e.target.value)}><option value="">Alege industria</option>{industries.map(i=><option key={i} value={i}>{i}</option>)}</select></label>
    <label className="field"><span>Stadiu</span><select value={form.stage} onChange={e=>set('stage',e.target.value as ProjectForm['stage'])}><option value="">Alege stadiul</option>{STAGES.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
    {text('city','Oraș',false,80)}
    <Toggle label="Remote / Online" checked={form.is_remote} onChange={()=>set('is_remote',!form.is_remote)}/>
    <p className="caption">Cu „Remote / Online”, orașul este opțional.</p>
   </>}
   {step===1&&TEXT_FIELDS.slice(0,4).map(([k,label])=>text(k,label))}
   {step===2&&TEXT_FIELDS.slice(4,8).map(([k,label])=>text(k,label))}
   {step===3&&<>
    <p className="notice"><Lock size={14}/> Datele financiare sunt private: le vezi doar tu, inclusiv după publicare. Excepție: dacă proiectul caută investiție, ceilalți văd suma investiției căutate sau „Investiție de stabilit”.</p>
    <p className="caption">Câmpul gol înseamnă necompletat. Valoarea 0 este diferită de „Nu am estimat încă”. Pentru zecimale folosește virgulă sau punct, fără separatori de mii, cu cel mult două zecimale (ex.: 1250,50).</p>
    {FIN_FIELDS.map(([k,label])=><div className="financial-field" key={k}>
     <label className="field"><span>{label}</span><input inputMode="decimal" value={form.fin[k]} disabled={form.unknown.includes(k)} onChange={e=>set('fin',{...form.fin,[k]:e.target.value})} onFocus={e=>e.currentTarget.select()}/></label>
     <Toggle label="Nu am estimat încă" checked={form.unknown.includes(k)} onChange={()=>toggleUnknown(k)}/>
    </div>)}
   </>}
   {step===4&&<>
    {TEXT_FIELDS.slice(8).map(([k,label])=>text(k,label))}
    <label className="field"><span>Linkuri către planul de afaceri (câte unul pe rând)</span><textarea value={form.links} placeholder="https://…" onChange={e=>set('links',e.target.value)}/></label>
    <p className="caption"><Lock size={12}/> Linkurile sunt vizibile doar ție, chiar și după publicare. Încărcarea documentelor va fi disponibilă ulterior.</p>
   </>}
   {step===5&&<>
    <fieldset className="looking-for"><legend>Ce caută proiectul? (poți alege mai multe)</legend>
     <div className="chips wrap">{LOOKING_FOR.map(([id,label])=><button type="button" key={id} aria-pressed={form.looking_for.includes(id)} className={form.looking_for.includes(id)?'active':''} onClick={()=>toggleLooking(id)}>{label}</button>)}</div>
    </fieldset>
    {form.looking_for.includes('investitie')&&<p className="caption">{previewInvestment}. Suma se completează la pasul 4 („Investiție căutată”). Poți publica și fără sumă: apare „Investiție de stabilit”. <button type="button" className="text-button" onClick={()=>setStep(3)}>Mergi la pasul 4</button></p>}
    <h3>Previzualizare (ce văd ceilalți după publicare)</h3>
    <div className="project-preview"><strong>{form.title.trim()||'Proiect fără titlu'}</strong><p>{form.summary.trim()||'Descrierea scurtă apare aici.'}</p>
     <small>{[stageName(form.stage),form.industry,locationLabel(form)].filter(Boolean).join(' · ')}</small>
     {form.looking_for.length>0&&<p className="caption">Caută: {LOOKING_FOR.filter(([id])=>form.looking_for.includes(id)).map(([,l])=>l).join(' · ')}</p>}
     {previewInvestment&&<p><strong>{previewInvestment}</strong></p>}</div>
    <p className="caption">Celelalte date financiare și linkurile către plan rămân private.</p>
   </>}
   {problems.length>0&&<div role="alert">{problems.map(p=><p className="error" key={p}>{p}</p>)}</div>}
   <div className="actions">
    {step>0&&<Button secondary onClick={()=>{setStep(step-1);window.scrollTo(0,0)}}>Înapoi</Button>}
    {step<5&&<Button type="submit">Continuă →</Button>}
   </div>
  </form>
  <div className="actions editor-actions">
   {published
    ?<Button onClick={()=>{const miss=publishMissing(form);const fmt=formatProblems(form);if(fmt.length||miss.length){void save('published');return}setModal('update')}} disabled={busy||!dirty}>{busy?'Se salvează…':'Salvează modificările'}</Button>
    :<><Button secondary onClick={()=>void save('draft')} disabled={busy}>{busy?'Se salvează…':'Salvează ciorna'}</Button>{step===5&&<Button onClick={()=>void save('published')} disabled={busy}>Publică proiectul</Button>}</>}
   <button type="button" className="text-button" onClick={()=>dirty?setModal('discard'):leave()}>Renunță</button>
  </div>
  {modal==='update'&&<Modal title="Actualizează proiectul publicat" onClose={()=>setModal(null)}><p>Modificările vor deveni vizibile utilizatorilor autentificați imediat după salvare. Până atunci, ei văd versiunea anterioară.</p><Button onClick={()=>void save('published')} disabled={busy}>Actualizează proiectul publicat</Button><Button secondary onClick={()=>setModal(null)}>Continuă editarea</Button></Modal>}
  {modal==='discard'&&<Modal title="Renunți la modificări?" onClose={()=>setModal(null)}><p>{saved.id?'Versiunea salvată rămâne neschimbată.':'Proiectul nu a fost salvat încă.'} Modificările din acest formular se pierd.</p><Button onClick={()=>{setForm(saved.form);setModal(null);leave()}}>Renunță la modificări</Button><Button secondary onClick={()=>setModal(null)}>Continuă editarea</Button></Modal>}
 </>;
}
const LIMITS_TITLE=120;

// ---------------------------------------------------------------------------
// Pagina proiectului
// ---------------------------------------------------------------------------
export function ProjectPage({api,userId,id,nav,notify}:{api:ProjectsApi;userId:string;id:string;nav:(r:string)=>void;notify:(t:string)=>void}){
 const [state,setState]=useState<{status:'loading'|'ready'|'missing'|'error';bundle?:ProjectBundle;error?:ErrorInfo}>({status:'loading'});
 const [modal,setModal]=useState<null|'unpublish'|'delete'>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const load=async()=>{setState({status:'loading'});try{const b=await api.get(id,userId);setState(b?{status:'ready',bundle:b}:{status:'missing'})}catch(e){setState({status:'error',error:loadErrorInfo(e)})}};
 useEffect(()=>{void load()},[id]);
 const act=async(fn:()=>Promise<unknown>,ok:string,after?:()=>void)=>{if(busy)return;setBusy(true);setMessage('');try{await fn();setModal(null);notify(ok);if(after)after();else await load()}catch(e){setModal(null);const c=codeOf(e);setMessage(c==='PT409'?'Proiectul a fost modificat între timp, pe alt dispozitiv. Pagina a fost reîncărcată; verifică versiunea actuală.':projectErrorMessage(c));if(c==='PT409')await load()}finally{setBusy(false)}};
 return <ProjectPageView state={state} userId={userId} nav={nav} message={message} busy={busy} modal={modal} setModal={setModal} onRetry={()=>void load()}
  onPublish={b=>{const miss=publishMissing(formFromProject(b.project,b.priv));if(miss.length){setMessage(`Pentru publicare completează: ${miss.map(m=>m.text).join(', ')}.`);return}void act(()=>api.setStatus(b.project.id,b.project.updated_at,'published'),'Proiectul a fost publicat.')}}
  onUnpublish={b=>void act(()=>api.setStatus(b.project.id,b.project.updated_at,'draft'),'Proiectul a fost retras din publicare și este acum o ciornă privată.')}
  onDelete={b=>void act(()=>api.remove(b.project.id),'Ciorna a fost ștearsă definitiv.',()=>nav('projects'))}/>;
}

export function ProjectPageView({state,userId,nav,message,busy,modal,setModal,onRetry,onPublish,onUnpublish,onDelete}:{
 state:{status:'loading'|'ready'|'missing'|'error';bundle?:ProjectBundle;error?:ErrorInfo};userId:string;nav:(r:string)=>void;message:string;busy:boolean;
 modal:null|'unpublish'|'delete';setModal:(m:null|'unpublish'|'delete')=>void;onRetry:()=>void;onPublish:(b:ProjectBundle)=>void;onUnpublish:(b:ProjectBundle)=>void;onDelete:(b:ProjectBundle)=>void}){
 if(state.status==='loading')return <Empty>Se încarcă proiectul…</Empty>;
 if(state.status==='error')return <Empty>Proiectul nu a putut fi încărcat.{state.error&&<><br/><small>{state.error.hint}</small><br/><small>Cod tehnic: {state.error.code}</small></>}<Button onClick={onRetry}>Încearcă din nou</Button></Empty>;
 const b=state.bundle;
 if(state.status==='missing'||!b)return <Empty>Proiectul nu există sau nu este publicat.</Empty>;
 const p=b.project,own=p.owner_id===userId,inv=investmentLabel(p);
 const texts=TEXT_FIELDS.filter(([k])=>p[k].trim());
 const emptyTexts=own?TEXT_FIELDS.filter(([k])=>!p[k].trim()).map(([,label])=>label):[];
 return <>
  <Heading eyebrow={own?(p.status==='published'?'PROIECTUL TĂU · PUBLICAT':'PROIECTUL TĂU · CIORNĂ, VIZIBILĂ DOAR ȚIE'):'PROIECT'} title={p.title.trim()||'Proiect fără titlu'}/>
  <div className="panel project-summary">
   <div className="tags">{own&&<span className={'tag'+(p.status==='published'?' green':'')}>{p.status==='published'?'Publicat':'Ciornă'}</span>}{p.stage&&<span className="tag">{stageName(p.stage)}</span>}{p.industry&&<span className="tag">{p.industry}</span>}</div>
   <p>{p.summary.trim()||(own?'Descrierea scurtă nu este completată.':'')}</p>
   {locationLabel(p)&&<div className="location"><MapPin size={13}/>{locationLabel(p)}</div>}
   {p.looking_for.length>0&&<p className="caption">Caută: {p.looking_for.map(lookingName).join(' · ')}</p>}
   {inv&&<p className="investment"><strong>{inv}</strong></p>}
  </div>
  {b.owner&&<div className="panel creator-match-person project-owner"><span className="avatar"><Avatar profile={{name:b.owner.display_name,photo:b.owner.avatarUrl}}/></span><div><small>{own?'Proprietar (tu)':'Proprietar'}</small><strong>{b.owner.display_name}</strong></div>
   <button className="text-button" onClick={()=>nav(own?'profile':'people/'+b.owner!.id)}>Vezi profilul <ArrowUpRight size={14}/></button></div>}
  {own&&<div className="actions project-actions">
   <Button onClick={()=>nav('project-edit/'+p.id)}>Editează proiectul</Button>
   {p.status==='draft'?<Button secondary onClick={()=>onPublish(b)} disabled={busy}>Publică</Button>:<Button secondary onClick={()=>setModal('unpublish')} disabled={busy}>Retrage din publicare</Button>}
   {p.status==='draft'&&<button className="text-button danger" onClick={()=>setModal('delete')} disabled={busy}>Șterge ciorna</button>}
  </div>}
  {message&&<p className="error" role="alert">{message}</p>}
  {texts.map(([k,label])=><section className="panel" key={k}><h3>{label}</h3><p>{p[k]}</p></section>)}
  {emptyTexts.length>0&&<p className="caption">Secțiuni necompletate ({emptyTexts.length}): {emptyTexts.join(' · ')}. Le poți completa din „Editează proiectul”.</p>}
  {own&&<><Section title="Date private (vizibile doar ție)"/>
   <div className="panel"><p className="caption"><Lock size={12}/> Nu sunt afișate altor utilizatori, nici după publicare{p.looking_for.includes('investitie')?' (cu excepția investiției căutate, afișată mai sus)':''}.</p>
    <dl className="person-facts private-facts">{FIN_FIELDS.map(([k,label])=><span key={k} style={{display:'contents'}}><dt>{label.replace(/\s*\((€|%)\)(, dacă se aplică)?$/,'')}</dt><dd>{finDisplay(b.priv,k)}</dd></span>)}</dl>
    <h3>Linkuri către planul de afaceri</h3>
    {(b.priv?.plan_links??[]).length?<ul className="plan-links">{parseLinks((b.priv?.plan_links??[]).join('\n')).map(l=><li key={l}><a href={l} target="_blank" rel="noopener noreferrer">{l}</a></li>)}</ul>:<p className="caption">Niciun link adăugat.</p>}
   </div></>}
  {own&&<p className="disclaimer">{p.status==='published'?`Publicat la ${dateRo(p.published_at)}.`:'Ciorna nu este vizibilă altor utilizatori.'} Ultima modificare: {dateRo(p.updated_at)}.</p>}
  {modal==='unpublish'&&<Modal title="Retragi proiectul din publicare?" onClose={()=>setModal(null)}><p>Proiectul devine o ciornă privată și nu mai este vizibil altor utilizatori. Informațiile se păstrează și îl poți publica din nou oricând.</p><Button onClick={()=>onUnpublish(b)} disabled={busy}>Retrage din publicare</Button><Button secondary onClick={()=>setModal(null)}>Anulează</Button></Modal>}
  {modal==='delete'&&<Modal title="Ștergi definitiv ciorna?" onClose={()=>setModal(null)}><p>Ciorna „{p.title.trim()||'Proiect fără titlu'}” și datele ei private vor fi șterse definitiv. Acțiunea nu poate fi anulată.</p><Button onClick={()=>onDelete(b)} disabled={busy}>Șterge definitiv</Button><Button secondary onClick={()=>setModal(null)}>Anulează</Button></Modal>}
 </>;
}
