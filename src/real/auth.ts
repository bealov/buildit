// Autentificare cu email și parolă (Supabase Auth). Erorile sunt transformate în coduri,
// iar mesajele pentru utilizator sunt alese în validation.ts (fără a dezvălui dacă un email are cont).
import type {SupabaseClient,User} from '@supabase/supabase-js';
import {redirectUrl,type AuthCallback} from './authCallback.ts';
import type {RealRole} from './roles.ts';

export type SessionUser={id:string;email:string};
export type AuthError={code?:string;status?:number};
export type AuthEvent='SIGNED_IN'|'SIGNED_OUT'|'PASSWORD_RECOVERY'|'OTHER';

export type AuthApi={
 currentUser():Promise<SessionUser|null>;
 onChange(listener:(event:AuthEvent,user:SessionUser|null)=>void):()=>void;
 signUp(email:string,password:string,name:string,role:RealRole):Promise<{needsConfirmation:boolean}>;
 signIn(email:string,password:string):Promise<void>;
 signOut():Promise<void>;
 resendConfirmation(email:string):Promise<void>;
 requestPasswordReset(email:string):Promise<void>;
 updatePassword(password:string):Promise<void>;
 handleCallback(callback:Exclude<AuthCallback,null>):Promise<{recovery:boolean}>;
};

const toUser=(u:User|null|undefined):SessionUser|null=>u?{id:u.id,email:u.email??''}:null;
const fail=(error:{code?:string;status?:number}|null)=>{if(error)throw {code:error.code,status:error.status} satisfies AuthError};
const here=()=>({origin:window.location.origin,pathname:window.location.pathname});

export function createAuthApi(client:SupabaseClient):AuthApi{
 return {
  async currentUser(){const {data}=await client.auth.getSession();return toUser(data.session?.user)},
  onChange(listener){
   const {data}=client.auth.onAuthStateChange((event,session)=>{
    const kind:AuthEvent=event==='SIGNED_OUT'?'SIGNED_OUT':event==='PASSWORD_RECOVERY'?'PASSWORD_RECOVERY':event==='SIGNED_IN'?'SIGNED_IN':'OTHER';
    listener(kind,toUser(session?.user));
   });
   return ()=>data.subscription.unsubscribe();
  },
  async signUp(email,password,name,role){
   const {origin,pathname}=here();
   const {data,error}=await client.auth.signUp({email:email.trim(),password,options:{
    // Folosite o singură dată, de trigger-ul care creează profilul. Nu servesc la autorizare.
    data:{display_name:name.trim(),initial_role:role},
    emailRedirectTo:redirectUrl(origin,pathname)
   }});
   fail(error);
   return {needsConfirmation:!data.session};
  },
  async signIn(email,password){const {error}=await client.auth.signInWithPassword({email:email.trim(),password});fail(error)},
  async signOut(){const {error}=await client.auth.signOut({scope:'local'});fail(error)},
  async resendConfirmation(email){
   const {origin,pathname}=here();
   const {error}=await client.auth.resend({type:'signup',email:email.trim(),options:{emailRedirectTo:redirectUrl(origin,pathname)}});
   fail(error);
  },
  async requestPasswordReset(email){
   const {origin,pathname}=here();
   const {error}=await client.auth.resetPasswordForEmail(email.trim(),{redirectTo:redirectUrl(origin,pathname)});
   fail(error);
  },
  async updatePassword(password){const {error}=await client.auth.updateUser({password});fail(error)},
  async handleCallback(cb){
   // Biblioteca reține tipul fluxului (ex. resetare parolă) împreună cu codul PKCE din acest browser.
   if(cb.kind==='code'){const {data,error}=await client.auth.exchangeCodeForSession(cb.code);fail(error);const redirectType=(data as {redirectType?:string|null}|null)?.redirectType;return {recovery:redirectType==='recovery'||cb.intent==='recovery'}}
   if(cb.kind==='otp'){const {error}=await client.auth.verifyOtp({token_hash:cb.tokenHash,type:cb.type});fail(error);return {recovery:cb.type==='recovery'}}
   throw {code:'otp_expired'} satisfies AuthError;
  }
 };
}
