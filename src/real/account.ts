// Acces la datele contului real. Fiecare operațiune este limitată suplimentar de RLS în baza
// de date; aici trimitem doar cereri pentru contul autentificat.
import type {SupabaseClient} from '@supabase/supabase-js';
import {isRealRole,type RealRole} from './roles.ts';
import {parseBudget,type ProfileForm} from './validation.ts';

export type PublicProfile={id:string;display_name:string;avatar_path:string|null;bio:string;city:string;company:string;industries:string;objectives:string;updated_at:string};
export type PrivateProfile={link:string;show_email_after_match:boolean;show_link_after_match:boolean;investor_min_budget:number|null;investor_max_budget:number|null;investor_stage:string};
export type Account={profile:PublicProfile|null;priv:PrivateProfile|null;roles:RealRole[];avatarUrl?:string};
export type PhotoChange={kind:'keep'}|{kind:'set';dataUrl:string}|{kind:'remove'};
export type DataError={code?:string;message?:string};

export const AVATAR_BUCKET='avatars';
export const avatarPath=(userId:string)=>`${userId}/avatar.jpg`;
const PUBLIC_COLUMNS='id,display_name,avatar_path,bio,city,company,industries,objectives,updated_at';
const PRIVATE_COLUMNS='link,show_email_after_match,show_link_after_match,investor_min_budget,investor_max_budget,investor_stage';

export function emptyForm():ProfileForm{return {display_name:'',bio:'',city:'',company:'',industries:'',objectives:'',link:'',show_email_after_match:false,show_link_after_match:false,investor_min_budget:'',investor_max_budget:'',investor_stage:''}}

export function formFromAccount(a:Account):ProfileForm{
 const p=a.profile,v=a.priv;
 return {...emptyForm(),display_name:p?.display_name??'',bio:p?.bio??'',city:p?.city??'',company:p?.company??'',industries:p?.industries??'',objectives:p?.objectives??'',link:v?.link??'',show_email_after_match:!!v?.show_email_after_match,show_link_after_match:!!v?.show_link_after_match,investor_min_budget:v?.investor_min_budget==null?'':String(v.investor_min_budget),investor_max_budget:v?.investor_max_budget==null?'':String(v.investor_max_budget),investor_stage:v?.investor_stage??''};
}

/** Doar coloanele pe care utilizatorul le poate modifica (aceleași ca în GRANT UPDATE). */
export function profileUpdate(f:ProfileForm){return {display_name:f.display_name.trim(),bio:f.bio.trim(),city:f.city.trim(),company:f.company.trim(),industries:f.industries,objectives:f.objectives.trim()}}
export function privateUpdate(f:ProfileForm,investor:boolean){
 const base={link:f.link.trim(),show_email_after_match:f.show_email_after_match,show_link_after_match:f.show_link_after_match};
 if(!investor)return base;
 return {...base,investor_min_budget:parseBudget(f.investor_min_budget).value,investor_max_budget:parseBudget(f.investor_max_budget).value,investor_stage:f.investor_stage};
}

export async function dataUrlToBlob(dataUrl:string){const res=await fetch(dataUrl);return res.blob()}

export type AccountApi={
 load(userId:string):Promise<Account>;
 completeProfile(name:string,role:RealRole):Promise<void>;
 save(userId:string,form:ProfileForm,investor:boolean,photo:PhotoChange):Promise<void>;
 activateRole(userId:string,role:RealRole):Promise<void>;
};

export function createAccountApi(client:SupabaseClient):AccountApi{
 const fail=(error:DataError|null)=>{if(error)throw error};
 const signed=async(path:string|null)=>{
  if(!path)return undefined;
  const {data,error}=await client.storage.from(AVATAR_BUCKET).createSignedUrl(path,3600);
  return error?undefined:data?.signedUrl;
 };
 return {
  async load(userId){
   const [profile,priv,roles]=await Promise.all([
    client.from('profiles').select(PUBLIC_COLUMNS).eq('id',userId).maybeSingle(),
    client.from('profiles_private').select(PRIVATE_COLUMNS).eq('id',userId).maybeSingle(),
    client.from('profile_roles').select('role,activated_at').eq('user_id',userId).order('activated_at')
   ]);
   fail(profile.error);fail(priv.error);fail(roles.error);
   const p=profile.data as PublicProfile|null;
   return {profile:p,priv:priv.data as PrivateProfile|null,roles:(roles.data??[]).map(r=>r.role).filter(isRealRole),avatarUrl:await signed(p?.avatar_path??null)};
  },
  async completeProfile(name,role){const {error}=await client.rpc('complete_profile',{p_display_name:name.trim(),p_role:role});fail(error)},
  async save(userId,form,investor,photo){
   let avatar:{avatar_path:string|null}|object={};
   if(photo.kind==='set'){
    const blob=await dataUrlToBlob(photo.dataUrl);
    const {error}=await client.storage.from(AVATAR_BUCKET).upload(avatarPath(userId),blob,{upsert:true,contentType:'image/jpeg',cacheControl:'60'});
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
  async activateRole(userId,role){const {error}=await client.from('profile_roles').insert({user_id:userId,role});fail(error)}
 };
}
