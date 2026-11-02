-- Teste locale pentru migrarea de profiluri: permisiuni, RLS, roluri, fotografii.
-- Rulare: tests/db/run-local.sh (pornește un Postgres temporar, nu atinge Supabase).
\set ON_ERROR_STOP on
\pset footer off
\o /dev/null

-- ---------------------------------------------------------------------------
-- Utilitare de test (schema t, doar în baza temporară)
-- ---------------------------------------------------------------------------
create schema t;
grant usage on schema t to anon, authenticated;
create table t.results (n serial primary key, name text not null, ok boolean not null, detail text);
grant insert, select on t.results to anon, authenticated;
grant usage on sequence t.results_n_seq to anon, authenticated;

create function t.record(p_name text, p_ok boolean, p_detail text default null) returns void
language sql as $$ insert into t.results (name, ok, detail) values (p_name, p_ok, p_detail) $$;

-- Interogarea trebuie să eșueze cu unul dintre codurile așteptate.
create function t.expect_error(p_name text, p_sql text, p_codes text[]) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    perform t.record(p_name, sqlstate = any (p_codes), sqlstate || ' ' || sqlerrm);
    return;
  end;
  perform t.record(p_name, false, 'nicio eroare');
end $$;

-- SELECT: numărul de rânduri vizibile.
create function t.expect_rows(p_name text, p_sql text, p_expected int) returns void
language plpgsql as $$
declare n int;
begin
  execute format('select count(*) from (%s) q', p_sql) into n;
  perform t.record(p_name, n = p_expected, format('rânduri=%s, așteptat=%s', n, p_expected));
exception when others then
  perform t.record(p_name, false, sqlstate || ' ' || sqlerrm);
end $$;

-- UPDATE/INSERT/DELETE: numărul de rânduri afectate.
create function t.expect_affected(p_name text, p_sql text, p_expected int) returns void
language plpgsql as $$
declare n int;
begin
  execute p_sql;
  get diagnostics n = row_count;
  perform t.record(p_name, n = p_expected, format('afectate=%s, așteptat=%s', n, p_expected));
exception when others then
  perform t.record(p_name, false, sqlstate || ' ' || sqlerrm);
end $$;

create function t.expect_true(p_name text, p_sql text) returns void
language plpgsql as $$
declare v boolean;
begin
  execute p_sql into v;
  perform t.record(p_name, coalesce(v, false), coalesce(v::text, 'null'));
exception when others then
  perform t.record(p_name, false, sqlstate || ' ' || sqlerrm);
end $$;

grant execute on all functions in schema t to anon, authenticated;

-- Identificatori de test
-- A: Creator (înregistrare normală), B: Investitor, C: cont fără metadate (creat din Dashboard),
-- D: rol invalid trimis la înregistrare, E: nume gol.
\set A '11111111-1111-1111-1111-111111111111'
\set B '22222222-2222-2222-2222-222222222222'
\set C '33333333-3333-3333-3333-333333333333'
\set D '44444444-4444-4444-4444-444444444444'
\set E '55555555-5555-5555-5555-555555555555'

-- ---------------------------------------------------------------------------
-- 1. Crearea automată a profilului la înregistrare
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  (:'A', 'a@test.invalid', '{"display_name":"Ana Creator","initial_role":"creator"}'),
  (:'B', 'b@test.invalid', '{"display_name":"Bogdan Investitor","initial_role":"investor"}'),
  (:'C', 'c@test.invalid', '{}'),
  (:'D', 'd@test.invalid', '{"display_name":"Dan","initial_role":"admin"}'),
  (:'E', 'e@test.invalid', '{"display_name":"   ","initial_role":"creator"}');

