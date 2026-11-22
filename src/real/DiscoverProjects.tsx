// „Descoperă proiecte”: proiecte publicate ale altor utilizatori, cu filtre și „Vezi proiectul”.
// Doar descoperire, filtrare și deschidere; fără swipe, solicitări sau interes de investiție.
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {ArrowUpRight,MapPin,RefreshCw,SlidersHorizontal} from 'lucide-react';
import {Button,Heading,Section,Empty,Toggle} from '../ui';
import {Avatar} from '../ProfilePhoto';
import {industries} from '../model';
import {loadErrorInfo} from './validation.ts';
import {LOOKING_FOR,STAGES,defaultDiscoverFilters,discoverFiltersProblem,investmentLabel,locationLabel,lookingName,sameFilters,setCity,setMaxInvestment,stageName,toggleLooking,
 type DiscoverCursor,type DiscoverFilters,type DiscoverProjectsApi,type DiscoverRole,type ProjectCard} from './projects.ts';

type ErrorInfo={code:string;hint:string};
type Status='loading'|'ready'|'error';
const dateRo=(s:string)=>s?new Date(s).toLocaleDateString('ro-RO'):'';

export function DiscoverProjects({api,selfId,role,open,nav,visible=true,switcher}:{api:DiscoverProjectsApi;selfId:string;role:DiscoverRole;open:(id:string)=>void;nav:(r:string)=>void;visible?:boolean;switcher?:ReactNode}){
 const defaults=defaultDiscoverFilters(role);
 const [draft,setDraft]=useState<DiscoverFilters>(defaults),[applied,setApplied]=useState<DiscoverFilters>(defaults);
 const [items,setItems]=useState<ProjectCard[]>([]),[next,setNext]=useState<DiscoverCursor|null>(null);
 const [status,setStatus]=useState<Status>('loading'),[error,setError]=useState<ErrorInfo|null>(null),[more,setMore]=useState<'idle'|'loading'|'error'>('idle');
 const seq=useRef(0),scroll=useRef(0);
 const problem=discoverFiltersProblem(draft);
 useEffect(()=>{
  if(problem||sameFilters(draft,applied))return;
  const typed=draft.search!==applied.search||draft.city!==applied.city||draft.maxInvestment!==applied.maxInvestment;
  const id=setTimeout(()=>setApplied(draft),typed?400:0);
  return()=>clearTimeout(id);
 },[draft,applied,problem]);
 const load=async(f:DiscoverFilters)=>{
  const n=++seq.current;setStatus('loading');setError(null);setMore('idle');
  try{const page=await api.discover(selfId,role,f,null);if(n!==seq.current)return;setItems(page.projects);setNext(page.next);setStatus('ready')}
  catch(e){if(n!==seq.current)return;setError(loadErrorInfo(e));setStatus('error')}
 };
 useEffect(()=>{void load(applied)},[applied]);
 const loadMore=async()=>{
  if(!next||more==='loading')return;const n=seq.current;setMore('loading');
  try{const page=await api.discover(selfId,role,applied,next);if(n!==seq.current)return;setItems(p=>[...p,...page.projects.filter(x=>!p.some(y=>y.id===x.id))]);setNext(page.next);setMore('idle')}
  catch{if(n===seq.current)setMore('error')}
 };
 useEffect(()=>{if(!visible){scroll.current=window.scrollY;return}if(scroll.current){const y=scroll.current;requestAnimationFrame(()=>window.scrollTo(0,y))}},[visible]);
 const reset=()=>{setDraft(defaults);setApplied(defaults)};
 return <ProjectsDiscoverView role={role} filters={draft} onFilters={setDraft} onReset={reset} filterError={problem} atDefaults={sameFilters(applied,defaults)&&sameFilters(draft,defaults)}
  status={status} error={error} items={items} hasMore={!!next} more={more} onMore={()=>void loadMore()} onRetry={()=>void load(applied)} onOpen={open} nav={nav} switcher={switcher}
  onShowAll={()=>{const f={...defaults,looking:[]};setDraft(f);setApplied(f)}}/>;
}

