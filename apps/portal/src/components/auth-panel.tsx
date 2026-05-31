"use client";

export function AuthPanel() {
  const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const baseChainId = process.env.NEXT_PUBLIC_BASE_CHAIN_ID ?? "84532";
  const solanaCluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";

  return (
    <section className="auth-card" aria-label="Authentication status">
      <h3>Privy gate</h3>
      <p>
        {privyAppId
          ? "Browser app id is configured. Server routes still require verified Privy bearer tokens."
          : "Privy is not configured. Protected routes fail closed until server and browser credentials are installed."}
      </p>
      <div className="button-row">
        <button className="btn" type="button" disabled>
          Connect disabled
        </button>
      </div>
      <p>GitHub OAuth: scaffolded</p>
      <p>Base EVM chain: {baseChainId}</p>
      <p>Solana cluster: {solanaCluster}</p>
      <p>Privy browser SDK: deferred to auth hardening gate</p>
    </section>
  );
}
