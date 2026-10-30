import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2, Plus, Minus, ShieldCheck, Search } from "lucide-react";
import { toast } from "sonner";
import { usePlayer } from "@/hooks/use-player";
import { SiteHeader, useCurrency, formatMoney } from "@/components/SiteHeader";
import { ErrorDetails, errorText } from "@/components/ErrorDetails";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { adminPlayers, adminAdjustBalance, adminInfo, adminApiCheck, claimAdmin } from "@/lib/slotegrator.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Golden Reels — Administrator" },
      { name: "description", content: "Golden Reels administrator account and player balance management." },
      { property: "og:title", content: "Golden Reels — Administrator" },
      { property: "og:description", content: "Private player balance management for Golden Reels administrators." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const [authOpen, setAuthOpen] = useState(false);
  const { data: player, isPending, error } = usePlayer();
  return (
    <div className="min-h-screen">
      <SiteHeader authOpen={authOpen} setAuthOpen={setAuthOpen} />
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-10">
        <div className="flex items-center gap-3">
          <ShieldCheck className="text-primary" />
          <h1 className="font-display text-3xl text-gold">Administrator</h1>
        </div>
        {isPending ? (
          <Loader2 className="animate-spin" aria-label="Loading" />
        ) : error ? (
          <ErrorDetails title="Account check failed" detail={errorText(error)} />
        ) : !player ? (
          <Button variant="gold" onClick={() => setAuthOpen(true)}>Sign in</Button>
        ) : player.isAdmin ? (
          <>
            <StorageInfo />
            <CallbackUrl />
            <ApiChecks />
            <BalancePanel />
          </>
        ) : (
          <AdminSetup />
        )}
        <Link to="/" className="inline-block text-sm text-muted-foreground">Back to games</Link>
      </main>
    </div>
  );
}

