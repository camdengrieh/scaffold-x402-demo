import type { SelectPaymentRequirements } from "@x402/core/client";

/**
 * Selector that chooses the first available payment option
 */
export const selectFirstOption: SelectPaymentRequirements = (version, accepts) => {
  if (!accepts || accepts.length === 0) {
    throw new Error("No payment options available");
  }

  return accepts[0];
};
