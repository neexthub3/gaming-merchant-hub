// JSON file database stored inside the project folder on the VPS.
// Location: $DATA_DIR/db.json, default <project root>/data/db.json (project root = process.cwd()).
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type User = {
  id: string;
  username: string;
  passHash: string;
  salt: string;
  balance: number;
  isAdmin: boolean;
  createdAt: string;
};
export type Session = { tokenHash: string; userId: string; expires: number };
export type Tx = {
  id: string;
  userId: string;
  providerTxId: string;
  action: string;
  amount: number;
  refTx: string;
  game: string;
  session: string;
  type: string;
  balanceAfter: number;
  rolledBack: boolean;
  note?: string;
  createdAt: string;
};
export type Db = { users: User[]; sessions: Session[]; transactions: Tx[] };

export function dataDir() {
  return path.resolve(process.env["DATA_DIR"] || path.join(process.cwd(), "data"));
}
export function dbFile() {
  return path.join(dataDir(), "db.json");
}

let queue: Promise<unknown> = Promise.resolve();

async function load(): Promise<Db> {
  try {
    const raw = await readFile(dbFile(), "utf8");
    const d = JSON.parse(raw) as Partial<Db>;
    return { users: d.users ?? [], sessions: d.sessions ?? [], transactions: d.transactions ?? [] };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { users: [], sessions: [], transactions: [] };
    throw new Error(`Cannot read database file ${dbFile()}: ${(e as Error).message}`);
  }
}

async function save(db: Db) {
  await mkdir(dataDir(), { recursive: true });
  const tmp = `${dbFile()}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
  await rename(tmp, dbFile());
}

/** Read-only snapshot. */
export function readDb(): Promise<Db> {
  const p = queue.then(load);
  queue = p.catch(() => undefined);
  return p;
}

/** Serialized read-modify-write; the file is saved only if fn returns without throwing. */
export function withDb<T>(fn: (db: Db) => T | Promise<T>): Promise<T> {
  const p = queue.then(async () => {
    const db = await load();
    const out = await fn(db);
    await save(db);
    return out;
  });
  queue = p.catch(() => undefined);
  return p;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
