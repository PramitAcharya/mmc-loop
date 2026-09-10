-- Post-migration fixes: restore EXECUTE on the image-visibility helper used by
-- storage policies, and make sure the post-images bucket exists in the first
-- place (it was only ever referenced by policies, never created).

-- The storage policies below run the policy expression as the requesting role
-- (anon / authenticated). can_view_post_image is SECURITY DEFINER but had its
-- EXECUTE revoked from everyone, so policy evaluation silently failed for
-- signed URLs. Restore execution for both public roles.
GRANT EXECUTE ON FUNCTION public.can_view_post_image(text) TO anon, authenticated;

-- Create the post-images bucket if it does not exist. Kept private (no public
-- GET); access flows through policy-checked signed URLs. 3 MB cap mirrors the
-- client-side MAX_IMAGE_BYTES guard.
INSERT INTO storage.buckets (id, name, owner, public, file_size_limit, allowed_mime_types)
SELECT
  'post-images',
  'post-images',
  NULL,
  false,
  3145728,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']::text[]
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'post-images');