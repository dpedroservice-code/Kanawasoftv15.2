-- Store the company logo in the private company media bucket.
alter table public.ks_companies add column if not exists logo_path text;
