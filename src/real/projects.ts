// Proiecte reale: tipuri, validări și acces la date. Aceleași reguli ca în migrarea
// 20261122000000_projects.sql; baza de date le impune oricum, aici oferim mesaje clare.
import type {SupabaseClient} from '@supabase/supabase-js';
import {industries} from '../model.ts';
import {parseFinancialInput} from '../financialInput.ts';

export const MAX_PROJECTS=20;
export const STAGES=[['idee','Idee'],['in_dezvoltare','În dezvoltare'],['lansat','Deja lansat']] as const;
export type Stage=typeof STAGES[number][0];
export const LOOKING_FOR=[['colegi','Colegi'],['parteneri','Parteneri'],['investitie','Investiție']] as const;
export type LookingFor=typeof LOOKING_FOR[number][0];
export const FIN_FIELDS=[
 ['monthly_revenue','Venit lunar estimat (€)'],['fixed_costs','Costuri fixe lunare (€)'],['variable_costs','Costuri variabile lunare (€)'],
 ['initial_investment','Investiție inițială (€)'],['investment_amount','Investiție căutată (€)'],['monthly_growth_pct','Creștere lunară estimată (%)'],
 ['unit_price','Preț unitar (€), dacă se aplică'],['unit_cost','Cost variabil unitar (€)']
] as const;
export type FinKey=typeof FIN_FIELDS[number][0];
export const TEXT_FIELDS=[
 ['problem','Ce problemă rezolvi?'],['solution','Soluția propusă'],['market','Clienți și oportunitate de piață'],['difference','Ce te diferențiază?'],
 ['business_model','Surse de venit și model de preț'],['marketing','Strategie de marketing'],['growth_plan','Strategie de creștere'],['objectives','Obiective'],
 ['team','Echipa'],['traction','Validare / clienți pilot']
] as const;
export type TextKey=typeof TEXT_FIELDS[number][0];
export const LIMITS={title:120,summary:600,city:80,text:2000,links:5,link:300};

export const stageName=(s:string)=>STAGES.find(([id])=>id===s)?.[1]??'';
export const lookingName=(l:string)=>LOOKING_FOR.find(([id])=>id===l)?.[1]??l;
const isStage=(s:unknown):s is Stage=>STAGES.some(([id])=>id===s);
const isLooking=(s:unknown):s is LookingFor=>LOOKING_FOR.some(([id])=>id===s);
const isFinKey=(s:unknown):s is FinKey=>FIN_FIELDS.some(([id])=>id===s);

/** Ce văd ceilalți (și proprietarul): tabelul projects. */
export type PublicProject={id:string;owner_id:string;status:'draft'|'published';title:string;summary:string;industry:string;stage:string;city:string;is_remote:boolean;looking_for:string[];
 investment_public:number|null;created_at:string;updated_at:string;published_at:string|null}&Record<TextKey,string>;
/** Doar proprietarul: tabelul project_private. */
export type PrivateProject={unknown_financials:string[];plan_links:string[]}&Record<FinKey,number|string|null>;
export type ProjectForm={title:string;summary:string;industry:string;stage:''|Stage;city:string;is_remote:boolean;looking_for:LookingFor[];
 fin:Record<FinKey,string>;unknown:FinKey[];links:string}&Record<TextKey,string>;

export function emptyProjectForm():ProjectForm{
 return {title:'',summary:'',industry:'',stage:'',city:'',is_remote:false,looking_for:[],
  ...Object.fromEntries(TEXT_FIELDS.map(([k])=>[k,''])) as Record<TextKey,string>,
  fin:Object.fromEntries(FIN_FIELDS.map(([k])=>[k,''])) as Record<FinKey,string>,unknown:[],links:''};
}

/** Suma din baza de date → text editabil (punct zecimal înlocuit cu virgulă, fără zerouri inutile). */
const amountText=(v:number|string|null|undefined)=>v==null||v===''?'':String(v).replace(/(\.\d*?)0+$/,'$1').replace(/\.$/,'').replace('.',',');

