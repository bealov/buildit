-- BuildIT · Profil Creator: cum vrea utilizatorul să participe.
--
-- Se aplică pe proiectul de dezvoltare (buildit-dev), DUPĂ 20261102000000_profiles_and_roles.sql.
-- Nu modifică migrarea anterioară și poate fi rulată de mai multe ori fără erori.
--
-- Ce adaugă în public.profiles (vizibile, ca restul profilului public, doar utilizatorilor autentificați):
--   * wants_to_develop  — intenția „Dezvolt un proiect”;
--   * wants_to_join     — intenția „Vreau să mă alătur unui proiect”;
--   * skills            — competențe (din sugestii sau proprii), maximum 15, fiecare 1–40 de caractere;
--   * desired_roles     — roluri căutate într-o echipă, doar din lista permisă;
--   * weekly_hours      — disponibilitate în ore pe săptămână (1–168) sau necompletat.
--
-- Principii:
--   * Intențiile NU sunt roluri de autentificare: rolurile rămân 'creator' și 'investor' în profile_roles.
--   * „cofondator” este doar un rol căutat; nu acordă statut sau drepturi.
--   * Profilurile existente primesc valorile implicite (nicio intenție, câmpuri goale); nu atribuim nimic automat.
--   * Debifarea unei intenții nu șterge competențele, rolurile sau orele deja completate.
--   * Doar proprietarul își modifică propriul profil: politica RLS existentă profiles_update_own rămâne
--     neschimbată, iar permisiunea de modificare este acordată explicit doar pentru coloanele noi.

begin;

-- ---------------------------------------------------------------------------
-- 1. Coloane noi (valori implicite neutre pentru profilurile existente)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists wants_to_develop boolean not null default false,
  add column if not exists wants_to_join boolean not null default false,
  add column if not exists skills text[] not null default '{}',
  add column if not exists desired_roles text[] not null default '{}',
  add column if not exists weekly_hours smallint;

alter table public.profiles drop constraint if exists profiles_skills_count;
alter table public.profiles add constraint profiles_skills_count
  check (cardinality(skills) <= 15);

alter table public.profiles drop constraint if exists profiles_desired_roles_allowed;
alter table public.profiles add constraint profiles_desired_roles_allowed
  check (desired_roles <@ array['cofondator', 'membru_echipa', 'manager_proiect', 'team_leader']::text[]);

alter table public.profiles drop constraint if exists profiles_weekly_hours_range;
alter table public.profiles add constraint profiles_weekly_hours_range
  check (weekly_hours is null or weekly_hours between 1 and 168);

comment on column public.profiles.wants_to_develop is 'Intenție: „Dezvolt un proiect”. Nu este un rol de autentificare.';
comment on column public.profiles.wants_to_join is 'Intenție: „Vreau să mă alătur unui proiect”. Nu este un rol de autentificare.';
comment on column public.profiles.skills is 'Competențe declarate de utilizator (maximum 15, fiecare 1–40 de caractere, fără duplicate).';
comment on column public.profiles.desired_roles is 'Roluri căutate într-o echipă. „cofondator” nu acordă statut sau drepturi.';
comment on column public.profiles.weekly_hours is 'Disponibilitate declarată, în ore pe săptămână (1–168).';

-- ---------------------------------------------------------------------------
-- 2. Validarea elementelor din liste (o constrângere CHECK nu poate parcurge elementele)
-- ---------------------------------------------------------------------------
create or replace function private.check_participation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from unnest(new.skills) as s
    where s is null or s <> btrim(s) or char_length(s) not between 1 and 40
  ) then
    raise exception 'Fiecare competență trebuie să aibă între 1 și 40 de caractere.' using errcode = '23514';
  end if;
  if (select count(distinct lower(s)) from unnest(new.skills) as s) <> cardinality(new.skills) then
    raise exception 'Competențele nu se pot repeta.' using errcode = '23514';
  end if;
  if exists (select 1 from unnest(new.desired_roles) as r where r is null)
     or (select count(distinct r) from unnest(new.desired_roles) as r) <> cardinality(new.desired_roles) then
    raise exception 'Rolurile dorite nu se pot repeta.' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.check_participation() from public, anon, authenticated;

drop trigger if exists profiles_participation_check on public.profiles;
create trigger profiles_participation_check
  before insert or update of skills, desired_roles on public.profiles
  for each row execute function private.check_participation();

-- ---------------------------------------------------------------------------
-- 3. Permisiuni: proprietarul poate modifica doar aceste coloane noi (RLS limitează la propriul rând)
-- ---------------------------------------------------------------------------
grant update (wants_to_develop, wants_to_join, skills, desired_roles, weekly_hours)
  on table public.profiles to authenticated;

-- Verificare defensivă: RLS trebuie să rămână activ pe profiluri.
alter table public.profiles enable row level security;

commit;
