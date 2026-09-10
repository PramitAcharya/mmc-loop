-- Activities get upvotes/downvotes and comments.
-- Realtime: publish the activity/comment/post tables so votes, scores and
-- counters update live. Vote/response tables stay un-published (own-row RLS);
-- their effects reach subscribers through the parent row UPDATEs the sync
-- triggers fire (score / response_count / comment_count columns).

-- 1) activity_votes: same contract as post_votes (writes only via RPC).
CREATE TABLE public.activity_votes (
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  value smallint NOT NULL CHECK (value IN (-1,1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (activity_id, user_id)
);
CREATE INDEX activity_votes_activity_idx ON public.activity_votes (activity_id);
GRANT SELECT ON public.activity_votes TO authenticated;
GRANT ALL ON public.activity_votes TO service_role;
ALTER TABLE public.activity_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own activity votes" ON public.activity_votes FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
REVOKE INSERT, UPDATE, DELETE ON public.activity_votes FROM PUBLIC, anon, authenticated;

-- 2) activity_comments: same contract as comments (flat, no parent nesting).
CREATE TABLE public.activity_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  author_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  is_anonymous boolean NOT NULL DEFAULT false,
  score int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible','hidden','removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_comments_activity_idx ON public.activity_comments (activity_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_comments TO authenticated;
GRANT ALL ON public.activity_comments TO service_role;
ALTER TABLE public.activity_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own or moderated activity comments readable" ON public.activity_comments FOR SELECT TO authenticated
  USING (auth.uid() = author_user_id OR public.is_moderator(auth.uid()));
CREATE POLICY "insert own activity comments" ON public.activity_comments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_user_id AND public.is_verified_student());
CREATE POLICY "update own activity comments" ON public.activity_comments FOR UPDATE TO authenticated
  USING (auth.uid() = author_user_id OR public.is_moderator(auth.uid()))
  WITH CHECK (auth.uid() = author_user_id OR public.is_moderator(auth.uid()));
CREATE POLICY "delete own activity comments" ON public.activity_comments FOR DELETE TO authenticated
  USING (auth.uid() = author_user_id OR public.is_moderator(auth.uid()));

CREATE TRIGGER activity_comments_touch BEFORE UPDATE ON public.activity_comments
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3) Denormalized counters/score on activities so a single realtime row
--    update carries score + response_count + comment_count to subscribers.
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS score int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS response_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comment_count int NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.sync_activity_score() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE aid uuid;
BEGIN
  aid := COALESCE(NEW.activity_id, OLD.activity_id);
  UPDATE public.activities a
     SET score = COALESCE((SELECT SUM(v.value) FROM public.activity_votes v WHERE v.activity_id = aid), 0)
   WHERE a.id = aid;
  RETURN NULL;
END; $$;
CREATE TRIGGER activity_votes_score_trg AFTER INSERT OR UPDATE OR DELETE ON public.activity_votes
FOR EACH ROW EXECUTE FUNCTION public.sync_activity_score();

CREATE OR REPLACE FUNCTION public.sync_activity_response_count() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE aid uuid;
BEGIN
  aid := COALESCE(NEW.activity_id, OLD.activity_id);
  UPDATE public.activities a
     SET response_count = (SELECT count(*)::int FROM public.activity_responses r WHERE r.activity_id = aid)
   WHERE a.id = aid;
  RETURN NULL;
END; $$;
CREATE TRIGGER activity_responses_count_trg AFTER INSERT OR DELETE ON public.activity_responses
FOR EACH ROW EXECUTE FUNCTION public.sync_activity_response_count();

CREATE OR REPLACE FUNCTION public.sync_activity_comment_count() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE aid uuid;
BEGIN
  aid := COALESCE(NEW.activity_id, OLD.activity_id);
  UPDATE public.activities a
     SET comment_count = (SELECT count(*)::int FROM public.activity_comments c WHERE c.activity_id = aid AND c.status = 'visible')
   WHERE a.id = aid;
  RETURN NULL;
END; $$;
CREATE TRIGGER activity_comments_count_trg AFTER INSERT OR DELETE ON public.activity_comments
FOR EACH ROW EXECUTE FUNCTION public.sync_activity_comment_count();

