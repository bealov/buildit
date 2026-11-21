// Match · „Descoperă oameni” (conturi reale, modul Creator) și profilul public al unei persoane.
// Doar acțiunea „Vezi profilul”: fără like, invitații sau mesaje, care nu au încă funcționalitate reală.
import {useEffect,useRef,useState} from 'react';
import {ArrowUpRight,RefreshCw,SlidersHorizontal} from 'lucide-react';
import {Button,Heading,Section,Empty,Toggle} from '../ui';
import {Avatar} from '../ProfilePhoto';
import {DESIRED_ROLES,SKILL_SUGGESTIONS,hoursLabel,participationFromStored,participationToStored,roleName} from '../participation';
import {loadErrorInfo} from './validation.ts';
import {roleLabel} from './roles.ts';
import {emptyFilters,filtersActive,filtersProblem,type Cursor,type PeopleApi,type PeopleFilters,type PersonCard,type PublicPerson} from './people.ts';

type ErrorInfo={code:string;hint:string};
type Status='loading'|'ready'|'error';
const MAX_CHIPS=6;

/** Container: filtre, încărcare, paginare. Rămâne montat la deschiderea unui profil, ca filtrele și lista să se păstreze. */
export function DiscoverPeople({api,selfId,open,visible=true}:{api:PeopleApi;selfId:string;open:(id:string)=>void;visible?:boolean}){
 const [draft,setDraft]=useState<PeopleFilters>(emptyFilters);
 const [applied,setApplied]=useState<PeopleFilters>(emptyFilters);
 const [people,setPeople]=useState<PersonCard[]>([]),[next,setNext]=useState<Cursor|null>(null);
 const [status,setStatus]=useState<Status>('loading'),[error,setError]=useState<ErrorInfo|null>(null);
 const [more,setMore]=useState<'idle'|'loading'|'error'>('idle');
 const seq=useRef(0),scroll=useRef(0);
 const problem=filtersProblem(draft);

 // Aplică filtrele: imediat pentru rol și bifă, după o scurtă pauză pentru textul scris.
 useEffect(()=>{
  if(problem||JSON.stringify(draft)===JSON.stringify(applied))return;
  const typed=draft.skill!==applied.skill||draft.minHours!==applied.minHours;
  const id=setTimeout(()=>setApplied(draft),typed?400:0);
  return()=>clearTimeout(id);
 },[draft,applied,problem]);

 const load=async(filters:PeopleFilters)=>{
  const n=++seq.current;setStatus('loading');setError(null);setMore('idle');
  try{const page=await api.discover(selfId,filters,null);if(n!==seq.current)return;setPeople(page.people);setNext(page.next);setStatus('ready')}
  catch(e){if(n!==seq.current)return;setError(loadErrorInfo(e));setStatus('error')}
 };
 useEffect(()=>{void load(applied)},[applied]);

 const loadMore=async()=>{
  if(!next||more==='loading')return;const n=seq.current;setMore('loading');
  try{const page=await api.discover(selfId,applied,next);if(n!==seq.current)return;setPeople(p=>[...p,...page.people.filter(x=>!p.some(y=>y.id===x.id))]);setNext(page.next);setMore('idle')}
  catch{if(n===seq.current)setMore('error')}
 };

 // Revenirea din profilul unei persoane păstrează poziția în listă.
 useEffect(()=>{if(!visible){scroll.current=window.scrollY;return}if(scroll.current){const y=scroll.current;requestAnimationFrame(()=>window.scrollTo(0,y))}},[visible]);

 const reset=()=>{const empty=emptyFilters();setDraft(empty);setApplied(empty)};
 return <PeopleView filters={draft} onFilters={setDraft} onReset={reset} filterError={problem} active={filtersActive(applied)}
  status={status} error={error} people={people} hasMore={!!next} more={more} onMore={()=>void loadMore()} onRetry={()=>void load(applied)} onOpen={open}/>;
}

