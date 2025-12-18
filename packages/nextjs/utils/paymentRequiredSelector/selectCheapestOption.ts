import type { SelectPaymentRequirements } from "@x402/core/client";

/**
 * Selector that chooses the cheapest payment option (lowest value)
 */
export const selectCheapestOption: SelectPaymentRequirements = (version, accepts) => {
  if (!accepts || accepts.length === 0) {
    throw new Error("No payment options available");
  }

  // Sort by value and return the cheapest
  const sorted = [...accepts].sort((a, b) => {
    const aValue = BigInt(a.amount);
    const bValue = BigInt(b.amount);
    if (aValue < bValue) return -1;
    if (aValue > bValue) return 1;
    return 0;
  });

  return sorted[0];
};
