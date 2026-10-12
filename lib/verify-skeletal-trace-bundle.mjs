import { admitSchema } from "@red-cup-engineering/json-schema-services-section/admit-schema";
import { inspectSchemaCorpus } from "@red-cup-engineering/json-schema-services-section/inspect-schema-corpus";
import { validateSchemaInstance } from "@red-cup-engineering/json-schema-services-section/validate-schema-instance";

const frameSchemaId = "urn:red-cup-science:tai-chi:skeletal-trace-frame:1.0.0";
const manifestSchemaId = "urn:red-cup-science:tai-chi:skeletal-trace-manifest:1.0.0";
const sessionSchemaId = "urn:red-cup-science:tai-chi:practice-session:1.0.0";

const error = (record, pointer, keyword, message) => Object.freeze({ record, pointer, keyword, message });

/**
 * Verifies a supplied, explicitly bounded corpus and portable trace bundle.
 * This is not a second JSON Schema evaluator: structural judgments are made
 * only by the canonical JSON Schema service. The remaining checks express
 * relations JSON Schema cannot state across NDJSON records.
 */
export function verifySkeletalTraceBundle({ manifest, frames, session, schemas }) {
  const byId = new Map(schemas.map((schema) => [schema.$id, schema]));
  const requiredIds = [frameSchemaId, manifestSchemaId, sessionSchemaId];
  const errors = [];

  const requiredSchemas = [];
  for (const id of requiredIds) {
    const schema = byId.get(id);
    if (!schema) {
      errors.push(error("schema-corpus", "", "$id", `required schema is absent: ${id}`));
      continue;
    }
    try {
      admitSchema({ schema });
    } catch (cause) {
      errors.push(error("schema-corpus", "", "admission", cause instanceof Error ? cause.message : String(cause)));
    }
    requiredSchemas.push(schema);
  }
  for (const finding of inspectSchemaCorpus({ schemas: requiredSchemas }).errors)
    errors.push(error("schema-corpus", finding.pointer, finding.keyword, finding.message));

  if (errors.length > 0) return Object.freeze({ ok: false, errors: Object.freeze(errors) });

  const validate = (record, value, schemaId) => {
    for (const finding of validateSchemaInstance({ instance: value, schema: byId.get(schemaId), schemas }).errors)
      errors.push(error(record, finding.pointer, finding.keyword, finding.message));
  };

  validate("manifest", manifest, manifestSchemaId);
  for (const [index, frame] of frames.entries()) validate(`frames/${index}`, frame, frameSchemaId);
  if (session !== undefined) validate("session", session, sessionSchemaId);

  if (manifest?.traceId !== undefined) {
    let previousElapsedTimeMs = -1;
    for (const [index, frame] of frames.entries()) {
      // Structural validation above already explains malformed values.  The
      // cross-record pass must never turn an invalid import into a throw.
      if (frame === null || typeof frame !== "object" || Array.isArray(frame)) continue;
      if (frame.traceId !== manifest.traceId)
        errors.push(error(`frames/${index}`, "/traceId", "traceId", "frame traceId must equal manifest traceId"));
      if (typeof frame.elapsedTimeMs === "number" && frame.elapsedTimeMs <= previousElapsedTimeMs)
        errors.push(error(`frames/${index}`, "/elapsedTimeMs", "monotonicity", "elapsedTimeMs must strictly increase across frames"));
      if (typeof frame.elapsedTimeMs === "number") previousElapsedTimeMs = frame.elapsedTimeMs;
      for (const [jointId, joint] of Object.entries(frame.joints ?? {})) {
        if (joint === null || typeof joint !== "object" || Array.isArray(joint)) continue;
        const hasZ = Object.hasOwn(joint.position ?? {}, "z");
        if ((manifest.coordinateSpaceProfile?.dimensions === 3) !== hasZ)
          errors.push(error(`frames/${index}`, `/joints/${jointId}/position`, "coordinateDimensions", "joint position dimensions must match the manifest coordinate-space profile"));
      }
    }
  }

  if (session && typeof session.startedAt === "string" && typeof session.endedAt === "string" && Date.parse(session.endedAt) < Date.parse(session.startedAt))
    errors.push(error("session", "/endedAt", "temporalOrder", "endedAt must not precede startedAt"));

  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}
