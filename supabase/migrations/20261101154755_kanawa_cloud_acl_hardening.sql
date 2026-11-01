-- Restrict direct Data API privileges for Kanawa tenant tables.
-- RLS remains the row-level authorization boundary; grants are the table-level boundary.
revoke all on table public.ks_profiles from anon, authenticated;
revoke all on table public.ks_companies from anon, authenticated;
revoke all on table public.ks_company_memberships from anon, authenticated;
revoke all on table public.ks_records from anon, authenticated;

grant usage on schema public to authenticated;
grant select, update on table public.ks_profiles to authenticated;
grant select, update on table public.ks_companies to authenticated;
grant select on table public.ks_company_memberships to authenticated;
grant select, insert, update, delete on table public.ks_records to authenticated;

revoke truncate, references, trigger on table public.ks_profiles from authenticated;
revoke truncate, references, trigger on table public.ks_companies from authenticated;
revoke truncate, references, trigger on table public.ks_company_memberships from authenticated;
revoke truncate, references, trigger on table public.ks_records from authenticated;
