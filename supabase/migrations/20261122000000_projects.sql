-- BuildIT · Etapa 3: proiecte reale (ciorne private și proiecte publicate).
--
-- Se aplică pe proiectul de dezvoltare (buildit-dev), DUPĂ:
--   20261102000000_profiles_and_roles.sql
--   20261115000000_creator_participation.sql
--   20261121000000_discover_people.sql
-- Nu modifică tabelele sau regulile existente. Poate fi rulată de mai multe ori.
--
-- Reguli impuse în baza de date:
--   * Doar conturile cu rolul Creator pot crea proiecte; maximum 20 de proiecte pe cont (ciorne incluse).
--   * Ciornele sunt vizibile numai proprietarului; proiectele publicate, utilizatorilor autentificați.
--     Vizitatorii neautentificați nu au acces.
--   * Numai proprietarul editează, publică, retrage sau șterge; proprietarul nu poate fi schimbat.
--   * Ștergerea definitivă este permisă doar pentru ciorne.
--   * Publicarea cere: titlu, descriere scurtă, industrie, stadiu, locație (oraș sau „Remote / Online”)
--     și cel puțin o opțiune la „ce caută proiectul” (colegi, parteneri, investiție).
--   * Datele financiare și linkurile către plan sunt în project_private, vizibil DOAR proprietarului.
--     Celorlalți li se arată doar suma investiției căutate (investment_public), calculată de baza de
--     date numai când proiectul caută investiție și suma este estimată; utilizatorul nu o poate scrie.
--   * 0, „Nu am estimat încă” (unknown_financials) și necompletat (NULL) rămân distincte.
--   * Salvarea se face atomic prin save_project, cu protecție la editarea simultană (cod PT409).
--   * Fără contoare de vizualizări sau statistici în aceste tabele.

begin;

-- ---------------------------------------------------------------------------
-- 1. Tabele
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  status text not null default 'draft'
    constraint projects_status_allowed check (status in ('draft', 'published')),
  title text not null default '' constraint projects_title_length check (char_length(title) <= 120),
  summary text not null default '' constraint projects_summary_length check (char_length(summary) <= 600),
  industry text not null default ''
    constraint projects_industry_allowed check (industry in ('', 'IT & Tech', 'Tehnologie verde', 'HoReCa', 'Educație', 'Beauty', 'Agricultură', 'Producție', 'Sănătate', 'Retail', 'Inginerie', 'Servicii')),
  stage text not null default ''
    constraint projects_stage_allowed check (stage in ('', 'idee', 'in_dezvoltare', 'lansat')),
  city text not null default '' constraint projects_city_length check (char_length(city) <= 80),
  is_remote boolean not null default false,
  looking_for text[] not null default '{}'
    constraint projects_looking_for_allowed check (looking_for <@ array['colegi', 'parteneri', 'investitie']::text[]),
  problem text not null default '' constraint projects_problem_length check (char_length(problem) <= 2000),
  solution text not null default '' constraint projects_solution_length check (char_length(solution) <= 2000),
  market text not null default '' constraint projects_market_length check (char_length(market) <= 2000),
  difference text not null default '' constraint projects_difference_length check (char_length(difference) <= 2000),
  business_model text not null default '' constraint projects_business_model_length check (char_length(business_model) <= 2000),
  marketing text not null default '' constraint projects_marketing_length check (char_length(marketing) <= 2000),
  growth_plan text not null default '' constraint projects_growth_plan_length check (char_length(growth_plan) <= 2000),
  objectives text not null default '' constraint projects_objectives_length check (char_length(objectives) <= 2000),
  team text not null default '' constraint projects_team_length check (char_length(team) <= 2000),
  traction text not null default '' constraint projects_traction_length check (char_length(traction) <= 2000),
  -- Calculată de baza de date (vezi private.project_investment); nu poate fi scrisă de utilizatori.
  investment_public numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  constraint projects_publish_required check (
    status = 'draft' or (
      btrim(title) <> '' and btrim(summary) <> '' and industry <> '' and stage <> ''
      and (is_remote or btrim(city) <> '')
      and cardinality(looking_for) >= 1
    )
  )
);

comment on table public.projects is
  'Proiecte reale. Ciornele: doar proprietarul. Publicate: utilizatorii autentificați. Fără date financiare private.';
comment on column public.projects.investment_public is
  'Suma investiției căutate, vizibilă public doar dacă proiectul caută investiție și suma este estimată. Calculată automat.';

create index if not exists projects_owner_idx on public.projects (owner_id);
create index if not exists projects_published_idx on public.projects (status, published_at desc);

