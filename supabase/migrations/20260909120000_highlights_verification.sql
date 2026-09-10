-- Verification state and moderator-managed campus highlights.
-- Student-only writes are enforced here, not only in the client.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending'
  CHECK (verification_status IN ('pending', 'verified', 'rejected'));

-- Preserve access for accounts that already existed before verification was
-- introduced; new sign-ups remain pending until a moderator reviews them.
UPDATE public.profiles
SET verification_status = 'verified'
WHERE verification_status = 'pending'
  AND created_at < TIMESTAMPTZ '2026-09-09 12:00:00+00';

REVOKE SELECT ON public.profiles FROM anon;
CREATE OR REPLACE VIEW public.public_profiles AS
SELECT id, username, display_name, bio, avatar_url, reputation, username_confirmed, created_at
FROM public.profiles;
GRANT SELECT ON public.public_profiles TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_verified_student(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = _user_id AND verification_status = 'verified'
  );
$$;
REVOKE ALL ON FUNCTION public.is_verified_student(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_verified_student(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.prevent_unprivileged_verification_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status
     AND NOT public.is_moderator(auth.uid()) THEN
    RAISE EXCEPTION 'verification_status_is_moderator_only';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_verification_guard ON public.profiles;
CREATE TRIGGER profiles_verification_guard
  BEFORE UPDATE OF verification_status ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_unprivileged_verification_change();

DROP POLICY IF EXISTS "insert own posts" ON public.posts;
DROP POLICY IF EXISTS "verified students insert own posts" ON public.posts;
CREATE POLICY "verified students insert own posts" ON public.posts
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = author_user_id
    AND is_demo = false
    AND public.is_verified_student(auth.uid())
  );

DROP POLICY IF EXISTS "insert own comments" ON public.comments;
DROP POLICY IF EXISTS "verified students insert own comments" ON public.comments;
CREATE POLICY "verified students insert own comments" ON public.comments
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_user_id AND public.is_verified_student(auth.uid()));

DROP POLICY IF EXISTS "insert own activity" ON public.activities;
DROP POLICY IF EXISTS "verified students insert own activity" ON public.activities;
CREATE POLICY "verified students insert own activity" ON public.activities
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = creator_user_id
    AND is_demo = false
    AND public.is_verified_student(auth.uid())
  );

DROP POLICY IF EXISTS "insert own response" ON public.activity_responses;
DROP POLICY IF EXISTS "verified students insert own response" ON public.activity_responses;
CREATE POLICY "verified students insert own response" ON public.activity_responses
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_verified_student(auth.uid()));

DROP POLICY IF EXISTS "member can send messages to direct conversations" ON public.messages;
DROP POLICY IF EXISTS "verified students can send direct messages" ON public.messages;
CREATE POLICY "verified students can send direct messages" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.is_verified_student(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.conversation_members cm
      WHERE cm.conversation_id = messages.conversation_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.ensure_direct_conversation(_peer_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_id uuid;
  conversation_id uuid;
BEGIN
  IF NOT public.is_verified_student(auth.uid())
     OR NOT public.is_verified_student(_peer_id) THEN
    RAISE EXCEPTION 'verified_students_only';
  END IF;
  IF _peer_id IS NULL OR _peer_id = auth.uid() THEN
    RAISE EXCEPTION 'invalid_direct_recipient';
  END IF;

  SELECT c.id INTO existing_id
  FROM public.conversations c
  WHERE c.participant_a = LEAST(auth.uid(), _peer_id)
    AND c.participant_b = GREATEST(auth.uid(), _peer_id)
  LIMIT 1;
  IF existing_id IS NOT NULL THEN RETURN existing_id; END IF;

  INSERT INTO public.conversations (participant_a, participant_b)
  VALUES (LEAST(auth.uid(), _peer_id), GREATEST(auth.uid(), _peer_id))
  RETURNING id INTO conversation_id;

  INSERT INTO public.conversation_members (conversation_id, user_id)
  VALUES (conversation_id, auth.uid()), (conversation_id, _peer_id);
  RETURN conversation_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.ensure_direct_conversation(uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.college_highlights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 3 AND 160),
  description text NOT NULL CHECK (char_length(trim(description)) BETWEEN 3 AND 1000),
  image_url text,
  link_url text,
  priority int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at IS NULL OR expires_at > starts_at)
);
-- The table pre-existed in an older shape; CREATE TABLE IF NOT EXISTS is a
-- no-op, so bring the live table up to the intended schema instead.
ALTER TABLE public.college_highlights
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;
CREATE INDEX IF NOT EXISTS college_highlights_active_idx
  ON public.college_highlights (is_active, priority DESC, starts_at DESC);
GRANT SELECT ON public.college_highlights TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.college_highlights TO authenticated;
ALTER TABLE public.college_highlights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "active highlights are public" ON public.college_highlights;
DROP POLICY IF EXISTS "staff manage highlights" ON public.college_highlights;
DROP POLICY IF EXISTS "active highlights readable" ON public.college_highlights;
DROP POLICY IF EXISTS "moderators manage highlights" ON public.college_highlights;
CREATE POLICY "active highlights readable" ON public.college_highlights
  FOR SELECT TO anon, authenticated
  USING (is_active AND starts_at <= now() AND (expires_at IS NULL OR expires_at > now()));
CREATE POLICY "moderators manage highlights" ON public.college_highlights
  FOR ALL TO authenticated
  USING (public.is_moderator(auth.uid()))
  WITH CHECK (public.is_moderator(auth.uid()) AND created_by = auth.uid());

DROP TRIGGER IF EXISTS college_highlights_touch ON public.college_highlights;
CREATE TRIGGER college_highlights_touch
  BEFORE UPDATE ON public.college_highlights
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
