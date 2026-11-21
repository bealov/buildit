// Match · „Descoperă oameni” pentru conturile reale.
// Citește doar câmpuri publice (aceleași pe care orice utilizator autentificat le poate vedea) prin
// funcția discover_people din baza de date, care aplică RLS cu drepturile utilizatorului curent.
import type {SupabaseClient} from '@supabase/supabase-js';
import {parseHours,isDesiredRole} from '../participation.ts';
import {isRealRole,type RealRole} from './roles.ts';

export const PAGE_SIZE=12;
const SIGN_SECONDS=3600;
const BUCKET='avatars';

export type PersonCard={id:string;display_name:string;avatar_path:string|null;bio:string;city:string;skills:string[];desired_roles:string[];weekly_hours:number|null;wants_to_develop:boolean;created_at:string;avatarUrl?:string};
export type PublicPerson={id:string;display_name:string;avatar_path:string|null;bio:string;city:string;company:string;industries:string;objectives:string;wants_to_develop:boolean;wants_to_join:boolean;skills:string[];desired_roles:string[];weekly_hours:number|null;roles:RealRole[];avatarUrl?:string};
export type Cursor={createdAt:string;id:string};
export type PeopleFilters={skill:string;role:string;minHours:string;includeUnknown:boolean};
export type PeoplePage={people:PersonCard[];next:Cursor|null};
export type PeopleApi={
 discover(selfId:string,filters:PeopleFilters,cursor?:Cursor|null):Promise<PeoplePage>;
 person(id:string):Promise<PublicPerson|null>;
};

export const emptyFilters=():PeopleFilters=>({skill:'',role:'',minHours:'',includeUnknown:false});
export const filtersActive=(f:PeopleFilters)=>!!(f.skill.trim()||f.role||f.minHours.trim());

/** Mesaj pentru un filtru de ore invalid; textul gol înseamnă „fără filtru”, nu 0. */
export function filtersProblem(f:PeopleFilters){
 if(!f.minHours.trim())return null;
 return parseHours(f.minHours).problem?'Minimum ore/săptămână: scrie un număr întreg între 1 și 168 sau lasă câmpul gol.':null;
}

/** Parametrii trimiși funcției discover_people. Orele necompletate nu sunt transformate în 0. */
export function rpcArgs(f:PeopleFilters,cursor:Cursor|null|undefined,limit:number){
 const hours=parseHours(f.minHours).value;
 const skill=f.skill.replace(/\s+/g,' ').trim();
 return {
  p_skill:skill?skill.slice(0,40):null,
  p_role:isDesiredRole(f.role)?f.role:null,
  p_min_hours:hours,
  p_include_unknown_hours:hours!=null&&f.includeUnknown,
  p_after_created_at:cursor?.createdAt??null,
  p_after_id:cursor?.id??null,
  p_limit:limit
 };
}

const PUBLIC_DETAIL='id,display_name,avatar_path,bio,city,company,industries,objectives,wants_to_develop,wants_to_join,skills,desired_roles,weekly_hours';
const ownPhoto=(id:string,path:string|null)=>path===`${id}/avatar.jpg`?path:null;
const strings=(v:unknown)=>Array.isArray(v)?v.filter((x):x is string=>typeof x==='string'):[];

export function createPeopleApi(client:SupabaseClient):PeopleApi{
 const fail=(error:unknown)=>{if(error)throw error};
 return {
  async discover(selfId,filters,cursor){
   // Cerem un rezultat în plus ca să știm dacă există o pagină următoare.
   const {data,error}=await client.rpc('discover_people',rpcArgs(filters,cursor,PAGE_SIZE+1));
   fail(error);
   const rows=((data??[]) as PersonCard[]).filter(r=>r&&r.id!==selfId); // propriul profil: exclus și în baza de date
   // Doar câmpurile publice cunoscute ajung în card, chiar dacă răspunsul ar conține altceva.
   const page:PersonCard[]=rows.slice(0,PAGE_SIZE).map(r=>({id:r.id,display_name:String(r.display_name??''),avatar_path:ownPhoto(r.id,r.avatar_path),bio:String(r.bio??''),city:String(r.city??''),
    skills:strings(r.skills),desired_roles:strings(r.desired_roles),weekly_hours:typeof r.weekly_hours==='number'?r.weekly_hours:null,wants_to_develop:!!r.wants_to_develop,created_at:String(r.created_at)}));
   const paths=page.map(r=>r.avatar_path).filter((p):p is string=>!!p);
   if(paths.length){
    // Un singur apel pentru toate fotografiile paginii; bucket-ul rămâne privat.
    const signed=await client.storage.from(BUCKET).createSignedUrls(paths,SIGN_SECONDS);
    const urls=new Map((signed.data??[]).filter(s=>s.signedUrl&&!s.error).map(s=>[s.path,s.signedUrl]));
    for(const r of page)if(r.avatar_path)r.avatarUrl=urls.get(r.avatar_path)??undefined;
   }
   const last=page.at(-1);
   return {people:page,next:rows.length>PAGE_SIZE&&last?{createdAt:last.created_at,id:last.id}:null};
  },
  async person(id){
   const [profile,roles]=await Promise.all([
    client.from('profiles').select(PUBLIC_DETAIL).eq('id',id).maybeSingle(),
    client.from('profile_roles').select('role').eq('user_id',id)
   ]);
   fail(profile.error);fail(roles.error);
   const p=profile.data as Omit<PublicPerson,'roles'|'avatarUrl'>|null;
   if(!p)return null;
   const path=ownPhoto(p.id,p.avatar_path);
   let avatarUrl:string|undefined;
   if(path){const {data}=await client.storage.from(BUCKET).createSignedUrl(path,SIGN_SECONDS);avatarUrl=data?.signedUrl}
   return {id:p.id,display_name:String(p.display_name??''),avatar_path:path,bio:String(p.bio??''),city:String(p.city??''),company:String(p.company??''),industries:String(p.industries??''),objectives:String(p.objectives??''),
    wants_to_develop:!!p.wants_to_develop,wants_to_join:!!p.wants_to_join,skills:strings(p.skills),desired_roles:strings(p.desired_roles),weekly_hours:typeof p.weekly_hours==='number'?p.weekly_hours:null,
    roles:(roles.data??[]).map(r=>r.role).filter(isRealRole),avatarUrl};
  }
 };
}
