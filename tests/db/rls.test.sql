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
-- 7. Profil Creator: intenții de participare, competențe, rol dorit, disponibilitate
-- ---------------------------------------------------------------------------
select t.expect_rows('participare: profilurile existente nu primesc intenții sau date automat', $$select 1 from public.profiles where wants_to_develop or wants_to_join or cardinality(skills) > 0 or cardinality(desired_roles) > 0 or weekly_hours is not null$$, 0);
select t.expect_true('participare: RLS rămâne activ pe profiles', $$select relrowsecurity from pg_class where oid = 'public.profiles'::regclass$$);

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
select t.expect_affected('A: doar „Vreau să mă alătur”, cu competențe, rol și ore', $$update public.profiles set wants_to_join = true, skills = array['Marketing', 'Analiză de date'], desired_roles = array['cofondator', 'team_leader'], weekly_hours = 10 where id = '11111111-1111-1111-1111-111111111111'$$, 1);
select t.expect_rows('A: datele de participare sunt salvate', $$select 1 from public.profiles where id = '11111111-1111-1111-1111-111111111111' and wants_to_join and not wants_to_develop and skills = array['Marketing', 'Analiză de date'] and desired_roles = array['cofondator', 'team_leader'] and weekly_hours = 10$$, 1);
select t.expect_affected('A: doar „Dezvolt un proiect” (fără proiect creat)', $$update public.profiles set wants_to_develop = true, wants_to_join = false where id = '11111111-1111-1111-1111-111111111111'$$, 1);
select t.expect_rows('A: debifarea intenției păstrează competențele, rolurile și orele', $$select 1 from public.profiles where id = '11111111-1111-1111-1111-111111111111' and wants_to_develop and not wants_to_join and cardinality(skills) = 2 and cardinality(desired_roles) = 2 and weekly_hours = 10$$, 1);
select t.expect_affected('A: ambele intenții', $$update public.profiles set wants_to_develop = true, wants_to_join = true where id = '11111111-1111-1111-1111-111111111111'$$, 1);
select t.expect_rows('A: rolurile de cont rămân Creator + Investitor (intențiile nu sunt roluri)', $$select 1 from public.profile_roles where user_id = '11111111-1111-1111-1111-111111111111'$$, 2);
select t.expect_affected('A: NU poate modifica participarea lui B (0 rânduri)', $$update public.profiles set wants_to_join = true, skills = array['Furt'], weekly_hours = 99 where id = '22222222-2222-2222-2222-222222222222'$$, 0);
select t.expect_error('A: rol dorit inexistent respins (ex. admin)', $$update public.profiles set desired_roles = array['admin'] where id = '11111111-1111-1111-1111-111111111111'$$, array['23514']);
select t.expect_error('A: ore 0 respinse', $$update public.profiles set weekly_hours = 0 where id = '11111111-1111-1111-1111-111111111111'$$, array['23514']);
select t.expect_error('A: peste 168 de ore respinse', $$update public.profiles set weekly_hours = 169 where id = '11111111-1111-1111-1111-111111111111'$$, array['23514']);
select t.expect_error('A: competență goală respinsă', $$update public.profiles set skills = array[' '] where id = '11111111-1111-1111-1111-111111111111'$$, array['23514']);
select t.expect_error('A: competență peste 40 de caractere respinsă', $$update public.profiles set skills = array[repeat('x', 41)] where id = '11111111-1111-1111-1111-111111111111'$$, array['23514']);
select t.expect_error('A: competențe duplicate respinse (fără diferență de majuscule)', $$update public.profiles set skills = array['Design', 'design'] where id = '11111111-1111-1111-1111-111111111111'$$, array['23514']);
select t.expect_error('A: peste 15 competențe respinse', $$update public.profiles set skills = (select array_agg('c' || g) from generate_series(1, 16) g) where id = '11111111-1111-1111-1111-111111111111'$$, array['23514']);
select t.expect_error('A: roluri dorite duplicate respinse', $$update public.profiles set desired_roles = array['cofondator', 'cofondator'] where id = '11111111-1111-1111-1111-111111111111'$$, array['23514']);
select t.expect_rows('A: valorile valide anterioare au rămas după încercările respinse', $$select 1 from public.profiles where id = '11111111-1111-1111-1111-111111111111' and weekly_hours = 10 and cardinality(skills) = 2$$, 1);
reset role;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', false);
select t.expect_rows('B: participarea lui B nu a fost modificată de A', $$select 1 from public.profiles where id = '22222222-2222-2222-2222-222222222222' and not wants_to_join and cardinality(skills) = 0 and weekly_hours is null$$, 1);
select t.expect_rows('B: vede participarea publică a lui A', $$select 1 from public.profiles where id = '11111111-1111-1111-1111-111111111111' and wants_to_join$$, 1);
select t.expect_affected('B: NU poate modifica participarea lui A (0 rânduri)', $$update public.profiles set wants_to_join = false where id = '11111111-1111-1111-1111-111111111111'$$, 0);
reset role;

