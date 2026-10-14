import { createHash } from "crypto";

/**
 * Content hash for the generate cache (defect 14).
 *
 * The generated PDF is fully determined by the answers, the signature,
 * the field schema and the field overrides. The old cache returned the
 * first artifact forever because it keyed only on `status ===
 * "completed"`. Now a cached artifact is served only when this hash —
 * computed from the CURRENT inputs — equals the hash stored when the
 * artifact was rendered. Any input change forces a re-render; unchanged
 * inputs keep the cache fast path.
 */
export interface GenerateHashInputs {
  answers: Record<string, unknown> | null | undefined;
  signatureData: string | null | undefined;
  fields: unknown[] | null | undefined;
  fieldOverrides: unknown[] | null | undefined;
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys
      .map(
        (k) =>
          `${JSON.stringify(k)}:${stableStringify(
            (value as Record<string, unknown>)[k]
          )}`
      )
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function computeGenerateHash(inputs: GenerateHashInputs): string {
  const payload = stableStringify({
    answers: inputs.answers ?? {},
    signatureData: inputs.signatureData ?? null,
    fields: inputs.fields ?? [],
    fieldOverrides: inputs.fieldOverrides ?? [],
  });
  return createHash("sha256").update(payload).digest("hex");
}
