alter table public.ks_profiles add column if not exists email text;
update public.ks_profiles p set email = u.email from auth.users u where u.id = p.user_id and p.email is null;

drop policy if exists profile_read_company_admin on public.ks_profiles;
create policy profile_read_company_admin on public.ks_profiles for select to authenticated
using (user_id = (select auth.uid()) or exists (
  select 1 from public.ks_company_memberships m
  where m.user_id = ks_profiles.user_id and m.status in ('active','invited')
    and private.ks_has_company_role(m.company_id, array['owner','admin']::text[])
));

drop policy if exists membership_read_company_admin on public.ks_company_memberships;
create policy membership_read_company_admin on public.ks_company_memberships for select to authenticated
using (user_id = (select auth.uid()) or private.ks_has_company_role(company_id, array['owner','admin']::text[]));

create or replace function private.ks_handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_company_id uuid; v_legal_name text; v_full_name text;
begin
  v_full_name := coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1));
  insert into public.ks_profiles(user_id, full_name, phone, email)
  values (new.id, v_full_name, nullif(new.raw_user_meta_data ->> 'phone', ''), new.email)
  on conflict (user_id) do update set full_name = excluded.full_name, phone = excluded.phone, email = excluded.email;
  v_legal_name := nullif(trim(new.raw_user_meta_data ->> 'company_legal_name'), '');
  if v_legal_name is not null then
    insert into public.ks_companies(legal_name, trade_name, tax_id, country_code, currency_code, tax_regime, owner_user_id)
    values (v_legal_name, nullif(trim(new.raw_user_meta_data ->> 'company_trade_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'company_tax_id'), ''),
      coalesce(nullif(new.raw_user_meta_data ->> 'country_code',''), 'AO'),
      coalesce(nullif(new.raw_user_meta_data ->> 'currency_code',''), 'AOA'),
      coalesce(nullif(new.raw_user_meta_data ->> 'tax_regime',''), 'not_configured'), new.id)
    returning id into v_company_id;
    insert into public.ks_company_memberships(company_id, user_id, role)
    values (v_company_id, new.id, 'owner') on conflict do nothing;
  end if;
  return new;
end;
$$;

create or replace function private.ks_sync_auth_user_email()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email is distinct from old.email then update public.ks_profiles set email = new.email where user_id = new.id; end if;
  return new;
end;
$$;

create or replace function private.ks_activate_invited_memberships()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    update public.ks_company_memberships set status = 'active' where user_id = new.id and status = 'invited';
  end if;
  return new;
end;
$$;

revoke all on function private.ks_sync_auth_user_email() from public, anon, authenticated;
revoke all on function private.ks_activate_invited_memberships() from public, anon, authenticated;
drop trigger if exists ks_sync_auth_email on auth.users;
create trigger ks_sync_auth_email after update of email on auth.users for each row execute function private.ks_sync_auth_user_email();
drop trigger if exists ks_activate_invited_memberships on auth.users;
create trigger ks_activate_invited_memberships after update of email_confirmed_at on auth.users for each row execute function private.ks_activate_invited_memberships();
