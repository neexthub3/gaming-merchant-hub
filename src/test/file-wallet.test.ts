// @vitest-environment node
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { withDb, readDb } from "../lib/filedb.server";
import { walletTx, walletRollback, walletBalance, adminAdjust } from "../lib/wallet.server";

const PLAYER = "00000000-0000-4000-8000-000000000001";
const tx = (action: "bet" | "win" | "refund", amount: number, txId: string, refTx = "") =>
  walletTx({ action, playerId: PLAYER, amount, txId, refTx, game: "g", session: "s", type: "" });

beforeEach(async () => {
  process.env["DATA_DIR"] = mkdtempSync(path.join(tmpdir(), "gr-"));
  await withDb((db) => {
    db.users.push({ id: PLAYER, username: "p1", passHash: "", salt: "", balance: 100, isAdmin: false, createdAt: "" });
  });
});

describe("file wallet", () => {
  it("saves players to db.json inside DATA_DIR", async () => {
    expect((await readDb()).users).toHaveLength(1);
  });
  it("a bet reduces the balance", async () => expect((await tx("bet", 30, "b1")).balance).toBe(70));
  it("a bet larger than the balance is refused", async () => {
    expect((await tx("bet", 150, "b1")).error).toBe("INSUFFICIENT_FUNDS");
    expect((await walletBalance(PLAYER)).balance).toBe(100);
  });
  it("the same transaction is never charged twice", async () => {
    await tx("bet", 30, "b1");
    expect((await tx("bet", 30, "b1")).balance).toBe(70);
  });
  it("a win adds to the balance", async () => expect((await tx("win", 25.5, "w1")).balance).toBe(125.5));
  it("a refund returns the bet once", async () => {
    await tx("bet", 30, "b1");
    expect((await tx("refund", 30, "r1", "b1")).balance).toBe(100);
    expect((await tx("refund", 30, "r2", "b1")).balance).toBe(100);
  });
  it("a rollback reverses the bet", async () => {
    await tx("bet", 40, "b1");
    const r = await walletRollback({ playerId: PLAYER, txId: "rb1", items: [{ transaction_id: "b1", action: "bet", amount: "40" }], game: "g", session: "s" });
    expect(r.balance).toBe(100);
  });
  it("admin cannot subtract below zero", async () => {
    await expect(adminAdjust(PLAYER, -101, "test", "admin")).rejects.toThrow();
    expect(await adminAdjust(PLAYER, 50, "credit", "admin")).toBe(150);
  });
});
