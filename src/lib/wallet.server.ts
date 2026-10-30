// Seamless-wallet operations on the JSON file database.
import { round2, withDb, readDb, type Db, type Tx } from "./filedb.server";

type Result = { balance?: number; transaction_id?: string; rollback_transactions?: string[]; error?: string };

const now = () => new Date().toISOString();

function addTx(db: Db, t: Omit<Tx, "id" | "createdAt" | "rolledBack">) {
  const tx: Tx = { ...t, id: crypto.randomUUID(), rolledBack: false, createdAt: now() };
  db.transactions.push(tx);
  return tx;
}

export async function walletBalance(playerId: string): Promise<Result> {
  const db = await readDb();
  const u = db.users.find((x) => x.id === playerId);
  return u ? { balance: u.balance } : { error: "PLAYER_NOT_FOUND" };
}

export function walletTx(p: {
  action: "bet" | "win" | "refund";
  playerId: string;
  amount: number;
  txId: string;
  refTx: string;
  game: string;
  session: string;
  type: string;
}): Promise<Result> {
  return withDb((db) => {
    const u = db.users.find((x) => x.id === p.playerId);
    if (!u) return { error: "PLAYER_NOT_FOUND" };
    const dup = db.transactions.find((t) => t.providerTxId === p.txId && t.action === p.action);
    if (dup) return { balance: u.balance, transaction_id: dup.id };
    const amount = round2(p.amount);
    if (p.action === "bet") {
      if (u.balance < amount) return { error: "INSUFFICIENT_FUNDS" };
      u.balance = round2(u.balance - amount);
    } else if (p.action === "refund") {
      const bet = db.transactions.find((t) => t.providerTxId === p.refTx && t.action === "bet");
      if (bet && !bet.rolledBack) {
        u.balance = round2(u.balance + amount);
        bet.rolledBack = true;
      }
    } else {
      u.balance = round2(u.balance + amount);
    }
    const tx = addTx(db, { userId: u.id, providerTxId: p.txId, action: p.action, amount, refTx: p.refTx, game: p.game, session: p.session, type: p.type, balanceAfter: u.balance });
    return { balance: u.balance, transaction_id: tx.id };
  });
}

export function walletRollback(p: {
  playerId: string;
  txId: string;
  items: { transaction_id: string; action: string; amount: string }[];
  game: string;
  session: string;
}): Promise<Result> {
  return withDb((db) => {
    const u = db.users.find((x) => x.id === p.playerId);
    if (!u) return { error: "PLAYER_NOT_FOUND" };
    const dup = db.transactions.find((t) => t.providerTxId === p.txId && t.action === "rollback");
    if (dup) return { balance: u.balance, transaction_id: dup.id, rollback_transactions: p.items.map((i) => i.transaction_id) };
    for (const item of p.items) {
      const t = db.transactions.find((x) => x.providerTxId === item.transaction_id && x.userId === u.id && !x.rolledBack);
      if (!t) continue;
      if (t.action === "bet") u.balance = round2(u.balance + t.amount);
      else if (t.action === "win") u.balance = round2(u.balance - t.amount);
      t.rolledBack = true;
    }
    const tx = addTx(db, { userId: u.id, providerTxId: p.txId, action: "rollback", amount: 0, refTx: "", game: p.game, session: p.session, type: "", balanceAfter: u.balance });
    return { balance: u.balance, transaction_id: tx.id, rollback_transactions: p.items.map((i) => i.transaction_id) };
  });
}

export function adminAdjust(playerId: string, amount: number, note: string, adminId: string) {
  return withDb((db) => {
    const u = db.users.find((x) => x.id === playerId);
    if (!u) throw new Error("Player not found");
    const next = round2(u.balance + amount);
    if (next < 0) throw new Error(`Not enough balance: player has ${u.balance}, tried to subtract ${-amount}`);
    u.balance = next;
    addTx(db, { userId: u.id, providerTxId: `admin-${crypto.randomUUID()}`, action: "admin", amount, refTx: adminId, game: "", session: "", type: "", balanceAfter: next, note });
    return next;
  });
}
