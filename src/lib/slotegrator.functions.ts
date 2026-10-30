import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SlotegratorGame } from "./slotegrator-shared";
import { safeEqual } from "./slotegrator-shared";
import { slotegratorConfig, slotegratorRequest } from "./slotegrator-core";
import { balanceAdjustmentSchema, signedAdjustment } from "./admin-validation";

const detail = (label: string, res: { status: number; body: unknown }) =>
  `${label}\nHTTP status: ${res.status}${res.status === 406 || res.status === 403 ? " (Slotegrator is blocking this server IP — ask them to whitelist it)" : res.status === 0 ? " (network error or missing settings)" : ""}\nResponse: ${typeof res.body === "string" ? res.body : JSON.stringify(res.body, null, 2)}`.slice(0, 4000);

export const getPublicConfig = createServerFn({ method: "GET" }).handler(async () => {
  return { currency: process.env["SLOTEGRATOR_CURRENCY"] || "USD" };
});

export const listGames = createServerFn({ method: "GET" })
  .inputValidator((input: { page: number }) => z.object({ page: z.number().int().min(1).max(10000) }).parse(input))
  .handler(async ({ data }) => {
    if (!slotegratorConfig()) {
      return { ok: false as const, error: "Slotegrator settings missing: SLOTEGRATOR_MERCHANT_ID, SLOTEGRATOR_MERCHANT_KEY, SLOTEGRATOR_API_URL in .env", games: [], pageCount: 0, total: 0 };
    }
    const res = await slotegratorRequest("GET", "/games", { page: String(data.page) });
    if (!res.ok) {
      console.error("Slotegrator /games failed", res.status, res.body);
      return { ok: false as const, error: detail("GET /games failed", res), games: [], pageCount: 0, total: 0 };
    }
    const body = res.body as { items?: SlotegratorGame[]; _meta?: { pageCount?: number; totalCount?: number } };
    return {
      ok: true as const,
      error: null,
      games: body.items ?? [],
      pageCount: body._meta?.pageCount ?? Number(res.headers?.get("X-Pagination-Page-Count") ?? 1),
      total: body._meta?.totalCount ?? Number(res.headers?.get("X-Pagination-Total-Count") ?? 0),
    };
  });

const launchSchema = z.object({ gameUuid: z.string().min(1).max(100), returnUrl: z.string().url().max(500), mobile: z.boolean() });

export const initDemo = createServerFn({ method: "POST" })
  .inputValidator((input: z.infer<typeof launchSchema>) => launchSchema.parse(input))
  .handler(async ({ data }) => {
    const res = await slotegratorRequest("POST", "/games/init-demo", {
      game_uuid: data.gameUuid,
      device: data.mobile ? "mobile" : "desktop",
      return_url: data.returnUrl,
      language: "en",
    });
    const url = (res.body as { url?: string })?.url;
    if (!res.ok || !url) {
      console.error("Slotegrator init-demo failed", res.status, res.body);
      return { ok: false as const, url: null, error: detail(`POST /games/init-demo failed (game ${data.gameUuid})`, res) };
    }
    return { ok: true as const, url, error: null };
  });

export const initReal = createServerFn({ method: "POST" })
  .inputValidator((input: z.infer<typeof launchSchema>) => launchSchema.parse(input))
  .handler(async ({ data }) => {
    const { currentUser } = await import("./auth.server");
    const cfg = slotegratorConfig();
    if (!cfg) return { ok: false as const, url: null, error: "Slotegrator settings missing in .env" };
    const user = await currentUser();
    if (!user) return { ok: false as const, url: null, error: "Not signed in. Please sign in again." };
    if (user.balance <= 0) return { ok: false as const, url: null, error: "no_balance" };
    const res = await slotegratorRequest("POST", "/games/init", {
      game_uuid: data.gameUuid,
      player_id: user.id,
      player_name: user.username,
      currency: cfg.currency,
      session_id: crypto.randomUUID(),
      device: data.mobile ? "mobile" : "desktop",
      return_url: data.returnUrl,
      language: "en",
    });
    const url = (res.body as { url?: string })?.url;
    if (!res.ok || !url) {
      console.error("Slotegrator init failed", res.status, res.body);
      return { ok: false as const, url: null, error: detail(`POST /games/init failed (game ${data.gameUuid}, currency ${cfg.currency})`, res) };
    }
    return { ok: true as const, url, error: null };
  });

