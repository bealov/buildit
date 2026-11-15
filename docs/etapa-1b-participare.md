# Profil Creator · Cum vrei să participi — aplicarea migrării pe buildit-dev

Migrarea adaugă în `public.profiles` intențiile de participare, competențele, rolul dorit și
disponibilitatea. Se aplică **după** `20261102000000_profiles_and_roles.sql`, doar pe proiectul
de dezvoltare **buildit-dev**. Producția nu este afectată.

> Până la aplicarea migrării, conturile reale din Vercel Preview nu își pot încărca profilul
> (aplicația cere coloane care încă nu există). Modul demo funcționează oricum.

## Pasul 1 · Aplică migrarea

1. [supabase.com/dashboard](https://supabase.com/dashboard) → proiectul **buildit-dev**.
2. **SQL Editor** → **New query**.
3. În GitHub, deschide `supabase/migrations/20261115000000_creator_participation.sql` pe ramura
   PR #2, apasă **Raw**, copiază tot conținutul și lipește-l în editor.
4. Apasă **Run**. Rezultat așteptat: *Success. No rows returned*. Dacă apare avertismentul despre
   operațiuni distructive, confirmă: liniile `drop constraint if exists` / `drop trigger if exists`
   elimină doar regulile cu același nume, ca migrarea să poată fi rulată din nou. Mesajele
   *NOTICE … does not exist, skipping* sunt normale la prima rulare. Nu se șterg date.

## Pasul 2 · Verifică (doar citire)

Într-un query nou:

```sql
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name in ('wants_to_develop','wants_to_join','skills','desired_roles','weekly_hours')) as coloane_noi,      -- 5
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass)                                        as rls_activ,        -- true
  (select count(*) from public.profiles
    where wants_to_develop or wants_to_join or cardinality(skills) > 0
       or cardinality(desired_roles) > 0 or weekly_hours is not null)                                                  as profiluri_cu_intentii, -- 0 imediat după migrare
  (select count(*) from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'profiles' and grantee = 'authenticated'
      and privilege_type = 'UPDATE'
      and column_name in ('wants_to_develop','wants_to_join','skills','desired_roles','weekly_hours'))                 as permisiuni_update; -- 5
```

Rezultat așteptat: `5`, `true`, `0`, `5`.

## Pasul 3 · Verificarea cu două conturi

Pe PR #2 adaugă eticheta **verifica-buildit-dev** (sau, în Actions → „Permisiuni buildit-dev”,
**Run workflow**). Scriptul `tests/rls-remote.mjs` verifică, în plus față de etapa 1, că fiecare
cont își salvează intențiile, competențele, rolul dorit și orele, că valorile rămân după
reconectare și sunt vizibile celuilalt cont, că un cont nu le poate modifica pe ale celuilalt și
că valorile nepermise sunt refuzate. La final restaurează valorile inițiale ale ambelor conturi.
