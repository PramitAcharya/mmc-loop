-- Guests (anon) must be able to read the curated public projections (feed,
-- comments, activities, profiles) without any SELECT grant on the private
-- base tables. The public_* views are intentionally the only sanctioned read
-- path for anon; run them with the owner's privileges (non security_invoker)
-- so the base rows stay locked down while the public subset stays readable.

DO $$
DECLARE
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['public_posts', 'public_comments', 'public_activities', 'public_profiles', 'public_activity_comments'] LOOP
    IF to_regclass('public.' || v_name) IS NOT NULL THEN
      EXECUTE format('ALTER VIEW public.%s SET (security_invoker = false)', v_name);
    END IF;
  END LOOP;
END $$;

-- Re-state the public grants defensively (idempotent no-ops if already present).
GRANT SELECT ON public.public_posts TO anon, authenticated;
GRANT SELECT ON public.public_comments TO anon, authenticated;
GRANT SELECT ON public.public_activities TO anon, authenticated;
GRANT SELECT ON public.public_profiles TO anon, authenticated;
GRANT SELECT ON public.public_activity_comments TO anon, authenticated;