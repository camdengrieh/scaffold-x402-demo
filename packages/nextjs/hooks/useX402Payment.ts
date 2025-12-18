import { useCallback, useEffect, useState } from "react";
import { SelectPaymentRequirements, x402Client } from "@x402/core/client";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import type { ClientEvmSigner } from "@x402/evm";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { PaymentRequirements, decodePaymentResponseHeader, wrapFetchWithPayment } from "@x402/fetch";
import { publicActions } from "viem";
import type { Account, WalletClient } from "viem";
import { useAccount, useWalletClient } from "wagmi";

/**
 * Converts a wagmi/viem WalletClient to a ClientEvmSigner for x402Client
 *
 * @param walletClient - The wagmi wallet client from useWalletClient()
 * @returns ClientEvmSigner compatible with ExactEvmClient
 */
export function wagmiToClientSigner(walletClient: WalletClient): ClientEvmSigner {
  if (!walletClient.account) {
    throw new Error("Wallet client must have an account");
  }

  return {
    address: walletClient.account.address as `0x${string}`,
    signTypedData: async message => {
      const signature = await walletClient.signTypedData({
        account: walletClient.account as Account,
        domain: message.domain,
        types: message.types,
        primaryType: message.primaryType,
        message: message.message,
      });
      return signature;
    },
  };
}

/**
 * Hook options
 */
export interface UseX402PaymentOptions {
  /**
   * Maximum allowed payment amount (in token base units)
   * Defaults to 0.1 USDC = 10^5
   */
  maxValue?: bigint;
}

/**
 * Payment status type
 */
export type PaymentStatus = "idle" | "paying" | "success" | "error";

/**
 * Variables passed to the pay function
 */
export interface PayVariables {
  url: string;
}

/**
 * Optional callbacks for the pay function, modelled after wagmi's writeContract
 */
export interface PayCallbacks<TContext = unknown> {
  onSuccess?: (data: any, variables: PayVariables, context: TContext) => void | Promise<void>;
  onError?: (error: unknown, variables: PayVariables, context: TContext | undefined) => void | Promise<void>;
  onSettled?: (
    data: any | undefined,
    error: unknown | null,
    variables: PayVariables,
    context: TContext | undefined,
  ) => void | Promise<void>;
}

// Re-export SelectPaymentRequirements for convenience
export type { SelectPaymentRequirements };

/**
 * React Hook for handling x402x payments
 *
 * Provides a simple interface for making paid API requests with automatic
 * 402 handling and settlement mode support.
 *
 * @param url - The URL to use for payment-related requests
 * @returns Payment state and methods
 */
export function useX402Payment(url: string) {
  const [status, setStatus] = useState<PaymentStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [paymentRequirements, setPaymentRequirements] = useState<PaymentRequirements[] | null>(null);

  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();

  /**
   * Call API to get payment options and store in state
   */
  const fetchPaymentRequirements = useCallback(async () => {
    try {
      const response = await fetch(url);
      const paymentRequiredHeader = response.headers.get("PAYMENT-REQUIRED");

      if (!paymentRequiredHeader) {
        console.warn("No PAYMENT-REQUIRED header found in response");
        setPaymentRequirements(null);
        return null;
      }

      const headerDecoded = decodePaymentRequiredHeader(paymentRequiredHeader);

      if (headerDecoded?.accepts) {
        setPaymentRequirements(headerDecoded.accepts);
        return headerDecoded.accepts;
      }

      setPaymentRequirements(null);
      return null;
    } catch (err) {
      console.error("Failed to fetch payment requirements:", err);
      setPaymentRequirements(null);
      return null;
    }
  }, [url]);

  /**
   * Automatically fetch payment requirements when the URL changes
   */
  useEffect(() => {
    void fetchPaymentRequirements().catch(err => {
      console.error("Error fetching payment requirements:", err);
    });
  }, [fetchPaymentRequirements]);

  /**
   * Make a paid API request
   *
   * @param paymentRequiredSelector - Optional selector function to choose which payment requirement to use
   * @param callbacks - Optional lifecycle callbacks (onSuccess, onError, onSettled)
   * @returns The response data (parsed JSON)
   */
  const pay = useCallback(
    async (paymentRequiredSelector?: SelectPaymentRequirements, callbacks?: PayCallbacks) => {
      if (!walletClient) {
        const error = "No wallet client available. Make sure wallet is connected.";
        setStatus("error");
        setError(error);
        throw new Error(error);
      }

      const variables: PayVariables = { url };

      setStatus("paying");
      setError(null);

      const context = undefined;

      try {
        // Extend wagmi's wallet client with publicActions to make it compatible with Signer type
        const extendedWalletClient = walletClient.extend(publicActions);
        const signer = wagmiToClientSigner(extendedWalletClient);

        // Use provided selector or default to first available option
        const selector: SelectPaymentRequirements =
          paymentRequiredSelector ||
          ((version, accepts) => {
            if (!accepts || accepts.length === 0) {
              throw new Error("No payment options available");
            }
            return accepts[0];
          });

        const client = new x402Client(selector).register("eip155:*", new ExactEvmScheme(signer));

        const fetchWithPayment = wrapFetchWithPayment(fetch, client);

        const response = await fetchWithPayment(url, {
          method: "GET",
        });

        // Optionally decode the payment response header
        const paymentResponse = response.headers.get("PAYMENT-RESPONSE");
        if (paymentResponse) {
          const decoded = decodePaymentResponseHeader(paymentResponse);
          console.log("Payment details:", decoded);
        }

        // Clone before consuming body so the original response can still be used by external callers if needed
        const clonedResponse = response.clone();
        const data = await clonedResponse.json();

        if (!response.ok) {
          throw new Error(`Request failed: ${response.status} ${response.statusText}`);
        }

        setResult(data);
        setStatus("success");

        if (callbacks?.onSuccess) {
          await callbacks.onSuccess(data, variables, context);
        }

        if (callbacks?.onSettled) {
          await callbacks.onSettled(data, null, variables, context);
        }

        return data;
      } catch (err: any) {
        const errorMessage = err?.message || "Unknown error occurred";
        setError(errorMessage);
        setStatus("error");

        if (callbacks?.onError) {
          await callbacks.onError(err, variables, context);
        }

        if (callbacks?.onSettled) {
          await callbacks.onSettled(undefined, err, variables, context);
        }

        throw err;
      }
    },
    [walletClient, url],
  );

  /**
   * Reset the hook state
   */
  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
    setResult(null);
  }, []);

  return {
    /**
     * Current payment status
     */
    status,

    /**
     * Error message (if any)
     */
    error,

    /**
     * Result data from successful payment (if any)
     */
    result,

    /**
     * User's connected wallet address
     */
    address,

    /**
     * Whether wallet is connected
     */
    isConnected: !!walletClient,

    /**
     * Latest fetched payment requirements (if any)
     */
    paymentRequirements,

    /**
     * Fetch payment requirements and update state
     */
    fetchPaymentRequirements,

    /**
     * Make a paid API request
     */
    pay,

    /**
     * Reset the hook state
     */
    reset,
  };
}