set role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', false);
select t.expect_error('anon: NU vede datele de participare', $$select skills from public.profiles$$, array['42501']);
reset role;

-- ---------------------------------------------------------------------------
-- 8. Match · Descoperă oameni (public.discover_people)
-- ---------------------------------------------------------------------------
-- Conturi suplimentare (create și completate ca administrator, pentru a pregăti datele):
-- F: Creator, vrea să se alăture, competențe și rol, FĂRĂ ore (profil incomplet)
-- G: Creator, vrea să se alăture, fără competențe, roluri sau ore (profil incomplet)
-- H: doar Investitor, cu wants_to_join bifat (trebuie EXCLUS: nu are rolul Creator)
-- I: Creator care NU vrea să se alăture (trebuie EXCLUS)
\set F '66666666-6666-6666-6666-666666666666'
\set G '77777777-7777-7777-7777-777777777777'
\set H '88888888-8888-8888-8888-888888888888'
\set I '99999999-9999-9999-9999-999999999999'
insert into auth.users (id, email, raw_user_meta_data) values
  (:'F', 'f@test.invalid', '{"display_name":"Flavia Dev","initial_role":"creator"}'),
  (:'G', 'g@test.invalid', '{"display_name":"George Gol","initial_role":"creator"}'),
  (:'H', 'h@test.invalid', '{"display_name":"Horia Investitor","initial_role":"investor"}'),
  (:'I', 'i@test.invalid', '{"display_name":"Irina Solo","initial_role":"creator"}');
update public.profiles set wants_to_join = true, skills = array['Programare', 'Design'], desired_roles = array['membru_echipa'], weekly_hours = null, created_at = now() - interval '1 day' where id = :'F';
update public.profiles set wants_to_join = true, created_at = now() - interval '2 days' where id = :'G';
update public.profiles set wants_to_join = true, skills = array['Finanțe'], weekly_hours = 30 where id = :'H';
update public.profiles set wants_to_join = false, wants_to_develop = true, skills = array['Marketing'], weekly_hours = 40 where id = :'I';
update public.profiles set created_at = now() - interval '3 days' where id = '11111111-1111-1111-1111-111111111111';
-- Starea lui A din secțiunea 7: Creator (+Investitor), ambele intenții, Marketing + Analiză de date, cofondator + team_leader, 10 ore.

select t.expect_true('discover: funcția rulează cu drepturile apelantului (SECURITY INVOKER)', $$select not prosecdef from pg_proc where proname = 'discover_people'$$);
select t.expect_true('discover: anon nu o poate apela', $$select not has_function_privilege('anon', 'public.discover_people(text, text, integer, boolean, timestamptz, uuid, integer)', 'execute')$$);
select t.expect_true('discover: rezultatul nu conține câmpuri private (email, link, contact, buget)', $$select pg_get_function_result(oid) !~* '(email|link|show_|budget|investor_)' from pg_proc where proname = 'discover_people'$$);
select t.expect_true('discover: RLS rămâne activ pe profiles și profile_roles', $$select bool_and(relrowsecurity) from pg_class where oid in ('public.profiles'::regclass, 'public.profile_roles'::regclass)$$);

set role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', false);
select t.expect_error('discover: vizitatorul neautentificat este refuzat', $$select * from public.discover_people()$$, array['42501']);
reset role;

