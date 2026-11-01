-- Private company media bucket with company membership and role-aware access.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ks-company-media',
  'ks-company-media',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists ks_company_media_select_member on storage.objects;
create policy ks_company_media_select_member on storage.objects
for select to authenticated
using (
  bucket_id = 'ks-company-media'
  and case
    when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then private.ks_is_company_member(((storage.foldername(name))[1])::uuid)
    else false
  end
);

drop policy if exists ks_company_media_insert_member on storage.objects;
create policy ks_company_media_insert_member on storage.objects
for insert to authenticated
with check (
  bucket_id = 'ks-company-media'
  and case
    when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then private.ks_has_company_role(((storage.foldername(name))[1])::uuid, array['owner','admin','manager','operator','cashier','accountant'])
    else false
  end
);

drop policy if exists ks_company_media_update_member on storage.objects;
create policy ks_company_media_update_member on storage.objects
for update to authenticated
using (
  bucket_id = 'ks-company-media'
  and case
    when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then private.ks_has_company_role(((storage.foldername(name))[1])::uuid, array['owner','admin','manager','operator','cashier','accountant'])
    else false
  end
)
with check (
  bucket_id = 'ks-company-media'
  and case
    when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then private.ks_has_company_role(((storage.foldername(name))[1])::uuid, array['owner','admin','manager','operator','cashier','accountant'])
    else false
  end
);

drop policy if exists ks_company_media_delete_admin on storage.objects;
create policy ks_company_media_delete_admin on storage.objects
for delete to authenticated
using (
  bucket_id = 'ks-company-media'
  and case
    when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then private.ks_has_company_role(((storage.foldername(name))[1])::uuid, array['owner','admin','manager'])
    else false
  end
);