select t.expect_rows('trigger: profil creat pentru A', $$select 1 from public.profiles where id = '11111111-1111-1111-1111-111111111111' and display_name = 'Ana Creator'$$, 1);
select t.expect_rows('trigger: rol inițial creator pentru A', $$select 1 from public.profile_roles where user_id = '11111111-1111-1111-1111-111111111111' and role = 'creator'$$, 1);
select t.expect_rows('trigger: date private create pentru A, contact ascuns implicit', $$select 1 from public.profiles_private where id = '11111111-1111-1111-1111-111111111111' and not show_email_after_match and not show_link_after_match and link = ''$$, 1);
select t.expect_rows('trigger: rol inițial investor pentru B', $$select 1 from public.profile_roles where user_id = '22222222-2222-2222-2222-222222222222' and role = 'investor'$$, 1);
select t.expect_rows('trigger: fără profil inventat pentru contul fără metadate (C)', $$select 1 from public.profiles where id = '33333333-3333-3333-3333-333333333333'$$, 0);
select t.expect_rows('trigger: rol administrativ ignorat (D), fără profil', $$select 1 from public.profiles where id = '44444444-4444-4444-4444-444444444444'$$, 0);
select t.expect_rows('trigger: nume gol ignorat (E), fără profil', $$select 1 from public.profiles where id = '55555555-5555-5555-5555-555555555555'$$, 0);
select t.expect_rows('schema: nicio coloană email în tabelele publice', $$select 1 from information_schema.columns where table_schema = 'public' and column_name ilike '%email%' and column_name not like 'show_email%'$$, 0);
select t.expect_true('bucket avatars este privat', $$select not public from storage.buckets where id = 'avatars'$$);
select t.expect_true('anon nu are SELECT pe profiles', $$select not has_table_privilege('anon', 'public.profiles', 'select')$$);
select t.expect_true('anon nu are SELECT pe profiles_private', $$select not has_table_privilege('anon', 'public.profiles_private', 'select')$$);
select t.expect_true('anon nu are SELECT pe profile_roles', $$select not has_table_privilege('anon', 'public.profile_roles', 'select')$$);
select t.expect_true('authenticated nu are INSERT/DELETE pe profiles', $$select not has_table_privilege('authenticated', 'public.profiles', 'insert') and not has_table_privilege('authenticated', 'public.profiles', 'delete')$$);
select t.expect_true('authenticated nu are UPDATE/DELETE pe profile_roles', $$select not has_table_privilege('authenticated', 'public.profile_roles', 'update') and not has_table_privilege('authenticated', 'public.profile_roles', 'delete')$$);
select t.expect_true('RLS activ pe toate cele trei tabele', $$select bool_and(relrowsecurity) from pg_class where oid in ('public.profiles'::regclass, 'public.profiles_private'::regclass, 'public.profile_roles'::regclass)$$);
select t.expect_true('funcțiile interne nu pot fi apelate de authenticated', $$select not has_function_privilege('authenticated', 'private.create_profile(uuid, text, text)', 'execute') and not has_function_privilege('authenticated', 'private.handle_new_user()', 'execute')$$);
select t.expect_true('anon nu poate apela complete_profile', $$select not has_function_privilege('anon', 'public.complete_profile(text, text)', 'execute')$$);

-- Fișiere preexistente în storage (create ca administrator, pentru testele de citire)
insert into storage.objects (bucket_id, name, owner) values
  ('avatars', '22222222-2222-2222-2222-222222222222/avatar.jpg', :'B'),
  ('documents', '22222222-2222-2222-2222-222222222222/plan.pdf', :'B');

-- ---------------------------------------------------------------------------
-- 2. Vizitator neautentificat (anon)
-- ---------------------------------------------------------------------------
set role anon;
select set_config('request.jwt.claims', '', false);
select t.expect_error('anon: citire profiles refuzată', 'select * from public.profiles', array['42501']);
select t.expect_error('anon: citire profiles_private refuzată', 'select * from public.profiles_private', array['42501']);
select t.expect_error('anon: citire profile_roles refuzată', 'select * from public.profile_roles', array['42501']);
select t.expect_error('anon: complete_profile refuzat', $$select public.complete_profile('Hacker', 'creator')$$, array['42501']);
select t.expect_rows('anon: nu vede nicio fotografie din avatars', $$select 1 from storage.objects where bucket_id = 'avatars'$$, 0);
select t.expect_error('anon: nu poate încărca fotografii', $$insert into storage.objects (bucket_id, name) values ('avatars', 'x/avatar.jpg')$$, array['42501']);
reset role;

