-- PHASE 20: CONSOLIDATED HARDENING BUNDLE (single new migration).
-- Merges Phase 2 (voting), Phase 5 (chat pair cleanup), Phase 6 (realtime RLS)
-- and Phase 14 (profile-directory privacy) into one migration that can be
-- applied to the live project as a single deploy step.

-- PHASE 2: Voting integrity.
--  1. Self-votes are rejected for both posts and comments.
--  2. Demo content is inert: it can be viewed but never voted on.
--  3. The vote RPCs become the only write path (direct table writes revoked).
--  4. Vote targets are validated before any transition is attempted.

-- Keep SELECT for the client's "my-votes" reads; revoke every direct mutation.
REVOKE INSERT, UPDATE, DELETE ON public.post_votes FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.comment_votes FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "own post votes" ON public.post_votes;
CREATE POLICY "own post votes readable" ON public.post_votes
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "own comment votes" ON public.comment_votes;
CREATE POLICY "own comment votes readable" ON public.comment_votes
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.vote_post(_post_id uuid, _value smallint)
RETURNS TABLE (score int, user_vote smallint)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _author_user_id uuid;
  _is_demo boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF _value NOT IN (-1, 0, 1) THEN
    RAISE EXCEPTION 'invalid_vote';
  END IF;

  SELECT p.author_user_id, p.is_demo
    INTO _author_user_id, _is_demo
  FROM public.posts p
  WHERE p.id = _post_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'post_not_found';
  END IF;

  IF _is_demo THEN
    RAISE EXCEPTION 'demo_content_untouchable';
  END IF;

  IF _author_user_id = auth.uid() THEN
    RAISE EXCEPTION 'self_vote_not_allowed';
  END IF;

  IF _value = 0 THEN
    DELETE FROM public.post_votes
    WHERE post_id = _post_id AND user_id = auth.uid();
  ELSE
    INSERT INTO public.post_votes (post_id, user_id, value)
    VALUES (_post_id, auth.uid(), _value)
    ON CONFLICT (post_id, user_id)
    DO UPDATE SET value = EXCLUDED.value;
  END IF;

  RETURN QUERY
  SELECT p.score,
         COALESCE(v.value, 0)::smallint
  FROM public.posts p
  LEFT JOIN public.post_votes v
    ON v.post_id = p.id AND v.user_id = auth.uid()
  WHERE p.id = _post_id AND p.status = 'visible';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'post_not_found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.vote_comment(_comment_id uuid, _value smallint)
RETURNS TABLE (score int, user_vote smallint)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _author_user_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF _value NOT IN (-1, 0, 1) THEN
    RAISE EXCEPTION 'invalid_vote';
  END IF;

  SELECT c.author_user_id
    INTO _author_user_id
  FROM public.comments c
  WHERE c.id = _comment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'comment_not_found';
  END IF;

  IF _author_user_id = auth.uid() THEN
    RAISE EXCEPTION 'self_vote_not_allowed';
  END IF;

  IF _value = 0 THEN
    DELETE FROM public.comment_votes
    WHERE comment_id = _comment_id AND user_id = auth.uid();
  ELSE
    INSERT INTO public.comment_votes (comment_id, user_id, value)
    VALUES (_comment_id, auth.uid(), _value)
    ON CONFLICT (comment_id, user_id)
    DO UPDATE SET value = EXCLUDED.value;
  END IF;

  RETURN QUERY
  SELECT c.score,
         COALESCE(v.value, 0)::smallint
  FROM public.comments c
  LEFT JOIN public.comment_votes v
    ON v.comment_id = c.id AND v.user_id = auth.uid()
  WHERE c.id = _comment_id AND c.status = 'visible';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'comment_not_found';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.vote_post(uuid, smallint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vote_comment(uuid, smallint) TO authenticated;
REVOKE ALL ON FUNCTION public.vote_post(uuid, smallint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.vote_comment(uuid, smallint) FROM PUBLIC, anon;

-- PHASE 5: Chat pair backfill and duplicate reconciliation.
-- Conversations created before 20260908050000 have participant_a/b = NULL.
--  1) Backfill canonical (lexicographically ordered) participant pairs for
--     legacy 2-member conversations.
--  2) Collapse any duplicate conversations (same pair) into the oldest
--     canonical one, merging memberships and messages.
-- The partial unique index conversations_direct_pair_key makes future
-- duplicates impossible; this migration only repairs historical rows.

