-- Keep the public feed view aligned with the frontend query contract.
DROP VIEW IF EXISTS public.public_posts;
CREATE VIEW public.public_posts AS
SELECT
  p.id,
  p.title,
  p.body,
  p.category_id,
  c.slug AS category_slug,
  c.name AS category_name,
  c.emoji AS category_emoji,
  p.image_url,
  p.is_anonymous,
  p.is_demo,
  p.score,
  p.comment_count,
  p.created_at,
  p.updated_at,
  CASE WHEN p.is_anonymous THEN NULL ELSE p.author_user_id END AS author_id,
  CASE WHEN p.is_anonymous THEN NULL ELSE pr.username END AS author_username,
  CASE WHEN p.is_anonymous THEN NULL ELSE pr.avatar_url END AS author_avatar_url,
  (p.author_user_id = auth.uid()) AS is_owner
FROM public.posts p
JOIN public.categories c ON c.id = p.category_id
LEFT JOIN public.profiles pr ON pr.id = p.author_user_id
WHERE p.status = 'visible';
GRANT SELECT ON public.public_posts TO anon, authenticated;

-- Seed a small, clearly labelled public feed for new environments.
INSERT INTO public.posts (
  title,
  body,
  category_id,
  is_anonymous,
  is_demo,
  score,
  created_at
)
SELECT
  seed.title,
  seed.body,
  c.id,
  seed.is_anonymous,
  true,
  seed.score,
  now() - seed.age
FROM (
  VALUES
    (
      'Demo: What should improve on campus first?',
      'Example discussion for the demo feed. Share one practical improvement you would like to see around campus.',
      'general',
      false,
      6,
      interval '2 hours'
    ),
    (
      'Demo: Share your best exam preparation tip',
      'Example study thread for new members. What routine, resource or habit helped you most before exams?',
      'study',
      false,
      8,
      interval '7 hours'
    ),
    (
      'Demo: Is anyone free for a study break?',
      'Example activity conversation only. This is sample content, not an official campus event.',
      'hangout',
      true,
      4,
      interval '1 day'
    )
) AS seed(title, body, category_slug, is_anonymous, score, age)
JOIN public.categories c ON c.slug = seed.category_slug
WHERE NOT EXISTS (
  SELECT 1
  FROM public.posts p
  WHERE p.title = seed.title
    AND p.is_demo = true
);