export function formFromProject(p:PublicProject,v:PrivateProject|null):ProjectForm{
 const f=emptyProjectForm();
 return {...f,title:p.title??'',summary:p.summary??'',industry:industries.includes(p.industry)?p.industry:'',stage:isStage(p.stage)?p.stage:'',city:p.city??'',is_remote:!!p.is_remote,
  looking_for:(p.looking_for??[]).filter(isLooking),...Object.fromEntries(TEXT_FIELDS.map(([k])=>[k,p[k]??''])) as Record<TextKey,string>,
  fin:Object.fromEntries(FIN_FIELDS.map(([k])=>[k,amountText(v?.[k])])) as Record<FinKey,string>,
  unknown:(v?.unknown_financials??[]).filter(isFinKey),links:(v?.plan_links??[]).join('\n')};
}

/** Text → sumă: gol = necompletat (null); maximum 2 zecimale; fără separatori de mii. */
export function parseAmount(text:string):{value:string|null;problem:string|null}{
 const t=text.trim();if(!t)return {value:null,problem:null};
 const n=parseFinancialInput(t);
 if(n===null)return {value:null,problem:'introdu un număr pozitiv sau 0, cu virgulă ori punct pentru zecimale, fără separatori de mii'};
 if(/[.,]\d{3,}$/.test(t))return {value:null,problem:'folosește cel mult două zecimale'};
 if(n>=1e12)return {value:null,problem:'suma este prea mare'};
 return {value:t.replace(',','.').replace(/^0+(?=\d)/,''),problem:null};
}
export const parseLinks=(text:string)=>text.split(/\s*\n\s*/).map(s=>s.trim()).filter(Boolean);

/** Erori care împiedică orice salvare (format), indiferent de ciornă sau publicare. */
export function formatProblems(f:ProjectForm):{step:number;text:string}[]{
 const out:{step:number;text:string}[]=[];
 if(f.title.length>LIMITS.title)out.push({step:0,text:`Titlul poate avea cel mult ${LIMITS.title} de caractere.`});
 if(f.summary.length>LIMITS.summary)out.push({step:0,text:`Descrierea scurtă poate avea cel mult ${LIMITS.summary} de caractere.`});
 if(f.city.length>LIMITS.city)out.push({step:0,text:`Orașul poate avea cel mult ${LIMITS.city} de caractere.`});
 for(const [k,label] of TEXT_FIELDS)if(f[k].length>LIMITS.text)out.push({step:k==='team'||k==='traction'?4:['problem','solution','market','difference'].includes(k)?1:2,text:`„${label}” poate avea cel mult ${LIMITS.text} de caractere.`});
 for(const [k,label] of FIN_FIELDS){if(f.unknown.includes(k))continue;const {problem}=parseAmount(f.fin[k]);if(problem)out.push({step:3,text:`Verifică „${label}”: ${problem}.`})}
 const links=parseLinks(f.links);
 if(links.length>LIMITS.links)out.push({step:4,text:`Poți adăuga cel mult ${LIMITS.links} linkuri.`});
 if(links.some(l=>l.length>LIMITS.link||!/^https?:\/\/\S+$/i.test(l)))out.push({step:4,text:'Fiecare link trebuie să înceapă cu https:// sau http:// (câte unul pe rând).'});
 return out;
}

/** Câmpurile obligatorii pentru publicare (aceleași ca regula din baza de date). */
export function publishMissing(f:ProjectForm):{step:number;text:string}[]{
 const out:{step:number;text:string}[]=[];
 if(!f.title.trim())out.push({step:0,text:'titlul'});
 if(!f.summary.trim())out.push({step:0,text:'descrierea scurtă'});
 if(!f.industry)out.push({step:0,text:'industria'});
 if(!f.stage)out.push({step:0,text:'stadiul'});
 if(!f.is_remote&&!f.city.trim())out.push({step:0,text:'locația (un oraș sau „Remote / Online”)'});
 if(!f.looking_for.length)out.push({step:5,text:'ce caută proiectul (colegi, parteneri și/sau investiție)'});
 return out;
}

