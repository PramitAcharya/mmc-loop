CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read conversations" ON public.conversations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.conversation_members cm
      WHERE cm.conversation_id = public.conversations.id AND cm.user_id = auth.uid()
    )
  );

CREATE TABLE public.conversation_members (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_read_at timestamptz,
  PRIMARY KEY (conversation_id, user_id)
);
GRANT SELECT, UPDATE ON public.conversation_members TO authenticated;
GRANT ALL ON public.conversation_members TO service_role;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "member can read own membership" ON public.conversation_members FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "member can update own read state" ON public.conversation_members FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(trim(content)) > 0 AND char_length(content) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX messages_conversation_idx ON public.messages (conversation_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members can read conversation messages" ON public.messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.conversation_members cm
      WHERE cm.conversation_id = public.messages.conversation_id AND cm.user_id = auth.uid()
    )
  );
CREATE POLICY "member can send messages to direct conversations" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid() AND
    EXISTS (
      SELECT 1
      FROM public.conversation_members cm
      WHERE cm.conversation_id = public.messages.conversation_id AND cm.user_id = auth.uid()
    )
  );
CREATE POLICY "member can update own messages" ON public.messages FOR UPDATE TO authenticated
  USING (sender_id = auth.uid()) WITH CHECK (sender_id = auth.uid());
CREATE POLICY "member can delete own messages" ON public.messages FOR DELETE TO authenticated
  USING (sender_id = auth.uid());

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
  IF _peer_id IS NULL OR _peer_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot message yourself or an invalid user';
  END IF;

  SELECT cm.conversation_id INTO existing_id
  FROM public.conversation_members cm
  WHERE cm.user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.conversation_members peer
      WHERE peer.conversation_id = cm.conversation_id AND peer.user_id = _peer_id
    )
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    RETURN existing_id;
  END IF;

  INSERT INTO public.conversations (id, updated_at)
  VALUES (gen_random_uuid(), now())
  RETURNING id INTO conversation_id;

  INSERT INTO public.conversation_members (conversation_id, user_id)
  VALUES (conversation_id, auth.uid()), (conversation_id, _peer_id);

  RETURN conversation_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.ensure_direct_conversation(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER conversations_touch BEFORE UPDATE ON public.conversations
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER messages_touch BEFORE UPDATE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
