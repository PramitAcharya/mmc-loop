-- Make vote transitions atomic and return the authoritative score to the client.
CREATE OR REPLACE FUNCTION public.vote_post(_post_id uuid, _value smallint)
RETURNS TABLE (score int, user_vote smallint)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF _value NOT IN (-1, 0, 1) THEN
    RAISE EXCEPTION 'invalid_vote';
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
  SELECT (SELECT COALESCE(SUM(value),0) FROM public.post_votes WHERE post_id = _post_id)::integer AS score,
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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF _value NOT IN (-1, 0, 1) THEN
    RAISE EXCEPTION 'invalid_vote';
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

-- Repair any historical denormalized scores before future RPC responses are used.
UPDATE public.posts p
SET score = COALESCE((
  SELECT SUM(v.value)::int
  FROM public.post_votes v
  WHERE v.post_id = p.id
), 0);

UPDATE public.comments c
SET score = COALESCE((
  SELECT SUM(v.value)::int
  FROM public.comment_votes v
  WHERE v.comment_id = c.id
), 0);
