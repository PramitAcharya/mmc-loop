-- Harden the MVP invariants that cannot be enforced by the client.

-- Profiles may only be edited through the profile fields exposed by the app.
CREATE OR REPLACE FUNCTION public.guard_profile_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR (NEW.reputation IS DISTINCT FROM OLD.reputation
         AND COALESCE(current_setting('app.profile_system_update', true), '') <> 'on')
     OR (NEW.username_confirmed IS DISTINCT FROM OLD.username_confirmed
         AND COALESCE(current_setting('app.allow_username_change', true), '') <> 'on') THEN
    RAISE EXCEPTION 'profile_system_fields_are_read_only';
  END IF;
  IF NEW.username IS DISTINCT FROM OLD.username
     AND COALESCE(current_setting('app.allow_username_change', true), '') <> 'on' THEN
    RAISE EXCEPTION 'use_set_my_username';
  END IF;
  IF char_length(COALESCE(NEW.display_name, '')) > 40 THEN
    RAISE EXCEPTION 'display_name_too_long';
  END IF;
  IF char_length(COALESCE(NEW.bio, '')) > 200 THEN
    RAISE EXCEPTION 'bio_too_long';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_field_guard ON public.profiles;
CREATE TRIGGER profiles_field_guard
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_fields();

CREATE OR REPLACE FUNCTION public.sync_post_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE pid uuid;
BEGIN
  pid := COALESCE(NEW.post_id, OLD.post_id);
  UPDATE public.posts
  SET score = COALESCE((SELECT SUM(value)::int FROM public.post_votes WHERE post_id = pid), 0)
  WHERE id = pid;
  PERFORM set_config('app.profile_system_update', 'on', true);
  UPDATE public.profiles pr
  SET reputation = COALESCE((
    SELECT SUM(p.score)::int FROM public.posts p WHERE p.author_user_id = pr.id
  ), 0)
  WHERE pr.id = (SELECT author_user_id FROM public.posts WHERE id = pid);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_my_username(_username text)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _username !~ '^[A-Za-z0-9][A-Za-z0-9_]{1,18}[A-Za-z0-9]$' THEN
    RAISE EXCEPTION 'username_invalid';
  END IF;
  IF EXISTS (SELECT 1 FROM public.reserved_usernames WHERE name = lower(_username)) THEN
    RAISE EXCEPTION 'username_reserved';
  END IF;
  PERFORM set_config('app.allow_username_change', 'on', true);
  BEGIN
    UPDATE public.profiles
    SET username = lower(_username), username_confirmed = true
    WHERE id = uid;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'username_taken';
  END;
  RETURN lower(_username);
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_my_username(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_my_profile(
  _display_name text DEFAULT NULL,
  _bio text DEFAULT NULL,
  _avatar_url text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _display_name IS NOT NULL AND char_length(_display_name) > 40 THEN
    RAISE EXCEPTION 'display_name_too_long';
  END IF;
  IF _bio IS NOT NULL AND char_length(_bio) > 200 THEN
    RAISE EXCEPTION 'bio_too_long';
  END IF;
  UPDATE public.profiles
  SET display_name = NULLIF(trim(_display_name), ''),
      bio = NULLIF(trim(_bio), ''),
      avatar_url = NULLIF(trim(_avatar_url), '')
  WHERE id = auth.uid();
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_my_profile(text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.guard_profile_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_post_score() FROM PUBLIC, anon, authenticated;

-- A comment reply is exactly one level deep and must belong to the same post.
CREATE OR REPLACE FUNCTION public.validate_comment_parent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE parent_post uuid;
DECLARE parent_parent uuid;
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    SELECT post_id, parent_id INTO parent_post, parent_parent
    FROM public.comments WHERE id = NEW.parent_id;
    IF parent_post IS NULL OR parent_post IS DISTINCT FROM NEW.post_id THEN
      RAISE EXCEPTION 'comment_parent_post_mismatch';
    END IF;
    IF parent_parent IS NOT NULL THEN
      RAISE EXCEPTION 'comment_replies_are_one_level';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS comments_parent_guard ON public.comments;
CREATE TRIGGER comments_parent_guard
BEFORE INSERT OR UPDATE OF post_id, parent_id ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.validate_comment_parent();
REVOKE ALL ON FUNCTION public.validate_comment_parent() FROM PUBLIC, anon, authenticated;

-- Comment counts represent visible comments, including status changes.
CREATE OR REPLACE FUNCTION public.recount_post_comments(_post_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.posts
  SET comment_count = (
    SELECT count(*)::int FROM public.comments
    WHERE post_id = _post_id AND status = 'visible'
  )
  WHERE id = _post_id;
$$;

CREATE OR REPLACE FUNCTION public.sync_comment_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recount_post_comments(COALESCE(NEW.post_id, OLD.post_id));
  IF TG_OP = 'UPDATE' AND NEW.post_id IS DISTINCT FROM OLD.post_id THEN
    PERFORM public.recount_post_comments(OLD.post_id);
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS comments_count_trg ON public.comments;
CREATE TRIGGER comments_count_trg
AFTER INSERT OR UPDATE OF post_id, status OR DELETE ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.sync_comment_count();
REVOKE ALL ON FUNCTION public.recount_post_comments(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_comment_count() FROM PUBLIC, anon, authenticated;

-- Never expose comments belonging to hidden/removed posts.
DROP VIEW IF EXISTS public.public_posts;
CREATE VIEW public.public_posts AS
SELECT p.id, p.title, p.body, p.category_id, c.slug AS category_slug, c.name AS category_name,
       c.emoji AS category_emoji, p.image_url, p.is_anonymous, p.is_demo, p.score,
       p.comment_count, p.created_at, p.updated_at,
       CASE WHEN p.is_anonymous THEN NULL ELSE p.author_user_id END AS author_id,
       CASE WHEN p.is_anonymous THEN NULL ELSE pr.username END AS author_username,
       CASE WHEN p.is_anonymous THEN NULL ELSE pr.avatar_url END AS author_avatar_url,
       (p.author_user_id = auth.uid()) AS is_owner
FROM public.posts p
JOIN public.categories c ON c.id = p.category_id
LEFT JOIN public.profiles pr ON pr.id = p.author_user_id
WHERE p.status = 'visible';
GRANT SELECT ON public.public_posts TO anon, authenticated;

DROP VIEW IF EXISTS public.public_comments;
CREATE VIEW public.public_comments AS
SELECT cm.id, cm.post_id, cm.parent_id, cm.body, cm.is_anonymous, cm.score,
       cm.created_at, cm.updated_at,
       CASE WHEN cm.is_anonymous THEN NULL ELSE cm.author_user_id END AS author_id,
       CASE WHEN cm.is_anonymous THEN NULL ELSE pr.username END AS author_username,
       CASE WHEN cm.is_anonymous THEN NULL ELSE pr.avatar_url END AS author_avatar_url,
       (cm.author_user_id = auth.uid()) AS is_owner
FROM public.comments cm
JOIN public.posts p ON p.id = cm.post_id AND p.status = 'visible'
LEFT JOIN public.profiles pr ON pr.id = cm.author_user_id
WHERE cm.status = 'visible';
GRANT SELECT ON public.public_comments TO anon, authenticated;

UPDATE public.posts p
SET score = COALESCE((SELECT SUM(value)::int FROM public.post_votes v WHERE v.post_id = p.id), 0),
    comment_count = COALESCE((
      SELECT count(*)::int FROM public.comments c
      WHERE c.post_id = p.id AND c.status = 'visible'
    ), 0);
UPDATE public.profiles pr
SET reputation = COALESCE((SELECT SUM(p.score)::int FROM public.posts p
                           WHERE p.author_user_id = pr.id), 0);

-- Reports must point to a real target; accepting arbitrary UUIDs creates
-- moderation queue entries that cannot be acted on.
CREATE OR REPLACE FUNCTION public.validate_report_target()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.target_type = 'post' THEN
    IF NOT EXISTS (SELECT 1 FROM public.posts WHERE id = NEW.target_id) THEN
      RAISE EXCEPTION 'report_target_not_found';
    END IF;
  ELSIF NEW.target_type = 'comment' THEN
    IF NOT EXISTS (SELECT 1 FROM public.comments WHERE id = NEW.target_id) THEN
      RAISE EXCEPTION 'report_target_not_found';
    END IF;
  ELSE
    RAISE EXCEPTION 'report_target_invalid';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS reports_target_guard ON public.reports;
CREATE TRIGGER reports_target_guard
BEFORE INSERT OR UPDATE OF target_type, target_id ON public.reports
FOR EACH ROW EXECUTE FUNCTION public.validate_report_target();
REVOKE ALL ON FUNCTION public.validate_report_target() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.remove_target_reports()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.reports
  WHERE target_type = TG_ARGV[0] AND target_id = OLD.id;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS posts_remove_reports ON public.posts;
CREATE TRIGGER posts_remove_reports
AFTER DELETE ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.remove_target_reports('post');
DROP TRIGGER IF EXISTS comments_remove_reports ON public.comments;
CREATE TRIGGER comments_remove_reports
AFTER DELETE ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.remove_target_reports('comment');
REVOKE ALL ON FUNCTION public.remove_target_reports() FROM PUBLIC, anon, authenticated;

-- The dashboard queue and open count have the same definition of "open".
CREATE OR REPLACE FUNCTION public.moderation_queue()
RETURNS TABLE (
  report_id uuid, reason text, details text, status text, created_at timestamptz,
  target_type text, target_id uuid, content_title text, content_body text, content_status text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT r.id, r.reason, r.details, r.status, r.created_at, r.target_type, r.target_id,
    CASE WHEN r.target_type = 'post' THEN (SELECT p.title FROM public.posts p WHERE p.id = r.target_id) END,
    CASE WHEN r.target_type = 'post' THEN (SELECT p.body FROM public.posts p WHERE p.id = r.target_id)
         ELSE (SELECT c.body FROM public.comments c WHERE c.id = r.target_id) END,
    CASE WHEN r.target_type = 'post' THEN (SELECT p.status FROM public.posts p WHERE p.id = r.target_id)
         ELSE (SELECT c.status FROM public.comments c WHERE c.id = r.target_id) END
  FROM public.reports r
  WHERE r.status = 'open' AND public.is_moderator(auth.uid())
  ORDER BY r.created_at ASC;
$$;
GRANT EXECUTE ON FUNCTION public.moderation_queue() TO authenticated;

-- Responses are private; the public activity view exposes only an aggregate.
DROP POLICY IF EXISTS "responses readable by members" ON public.activity_responses;
CREATE POLICY "users read their own responses" ON public.activity_responses
FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.validate_activity_response()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.activities a
    WHERE a.id = NEW.activity_id
      AND a.status = 'visible'
      AND a.creator_user_id IS DISTINCT FROM NEW.user_id
  ) THEN
    RAISE EXCEPTION 'activity_response_not_allowed';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS activity_response_guard ON public.activity_responses;
CREATE TRIGGER activity_response_guard
BEFORE INSERT OR UPDATE ON public.activity_responses
FOR EACH ROW EXECUTE FUNCTION public.validate_activity_response();
REVOKE ALL ON FUNCTION public.validate_activity_response() FROM PUBLIC, anon, authenticated;

-- Keep uploaded images out of the public storage endpoint. Authenticated
-- members can obtain signed URLs; anonymous visitors receive the UI fallback.
UPDATE storage.buckets SET public = false WHERE id = 'post-images';
DROP POLICY IF EXISTS "post images readable" ON storage.objects;
DROP POLICY IF EXISTS "members read post images" ON storage.objects;
DROP POLICY IF EXISTS "public can sign visible post images" ON storage.objects;
CREATE OR REPLACE FUNCTION public.can_view_post_image(_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.posts
    WHERE status = 'visible' AND image_url = _path
  );
$$;
REVOKE ALL ON FUNCTION public.can_view_post_image(text) FROM PUBLIC, anon, authenticated;
-- createSignedUrl checks SELECT on the object for the caller. Keep the
-- bucket private, but permit signing only for paths attached to visible posts.
-- There is intentionally no list policy, so unguessable orphaned paths stay
-- inaccessible while published images work for anonymous visitors.
CREATE POLICY "public can sign visible post images" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'post-images'
  AND public.can_view_post_image(storage.objects.name)
);
CREATE POLICY "anonymous can sign visible post images" ON storage.objects
FOR SELECT TO anon
USING (
  bucket_id = 'post-images'
  AND public.can_view_post_image(storage.objects.name)
);

-- Canonical participant columns make direct-conversation creation race-safe.
CREATE OR REPLACE FUNCTION public.is_conversation_member(_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_members
    WHERE conversation_id = _conversation_id AND user_id = auth.uid()
  );
$$;
REVOKE ALL ON FUNCTION public.is_conversation_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_conversation_member(uuid) TO authenticated;
DROP POLICY IF EXISTS "member can read own membership" ON public.conversation_members;
CREATE POLICY "members can read conversation members" ON public.conversation_members
FOR SELECT TO authenticated
USING (public.is_conversation_member(conversation_id));

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS participant_a uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS participant_b uuid REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS conversations_direct_pair_key
  ON public.conversations (participant_a, participant_b)
  WHERE participant_a IS NOT NULL AND participant_b IS NOT NULL;
CREATE INDEX IF NOT EXISTS conversation_members_user_updated_idx
  ON public.conversation_members (user_id, conversation_id);

CREATE OR REPLACE FUNCTION public.ensure_direct_conversation(_peer_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  first_user uuid;
  second_user uuid;
  conversation_id uuid;
BEGIN
  IF auth.uid() IS NULL OR _peer_id IS NULL OR _peer_id = auth.uid() THEN
    RAISE EXCEPTION 'invalid_conversation_participant';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _peer_id) THEN
    RAISE EXCEPTION 'invalid_conversation_participant';
  END IF;
  IF auth.uid() < _peer_id THEN
    first_user := auth.uid(); second_user := _peer_id;
  ELSE
    first_user := _peer_id; second_user := auth.uid();
  END IF;

  INSERT INTO public.conversations (participant_a, participant_b, updated_at)
  VALUES (first_user, second_user, now())
  ON CONFLICT (participant_a, participant_b)
    WHERE participant_a IS NOT NULL AND participant_b IS NOT NULL
    DO UPDATE SET updated_at = public.conversations.updated_at
  RETURNING id INTO conversation_id;
  IF conversation_id IS NULL THEN
    SELECT id INTO conversation_id FROM public.conversations
    WHERE participant_a = first_user AND participant_b = second_user;
  END IF;

  INSERT INTO public.conversation_members (conversation_id, user_id)
  VALUES (conversation_id, first_user), (conversation_id, second_user)
  ON CONFLICT DO NOTHING;
  RETURN conversation_id;
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_direct_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_direct_conversation(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.touch_conversation_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations SET updated_at = now() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS messages_touch_conversation ON public.messages;
CREATE TRIGGER messages_touch_conversation
AFTER INSERT OR UPDATE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.touch_conversation_on_message();
REVOKE ALL ON FUNCTION public.touch_conversation_on_message() FROM PUBLIC, anon, authenticated;

-- Enable delivery of message inserts to the realtime client.
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END;
$$;
