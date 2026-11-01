-- Ensure cloud record updates advance their ordering timestamp.
create or replace function private.ks_touch_record_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.ks_touch_record_updated_at() from public, anon, authenticated;
drop trigger if exists ks_records_touch_updated_at on public.ks_records;
create trigger ks_records_touch_updated_at
before update on public.ks_records
for each row execute function private.ks_touch_record_updated_at();