function AdminSetup() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setup = useServerFn(claimAdmin);
  const client = useQueryClient();
  return (
    <form
      className="max-w-md space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const result = await setup({ data: { code } });
          if (!result.ok) {
            setError(result.error ?? "Setup denied");
            return;
          }
          setCode("");
          await client.invalidateQueries({ queryKey: ["player"] });
          toast.success("Administrator access enabled");
        } catch (err) {
          setError(errorText(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="text-xl font-semibold">First administrator setup</h2>
      {error && <ErrorDetails title="Administrator setup denied" detail={error} onClose={() => setError(null)} />}
      <Label htmlFor="setup-code">Private setup code</Label>
      <Input id="setup-code" type="password" autoComplete="off" maxLength={200} required value={code} onChange={(e) => setCode(e.target.value)} />
      <Button variant="gold" disabled={busy}>{busy && <Loader2 className="animate-spin" />}Enable administrator</Button>
    </form>
  );
}

function StorageInfo() {
  const info = useServerFn(adminInfo);
  const { data, error } = useQuery({ queryKey: ["admin-info"], queryFn: () => info() });
  if (error) return <ErrorDetails title="Database file could not be read" detail={errorText(error)} />;
  return (
    <section className="space-y-2 rounded-xl border bg-card p-5">
      <h2 className="text-xl font-semibold">Database file</h2>
      <p className="text-sm text-muted-foreground">All players, balances and game transactions are saved here on the server.</p>
      <code className="block break-all rounded bg-muted px-3 py-2 text-sm">{data?.dbFile ?? "…"}</code>
      {data && <p className="text-sm text-muted-foreground">{data.users} players · {data.transactions} transactions</p>}
    </section>
  );
}

function ApiChecks() {
  const check = useServerFn(adminApiCheck);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ title: string; detail: string; ok: boolean } | null>(null);
  async function run(kind: "games" | "limits" | "self-validate") {
    setBusy(kind);
    try {
      const r = await check({ data: { check: kind } });
      setResult({ ok: r.ok, title: `${kind}: HTTP ${r.status} ${r.ok ? "OK" : "FAILED"}`, detail: r.body });
    } catch (e) {
      setResult({ ok: false, title: `${kind}: request failed`, detail: errorText(e) });
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="space-y-3 rounded-xl border bg-card p-5">
      <h2 className="text-xl font-semibold">Slotegrator live check</h2>
      <div className="flex flex-wrap gap-2">
        {(["games", "limits", "self-validate"] as const).map((k) => (
          <Button key={k} variant="outline" disabled={!!busy} onClick={() => run(k)}>
            {busy === k && <Loader2 className="animate-spin" />}
            {k}
          </Button>
        ))}
      </div>
      {result &&
        (result.ok ? (
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs">{result.title}{"\n"}{result.detail}</pre>
        ) : (
          <ErrorDetails title={result.title} detail={result.detail} onClose={() => setResult(null)} />
        ))}
    </section>
  );
}

function BalancePanel() {
  const list = useServerFn(adminPlayers);
  const adjust = useServerFn(adminAdjustBalance);
  const client = useQueryClient();
  const currency = useCurrency();
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [selected, setSelected] = useState<{ id: string; username: string; balance: number } | null>(null);
  const [direction, setDirection] = useState<"add" | "subtract">("add");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const { data: players, isPending, error, refetch } = useQuery({
    queryKey: ["admin-players", appliedSearch],
    queryFn: () => list({ data: { search: appliedSearch } }),
  });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || busy) return;
    setBusy(true);
    setAdjustError(null);
    try {
      const result = await adjust({ data: { playerId: selected.id, amount: Number(amount), direction, note } });
      toast.success(`Balance updated: ${formatMoney(result.balance, currency)}`);
      setSelected(null);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["admin-players"] }),
        client.invalidateQueries({ queryKey: ["player"] }),
        client.invalidateQueries({ queryKey: ["admin-info"] }),
      ]);
    } catch (err) {
      setAdjustError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">Player balances</h2>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setAppliedSearch(search.trim()); }}>
          <Input aria-label="Search players" placeholder="Username" maxLength={100} value={search} onChange={(e) => setSearch(e.target.value)} />
          <Button variant="outline" size="icon" aria-label="Search"><Search /></Button>
        </form>
      </div>
      {isPending ? (
        <Loader2 className="animate-spin" aria-label="Loading players" />
      ) : error ? (
        <div className="space-y-3">
          <ErrorDetails title="Player list is unavailable" detail={errorText(error)} />
          <Button variant="outline" onClick={() => refetch()}>Retry</Button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b text-muted-foreground">
              <tr><th className="py-3">Username</th><th className="px-4 py-3">Balance</th><th className="py-3 text-right">Actions</th></tr>
            </thead>
            <tbody>
              {players?.map((p) => (
                <tr key={p.id} className="border-b">
                  <td className="py-4 font-semibold">{p.username}{p.isAdmin && <span className="ml-2 text-xs text-primary">admin</span>}</td>
                  <td className="whitespace-nowrap px-4 py-4">{formatMoney(p.balance, currency)}</td>
                  <td className="py-4 text-right">
                    <Button variant="outline" onClick={() => { setSelected(p); setAmount(""); setNote(""); setDirection("add"); setAdjustError(null); }}>
                      Adjust balance
                    </Button>
                  </td>
                </tr>
              ))}
              {!players?.length && <tr><td colSpan={3} className="py-8 text-muted-foreground">No players found.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={!!selected} onOpenChange={(open) => { if (!open && !busy) setSelected(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{selected?.username} — balance</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Current: {formatMoney(selected?.balance ?? 0, currency)}</p>
          {adjustError && <ErrorDetails title="Balance change rejected" detail={adjustError} onClose={() => setAdjustError(null)} />}
          <form className="space-y-4" onSubmit={submit}>
            <div className="flex gap-2">
              <Button type="button" aria-pressed={direction === "add"} variant={direction === "add" ? "gold" : "outline"} onClick={() => setDirection("add")}><Plus />Add</Button>
              <Button type="button" aria-pressed={direction === "subtract"} variant={direction === "subtract" ? "gold" : "outline"} onClick={() => setDirection("subtract")}><Minus />Subtract</Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="balance-amount">Amount {currency}</Label>
              <Input id="balance-amount" type="number" step="0.01" min="0.01" max="100000000" required value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="balance-note">Reason</Label>
              <Input id="balance-note" minLength={3} maxLength={200} required value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <Button variant="gold" className="w-full" disabled={busy}>{busy && <Loader2 className="animate-spin" />}Confirm adjustment</Button>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** Shows the wallet callback address for whatever domain this site is opened on. */
function CallbackUrl() {
  const [url, setUrl] = useState("");
  useEffect(() => setUrl(`${window.location.origin}/api/public/slotegrator/callback`), []);
  return (
    <section className="space-y-2 rounded-xl border bg-card p-5">
      <h2 className="text-xl font-semibold">Slotegrator callback URL</h2>
      <p className="text-sm text-muted-foreground">Give this address to Slotegrator. It follows your current domain automatically.</p>
      <div className="flex gap-2">
        <code className="flex-1 break-all rounded bg-muted px-3 py-2 text-sm">{url}</code>
        <Button variant="outline" onClick={() => { navigator.clipboard.writeText(url); toast.success("Copied"); }}>Copy</Button>
      </div>
    </section>
  );
}
