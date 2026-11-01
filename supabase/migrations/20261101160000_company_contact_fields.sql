-- Preserve additional legal/contact fields collected during company onboarding.
alter table public.ks_companies add column if not exists phone text;
alter table public.ks_companies add column if not exists email text;
alter table public.ks_companies add column if not exists address text;

create or replace function private.ks_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_legal_name text;
  v_full_name text;
begin
  v_full_name := coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1));
  insert into public.ks_profiles(user_id, full_name, phone)
  values (new.id, v_full_name, nullif(new.raw_user_meta_data ->> 'phone', ''))
  on conflict (user_id) do nothing;
  v_legal_name := nullif(trim(new.raw_user_meta_data ->> 'company_legal_name'), '');
  if v_legal_name is not null then
    insert into public.ks_companies(legal_name, trade_name, tax_id, country_code, currency_code, tax_regime, phone, email, address, owner_user_id)
    values (
      v_legal_name,
      nullif(trim(new.raw_user_meta_data ->> 'company_trade_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'company_tax_id'), ''),
      coalesce(nullif(new.raw_user_meta_data ->> 'country_code',''), 'AO'),
      coalesce(nullif(new.raw_user_meta_data ->> 'currency_code',''), 'AOA'),
      coalesce(nullif(new.raw_user_meta_data ->> 'tax_regime',''), 'not_configured'),
      nullif(trim(new.raw_user_meta_data ->> 'company_phone'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'company_email'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'company_address'), ''),
      new.id
    ) returning id into v_company_id;
    insert into public.ks_company_memberships(company_id, user_id, role)
    values (v_company_id, new.id, 'owner') on conflict do nothing;
  end if;
  return new;
end;
$$;