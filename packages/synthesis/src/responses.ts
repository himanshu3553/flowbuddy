import OpenAI from 'openai';

/**
 * One structured-JSON call against `/v1/responses`, for the KB pipeline.
 *
 * WHY EVERYTHING IS ON THIS ENDPOINT NOW. Reasoning models refuse combinations that
 * `/v1/chat/completions` used to accept — an explicit `temperature`, and function tools alongside
 * reasoning. Both arrived as hard 400s in production, one at a time. Rather than carry a growing
 * list of per-model workarounds, every model call in this package speaks Responses: the answer loop
 * (`engine.ts`) because it needs reasoning AND tools, and the pipeline through this helper.
 *
 * WHY THIS THROWS, WHEN THE ANSWER LOOP DELIBERATELY DOES NOT. The answer path degrades: a failure
 * there falls back to a simpler engine so the end-user still gets something, and mode 1 has no floor
 * beneath it, so throwing would surface a raw error to a customer's user. The pipeline is the
 * opposite. It runs in a background worker with retries, and a silent failure here does not show a
 * user an error — it writes a WRONG KNOWLEDGE BASE: `''` parses to `{}`, which yields zero workflows
 * or zero steps, and the fallbacks then quietly produce a degraded recording that looks processed.
 * A recording marked `error` is recoverable; a recording that silently became one flat workflow of
 * junk steps is discovered months later by a customer getting a bad answer. So: throw, retry, and
 * surface it.
 */
export async function structuredJsonCall(opts: {
  openai: OpenAI;
  model: string;
  system: string;
  user: string;
  /** `{ name, strict, schema }` — the same shape chat-completions nested under `json_schema`. */
  schema: { name: string; strict?: boolean; schema: Record<string, unknown> };
  /** Names the stage in any thrown error, so a worker log says which half of the build failed. */
  stage: string;
}): Promise<string> {
  const res = await opts.openai.responses.create({
    model: opts.model,
    input: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.user },
    ],
    text: {
      format: { type: 'json_schema', ...opts.schema } as OpenAI.Responses.ResponseTextConfig['format'],
    },
    // No output cap, matching the pre-migration behaviour. A cap here would truncate a long
    // recording into fewer workflows or fewer steps — silently, and in the artefact customers are
    // answered from. Cost is bounded by this being a per-recording background job, not per-question.
    store: false, // stateless: nothing about a customer's product is retained provider-side
  });

  // `status: 'failed'` arrives as HTTP 200 and the SDK does not throw on it, so without this check
  // it reads as an empty answer — see the header note on why that is worse here than anywhere else.
  if (res.status === 'failed') {
    throw new Error(
      `${opts.stage}: responses API failed — ${res.error?.code ?? 'unknown'} ${res.error?.message ?? ''}`.trim(),
    );
  }
  if (res.status === 'incomplete') {
    throw new Error(`${opts.stage}: response incomplete (${res.incomplete_details?.reason ?? 'unknown'})`);
  }
  return res.output_text ?? '';
}
