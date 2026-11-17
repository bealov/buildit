// Validări pentru formularele conturilor reale. Limitele sunt aceleași ca în migrarea SQL;
// baza de date le verifică oricum, aici oferim doar mesaje clare în română.
import {participationProblem,type Participation} from '../participation.ts';
import {industries,stages} from '../model.ts';

export const LIMITS={name:[2,80],bio:600,city:80,company:120,industries:80,objectives:600,link:300,stage:40,password:[10,72]} as const;

export const validEmail=(email:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())&&email.trim().length<=254;

export function passwordProblem(password:string,confirm?:string){
 if(password.length<LIMITS.password[0])return `Parola trebuie să aibă cel puțin ${LIMITS.password[0]} caractere.`;
 if(new TextEncoder().encode(password).length>LIMITS.password[1])return `Parola poate avea cel mult ${LIMITS.password[1]} de caractere.`;
 if(confirm!==undefined&&password!==confirm)return 'Parolele nu coincid.';
 return null;
}

export function nameProblem(name:string){
 const n=name.trim().length;
 if(n<LIMITS.name[0])return 'Completează numele (minimum 2 caractere).';
 if(n>LIMITS.name[1])return `Numele poate avea cel mult ${LIMITS.name[1]} de caractere.`;
 return null;
}

export function linkProblem(link:string){
 const v=link.trim();if(!v)return null;
 if(v.length>LIMITS.link)return `Linkul poate avea cel mult ${LIMITS.link} de caractere.`;
 if(!/^https?:\/\/[^\s]+$/i.test(v))return 'Linkul trebuie să înceapă cu https:// sau http://.';
 return null;
}

/** Text gol → null; altfel număr întreg nenegativ sau eroare. */
export function parseBudget(text:string):{value:number|null;problem:string|null}{
 const v=text.trim().replace(/\s/g,'');
 if(!v)return {value:null,problem:null};
 if(!/^\d+$/.test(v))return {value:null,problem:'Bugetul trebuie să fie o sumă întreagă, fără zecimale sau semne.'};
 const n=Number(v);
 if(!Number.isSafeInteger(n)||n>2147483647)return {value:null,problem:'Bugetul este prea mare.'};
 return {value:n,problem:null};
}

export type ProfileForm={display_name:string;bio:string;city:string;company:string;industries:string;objectives:string;link:string;show_email_after_match:boolean;show_link_after_match:boolean;investor_min_budget:string;investor_max_budget:string;investor_stage:string;participation:Participation};

export function profileFormProblem(f:ProfileForm,investor:boolean){
 const name=nameProblem(f.display_name);if(name)return name;
 const lengths:[keyof ProfileForm,number,string][]=[['bio',LIMITS.bio,'Descrierea'],['city',LIMITS.city,'Locația'],['company',LIMITS.company,'Compania'],['objectives',LIMITS.objectives,'Obiectivele']];
 for(const [key,max,label] of lengths)if(String(f[key]).length>max)return `${label} poate avea cel mult ${max} de caractere.`;
 if(f.industries&&!industries.includes(f.industries))return 'Alege o industrie din listă.';
 const link=linkProblem(f.link);if(link)return link;
 const part=participationProblem(f.participation);if(part)return part;
 if(investor){
  const min=parseBudget(f.investor_min_budget),max=parseBudget(f.investor_max_budget);
  if(min.problem)return min.problem;if(max.problem)return max.problem;
  if(min.value!==null&&max.value!==null&&min.value>max.value)return 'Bugetul minim nu poate depăși bugetul maxim.';
  if(f.investor_stage&&!stages.includes(f.investor_stage))return 'Alege un stadiu din listă.';
 }
 return null;
}

/** Mesaje pentru erorile de autentificare. Nu dezvăluie dacă o adresă de email are cont. */
export function authErrorMessage(code?:string|null,status?:number){
 switch(code){
  case 'invalid_credentials':return 'Email sau parolă incorectă.';
  case 'email_not_confirmed':return 'Adresa de email nu este confirmată încă. Verifică emailul sau cere un nou link de confirmare.';
  case 'weak_password':return 'Parola este prea slabă. Alege o parolă mai lungă și greu de ghicit.';
  case 'same_password':return 'Parola nouă trebuie să fie diferită de cea veche.';
  case 'over_email_send_rate_limit':case 'over_request_rate_limit':return 'Prea multe încercări într-un timp scurt. Încearcă din nou mai târziu.';
  case 'signup_disabled':return 'Înregistrarea conturilor noi nu este disponibilă momentan.';
  case 'session_not_found':case 'refresh_token_not_found':return 'Sesiunea a expirat. Autentifică-te din nou.';
  case 'otp_expired':return 'Linkul a expirat sau a fost deja folosit. Cere un link nou.';
 }
 if(status===429)return 'Prea multe încercări într-un timp scurt. Încearcă din nou mai târziu.';
 if(status===0||status===undefined)return 'Nu ne-am putut conecta. Verifică internetul și încearcă din nou.';
 return 'Operațiunea nu a reușit. Încearcă din nou.';
}

/** Cauza unei erori la încărcarea profilului: un cod scurt (fără date personale) și o explicație. */
export function loadErrorInfo(e:unknown):{code:string;hint:string}{
 const err=(e??{}) as {code?:unknown;status?:unknown;message?:unknown;name?:unknown};
 const message=typeof err.message==='string'?err.message:'';
 const raw=String(err.code||err.status||'');
 if(!raw&&(err.name==='TypeError'||/fetch|network|load failed/i.test(message)))return {code:'rețea',hint:'Serverul nu răspunde. Proiectul Supabase poate fi pus pe pauză sau conexiunea la internet este întreruptă.'};
 if(raw==='PGRST301'||raw==='PGRST303'||raw==='401'||/jwt/i.test(message))return {code:raw||'401',hint:'Sesiunea nu mai este valabilă. Ieși din cont și autentifică-te din nou.'};
 if(raw==='42501'||raw==='403')return {code:raw,hint:'Accesul a fost refuzat de regulile bazei de date.'};
 if(raw==='PGRST002'||raw==='PGRST000'||/^5\d\d$/.test(raw))return {code:raw,hint:'Serviciul Supabase este indisponibil momentan (de exemplu, proiectul este pus pe pauză sau pornește). Încearcă din nou peste un minut.'};
 if(raw==='42703'||raw==='PGRST204')return {code:raw,hint:'Baza de date nu are încă ultimele modificări ale profilului. Aplică în Supabase migrările noi din supabase/migrations, în ordine.'};
 if(raw==='PGRST205'||raw==='42P01')return {code:raw,hint:'Tabelele profilului nu sunt disponibile prin API. Verifică migrarea și setările Data API.'};
 return {code:raw||'necunoscut',hint:'Încearcă din nou. Dacă problema continuă, trimite codul de mai sus.'};
}

/** Mesaje pentru erorile bazei de date (coduri Postgres/PostgREST). */
export function dataErrorMessage(code?:string|null){
 if(code==='42501'||code==='PGRST301')return 'Nu ai permisiunea pentru această operațiune.';
 if(code==='23514'||code==='22023')return 'Unele valori nu sunt acceptate. Verifică datele și încearcă din nou.';
 if(code==='23505')return 'Această opțiune este deja activă.';
 return 'Salvarea nu a reușit. Încearcă din nou.';
}
