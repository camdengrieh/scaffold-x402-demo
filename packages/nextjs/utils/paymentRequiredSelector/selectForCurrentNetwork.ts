import type { SelectPaymentRequirements } from "@x402/core/client";

/**
 * Factory function that creates a selector for the current network
 * @param chainId - The chain ID to match (e.g., 1 for Ethereum mainnet, 11155111 for Sepolia)
 * @returns A SelectPaymentRequirements function that selects the payment option matching the chain ID
 */
export function createSelectForCurrentNetwork(chainId: number): SelectPaymentRequirements {
  return (version, accepts) => {
    if (!accepts || accepts.length === 0) {
      throw new Error("No payment options available");
    }

    // Find the payment requirement that matches the current network
    const selectedPaymentRequirement = accepts.find(option => option.network === `eip155:${chainId}`);
    if (!selectedPaymentRequirement) {
      throw new Error(`No payment option available for current network (eip155:${chainId})`);
    }

    return selectedPaymentRequirement;
  };
}