-- B (Investitor, nu vrea să se alăture) apelează: vede A, F, G; nu vede H (fără Creator), I (nu vrea), pe sine.
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', false);
select t.expect_rows('discover(B): A, F și G (inclusiv profiluri incomplete)', $$select 1 from public.discover_people() where id in ('11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-666666666666', '77777777-7777-7777-7777-777777777777')$$, 3);
select t.expect_rows('discover(B): doar acești trei (exclus: doar Investitor, Creator care nu vrea, propriul profil)', $$select 1 from public.discover_people()$$, 3);
select t.expect_rows('discover(B): A apare și dacă dezvoltă un proiect', $$select 1 from public.discover_people() where id = '11111111-1111-1111-1111-111111111111' and wants_to_develop$$, 1);
select t.expect_rows('discover(B): ordine stabilă (cele mai noi profiluri întâi)', $$select 1 from (select id, row_number() over () as n from public.discover_people()) q where (n = 1 and id = '66666666-6666-6666-6666-666666666666') or (n = 2 and id = '77777777-7777-7777-7777-777777777777') or (n = 3 and id = '11111111-1111-1111-1111-111111111111')$$, 3);
-- Filtre
select t.expect_rows('filtru competență: „market” găsește „Marketing” (fără diferență de majuscule)', $$select 1 from public.discover_people(p_skill => 'market') where id = '11111111-1111-1111-1111-111111111111'$$, 1);
select t.expect_rows('filtru competență: „market” nu găsește alte profiluri', $$select 1 from public.discover_people(p_skill => 'MARKET')$$, 1);
select t.expect_rows('filtru competență: diacritice, majuscule („ANALIZĂ”)', $$select 1 from public.discover_people(p_skill => 'ANALIZĂ')$$, 1);
select t.expect_rows('filtru competență: diacritice, minuscule („analiză”)', $$select 1 from public.discover_people(p_skill => 'analiză')$$, 1);
select t.expect_rows('filtru competență: fără diacritice („analiza” găsește „Analiză”)', $$select 1 from public.discover_people(p_skill => 'analiza de date')$$, 1);
select t.expect_rows('filtru competență: „%” este tratat ca text, nu ca „orice”', $$select 1 from public.discover_people(p_skill => '%')$$, 0);
select t.expect_rows('filtru competență: spațiile goale = fără filtru', $$select 1 from public.discover_people(p_skill => '   ')$$, 3);
select t.expect_rows('filtru rol: membru_echipa → F', $$select 1 from public.discover_people(p_role => 'membru_echipa') where id = '66666666-6666-6666-6666-666666666666'$$, 1);
select t.expect_rows('filtru rol: cofondator → doar A', $$select 1 from public.discover_people(p_role => 'cofondator')$$, 1);
select t.expect_rows('filtru rol necunoscut → niciun rezultat (fără eroare)', $$select 1 from public.discover_people(p_role => 'admin')$$, 0);
select t.expect_rows('filtru ore: minimum 5 → doar A (10 ore); orele necompletate nu sunt tratate ca 0', $$select 1 from public.discover_people(p_min_hours => 5)$$, 1);
select t.expect_rows('filtru ore: minimum 11 → nimeni (A are 10)', $$select 1 from public.discover_people(p_min_hours => 11)$$, 0);
select t.expect_rows('filtru ore + „include necompletate” → A, F, G', $$select 1 from public.discover_people(p_min_hours => 5, p_include_unknown_hours => true)$$, 3);
select t.expect_rows('filtre combinate: competență + rol + ore', $$select 1 from public.discover_people(p_skill => 'marketing', p_role => 'team_leader', p_min_hours => 10)$$, 1);
-- Paginare
select t.expect_rows('paginare: limita 2 → 2 rezultate', $$select 1 from public.discover_people(p_limit => 2)$$, 2);
select t.expect_rows('paginare: pagina următoare după cursor → restul, fără dubluri', $$select 1 from public.discover_people(p_limit => 2, p_after_created_at => (select created_at from public.profiles where id = '77777777-7777-7777-7777-777777777777'), p_after_id => '77777777-7777-7777-7777-777777777777') where id = '11111111-1111-1111-1111-111111111111'$$, 1);
select t.expect_rows('paginare: limita este plafonată (cerere 1000 → max. 50)', $$select 1 from public.discover_people(p_limit => 1000)$$, 3);
select t.expect_rows('paginare: limita minimă este 1', $$select 1 from public.discover_people(p_limit => 0)$$, 1);
reset role;

-- A apelează: nu se vede pe sine; vede F și G.
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
select t.expect_rows('discover(A): propriul profil este exclus', $$select 1 from public.discover_people() where id = '11111111-1111-1111-1111-111111111111'$$, 0);
select t.expect_rows('discover(A): vede F și G', $$select 1 from public.discover_people()$$, 2);
select t.expect_true('discover(A): funcția este doar de citire (STABLE, limbaj SQL)', $$select provolatile = 's' and prolang = (select oid from pg_language where lanname = 'sql') from pg_proc where proname = 'discover_people'$$);
select t.expect_affected('discover(A): datele lui F rămân protejate la modificare (0 rânduri)', $$update public.profiles set bio = 'x' where id = '66666666-6666-6666-6666-666666666666'$$, 0);
reset role;

-- ---------------------------------------------------------------------------
-- 9. Proiecte reale (ciorne private, proiecte publicate, date private)
-- ---------------------------------------------------------------------------
-- A: Creator (proprietar). F: alt Creator. B: doar Investitor. anon: vizitator.
select t.expect_true('proiecte: RLS activ pe projects și project_private', $$select bool_and(relrowsecurity) from pg_class where oid in ('public.projects'::regclass, 'public.project_private'::regclass)$$);
select t.expect_true('proiecte: anon nu are niciun drept pe tabele', $$select not has_table_privilege('anon', 'public.projects', 'select') and not has_table_privilege('anon', 'public.project_private', 'select')$$);
select t.expect_true('proiecte: utilizatorii nu pot scrie owner_id, investment_public, created_at, updated_at', $$select not has_column_privilege('authenticated', 'public.projects', 'owner_id', 'update') and not has_column_privilege('authenticated', 'public.projects', 'investment_public', 'update') and not has_column_privilege('authenticated', 'public.projects', 'investment_public', 'insert') and not has_column_privilege('authenticated', 'public.projects', 'created_at', 'update') and not has_column_privilege('authenticated', 'public.projects', 'owner_id', 'insert')$$);
select t.expect_true('proiecte: save_project și set_project_status rulează cu drepturile apelantului', $$select bool_and(not prosecdef) from pg_proc where proname in ('save_project', 'set_project_status')$$);
select t.expect_true('proiecte: fără coloane de contoare/statistici', $$select not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name in ('projects', 'project_private') and column_name ~ '(views|saves|matches|score|counter)')$$);

