import assert from "node:assert/strict";
import test from "node:test";
import { RECORD_TYPES, SCHEMA_IDS, validatePracticeBundle } from "../scripts/tai-chi-practice-computer.mjs";

function schemaValidator(calls = []) {
  return {
    validate(input) { calls.push(input); return { valid: true, diagnostics: [] }; },
  };
}

function mediaRetention() {
  return { containsRawImage: false, containsRawVideo: false, containsRawAudio: false, containsSegmentationMask: false, containsAppearanceEmbedding: false, rawMediaRetention: "none" };
}

function sessionMediaRetention() {
  return { containsRawImage: false, containsRawVideo: false, containsRawAudio: false, rawMediaRetention: "none" };
}

function manifest(traceId, framesPath) {
  return {
    recordType: RECORD_TYPES.traceManifest, schemaVersion: "1.0.0", traceId, createdAt: "2026-08-19T00:00:00.000Z", mediaRetention: mediaRetention(),
    sensitivity: { classification: "sensitive-personal-movement-data", shareAuthorization: "local-only" },
    provenance: { estimatorName: "synthetic", estimatorVersion: "1.0.0", adapterVersion: "1.0.0", projectionVersion: "1.0.0" },
    jointSetProfile: { id: "tai-chi-body", version: "1.0.0" },
    coordinateSpaceProfile: { id: "synthetic-image", version: "1.0.0", dimensions: 2, normalization: "image-normalized" },
    frames: { format: "ndjson", frameSchemaId: SCHEMA_IDS[RECORD_TYPES.traceFrames], path: framesPath },
  };
}

function frames(traceId) {
  return [
    { recordType: "tai-chi-skeletal-trace-frame", schemaVersion: "1.0.0", traceId, elapsedTimeMs: 0, joints: { "left-hip": { position: { x: 0, y: 0 }, confidence: 1 } } },
    { recordType: "tai-chi-skeletal-trace-frame", schemaVersion: "1.0.0", traceId, elapsedTimeMs: 25, joints: { "left-hip": { position: { x: 0.1, y: 0 }, confidence: 1 } } },
  ];
}

function validRecords() {
  const manifestPath = "data/state/2026/08/19/trace-one.manifest.json";
  const framesPath = "data/state/2026/08/19/trace-one.ndjson";
  return [
    { path: "data/state/2026/08/19/session.json", type: RECORD_TYPES.session, value: { recordType: RECORD_TYPES.session, schemaVersion: "1.0.0", sessionId: "session-one", startedAt: "2026-08-19T00:00:00.000Z", endedAt: "2026-08-19T00:01:00.000Z", sensitivity: { classification: "sensitive-personal-practice-data" }, mediaRetention: sessionMediaRetention(), traceReferences: [{ traceId: "trace-one", manifestPath }] } },
    { path: manifestPath, type: RECORD_TYPES.traceManifest, value: manifest("trace-one", framesPath) },
    { path: framesPath, type: RECORD_TYPES.traceFrames, value: frames("trace-one") },
  ];
}

const codes = (result) => result.diagnostics.map((item) => item.code);

test("uses exact science URNs and validates each parsed NDJSON frame through the port", () => {
  const calls = []; const result = validatePracticeBundle({ records: validRecords(), schemaValidator: schemaValidator(calls), schemaCorpus: { bounded: true } });
  assert.equal(result.conformant, true);
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(calls.map(({ schemaId }) => schemaId), [SCHEMA_IDS[RECORD_TYPES.session], SCHEMA_IDS[RECORD_TYPES.traceManifest], SCHEMA_IDS[RECORD_TYPES.traceFrames], SCHEMA_IDS[RECORD_TYPES.traceFrames]]);
  assert.ok(calls.every((call) => call.schemaCorpus.bounded));
});

test("does not use an ambient validator when the explicit schema port is absent", () => {
  const result = validatePracticeBundle({ records: validRecords() });
  assert.equal(result.conformant, false);
  assert.deepEqual(codes(result), ["SCHEMA_VALIDATOR_PORT_REQUIRED"]);
});

test("checks every reference in a session with multiple traces", () => {
  const records = validRecords();
  const secondManifestPath = "data/state/2026/08/19/trace-two.manifest.json";
  const secondFramesPath = "data/state/2026/08/19/trace-two.ndjson";
  records.push({ path: secondManifestPath, type: RECORD_TYPES.traceManifest, value: manifest("trace-two", secondFramesPath) });
  records.push({ path: secondFramesPath, type: RECORD_TYPES.traceFrames, value: frames("trace-two") });
  records[0].value.traceReferences.push({ traceId: "wrong-trace-id", manifestPath: secondManifestPath });
  const result = validatePracticeBundle({ records, schemaValidator: schemaValidator() });
  assert.equal(result.conformant, false);
  assert.deepEqual(codes(result), ["SESSION_TRACE_ID_MISMATCH"]);
});

test("refuses unresolved references and a manifest frame-schema ID other than science's ID", () => {
  const records = validRecords();
  records[0].value.traceReferences[0].manifestPath = "data/state/2026/08/19/missing.json";
  records[1].value.frames.frameSchemaId = "urn:invented:frame-stream:1";
  const result = validatePracticeBundle({ records, schemaValidator: schemaValidator() });
  assert.deepEqual(codes(result), ["REFERENCE_UNRESOLVED", "FRAME_SCHEMA_ID_MISMATCH"]);
});

test("refuses frame identity, non-monotonic time, and coordinate-dimension contradiction", () => {
  const records = validRecords();
  records[2].value[1] = { ...records[2].value[1], traceId: "different-trace", elapsedTimeMs: 0, joints: { "left-hip": { position: { x: 0, y: 0, z: 0 }, confidence: 1 } } };
  const result = validatePracticeBundle({ records, schemaValidator: schemaValidator() });
  assert.deepEqual(codes(result), ["FRAME_COORDINATE_DIMENSIONS_MISMATCH", "FRAME_TRACE_ID_MISMATCH", "FRAME_TIME_NOT_MONOTONE"]);
});

test("refuses raw video and requires nested science-shaped media-retention affirmations", () => {
  const records = validRecords();
  records[1].value.mediaRetention.containsRawVideo = true;
  records[2].value[0].rawVideo = "data:video/webm;base64,nope";
  const result = validatePracticeBundle({ records, schemaValidator: schemaValidator() });
  assert.equal(result.conformant, false);
  assert.ok(codes(result).includes("RAW_MEDIA_REFUSED"));
  assert.ok(codes(result).includes("RAW_MEDIA_AFFIRMATION_MISSING_OR_FALSE"));
});
