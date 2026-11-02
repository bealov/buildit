-- BuildIT · Etapa 1: conturi reale, profiluri, roluri și fotografii de profil.
--
-- Se aplică pe proiectul de dezvoltare (buildit-dev), din SQL Editor sau cu Supabase CLI.
-- Migrarea este scrisă pentru un proiect în care:
--   * expunerea automată a tabelelor noi este DEZACTIVATĂ, deci acordăm explicit permisiunile;
--   * RLS automat este activ; îl activăm oricum explicit, ca migrarea să nu depindă de setare.
--
-- Principii:
--   * Emailul rămâne doar în auth.users; nu este copiat în tabelele publice.
--   * Vizitatorii neautentificați (anon) nu au acces la profiluri, roluri sau fotografii.
--   * Fiecare utilizator își modifică doar propriile rânduri; RLS impune regula în baza de date.
--   * Rolurile posibile sunt doar 'creator' și 'investor'. Nu există roluri administrative
--     sau statut de „investitor verificat” în aceste tabele.

begin;

-- ---------------------------------------------------------------------------
-- 0. Schemă privată pentru funcții interne (nu este expusă prin Data API)
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Profiluri publice (vizibile utilizatorilor autentificați)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null
    constraint profiles_display_name_length check (char_length(btrim(display_name)) between 2 and 80),
  avatar_path text
    constraint profiles_avatar_path_own check (avatar_path is null or avatar_path = id::text || '/avatar.jpg'),
  bio text not null default ''
    constraint profiles_bio_length check (char_length(bio) <= 600),
  city text not null default ''
    constraint profiles_city_length check (char_length(city) <= 80),
  company text not null default ''
    constraint profiles_company_length check (char_length(company) <= 120),
  industries text not null default ''
    constraint profiles_industries_length check (char_length(industries) <= 80),
  objectives text not null default ''
    constraint profiles_objectives_length check (char_length(objectives) <= 600),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Profil public BuildIT. Vizibil doar utilizatorilor autentificați. Nu conține email.';

-- ---------------------------------------------------------------------------
-- 2. Date private (vizibile doar proprietarului)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles_private (
  id uuid primary key references public.profiles (id) on delete cascade,
  link text not null default ''
    constraint profiles_private_link_format check (
      link = '' or (char_length(link) <= 300 and link ~* '^https?://[^[:space:]]+$')
    ),
  show_email_after_match boolean not null default false,
  show_link_after_match boolean not null default false,
  investor_min_budget integer
    constraint profiles_private_min_budget check (investor_min_budget is null or investor_min_budget >= 0),
  investor_max_budget integer
    constraint profiles_private_max_budget check (investor_max_budget is null or investor_max_budget >= 0),
  investor_stage text not null default ''
    constraint profiles_private_stage_length check (char_length(investor_stage) <= 40),
  updated_at timestamptz not null default now(),
  constraint profiles_private_budget_order check (
    investor_min_budget is null or investor_max_budget is null or investor_min_budget <= investor_max_budget
  )
);

comment on table public.profiles_private is
  'Date private ale profilului: link de contact, preferințe de afișare după Match, preferințe de investitor. Doar proprietarul le poate citi.';

-- ---------------------------------------------------------------------------
-- 3. Roluri active ale contului (Creator / Investitor)
-- ---------------------------------------------------------------------------
create table if not exists public.profile_roles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null
    constraint profile_roles_allowed check (role in ('creator', 'investor')),
  activated_at timestamptz not null default now(),
  primary key (user_id, role)
);

comment on table public.profile_roles is
  'Rolurile activate de utilizator. Activarea rolului Investitor nu înseamnă investitor verificat.';

-- ---------------------------------------------------------------------------
-- 4. Funcții interne
-- ---------------------------------------------------------------------------

-- Actualizează updated_at și blochează schimbarea identificatorului.
create or replace function private.touch_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'Identificatorul profilului nu poate fi modificat.' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- Creează profilul, datele private și rolul inițial, doar cu valori valide.
-- Întoarce false (fără să creeze nimic) dacă numele sau rolul lipsesc ori sunt invalide.
create or replace function private.create_profile(p_user_id uuid, p_display_name text, p_role text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_display_name, ''));
begin
  if p_user_id is null
     or char_length(v_name) not between 2 and 80
     or coalesce(p_role, '') not in ('creator', 'investor') then
    return false;
  end if;

  insert into public.profiles (id, display_name) values (p_user_id, v_name)
  on conflict (id) do nothing;
  if not found then
    return false; -- profilul există deja; nu îl suprascriem
  end if;

  insert into public.profiles_private (id) values (p_user_id) on conflict (id) do nothing;
  insert into public.profile_roles (user_id, role) values (p_user_id, p_role) on conflict do nothing;
  return true;