set role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', false);
select t.expect_error('anon: nu poate citi proiecte', 'select * from public.projects', array['42501']);
select t.expect_error('anon: nu poate salva proiecte', $$select * from public.save_project(null, null, 'draft', '{"title":"x"}', '{}')$$, array['42501']);
reset role;

-- B (doar Investitor) nu poate crea proiecte
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', false);
select t.expect_error('B (fără rol Creator): NU poate crea un proiect', $$select * from public.save_project(null, null, 'draft', '{"title":"Proiect B"}', '{}')$$, array['42501']);
reset role;

-- A creează o ciornă incompletă
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
select id as pa, updated_at as pa_ts from public.save_project(null, null, 'draft', '{"title":"Atelier verde"}', '{"monthly_revenue":"0","unknown_financials":["variable_costs"]}') \gset
select t.expect_rows('A: ciorna incompletă este salvată', $$select 1 from public.projects where id = '$$ || :'pa' || $$' and status = 'draft' and title = 'Atelier verde' and summary = ''$$, 1);
select t.expect_rows('A: datele private ale ciornei: 0, neestimat și necompletat distincte', $$select 1 from public.project_private where project_id = '$$ || :'pa' || $$' and monthly_revenue = 0 and fixed_costs is null and not ('fixed_costs' = any(unknown_financials)) and 'variable_costs' = any(unknown_financials) and variable_costs is null$$, 1);
select t.expect_error('A: publicarea ciornei incomplete este respinsă', $$select * from public.set_project_status('$$ || :'pa' || $$', '$$ || :'pa_ts' || $$', 'published')$$, array['23514']);
select t.expect_rows('A: după respingere proiectul rămâne ciornă', $$select 1 from public.projects where id = '$$ || :'pa' || $$' and status = 'draft'$$, 1);
reset role;

-- F (alt Creator) nu vede ciorna și nici datele private
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}', false);
select t.expect_rows('F: NU vede ciorna lui A', $$select 1 from public.projects where id = '$$ || :'pa' || $$'$$, 0);
select t.expect_rows('F: NU vede datele private ale ciornei', $$select 1 from public.project_private where project_id = '$$ || :'pa' || $$'$$, 0);
select t.expect_error('F: NU poate salva peste proiectul lui A', $$select * from public.save_project('$$ || :'pa' || $$', '$$ || :'pa_ts' || $$', 'draft', '{"title":"furat"}', '{}')$$, array['42501']);
reset role;

-- A publică varianta Remote / Online, fără investiție (doar colegi)
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
select t.expect_error('A: salvarea cu versiune veche este refuzată (editare simultană)', $$select * from public.save_project('$$ || :'pa' || $$', '2000-01-01T00:00:00Z', 'draft', '{"title":"Altă versiune"}', '{}')$$, array['PT409']);
select id as pa, updated_at as pa_ts from public.save_project(:'pa', :'pa_ts', 'published', '{"title":"Atelier verde","summary":"Mobilier din materiale reciclate.","industry":"Producție","stage":"in_dezvoltare","city":"","is_remote":true,"looking_for":["colegi","colegi"],"problem":"Deșeuri"}', '{"monthly_revenue":"0","investment_amount":"25000.50","plan_links":["https://exemplu.ro/plan"]}') \gset
select t.expect_rows('A: publicat cu „Remote / Online”, fără oraș', $$select 1 from public.projects where id = '$$ || :'pa' || $$' and status = 'published' and is_remote and city = '' and published_at is not null$$, 1);
select t.expect_rows('A: „ce caută” fără dubluri', $$select 1 from public.projects where id = '$$ || :'pa' || $$' and looking_for = array['colegi']$$, 1);
select t.expect_rows('A: fără căutare de investiție, suma NU este publică (dar rămâne salvată privat)', $$select 1 from public.projects p join public.project_private pp on pp.project_id = p.id where p.id = '$$ || :'pa' || $$' and p.investment_public is null and pp.investment_amount = 25000.50$$, 1);
reset role;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}', false);
select t.expect_rows('F: vede proiectul publicat', $$select 1 from public.projects where id = '$$ || :'pa' || $$' and status = 'published'$$, 1);
select t.expect_rows('F: NU vede finanțele și linkurile private ale proiectului publicat', $$select 1 from public.project_private where project_id = '$$ || :'pa' || $$'$$, 0);
select t.expect_affected('F: NU poate modifica proiectul publicat (0 rânduri)', $$update public.projects set title = 'Furat' where id = '$$ || :'pa' || $$'$$, 0);
select t.expect_error('F: NU poate schimba starea proiectului', $$select * from public.set_project_status('$$ || :'pa' || $$', '$$ || :'pa_ts' || $$', 'draft')$$, array['42501']);
select t.expect_affected('F: NU poate șterge proiectul (0 rânduri)', $$delete from public.projects where id = '$$ || :'pa' || $$'$$, 0);
select t.expect_error('F: NU poate scrie date private pentru proiectul lui A', $$insert into public.project_private (project_id) values ('$$ || :'pa' || $$')$$, array['42501', '23505']);
select t.expect_affected('F: NU poate modifica datele private ale lui A (0 rânduri)', $$update public.project_private set plan_links = '{}' where project_id = '$$ || :'pa' || $$'$$, 0);
reset role;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', false);
select t.expect_rows('B (Investitor): vede proiectul publicat', $$select 1 from public.projects where id = '$$ || :'pa' || $$'$$, 1);
reset role;

