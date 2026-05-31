"use client";

const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const baseChainId = process.env.NEXT_PUBLIC_BASE_CHAIN_ID ?? "84532";
const solanaCluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";

export function PortalProviders({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-privy-configured={privyAppId ? "true" : "false"}
      data-base-chain-id={baseChainId}
      data-solana-cluster={solanaCluster}
    >
      {children}
    </div>
  );
}