create table if not exists public.project_private (
  project_id uuid primary key references public.projects (id) on delete cascade,
  monthly_revenue numeric constraint pp_monthly_revenue_valid check (monthly_revenue is null or (monthly_revenue >= 0 and monthly_revenue < 1e12 and scale(monthly_revenue) <= 2)),
  fixed_costs numeric constraint pp_fixed_costs_valid check (fixed_costs is null or (fixed_costs >= 0 and fixed_costs < 1e12 and scale(fixed_costs) <= 2)),
  variable_costs numeric constraint pp_variable_costs_valid check (variable_costs is null or (variable_costs >= 0 and variable_costs < 1e12 and scale(variable_costs) <= 2)),
  initial_investment numeric constraint pp_initial_investment_valid check (initial_investment is null or (initial_investment >= 0 and initial_investment < 1e12 and scale(initial_investment) <= 2)),
  investment_amount numeric constraint pp_investment_amount_valid check (investment_amount is null or (investment_amount >= 0 and investment_amount < 1e12 and scale(investment_amount) <= 2)),
  monthly_growth_pct numeric constraint pp_monthly_growth_pct_valid check (monthly_growth_pct is null or (monthly_growth_pct >= 0 and monthly_growth_pct < 1e12 and scale(monthly_growth_pct) <= 2)),
  unit_price numeric constraint pp_unit_price_valid check (unit_price is null or (unit_price >= 0 and unit_price < 1e12 and scale(unit_price) <= 2)),
  unit_cost numeric constraint pp_unit_cost_valid check (unit_cost is null or (unit_cost >= 0 and unit_cost < 1e12 and scale(unit_cost) <= 2)),
  unknown_financials text[] not null default '{}'
    constraint pp_unknown_financials_allowed check (unknown_financials <@ array['monthly_revenue', 'fixed_costs', 'variable_costs', 'initial_investment', 'investment_amount', 'monthly_growth_pct', 'unit_price', 'unit_cost']::text[]),
  plan_links text[] not null default '{}' constraint pp_plan_links_count check (cardinality(plan_links) <= 5),
  updated_at timestamptz not null default now()
);

comment on table public.project_private is
  'Date private ale proiectului (finanțe, linkuri către plan). Vizibile și modificabile doar de proprietar, inclusiv după publicare.';

-- ---------------------------------------------------------------------------
-- 2. Funcții interne și triggere
-- ---------------------------------------------------------------------------

-- Suma publică: doar dacă proiectul caută investiție și suma este estimată (nu „Nu am estimat încă”).
create or replace function private.project_investment(p_project uuid, p_looking text[])
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when 'investitie' = any (p_looking) and not ('investment_amount' = any (pp.unknown_financials))
      then pp.investment_amount
  end
  from public.project_private pp
  where pp.project_id = p_project
$$;

-- SECURITY DEFINER: apelează private.project_investment și numără proiectele proprietarului
-- (inclusiv pentru limita de 20); modifică doar rândul care se salvează.
create or replace function private.projects_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Limita de 20 de proiecte pe cont (blocare pe proprietar, ca două creări simultane să nu o depășească).
    perform pg_advisory_xact_lock(hashtext('buildit-projects:' || new.owner_id::text));
    if (select count(*) from public.projects p where p.owner_id = new.owner_id) >= 20 then
      raise exception 'Ai atins limita de 20 de proiecte.' using errcode = 'PT422';
    end if;
    new.created_at := now();
  else
    if new.id is distinct from old.id or new.owner_id is distinct from old.owner_id or new.created_at is distinct from old.created_at then
      raise exception 'Identificatorul, proprietarul și data creării nu pot fi modificate.' using errcode = '42501';
    end if;
  end if;
  -- Valorile nepermise sunt respinse (nu eliminate în tăcere); apoi ordine fixă, fără dubluri.
  if exists (select 1 from unnest(new.looking_for) as x where x is null or x not in ('colegi', 'parteneri', 'investitie')) then
    raise exception 'Valoare nepermisă la „ce caută proiectul”.' using errcode = '23514';
  end if;
  new.looking_for := array(select x from unnest(array['colegi', 'parteneri', 'investitie']) as x where x = any (new.looking_for));
  new.investment_public := private.project_investment(new.id, new.looking_for);
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    new.published_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.project_private_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.project_id is distinct from old.project_id then
    raise exception 'Proiectul datelor private nu poate fi schimbat.' using errcode = '42501';
  end if;
  if exists (
    select 1 from unnest(new.plan_links) as l
    where l is null or char_length(l) > 300 or l !~* '^https?://[^[:space:]]+$'
  ) then
    raise exception 'Linkurile trebuie să înceapă cu https:// sau http:// și să aibă cel mult 300 de caractere.' using errcode = '23514';
  end if;
  new.unknown_financials := array(select distinct x from unnest(new.unknown_financials) as x order by x);
  new.updated_at := now();
  return new;
end;
$$;

