// Acces la datele contului real. Fiecare operațiune este limitată suplimentar de RLS în baza
// de date; aici trimitem doar cereri pentru contul autentificat.
import {emptyParticipation,participationFromStored,participationToStored} from '../participation.ts';
import type {SupabaseClient} from '@supabase/supabase-js';
import {isRealRole,type RealRole} from './roles.ts';
import {parseBudget,type ProfileForm} from './validation.ts';

export type PublicProfile={id:string;display_name:string;avatar_path:string|null;bio:string;city:string;company:string;industries:string;objectives:string;updated_at:string;wants_to_develop?:boolean;wants_to_join?:boolean;skills?:string[];desired_roles?:string[];weekly_hours?:number|null};
export type PrivateProfile={link:string;show_email_after_match:boolean;show_link_after_match:boolean;investor_min_budget:number|null;investor_max_budget:number|null;investor_stage:string};
export type Account={profile:PublicProfile|null;priv:PrivateProfile|null;roles:RealRole[];avatarUrl?:string};
export type PhotoChange={kind:'keep'}|{kind:'set';dataUrl:string}|{kind:'remove'};
export type DataError={code?:string;message?:string};

export const AVATAR_BUCKET='avatars';
export const avatarPath=(userId:string)=>`${userId}/avatar.jpg`;
const PUBLIC_COLUMNS='id,display_name,avatar_path,bio,city,company,industries,objectives,updated_at,wants_to_develop,wants_to_join,skills,desired_roles,weekly_hours';
const PRIVATE_COLUMNS='link,show_email_after_match,show_link_after_match,investor_min_budget,investor_max_budget,investor_stage';

export function emptyForm():ProfileForm{return {display_name:'',bio:'',city:'',company:'',industries:'',objectives:'',link:'',show_email_after_match:false,show_link_after_match:false,investor_min_budget:'',investor_max_budget:'',investor_stage:'',participation:emptyParticipation()}}

export function formFromAccount(a:Account):ProfileForm{
 const p=a.profile,v=a.priv;
 return {...emptyForm(),display_name:p?.display_name??'',bio:p?.bio??'',city:p?.city??'',company:p?.company??'',industries:p?.industries??'',objectives:p?.objectives??'',participation:participationFromStored(p&&{develop:p.wants_to_develop,join:p.wants_to_join,skills:p.skills,roles:p.desired_roles,hours:p.weekly_hours}),link:v?.link??'',show_email_after_match:!!v?.show_email_after_match,show_link_after_match:!!v?.show_link_after_match,investor_min_budget:v?.investor_min_budget==null?'':String(v.investor_min_budget),investor_max_budget:v?.investor_max_budget==null?'':String(v.investor_max_budget),investor_stage:v?.investor_stage??''};
}

/** Doar coloanele pe care utilizatorul le poate modifica (aceleași ca în GRANT UPDATE). */
export function profileUpdate(f:ProfileForm){
 const part=participationToStored(f.participation);
 return {display_name:f.display_name.trim(),bio:f.bio.trim(),city:f.city.trim(),company:f.company.trim(),industries:f.industries,objectives:f.objectives.trim(),
  wants_to_develop:part.develop,wants_to_join:part.join,skills:part.skills,desired_roles:part.roles,weekly_hours:part.hours};
}
/** Participarea publică a unui profil, în forma folosită de rezumat. */
export const storedParticipation=(p:PublicProfile)=>participationToStored(participationFromStored({develop:p.wants_to_develop,join:p.wants_to_join,skills:p.skills,roles:p.desired_roles,hours:p.weekly_hours}));
export function privateUpdate(f:ProfileForm,investor:boolean){
 const base={link:f.link.trim(),show_email_after_match:f.show_email_after_match,show_link_after_match:f.show_link_after_match};
 if(!investor)return base;
 return {...base,investor_min_budget:parseBudget(f.investor_min_budget).value,investor_max_budget:parseBudget(f.investor_max_budget).value,investor_stage:f.investor_stage};
}

const SIGN_SECONDS=3600,CACHE_SECONDS='3600',URL_KEY='buildit-avatar-url:';
type CachedUrl={path:string;stamp:string;url:string;exp:number};
const urlStore=()=>{try{return globalThis.localStorage}catch{return undefined}};
/** Adresa semnată anterior, dacă mai e valabilă cel puțin 10 minute. Orice salvare a profilului schimbă updated_at și o invalidează. */
export function readCachedUrl(userId:string):CachedUrl|undefined{try{const v=JSON.parse(urlStore()?.getItem(URL_KEY+userId)??'null') as CachedUrl|null;return v&&typeof v.url==='string'&&v.exp-Date.now()>10*60*1000?v:undefined}catch{return undefined}}
function writeCachedUrl(userId:string,v:CachedUrl){try{urlStore()?.setItem(URL_KEY+userId,JSON.stringify(v))}catch{/* fără cache */}}
export function clearCachedUrl(userId:string){try{urlStore()?.removeItem(URL_KEY+userId)}catch{/* fără cache */}}

