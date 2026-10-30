// JSON file database stored inside the project folder on the VPS.
// Location: $DATA_DIR/db.json, default <project root>/data/db.json (project root = process.cwd()).
import { appendFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
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

// ---------- Slotegrator callback log (data/callbacks.log, one JSON per line) ----------
export function callbackLogFile() {
  return path.join(dataDir(), "callbacks.log");
}

export async function logCallback(entry: Record<string, unknown>) {
  try {
    await mkdir(dataDir(), { recursive: true });
    await appendFile(callbackLogFile(), JSON.stringify({ time: new Date().toISOString(), ...entry }) + "\n", "utf8");
    const s = await stat(callbackLogFile());
    if (s.size > 2_000_000) {
      const lines = (await readFile(callbackLogFile(), "utf8")).trim().split("\n").slice(-1000);
      await writeFile(callbackLogFile(), lines.join("\n") + "\n", "utf8");
    }
  } catch (e) {
    console.error("Could not write callback log", e);
  }
}

export async function readCallbackLog(limit = 50): Promise<Record<string, unknown>[]> {
  try {
    const lines = (await readFile(callbackLogFile(), "utf8")).trim().split("\n").filter(Boolean);
    return lines
      .slice(-limit)
      .reverse()
      .map((l) => {
        try {
          return JSON.parse(l) as Record<string, unknown>;
        } catch {
          return { raw: l };
        }
      });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
}

// ---------- Game catalog (data/games.json): game uuid -> name/provider, filled from Slotegrator /games ----------
export type GameMeta = { name: string; provider: string };
export function gamesFile() {
  return path.join(dataDir(), "games.json");
}
export async function readGames(): Promise<Record<string, GameMeta>> {
  try {
    return JSON.parse(await readFile(gamesFile(), "utf8")) as Record<string, GameMeta>;
  } catch {
    return {};
  }
}
export function rememberGames(items: { uuid: string; name?: string; provider?: string }[]) {
  const p = queue.then(async () => {
    const map = await readGames();
    let changed = false;
    for (const g of items) {
      if (!g.uuid) continue;
      const meta = { name: g.name ?? "", provider: g.provider ?? "" };
      const old = map[g.uuid];
      if (!old || old.name !== meta.name || old.provider !== meta.provider) {
        map[g.uuid] = meta;
        changed = true;
      }
    }
    if (!changed) return;
    await mkdir(dataDir(), { recursive: true });
    const tmp = `${gamesFile()}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(map), "utf8");
    await rename(tmp, gamesFile());
  });
  queue = p.catch(() => undefined);
  return p.catch((e) => console.error("Could not save game catalog", e));
}
