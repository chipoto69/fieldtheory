import { AuthPanel } from "@/components/auth-panel";
import { OperatorWorkbench } from "@/components/operator-workbench";
import { endpointInventory, targetRegistry, x402EndpointPlans } from "@/lib/fixtures";

export default function Home() {
  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">FT</div>
          <h1>Field Theory Portal</h1>
          <p>Hosted control plane for local-first capture, recall, and agent export contracts.</p>
        </div>
        <nav className="nav" aria-label="Portal sections">
          <a href="#contracts">Contracts</a>
          <a href="#workbench">Workbench</a>
          <a href="#agents">Agents</a>
          <a href="#x402">x402</a>
        </nav>
        <div className="side-note">
          Dry-run only. No GitHub, Hermes, GBrain, wiki, Vercel, or payment write authority is enabled.
        </div>
      </aside>

      <section className="main">
        <div className="topbar">
          <div>
            <h2>Review agent context before anything can act.</h2>
            <p>
              Import an AgentBriefPack or Field Theory export manifest, validate evidence and boundaries,
              then create an audited dry-run plan for Gordo/Aeon, Hermes, or future paid endpoints.
            </p>
          </div>
          <AuthPanel />
        </div>

        <section className="grid" aria-label="Suite metrics">
          <div className="metric">
            <span>contract versions</span>
            <strong>3</strong>
          </div>
          <div className="metric">
            <span>agent targets</span>
            <strong>{targetRegistry.length}</strong>
          </div>
          <div className="metric">
            <span>apply gates</span>
            <strong>disabled</strong>
          </div>
          <div className="metric">
            <span>x402 enforcement</span>
            <strong>off</strong>
          </div>
        </section>

        <section id="workbench">
          <OperatorWorkbench />
        </section>

        <section className="content-grid">
          <div className="panel" id="contracts">
            <h3>Route contracts</h3>
            <p>Public routes expose health and version discovery. Protected routes require Privy and currently emit validation, import-plan, and dry-run records only.</p>
            <div className="endpoint-list">
              {endpointInventory.map((endpoint) => (
                <div className="endpoint-row" key={`${endpoint.method}:${endpoint.route}`}>
                  <span className="method">{endpoint.method}</span>
                  <span>{endpoint.route}</span>
                  <span className={`status ${endpoint.auth === "public" ? "ok" : "warn"}`}>{endpoint.auth}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel" id="agents">
            <h3>Agent handoff lane</h3>
            <div className="timeline">
              {targetRegistry.map((target) => (
                <div className="timeline-item" key={target.id}>
                  <strong>{target.label}</strong>
                  <span>{target.description}</span>
                </div>
              ))}
            </div>
            <pre className="code">{`POST /api/agents/runs
{
  "target": "aeon",
  "importId": "import_...",
  "mode": "dry-run"
}`}</pre>
          </div>
        </section>

        <section className="panel" id="x402">
          <h3>x402 discovery</h3>
          <p>Payment-gated endpoints stay as discovery records until replay protection, facilitator assumptions, and settlement audit are reviewed.</p>
          <div className="endpoint-list">
            {x402EndpointPlans.map((endpoint) => (
              <div className="endpoint-row" key={endpoint.id}>
                <span className="method">{endpoint.method}</span>
                <span>{endpoint.route}</span>
                <span className="status warn">{endpoint.status}</span>
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
