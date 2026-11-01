import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflow = fs.readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");

function assertPublicRunnerContract(content) {
  assert.doesNotMatch(content, /runs-on:.*(?:self-hosted|smat-m1|xlarge|large)/i);
  assert.equal(content.match(/^\s*runs-on:\s*macos-15\s*$/gm)?.length, 2);
  assert.equal(content.match(/test "\$\{RUNNER_ENVIRONMENT:-\}" = "github-hosted"/g)?.length, 2);
  assert.equal(content.match(/test "\$\{RUNNER_OS:-\}" = "macOS"/g)?.length, 2);
  assert.equal(content.match(/test "\$\{RUNNER_ARCH:-\}" = "ARM64"/g)?.length, 2);
  assert.equal(content.match(/test "\$\(uname -m\)" = "arm64"/g)?.length, 2);
  assert.doesNotMatch(content, /hostname -s.*Tatsheens-Mini/);
  assert.equal(content.match(/run: npm ci/g)?.length, 2);
  assert.match(content, /run: node --test tests\/\*\.test\.mjs/);
  assert.match(content, /run: npx vitest run --root \. tests\/cored-repair\.test\.ts/);
}

test("Public desktop CI uses isolated free standard macOS ARM64 runners", () => {
  assertPublicRunnerContract(workflow);
});

test("CI policy rejects persistent or larger paid runner labels", () => {
  for (const replacement of ["[self-hosted, macOS, ARM64, smat-m1]", "macos-15-xlarge", "ubuntu-latest"]) {
    assert.throws(() => assertPublicRunnerContract(workflow.replace("runs-on: macos-15", "runs-on: " + replacement)));
  }
});

test("CI policy rejects loss of isolated runner identity check", () => {
  assert.throws(() => assertPublicRunnerContract(workflow.replace('RUNNER_ENVIRONMENT:-}', 'UNTRUSTED_ENVIRONMENT:-}')));
});

test("pre-push npm test actually executes BOTH maintained test suites", () => {
  const packageJson = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(
    packageJson.scripts.test,
    "node --test tests/*.test.mjs && vitest run --root . tests/cored-repair.test.ts",
  );
});
