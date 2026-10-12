/** Pure conformance over caller-supplied, parsed portable-practice records. */

import { isObjectRecord } from "@red-cup-engineering/json-services-section";

export const RECORD_TYPES = Object.freeze({
  session: "tai-chi-practice-session",
  traceManifest: "tai-chi-skeletal-trace-manifest",
  // A bundle transport kind: value is parsed NDJSON; each member is a science frame.
  traceFrames: "tai-chi-skeletal-trace-frames",
});

export const SCHEMA_IDS = Object.freeze({
  [RECORD_TYPES.session]: "urn:red-cup-science:tai-chi:practice-session:1.0.0",
  [RECORD_TYPES.traceManifest]: "urn:red-cup-science:tai-chi:skeletal-trace-manifest:1.0.0",
  [RECORD_TYPES.traceFrames]: "urn:red-cup-science:tai-chi:skeletal-trace-frame:1.0.0",
});

const REQUIRED_MANIFEST_MEDIA_RETENTION = Object.freeze({
  containsRawImage: false,
  containsRawVideo: false,
  containsRawAudio: false,
  containsSegmentationMask: false,
  containsAppearanceEmbedding: false,
  rawMediaRetention: "none",
});
const REQUIRED_SESSION_MEDIA_RETENTION = Object.freeze({
  containsRawImage: false,
  containsRawVideo: false,
  containsRawAudio: false,
  rawMediaRetention: "none",
});
const RAW_MEDIA_FIELD_NAMES = new Set([
  "rawimage", "rawimages", "image", "images", "rawvideo", "rawvideos",
  "video", "videos", "rawaudio", "rawaudios", "audio", "audios",
  "segmentationmask", "segmentationmasks", "thumbnail", "thumbnails",
  "appearanceembedding", "appearanceembeddings", "facialembedding", "facialembeddings",
  "containsrawimage", "containsrawvideo", "containsrawaudio",
  "containssegmentationmask", "containsappearanceembedding",
]);

/**
 * Validates only caller-supplied parsed values. It cannot read a directory,
 * decode a stream, resolve schemas, or retain camera media.
 */
export function validatePracticeBundle(input) {
  const diagnostics = [];
  if (!isPlainObject(input)) return result([diagnostic("INPUT_NOT_OBJECT", "error", "$", "Input must be an object.")]);
  const { records, schemaValidator, schemaCorpus } = input;
  if (!Array.isArray(records)) diagnostics.push(diagnostic("RECORDS_NOT_ARRAY", "error", "$.records", "Records must be a caller-supplied array."));
  if (!isPlainObject(schemaValidator) || typeof schemaValidator.validate !== "function") diagnostics.push(diagnostic("SCHEMA_VALIDATOR_PORT_REQUIRED", "error", "$.schemaValidator", "A schemaValidator.validate port is required; this computer neither chooses nor loads a validator."));
  if (diagnostics.length) return result(diagnostics);

  const recordsByPath = new Map();
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]; const location = `$.records[${index}]`;
    if (!isPlainObject(record)) { diagnostics.push(diagnostic("RECORD_NOT_OBJECT", "error", location, "Each record must be an object.")); continue; }
    if (!isBundlePath(record.path)) { diagnostics.push(diagnostic("RECORD_PATH_INVALID", "error", `${location}.path`, "Record path must be a non-empty, bundle-relative POSIX path.")); continue; }
    if (!Object.values(RECORD_TYPES).includes(record.type)) { diagnostics.push(diagnostic("RECORD_TYPE_UNKNOWN", "error", `${location}.type`, "Record type is not admitted by this conformance slice.", { type: record.type })); continue; }
    if (recordsByPath.has(record.path)) { diagnostics.push(diagnostic("RECORD_PATH_DUPLICATE", "error", `${location}.path`, "Bundle paths must identify exactly one record.", { path: record.path })); continue; }
    recordsByPath.set(record.path, record);
    validateViaPort(schemaValidator, schemaCorpus, record, location, diagnostics);
    findRawMedia(record.value, `${location}.value`, record.path, diagnostics);
  }
  for (const record of recordsByPath.values()) {
    if (record.type === RECORD_TYPES.traceManifest) validateManifest(record, recordsByPath, diagnostics);
    if (record.type === RECORD_TYPES.session) validateSession(record, recordsByPath, diagnostics);
    if (record.type === RECORD_TYPES.traceFrames) validateFrameStream(record, recordsByPath, diagnostics);
  }
  return result(diagnostics);
}

