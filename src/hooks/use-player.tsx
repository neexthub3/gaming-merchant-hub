import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const AuthContext = createContext<{ session: Session | null; ready: boolean }>({
  session: null,
  ready: false,
});

/** Single auth listener for the whole app (mounted once in the root route). */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        if (event === "SIGNED_OUT") queryClient.clear();
        else queryClient.invalidateQueries({ queryKey: ["player"] });
      }
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);
  return <AuthContext.Provider value={{ session, ready }}>{children}</AuthContext.Provider>;
}

export const useSession = () => useContext(AuthContext);

export function usePlayer(userId: string | undefined) {
  return useQuery({
    queryKey: ["player", userId],
    enabled: !!userId,
    refetchInterval: 15_000,
    queryFn: async () => {
      if (!userId) throw new Error("Sign in required");
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("username, balance").eq("id", userId).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId),
      ]);
      return {
        username: profile?.username ?? "",
        balance: Number(profile?.balance ?? 0),
        isAdmin: !!roles?.some((r) => r.role === "admin"),
      };
    },
  });
}

/** Usernames become a hidden sign-in address; players never see or need it. */
export const usernameToEmail = (u: string) => `${u.trim().toLowerCase()}@players.goldenreels.app`;

export function randomCredentials() {
  const n = Math.floor(100000 + Math.random() * 900000);
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const password = Array.from(bytes, (b) => chars[b % chars.length]).join("");
  return { username: `player${n}`, password };
}
