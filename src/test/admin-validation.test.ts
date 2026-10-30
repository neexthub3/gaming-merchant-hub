import { describe, expect, it } from "vitest";
import { balanceAdjustmentSchema, signedAdjustment } from "../lib/admin-validation";

const input = { playerId: "00000000-0000-4000-8000-000000000001", amount: 25.50, direction: "add" as const, note: "Manual credit" };
describe("administrator balance control", () => {
  it("adds the chosen balance", () => expect(signedAdjustment(balanceAdjustmentSchema.parse(input))).toBe(25.50));
  it("subtracts the chosen balance", () => expect(signedAdjustment(balanceAdjustmentSchema.parse({ ...input, direction: "subtract" }))).toBe(-25.50));
  it("rejects zero or negative adjustments", () => {
    expect(balanceAdjustmentSchema.safeParse({ ...input, amount: 0 }).success).toBe(false);
    expect(balanceAdjustmentSchema.safeParse({ ...input, amount: -1 }).success).toBe(false);
  });
  it("rejects fractional cents", () => expect(balanceAdjustmentSchema.safeParse({ ...input, amount: 1.001 }).success).toBe(false));
  it("requires an audit reason", () => expect(balanceAdjustmentSchema.safeParse({ ...input, note: " " }).success).toBe(false));
});