-- După modificarea datelor private: recalculează suma publică și marchează proiectul ca modificat
-- (pentru protecția la editare simultană).
create or replace function private.project_private_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.projects p
     set investment_public = private.project_investment(p.id, p.looking_for)
   where p.id = new.project_id;
  return null;
end;
$$;

revoke all on function private.project_investment(uuid, text[]) from public, anon, authenticated;
revoke all on function private.projects_before_write() from public, anon, authenticated;
revoke all on function private.project_private_before_write() from public, anon, authenticated;
revoke all on function private.project_private_after_write() from public, anon, authenticated;

drop trigger if exists projects_before_write on public.projects;
create trigger projects_before_write
  before insert or update on public.projects
  for each row execute function private.projects_before_write();

drop trigger if exists project_private_before_write on public.project_private;
create trigger project_private_before_write
  before insert or update on public.project_private
  for each row execute function private.project_private_before_write();

drop trigger if exists project_private_after_write on public.project_private;
create trigger project_private_after_write
  after insert or update on public.project_private
  for each row execute function private.project_private_after_write();

-- ---------------------------------------------------------------------------
-- 3. Permisiuni explicite (expunerea automată a tabelelor este dezactivată)
-- ---------------------------------------------------------------------------
revoke all on table public.projects, public.project_private from public, anon, authenticated;

grant select on table public.projects to authenticated;
grant insert (status, title, summary, industry, stage, city, is_remote, looking_for, problem, solution, market,
              difference, business_model, marketing, growth_plan, objectives, team, traction)
  on table public.projects to authenticated;
grant update (status, title, summary, industry, stage, city, is_remote, looking_for, problem, solution, market,
              difference, business_model, marketing, growth_plan, objectives, team, traction)
  on table public.projects to authenticated;
grant delete on table public.projects to authenticated;

grant select on table public.project_private to authenticated;
grant insert (project_id, monthly_revenue, fixed_costs, variable_costs, initial_investment, investment_amount,
              monthly_growth_pct, unit_price, unit_cost, unknown_financials, plan_links)
  on table public.project_private to authenticated;
grant update (monthly_revenue, fixed_costs, variable_costs, initial_investment, investment_amount,
              monthly_growth_pct, unit_price, unit_cost, unknown_financials, plan_links)
  on table public.project_private to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Row Level Security
-- ---------------------------------------------------------------------------
alter table public.projects enable row level security;
alter table public.project_private enable row level security;

drop policy if exists projects_select_own_or_published on public.projects;
create policy projects_select_own_or_published on public.projects
  for select to authenticated
  using (owner_id = (select auth.uid()) or status = 'published');

drop policy if exists projects_insert_creator on public.projects;
create policy projects_insert_creator on public.projects
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.profile_roles r where r.user_id = (select auth.uid()) and r.role = 'creator')
  );

drop policy if exists projects_update_own on public.projects;
create policy projects_update_own on public.projects
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists projects_delete_own_draft on public.projects;
create policy projects_delete_own_draft on public.projects
  for delete to authenticated
  using (owner_id = (select auth.uid()) and status = 'draft');

drop policy if exists project_private_select_own on public.project_private;
create policy project_private_select_own on public.project_private
  for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));

drop policy if exists project_private_insert_own on public.project_private;
create policy project_private_insert_own on public.project_private
  for insert to authenticated
  with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));

drop policy if exists project_private_update_own on public.project_private;
create policy project_private_update_own on public.project_private
  for update to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));

