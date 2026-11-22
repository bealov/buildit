// Cum vrea un Creator să participe: intenții (nu roluri de autentificare), competențe, rol dorit, disponibilitate.
// Aceleași reguli ca în migrarea 20261115000000_creator_participation.sql.

export const SKILL_SUGGESTIONS=['Marketing','Vânzări','Design','Programare','Finanțe','Coordonare de echipă'] as const;
export const DESIRED_ROLES=[['cofondator','Cofondator'],['membru_echipa','Membru al echipei'],['manager_proiect','Manager de proiect'],['team_leader','Team leader']] as const;
export type DesiredRole=typeof DESIRED_ROLES[number][0];
export const PARTICIPATION_LIMITS={skills:15,skill:40,hours:[1,168]} as const;

/** Forma editabilă. Orele rămân text până la salvare, ca în celelalte câmpuri numerice. */
export type Participation={develop:boolean;join:boolean;skills:string[];roles:DesiredRole[];hours:string};
export const emptyParticipation=():Participation=>({develop:false,join:false,skills:[],roles:[],hours:''});

export const isDesiredRole=(r:string):r is DesiredRole=>DESIRED_ROLES.some(([id])=>id===r);
export const roleName=(r:string)=>DESIRED_ROLES.find(([id])=>id===r)?.[1]??r;
export const normalizeSkill=(s:string)=>s.replace(/\s+/g,' ').trim();
export const hasSkill=(list:string[],s:string)=>list.some(x=>x.toLocaleLowerCase('ro')===normalizeSkill(s).toLocaleLowerCase('ro'));

export function skillProblem(list:string[],raw:string){
 const s=normalizeSkill(raw);
 if(!s)return 'Scrie competența înainte să o adaugi.';
 if(s.length>PARTICIPATION_LIMITS.skill)return `O competență poate avea cel mult ${PARTICIPATION_LIMITS.skill} de caractere.`;
 if(hasSkill(list,s))return 'Competența este deja în listă.';
 if(list.length>=PARTICIPATION_LIMITS.skills)return `Poți adăuga cel mult ${PARTICIPATION_LIMITS.skills} competențe.`;
 return null;
}

/** „1 oră”, „10 ore”, „20 de ore”. */
export const hoursLabel=(n:number)=>n===1?'1 oră':`${n} ${n%100>=20||n%100===0?'de ':''}ore`;

export function parseHours(text:string):{value:number|null;problem:string|null}{
 const t=text.trim();if(!t)return {value:null,problem:null};
 if(!/^\d+$/.test(t))return {value:null,problem:'Disponibilitatea se scrie ca număr întreg de ore pe săptămână.'};
 const n=Number(t),[min,max]=PARTICIPATION_LIMITS.hours;
 if(n<min||n>max)return {value:null,problem:`Disponibilitatea trebuie să fie între ${min} și ${max} de ore pe săptămână.`};
 return {value:n,problem:null};
}

/** Validează doar ce se salvează; datele colaborării se păstrează și când intenția „alătur” e debifată. */
export function participationProblem(p:Participation){
 if(p.skills.length>PARTICIPATION_LIMITS.skills)return `Poți adăuga cel mult ${PARTICIPATION_LIMITS.skills} competențe.`;
 if(p.skills.some(s=>!normalizeSkill(s)||s.length>PARTICIPATION_LIMITS.skill))return `Fiecare competență trebuie să aibă între 1 și ${PARTICIPATION_LIMITS.skill} de caractere.`;
 if(!p.roles.every(isDesiredRole))return 'Alege rolul dorit din listă.';
 return parseHours(p.hours).problem;
}

/** Valori stocate (bază de date sau demo) → formă editabilă; tolerează date vechi sau lipsă. */
export function participationFromStored(v?:{develop?:boolean;join?:boolean;skills?:unknown;roles?:unknown;hours?:number|null}|null):Participation{
 const skills=Array.isArray(v?.skills)?v.skills.filter((s):s is string=>typeof s==='string'):[];
 const roles=Array.isArray(v?.roles)?v.roles.filter((r):r is DesiredRole=>typeof r==='string'&&isDesiredRole(r)):[];
 return {develop:!!v?.develop,join:!!v?.join,skills,roles,hours:v?.hours==null?'':String(v.hours)};
}

export type StoredParticipation={develop:boolean;join:boolean;skills:string[];roles:DesiredRole[];hours:number|null};
export function participationToStored(p:Participation):StoredParticipation{
 const seen=new Set<string>();const skills:string[]=[];
 for(const raw of p.skills){const s=normalizeSkill(raw),k=s.toLocaleLowerCase('ro');if(s&&!seen.has(k)){seen.add(k);skills.push(s)}}
 return {develop:p.develop,join:p.join,skills,roles:DESIRED_ROLES.map(([id])=>id).filter(id=>p.roles.includes(id)),hours:parseHours(p.hours).value};
}
