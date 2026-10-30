// Pure money summary used by the admin dashboard (kept separate so it can be unit-tested).
export type StatTx = { userId: string; action: string; amount: number; game: string; rolledBack: boolean };
export type ProviderRow = { provider: string; bets: number; wins: number; ggr: number; rounds: number; players: number; games: number };

const r2 = (n: number) => Math.round(n * 100) / 100;

export function summarize(
  users: { balance: number }[],
  txs: StatTx[],
  games: Record<string, { name: string; provider: string }>,
) {
  let bets = 0, wins = 0, deposits = 0, withdrawals = 0, rounds = 0;
  const byProvider = new Map<string, { bets: number; wins: number; rounds: number; players: Set<string>; games: Set<string> }>();
  for (const t of txs) {
    if (t.action === "admin") {
      if (t.amount >= 0) deposits += t.amount;
      else withdrawals += -t.amount;
      continue;
    }
    if (t.rolledBack || (t.action !== "bet" && t.action !== "win")) continue;
    const provider = games[t.game]?.provider || (t.game ? "Unknown provider" : "Unknown game");
    const row = byProvider.get(provider) ?? { bets: 0, wins: 0, rounds: 0, players: new Set(), games: new Set() };
    if (t.action === "bet") {
      bets += t.amount;
      row.bets += t.amount;
      row.rounds += 1;
      rounds += 1;
    } else {
      wins += t.amount;
      row.wins += t.amount;
    }
    row.players.add(t.userId);
    if (t.game) row.games.add(t.game);
    byProvider.set(provider, row);
  }
  const providers: ProviderRow[] = [...byProvider.entries()]
    .map(([provider, v]) => ({
      provider,
      bets: r2(v.bets),
      wins: r2(v.wins),
      ggr: r2(v.bets - v.wins),
      rounds: v.rounds,
      players: v.players.size,
      games: v.games.size,
    }))
    .sort((a, b) => b.bets - a.bets);
  return {
    players: users.length,
    totalBalance: r2(users.reduce((s, u) => s + u.balance, 0)),
    bets: r2(bets),
    wins: r2(wins),
    ggr: r2(bets - wins),
    rounds,
    deposits: r2(deposits),
    withdrawals: r2(withdrawals),
    providers,
  };
}