export async function dataUrlToBlob(dataUrl:string){const res=await fetch(dataUrl);return res.blob()}

export type AccountApi={
 load(userId:string):Promise<Account>;
 completeProfile(name:string,role:RealRole):Promise<void>;
 save(userId:string,form:ProfileForm,investor:boolean,photo:PhotoChange):Promise<void>;
 /** Încarcă fotografia deja încadrată (JPEG) și o setează pe profil, fără alte câmpuri. */
 savePhoto(userId:string,dataUrl:string):Promise<void>;
 activateRole(userId:string,role:RealRole):Promise<void>;
};

export function createAccountApi(client:SupabaseClient):AccountApi{
 const fail=(error:DataError|null)=>{if(error)throw error};
 const signed=async(path:string|null)=>{
  if(!path)return undefined;
  const {data,error}=await client.storage.from(AVATAR_BUCKET).createSignedUrl(path,SIGN_SECONDS);
  return error?undefined:data?.signedUrl;
 };
 return {
  async load(userId){
   // Adresa semnată se cere în paralel cu profilul (calea este fixă) și se refolosește cât timp e validă,
   // ca browserul să poată afișa poza din cache în loc să o descarce din nou la fiecare deschidere.
   const cached=readCachedUrl(userId);
   const early=cached?null:signed(avatarPath(userId));
   const [profile,priv,roles]=await Promise.all([
    client.from('profiles').select(PUBLIC_COLUMNS).eq('id',userId).maybeSingle(),
    client.from('profiles_private').select(PRIVATE_COLUMNS).eq('id',userId).maybeSingle(),
    client.from('profile_roles').select('role,activated_at').eq('user_id',userId).order('activated_at')
   ]);
   fail(profile.error);fail(priv.error);fail(roles.error);
   const p=profile.data as PublicProfile|null;
   let avatarUrl:string|undefined;
   if(p?.avatar_path){
    if(cached&&cached.path===p.avatar_path&&cached.stamp===p.updated_at)avatarUrl=cached.url;
    else{avatarUrl=p.avatar_path===avatarPath(userId)&&early?await early:await signed(p.avatar_path);if(avatarUrl)writeCachedUrl(userId,{path:p.avatar_path,stamp:p.updated_at,url:avatarUrl,exp:Date.now()+SIGN_SECONDS*1000})}
   }else clearCachedUrl(userId);
   return {profile:p,priv:priv.data as PrivateProfile|null,roles:(roles.data??[]).map(r=>r.role).filter(isRealRole),avatarUrl};
  },
  async completeProfile(name,role){const {error}=await client.rpc('complete_profile',{p_display_name:name.trim(),p_role:role});fail(error)},
  async save(userId,form,investor,photo){
   let avatar:{avatar_path:string|null}|object={};
   if(photo.kind==='set'){
    const blob=await dataUrlToBlob(photo.dataUrl);
    const {error}=await client.storage.from(AVATAR_BUCKET).upload(avatarPath(userId),blob,{upsert:true,contentType:'image/jpeg',cacheControl:CACHE_SECONDS});
    fail(error);avatar={avatar_path:avatarPath(userId)};
   }else if(photo.kind==='remove'){
    const {error}=await client.storage.from(AVATAR_BUCKET).remove([avatarPath(userId)]);
    fail(error);avatar={avatar_path:null};
   }
   const a=await client.from('profiles').update({...profileUpdate(form),...avatar}).eq('id',userId).select('id');
   fail(a.error);if(!a.data?.length)throw {code:'42501'};
   const b=await client.from('profiles_private').update(privateUpdate(form,investor)).eq('id',userId).select('id');
   fail(b.error);if(!b.data?.length)throw {code:'42501'};
  },
  async savePhoto(userId,dataUrl){
   const blob=await dataUrlToBlob(dataUrl);
   const {error}=await client.storage.from(AVATAR_BUCKET).upload(avatarPath(userId),blob,{upsert:true,contentType:'image/jpeg',cacheControl:CACHE_SECONDS});
   fail(error);
   const a=await client.from('profiles').update({avatar_path:avatarPath(userId)}).eq('id',userId).select('id');
   fail(a.error);if(!a.data?.length)throw {code:'42501'};
  },
  async activateRole(userId,role){const {error}=await client.from('profile_roles').insert({user_id:userId,role});fail(error)}
 };
}
