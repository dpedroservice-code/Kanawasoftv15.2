-- Suspended, expired and cancelled licenses must never be writable during an old grace window.
create or replace function private.ks_has_company_role(p_company_id uuid,p_allowed_roles text[])
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.ks_company_memberships m where m.company_id=p_company_id and m.user_id=(select auth.uid()) and m.status='active' and m.role=any(p_allowed_roles))
 and exists(select 1 from public.ks_company_licenses l where l.company_id=p_company_id
  and ((l.status in ('trial','active') and (l.expires_at is null or l.expires_at>=now() or (l.grace_until is not null and l.grace_until>=now())))
   or (l.status='past_due' and l.grace_until is not null and l.grace_until>=now())));
$$;
revoke all on function private.ks_has_company_role(uuid,text[]) from public,anon;
grant execute on function private.ks_has_company_role(uuid,text[]) to authenticated;