/** Afișarea (fără încărcare), testabilă separat. */
export function PeopleView({filters,onFilters,onReset,filterError,active,status,error,people,hasMore,more,onMore,onRetry,onOpen}:{
 filters:PeopleFilters;onFilters:(f:PeopleFilters)=>void;onReset:()=>void;filterError:string|null;active:boolean;
 status:Status;error:ErrorInfo|null;people:PersonCard[];hasMore:boolean;more:'idle'|'loading'|'error';onMore:()=>void;onRetry:()=>void;onOpen:(id:string)=>void}){
 const set=(patch:Partial<PeopleFilters>)=>onFilters({...filters,...patch});
 const dirty=active||filtersActive(filters)||filters.includeUnknown;
 let results;
 if(status==='loading')results=<Empty>Se caută persoane…</Empty>;
 else if(status==='error')results=<Empty>Lista nu a putut fi încărcată.{error&&<><br/><small>{error.hint}</small><br/><small>Cod tehnic: {error.code}</small></>}<Button onClick={onRetry}><RefreshCw size={16}/> Încearcă din nou</Button></Empty>;
 else if(!people.length)results=active
  ?<Empty>Nicio persoană nu corespunde filtrelor alese.<br/><small>Încearcă o competență mai generală, alt rol sau mai puține ore minime.</small><Button secondary onClick={onReset}>Resetează filtrele</Button></Empty>
  :<Empty>Încă nu există alți creatori care vor să se alăture unui proiect.<br/><small>Aici apar persoanele cu rol Creator care au bifat „Vreau să mă alătur unui proiect” în profil. Revino mai târziu.</small></Empty>;
 else results=<>
  <p className="filter-summary" role="status">{people.length}{hasMore?'+':''} {people.length===1?'persoană':'persoane'}{active?' pentru filtrele alese':''}</p>
  <div className="people-grid">{people.map(p=><PersonCardView key={p.id} person={p} onOpen={()=>onOpen(p.id)}/>)}</div>
  {hasMore&&<div className="people-more"><Button secondary onClick={onMore} disabled={more==='loading'}>{more==='loading'?'Se încarcă…':'Arată mai multe'}</Button>{more==='error'&&<p className="error" role="alert">Nu am putut încărca restul listei. Încearcă din nou.</p>}</div>}
 </>;
 return <>
  <Heading eyebrow="MATCH · ÎNTRE CREATORI" title={'Împreună, ideile\npot merge mai departe.'}/>
  <p className="intro">Descoperă creatori care vor să se alăture unui proiect. Nu ai nevoie de un proiect propriu.</p>
  <Section title="Descoperă oameni"/>
  <form className="panel people-filters" onSubmit={e=>e.preventDefault()} aria-label="Filtre">
   <div className="filters-head"><SlidersHorizontal size={16}/><strong>Filtre</strong>{dirty&&<button type="button" className="text-button" onClick={onReset}>Resetează filtrele</button>}</div>
   <div className="filters-grid">
    <label className="field"><span>Competență</span><input value={filters.skill} maxLength={40} list="people-skill-suggestions" placeholder="ex. Marketing" onChange={e=>set({skill:e.target.value})}/><datalist id="people-skill-suggestions">{SKILL_SUGGESTIONS.map(s=><option key={s} value={s}/>)}</datalist></label>
    <label className="field"><span>Rol dorit</span><select value={filters.role} onChange={e=>set({role:e.target.value})}><option value="">Oricare</option>{DESIRED_ROLES.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
    <label className="field"><span>Minimum ore/săptămână</span><input inputMode="numeric" value={filters.minHours} placeholder="ex. 10" aria-describedby="hours-help" onChange={e=>set({minHours:e.target.value})}/></label>
   </div>
   <p className="caption" id="hours-help">Arată persoanele care au declarat cel puțin atâtea ore pe săptămână. Câmpul gol înseamnă fără limită. Disponibilitatea necompletată nu este considerată 0.</p>
   {filters.minHours.trim()&&!filterError&&<Toggle label="Include și persoanele fără disponibilitate completată" checked={filters.includeUnknown} onChange={()=>set({includeUnknown:!filters.includeUnknown})}/>}
   {filterError&&<p className="error" role="alert">{filterError}</p>}
  </form>
  {results}
  <p className="disclaimer">Vezi doar informațiile publice ale profilurilor. Emailul și datele private nu sunt afișate.</p>
 </>;
}

function Facts({skills,roles,hours,all=false}:{skills:string[];roles:string[];hours:number|null;all?:boolean}){
 const shown=all?skills:skills.slice(0,MAX_CHIPS),extra=skills.length-shown.length;
 return <dl className="person-facts">
  <dt>Competențe</dt><dd>{skills.length?<span className="tags">{shown.map(s=><span className="tag" key={s}>{s}</span>)}{extra>0&&<span className="tag">+{extra}</span>}</span>:<span className="muted">Necompletate</span>}</dd>
  <dt>Rol dorit</dt><dd>{roles.length?roles.map(roleName).join(' · '):<span className="muted">Necompletat</span>}</dd>
  <dt>Disponibilitate</dt><dd>{hours!=null?`${hoursLabel(hours)} / săptămână`:<span className="muted">Necompletată</span>}</dd>
 </dl>;
}

function PersonCardView({person,onOpen}:{person:PersonCard;onOpen:()=>void}){
 return <article className="panel person-card">
  <div className="creator-match-person"><span className="avatar"><Avatar profile={{name:person.display_name,photo:person.avatarUrl}}/></span><div><strong>{person.display_name}</strong><p className="caption">{[person.city,person.wants_to_develop?'Dezvoltă și un proiect':'Vrea să se alăture unui proiect'].filter(Boolean).join(' · ')}</p></div></div>
  <Facts skills={person.skills} roles={person.desired_roles} hours={person.weekly_hours}/>
  <Button secondary onClick={onOpen}>Vezi profilul <ArrowUpRight size={16}/></Button>
 </article>;
}

/** Profilul public al altei persoane (doar câmpuri publice). */
export function PersonProfile({api,id,back}:{api:PeopleApi;id:string;back:()=>void}){
 const [state,setState]=useState<{status:Status|'missing';person?:PublicPerson;error?:ErrorInfo}>({status:'loading'});
 const load=async()=>{setState({status:'loading'});try{const person=await api.person(id);setState(person?{status:'ready',person}:{status:'missing'})}catch(e){setState({status:'error',error:loadErrorInfo(e)})}};
 useEffect(()=>{void load()},[id]);
 return <PersonProfileView state={state} onRetry={()=>void load()} back={back}/>;
}

export function PersonProfileView({state,onRetry,back}:{state:{status:Status|'missing';person?:PublicPerson;error?:ErrorInfo};onRetry:()=>void;back:()=>void}){
 if(state.status==='loading')return <Empty>Se încarcă profilul…</Empty>;
 if(state.status==='error')return <Empty>Profilul nu a putut fi încărcat.{state.error&&<><br/><small>{state.error.hint}</small><br/><small>Cod tehnic: {state.error.code}</small></>}<Button onClick={onRetry}>Încearcă din nou</Button></Empty>;
 const p=state.person;
 if(state.status==='missing'||!p)return <Empty>Profilul nu există sau nu mai este disponibil.<Button secondary onClick={back}>Înapoi la Descoperă oameni</Button></Empty>;
 const participation=participationToStored(participationFromStored({develop:p.wants_to_develop,join:p.wants_to_join,skills:p.skills,roles:p.desired_roles,hours:p.weekly_hours}));
 return <>
  <Heading eyebrow="MATCH · PROFIL PUBLIC" title={p.display_name}/>
  <div className="profile-card panel"><div className="large-avatar"><Avatar profile={{name:p.display_name,photo:p.avatarUrl}}/></div><h2>{p.display_name}</h2>{p.roles.map(r=><span className="tag" key={r}>{roleLabel[r]}</span>)}
   <p>{p.bio||'Această persoană nu a adăugat încă o descriere.'}</p>
   {(p.city||p.company)&&<small>{[p.city,p.company].filter(Boolean).join(' · ')}</small>}
   <div className="participation-summary"><div className="tags">{p.wants_to_develop&&<span className="tag intent">Dezvoltă un proiect</span>}{p.wants_to_join&&<span className="tag intent">Vrea să se alăture unui proiect</span>}</div></div>
   <Facts skills={participation.skills} roles={participation.roles} hours={participation.hours} all/>
   {(p.industries||p.objectives)&&<dl className="person-facts">{p.industries&&<><dt>Industrie de interes</dt><dd>{p.industries}</dd></>}{p.objectives&&<><dt>Obiective</dt><dd>{p.objectives}</dd></>}</dl>}
  </div>
  <p className="notice">Contactul nu este afișat. Cererile de colaborare vor fi disponibile într-o etapă ulterioară; până atunci poți doar consulta profilul public.</p>
  <Button secondary onClick={back}>Înapoi la Descoperă oameni</Button>
 </>;
}
