import { Link, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LogOut, Wallet } from "lucide-react";

import { usePlayer } from "@/hooks/use-player";
import { getPublicConfig, logout } from "@/lib/slotegrator.functions";
import { AuthDialog } from "@/components/AuthDialog";
import { Button } from "@/components/ui/button";

export function useCurrency() {
  const { data } = useQuery({ queryKey: ["config"], queryFn: () => getPublicConfig(), staleTime: Infinity });
  return data?.currency ?? "";
}

export function formatMoney(n: number, currency: string) {
  return `${n.toLocaleString("bn-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

export function SiteHeader({ authOpen, setAuthOpen }: { authOpen: boolean; setAuthOpen: (o: boolean) => void }) {
  const { data: player, isPending } = usePlayer();
  const currency = useCurrency();
  const client = useQueryClient();
  const router = useRouter();
  const doLogout = useServerFn(logout);

  return (
    <nav className="sticky top-0 z-40 border-b bg-overlay backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 md:px-6">
        <Link to="/" className="font-display text-lg font-extrabold text-gold md:text-xl">
          Golden Reels
        </Link>
        {isPending ? null : player ? (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm">
              <Wallet className="size-4 text-primary" />
              <span className="font-semibold">{formatMoney(player.balance, currency)}</span>
            </div>
            <span className="hidden text-sm text-muted-foreground sm:inline">{player.username}</span>
            <Link to="/admin" className="text-sm text-primary">
              {player.isAdmin ? "Admin" : "Admin setup"}
            </Link>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Sign out"
              onClick={async () => {
                await client.cancelQueries();
                await doLogout();
                client.clear();
                await router.navigate({ to: "/", replace: true });
              }}
            >
              <LogOut />
            </Button>
          </div>
        ) : (
          <Button variant="gold" size="sm" onClick={() => setAuthOpen(true)}>
            Sign in / Register
          </Button>
        )}
      </div>
      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
    </nav>
  );
}
