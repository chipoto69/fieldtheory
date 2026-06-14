"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import type { ReactNode } from "react";

const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const baseChainId = process.env.NEXT_PUBLIC_BASE_CHAIN_ID ?? "84532";
const solanaCluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";

export function PortalProviders({ children }: { children: ReactNode }) {
  const content = (
    <div
      data-privy-configured={privyAppId ? "true" : "false"}
      data-base-chain-id={baseChainId}
      data-solana-cluster={solanaCluster}
    >
      {children}
    </div>
  );

  if (!privyAppId) return content;

  return <PrivyProvider appId={privyAppId}>{content}</PrivyProvider>;
}
