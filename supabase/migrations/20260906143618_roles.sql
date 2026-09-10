
-- ROLES
CREATE TYPE public.app_role AS ENUM ('admin','moderator','user');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE,
  display_name text,
  bio text,
  avatar_url text,
  reputation int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles readable by all" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own roles readable" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_moderator(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','moderator'));
$$;

-- timestamps
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- new user -> profile
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE base text; final text; n int := 0;
BEGIN
  base := lower(regexp_replace(coalesce(NEW.raw_user_meta_data->>'username', split_part(NEW.email,'@',1),'student'),'[^a-z0-9_]','','g'));
  IF length(base) < 3 THEN base := 'student' || substr(NEW.id::text,1,6); END IF;
  final := base;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final) LOOP
    n := n + 1; final := base || n::text;
  END LOOP;
  INSERT INTO public.profiles (id, username, display_name)
  VALUES (NEW.id, final, coalesce(NEW.raw_user_meta_data->>'display_name', final));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- CATEGORIES
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  emoji text,
  sort_order int NOT NULL DEFAULT 0
);
GRANT SELECT ON public.categories TO anon, authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories readable" ON public.categories FOR SELECT USING (true);

INSERT INTO public.categories (slug,name,description,emoji,sort_order) VALUES
 ('college-issues','College Issues','Problems on campus worth raising','🏫',1),
 ('suggestions','Suggestions','Ideas to improve student life','💡',2),
 ('questions','Questions','Ask anything about campus or courses','❓',3),
 ('study','Study','Notes, routines, exams and resources','📚',4),
 ('general','General','Everyday campus conversation','💬',5),
 ('memes-fun','Memes & Fun','Light-hearted student humour','😄',6),
 ('gaming','Gaming','Squads, matches and game talk','🎮',7),
 ('hangout','Hangout','Meetups, chiya and plans','☕',8),
 ('announcements','Announcements & Information','Student-shared info (unofficial)','📢',9);

-- POSTS
CREATE TABLE public.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 160),
  body text CHECK (body IS NULL OR char_length(body) <= 8000),
  category_id uuid NOT NULL REFERENCES public.categories(id),
  image_url text,
  is_anonymous boolean NOT NULL DEFAULT false,
  is_demo boolean NOT NULL DEFAULT false,
  score int NOT NULL DEFAULT 0,
  comment_count int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible','hidden','removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX posts_created_idx ON public.posts (created_at DESC);
CREATE INDEX posts_score_idx ON public.posts (score DESC);
CREATE INDEX posts_category_idx ON public.posts (category_id);
CREATE INDEX posts_author_idx ON public.posts (author_user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.posts TO authenticated;
GRANT ALL ON public.posts TO service_role;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own or moderated posts readable" ON public.posts FOR SELECT TO authenticated
  USING (auth.uid() = author_user_id OR public.is_moderator(auth.uid()));
CREATE POLICY "insert own posts" ON public.posts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_user_id AND is_demo = false);
CREATE POLICY "update own posts" ON public.posts FOR UPDATE TO authenticated
  USING (auth.uid() = author_user_id OR public.is_moderator(auth.uid()))
  WITH CHECK (auth.uid() = author_user_id OR public.is_moderator(auth.uid()));
CREATE POLICY "delete own posts" ON public.posts FOR DELETE TO authenticated
  USING (auth.uid() = author_user_id OR public.is_moderator(auth.uid()));

CREATE TRIGGER posts_touch BEFORE UPDATE ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- COMMENTS
CREATE TABLE public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.comments(id) ON DELETE CASCADE,
  author_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  is_anonymous boolean NOT NULL DEFAULT false,
  score int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible','hidden','removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX comments_post_idx ON public.comments (post_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comments TO authenticated;
GRANT ALL ON public.comments TO service_role;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own or moderated comments readable" ON public.comments FOR SELECT TO authenticated
  USING (auth.uid() = author_user_id OR public.is_moderator(auth.uid()));
CREATE POLICY "insert own comments" ON public.comments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_user_id);
CREATE POLICY "update own comments" ON public.comments FOR UPDATE TO authenticated
  USING (auth.uid() = author_user_id OR public.is_moderator(auth.uid()))
  WITH CHECK (auth.uid() = author_user_id OR public.is_moderator(auth.uid()));
CREATE POLICY "delete own comments" ON public.comments FOR DELETE TO authenticated
  USING (auth.uid() = author_user_id OR public.is_moderator(auth.uid()));

CREATE TRIGGER comments_touch BEFORE UPDATE ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.sync_comment_count() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END; $$;
CREATE TRIGGER comments_count_trg AFTER INSERT OR DELETE ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.sync_comment_count();

