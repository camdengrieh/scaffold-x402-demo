"use client";

import { useEffect, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import type { PaymentRequirements } from "@x402/fetch";
import { useAccount } from "wagmi";
import IVSPlayer from "~~/components/IVSPlayer";
import PaymentRequirementSelector from "~~/components/PaymentRequirementSelector";
import { useX402Payment } from "~~/hooks/useX402Payment";
import { useGlobalState } from "~~/services/store/store";
import { createSelectByRequirement } from "~~/utils/paymentRequiredSelector";

export default function Page() {
  const { hasAccessToStream, setHasAccessToStream } = useGlobalState();
  const { isConnected } = useAccount();
  const [selectedRequirement, setSelectedRequirement] = useState<PaymentRequirements | null>(null);

  const { pay, status, paymentRequirements } = useX402Payment("/api/stream/access");

  // Auto-select first option when requirements are loaded
  useEffect(() => {
    if (paymentRequirements && paymentRequirements.length > 0 && !selectedRequirement) {
      setSelectedRequirement(paymentRequirements[0]);
    }
  }, [paymentRequirements, selectedRequirement]);

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
          <button
            className="btn btn-primary text-center justify-center"
            onClick={handlePayment}
            disabled={status === "paying" || !selectedRequirement}
          >
            {status === "paying" ? "Paying..." : "Pay"}
          </button>
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
