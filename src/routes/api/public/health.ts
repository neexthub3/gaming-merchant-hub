import { createFileRoute } from "@tanstack/react-router";
import { safeEqual } from "@/lib/slotegrator-shared";
import { slotegratorConfig, slotegratorRequest } from "@/lib/slotegrator-core";

// GET /api/public/health → {"ok":true}
// Full check: send header "x-admin-code: <ADMIN_SETUP_CODE>".
export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const code = request.headers.get("x-admin-code") ?? "";
        const expected = process.env["ADMIN_SETUP_CODE"] ?? "";
        if (!expected || !safeEqual(code, expected)) {
          return Response.json({ ok: true, time: new Date().toISOString() });
        }

        let database = "fail";
        let dbPath = "";
        try {
          const { dbFile, readDb, withDb } = await import("@/lib/filedb.server");
          dbPath = dbFile();
          await withDb(() => undefined); // proves the folder is writable
          const db = await readDb();
          database = `ok (${db.users.length} players)`;
        } catch (e) {
          database = `fail: ${String(e)}`;
        }

        let serverIp = "unknown";
        try {
          serverIp = (await (await fetch("https://api.ipify.org")).text()).trim();
        } catch {
          /* ignore */
        }

        const games = await slotegratorRequest("GET", "/games", { page: "1" });
        const gamesCount = games.ok ? ((games.body as { items?: unknown[] }).items?.length ?? 0) : 0;

        return Response.json({
          ok: !!slotegratorConfig() && database.startsWith("ok") && games.ok,
          slotegratorConfigured: !!slotegratorConfig(),
          database,
          dbPath,
          serverIp,
          slotegrator: {
            status: games.status,
            ok: games.ok,
            gamesOnFirstPage: gamesCount,
            response: games.ok ? undefined : games.body,
            hint: games.ok
              ? "Slotegrator API works"
              : games.status === 406 || games.status === 403
                ? `Slotegrator is blocking this server. Ask them to whitelist IP ${serverIp}`
                : "Slotegrator not reachable — check API URL / credentials",
          },
        });
      },
    },
  },
});
