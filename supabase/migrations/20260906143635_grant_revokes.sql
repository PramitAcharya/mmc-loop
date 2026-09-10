
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_comment_count() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_post_score() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_comment_score() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_moderator(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.moderation_queue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_moderator(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.moderation_queue() TO authenticated;

COMMENT ON VIEW public.public_posts IS 'Intentional owner-privileged view: strips author identity from anonymous posts before exposing them publicly.';
COMMENT ON VIEW public.public_comments IS 'Intentional owner-privileged view: strips author identity from anonymous comments.';
COMMENT ON VIEW public.public_activities IS 'Intentional owner-privileged view for public Who''s Free listings.';
