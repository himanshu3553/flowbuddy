import OpenAI from 'openai';

/**
 * P1-M3 hybrid retrieval — the embedding half. One tiny module so the worker (KB-build writes) and
 * retrieval (query-time) share the exact model + input handling; a model/dims change happens here
 * and in the `vector(1536)` column together, nowhere else.
 *
 * MISCONFIG POLICY (review hardening 2026-07-07): a model that emits the wrong width fails HERE,
 * loudly, with an actionable message — never as a bare Postgres "expected 1536 dimensions" swallowed
 * by a best-effort catch. ⚠️ EMBED_MODEL must resolve to the SAME model on every service (api worker
 * writes + api/web query paths — render.yaml sets all of them): a same-width model drift (e.g.
 * ada-002 vs 3-small, both 1536) cannot be detected from dimensions and would silently compare
 * vectors across incompatible embedding spaces.
 *
 * Failure policy is the CALLER's: embedding is always best-effort (a failed call degrades to
 * keyword-only retrieval), so this module just throws and lets callers catch.
 */

export const DEFAULT_EMBED_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIMS = 1536; // must match the KnowledgeItem.embedding vector(1536) column

export interface EmbedOpts {
  apiKey: string;
  model?: string;
  /** Request timeout (ms). Query-path callers should fail fast — the keyword fallback covers a miss. */
  timeoutMs?: number;
  /** SDK retry count. Defaults to the OpenAI SDK default when unset. */
  maxRetries?: number;
}

// The embeddings endpoint takes up to 2048 inputs, but keep batches modest so one oversized
// recording can't hit the per-request token ceiling (steps are short; 100 × ~8k chars is safe).
const BATCH_SIZE = 100;
const INPUT_MAX_CHARS = 8000;

// One client per distinct (key, timeout, retries) config — constructed once, keeps the HTTP
// keep-alive agent alive across calls instead of paying TCP/TLS setup per question.
const clients = new Map<string, OpenAI>();
function clientFor(opts: EmbedOpts): OpenAI {
  const cacheKey = `${opts.apiKey}|${opts.timeoutMs ?? ''}|${opts.maxRetries ?? ''}`;
  let client = clients.get(cacheKey);
  if (!client) {
    client = new OpenAI({
      apiKey: opts.apiKey,
      ...(opts.timeoutMs != null ? { timeout: opts.timeoutMs } : {}),
      ...(opts.maxRetries != null ? { maxRetries: opts.maxRetries } : {}),
    });
    clients.set(cacheKey, client);
  }
  return client;
}

/** Embed texts in order (batched). `KnowledgeItem.text` already folds in narration, so callers pass it as-is. */
export async function embedTexts(texts: string[], opts: EmbedOpts): Promise<number[][]> {
  const openai = clientFor(opts);
  const model = opts.model || DEFAULT_EMBED_MODEL;
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    // The API rejects empty strings — a blank item embeds as a single space (never matches well, harmless).
    const input = texts.slice(i, i + BATCH_SIZE).map((t) => t.slice(0, INPUT_MAX_CHARS).trim() || ' ');
    const res = await openai.embeddings.create({ model, input });
    // Response rows carry their input index — sort defensively rather than assuming order.
    for (const d of [...res.data].sort((a, b) => a.index - b.index)) {
      if (d.embedding.length !== EMBEDDING_DIMS) {
        throw new Error(
          `embedding model "${model}" returned ${d.embedding.length}-dim vectors but the ` +
            `KnowledgeItem.embedding column is vector(${EMBEDDING_DIMS}) — set EMBED_MODEL to a ` +
            `${EMBEDDING_DIMS}-dim model (default: ${DEFAULT_EMBED_MODEL})`,
        );
      }
      out.push(d.embedding);
    }
  }
  if (out.length !== texts.length) {
    throw new Error(`embeddings response count mismatch: sent ${texts.length}, got ${out.length}`);
  }
  return out;
}

/** Serialize for pgvector: the `[x,y,…]` literal form, passed as a string param and cast `::vector`. */
export function toVectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`;
}
