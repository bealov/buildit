// Configurarea conturilor reale (Supabase). Modul pur: nu citește singur variabilele de mediu,
// ca să poată fi testat. Valorile vin din import.meta.env în src/real/env.ts.
//
// VITE_ENABLE_REAL_ACCOUNTS controlează doar interfața. Protecția datelor este asigurată de
// permisiunile și regulile RLS din baza de date, nu de această variabilă.

export type RealConfig={url:string;publishableKey:string};
export type ConfigProblem='disabled'|'missing-url'|'invalid-url'|'missing-key'|'secret-key';
export type ConfigResult={config:RealConfig;problem?:undefined}|{config:null;problem:ConfigProblem};
export type EnvLike={[key:string]:string|boolean|undefined};

const text=(v:string|boolean|undefined)=>typeof v==='string'?v.trim():'';

/** Cheile care ocolesc RLS nu au voie să ajungă în browser. Nu afișăm niciodată valoarea cheii. */
export function isSecretKey(key:string){
 if(key.startsWith('sb_secret_'))return true;
 const parts=key.split('.');
 if(parts.length===3&&key.startsWith('eyJ')){
  try{const json=JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));return json?.role==='service_role'}catch{return false}
 }
 return false;
}

function validUrl(url:string){
 try{const u=new URL(url);if(u.protocol==='https:')return true;return u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)}catch{return false}
}

export function readRealConfig(env:EnvLike):ConfigResult{
 if(text(env.VITE_ENABLE_REAL_ACCOUNTS)!=='true')return {config:null,problem:'disabled'};
 const url=text(env.VITE_SUPABASE_URL),publishableKey=text(env.VITE_SUPABASE_PUBLISHABLE_KEY);
 if(!url)return {config:null,problem:'missing-url'};
 if(!validUrl(url))return {config:null,problem:'invalid-url'};
 if(!publishableKey)return {config:null,problem:'missing-key'};
 if(isSecretKey(publishableKey))return {config:null,problem:'secret-key'};
 return {config:{url:url.replace(/\/+$/,''),publishableKey}};
}

export const configProblemMessage:Record<ConfigProblem,string>={
 disabled:'Conturile reale nu sunt activate în acest mediu.',
 'missing-url':'Lipsește VITE_SUPABASE_URL.',
 'invalid-url':'VITE_SUPABASE_URL trebuie să fie o adresă https.',
 'missing-key':'Lipsește VITE_SUPABASE_PUBLISHABLE_KEY.',
 'secret-key':'Cheia configurată este o cheie secretă. În browser se folosește doar cheia publishable (sb_publishable_…). Conturile reale au fost dezactivate.'
};
