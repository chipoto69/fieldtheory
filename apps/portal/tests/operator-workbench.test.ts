import test from "node:test";
import assert from "node:assert/strict";
import { importIdForRun } from "../src/components/operator-workbench";
import { buildWorkbenchRunIdempotencyKey } from "../src/lib/workbench-idempotency";

test("operator workbench can derive an inspectable import id from run detail", () => {
  assert.equal(importIdForRun({ importId: "import_abc123" }), "import_abc123");
  assert.equal(importIdForRun({ importId: " import_abc123 " }), "import_abc123");
  assert.equal(importIdForRun({ importId: "" }), undefined);
  assert.equal(importIdForRun({ importId: " " }), undefined);
  assert.equal(importIdForRun({ importId: null }), undefined);
  assert.equal(importIdForRun(undefined), undefined);
});

test("operator workbench builds stable route-safe dry-run idempotency keys", () => {
  const first = buildWorkbenchRunIdempotencyKey("aeon", "import_abc123");
  const retry = buildWorkbenchRunIdempotencyKey("aeon", "import_abc123");
  const otherTarget = buildWorkbenchRunIdempotencyKey("hermes", "import_abc123");
  const otherImport = buildWorkbenchRunIdempotencyKey("aeon", "import_def456");

  assert.equal(first, "workbench:aeon:import_abc123");
  assert.equal(retry, first);
  assert.notEqual(otherTarget, first);
  assert.notEqual(otherImport, first);
  assert.match(first, /^[A-Za-z0-9_./:@=-]+$/);
  assert.ok(first.length <= 160);
});

test("operator workbench idempotency keys trim import ids and cap API length", () => {
  const key = buildWorkbenchRunIdempotencyKey("content-os", ` ${"a".repeat(220)} ?? `);

  assert.equal(key.startsWith("workbench:content-os:"), true);
  assert.equal(key.includes(" "), false);
  assert.equal(key.includes("?"), false);
  assert.equal(key.length, 160);
});
