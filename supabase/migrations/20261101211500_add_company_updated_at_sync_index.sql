-- Supports incremental company-scoped sync by updated_at.
create index if not exists ks_records_company_updated_idx
  on public.ks_records (company_id, updated_at desc);
