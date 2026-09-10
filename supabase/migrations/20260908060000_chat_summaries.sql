CREATE OR REPLACE FUNCTION public.chat_conversation_summaries()
RETURNS TABLE (
  conversation_id uuid,
  updated_at timestamptz,
  other_user_id uuid,
  other_username text,
  other_display_name text,
  other_avatar_url text,
  last_message text,
  last_message_at timestamptz,
  unread_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.updated_at,
    peer.id,
    peer.username,
    peer.display_name,
    peer.avatar_url,
    latest.content,
    latest.created_at,
    (
      SELECT count(*)
      FROM public.messages unread
      JOIN public.conversation_members own
        ON own.conversation_id = unread.conversation_id
       AND own.user_id = auth.uid()
      WHERE unread.conversation_id = c.id
        AND unread.sender_id <> auth.uid()
        AND (own.last_read_at IS NULL OR unread.created_at > own.last_read_at)
    )
  FROM public.conversations c
  JOIN public.conversation_members own
    ON own.conversation_id = c.id
   AND own.user_id = auth.uid()
  JOIN public.conversation_members peer_member
    ON peer_member.conversation_id = c.id
   AND peer_member.user_id <> auth.uid()
  JOIN public.profiles peer ON peer.id = peer_member.user_id
  LEFT JOIN LATERAL (
    SELECT m.content, m.created_at
    FROM public.messages m
    WHERE m.conversation_id = c.id
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT 1
  ) latest ON true
  ORDER BY c.updated_at DESC
  LIMIT 50;
$$;

REVOKE ALL ON FUNCTION public.chat_conversation_summaries() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_conversation_summaries() TO authenticated;
