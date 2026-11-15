import {useState} from 'react';
import {Plus,X} from 'lucide-react';
import {Toggle} from './ui';
import {DESIRED_ROLES,SKILL_SUGGESTIONS,hasSkill,hoursLabel,normalizeSkill,roleName,skillProblem,type DesiredRole,type Participation,type StoredParticipation} from './participation';

export const PARTICIPATION_INTRO='Dezvoltă un proiect sau contribuie la unul.';

/** Secțiunea „Cum vrei să participi?” din profilul Creator (demo și cont real). */
export function ParticipationFields({value,onChange}:{value:Participation;onChange:(p:Participation)=>void}){
 const [custom,setCustom]=useState(''),[error,setError]=useState('');
 const set=(patch:Partial<Participation>)=>onChange({...value,...patch});
 const toggleSkill=(s:string)=>set({skills:hasSkill(value.skills,s)?value.skills.filter(x=>x.toLocaleLowerCase('ro')!==s.toLocaleLowerCase('ro')):[...value.skills,s]});
 const toggleRole=(r:DesiredRole)=>set({roles:value.roles.includes(r)?value.roles.filter(x=>x!==r):[...value.roles,r]});
 const addCustom=()=>{const problem=skillProblem(value.skills,custom);if(problem){setError(problem);return}set({skills:[...value.skills,normalizeSkill(custom)]});setCustom('');setError('')};
 const own=value.skills.filter(s=>!SKILL_SUGGESTIONS.some(x=>x.toLocaleLowerCase('ro')===s.toLocaleLowerCase('ro')));
 return <section className="participation" aria-labelledby="participation-title">
  <h3 id="participation-title">Cum vrei să participi?</h3>
  <p className="caption">{PARTICIPATION_INTRO} Poți alege ambele variante; nu este nevoie de un proiect propriu.</p>
  <Toggle label="Dezvolt un proiect" checked={value.develop} onChange={()=>set({develop:!value.develop})}/>
  <Toggle label="Vreau să mă alătur unui proiect" checked={value.join} onChange={()=>set({join:!value.join})}/>
  {value.join&&<div className="participation-details">
   <fieldset><legend>Competențe</legend>
    <div className="chips wrap">{SKILL_SUGGESTIONS.map(s=><button type="button" key={s} aria-pressed={hasSkill(value.skills,s)} className={hasSkill(value.skills,s)?'active':''} onClick={()=>toggleSkill(s)}>{s}</button>)}
     {own.map(s=><button type="button" key={s} aria-pressed="true" className="active" aria-label={`Elimină competența ${s}`} onClick={()=>toggleSkill(s)}>{s} <X size={12} aria-hidden="true"/></button>)}</div>
    <div className="skill-add"><input value={custom} maxLength={60} placeholder="Altă competență" aria-label="Altă competență" onChange={e=>{setCustom(e.target.value);setError('')}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addCustom()}}}/><button type="button" className="btn secondary" onClick={addCustom}><Plus size={15}/> Adaugă</button></div>
    {error&&<p className="error" role="alert">{error}</p>}
   </fieldset>
   <fieldset><legend>Rol dorit</legend>
    <div className="chips wrap">{DESIRED_ROLES.map(([id,label])=><button type="button" key={id} aria-pressed={value.roles.includes(id)} className={value.roles.includes(id)?'active':''} onClick={()=>toggleRole(id)}>{label}</button>)}</div>
    <p className="caption">Rolul arată ce cauți într-o echipă. „Cofondator” nu oferă automat un statut sau drepturi speciale.</p>
   </fieldset>
   <label className="field hours-field"><span>Disponibilitate (ore pe săptămână)</span><input inputMode="numeric" value={value.hours} placeholder="ex. 10" onChange={e=>set({hours:e.target.value})} onFocus={e=>e.currentTarget.select()}/></label>
  </div>}
 </section>;
}

/** Rezumat pentru pagina de profil. Afișează detaliile colaborării doar când intenția „alătur” este activă. */
export function ParticipationSummary({value}:{value?:StoredParticipation|null}){
 if(!value||(!value.develop&&!value.join))return null;
 const intents=[value.develop&&'Dezvoltă un proiect',value.join&&'Vrea să se alăture unui proiect'].filter(Boolean) as string[];
 return <div className="participation-summary">
  <div className="tags">{intents.map(i=><span className="tag intent" key={i}>{i}</span>)}</div>
  {value.join&&(value.skills.length>0||value.roles.length>0||value.hours!=null)&&<dl>
   {value.skills.length>0&&<><dt>Competențe</dt><dd>{value.skills.join(' · ')}</dd></>}
   {value.roles.length>0&&<><dt>Rol dorit</dt><dd>{value.roles.map(roleName).join(' · ')}</dd></>}
   {value.hours!=null&&<><dt>Disponibilitate</dt><dd>{hoursLabel(value.hours)} pe săptămână</dd></>}
  </dl>}
 </div>;
}
