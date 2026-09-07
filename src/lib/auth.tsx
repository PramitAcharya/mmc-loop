import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  reputation: number;
  username_confirmed: boolean;
  created_at: string;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  profile: Profile | null;
  profileLoading: boolean;
  isModerator: boolean;
  refreshProfile: () => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  loading: true,
  profile: null,
  profileLoading: false,
  isModerator: false,
  refreshProfile: () => {},
  signOut: async () => {},
});

export const PROFILE_SELECT =
  "id, username, display_name, bio, avatar_url, reputation, username_confirmed, created_at";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      setLoading(false);
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient]);

  const userId = session?.user.id ?? null;

  const { data: profile = null, isLoading: profileLoading } = useQuery({
    queryKey: ["my-profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select(PROFILE_SELECT)
        .eq("id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data as Profile | null;
    },
  });

  const { data: isModerator = false } = useQuery({
    queryKey: ["is-moderator", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_moderator", { _user_id: userId! });
      if (error) return false;
      return Boolean(data);
    },
  });

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        profile,
        profileLoading: !!userId && profileLoading,
        isModerator,
        refreshProfile: () => {
          queryClient.invalidateQueries({ queryKey: ["my-profile", userId] });
        },
        signOut: async () => {
          await supabase.auth.signOut();
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
