import type { SelectPaymentRequirements } from "@x402/core/client";
import type { PaymentRequirements } from "@x402/fetch";

/**
 * Creates a selector that matches a specific payment requirement
 * @param selectedRequirement - The payment requirement to match
 * @returns A SelectPaymentRequirements function that selects the matching payment option
 */
export function createSelectByRequirement(selectedRequirement: PaymentRequirements): SelectPaymentRequirements {
  return (version, accepts) => {
    if (!accepts || accepts.length === 0) {
      throw new Error("No payment options available");
    }

    // Find the payment requirement that matches the selected one
    // We match by comparing key properties: network, asset, value, and payTo
    const matched = accepts.find(option => {
      return (
        option.network === selectedRequirement.network &&
        option.asset === selectedRequirement.asset &&
        option.amount === selectedRequirement.amount &&
        option.payTo === selectedRequirement.payTo
      );
    });

    if (!matched) {
      throw new Error("Selected payment requirement not found in available options");
    }

    return matched;
  };
}