-- 4) Atomic vote RPC mirroring vote_post/vote_comment semantics.
CREATE OR REPLACE FUNCTION public.vote_activity(_activity_id uuid, _value smallint)
 RETURNS TABLE(score integer, user_vote smallint)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _creator_user_id uuid;
  _is_demo boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT public.is_verified_student() THEN
    RAISE EXCEPTION 'verification_required';
  END IF;

  IF _value NOT IN (-1, 0, 1) THEN
    RAISE EXCEPTION 'invalid_vote';
  END IF;

  SELECT a.creator_user_id, a.is_demo
    INTO _creator_user_id, _is_demo
  FROM public.activities a
  WHERE a.id = _activity_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'activity_not_found';
  END IF;

  IF _is_demo THEN
    RAISE EXCEPTION 'demo_content_untouchable';
  END IF;

  IF _creator_user_id = auth.uid() THEN
    RAISE EXCEPTION 'self_vote_not_allowed';
  END IF;

  IF _value = 0 THEN
    DELETE FROM public.activity_votes
    WHERE activity_id = _activity_id AND user_id = auth.uid();
  ELSE
    INSERT INTO public.activity_votes (activity_id, user_id, value)
    VALUES (_activity_id, auth.uid(), _value)
    ON CONFLICT (activity_id, user_id)
    DO UPDATE SET value = EXCLUDED.value;
  END IF;

  RETURN QUERY
  SELECT a.score,
         COALESCE(v.value, 0)::smallint
  FROM public.activities a
  LEFT JOIN public.activity_votes v
    ON v.activity_id = a.id AND v.user_id = auth.uid()
  WHERE a.id = _activity_id AND a.status = 'visible';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'activity_not_found';
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.vote_activity(uuid, smallint) TO authenticated;
REVOKE ALL ON FUNCTION public.vote_activity(uuid, smallint) FROM PUBLIC, anon;

-- 5) Backfill counters/score for rows created before the columns existed.
UPDATE public.activities a SET
  score = COALESCE((SELECT SUM(v.value) FROM public.activity_votes v WHERE v.activity_id = a.id), 0),
  response_count = (SELECT count(*)::int FROM public.activity_responses r WHERE r.activity_id = a.id),
  comment_count = (SELECT count(*)::int FROM public.activity_comments c WHERE c.activity_id = a.id AND c.status = 'visible');

-- 6) Views: expose the new columns and a comment feed for activities.
-- CREATE OR REPLACE VIEW cannot reorder/rename existing columns; the original
-- public_activities output columns are kept in place and score/comment_count
-- are appended at the end.
CREATE OR REPLACE VIEW public.public_activities AS
 SELECT a.id,
    a.activity_type,
    a.message,
    a.available_at,
    a.duration_minutes,
    a.is_demo,
    a.created_at,
    a.creator_user_id AS creator_id,
    pr.username AS creator_username,
    pr.avatar_url AS creator_avatar_url,
    (pr.verification_status = 'verified') AS creator_verified,
    ( SELECT count(*) AS count
           FROM activity_responses r
          WHERE (r.activity_id = a.id)) AS response_count,
    a.score,
    a.comment_count
   FROM (activities a
     LEFT JOIN profiles pr ON ((pr.id = a.creator_user_id)))
  WHERE (a.status = 'visible'::text);

CREATE OR REPLACE VIEW public.public_activity_comments AS
 SELECT cm.id,
    cm.activity_id,
    cm.body,
    cm.is_anonymous,
    cm.score,
    cm.created_at,
    cm.updated_at,
        CASE
            WHEN cm.is_anonymous THEN NULL::uuid
            ELSE cm.author_user_id
        END AS author_id,
        CASE
            WHEN cm.is_anonymous THEN NULL::text
            ELSE pr.username
        END AS author_username,
        CASE
            WHEN cm.is_anonymous THEN NULL::text
            ELSE pr.avatar_url
        END AS author_avatar_url,
    (cm.author_user_id = auth.uid()) AS is_owner,
    (pr.verification_status = 'verified') AS author_verified
   FROM (activity_comments cm
     JOIN activities a ON (((a.id = cm.activity_id) AND (a.status = 'visible'::text)))
     LEFT JOIN profiles pr ON ((pr.id = cm.author_user_id)))
  WHERE (cm.status = 'visible'::text);

GRANT SELECT ON public.public_activities TO anon, authenticated;
GRANT SELECT ON public.public_activity_comments TO anon, authenticated;

-- 7) Base tables: allow authenticated members to read visible rows so
--    realtime postgres_changes delivers score/comment/count updates. The
--    public_* views already expose exactly these visible rows (to anon no
--    less); the new SELECT policies only make the source tables readable in
--    the same way, which postgres_changes requires to broadcast a row.
CREATE POLICY "visible posts readable by members" ON public.posts FOR SELECT TO authenticated
  USING (status = 'visible'::text);
CREATE POLICY "visible comments readable by members" ON public.comments FOR SELECT TO authenticated
  USING (status = 'visible'::text);
CREATE POLICY "visible activity comments readable by members" ON public.activity_comments FOR SELECT TO authenticated
  USING (status = 'visible'::text);

-- 8) Realtime publication membership (guarded: pg_publication_tables check).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'activities') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.activities;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'activity_comments') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_comments;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'posts') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'comments') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;
  END IF;
END;
$$;