/** Datele trimise la salvare, separate: public (projects) și privat (project_private). */
export function savePayload(f:ProjectForm){
 const pub={title:f.title.trim(),summary:f.summary.trim(),industry:f.industry,stage:f.stage,city:f.city.trim(),is_remote:f.is_remote,
  looking_for:LOOKING_FOR.map(([id])=>id).filter(id=>f.looking_for.includes(id)),
  ...Object.fromEntries(TEXT_FIELDS.map(([k])=>[k,f[k].trim()]))};
 // Sumele se păstrează și când „Caut investiție” este debifat; doar vizibilitatea se schimbă.
 const priv={...Object.fromEntries(FIN_FIELDS.map(([k])=>[k,parseAmount(f.fin[k]).value])),unknown_financials:FIN_FIELDS.map(([k])=>k).filter(k=>f.unknown.includes(k)),plan_links:parseLinks(f.links)};
 return {pub,priv};
}

const nf=new Intl.NumberFormat('ro-RO',{minimumFractionDigits:0,maximumFractionDigits:2});
export const eur=(v:number|string)=>`${nf.format(Number(v))} EUR`;

/** Textul public despre investiție; null = nu se afișează (proiectul nu caută investiție). */
export function investmentLabel(p:Pick<PublicProject,'looking_for'|'investment_public'>){
 if(!(p.looking_for??[]).includes('investitie'))return null;
 return p.investment_public!=null?`Investiție căutată: ${eur(p.investment_public)}`:'Investiție de stabilit';
}
export const locationLabel=(p:{city:string;is_remote:boolean})=>[p.is_remote?'Remote / Online':'',p.city.trim()].filter(Boolean).join(' · ');

/** Valoarea financiară pentru proprietar: 0, sumă, „Nu am estimat încă” sau „Necompletat”. */
export function finDisplay(v:PrivateProject|null,k:FinKey){
 if(v?.unknown_financials?.includes(k))return 'Nu am estimat încă';
 const x=v?.[k];if(x==null||x==='')return 'Necompletat';
 return k==='monthly_growth_pct'?`${nf.format(Number(x))}%`:eur(x);
}

// ---------------------------------------------------------------------------
export type OwnerCard={id:string;display_name:string;avatarUrl?:string};
export type ProjectBundle={project:PublicProject;priv:PrivateProject|null;owner:OwnerCard|null};
export type SaveResult={id:string;status:'draft'|'published';updated_at:string};
export type ProjectsApi={
 mine(userId:string):Promise<PublicProject[]>;
 get(id:string,userId:string):Promise<ProjectBundle|null>;
 save(id:string|null,expected:string|null,status:'draft'|'published',form:ProjectForm):Promise<SaveResult>;
 setStatus(id:string,expected:string,status:'draft'|'published'):Promise<SaveResult>;
 remove(id:string):Promise<void>;
};

const PUBLIC_COLS='id,owner_id,status,title,summary,industry,stage,city,is_remote,looking_for,investment_public,created_at,updated_at,published_at,'+TEXT_FIELDS.map(([k])=>k).join(',');
const PRIVATE_COLS='unknown_financials,plan_links,'+FIN_FIELDS.map(([k])=>k).join(',');

