import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { me } from "@/lib/slotegrator.functions";

/** Kept for layout compatibility; sign-in state now comes from the server cookie via `usePlayer`. */
export function AuthProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export type Player = { id: string; username: string; balance: number; isAdmin: boolean };

/** Signed-in player from the JSON file database (null when signed out). */
export function usePlayer() {
  return useQuery({
    queryKey: ["player"],
    queryFn: () => me(),
    refetchInterval: 15_000,
  });
}

export function randomCredentials() {
  const n = Math.floor(100000 + Math.random() * 900000);
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const password = Array.from(bytes, (b) => chars[b % chars.length]).join("");
  return { username: `player${n}`, password };
}