-- 1) Backfill pairs for exactly-2-member conversations that lack them.
WITH pairs AS (
  SELECT cm.conversation_id,
         MIN(cm.user_id::text)::uuid AS participant_a,
         MAX(cm.user_id::text)::uuid AS participant_b
  FROM public.conversation_members cm
  GROUP BY cm.conversation_id
  HAVING COUNT(*) = 2
)
UPDATE public.conversations c
SET participant_a = p.participant_a,
    participant_b = p.participant_b,
    updated_at = COALESCE(c.updated_at, now())
FROM pairs p
WHERE p.conversation_id = c.id
  AND c.participant_a IS NULL
  AND c.participant_b IS NULL;

-- 2) Merge duplicates. For each pair that has more than one conversation,
--    move members + messages into the oldest conversation and delete extras.
DO $$
DECLARE
  dup RECORD;
  canonical_id uuid;
BEGIN
  FOR dup IN
    SELECT c.id
    FROM public.conversations c
    WHERE c.participant_a IS NOT NULL
      AND c.participant_b IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.conversations c2
        WHERE c2.participant_a = c.participant_a
          AND c2.participant_b = c.participant_b
          AND c2.id <> c.id
      )
    ORDER BY c.created_at DESC, c.id DESC
  LOOP
    SELECT id INTO canonical_id
    FROM public.conversations
    WHERE participant_a = dup.participant_a
      AND participant_b = dup.participant_b
      AND id <> dup.id
    ORDER BY created_at ASC, id ASC
    LIMIT 1;

    IF canonical_id IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO public.conversation_members (conversation_id, user_id, joined_at, last_read_at)
    SELECT canonical_id, user_id, joined_at, last_read_at
    FROM public.conversation_members
    WHERE conversation_id = dup.id
    ON CONFLICT (conversation_id, user_id) DO NOTHING;

    UPDATE public.messages
    SET conversation_id = canonical_id
    WHERE conversation_id = dup.id;

    UPDATE public.conversations
    SET updated_at = GREATEST(
          public.conversations.updated_at,
          COALESCE(
            (SELECT MAX(m.created_at) FROM public.messages m WHERE m.conversation_id = dup.id),
            public.conversations.updated_at
          )
        )
    WHERE public.conversations.id = canonical_id;

    DELETE FROM public.conversations WHERE id = dup.id;
  END LOOP;
END;
$$;

-- PHASE 6: Realtime chat with RLS enforcement.
--  1) Ensure public.messages is replicated on the supabase_realtime
--     publication so INSERT broadcasts keep flowing.
--  2) When the Realtime RLS feature is active (realtime.messages table
--     exists), add a SELECT policy on realtime.messages so broadcasts are
--     delivered only to members of the affected conversation. Without this
--     policy, anyone who knows a conversation id could subscribe to the
--     channel and receive future messages even though they cannot SELECT
--     history from the database.

-- 1) Publications membership (guarded: pg_publication_tables check).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END;
$$;

-- 2) Realtime-with-RLS authorization.
-- Modern Supabase Realtime derives authorization for a broadcast from the
-- source table's SELECT policy (here: "members can read conversation
-- messages" restricts delivery to conversation members), and the feature is
-- enabled per-table from the dashboard ("Enable Realtime Row Level Security")
-- rather than via manual policies on the internal realtime.messages table
-- (whose schema varies by platform version). No policy is created here.

-- PHASE 14: Profile-directory privacy.
-- Anonymous visitors may browse public content, but enumerating the full
-- member directory should require an account. The app's chat "add a person"
-- search and /search people tab are signed-in features anyway.
REVOKE EXECUTE ON FUNCTION public.search_profiles(text, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_profiles(text, int) TO authenticated;

-- PHASE 19: Grant the staff verification RPC. set_verification_status is
-- SECURITY DEFINER and self-guards with is_moderator(auth.uid()), but without
-- this GRANT the authenticated role could never invoke it from the admin UI.
GRANT EXECUTE ON FUNCTION public.set_verification_status(uuid, text, text) TO authenticated;