function validateViaPort(schemaValidator, schemaCorpus, record, location, diagnostics) {
  const instances = record.type === RECORD_TYPES.traceFrames && Array.isArray(record.value)
    ? record.value.map((instance, index) => ({ instance, location: `${location}.value[${index}]` }))
    : [{ instance: record.value, location: `${location}.value` }];
  for (const { instance, location: instanceLocation } of instances) {
    let response;
    try { response = schemaValidator.validate({ schemaId: SCHEMA_IDS[record.type], instance, schemaCorpus }); }
    catch (error) { diagnostics.push(diagnostic("SCHEMA_VALIDATOR_PORT_FAILED", "error", instanceLocation, "The supplied schema validator threw while validating this record.", { recordPath: record.path, reason: String(error?.message ?? error) })); continue; }
    if (!isPlainObject(response) || typeof response.valid !== "boolean") { diagnostics.push(diagnostic("SCHEMA_VALIDATOR_PORT_PROTOCOL_INVALID", "error", instanceLocation, "Schema validator must return { valid: boolean, diagnostics?: Array }.", { recordPath: record.path })); continue; }
    if (!response.valid) for (const schemaDiagnostic of Array.isArray(response.diagnostics) && response.diagnostics.length ? response.diagnostics : [{}]) diagnostics.push(diagnostic("SCHEMA_INVALID", "error", instanceLocation, "Record does not conform to its declared science schema.", { recordPath: record.path, schemaId: SCHEMA_IDS[record.type], schemaDiagnostic }));
  }
}

function validateManifest(record, recordsByPath, diagnostics) {
  const value = record.value;
  if (!isPlainObject(value)) return;
  const retention = value.mediaRetention;
  if (!isPlainObject(retention)) diagnostics.push(diagnostic("MEDIA_RETENTION_UNDECLARED", "error", `${record.path}.mediaRetention`, "A trace manifest must declare nested mediaRetention."));
  else for (const [field, expected] of Object.entries(REQUIRED_MANIFEST_MEDIA_RETENTION)) if (retention[field] !== expected) diagnostics.push(diagnostic("RAW_MEDIA_AFFIRMATION_MISSING_OR_FALSE", "error", `${record.path}.mediaRetention.${field}`, "A trace manifest must make the required raw-media refusal affirmation.", { expected, actual: retention[field] }));
  if (!isVersionedProfile(value.jointSetProfile)) diagnostics.push(diagnostic("TRACE_PROFILE_UNDECLARED", "error", `${record.path}.jointSetProfile`, "A trace manifest must declare a versioned joint-set profile."));
  if (!isCoordinateProfile(value.coordinateSpaceProfile)) diagnostics.push(diagnostic("TRACE_COORDINATE_PROFILE_INVALID", "error", `${record.path}.coordinateSpaceProfile`, "A trace manifest must declare a 2D or 3D versioned coordinate-space profile."));
  if (value.frames?.frameSchemaId !== SCHEMA_IDS[RECORD_TYPES.traceFrames]) diagnostics.push(diagnostic("FRAME_SCHEMA_ID_MISMATCH", "error", `${record.path}.frames.frameSchemaId`, "Manifest must declare the science-owned skeletal trace-frame schema ID.", { expected: SCHEMA_IDS[RECORD_TYPES.traceFrames], actual: value.frames?.frameSchemaId }));
  requireReference(record, value.frames?.path, RECORD_TYPES.traceFrames, "frames.path", recordsByPath, diagnostics);
}

function validateSession(record, recordsByPath, diagnostics) {
  const retention = record.value?.mediaRetention;
  if (!isPlainObject(retention)) diagnostics.push(diagnostic("MEDIA_RETENTION_UNDECLARED", "error", `${record.path}.mediaRetention`, "A practice session must declare nested mediaRetention."));
  else for (const [field, expected] of Object.entries(REQUIRED_SESSION_MEDIA_RETENTION)) if (retention[field] !== expected) diagnostics.push(diagnostic("RAW_MEDIA_AFFIRMATION_MISSING_OR_FALSE", "error", `${record.path}.mediaRetention.${field}`, "A practice session must make the required raw-media refusal affirmation.", { expected, actual: retention[field] }));
  const references = record.value?.traceReferences;
  if (!Array.isArray(references)) { diagnostics.push(diagnostic("TRACE_REFERENCES_UNDECLARED", "error", `${record.path}.traceReferences`, "A practice session must declare its trace references.")); return; }
  for (let index = 0; index < references.length; index += 1) {
    const reference = references[index];
    const target = requireReference(record, reference?.manifestPath, RECORD_TYPES.traceManifest, `traceReferences[${index}].manifestPath`, recordsByPath, diagnostics);
    if (target && reference.traceId !== target.value?.traceId) diagnostics.push(diagnostic("SESSION_TRACE_ID_MISMATCH", "error", `${record.path}.traceReferences[${index}].traceId`, "Session trace-reference traceId must equal its manifest traceId.", { expected: target.value?.traceId, actual: reference.traceId, manifestPath: target.path }));
  }
}