-- A: investiție, sumă necunoscută, retragere, ștergere, valori nepermise
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
select t.expect_error('A: NU poate schimba proprietarul', $$update public.projects set owner_id = '66666666-6666-6666-6666-666666666666' where id = '$$ || :'pa' || $$'$$, array['42501']);
select t.expect_error('A: NU poate scrie direct suma publică', $$update public.projects set investment_public = 1 where id = '$$ || :'pa' || $$'$$, array['42501']);
select t.expect_error('A: NU poate crea un proiect pentru alt proprietar', $$insert into public.projects (owner_id, title) values ('66666666-6666-6666-6666-666666666666', 'x')$$, array['42501']);
select t.expect_affected('A: NU poate șterge un proiect publicat (0 rânduri)', $$delete from public.projects where id = '$$ || :'pa' || $$'$$, 0);
select id as pa, updated_at as pa_ts from public.save_project(:'pa', :'pa_ts', 'published', '{"title":"Atelier verde","summary":"Mobilier din materiale reciclate.","industry":"Producție","stage":"in_dezvoltare","is_remote":true,"looking_for":["investitie","colegi"]}', '{"investment_amount":"25000.50"}') \gset
select t.expect_rows('A: caută investiție cu sumă estimată → suma este publică', $$select 1 from public.projects where id = '$$ || :'pa' || $$' and investment_public = 25000.50 and looking_for = array['colegi', 'investitie']$$, 1);
select id as pa, updated_at as pa_ts from public.save_project(:'pa', :'pa_ts', 'published', '{"title":"Atelier verde","summary":"Mobilier din materiale reciclate.","industry":"Producție","stage":"in_dezvoltare","is_remote":true,"looking_for":["investitie"]}', '{"investment_amount":"25000.50","unknown_financials":["investment_amount"]}') \gset
select t.expect_rows('A: investiție „de stabilit” (neestimată) → publicarea este permisă, suma nu este publică', $$select 1 from public.projects p join public.project_private pp on pp.project_id = p.id where p.id = '$$ || :'pa' || $$' and p.status = 'published' and p.investment_public is null and pp.investment_amount = 25000.50$$, 1);
select id as pa, updated_at as pa_ts from public.save_project(:'pa', :'pa_ts', 'published', '{"title":"Atelier verde","summary":"Mobilier din materiale reciclate.","industry":"Producție","stage":"in_dezvoltare","is_remote":true,"looking_for":["investitie"]}', '{}') \gset
select t.expect_rows('A: investiție fără sumă (necompletată) → publicarea este permisă', $$select 1 from public.projects where id = '$$ || :'pa' || $$' and status = 'published' and investment_public is null$$, 1);
select t.expect_error('A: mai mult de 2 zecimale respins', $$select * from public.save_project('$$ || :'pa' || $$', '$$ || :'pa_ts' || $$', 'published', '{"title":"Atelier verde","summary":"S","industry":"Producție","stage":"idee","is_remote":true,"looking_for":["colegi"]}', '{"unit_price":"1.234"}')$$, array['23514']);
select t.expect_rows('A: salvarea respinsă nu a modificat nimic (salvare atomică)', $$select 1 from public.projects where id = '$$ || :'pa' || $$' and stage = 'in_dezvoltare' and looking_for = array['investitie']$$, 1);
select t.expect_error('A: sumă negativă respinsă', $$select * from public.save_project('$$ || :'pa' || $$', '$$ || :'pa_ts' || $$', 'published', '{"title":"Atelier verde","summary":"S","industry":"Producție","stage":"idee","is_remote":true,"looking_for":["colegi"]}', '{"fixed_costs":"-1"}')$$, array['23514']);
select t.expect_error('A: link nepermis respins', $$select * from public.save_project('$$ || :'pa' || $$', '$$ || :'pa_ts' || $$', 'published', '{"title":"Atelier verde","summary":"S","industry":"Producție","stage":"idee","is_remote":true,"looking_for":["colegi"]}', '{"plan_links":["javascript:alert(1)"]}')$$, array['23514']);
select t.expect_error('A: stadiu nepermis respins', $$select * from public.save_project('$$ || :'pa' || $$', '$$ || :'pa_ts' || $$', 'draft', '{"stage":"MVP"}', '{}')$$, array['23514']);
select t.expect_error('A: „ce caută” nepermis respins', $$select * from public.save_project('$$ || :'pa' || $$', '$$ || :'pa_ts' || $$', 'draft', '{"looking_for":["admin"]}', '{}')$$, array['23514']);
select t.expect_error('A: publicare fără „ce caută” respinsă', $$select * from public.save_project('$$ || :'pa' || $$', '$$ || :'pa_ts' || $$', 'published', '{"title":"T","summary":"S","industry":"Producție","stage":"idee","is_remote":true,"looking_for":[]}', '{}')$$, array['23514']);
select t.expect_error('A: publicare fără oraș și fără Remote respinsă', $$select * from public.save_project('$$ || :'pa' || $$', '$$ || :'pa_ts' || $$', 'published', '{"title":"T","summary":"S","industry":"Producție","stage":"idee","city":"  ","is_remote":false,"looking_for":["colegi"]}', '{}')$$, array['23514']);
select t.expect_rows('A: publicare cu oraș (fără Remote) permisă', $$select 1 from public.save_project('$$ || :'pa' || $$', '$$ || :'pa_ts' || $$', 'published', '{"title":"Atelier verde","summary":"Mobilier.","industry":"Producție","stage":"lansat","city":"Cluj","is_remote":false,"looking_for":["parteneri"]}', '{"investment_amount":"25000.50"}')$$, 1);
select updated_at as pa_ts from public.projects where id = :'pa' \gset
select t.expect_rows('A: retragerea din publicare → ciornă, fără pierderea datelor', $$select 1 from public.set_project_status('$$ || :'pa' || $$', '$$ || :'pa_ts' || $$', 'draft') r join public.project_private pp on pp.project_id = r.id where r.status = 'draft' and pp.investment_amount = 25000.50$$, 1);
reset role;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}', false);
select t.expect_rows('F: proiectul retras nu mai este vizibil', $$select 1 from public.projects where id = '$$ || :'pa' || $$'$$, 0);
reset role;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
select t.expect_affected('A: ștergerea definitivă a ciornei proprii', $$delete from public.projects where id = '$$ || :'pa' || $$'$$, 1);
select t.expect_rows('A: datele private ale proiectului șters au dispărut', $$select 1 from public.project_private where project_id = '$$ || :'pa' || $$'$$, 0);
-- Limita de 20 de proiecte pe cont
select t.expect_error('A: limita de 20 de proiecte (al 21-lea refuzat)', $q$do $x$ begin for i in 1..25 loop perform public.save_project(null, null, 'draft', '{}', '{}'); end loop; end $x$$q$, array['PT422']);
select t.expect_rows('A: după încercare, fără proiecte create (tranzacția anulată)', 'select 1 from public.projects where owner_id = auth.uid()', 0);
select t.expect_true('A: exact 20 de proiecte permise', $$select count(*) = 20 from (select public.save_project(null, null, 'draft', '{}', '{}') from generate_series(1, 20)) q$$);
select t.expect_error('A: al 21-lea proiect este refuzat', $$select * from public.save_project(null, null, 'draft', '{}', '{}')$$, array['PT422']);
reset role;

