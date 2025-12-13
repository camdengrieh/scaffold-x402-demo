// Types not coming from the package
declare module "x402-fetch" {
  import { Account } from "viem/accounts";

  export function wrapFetchWithPayment(fetchFn: typeof fetch, account: Account): typeof fetch;

  export function decodeXPaymentResponse(header: string): any;
}
