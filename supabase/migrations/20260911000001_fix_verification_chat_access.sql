-- Fix can_participate_verification_chat: LANGUAGE sql SECURITY DEFINER
-- functions don't properly resolve auth.uid() when called via RPC.
-- Convert to PL/pgSQL like other working RPCs (claim_verification_request, etc.)

create or replace function public.can_participate_verification_chat(_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  return exists (
    select 1 from public.verification_requests vr
    where vr.id = _request_id
      and vr.status in ('open', 'claimed')
      and (vr.user_id = auth.uid() or vr.claimed_by = auth.uid())
  );
end;
$$;

grant execute on function public.can_participate_verification_chat(uuid) to authenticated;
revoke all on function public.can_participate_verification_chat(uuid) from public, anon;