-- ---------------------------------------------------------------------------
-- 10. Descoperă proiecte (public.discover_projects)
-- ---------------------------------------------------------------------------
-- Proiecte pregătite ca administrator (F, G și I sunt Creatori; A are 20 de ciorne din secțiunea 9).
insert into public.projects (id, owner_id, status, title, summary, industry, stage, city, is_remote, looking_for) values
  ('a0000000-0000-4000-8000-000000000001', :'F', 'published', 'Cafenea de cartier', 'Cafenea cu specific local și evenimente.', 'Retail', 'idee', 'Cluj-Napoca', false, array['colegi']),
  ('a0000000-0000-4000-8000-000000000002', :'F', 'published', 'Platformă educațională', 'Cursuri online pentru liceeni.', 'IT & Tech', 'in_dezvoltare', '', true, array['investitie', 'colegi']),
  ('a0000000-0000-4000-8000-000000000003', :'G', 'published', 'Atelier de mobilier', 'Mobilier din lemn reciclat.', 'Producție', 'lansat', 'Iași', true, array['investitie']),
  ('a0000000-0000-4000-8000-000000000004', :'G', 'published', 'Grădină urbană', 'Legume pe acoperișuri.', 'Agricultură', 'idee', 'Brașov', false, array['investitie']),
  ('a0000000-0000-4000-8000-000000000005', :'F', 'draft', 'Ciornă ascunsă', 'Nu trebuie să apară.', 'Retail', 'idee', 'Cluj', false, array['colegi']),
  ('a0000000-0000-4000-8000-000000000006', :'I', 'published', 'Proiect al lui I', 'Caută parteneri.', 'Servicii', 'idee', 'Timișoara', false, array['parteneri']);