export function createProjectsApi(client:SupabaseClient):ProjectsApi{
 const fail=(error:unknown)=>{if(error)throw error};
 const one=(data:unknown)=>{const row=(Array.isArray(data)?data[0]:data) as SaveResult|undefined;if(!row)throw {code:'42501'};return row};
 return {
  async mine(userId){
   const {data,error}=await client.from('projects').select(PUBLIC_COLS).eq('owner_id',userId).order('updated_at',{ascending:false}).limit(MAX_PROJECTS);
   fail(error);return (data??[]) as unknown as PublicProject[];
  },
  async get(id,userId){
   const {data,error}=await client.from('projects').select(PUBLIC_COLS).eq('id',id).maybeSingle();
   fail(error);const project=data as unknown as PublicProject|null;if(!project)return null;
   const own=project.owner_id===userId;
   // Datele private se cer doar pentru proiectele proprii (RLS le refuză oricum celorlalți).
   const [priv,owner]=await Promise.all([
    own?client.from('project_private').select(PRIVATE_COLS).eq('project_id',id).maybeSingle():Promise.resolve({data:null,error:null}),
    client.from('profiles').select('id,display_name,avatar_path').eq('id',project.owner_id).maybeSingle()
   ]);
   fail(priv.error);fail(owner.error);
   let ownerCard:OwnerCard|null=null;
   const o=owner.data as {id:string;display_name:string;avatar_path:string|null}|null;
   if(o){ownerCard={id:o.id,display_name:o.display_name};if(o.avatar_path===`${o.id}/avatar.jpg`){const s=await client.storage.from('avatars').createSignedUrl(o.avatar_path,3600);ownerCard.avatarUrl=s.data?.signedUrl}}
   return {project,priv:priv.data as unknown as PrivateProject|null,owner:ownerCard};
  },
  async save(id,expected,status,form){
   const {pub,priv}=savePayload(form);
   const {data,error}=await client.rpc('save_project',{p_id:id,p_expected_updated_at:expected,p_status:status,p_public:pub,p_private:priv});
   fail(error);return one(data);
  },
  async setStatus(id,expected,status){
   const {data,error}=await client.rpc('set_project_status',{p_id:id,p_expected_updated_at:expected,p_status:status});
   fail(error);return one(data);
  },
  async remove(id){
   const {data,error}=await client.from('projects').delete().eq('id',id).eq('status','draft').select('id');
   fail(error);if(!data?.length)throw {code:'42501'};
  }
 };
}

/** Mesaj pentru erorile de salvare. */
export function projectErrorMessage(code?:string|null){
 if(code==='PT409')return 'Proiectul a fost modificat între timp, pe alt dispozitiv.';
 if(code==='PT422')return `Ai atins limita de ${MAX_PROJECTS} de proiecte. Șterge o ciornă pentru a crea alta.`;
 if(code==='23514')return 'Unele câmpuri nu sunt completate corect sau lipsesc câmpuri obligatorii pentru publicare.';
 if(code==='42501')return 'Nu ai permisiunea pentru această operațiune (doar proprietarul cu rol Creator).';
 if(code==='PGRST202'||code==='42P01'||code==='PGRST205')return 'Proiectele nu sunt încă disponibile în baza de date. Aplică migrarea 20261122000000_projects.sql.';
 return 'Salvarea nu a reușit. Verifică conexiunea și încearcă din nou.';
}

// ---------------------------------------------------------------------------
// Descoperă proiecte
// ---------------------------------------------------------------------------
export const DISCOVER_PAGE=12;
export type DiscoverRole='creator'|'investor';
export type ProjectCard={id:string;title:string;summary:string;industry:string;stage:string;city:string;is_remote:boolean;looking_for:string[];investment_public:number|null;
 published_at:string;owner_id:string;owner_name:string;owner_avatar_path:string|null;ownerAvatarUrl?:string};
export type DiscoverFilters={search:string;looking:LookingFor[];industry:string;stage:string;city:string;includeRemote:boolean;maxInvestment:string;includeUnknown:boolean};
export type DiscoverCursor={publishedAt:string;id:string};

/** Valorile implicite pe rol: Investitorul pornește cu „Investiție” bifat (se poate debifa). */
export const defaultDiscoverFilters=(role:DiscoverRole):DiscoverFilters=>({search:'',looking:role==='investor'?['investitie']:[],industry:'',stage:'',city:'',includeRemote:true,maxInvestment:'',includeUnknown:false});
export const sameFilters=(a:DiscoverFilters,b:DiscoverFilters)=>JSON.stringify(a)===JSON.stringify(b);

/** Comută o opțiune „ce caută”. Debifarea „Investiție” golește plafonul și opțiunea pentru sumele necunoscute, ca să nu rămână filtre ascunse. */
export function toggleLooking(f:DiscoverFilters,l:LookingFor):DiscoverFilters{
 const on=f.looking.includes(l);
 const looking=on?f.looking.filter(x=>x!==l):[...f.looking,l];
 return l==='investitie'&&on?{...f,looking,maxInvestment:'',includeUnknown:false}:{...f,looking};
}
/** Golirea orașului readuce „Include Remote / Online” la valoarea implicită (opțiunea este vizibilă doar cu oraș). */
export const setCity=(f:DiscoverFilters,city:string):DiscoverFilters=>({...f,city,includeRemote:city.trim()?f.includeRemote:true});
/** Golirea plafonului resetează opțiunea pentru sumele necunoscute (vizibilă doar cu plafon). */
export const setMaxInvestment=(f:DiscoverFilters,v:string):DiscoverFilters=>({...f,maxInvestment:v,includeUnknown:v.trim()?f.includeUnknown:false});

