import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflow = fs.readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");

test("CI is pinned to the approved physical M1 and runs maintained tests", () => {
  assert.doesNotMatch(workflow, /ubuntu-latest|macos-latest|windows-latest/);
  assert.equal(
    workflow.match(/^\s*runs-on:\s*\[self-hosted, smat-m1\]\s*$/gm)?.length,
    2,
  );
  assert.equal(workflow.match(/test "\$\{RUNNER_OS:-\}" = "macOS"/g)?.length, 2);
  assert.equal(workflow.match(/test "\$\{RUNNER_ARCH:-\}" = "ARM64"/g)?.length, 2);
  assert.equal(workflow.match(/test "\$\(hostname -s\)" = "Tatsheens-Mini"/g)?.length, 2);
  assert.equal(workflow.match(/run: npm ci/g)?.length, 2);
  assert.match(workflow, /run: node --test tests\/\*\.test\.mjs/);
  assert.match(workflow, /run: npx vitest run --root \. tests\/cored-repair\.test\.ts/);
});
