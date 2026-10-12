import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { verifySkeletalTraceBundle } from "../lib/verify-skeletal-trace-bundle.mjs";

const root = new URL("../", import.meta.url);
const readJson = async (relativePath) => JSON.parse(await readFile(new URL(relativePath, root), "utf8"));
const readNdjson = async (relativePath) => (await readFile(new URL(relativePath, root), "utf8")).trim().split("\n").map(JSON.parse);
const schemas = await Promise.all([
  readJson("lib/schemas/tai-chi-skeletal-trace-frame-v1.schema.json"),
  readJson("lib/schemas/tai-chi-skeletal-trace-manifest-v1.schema.json"),
  readJson("lib/schemas/tai-chi-practice-session-v1.schema.json")
]);

test("synthetic manifest, NDJSON frames, and session satisfy the bounded canonical schema corpus", async () => {
  const result = verifySkeletalTraceBundle({
    schemas,
    manifest: await readJson("test/skeletal-trace-contract-fixtures/positive/trace-manifest.json"),
    frames: await readNdjson("test/skeletal-trace-contract-fixtures/positive/trace-frames.ndjson"),
    session: await readJson("test/skeletal-trace-contract-fixtures/positive/practice-session.json")
  });
  assert.deepEqual(result, { ok: true, errors: [] });
});

test("raw media retention is refused by the manifest contract", async () => {
  const result = verifySkeletalTraceBundle({
    schemas,
    manifest: await readJson("test/skeletal-trace-contract-fixtures/adversarial/raw-image-manifest.json"),
    frames: await readNdjson("test/skeletal-trace-contract-fixtures/positive/trace-frames.ndjson")
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(({ pointer, keyword }) => pointer === "/mediaRetention/containsRawImage" && keyword === "const"));
});

test("raw video is refused in both trace manifests and practice sessions", async () => {
  const manifest = await readJson("test/skeletal-trace-contract-fixtures/positive/trace-manifest.json");
  const session = await readJson("test/skeletal-trace-contract-fixtures/positive/practice-session.json");
  manifest.mediaRetention.containsRawVideo = true;
  session.mediaRetention.containsRawVideo = true;
  const result = verifySkeletalTraceBundle({
    schemas,
    manifest,
    frames: await readNdjson("test/skeletal-trace-contract-fixtures/positive/trace-frames.ndjson"),
    session
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(({ record, pointer, keyword }) => record === "manifest" && pointer === "/mediaRetention/containsRawVideo" && keyword === "const"));
  assert.ok(result.errors.some(({ record, pointer, keyword }) => record === "session" && pointer === "/mediaRetention/containsRawVideo" && keyword === "const"));
});

test("coordinate and joint profiles, plus sensitivity, are mandatory manifest declarations", async () => {
  const manifest = await readJson("test/skeletal-trace-contract-fixtures/positive/trace-manifest.json");
  delete manifest.coordinateSpaceProfile;
  delete manifest.jointSetProfile;
  delete manifest.sensitivity;
  const result = verifySkeletalTraceBundle({
    schemas,
    manifest,
    frames: await readNdjson("test/skeletal-trace-contract-fixtures/positive/trace-frames.ndjson")
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(({ pointer, keyword, message }) => pointer === "" && keyword === "required" && message.includes("coordinateSpaceProfile")));
  assert.ok(result.errors.some(({ pointer, keyword, message }) => pointer === "" && keyword === "required" && message.includes("jointSetProfile")));
  assert.ok(result.errors.some(({ pointer, keyword, message }) => pointer === "" && keyword === "required" && message.includes("sensitivity")));
});

test("frame confidence bounds and cross-frame elapsed-time monotonicity are both enforced", async () => {
  const result = verifySkeletalTraceBundle({
    schemas,
    manifest: await readJson("test/skeletal-trace-contract-fixtures/positive/trace-manifest.json"),
    frames: await readNdjson("test/skeletal-trace-contract-fixtures/adversarial/nonmonotonic-frames.ndjson")
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(({ pointer, keyword }) => pointer === "/joints/left-hip/confidence" && keyword === "maximum"));
  assert.ok(result.errors.some(({ pointer, keyword }) => pointer === "/elapsedTimeMs" && keyword === "monotonicity"));
});

test("returns schema diagnostics instead of throwing for malformed frames during cross-record checks", async () => {
  const manifest = await readJson("test/skeletal-trace-contract-fixtures/positive/trace-manifest.json");
  const result = verifySkeletalTraceBundle({ schemas, manifest, frames: [null] });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(({ record, keyword }) => record === "frames/0" && keyword === "type"));
});
