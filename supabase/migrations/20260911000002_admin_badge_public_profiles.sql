-- Add admin/moderator flags to public_profiles view for badge display

DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles WITH (security_invoker = false) AS
SELECT
  p.id,
  p.username,
  p.display_name,
  p.bio,
  p.avatar_url,
  p.reputation,
  p.username_confirmed,
  p.verification_status,
  p.created_at,
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.id AND ur.role = 'admin'
  ) AS is_admin,
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.id AND ur.role IN ('admin', 'moderator')
  ) AS is_moderator
FROM profiles p;

GRANT SELECT ON public.public_profiles TO anon, authenticated;