insert into public.project_private (project_id, investment_amount, unknown_financials, monthly_revenue, plan_links) values
  ('a0000000-0000-4000-8000-000000000001', 9999, '{}', 123, array['https://secret.example/1']),
  ('a0000000-0000-4000-8000-000000000002', 50000, '{}', 456, '{}'),
  ('a0000000-0000-4000-8000-000000000003', 70000, array['investment_amount'], null, '{}'),
  ('a0000000-0000-4000-8000-000000000004', 0, '{}', null, '{}'),
  ('a0000000-0000-4000-8000-000000000005', 100, '{}', null, '{}'),
  ('a0000000-0000-4000-8000-000000000006', null, '{}', null, '{}');
update public.projects set published_at = case id
  when 'a0000000-0000-4000-8000-000000000001' then '2026-11-20T10:00:00Z'::timestamptz
  when 'a0000000-0000-4000-8000-000000000002' then '2026-11-21T10:00:00Z'::timestamptz
  when 'a0000000-0000-4000-8000-000000000003' then '2026-11-22T10:00:00Z'::timestamptz
  when 'a0000000-0000-4000-8000-000000000004' then '2026-11-19T10:00:00Z'::timestamptz
  when 'a0000000-0000-4000-8000-000000000006' then '2026-11-18T10:00:00Z'::timestamptz else published_at end
 where id::text like 'a0000000-%';

select t.expect_true('discover_projects: rulează cu drepturile apelantului și doar citește', $$select not prosecdef and provolatile = 's' from pg_proc where proname = 'discover_projects'$$);
select t.expect_true('discover_projects: anon nu o poate apela', $$select not has_function_privilege('anon', 'public.discover_projects(text, text[], text, text, text, boolean, numeric, boolean, timestamptz, uuid, integer)', 'execute')$$);
select t.expect_true('discover_projects: rezultatul nu conține câmpuri private', $$select pg_get_function_result(oid) !~* '(investment_amount|monthly_revenue|fixed_costs|variable_costs|initial_investment|unit_price|unit_cost|unknown_financials|plan_links|email|link)' from pg_proc where proname = 'discover_projects'$$);
select t.expect_true('discover_projects: suma 0 rămâne 0 (nu devine necunoscută)', $$select investment_public = 0 from public.projects where id = 'a0000000-0000-4000-8000-000000000004'$$);

set role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', false);
select t.expect_error('discover_projects: vizitatorul este refuzat', 'select * from public.discover_projects()', array['42501']);
reset role;

