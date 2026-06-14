"use client";

import { useLogin, usePrivy } from "@privy-io/react-auth";
import { isLocalOperatorModeEnabled, localOperatorIdFromEnv } from "@/lib/local-operator";

export function AuthPanel() {
  const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const localOperatorMode = isLocalOperatorModeEnabled();
  const localOperatorId = localOperatorIdFromEnv();
  const baseChainId = process.env.NEXT_PUBLIC_BASE_CHAIN_ID ?? "84532";
  const solanaCluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";

  return (
    <section className="auth-card" aria-label="Authentication status">
      <h3>Privy gate</h3>
      <p>
        {localOperatorMode
          ? "Local operator mode is enabled. Browser requests use unsigned development bearer tokens and still fail closed in production."
          : privyAppId
            ? "Browser app id is configured. Server routes still require verified Privy bearer tokens."
            : "Privy is not configured. Protected routes fail closed until server and browser credentials are installed."}
      </p>
      <div className="button-row">
        {localOperatorMode ? (
          <span className="auth-subject">dev:{localOperatorId ?? "invalid-local-operator"}</span>
        ) : privyAppId ? <PrivyControls /> : (
          <button className="btn" type="button" disabled>
            Privy not configured
          </button>
        )}
      </div>
      <p>GitHub OAuth: scaffolded</p>
      <p>Base EVM chain: {baseChainId}</p>
      <p>Solana cluster: {solanaCluster}</p>
      <p>Local browser operator: {localOperatorMode ? "enabled" : "off"}</p>
      <p>Privy browser SDK: {privyAppId ? "mounted" : "waiting for NEXT_PUBLIC_PRIVY_APP_ID"}</p>
    </section>
  );
}

function PrivyControls() {
  const { ready, authenticated, user, logout } = usePrivy();
  const { login } = useLogin();

  if (!ready) {
    return (
      <button className="btn" type="button" disabled>
        Loading auth
      </button>
    );
  }

  if (!authenticated) {
    return (
      <button className="btn" type="button" onClick={login}>
        Connect Privy
      </button>
    );
  }

  return (
    <>
      <button className="btn secondary" type="button" onClick={logout}>
        Disconnect
      </button>
      <span className="auth-subject">{user?.id ?? "authenticated"}</span>
    </>
  );
}