export function discoverFiltersProblem(f:DiscoverFilters){
 if(!f.maxInvestment.trim())return null;
 const {problem}=parseAmount(f.maxInvestment);
 return problem?`Investiția totală căutată (maximum): ${problem}.`:null;
}

/** Parametrii pentru discover_projects. Plafonul se trimite doar cu „Investiție” bifat (rol Investitor). */
export function discoverArgs(role:DiscoverRole,f:DiscoverFilters,cursor:DiscoverCursor|null|undefined,limit:number){
 const cap=role==='investor'&&f.looking.includes('investitie')?parseAmount(f.maxInvestment).value:null;
 const city=f.city.replace(/\s+/g,' ').trim();
 return {
  p_search:f.search.replace(/\s+/g,' ').trim().slice(0,80)||null,
  p_looking_for:f.looking.length?LOOKING_FOR.map(([id])=>id).filter(id=>f.looking.includes(id)):null,
  p_industry:industries.includes(f.industry)?f.industry:null,
  p_stage:STAGES.some(([id])=>id===f.stage)?f.stage:null,
  p_city:city?city.slice(0,80):null,
  p_include_remote:city?f.includeRemote:true,
  p_max_investment:cap,
  p_include_unknown_investment:cap!==null&&f.includeUnknown,
  p_after_published_at:cursor?.publishedAt??null,p_after_id:cursor?.id??null,p_limit:limit
 };
}

export type DiscoverProjectsApi={discover(selfId:string,role:DiscoverRole,f:DiscoverFilters,cursor?:DiscoverCursor|null):Promise<{projects:ProjectCard[];next:DiscoverCursor|null}>};
const str=(v:unknown)=>typeof v==='string'?v:'';
export function createDiscoverProjectsApi(client:SupabaseClient):DiscoverProjectsApi{
 return {
  async discover(selfId,role,f,cursor){
   const {data,error}=await client.rpc('discover_projects',discoverArgs(role,f,cursor,DISCOVER_PAGE+1));
   if(error)throw error;
   const rows=((data??[]) as Record<string,unknown>[]).filter(r=>r&&r.owner_id!==selfId);
   // Doar câmpurile publice cunoscute ajung în card.
   const page:ProjectCard[]=rows.slice(0,DISCOVER_PAGE).map(r=>({id:str(r.id),title:str(r.title),summary:str(r.summary),industry:str(r.industry),stage:str(r.stage),city:str(r.city),is_remote:!!r.is_remote,
    looking_for:Array.isArray(r.looking_for)?r.looking_for.filter((x):x is string=>typeof x==='string'):[],investment_public:r.investment_public==null?null:Number(r.investment_public),
    published_at:str(r.published_at),owner_id:str(r.owner_id),owner_name:str(r.owner_name),owner_avatar_path:str(r.owner_avatar_path)===`${str(r.owner_id)}/avatar.jpg`?str(r.owner_avatar_path):null}));
   const paths=[...new Set(page.map(p=>p.owner_avatar_path).filter((x):x is string=>!!x))];
   if(paths.length){
    const signed=await client.storage.from('avatars').createSignedUrls(paths,3600);
    const urls=new Map((signed.data??[]).filter(s=>s.signedUrl&&!s.error).map(s=>[s.path,s.signedUrl]));
    for(const p of page)if(p.owner_avatar_path)p.ownerAvatarUrl=urls.get(p.owner_avatar_path)??undefined;
   }
   const last=page.at(-1);
   return {projects:page,next:rows.length>DISCOVER_PAGE&&last?{publishedAt:last.published_at,id:last.id}:null};
  }
 };
}