-- VOTES
CREATE TABLE public.post_votes (
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  value smallint NOT NULL CHECK (value IN (-1,1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_votes TO authenticated;
GRANT ALL ON public.post_votes TO service_role;
ALTER TABLE public.post_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own post votes" ON public.post_votes FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.comment_votes (
  comment_id uuid NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  value smallint NOT NULL CHECK (value IN (-1,1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comment_votes TO authenticated;
GRANT ALL ON public.comment_votes TO service_role;
ALTER TABLE public.comment_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own comment votes" ON public.comment_votes FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.sync_post_score() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid;
BEGIN
  pid := COALESCE(NEW.post_id, OLD.post_id);
  UPDATE public.posts p SET score = COALESCE((SELECT SUM(value) FROM public.post_votes v WHERE v.post_id = pid),0) WHERE p.id = pid;
  UPDATE public.profiles pr SET reputation = COALESCE((
      SELECT SUM(p.score) FROM public.posts p WHERE p.author_user_id = pr.id),0)
    WHERE pr.id = (SELECT author_user_id FROM public.posts WHERE id = pid);
  RETURN NULL;
END; $$;
CREATE TRIGGER post_votes_score_trg AFTER INSERT OR UPDATE OR DELETE ON public.post_votes
FOR EACH ROW EXECUTE FUNCTION public.sync_post_score();

CREATE OR REPLACE FUNCTION public.sync_comment_score() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cid uuid;
BEGIN
  cid := COALESCE(NEW.comment_id, OLD.comment_id);
  UPDATE public.comments c SET score = COALESCE((SELECT SUM(value) FROM public.comment_votes v WHERE v.comment_id = cid),0) WHERE c.id = cid;
  RETURN NULL;
END; $$;
CREATE TRIGGER comment_votes_score_trg AFTER INSERT OR UPDATE OR DELETE ON public.comment_votes
FOR EACH ROW EXECUTE FUNCTION public.sync_comment_score();

-- ACTIVITIES
CREATE TABLE public.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_type text NOT NULL CHECK (activity_type IN ('gaming','study','hangout','food','movie','walk','talk','other')),
  message text NOT NULL CHECK (char_length(message) BETWEEN 3 AND 500),
  available_at timestamptz NOT NULL,
  duration_minutes int CHECK (duration_minutes IS NULL OR duration_minutes BETWEEN 15 AND 720),
  is_demo boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible','hidden','removed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activities_time_idx ON public.activities (available_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activities TO authenticated;
GRANT ALL ON public.activities TO service_role;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "activities readable by members" ON public.activities FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert own activity" ON public.activities FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = creator_user_id AND is_demo = false);
CREATE POLICY "update own activity" ON public.activities FOR UPDATE TO authenticated
  USING (auth.uid() = creator_user_id OR public.is_moderator(auth.uid()))
  WITH CHECK (auth.uid() = creator_user_id OR public.is_moderator(auth.uid()));
CREATE POLICY "delete own activity" ON public.activities FOR DELETE TO authenticated
  USING (auth.uid() = creator_user_id OR public.is_moderator(auth.uid()));

CREATE TABLE public.activity_responses (
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (activity_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.activity_responses TO authenticated;
GRANT ALL ON public.activity_responses TO service_role;
ALTER TABLE public.activity_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "responses readable by members" ON public.activity_responses FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert own response" ON public.activity_responses FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete own response" ON public.activity_responses FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- REPORTS
CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('post','comment')),
  target_id uuid NOT NULL,
  reason text NOT NULL CHECK (reason IN ('spam','harassment','inappropriate','misleading','other')),
  details text CHECK (details IS NULL OR char_length(details) <= 500),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reporter_user_id, target_type, target_id)
);
GRANT SELECT, INSERT, UPDATE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "moderators read reports" ON public.reports FOR SELECT TO authenticated
  USING (public.is_moderator(auth.uid()));
CREATE POLICY "members create reports" ON public.reports FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reporter_user_id);
CREATE POLICY "moderators update reports" ON public.reports FOR UPDATE TO authenticated
  USING (public.is_moderator(auth.uid())) WITH CHECK (public.is_moderator(auth.uid()));

-- PUBLIC VIEWS (hide identity behind anonymous content)
CREATE VIEW public.public_posts AS
SELECT p.id, p.title, p.body, p.category_id, c.slug AS category_slug, c.name AS category_name,
       c.emoji AS category_emoji, p.image_url, p.is_anonymous, p.is_demo, p.score,
       p.comment_count, p.created_at, p.updated_at,
       CASE WHEN p.is_anonymous THEN NULL ELSE p.author_user_id END AS author_id,
       CASE WHEN p.is_anonymous THEN NULL ELSE pr.username END AS author_username,
       CASE WHEN p.is_anonymous THEN NULL ELSE pr.avatar_url END AS author_avatar_url
FROM public.posts p
JOIN public.categories c ON c.id = p.category_id
LEFT JOIN public.profiles pr ON pr.id = p.author_user_id
WHERE p.status = 'visible';
GRANT SELECT ON public.public_posts TO anon, authenticated;

CREATE VIEW public.public_comments AS
SELECT cm.id, cm.post_id, cm.parent_id, cm.body, cm.is_anonymous, cm.score, cm.created_at,
       CASE WHEN cm.is_anonymous THEN NULL ELSE cm.author_user_id END AS author_id,
       CASE WHEN cm.is_anonymous THEN NULL ELSE pr.username END AS author_username,
       CASE WHEN cm.is_anonymous THEN NULL ELSE pr.avatar_url END AS author_avatar_url
FROM public.comments cm
LEFT JOIN public.profiles pr ON pr.id = cm.author_user_id
WHERE cm.status = 'visible';
GRANT SELECT ON public.public_comments TO anon, authenticated;

CREATE VIEW public.public_activities AS
SELECT a.id, a.activity_type, a.message, a.available_at, a.duration_minutes, a.is_demo,
       a.created_at, a.creator_user_id AS creator_id, pr.username AS creator_username,
       pr.avatar_url AS creator_avatar_url,
       (SELECT count(*) FROM public.activity_responses r WHERE r.activity_id = a.id) AS response_count
FROM public.activities a
LEFT JOIN public.profiles pr ON pr.id = a.creator_user_id
WHERE a.status = 'visible';
GRANT SELECT ON public.public_activities TO anon, authenticated;

-- moderation queue view for moderators (RLS on reports still applies via function check in app)
CREATE OR REPLACE FUNCTION public.moderation_queue()
RETURNS TABLE (
  report_id uuid, reason text, details text, status text, created_at timestamptz,
  target_type text, target_id uuid, content_title text, content_body text, content_status text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.reason, r.details, r.status, r.created_at, r.target_type, r.target_id,
    CASE WHEN r.target_type='post' THEN (SELECT p.title FROM public.posts p WHERE p.id=r.target_id) ELSE NULL END,
    CASE WHEN r.target_type='post' THEN (SELECT p.body FROM public.posts p WHERE p.id=r.target_id)
         ELSE (SELECT c.body FROM public.comments c WHERE c.id=r.target_id) END,
    CASE WHEN r.target_type='post' THEN (SELECT p.status FROM public.posts p WHERE p.id=r.target_id)
         ELSE (SELECT c.status FROM public.comments c WHERE c.id=r.target_id) END
  FROM public.reports r
  WHERE public.is_moderator(auth.uid())
  ORDER BY r.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.moderation_queue() TO authenticated;

-- DEMO CONTENT (clearly labelled, no real author)
INSERT INTO public.posts (title, body, category_id, is_anonymous, is_demo, score, created_at)
SELECT 'Demo: Library seats fill up before 9 AM',
 'Example post. Sharing a common student complaint: the reading room gets full very early during exam season. Would staggered timings help?',
 id, true, true, 12, now() - interval '4 hours' FROM public.categories WHERE slug='college-issues';
INSERT INTO public.posts (title, body, category_id, is_anonymous, is_demo, score, created_at)
SELECT 'Demo: Add more bicycle parking near the entrance',
 'Example suggestion post from the MMCLoop demo content set.',
 id, false, true, 7, now() - interval '9 hours' FROM public.categories WHERE slug='suggestions';
INSERT INTO public.posts (title, body, category_id, is_anonymous, is_demo, score, created_at)
SELECT 'Demo: Best way to revise statistics before finals?',
 'Example question post. Looking for study routines and note-sharing tips from seniors.',
 id, false, true, 9, now() - interval '1 day' FROM public.categories WHERE slug='study';
INSERT INTO public.posts (title, body, category_id, is_anonymous, is_demo, score, created_at)
SELECT 'Demo: Introduce yourself here',
 'Example general discussion thread for new MMCLoop members. Say hi, share your faculty and semester.',
 id, false, true, 4, now() - interval '2 days' FROM public.categories WHERE slug='general';
INSERT INTO public.posts (title, body, category_id, is_anonymous, is_demo, score, created_at)
SELECT 'Demo: Anyone up for a futsal squad this weekend?',
 'Example hangout post. Demo content only — not an official campus event.',
 id, false, true, 5, now() - interval '6 hours' FROM public.categories WHERE slug='hangout';

INSERT INTO public.activities (activity_type, message, available_at, duration_minutes, is_demo)
VALUES
 ('gaming','Demo: free for some online matches after class', now() + interval '5 hours', 120, true),
 ('study','Demo: group revision at the reading room', now() + interval '1 day', 180, true),
 ('food','Demo: chiya break near the campus gate', now() + interval '2 days', 60, true);
