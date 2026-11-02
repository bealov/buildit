// Linkurile din emailuri (confirmare, resetare parolă) se întorc în aplicație cu parametri în
// query string: /?code=… sau /?token_hash=…&type=…  Navigarea aplicației folosește hash-ul (#home),
// deci parametrii de autentificare nu trebuie să ajungă în hash. Modul pur, testat separat.

export type AuthIntent='confirm'|'recovery'|'unknown';
export type OtpType='email'|'signup'|'recovery'|'email_change';
export type AuthCallback=
 |{kind:'code';code:string;intent:AuthIntent}
 |{kind:'otp';tokenHash:string;type:OtpType;intent:AuthIntent}
 |{kind:'error';message:string;intent:AuthIntent}
 |{kind:'implicit';intent:AuthIntent}
 |null;

const OTP_TYPES:OtpType[]=['email','signup','recovery','email_change'];
const AUTH_PARAMS=['code','token_hash','type','auth','error','error_code','error_description','sb'];

/** Parametrul `auth` este adăugat de aplicație în redirectTo, ca să știm ce flux s-a încheiat. */
function intentOf(params:URLSearchParams):AuthIntent{
 const auth=params.get('auth'),type=params.get('type');
 if(auth==='recovery'||type==='recovery')return 'recovery';
 if(auth==='confirm'||type==='email'||type==='signup'||type==='email_change')return 'confirm';
 return 'unknown';
}

function errorMessage(code:string|null){
 if(code==='otp_expired')return 'Linkul a expirat sau a fost deja folosit. Cere un link nou.';
 if(code==='access_denied')return 'Linkul nu mai este valid. Cere un link nou.';
 return 'Linkul nu a putut fi verificat. Încearcă din nou sau cere un link nou.';
}

/** Hash-ul de autentificare (flux implicit vechi sau erori) nu este o rută a aplicației. */
export function isAuthHash(hash:string){
 const h=hash.replace(/^#/,'');
 return /(^|&)(access_token|refresh_token|error|error_code|error_description)=/.test(h);
}

export function parseAuthCallback(search:string,hash:string):AuthCallback{
 const params=new URLSearchParams(search.replace(/^\?/,''));
 const hashParams=isAuthHash(hash)?new URLSearchParams(hash.replace(/^#/,'')):null;
 const intent=intentOf(params);
 const error=params.get('error')||params.get('error_code')||hashParams?.get('error')||hashParams?.get('error_code');
 if(error)return {kind:'error',message:errorMessage(params.get('error_code')||hashParams?.get('error_code')||null),intent};
 const tokenHash=params.get('token_hash'),type=params.get('type');
 if(tokenHash){
  if(!type||!OTP_TYPES.includes(type as OtpType))return {kind:'error',message:errorMessage(null),intent};
  return {kind:'otp',tokenHash,type:type as OtpType,intent};
 }
 const code=params.get('code');
 if(code)return {kind:'code',code,intent};
 if(hashParams)return {kind:'implicit',intent};
 return null;
}

/** Adresa curată după procesare: fără parametrii de autentificare, cu ruta hash păstrată. */
export function cleanedUrl(pathname:string,search:string,hash:string,route='home'){
 const params=new URLSearchParams(search.replace(/^\?/,''));
 for(const key of AUTH_PARAMS)params.delete(key);
 const rest=params.toString();
 const nextHash=isAuthHash(hash)||!hash||hash==='#'?'#'+route:hash;
 return pathname+(rest?'?'+rest:'')+nextHash;
}

/** Adresa la care se întoarce utilizatorul din email: adresa curentă a aplicației, fără parametri.
 *  Șabloanele de email adaugă ?token_hash=…&type=…; fluxul implicit adaugă ?code=…. */
export function redirectUrl(origin:string,pathname:string){
 return `${origin}${pathname}`;
}
