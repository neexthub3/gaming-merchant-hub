import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2, Plus, Minus, ShieldCheck, Search } from "lucide-react";
import { toast } from "sonner";
import { usePlayer, useSession } from "@/hooks/use-player";
import { SiteHeader, useCurrency, formatMoney } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { adminPlayers, adminAdjustBalance, claimAdmin } from "@/lib/slotegrator.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [
    { title: "Golden Reels — Administrator" },
    { name: "description", content: "Golden Reels administrator account and player balance management." },
    { property: "og:title", content: "Golden Reels — Administrator" },
    { property: "og:description", content: "Private player balance management for Golden Reels administrators." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex, nofollow" },
  ] }),
  component: AdminPage,
});

function AdminPage() {
  const [authOpen, setAuthOpen] = useState(false);
  const { session, ready } = useSession();
  const { data: player, isPending } = usePlayer(session?.user.id);
  return <div className="min-h-screen">
    <SiteHeader authOpen={authOpen} setAuthOpen={setAuthOpen} />
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-10">
      <div className="flex items-center gap-3"><ShieldCheck className="text-primary" /><h1 className="font-display text-3xl text-gold">Administrator</h1></div>
      {!ready || (session && isPending) ? <Loader2 className="animate-spin" aria-label="Loading" /> : !session ?
        <Button variant="gold" onClick={() => setAuthOpen(true)}>Sign in</Button> : player?.isAdmin ?
        <><CallbackUrl /><BalancePanel /></> : <AdminSetup />}
      <Link to="/" className="inline-block text-sm text-muted-foreground">Back to games</Link>
    </main>
  </div>;
}

function AdminSetup() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const setup = useServerFn(claimAdmin);
  const client = useQueryClient();
  return <form className="max-w-md space-y-4" onSubmit={async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const result = await setup({ data: { code } });
      if (!result.ok) throw new Error("Administrator setup denied");
      setCode(""); await client.invalidateQueries({ queryKey: ["player"] });
      toast.success("Administrator access enabled");
    } catch { toast.error("Setup denied. Check your code or contact the existing administrator."); }
    finally { setBusy(false); }
  }}>
    <h2 className="text-xl font-semibold">First administrator setup</h2>
    <Label htmlFor="setup-code">Private setup code</Label>
    <Input id="setup-code" type="password" autoComplete="off" minLength={12} maxLength={200} required value={code} onChange={(e) => setCode(e.target.value)} />
    <Button variant="gold" disabled={busy}>{busy && <Loader2 className="animate-spin" />}Enable administrator</Button>
  </form>;
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
  const { data: players, isPending, error, refetch } = useQuery({ queryKey: ["admin-players", appliedSearch], queryFn: () => list({ data: { search: appliedSearch } }) });
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (!selected || busy) return;
    setBusy(true);
    try {
      const result = await adjust({ data: { playerId: selected.id, amount: Number(amount), direction, note } });
      toast.success(`Balance updated: ${formatMoney(result.balance, currency)}`);
      setSelected(null);
      await Promise.all([client.invalidateQueries({ queryKey: ["admin-players"] }), client.invalidateQueries({ queryKey: ["player"] })]);
    } catch { toast.error("Balance change rejected. Check the amount and available balance."); }
    finally { setBusy(false); }
  }
  return <section className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-4"><h2 className="text-xl font-semibold">Player balances</h2>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setAppliedSearch(search.trim()); }}>
        <Input aria-label="Search players" placeholder="Username" maxLength={100} value={search} onChange={(e) => setSearch(e.target.value)} />
        <Button variant="outline" size="icon" aria-label="Search"><Search /></Button>
      </form>
    </div>
    {isPending ? <Loader2 className="animate-spin" aria-label="Loading players" /> : error ? <div role="alert" className="space-y-3"><p>Player list is unavailable.</p><Button variant="outline" onClick={() => refetch()}>Retry</Button></div> :
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b text-muted-foreground"><tr><th className="py-3">Username</th><th className="px-4 py-3">Balance</th><th className="py-3 text-right">Actions</th></tr></thead><tbody>
        {players?.map((p) => <tr key={p.id} className="border-b"><td className="py-4 font-semibold">{p.username}</td><td className="whitespace-nowrap px-4 py-4">{formatMoney(Number(p.balance), currency)}</td><td className="py-4 text-right"><Button variant="outline" onClick={() => { setSelected({ ...p, balance: Number(p.balance) }); setAmount(""); setNote(""); setDirection("add"); }}>Adjust balance</Button></td></tr>)}
        {!players?.length && <tr><td colSpan={3} className="py-8 text-muted-foreground">No players found.</td></tr>}
      </tbody></table></div>}
    <Dialog open={!!selected} onOpenChange={(open) => { if (!open && !busy) setSelected(null); }}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{selected?.username} — balance</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground">Current: {formatMoney(selected?.balance ?? 0, currency)}</p>
      <form className="space-y-4" onSubmit={submit}>
        <div className="flex gap-2"><Button type="button" aria-pressed={direction === "add"} variant={direction === "add" ? "gold" : "outline"} onClick={() => setDirection("add")}><Plus />Add</Button><Button type="button" aria-pressed={direction === "subtract"} variant={direction === "subtract" ? "gold" : "outline"} onClick={() => setDirection("subtract")}><Minus />Subtract</Button></div>
        <div className="space-y-2"><Label htmlFor="balance-amount">Amount {currency}</Label><Input id="balance-amount" type="number" step="0.01" min="0.01" max="100000000" required value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="balance-note">Reason</Label><Input id="balance-note" minLength={3} maxLength={200} required value={note} onChange={(e) => setNote(e.target.value)} /></div>
        <Button variant="gold" className="w-full" disabled={busy}>{busy && <Loader2 className="animate-spin" />}Confirm adjustment</Button>
      </form>
    </DialogContent></Dialog>
  </section>;
}
/** Shows the wallet callback address for whatever domain this site is opened on. */
function CallbackUrl() {
  const [url, setUrl] = useState("");
  useEffect(() => setUrl(`${window.location.origin}/api/public/slotegrator/callback`), []);
  return <section className="space-y-2 rounded-xl border bg-card p-5">
    <h2 className="text-xl font-semibold">Slotegrator callback URL</h2>
    <p className="text-sm text-muted-foreground">Give this address to Slotegrator. It follows your current domain automatically.</p>
    <div className="flex gap-2">
      <code className="flex-1 break-all rounded bg-muted px-3 py-2 text-sm">{url}</code>
      <Button variant="outline" onClick={() => navigator.clipboard.writeText(url)}>Copy</Button>
    </div>
  </section>;
}
