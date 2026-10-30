import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SlotegratorGame } from "./slotegrator-shared";
import { safeEqual } from "./slotegrator-shared";
import { slotegratorConfig, slotegratorRequest, walletDb, walletSecret } from "./slotegrator-core";
import { balanceAdjustmentSchema, signedAdjustment, requireAdminRole } from "./admin-validation";

export const getPublicConfig = createServerFn({ method: "GET" }).handler(async () => {
  return { currency: process.env["SLOTEGRATOR_CURRENCY"] || "USD" };
});

export const listGames = createServerFn({ method: "GET" })
  .inputValidator((input: { page: number }) =>
    z.object({ page: z.number().int().min(1).max(10000) }).parse(input),
  )
  .handler(async ({ data }) => {
    if (!slotegratorConfig()) {
      return { ok: false as const, error: "config", games: [], pageCount: 0, total: 0 };
    }
    const res = await slotegratorRequest("GET", "/games", { page: String(data.page) });
    if (!res.ok) {
      console.error("Slotegrator /games failed", res.status, res.body);
      return { ok: false as const, error: `http_${res.status}`, games: [], pageCount: 0, total: 0 };
    }
    const body = res.body as {
      items?: SlotegratorGame[];
      _meta?: { pageCount?: number; totalCount?: number };
    };
    return {
      ok: true as const,
      error: null,
      games: body.items ?? [],
      pageCount: body._meta?.pageCount ?? Number(res.headers?.get("X-Pagination-Page-Count") ?? 1),
      total: body._meta?.totalCount ?? Number(res.headers?.get("X-Pagination-Total-Count") ?? 0),
    };
  });

const launchSchema = z.object({
  gameUuid: z.string().min(1).max(100),
  returnUrl: z.string().url().max(500),
  mobile: z.boolean(),
});

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
      return { ok: false as const, url: null };
    }
    return { ok: true as const, url };
  });

/** Real-money session for the signed-in player. Balance lives in our database (seamless wallet). */
export const initReal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof launchSchema>) => launchSchema.parse(input))
  .handler(async ({ data, context }) => {
    const cfg = slotegratorConfig();
    if (!cfg) return { ok: false as const, url: null, error: "config" };
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("username, balance")
      .eq("id", context.userId)
      .maybeSingle();
    if (!profile) return { ok: false as const, url: null, error: "no_profile" };
    if (Number(profile.balance) <= 0) return { ok: false as const, url: null, error: "no_balance" };
    const res = await slotegratorRequest("POST", "/games/init", {
      game_uuid: data.gameUuid,
      player_id: context.userId,
      player_name: profile.username,
      currency: cfg.currency,
      session_id: crypto.randomUUID(),
      device: data.mobile ? "mobile" : "desktop",
      return_url: data.returnUrl,
      language: "en",
    });
    const url = (res.body as { url?: string })?.url;
    if (!res.ok || !url) {
      console.error("Slotegrator init failed", res.status, res.body);
      return { ok: false as const, url: null, error: `http_${res.status}` };
    }
    return { ok: true as const, url, error: null };
  });

async function assertAdmin(context: {
  supabase: ReturnType<typeof walletDb>;
  userId: string;
}) {
  await requireAdminRole(() => context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  }));
}

/** First-time admin setup: a signed-in user enters the server-side setup code once. */
export const claimAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { code: string }) =>
    z.object({ code: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const expected = process.env["ADMIN_SETUP_CODE"];
    if (!expected || expected.length < 12 || !safeEqual(data.code, expected)) return { ok: false as const };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("claim_first_admin", {
      p_user: context.userId,
    });
    if (error) {
      console.error("claim_admin failed", error);
      return { ok: false as const };
    }
    return { ok: true as const };
  });

export const adminPlayers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { search: string }) => z.object({ search: z.string().trim().max(100) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: players, error } = await context.supabase.rpc("admin_players", { p_search: data.search });
    if (error) throw new Error("Player list is unavailable");
    return players ?? [];
  });

export const adminAdjustBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => balanceAdjustmentSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: balance, error } = await context.supabase.rpc("admin_adjust_balance", {
      p_player: data.playerId, p_amount: signedAdjustment(data), p_note: data.note,
    });
    if (error) throw new Error("Balance change was rejected. Check the available balance and try again.");
    return { balance: Number(balance) };
  });

/** Admin-only live checks against the Slotegrator API. */
export const adminApiCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { check: "games" | "limits" | "self-validate" }) =>
    z.object({ check: z.enum(["games", "limits", "self-validate"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const cfg = slotegratorConfig();
    if (!cfg) return { status: 0, ok: false, body: "Slotegrator settings are missing on the server" };
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