function validateFrameStream(record, recordsByPath, diagnostics) {
  const frames = record.value;
  if (!Array.isArray(frames)) return;
  const manifests = [...recordsByPath.values()].filter((candidate) => candidate.type === RECORD_TYPES.traceManifest && candidate.value?.frames?.path === record.path);
  if (manifests.length === 0) diagnostics.push(diagnostic("FRAME_STREAM_UNREFERENCED", "error", record.path, "A skeletal frame stream must be referenced by exactly one trace manifest."));
  if (manifests.length > 1) diagnostics.push(diagnostic("FRAME_STREAM_REFERENCE_AMBIGUOUS", "error", record.path, "A skeletal frame stream may be referenced by only one trace manifest.", { manifestPaths: manifests.map((candidate) => candidate.path) }));
  const manifest = manifests[0]?.value;
  let previousElapsedTimeMs = -1;
  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index]; const location = `${record.path}[${index}]`;
    if (!isPlainObject(frame) || !Number.isInteger(frame.elapsedTimeMs) || frame.elapsedTimeMs < 0) { diagnostics.push(diagnostic("FRAME_TIME_INVALID", "error", location, "Each frame must provide a non-negative integer elapsedTimeMs value.")); continue; }
    if (frame.elapsedTimeMs <= previousElapsedTimeMs) diagnostics.push(diagnostic("FRAME_TIME_NOT_MONOTONE", "error", location, "Frame elapsedTimeMs must strictly increase.", { previousElapsedTimeMs, elapsedTimeMs: frame.elapsedTimeMs }));
    previousElapsedTimeMs = frame.elapsedTimeMs;
    if (manifest?.traceId !== undefined && frame.traceId !== manifest.traceId) diagnostics.push(diagnostic("FRAME_TRACE_ID_MISMATCH", "error", `${location}.traceId`, "Frame traceId must equal its manifest traceId.", { expected: manifest.traceId, actual: frame.traceId }));
    const dimensions = manifest?.coordinateSpaceProfile?.dimensions;
    if (dimensions === 2 || dimensions === 3) for (const [jointId, joint] of Object.entries(frame.joints ?? {})) {
      const hasZ = Object.hasOwn(joint?.position ?? {}, "z");
      if ((dimensions === 3) !== hasZ) diagnostics.push(diagnostic("FRAME_COORDINATE_DIMENSIONS_MISMATCH", "error", `${location}.joints.${jointId}.position`, "Joint position dimensions must match the manifest coordinate-space profile.", { expectedDimensions: dimensions }));
    }
  }
}

function requireReference(owner, reference, expectedType, field, recordsByPath, diagnostics) {
  if (!isBundlePath(reference)) { diagnostics.push(diagnostic("REFERENCE_PATH_INVALID", "error", `${owner.path}.${field}`, "Reference must be a bundle-relative POSIX path.", { field })); return undefined; }
  const target = recordsByPath.get(reference);
  if (!target) diagnostics.push(diagnostic("REFERENCE_UNRESOLVED", "error", `${owner.path}.${field}`, "Referenced record is absent from the caller-supplied bundle.", { reference, expectedType }));
  else if (target.type !== expectedType) diagnostics.push(diagnostic("REFERENCE_TYPE_MISMATCH", "error", `${owner.path}.${field}`, "Referenced record has the wrong admitted type.", { reference, expectedType, actualType: target.type }));
  else return target;
  return undefined;
}

function findRawMedia(value, location, recordPath, diagnostics) {
  if (Array.isArray(value)) value.forEach((member, index) => findRawMedia(member, `${location}[${index}]`, recordPath, diagnostics));
  else if (isPlainObject(value)) for (const [key, member] of Object.entries(value)) {
    const normalized = key.replace(/[-_ ]/g, "").toLowerCase();
    const approvedAffirmation = (/^containsRaw(?:Image|Video|Audio)$/.test(key) && member === false) || (/^contains(?:SegmentationMask|AppearanceEmbedding)$/.test(key) && member === false) || (key === "rawMediaRetention" && member === "none");
    if (RAW_MEDIA_FIELD_NAMES.has(normalized) && !approvedAffirmation) diagnostics.push(diagnostic("RAW_MEDIA_REFUSED", "error", `${location}.${key}`, "Raw appearance-bearing media is not admitted to a practice bundle.", { recordPath, field: key }));
    findRawMedia(member, `${location}.${key}`, recordPath, diagnostics);
  }
}

function isBundlePath(value) { return typeof value === "string" && value.length > 0 && !value.startsWith("/") && !value.includes("\\") && value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== ".."); }
function isVersionedProfile(value) { return isPlainObject(value) && typeof value.id === "string" && value.id.length > 0 && typeof value.version === "string" && value.version.length > 0; }
function isCoordinateProfile(value) { return isVersionedProfile(value) && (value.dimensions === 2 || value.dimensions === 3) && typeof value.normalization === "string" && value.normalization.length > 0; }
const isPlainObject = isObjectRecord;
function diagnostic(code, severity, path, message, detail = {}) { return { code, severity, path, message, ...detail }; }
function result(diagnostics) { const ordered = [...diagnostics].sort((left, right) => `${left.path}\u0000${left.code}`.localeCompare(`${right.path}\u0000${right.code}`)); return Object.freeze({ conformant: ordered.every((item) => item.severity !== "error"), diagnostics: Object.freeze(ordered.map(Object.freeze)) }); }
