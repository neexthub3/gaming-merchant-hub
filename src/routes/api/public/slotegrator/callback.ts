import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  buildSignString,
  hmacSha1Hex,
  parseFormBody,
  safeEqual,
  toList,
} from "@/lib/slotegrator-shared";
import { slotegratorConfig, walletDb, walletSecret } from "@/lib/slotegrator-core";

// Seamless-wallet endpoint Slotegrator calls for balance / bet / win / refund / rollback.
// Give Slotegrator this URL: https://<your-domain>/api/public/slotegrator/callback

const fail = (code: "INSUFFICIENT_FUNDS" | "INTERNAL_ERROR", description: string) =>
  Response.json({ error_code: code, error_description: description });

const amount = z.coerce.number().min(0).max(1e9);
const playerId = z.string().uuid();
const txId = z.string().min(1).max(200);
const opt = z.string().max(200).optional();

export const Route = createFileRoute("/api/public/slotegrator/callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cfg = slotegratorConfig();
        if (!cfg) return fail("INTERNAL_ERROR", "Server not configured");

        const raw = await request.text();
        const isJson = (request.headers.get("content-type") ?? "").includes("json");
        let body: Record<string, unknown>;
        try {
          body = isJson ? JSON.parse(raw || "{}") : parseFormBody(raw);
        } catch {
          return fail("INTERNAL_ERROR", "Bad body");
        }

        const merchantId = request.headers.get("X-Merchant-Id") ?? "";
        const timestamp = request.headers.get("X-Timestamp") ?? "";
        const nonce = request.headers.get("X-Nonce") ?? "";
        const sign = (request.headers.get("X-Sign") ?? "").toLowerCase();
        if (!safeEqual(merchantId, cfg.merchantId)) return fail("INTERNAL_ERROR", "Wrong merchant");
        if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 60) {
          return fail("INTERNAL_ERROR", "Request expired");
        }
        const expected = await hmacSha1Hex(
          cfg.merchantKey,
          buildSignString({
            ...(body as Record<string, string>),
            "X-Merchant-Id": merchantId,
            "X-Timestamp": timestamp,
            "X-Nonce": nonce,
          }),
        );
        if (!safeEqual(sign, expected)) return fail("INTERNAL_ERROR", "Invalid signature");

        const db = walletDb();
        const secret = walletSecret();
        const action = String(body["action"] ?? "");

        try {
          const pid = playerId.safeParse(body["player_id"]);
          if (!pid.success) return fail("INTERNAL_ERROR", "Player not found");

          let result: Record<string, unknown> | null = null;
          if (action === "balance") {
            const { data, error } = await db.rpc("wallet_balance", { p_secret: secret, p_player: pid.data });
            if (error) throw error;
            result = data as Record<string, unknown>;
          } else if (action === "bet" || action === "win" || action === "refund") {
            const p = z
              .object({
                amount,
                transaction_id: txId,
                bet_transaction_id: opt,
                game_uuid: opt,
                session_id: opt,
                type: opt,
              })
              .parse(body);
            const { data, error } = await db.rpc("wallet_tx", {
              p_secret: secret,
              p_action: action,
              p_player: pid.data,
              p_amount: p.amount,
              p_tx: p.transaction_id,
              p_ref_tx: p.bet_transaction_id ?? "",
              p_game: p.game_uuid ?? "",
              p_session: p.session_id ?? "",
              p_type: p.type ?? "",
            });
            if (error) throw error;
            result = data as Record<string, unknown>;
          } else if (action === "rollback") {
            const p = z
              .object({ transaction_id: txId, game_uuid: opt, session_id: opt })
              .parse(body);
            const items = toList(body["rollback_transactions"]).map((t) => ({
              transaction_id: String(t["transaction_id"] ?? ""),
              action: String(t["action"] ?? ""),
              amount: String(t["amount"] ?? "0"),
            }));
            const { data, error } = await db.rpc("wallet_rollback", {
              p_secret: secret,
              p_player: pid.data,
              p_tx: p.transaction_id,
              p_items: items,
              p_game: p.game_uuid ?? "",
              p_session: p.session_id ?? "",
            });
            if (error) throw error;
            result = data as Record<string, unknown>;
          } else {
            return fail("INTERNAL_ERROR", "Unknown action");
          }

          if (result?.["error"] === "INSUFFICIENT_FUNDS") {
            return fail("INSUFFICIENT_FUNDS", "Not enough money to continue playing");
          }
          if (result?.["error"]) return fail("INTERNAL_ERROR", String(result["error"]));
          const out: Record<string, unknown> = { balance: Number(result?.["balance"] ?? 0) };
          if (result?.["transaction_id"]) out["transaction_id"] = result["transaction_id"];
          if (result?.["rollback_transactions"]) out["rollback_transactions"] = result["rollback_transactions"];
          return Response.json(out);
        } catch (e) {
          console.error("Slotegrator callback error", action, e);
          return fail("INTERNAL_ERROR", "Internal error");
        }
      },
    },
  },
});
