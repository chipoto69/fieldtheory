export const supportedContracts = {
  brief: "agent-brief-pack.v1",
  capture: "fieldtheory.capture.v1",
  export: "fieldtheory.agent-export.v1",
} as const;

export const endpointInventory = [
  { route: "/api/health", method: "GET", auth: "public" },
  { route: "/api/contracts", method: "GET", auth: "public" },
  { route: "/api/briefs/validate", method: "POST", auth: "privy-user" },
  { route: "/api/exports/validate", method: "POST", auth: "privy-user" },
  { route: "/api/agents", method: "GET", auth: "privy-user" },
  { route: "/api/agents/runs", method: "POST", auth: "privy-user" },
  { route: "/api/agents/runs/[id]", method: "GET", auth: "artifact-owner" },
  { route: "/api/gordo/import-plan", method: "POST", auth: "privy-user" },
  { route: "/api/hermes/import-plan", method: "POST", auth: "privy-user" },
  { route: "/api/x402/discovery", method: "GET", auth: "public" },
] as const;

export const targetRegistry = [
  {
    id: "aeon",
    label: "Gordo / Aeon",
    description: "Builds an apply-plan preview from Field Theory export bundles. Repository mutation is disabled.",
    applyEnabled: false,
  },
  {
    id: "hermes",
    label: "Hermes",
    description: "Builds a staged profile/task handoff. Kanban, profile, GBrain, and wiki writes are disabled.",
    applyEnabled: false,
  },
  {
    id: "content-os",
    label: "Content OS",
    description: "Reserved for downstream content packaging after brief validation and promotion review.",
    applyEnabled: false,
  },
] as const;

export const x402EndpointPlans = [
  {
    id: "paid-brief-export",
    route: "/api/x402/protected/briefs/:id",
    method: "GET",
    pricePolicy: "unset",
    facilitator: "undecided",
    status: "planned",
  },
  {
    id: "paid-agent-run",
    route: "/api/x402/protected/agents/runs/:id",
    method: "GET",
    pricePolicy: "unset",
    facilitator: "undecided",
    status: "planned",
  },
] as const;