export function ProjectsDiscoverView({role,filters,onFilters,onReset,filterError,atDefaults,status,error,items,hasMore,more,onMore,onRetry,onOpen,nav,switcher,onShowAll}:{
 role:DiscoverRole;filters:DiscoverFilters;onFilters:(f:DiscoverFilters)=>void;onReset:()=>void;filterError:string|null;atDefaults:boolean;
 status:Status;error:ErrorInfo|null;items:ProjectCard[];hasMore:boolean;more:'idle'|'loading'|'error';onMore:()=>void;onRetry:()=>void;onOpen:(id:string)=>void;nav:(r:string)=>void;switcher?:ReactNode;onShowAll:()=>void}){
 const investor=role==='investor',invest=filters.looking.includes('investitie');
 const investorDefault=investor&&atDefaults;
 let results:ReactNode;
 if(status==='loading')results=<Empty>Se caută proiecte…</Empty>;
 else if(status==='error')results=<Empty>Lista nu a putut fi încărcată.{error&&<><br/><small>{error.hint}</small><br/><small>Cod tehnic: {error.code}</small></>}<Button onClick={onRetry}><RefreshCw size={16}/> Încearcă din nou</Button></Empty>;
 else if(!items.length)results=investorDefault
  ?<Empty>Niciun proiect publicat nu caută investiție momentan.<Button secondary onClick={onShowAll}>Arată toate proiectele publicate</Button></Empty>
  :!atDefaults
   ?<Empty>Niciun proiect nu corespunde filtrelor.<br/><small>Încearcă un text mai scurt, altă industrie sau mai puține opțiuni.</small><Button secondary onClick={onReset}>Resetează filtrele</Button></Empty>
   :<Empty>Încă nu există proiecte publicate de alți utilizatori. Revino mai târziu.{!investor&&<><br/><small>Poți publica propriul proiect din „Proiecte”.</small><Button secondary onClick={()=>nav('projects')}>Mergi la Proiecte</Button></>}</Empty>;
 else results=<>
  <p className="filter-summary" role="status">{items.length}{hasMore?'+':''} {items.length===1?'proiect':'proiecte'}{atDefaults?'':' pentru filtrele alese'}</p>
  <div className="people-grid">{items.map(p=><ProjectCardView key={p.id} p={p} onOpen={()=>onOpen(p.id)}/>)}</div>
  {hasMore&&<div className="people-more"><Button secondary onClick={onMore} disabled={more==='loading'}>{more==='loading'?'Se încarcă…':'Arată mai multe'}</Button>{more==='error'&&<p className="error" role="alert">Nu am putut încărca restul listei. Încearcă din nou.</p>}</div>}
 </>;
 const set=(patch:Partial<DiscoverFilters>)=>onFilters({...filters,...patch});
 return <>
  {investor?<Heading eyebrow="PROIECTE PUBLICATE" title={'Descoperă\nproiecte.'}/>:<Heading eyebrow="MATCH · ÎNTRE CREATORI" title={'Împreună, ideile\npot merge mai departe.'}/>}
  <p className="intro">{investor?'Proiectele publicate de creatori. Deschide un proiect pentru detalii și pentru profilul proprietarului.':'Găsește proiecte publicate la care te poți alătura. Nu ai nevoie de un proiect propriu.'}</p>
  {switcher}
  {!investor&&<Section title="Descoperă proiecte"/>}
  <form className="panel people-filters" onSubmit={e=>e.preventDefault()} aria-label="Filtre">
   <div className="filters-head"><SlidersHorizontal size={16}/><strong>Filtre</strong>{!atDefaults&&<button type="button" className="text-button" onClick={onReset}>Resetează filtrele</button>}</div>
   <label className="field"><span>Caută în titlu și descriere</span><input value={filters.search} maxLength={80} placeholder="ex. cafenea" onChange={e=>set({search:e.target.value})}/></label>
   <fieldset className="looking-for"><legend>Ce caută proiectul (oricare dintre cele alese)</legend>
    <div className="chips wrap">{LOOKING_FOR.map(([id,label])=><button type="button" key={id} aria-pressed={filters.looking.includes(id)} className={filters.looking.includes(id)?'active':''} onClick={()=>onFilters(toggleLooking(filters,id))}>{label}</button>)}</div>
   </fieldset>
   <div className="filters-grid">
    <label className="field"><span>Industrie</span><select value={filters.industry} onChange={e=>set({industry:e.target.value})}><option value="">Oricare</option>{industries.map(i=><option key={i} value={i}>{i}</option>)}</select></label>
    <label className="field"><span>Stadiu</span><select value={filters.stage} onChange={e=>set({stage:e.target.value})}><option value="">Oricare</option>{STAGES.map(([id,l])=><option key={id} value={id}>{l}</option>)}</select></label>
    <label className="field"><span>Oraș</span><input value={filters.city} maxLength={80} placeholder="ex. Cluj" onChange={e=>onFilters(setCity(filters,e.target.value))}/></label>
   </div>
   {filters.city.trim()&&<Toggle label="Include și proiectele Remote / Online" checked={filters.includeRemote} onChange={()=>set({includeRemote:!filters.includeRemote})}/>}
   {investor&&invest&&<>
    <label className="field investment-cap"><span>Investiție totală căutată de proiect (maximum, EUR)</span><input inputMode="decimal" value={filters.maxInvestment} placeholder="ex. 50000" aria-describedby="cap-help" onChange={e=>onFilters(setMaxInvestment(filters,e.target.value))}/></label>
    <p className="caption" id="cap-help">Suma totală pe care o caută proiectul, nu contribuția ta. Un proiect care caută 50.000 EUR poate accepta mai mulți investitori. Câmpul gol înseamnă fără plafon.</p>
    {filters.maxInvestment.trim()&&!filterError&&<Toggle label="Include și proiectele cu „Investiție de stabilit”" checked={filters.includeUnknown} onChange={()=>set({includeUnknown:!filters.includeUnknown})}/>}
   </>}
   {filterError&&<p className="error" role="alert">{filterError}</p>}
  </form>
  {results}
  <p className="disclaimer">Apar doar proiectele publicate ale altor utilizatori. Ciornele și datele financiare private nu sunt afișate.</p>
 </>;
}

function ProjectCardView({p,onOpen}:{p:ProjectCard;onOpen:()=>void}){
 const inv=investmentLabel(p),loc=locationLabel(p);
 return <article className="panel person-card project-discover-card">
  <div className="row"><strong className="project-card-title">{p.title||'Proiect fără titlu'}</strong></div>
  <p className="project-card-summary">{p.summary}</p>
  <div className="tags">{p.stage&&<span className="tag">{stageName(p.stage)}</span>}{p.industry&&<span className="tag">{p.industry}</span>}</div>
  {loc&&<div className="location"><MapPin size={13}/>{loc}</div>}
  {p.looking_for.length>0&&<p className="caption">Caută: {p.looking_for.map(lookingName).join(' · ')}</p>}
  {inv&&<p className="investment"><strong>{inv}</strong></p>}
  <div className="creator-match-person project-card-owner"><span className="avatar"><Avatar profile={{name:p.owner_name||'?',photo:p.ownerAvatarUrl}}/></span><div><strong>{p.owner_name}</strong><p className="caption">Publicat la {dateRo(p.published_at)}</p></div></div>
  <Button secondary onClick={onOpen}>Vezi proiectul <ArrowUpRight size={16}/></Button>
 </article>;
}