-- ---------------------------------------------------------------------------
-- 5. Salvare atomică și schimbarea stării, cu protecție la editarea simultană
-- ---------------------------------------------------------------------------
-- Rulează cu drepturile utilizatorului (SECURITY INVOKER): RLS, permisiunile și validările de mai sus
-- se aplică exact ca la scrierea directă. Toate modificările unei salvări se fac într-o singură
-- tranzacție: fie se salvează tot, fie nimic.
create or replace function public.save_project(
  p_id uuid,
  p_expected_updated_at timestamptz,
  p_status text,
  p_public jsonb,
  p_private jsonb
)
returns table (id uuid, status text, updated_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_pub jsonb := coalesce(p_public, '{}'::jsonb);
  v_priv jsonb := coalesce(p_private, '{}'::jsonb);
begin
  if v_uid is null then
    raise exception 'Autentificare necesară.' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('draft', 'published') then
    raise exception 'Stare invalidă.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.projects as p (status, title, summary, industry, stage, city, is_remote, looking_for, problem, solution,
                                      market, difference, business_model, marketing, growth_plan, objectives, team, traction)
    values (p_status, coalesce(v_pub ->> 'title', ''), coalesce(v_pub ->> 'summary', ''), coalesce(v_pub ->> 'industry', ''),
            coalesce(v_pub ->> 'stage', ''), coalesce(v_pub ->> 'city', ''), coalesce((v_pub ->> 'is_remote')::boolean, false),
            coalesce(array(select jsonb_array_elements_text(v_pub -> 'looking_for')), '{}'),
            coalesce(v_pub ->> 'problem', ''), coalesce(v_pub ->> 'solution', ''), coalesce(v_pub ->> 'market', ''),
            coalesce(v_pub ->> 'difference', ''), coalesce(v_pub ->> 'business_model', ''), coalesce(v_pub ->> 'marketing', ''),
            coalesce(v_pub ->> 'growth_plan', ''), coalesce(v_pub ->> 'objectives', ''), coalesce(v_pub ->> 'team', ''),
            coalesce(v_pub ->> 'traction', ''))
    returning p.id into v_id;
    insert into public.project_private (project_id) values (v_id);
  else
    update public.projects as p
       set status = p_status,
           title = coalesce(v_pub ->> 'title', ''), summary = coalesce(v_pub ->> 'summary', ''),
           industry = coalesce(v_pub ->> 'industry', ''), stage = coalesce(v_pub ->> 'stage', ''),
           city = coalesce(v_pub ->> 'city', ''), is_remote = coalesce((v_pub ->> 'is_remote')::boolean, false),
           looking_for = coalesce(array(select jsonb_array_elements_text(v_pub -> 'looking_for')), '{}'),
           problem = coalesce(v_pub ->> 'problem', ''), solution = coalesce(v_pub ->> 'solution', ''),
           market = coalesce(v_pub ->> 'market', ''), difference = coalesce(v_pub ->> 'difference', ''),
           business_model = coalesce(v_pub ->> 'business_model', ''), marketing = coalesce(v_pub ->> 'marketing', ''),
           growth_plan = coalesce(v_pub ->> 'growth_plan', ''), objectives = coalesce(v_pub ->> 'objectives', ''),
           team = coalesce(v_pub ->> 'team', ''), traction = coalesce(v_pub ->> 'traction', '')
     where p.id = p_id and p.updated_at = p_expected_updated_at
    returning p.id into v_id;
    if v_id is null then
      if exists (select 1 from public.projects p where p.id = p_id and p.owner_id = v_uid) then
        raise exception 'Proiectul a fost modificat între timp, pe alt dispozitiv.' using errcode = 'PT409';
      end if;
      raise exception 'Proiectul nu există sau nu îți aparține.' using errcode = '42501';
    end if;
  end if;

  update public.project_private as pp
     set monthly_revenue = (v_priv ->> 'monthly_revenue')::numeric,
         fixed_costs = (v_priv ->> 'fixed_costs')::numeric,
         variable_costs = (v_priv ->> 'variable_costs')::numeric,
         initial_investment = (v_priv ->> 'initial_investment')::numeric,
         investment_amount = (v_priv ->> 'investment_amount')::numeric,
         monthly_growth_pct = (v_priv ->> 'monthly_growth_pct')::numeric,
         unit_price = (v_priv ->> 'unit_price')::numeric,
         unit_cost = (v_priv ->> 'unit_cost')::numeric,
         unknown_financials = coalesce(array(select jsonb_array_elements_text(v_priv -> 'unknown_financials')), '{}'),
         plan_links = coalesce(array(select jsonb_array_elements_text(v_priv -> 'plan_links')), '{}')
   where pp.project_id = v_id;
  if not found then
    raise exception 'Datele private ale proiectului lipsesc.' using errcode = '42501';
  end if;

  return query select p.id, p.status, p.updated_at from public.projects p where p.id = v_id;
end;
$$;

create or replace function public.set_project_status(p_id uuid, p_expected_updated_at timestamptz, p_status text)
returns table (id uuid, status text, updated_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Autentificare necesară.' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('draft', 'published') then
    raise exception 'Stare invalidă.' using errcode = '22023';
  end if;
  update public.projects as p set status = p_status
   where p.id = p_id and p.updated_at = p_expected_updated_at
  returning p.id into v_id;
  if v_id is null then
    if exists (select 1 from public.projects p where p.id = p_id and p.owner_id = auth.uid()) then
      raise exception 'Proiectul a fost modificat între timp, pe alt dispozitiv.' using errcode = 'PT409';
    end if;
    raise exception 'Proiectul nu există sau nu îți aparține.' using errcode = '42501';
  end if;
  return query select p.id, p.status, p.updated_at from public.projects p where p.id = v_id;
end;
$$;

revoke all on function public.save_project(uuid, timestamptz, text, jsonb, jsonb) from public, anon;
revoke all on function public.set_project_status(uuid, timestamptz, text) from public, anon;
grant execute on function public.save_project(uuid, timestamptz, text, jsonb, jsonb) to authenticated;
grant execute on function public.set_project_status(uuid, timestamptz, text) to authenticated;

commit;
