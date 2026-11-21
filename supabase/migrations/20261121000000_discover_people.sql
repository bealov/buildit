-- BuildIT · Match pentru conturile reale: „Descoperă oameni”.
--
-- Se aplică pe proiectul de dezvoltare (buildit-dev), DUPĂ:
--   20261102000000_profiles_and_roles.sql
--   20261115000000_creator_participation.sql
-- Nu modifică tabele, date, permisiuni pe tabele sau reguli RLS. Poate fi rulată de mai multe ori.
--
-- Adaugă o singură funcție de căutare, public.discover_people, care:
--   * rulează cu drepturile utilizatorului care o apelează (SECURITY INVOKER), deci RLS și
--     permisiunile existente se aplică exact ca la o citire directă din tabele;
--   * este disponibilă doar utilizatorilor autentificați (nu și vizitatorilor);
--   * întoarce doar câmpuri publice din profiles (fără email, link sau alte date private);
--   * include doar persoanele cu rolul Creator care au bifat „Vreau să mă alătur unui proiect”
--     (inclusiv cele care dezvoltă și un proiect) și exclude propriul profil;
--   * filtrează pe server după competență (potrivire parțială, fără diferență între litere mari și
--     mici și fără diferență între ă/â/î/ș/ț și a/i/s/t, indiferent de setările de limbă ale
--     serverului), rol dorit și disponibilitate minimă;
--   * o disponibilitate necompletată NU este tratată ca 0: cu filtrul de ore activ, profilurile
--     fără ore apar doar dacă se cere explicit (p_include_unknown_hours);
--   * întoarce cel mult 50 de rezultate pe apel, ordonate stabil, cu paginare prin cursor.

begin;

create or replace function public.discover_people(
  p_skill text default null,
  p_role text default null,
  p_min_hours integer default null,
  p_include_unknown_hours boolean default false,
  p_after_created_at timestamptz default null,
  p_after_id uuid default null,
  p_limit integer default 12
)
returns table (
  id uuid,
  display_name text,
  avatar_path text,
  bio text,
  city text,
  skills text[],
  desired_roles text[],
  weekly_hours smallint,
  wants_to_develop boolean,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    select
      nullif(btrim(coalesce(p_skill, '')), '') as skill,
      nullif(btrim(coalesce(p_role, '')), '') as role,
      least(greatest(coalesce(p_limit, 12), 1), 50) as lim
  )
  select p.id, p.display_name, p.avatar_path, p.bio, p.city, p.skills, p.desired_roles,
         p.weekly_hours, p.wants_to_develop, p.created_at
  from public.profiles p, params
  where (select auth.uid()) is not null
    and p.id <> (select auth.uid())
    and p.wants_to_join
    and exists (select 1 from public.profile_roles r where r.user_id = p.id and r.role = 'creator')
    and (params.skill is null or exists (
          select 1 from unnest(p.skills) as s
          where translate(lower(s), 'ăâîșțşţĂÂÎȘȚŞŢ', 'aaiststaaistst')
                like '%' || replace(replace(replace(translate(lower(params.skill), 'ăâîșțşţĂÂÎȘȚŞŢ', 'aaiststaaistst'), '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\'
        ))
    and (params.role is null or params.role = any (p.desired_roles))
    and (p_min_hours is null
         or (p.weekly_hours is not null and p.weekly_hours >= p_min_hours)
         or (p.weekly_hours is null and coalesce(p_include_unknown_hours, false)))
    and (p_after_created_at is null or p_after_id is null
         or (p.created_at, p.id) < (p_after_created_at, p_after_id))
  order by p.created_at desc, p.id desc
  limit (select lim from params);
$$;

comment on function public.discover_people(text, text, integer, boolean, timestamptz, uuid, integer) is
  'Match · Descoperă oameni: Creatori care vor să se alăture unui proiect. Doar câmpuri publice, fără propriul profil, max. 50 pe pagină. Rulează cu drepturile apelantului (RLS activ).';

revoke all on function public.discover_people(text, text, integer, boolean, timestamptz, uuid, integer) from public, anon;
grant execute on function public.discover_people(text, text, integer, boolean, timestamptz, uuid, integer) to authenticated;

commit;