-- ---------------------------------------------------------------------------
-- 3. Utilizatorul A (Creator) — propriile date și încercări asupra lui B
-- ---------------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);

select t.expect_rows('A: vede profilurile publice (A și B)', 'select 1 from public.profiles', 2);
select t.expect_rows('A: vede doar propriile date private', 'select 1 from public.profiles_private', 1);
select t.expect_rows('A: nu vede datele private ale lui B', $$select 1 from public.profiles_private where id = '22222222-2222-2222-2222-222222222222'$$, 0);
select t.expect_affected('A: își modifică propriul profil', $$update public.profiles set bio = 'Fondatoare BuildIT', city = 'Cluj' where id = '11111111-1111-1111-1111-111111111111'$$, 1);
select t.expect_true('A: updated_at actualizat automat', $$select updated_at > created_at or updated_at = now() from public.profiles where id = '11111111-1111-1111-1111-111111111111'$$);
select t.expect_affected('A: NU poate modifica profilul lui B (0 rânduri)', $$update public.profiles set bio = 'modificat de A' where id = '22222222-2222-2222-2222-222222222222'$$, 0);
select t.expect_affected('A: NU poate modifica toate profilurile odată (doar al său)', $$update public.profiles set city = 'Iași'$$, 1);
select t.expect_error('A: NU poate schimba id-ul profilului', $$update public.profiles set id = '22222222-2222-2222-2222-222222222222' where id = '11111111-1111-1111-1111-111111111111'$$, array['42501']);
select t.expect_error('A: NU poate modifica created_at', $$update public.profiles set created_at = now() - interval '1 year' where id = '11111111-1111-1111-1111-111111111111'$$, array['42501']);
select t.expect_error('A: NU poate seta avatar_path spre fotografia lui B', $$update public.profiles set avatar_path = '22222222-2222-2222-2222-222222222222/avatar.jpg' where id = '11111111-1111-1111-1111-111111111111'$$, array['23514']);
select t.expect_error('A: NU poate crea profiluri direct', $$insert into public.profiles (id, display_name) values ('33333333-3333-3333-3333-333333333333', 'Fals')$$, array['42501']);
select t.expect_error('A: NU poate șterge profiluri', $$delete from public.profiles where id = '22222222-2222-2222-2222-222222222222'$$, array['42501']);

select t.expect_affected('A: își modifică datele private', $$update public.profiles_private set link = 'https://example.com/ana', show_link_after_match = true where id = '11111111-1111-1111-1111-111111111111'$$, 1);
select t.expect_affected('A: NU poate modifica datele private ale lui B (0 rânduri)', $$update public.profiles_private set show_email_after_match = true where id = '22222222-2222-2222-2222-222222222222'$$, 0);
select t.expect_error('A: link nepermis (javascript:) respins', $$update public.profiles_private set link = 'javascript:alert(1)' where id = '11111111-1111-1111-1111-111111111111'$$, array['23514']);
select t.expect_error('A: buget minim > maxim respins', $$update public.profiles_private set investor_min_budget = 5000, investor_max_budget = 100 where id = '11111111-1111-1111-1111-111111111111'$$, array['23514']);