// ---------- Accounts ----------
const credSchema = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,20}$/, "Username: 3–20 chars a-z 0-9 _"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export const me = createServerFn({ method: "GET" }).handler(async () => {
  const { currentUser } = await import("./auth.server");
  const u = await currentUser();
  return u ? { id: u.id, username: u.username, balance: u.balance, isAdmin: u.isAdmin } : null;
});

export const register = createServerFn({ method: "POST" })
  .inputValidator((input: z.infer<typeof credSchema>) => credSchema.parse(input))
  .handler(async ({ data }) => {
    const { registerUser } = await import("./auth.server");
    try {
      await registerUser(data.username, data.password);
      return { ok: true as const, error: null };
    } catch (e) {
      const m = (e as Error).message;
      return { ok: false as const, error: m === "USERNAME_TAKEN" ? "USERNAME_TAKEN" : m };
    }
  });

export const login = createServerFn({ method: "POST" })
  .inputValidator((input: z.infer<typeof credSchema>) => credSchema.parse(input))
  .handler(async ({ data }) => {
    const { loginUser } = await import("./auth.server");
    try {
      await loginUser(data.username, data.password);
      return { ok: true as const, error: null };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  const { logoutUser } = await import("./auth.server");
  await logoutUser();
  return { ok: true };
});

// ---------- Admin ----------
export const claimAdmin = createServerFn({ method: "POST" })
  .inputValidator((input: { code: string }) => z.object({ code: z.string().min(1).max(200) }).parse(input))
  .handler(async ({ data }) => {
    const { requireUser, makeFirstAdmin } = await import("./auth.server");
    const user = await requireUser();
    const expected = process.env["ADMIN_SETUP_CODE"];
    if (!expected || expected.length < 12) return { ok: false as const, error: "ADMIN_SETUP_CODE is missing in .env or shorter than 12 characters" };
    if (!safeEqual(data.code, expected)) return { ok: false as const, error: "Wrong setup code" };
    try {
      await makeFirstAdmin(user.id);
      return { ok: true as const, error: null };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

export const adminPlayers = createServerFn({ method: "POST" })
  .inputValidator((input: { search: string }) => z.object({ search: z.string().trim().max(100) }).parse(input))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./auth.server");
    const { readDb } = await import("./filedb.server");
    await requireAdmin();
    const db = await readDb();
    const q = data.search.toLowerCase();
    return db.users
      .filter((u) => !q || u.username.includes(q))
      .slice(0, 200)
      .map((u) => ({ id: u.id, username: u.username, balance: u.balance, isAdmin: u.isAdmin }));
  });

export const adminAdjustBalance = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => balanceAdjustmentSchema.parse(input))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./auth.server");
    const { adminAdjust } = await import("./wallet.server");
    const admin = await requireAdmin();
    const balance = await adminAdjust(data.playerId, signedAdjustment(data), data.note, admin.id);
    return { balance };
  });

export const adminInfo = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAdmin } = await import("./auth.server");
  const { dbFile, readDb } = await import("./filedb.server");
  await requireAdmin();
  const db = await readDb();
  return { dbFile: dbFile(), users: db.users.length, transactions: db.transactions.length, recent: db.transactions.slice(-20).reverse() };
});

export const adminApiCheck = createServerFn({ method: "POST" })
  .inputValidator((input: { check: "games" | "limits" | "self-validate" }) =>
    z.object({ check: z.enum(["games", "limits", "self-validate"]) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./auth.server");
    await requireAdmin();
    if (!slotegratorConfig()) return { status: 0, ok: false, body: "Slotegrator settings are missing on the server" };
    const res =
      data.check === "games"
        ? await slotegratorRequest("GET", "/games", { page: "1" })
        : data.check === "limits"
          ? await slotegratorRequest("GET", "/limits")
          : await slotegratorRequest("POST", "/self-validate");
    let body = res.body;
    if (data.check === "games" && res.ok) {
      const b = res.body as { items?: unknown[]; _meta?: unknown };
      body = { games_on_page: b.items?.length ?? 0, meta: b._meta };
    }
    return { status: res.status, ok: res.ok, body: JSON.stringify(body, null, 2).slice(0, 4000) };
  });
