// Rolurile contului real și modul de utilizare selectat în browser.
// Modul (Creator / Investitor) este doar o preferință de interfață. Nu acordă drepturi:
// permisiunile sunt verificate în baza de date pe baza rolurilor active din profile_roles.

export type RealRole='creator'|'investor';
export const REAL_ROLES:RealRole[]=['creator','investor'];
export const roleLabel:Record<RealRole,string>={creator:'Creator',investor:'Investitor'};
export const otherRole=(r:RealRole):RealRole=>r==='creator'?'investor':'creator';
export const isRealRole=(v:unknown):v is RealRole=>v==='creator'||v==='investor';

export const MODE_KEY='buildit-real-mode';
type StorageLike={getItem(k:string):string|null;setItem(k:string,v:string):void;removeItem(k:string):void};

/** Modul activ: cel salvat pentru același utilizator, dacă rolul este încă activ; altfel primul rol. */
export function resolveMode(roles:RealRole[],stored:{userId:string;role:string}|null,userId:string):RealRole|null{
 const active=REAL_ROLES.filter(r=>roles.includes(r));
 if(!active.length)return null;
 if(stored&&stored.userId===userId&&isRealRole(stored.role)&&active.includes(stored.role))return stored.role;
 return roles.find(isRealRole)??active[0];
}

export function readStoredMode(storage:StorageLike|undefined):{userId:string;role:string}|null{
 try{const v=JSON.parse(storage?.getItem(MODE_KEY)||'null');return v&&typeof v.userId==='string'&&typeof v.role==='string'?v:null}catch{return null}
}
export function writeStoredMode(storage:StorageLike|undefined,userId:string,role:RealRole){try{storage?.setItem(MODE_KEY,JSON.stringify({userId,role}))}catch{/* preferință opțională */}}
export function clearStoredMode(storage:StorageLike|undefined){try{storage?.removeItem(MODE_KEY)}catch{/* preferință opțională */}}

/** Modul aplicației (demo sau cont real), tot doar preferință de interfață. */
export const APP_MODE_KEY='buildit-app-mode';
export function readAppMode(storage:StorageLike|undefined):'demo'|'real'{try{return storage?.getItem(APP_MODE_KEY)==='real'?'real':'demo'}catch{return 'demo'}}
export function writeAppMode(storage:StorageLike|undefined,mode:'demo'|'real'){try{storage?.setItem(APP_MODE_KEY,mode)}catch{/* preferință opțională */}}