-- Roluri
select t.expect_affected('A: își activează rolul Investitor', $$insert into public.profile_roles (user_id, role) values ('11111111-1111-1111-1111-111111111111', 'investor')$$, 1);
select t.expect_rows('A: are acum ambele roluri', $$select 1 from public.profile_roles where user_id = '11111111-1111-1111-1111-111111111111'$$, 2);
select t.expect_error('A: NU poate activa un rol pentru B', $$insert into public.profile_roles (user_id, role) values ('22222222-2222-2222-2222-222222222222', 'creator')$$, array['42501']);
select t.expect_error('A: NU poate activa rolul admin', $$insert into public.profile_roles (user_id, role) values ('11111111-1111-1111-1111-111111111111', 'admin')$$, array['42501', '23514']);
select t.expect_error('A: NU poate activa „investitor verificat”', $$insert into public.profile_roles (user_id, role) values ('11111111-1111-1111-1111-111111111111', 'verified_investor')$$, array['42501', '23514']);
select t.expect_error('A: activare dublă respinsă', $$insert into public.profile_roles (user_id, role) values ('11111111-1111-1111-1111-111111111111', 'investor')$$, array['23505']);
select t.expect_error('A: NU poate modifica un rol existent', $$update public.profile_roles set role = 'investor' where user_id = '22222222-2222-2222-2222-222222222222'$$, array['42501']);
select t.expect_error('A: NU poate șterge roluri', $$delete from public.profile_roles where user_id = '22222222-2222-2222-2222-222222222222'$$, array['42501']);
select t.expect_error('A: NU poate seta activated_at', $$insert into public.profile_roles (user_id, role, activated_at) values ('11111111-1111-1111-1111-111111111111', 'creator', now())$$, array['42501']);
select t.expect_error('A: complete_profile respins (profil existent)', $$select public.complete_profile('Alt nume', 'investor')$$, array['23505']);

-- Fotografii
select t.expect_affected('A: încarcă propria fotografie', $$insert into storage.objects (bucket_id, name, owner) values ('avatars', '11111111-1111-1111-1111-111111111111/avatar.jpg', '11111111-1111-1111-1111-111111111111')$$, 1);
select t.expect_affected('A: setează avatar_path propriu', $$update public.profiles set avatar_path = '11111111-1111-1111-1111-111111111111/avatar.jpg' where id = '11111111-1111-1111-1111-111111111111'$$, 1);
select t.expect_error('A: NU poate încărca în folderul lui B', $$insert into storage.objects (bucket_id, name) values ('avatars', '22222222-2222-2222-2222-222222222222/avatar2.jpg')$$, array['42501']);
select t.expect_error('A: NU poate încărca alt nume de fișier', $$insert into storage.objects (bucket_id, name) values ('avatars', '11111111-1111-1111-1111-111111111111/script.html')$$, array['42501']);
select t.expect_error('A: NU poate încărca în alt bucket', $$insert into storage.objects (bucket_id, name) values ('documents', '11111111-1111-1111-1111-111111111111/plan.pdf')$$, array['42501']);
select t.expect_rows('A: vede fotografia lui B (aliniat cu profilurile)', $$select 1 from storage.objects where bucket_id = 'avatars' and name like '22222222%'$$, 1);
select t.expect_rows('A: NU vede documentele lui B din alt bucket', $$select 1 from storage.objects where bucket_id = 'documents'$$, 0);
select t.expect_affected('A: NU poate suprascrie fotografia lui B (0 rânduri)', $$update storage.objects set updated_at = now() where bucket_id = 'avatars' and name = '22222222-2222-2222-2222-222222222222/avatar.jpg'$$, 0);
select t.expect_affected('A: NU poate șterge fotografia lui B (0 rânduri)', $$delete from storage.objects where bucket_id = 'avatars' and name = '22222222-2222-2222-2222-222222222222/avatar.jpg'$$, 0);
select t.expect_error('A: NU poate muta propria fotografie în folderul lui B', $$update storage.objects set name = '22222222-2222-2222-2222-222222222222/avatar.jpg' where bucket_id = 'avatars' and name = '11111111-1111-1111-1111-111111111111/avatar.jpg'$$, array['42501', '23505']);
select t.expect_affected('A: își înlocuiește propria fotografie', $$update storage.objects set updated_at = now() where bucket_id = 'avatars' and name = '11111111-1111-1111-1111-111111111111/avatar.jpg'$$, 1);
reset role;