end;
$$;

-- Trigger pe auth.users: creează profilul din datele trimise la înregistrare.
-- Dacă lipsesc numele sau rolul (ex. cont creat din Dashboard), nu inventează nimic:
-- utilizatorul va completa profilul în aplicație.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.create_profile(
    new.id,
    new.raw_user_meta_data ->> 'display_name',
    new.raw_user_meta_data ->> 'initial_role'
  );
  return new;
end;
$$;

revoke all on function private.touch_row() from public, anon, authenticated;
revoke all on function private.create_profile(uuid, text, text) from public, anon, authenticated;
revoke all on function private.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch
  before update on public.profiles
  for each row execute function private.touch_row();

drop trigger if exists profiles_private_touch on public.profiles_private;
create trigger profiles_private_touch
  before update on public.profiles_private
  for each row execute function private.touch_row();

-- Flux de completare pentru conturile fără profil (ex. create din Dashboard).
-- Numele și rolul inițial sunt furnizate de utilizator; funcția acționează doar asupra
-- contului autentificat și nu suprascrie un profil existent.
create or replace function public.complete_profile(p_display_name text, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Autentificare necesară.' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'Profilul există deja.' using errcode = '23505';
  end if;
  if not private.create_profile(v_uid, p_display_name, p_role) then
    raise exception 'Nume sau rol invalid.' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.complete_profile(text, text) from public, anon;
grant execute on function public.complete_profile(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Permisiuni explicite (expunerea automată este dezactivată)
-- ---------------------------------------------------------------------------
revoke all on table public.profiles, public.profiles_private, public.profile_roles from public, anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (display_name, avatar_path, bio, city, company, industries, objectives)
  on table public.profiles to authenticated;

grant select on table public.profiles_private to authenticated;
grant update (link, show_email_after_match, show_link_after_match,
              investor_min_budget, investor_max_budget, investor_stage)
  on table public.profiles_private to authenticated;

grant select on table public.profile_roles to authenticated;
grant insert (user_id, role) on table public.profile_roles to authenticated;
-- Fără update/delete pe roluri și fără insert/delete pe profiluri pentru utilizatori.

-- ---------------------------------------------------------------------------
-- 6. Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.profiles_private enable row level security;
alter table public.profile_roles enable row level security;

drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated on public.profiles
  for select to authenticated
  using (true);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists profiles_private_select_own on public.profiles_private;
create policy profiles_private_select_own on public.profiles_private
  for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists profiles_private_update_own on public.profiles_private;
create policy profiles_private_update_own on public.profiles_private
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists profile_roles_select_authenticated on public.profile_roles;
create policy profile_roles_select_authenticated on public.profile_roles
  for select to authenticated
  using (true);

drop policy if exists profile_roles_insert_own on public.profile_roles;
create policy profile_roles_insert_own on public.profile_roles
  for insert to authenticated
  with check (user_id = (select auth.uid()) and role in ('creator', 'investor'));

-- ---------------------------------------------------------------------------
-- 7. Fotografii de profil: bucket privat, citire doar pentru autentificați
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 1048576, array['image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists avatars_select_authenticated on storage.objects;
create policy avatars_select_authenticated on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars');

drop policy if exists avatars_insert_own on storage.objects;
create policy avatars_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar.jpg');

drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar.jpg')
  with check (bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar.jpg');

drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar.jpg');

-- ---------------------------------------------------------------------------
-- 8. Conturi existente: profil creat doar dacă la înregistrare au fost trimise
--    un nume și un rol valide. Celelalte conturi completează profilul în aplicație.
-- ---------------------------------------------------------------------------
select private.create_profile(u.id, u.raw_user_meta_data ->> 'display_name', u.raw_user_meta_data ->> 'initial_role')
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

commit;
