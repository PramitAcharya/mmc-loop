-- Verification request system (Discord-ticket style)
-- Users request verification, mods claim and review proof, then approve/reject

-- 1. verification_requests table
CREATE TABLE IF NOT EXISTS public.verification_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'claimed', 'approved', 'rejected')),
  claimed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  message text,
  proof_url text,
  mod_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Only one open or claimed request per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_verification_requests_active
  ON public.verification_requests (user_id)
  WHERE status IN ('open', 'claimed');

ALTER TABLE public.verification_requests ENABLE ROW LEVEL SECURITY;

-- Users can read their own requests
CREATE POLICY "Users read own verification requests"
  ON public.verification_requests FOR SELECT
  USING (auth.uid() = user_id);

-- Moderators can read all requests
CREATE POLICY "Moderators read all verification requests"
  ON public.verification_requests FOR SELECT
  USING (is_moderator(auth.uid()));

-- Users can create a request (if they don't have an active one)
CREATE POLICY "Users create own verification request"
  ON public.verification_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id AND status = 'open' AND claimed_by IS NULL);

-- Users can update their own open request (to add proof)
CREATE POLICY "Users update own open request"
  ON public.verification_requests FOR UPDATE
  USING (auth.uid() = user_id AND status = 'open')
  WITH CHECK (auth.uid() = user_id);

-- Moderators can update any request (claim, approve, reject)
CREATE POLICY "Moderators update any verification request"
  ON public.verification_requests FOR UPDATE
  USING (is_moderator(auth.uid()));

-- 2. RPC: Submit a verification request
CREATE OR REPLACE FUNCTION public.submit_verification_request(
  _message text DEFAULT NULL,
  _proof_url text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _has_active boolean;
  _request record;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check if user already has an active request
  SELECT EXISTS(
    SELECT 1 FROM verification_requests
    WHERE user_id = _user_id AND status IN ('open', 'claimed')
  ) INTO _has_active;

  IF _has_active THEN
    RAISE EXCEPTION 'You already have an active verification request';
  END IF;

  -- Check if already verified
  IF (SELECT verification_status FROM profiles WHERE id = _user_id) = 'verified' THEN
    RAISE EXCEPTION 'You are already verified';
  END IF;

  INSERT INTO verification_requests (user_id, message, proof_url, status)
  VALUES (_user_id, _message, _proof_url, 'open')
  RETURNING * INTO _request;

  RETURN json_build_object(
    'id', _request.id,
    'status', _request.status,
    'created_at', _request.created_at
  );
END;
$$;

-- 3. RPC: Claim a verification request (moderator)
CREATE OR REPLACE FUNCTION public.claim_verification_request(_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
BEGIN
  IF NOT is_moderator(auth.uid()) THEN
    RAISE EXCEPTION 'Moderator access required';
  END IF;

  UPDATE verification_requests
  SET claimed_by = _user_id,
      status = 'claimed',
      updated_at = now()
  WHERE id = _request_id AND status = 'open';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or already claimed';
  END IF;
END;
$$;

-- 4. RPC: Resolve a verification request (moderator approve/reject)
CREATE OR REPLACE FUNCTION public.resolve_verification_request(
  _request_id uuid,
  _approved boolean,
  _mod_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _request record;
  _new_status text;
BEGIN
  IF NOT is_moderator(auth.uid()) THEN
    RAISE EXCEPTION 'Moderator access required';
  END IF;

  SELECT * INTO _request
  FROM verification_requests
  WHERE id = _request_id AND status = 'claimed' AND claimed_by = _user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found, not claimed by you, or already resolved';
  END IF;

  _new_status := CASE WHEN _approved THEN 'approved' ELSE 'rejected' END;

  -- Update the request
  UPDATE verification_requests
  SET status = _new_status,
      mod_note = _mod_note,
      updated_at = now()
  WHERE id = _request_id;

  -- If approved, update the user's profile
  IF _approved THEN
    UPDATE profiles
    SET verification_status = 'verified',
        verified_at = now(),
        updated_at = now()
    WHERE id = _request.user_id;
  ELSE
    UPDATE profiles
    SET verification_status = 'rejected',
        verification_reason = _mod_note,
        updated_at = now()
    WHERE id = _request.user_id;
  END IF;
END;
$$;

-- 5. RPC: Unclaim a verification request (moderator)
CREATE OR REPLACE FUNCTION public.unclaim_verification_request(_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_moderator(auth.uid()) THEN
    RAISE EXCEPTION 'Moderator access required';
  END IF;

  UPDATE verification_requests
  SET claimed_by = NULL,
      status = 'open',
      updated_at = now()
  WHERE id = _request_id AND status = 'claimed';
END;
$$;

-- 6. Updated public_profiles view to include verification_status
DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles WITH (security_invoker = false) AS
SELECT
  id,
  username,
  display_name,
  bio,
  avatar_url,
  reputation,
  username_confirmed,
  verification_status,
  created_at
FROM profiles;

GRANT SELECT ON public.public_profiles TO anon, authenticated;
