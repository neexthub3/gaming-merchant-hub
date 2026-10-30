import { z } from "zod";

export const balanceAdjustmentSchema = z.object({
  playerId: z.string().uuid(),
  amount: z.number().finite().positive().max(100000000).refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.000001, "Use at most two decimal places"),
  direction: z.enum(["add", "subtract"]),
  note: z.string().trim().min(3).max(200),
});

export function signedAdjustment(input: z.infer<typeof balanceAdjustmentSchema>) {
  return input.direction === "subtract" ? -input.amount : input.amount;
}

export async function requireAdminRole(check: () => PromiseLike<{ data: unknown; error: unknown }>) {
  const { data, error } = await check();
  if (error || data !== true) throw new Error("Forbidden");
}