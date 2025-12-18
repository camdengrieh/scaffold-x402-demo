"use client";

import { useMemo } from "react";
import type { PaymentRequirements } from "@x402/fetch";
import { erc20Abi, formatUnits } from "viem";
import type { Chain } from "viem";
import * as allChains from "viem/chains";
import { createConfig, http } from "wagmi";
import { useAccount, useReadContracts } from "wagmi";

interface PaymentRequirementSelectorProps {
  paymentRequirements: PaymentRequirements[];
  selectedRequirement: PaymentRequirements | null;
  onSelect: (requirement: PaymentRequirements) => void;
}

/**
 * Extracts chain ID from network string (e.g., "eip155:1" -> 1)
 */
function extractChainId(network: string): number | undefined {
  if (network.startsWith("eip155:")) {
    const chainId = network.split(":")[1];
    return Number.parseInt(chainId, 10);
  }
  return undefined;
}

/**
 * Gets chain object from chainId by looking it up in all viem chains
 */
function getChainFromId(chainId: number): Chain | undefined {
  // Find the chain in allChains by matching the id
  for (const chain of Object.values(allChains)) {
    if (typeof chain === "object" && chain !== null && "id" in chain && chain.id === chainId) {
      return chain as Chain;
    }
  }
  return undefined;
}

/**
 * Formats network string to readable format using chainId (e.g., 1 -> "Ethereum Mainnet")
 */
function formatNetworkFromChainId(chainId: number): string {
  const chainIdMap: Record<number, string> = {
    1: "Ethereum Mainnet",
    11155111: "Sepolia",
    84532: "Base Sepolia",
    8453: "Base",
    137: "Polygon",
    80001: "Mumbai",
    10: "Optimism",
    7777777: "Zora",
  };
  return chainIdMap[chainId] || `Chain ID ${chainId}`;
}

