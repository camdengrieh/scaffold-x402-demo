import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { registerExactEvmScheme } from "@x402/evm/exact/server";
import { paymentProxy } from "@x402/next";
import { createPaywall } from "@x402/paywall";
import { evmPaywall } from "@x402/paywall/evm";

const facilitatorUrl = process.env.NEXT_PUBLIC_FACILITATOR_URL as string;
const payTo = process.env.RESOURCE_WALLET_ADDRESS as `0x${string}`;

if (!facilitatorUrl || !payTo) {
  console.error("Provide the Facilitaor URL and the payTo address");
  process.exit(1);
}

const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });

const server = new x402ResourceServer(facilitatorClient);

registerExactEvmScheme(server);

const paywall = createPaywall()
  .withNetwork(evmPaywall)
  .withConfig({
    appName: "Scaffold Substack",
    appLogo: "/thumbnail.jpg",
    testnet: true,
  })
  .build();

export const proxy = paymentProxy(
  {
    "/api/stream/access": {
      accepts: [
        {
          scheme: "exact",
          price: "$0.01",
          network: "eip155:84532",
          payTo,
        },
        {
          scheme: "exact",
          price: "$0.01",
          network: "eip155:8453",
          payTo,
        },
      ],
    },
    "/payment/builder": {
      accepts: [
        {
          scheme: "exact",
          price: "$0.01",
          network: "eip155:84532",
          payTo,
        },
      ],
    },
  },
  server,
  undefined,
  paywall,
);

// Configure which paths the middleware should run on
export const config = {
  matcher: ["/api/stream/access/:path*"],
};