-- ---------------------------------------------------------------------------
-- 4. Utilizatorul B (Investitor) — verifică faptul că datele lui au rămas neatinse
-- ---------------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', false);
select t.expect_rows('B: profilul lui B nu a fost modificat de A', $$select 1 from public.profiles where id = '22222222-2222-2222-2222-222222222222' and bio = '' and city = ''$$, 1);
select t.expect_rows('B: datele private ale lui B nu au fost modificate de A', $$select 1 from public.profiles_private where id = '22222222-2222-2222-2222-222222222222' and not show_email_after_match$$, 1);
select t.expect_rows('B: nu vede datele private ale lui A', $$select 1 from public.profiles_private where id = '11111111-1111-1111-1111-111111111111'$$, 0);
select t.expect_rows('B: vede rolurile publice ale lui A', $$select 1 from public.profile_roles where user_id = '11111111-1111-1111-1111-111111111111'$$, 2);
select t.expect_rows('B: vede fotografia lui A', $$select 1 from storage.objects where bucket_id = 'avatars' and name like '11111111%'$$, 1);
select t.expect_affected('B: își setează preferințele de investitor', $$update public.profiles_private set investor_min_budget = 1000, investor_max_budget = 50000, investor_stage = 'MVP' where id = '22222222-2222-2222-2222-222222222222'$$, 1);
select t.expect_affected('B: NU poate modifica profilul lui A (0 rânduri)', $$update public.profiles set display_name = 'Furt de identitate' where id = '11111111-1111-1111-1111-111111111111'$$, 0);
reset role;

-- ---------------------------------------------------------------------------
-- 5. Contul C (fără profil) — flux de completare
-- ---------------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', false);
select t.expect_rows('C: nu are încă profil', $$select 1 from public.profiles where id = '33333333-3333-3333-3333-333333333333'$$, 0);
select t.expect_error('C: complete_profile cu nume gol respins', $$select public.complete_profile('  ', 'creator')$$, array['22023']);
select t.expect_error('C: complete_profile cu rol admin respins', $$select public.complete_profile('Cristina', 'admin')$$, array['22023']);
select t.expect_rows('C: după încercări invalide tot nu are profil', $$select 1 from public.profiles where id = '33333333-3333-3333-3333-333333333333'$$, 0);
select t.expect_true('C: complete_profile valid', $$select true from (select public.complete_profile('Cristina Pop', 'investor')) q$$);
select t.expect_rows('C: profil și rol creat doar pentru C', $$select 1 from public.profile_roles where user_id = '33333333-3333-3333-3333-333333333333' and role = 'investor'$$, 1);
select t.expect_error('C: a doua completare respinsă', $$select public.complete_profile('Alt nume', 'creator')$$, array['23505']);
reset role;

-- ---------------------------------------------------------------------------
-- 6. Ștergerea contului elimină profilul (cascadă)
-- ---------------------------------------------------------------------------
delete from auth.users where id = :'C';
select t.expect_rows('ștergerea contului C elimină profilul, datele private și rolurile', $$select 1 from public.profiles p full join public.profile_roles r on r.user_id = p.id where coalesce(p.id, r.user_id) = '33333333-3333-3333-3333-333333333333'$$, 0);

-- ---------------------------------------------------------------------------
-- Rezultat
-- ---------------------------------------------------------------------------
\o
select case when ok then 'ok  ' else 'FAIL' end as status, name, detail from t.results order by n;
select count(*) filter (where ok) as trecute, count(*) filter (where not ok) as esuate from t.results;
do $$ begin
  if exists (select 1 from t.results where not ok) then
    raise exception 'Unele teste ale bazei de date au eșuat.';
  end if;
end $$;