-- B (Investitor, fără proiecte proprii)
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', false);
select t.expect_rows('B: vede doar proiectele publicate (fără ciorne, inclusiv cele 20 ale lui A)', 'select 1 from public.discover_projects(p_limit => 50)', 5);
select t.expect_rows('B: ciorna lui F nu apare', $$select 1 from public.discover_projects(p_limit => 50) where id = 'a0000000-0000-4000-8000-000000000005'$$, 0);
select t.expect_rows('B: ordinea — cele mai recent publicate întâi', $$select 1 from (select id, row_number() over () n from public.discover_projects()) q where (n = 1 and id = 'a0000000-0000-4000-8000-000000000003') or (n = 2 and id = 'a0000000-0000-4000-8000-000000000002') or (n = 3 and id = 'a0000000-0000-4000-8000-000000000001') or (n = 4 and id = 'a0000000-0000-4000-8000-000000000004') or (n = 5 and id = 'a0000000-0000-4000-8000-000000000006')$$, 5);
select t.expect_rows('B: numele proprietarului este inclus', $$select 1 from public.discover_projects() where id = 'a0000000-0000-4000-8000-000000000001' and owner_name = 'Flavia Dev'$$, 1);
select t.expect_rows('B: investiția publică doar la proiectele care caută investiție', $$select 1 from public.discover_projects() where investment_public is not null and not ('investitie' = any (looking_for))$$, 0);
select t.expect_rows('text: „CAFENEA” (majuscule)', $$select 1 from public.discover_projects(p_search => 'CAFENEA')$$, 1);
select t.expect_rows('text: fără diacritice („gradina” găsește „Grădină”)', $$select 1 from public.discover_projects(p_search => 'gradina urbana')$$, 1);
select t.expect_rows('text: caută și în descriere („liceeni”)', $$select 1 from public.discover_projects(p_search => 'liceeni')$$, 1);
select t.expect_rows('text: „%” este tratat ca text', $$select 1 from public.discover_projects(p_search => '%')$$, 0);
select t.expect_rows('ce caută: Colegi → 2', $$select 1 from public.discover_projects(p_looking_for => array['colegi'])$$, 2);
select t.expect_rows('ce caută: Investiție → 3', $$select 1 from public.discover_projects(p_looking_for => array['investitie'])$$, 3);
select t.expect_rows('ce caută: Colegi sau Parteneri → 3', $$select 1 from public.discover_projects(p_looking_for => array['colegi', 'parteneri'])$$, 3);
select t.expect_rows('ce caută: listă goală = fără filtru', $$select 1 from public.discover_projects(p_looking_for => '{}')$$, 5);
select t.expect_rows('industrie: Retail → 1', $$select 1 from public.discover_projects(p_industry => 'Retail')$$, 1);
select t.expect_rows('stadiu: Deja lansat → 1', $$select 1 from public.discover_projects(p_stage => 'lansat')$$, 1);
select t.expect_rows('stadiu necunoscut → niciun rezultat, fără eroare', $$select 1 from public.discover_projects(p_stage => 'MVP')$$, 0);
select t.expect_rows('oraș „cluj”, fără Remote → 1', $$select 1 from public.discover_projects(p_city => 'cluj', p_include_remote => false)$$, 1);
select t.expect_rows('oraș „cluj”, cu Remote → 3 (Cluj + cele două Remote)', $$select 1 from public.discover_projects(p_city => 'cluj', p_include_remote => true)$$, 3);
select t.expect_rows('oraș „iasi” (fără diacritice), fără Remote → 1', $$select 1 from public.discover_projects(p_city => 'iasi', p_include_remote => false)$$, 1);
select t.expect_rows('plafon 50000: doar proiecte care caută investiție, sume ≤ plafon; „de stabilit” exclus implicit → 2', $$select 1 from public.discover_projects(p_max_investment => 50000) where id in ('a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000004')$$, 2);
select t.expect_rows('plafon 50000: nimic în plus (fără „de stabilit”, fără proiecte care nu caută investiție)', $$select 1 from public.discover_projects(p_max_investment => 50000)$$, 2);
select t.expect_rows('plafon 50000 + „include de stabilit” → 3', $$select 1 from public.discover_projects(p_max_investment => 50000, p_include_unknown_investment => true)$$, 3);
select t.expect_rows('plafon 49999 → doar suma 0', $$select 1 from public.discover_projects(p_max_investment => 49999) where investment_public = 0$$, 1);
select t.expect_rows('plafon 0 → proiectul cu 0 EUR (0 nu este tratat ca necunoscut)', $$select 1 from public.discover_projects(p_max_investment => 0)$$, 1);
select t.expect_rows('fără plafon, „de stabilit” apare normal', $$select 1 from public.discover_projects(p_looking_for => array['investitie']) where investment_public is null$$, 1);
select t.expect_rows('„include de stabilit” fără plafon nu schimbă nimic', $$select 1 from public.discover_projects(p_include_unknown_investment => true)$$, 5);
select t.expect_rows('paginare: limita 2', $$select 1 from public.discover_projects(p_limit => 2)$$, 2);
select t.expect_rows('paginare: pagina următoare continuă fără dubluri', $$select 1 from public.discover_projects(p_limit => 2, p_after_published_at => '2026-11-21T10:00:00Z', p_after_id => 'a0000000-0000-4000-8000-000000000002') where id in ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004')$$, 2);
select t.expect_rows('paginare: limita este plafonată la 50 și minimum 1', $$select 1 from public.discover_projects(p_limit => 0)$$, 1);
reset role;

-- F (Creator, proprietar a 2 proiecte publicate și o ciornă): propriile proiecte sunt excluse
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}', false);
select t.expect_rows('F: își vede ciorna prin RLS (comportament corect)', $$select 1 from public.projects where id = 'a0000000-0000-4000-8000-000000000005'$$, 1);
select t.expect_rows('F: propriile proiecte (publicate și ciornă) NU apar în descoperire', $$select 1 from public.discover_projects(p_limit => 50) where owner_id = '66666666-6666-6666-6666-666666666666'$$, 0);
select t.expect_rows('F: vede proiectele publicate ale altora (G și I)', 'select 1 from public.discover_projects(p_limit => 50)', 3);
reset role;

-- A (Creator cu 20 de ciorne, fără proiecte publicate): poate explora
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
select t.expect_rows('A: Creator fără proiecte publicate poate explora (5 ale altora)', 'select 1 from public.discover_projects(p_limit => 50)', 5);
reset role;

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