export default function PaymentRequirementSelector({
  paymentRequirements,
  selectedRequirement,
  onSelect,
}: PaymentRequirementSelectorProps) {
  const { address: userAddress } = useAccount();
  // Extract unique chainIds from payment requirements
  const uniqueChainIds = useMemo(() => {
    const chainIds = (paymentRequirements || [])
      .map(req => extractChainId(req.network || ""))
      .filter((id): id is number => id !== undefined);
    return Array.from(new Set(chainIds));
  }, [paymentRequirements]);

  // Create wagmi config with chains from payment requirements
  const config = useMemo(() => {
    const chains: Chain[] = [];
    for (const chainId of uniqueChainIds) {
      const chain = getChainFromId(chainId);
      if (chain) {
        chains.push(chain);
      }
    }

    if (chains.length === 0) return null;

    const transports: Record<number, ReturnType<typeof http>> = {};
    chains.forEach(chain => {
      transports[chain.id] = http();
    });

    // Type assertion needed because createConfig expects a non-empty tuple
    return createConfig({
      chains: chains as [Chain, ...Chain[]],
      transports,
    });
  }, [uniqueChainIds]);

  // Build contracts array for useReadContracts (memoized to prevent unnecessary re-renders)
  const contracts = useMemo(() => {
    return (paymentRequirements || []).flatMap(requirement => {
      const chainId = extractChainId(requirement.network || "");
      const asset = requirement.asset;

      if (!chainId || !asset) return [];

      return [
        {
          address: asset as `0x${string}`,
          abi: erc20Abi,
          functionName: "name" as const,
          chainId,
        },
        {
          address: asset as `0x${string}`,
          abi: erc20Abi,
          functionName: "symbol" as const,
          chainId,
        },
        {
          address: asset as `0x${string}`,
          abi: erc20Abi,
          functionName: "decimals" as const,
          chainId,
        },
        {
          address: asset as `0x${string}`,
          abi: erc20Abi,
          functionName: "balanceOf" as const,
          args: [userAddress],
          chainId,
        },
      ];
    });
  }, [paymentRequirements, userAddress]);

  // Fetch token data for all requirements (hook must be called before early return)
  const {
    data: tokenData,
    isLoading,
    error,
  } = useReadContracts({
    config: config || undefined,
    contracts,
    query: {
      enabled: contracts.length > 0 && config !== null && !!userAddress,
    },
  });

  if (!paymentRequirements || paymentRequirements.length === 0) {
    return <div className="text-sm opacity-70">No payment options available</div>;
  }

  // Map token data back to requirements
  const getTokenInfo = (requirement: PaymentRequirements, index: number) => {
    if (!tokenData || tokenData.length === 0) {
      return {
        name: undefined,
        symbol: undefined,
        decimals: undefined,
        balance: undefined,
      };
    }

    const baseIndex = index * 4;
    const nameResult = tokenData[baseIndex];
    const symbolResult = tokenData[baseIndex + 1];
    const decimalsResult = tokenData[baseIndex + 2];
    const balanceResult = tokenData[baseIndex + 3];

    const name = nameResult?.status === "success" ? (nameResult.result as string) : undefined;
    const symbol = symbolResult?.status === "success" ? (symbolResult.result as string) : undefined;
    const decimals = decimalsResult?.status === "success" ? (decimalsResult.result as number) : undefined;
    const balanceRaw = balanceResult?.status === "success" ? (balanceResult.result as bigint) : undefined;

    // Format balance using the token decimals
    let balance: string | undefined;
    if (balanceRaw !== undefined && decimals !== undefined) {
      try {
        balance = formatUnits(balanceRaw, decimals);
      } catch {
        balance = undefined;
      }
    }

    return {
      name,
      symbol,
      decimals,
      balance,
    };
  };

  return (
    <div className="space-y-2">
      <h3 className="font-semibold text-sm mb-3">Select Payment Option</h3>
      {error && (
        <div className="alert alert-error mb-4">
          <span>Error loading token data: {error.message}</span>
        </div>
      )}
      {paymentRequirements.map((requirement, index) => {
        const chainId = extractChainId(requirement.network || "");
        const tokenInfo = getTokenInfo(requirement, index);
        const isSelected = selectedRequirement === requirement;

        // Format amount with fetched decimals
        let amount: string | undefined;
        if (tokenInfo.decimals !== undefined) {
          try {
            // @ts-expect-error - value property exists at runtime but may not be in type definition
            const value = requirement.value || requirement.amount || "0";
            amount = formatUnits(BigInt(value), tokenInfo.decimals as number);
          } catch {
            // @ts-expect-error - value property exists at runtime but may not be in type definition
            amount = String(requirement.value || requirement.amount || "0");
          }
        }

        return (
          <button
            key={index}
            onClick={() => onSelect(requirement)}
            disabled={isLoading}
            className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
              isSelected ? "border-primary bg-primary/10" : "border-base-300 hover:border-primary/50"
            } ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  {chainId && <span className="font-semibold">{formatNetworkFromChainId(chainId)}</span>}
                  {isLoading ? (
                    <span className="text-xs opacity-70">Loading...</span>
                  ) : tokenInfo.symbol ? (
                    <span className="text-xs opacity-70">({tokenInfo.symbol})</span>
                  ) : (
                    <span className="text-xs opacity-70 text-error">Failed to load</span>
                  )}
                </div>
                {isLoading ? (
                  <div className="text-sm">
                    <span className="loading loading-spinner loading-xs mr-2"></span>
                    <span className="opacity-70">Loading token data...</span>
                  </div>
                ) : tokenInfo.symbol && amount ? (
                  <div className="text-sm space-y-1">
                    <div>
                      <span className="opacity-70">Amount: </span>
                      <span className="font-medium">
                        {amount} {tokenInfo.symbol}
                      </span>
                    </div>
                    {tokenInfo.balance !== undefined && (
                      <div>
                        <span className="opacity-70">Your balance: </span>
                        <span
                          className={
                            Number.parseFloat(tokenInfo.balance) >= Number.parseFloat(amount)
                              ? "text-success"
                              : "text-error"
                          }
                        >
                          {tokenInfo.balance} {tokenInfo.symbol}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-error">Failed to load token information</div>
                )}
              </div>
              <div className="ml-4">
                {isSelected && (
                  <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <svg className="w-3 h-3 text-primary-content" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
