"use client";

import { useEffect, useMemo, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import type { PaymentRequirements } from "@x402/fetch";
import { erc20Abi, formatUnits } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import IVSPlayer from "~~/components/IVSPlayer";
import PaymentRequirementSelector from "~~/components/PaymentRequirementSelector";
import { useX402Payment } from "~~/hooks/useX402Payment";
import { useGlobalState } from "~~/services/store/store";
import { createSelectByRequirement } from "~~/utils/paymentRequiredSelector";

export default function Page() {
  const { hasAccessToStream, setHasAccessToStream } = useGlobalState();
  const { isConnected, address: userAddress } = useAccount();
  const [selectedRequirement, setSelectedRequirement] = useState<PaymentRequirements | null>(null);

  const { pay, status, paymentRequirements } = useX402Payment("/api/stream/access");

  // Auto-select first option with sufficient balance when requirements are loaded
  // Note: This will select the first option initially, but the balance check will happen asynchronously
  useEffect(() => {
    if (paymentRequirements && paymentRequirements.length > 0 && !selectedRequirement) {
      setSelectedRequirement(paymentRequirements[0]);
    }
  }, [paymentRequirements, selectedRequirement]);

  // Fetch balance for selected requirement
  const selectedRequirementContracts = useMemo(() => {
    if (!selectedRequirement || !userAddress) return [];

    const network = selectedRequirement.network || "";
    const chainIdMatch = network.match(/^eip155:(\d+)$/);
    if (!chainIdMatch) return [];

    const chainId = Number.parseInt(chainIdMatch[1], 10);
    const asset = selectedRequirement.asset;
    if (!asset) return [];

    return [
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
  }, [selectedRequirement, userAddress]);

  const { data: selectedTokenData } = useReadContracts({
    contracts: selectedRequirementContracts,
    query: {
      enabled: selectedRequirementContracts.length > 0 && !!userAddress,
    },
  });

  // Check if selected requirement has sufficient balance
  const hasSufficientBalance = useMemo(() => {
    if (!selectedRequirement || !selectedTokenData || selectedTokenData.length < 2) return true;

    const decimalsResult = selectedTokenData[0];
    const balanceResult = selectedTokenData[1];

    const decimals = decimalsResult?.status === "success" ? (decimalsResult.result as number) : undefined;
    const balanceRaw = balanceResult?.status === "success" ? (balanceResult.result as bigint) : undefined;

    if (decimals === undefined || balanceRaw === undefined) return true;

    try {
      const balance = formatUnits(balanceRaw, decimals);
      // @ts-expect-error - amount property exists at runtime
      const requiredAmount = selectedRequirement.amount || selectedRequirement.value || "0";
      const requiredAmountFormatted = formatUnits(BigInt(requiredAmount), decimals);
      return Number.parseFloat(balance) >= Number.parseFloat(requiredAmountFormatted);
    } catch {
      return true; // Default to allowing if we can't parse
    }
  }, [selectedRequirement, selectedTokenData]);

  const handlePayment = async () => {
    if (!selectedRequirement) {
      console.error("Please select a payment option");
      return;
    }

    try {
      const selector = createSelectByRequirement(selectedRequirement);
      const data = await pay(selector, {
        onSuccess: data => {
          setHasAccessToStream(true);
          console.log("Payment successful:", data);
        },
        onError: error => {
          console.error("Payment failed:", error);
        },
      });
      return data;
    } catch (err) {
      console.error("Payment failed:", err);
    }
  };

  //If the user hasn't paid for access we need to show a paywall
  // if status is success we need to set hasAccessToStream to true
  if (!hasAccessToStream) {
    return (
      <div className="flex flex-col gap-4 items-center justify-center h-screen p-4">
        <div className="card bg-base-200 shadow-md w-full max-w-2xl">
          <div className="card-body">
            <h2 className="card-title">Payment requirements</h2>
            {!paymentRequirements && <p className="text-sm opacity-70">Loading payment details...</p>}
            {paymentRequirements && (
              <PaymentRequirementSelector
                paymentRequirements={paymentRequirements}
                selectedRequirement={selectedRequirement}
                onSelect={setSelectedRequirement}
              />
            )}
          </div>
        </div>
        {isConnected ? (
          <div className="flex flex-col gap-2 items-center">
            {!hasSufficientBalance && selectedRequirement && (
              <div className="alert alert-error">
                <span>Insufficient balance</span>
              </div>
            )}
            <button
              className="btn btn-primary text-center justify-center"
              onClick={handlePayment}
              disabled={status === "paying" || !selectedRequirement || !hasSufficientBalance}
            >
              {status === "paying" ? "Paying..." : "Pay"}
            </button>
          </div>
        ) : (
          <ConnectButton />
        )}
      </div>
    );
  }

  const url =
    "https://4c62a87c1810.us-west-2.playback.live-video.net/api/video/v1/us-west-2.049054135175.channel.x7l8bZRqszFc.m3u8";

  return (
    <main>
      <IVSPlayer playbackUrl={url} />
    </main>
  );
}
