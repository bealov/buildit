// Clientul Supabase se încarcă doar când conturile reale sunt configurate (import dinamic),
// deci demo-ul fără configurare nu descarcă și nu inițializează biblioteca.
import type {SupabaseClient} from '@supabase/supabase-js';
import type {RealConfig} from './config.ts';

export const AUTH_STORAGE_KEY='buildit-auth';
let pending:Promise<SupabaseClient>|null=null;

export function getClient(config:RealConfig):Promise<SupabaseClient>{
 pending??=import('@supabase/supabase-js').then(({createClient})=>createClient(config.url,config.publishableKey,{
  auth:{
   flowType:'pkce',          // linkurile din email se întorc cu ?code=…, compatibil cu rutele #hash
   persistSession:true,      // sesiunea rămâne după reîncărcarea paginii
   autoRefreshToken:true,
   detectSessionInUrl:false, // procesăm explicit linkurile din email (src/real/authCallback.ts)
   storageKey:AUTH_STORAGE_KEY
  }
 }));
 return pending;
}
