-- Fix signup bootstrap with pgcrypto's installed schema explicitly qualified.
-- The function uses an empty search_path for SECURITY DEFINER safety.
create or replace function private.ks_bootstrap_company_license()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_license_id uuid;
  v_end timestamptz := now() + interval '14 days';
begin
  insert into public.ks_company_licenses(
    company_id, plan_code, license_key, status, starts_at, expires_at, grace_until
  )
  values (
    new.id,
    'starter',
    'KS-' || upper(encode(extensions.gen_random_bytes(8), 'hex')),
    'trial',
    now(),
    v_end,
    v_end + interval '5 days'
  )
  returning id into v_license_id;

  insert into public.ks_subscriptions(
    company_id, plan_code, billing_interval, status, currency, provider,
    current_period_start, current_period_end, grace_until, trial_ends_at,
    license_id, payment_method
  )
  values (
    new.id, 'starter', 'monthly', 'trialing',
    coalesce(new.currency_code, 'AOA'), 'manual',
    now(), v_end, v_end + interval '5 days', v_end,
    v_license_id, 'manual_transfer'
  );

  insert into public.ks_company_locales(company_id, locale, timezone, currency_code)
  values (
    new.id,
    case when new.country_code = 'AO' then 'pt-AO' else 'en-US' end,
    case when new.country_code = 'AO' then 'Africa/Luanda' else 'UTC' end,
    new.currency_code
  )
  on conflict (company_id) do nothing;

  insert into public.ks_map_provider_settings(company_id)
  values (new.id)
  on conflict (company_id) do nothing;

  return new;
end;
$function$;

revoke all on function private.ks_bootstrap_company_license() from public, anon, authenticated;
