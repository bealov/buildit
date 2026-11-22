-- Etapa: „Descoperă proiecte” (conturi reale).
--
-- Se aplică pe proiectul de dezvoltare (buildit-dev), DUPĂ 20261122000000_projects.sql.
-- Nu modifică tabele, date, permisiuni pe tabele sau reguli RLS. Poate fi rulată de mai multe ori.
--
-- Adaugă o singură funcție de citire, public.discover_projects, care:
--   * rulează cu drepturile utilizatorului care o apelează (SECURITY INVOKER): RLS și permisiunile
--     existente se aplică exact ca la o citire directă;
--   * este disponibilă doar utilizatorilor autentificați;
--   * întoarce doar proiecte PUBLICATE ale ALTOR utilizatori (proprietarul își vede corect ciornele
--     prin RLS, dar descoperirea le exclude explicit, împreună cu toate proiectele proprii);
--   * întoarce doar coloane publice ale proiectului și numele / calea fotografiei proprietarului
--     (din profiles, deja vizibile utilizatorilor autentificați); niciodată date din project_private;
--   * filtre: text (titlu și descriere, fără diferență de majuscule sau diacritice), „ce caută”
--     (oricare dintre valorile alese), industrie, stadiu, oraș (+ opțional proiectele Remote / Online)
--     și plafonul investiției totale căutate;
--   * plafon completat ⇒ doar proiecte care caută investiție; „Investiție de stabilit” (fără sumă
--     publică) este exclusă, cu excepția cazului în care se cere explicit (p_include_unknown_investment);
--     suma 0 rămâne 0 (nu devine necunoscută);
--   * ordine: cele mai recent publicate întâi; maximum 50 pe apel; paginare prin cursor.

begin;

create or replace function public.discover_projects(
  p_search text default null,
  p_looking_for text[] default null,
  p_industry text default null,
  p_stage text default null,
  p_city text default null,
  p_include_remote boolean default true,
  p_max_investment numeric default null,
  p_include_unknown_investment boolean default false,
  p_after_published_at timestamptz default null,
  p_after_id uuid default null,
  p_limit integer default 12
)
returns table (
  id uuid,
  title text,
  summary text,
  industry text,
  stage text,
  city text,
  is_remote boolean,
  looking_for text[],
  investment_public numeric,
  published_at timestamptz,
  owner_id uuid,
  owner_name text,
  owner_avatar_path text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    select
      nullif(replace(replace(replace(translate(lower(btrim(coalesce(p_search, ''))), 'ăâîșțşţĂÂÎȘȚŞŢ', 'aaiststaaistst'), '\', '\\'), '%', '\%'), '_', '\_'), '') as q,
      nullif(replace(replace(replace(translate(lower(btrim(coalesce(p_city, ''))), 'ăâîșțşţĂÂÎȘȚŞŢ', 'aaiststaaistst'), '\', '\\'), '%', '\%'), '_', '\_'), '') as city,
      nullif(btrim(coalesce(p_industry, '')), '') as industry,
      nullif(btrim(coalesce(p_stage, '')), '') as stage,
      nullif(coalesce(p_looking_for, '{}'::text[]), '{}'::text[]) as looking,
      least(greatest(coalesce(p_limit, 12), 1), 50) as lim
  )
  select pr.id, pr.title, pr.summary, pr.industry, pr.stage, pr.city, pr.is_remote, pr.looking_for,
         pr.investment_public, pr.published_at, pr.owner_id, o.display_name, o.avatar_path
  from public.projects pr
  cross join params
  left join public.profiles o on o.id = pr.owner_id
  where (select auth.uid()) is not null
    and pr.status = 'published'
    and pr.owner_id <> (select auth.uid())
    and (params.q is null
         or translate(lower(pr.title), 'ăâîșțşţĂÂÎȘȚŞŢ', 'aaiststaaistst') like '%' || params.q || '%' escape '\'
         or translate(lower(pr.summary), 'ăâîșțşţĂÂÎȘȚŞŢ', 'aaiststaaistst') like '%' || params.q || '%' escape '\')
    and (params.looking is null or pr.looking_for && params.looking)
    and (params.industry is null or pr.industry = params.industry)
    and (params.stage is null or pr.stage = params.stage)
    and (params.city is null
         or translate(lower(pr.city), 'ăâîșțşţĂÂÎȘȚŞŢ', 'aaiststaaistst') like '%' || params.city || '%' escape '\'
         or (coalesce(p_include_remote, true) and pr.is_remote))
    and (p_max_investment is null or (
          'investitie' = any (pr.looking_for)
          and ((pr.investment_public is not null and pr.investment_public <= p_max_investment)
               or (pr.investment_public is null and coalesce(p_include_unknown_investment, false)))))
    and (p_after_published_at is null or p_after_id is null
         or (pr.published_at, pr.id) < (p_after_published_at, p_after_id))
  order by pr.published_at desc, pr.id desc
  limit (select lim from params);
$$;

comment on function public.discover_projects(text, text[], text, text, text, boolean, numeric, boolean, timestamptz, uuid, integer) is
  'Descoperă proiecte: doar proiecte publicate ale altor utilizatori, doar coloane publice, max. 50 pe pagină. Rulează cu drepturile apelantului (RLS activ).';

revoke all on function public.discover_projects(text, text[], text, text, text, boolean, numeric, boolean, timestamptz, uuid, integer) from public, anon;
grant execute on function public.discover_projects(text, text[], text, text, text, boolean, numeric, boolean, timestamptz, uuid, integer) to authenticated;

commit;
