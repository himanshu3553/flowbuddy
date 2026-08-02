import { ENGINE_LABELS, type AnswerPathStats } from '@/lib/analytics';
import { StatusBadge } from '@/components/dashboard/status-badge';

/**
 * "How answers were produced" — the Studio surface for `CopilotQuery.engine` / `rounds` /
 * `toolCalls` (agent.md §9 Gap 2's remaining half).
 *
 * WHAT THIS IS FOR, given it changed job once already. The columns were added to settle "should the
 * cheap tier collapse into the smart one?" — a question D10 answered on other grounds before enough
 * traffic accumulated. What is left is more useful and has no other home:
 *
 *   - **The fallback is now invisible without this.** `engine: 'floor'` used to be an ordinary sold
 *     tier answering normally; since AI Chatbot's retirement it appears ONLY when the agent loop or
 *     the diagnostic path failed. Nothing else in the product reports that, and nobody is reading
 *     the API logs. So it is rendered as an alarm, not a statistic.
 *   - **Escalation is the one honest measure of whether the loop earns its cost.** Round one *is*
 *     the old fast path, so `rounds > 1` is the share of questions that genuinely needed more.
 *
 * Percentages are computed over rows that RECORDED an engine, never over every question, and the
 * uninstrumented remainder is stated rather than absorbed — a surface whose job is to be believed
 * when it says the fallback fired cannot round its own coverage away.
 */
export function AnswerPath({ stats, label }: { stats: AnswerPathStats; label: string }) {
  const { recorded, unrecorded, byEngine, floorCount, escalated, withTools, tokens } = stats;
  const pct = (n: number) => (recorded === 0 ? 0 : Math.round((n / recorded) * 100));
  // Averages, because a window total answers a question nobody asks. "What does one question cost?"
  // is what prices a tier and sizes a budget.
  const perQuestion = tokens
    ? {
        input: Math.round(tokens.input / tokens.questions),
        output: Math.round(tokens.output / tokens.questions),
        cachedPct: tokens.input === 0 ? 0 : Math.round((tokens.cachedInput / tokens.input) * 100),
        reasoningPct: tokens.output === 0 ? 0 : Math.round((tokens.reasoning / tokens.output) * 100),
      }
    : null;

  return (
    <section className="min-w-0 rounded-card border bg-card p-5 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[13.5px] font-bold text-ink">How answers were produced</h3>
        {floorCount > 0 ? (
          <StatusBadge tone="danger" dot={false}>
            {floorCount} fell back
          </StatusBadge>
        ) : recorded > 0 ? (
          <StatusBadge tone="success" dot={false}>
            No failures
          </StatusBadge>
        ) : null}
      </div>
      <p className="mt-0.5 text-xs text-faint">
        Which engine answered each question, and how hard it had to work.
      </p>

      {recorded === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Nothing recorded in the {label}
          {unrecorded > 0
            ? ` — the ${unrecorded} question${unrecorded === 1 ? '' : 's'} here predate this being tracked.`
            : '.'}
        </p>
      ) : (
        <>
          <ul className="mt-3 space-y-2.5">
            {byEngine.map((e) => {
              const meta = ENGINE_LABELS[e.engine];
              const isFloor = e.engine === 'floor';
              return (
                <li key={e.engine} className="flex items-start gap-2.5">
                  <span className="min-w-0 flex-1">
                    <span
                      className={
                        isFloor
                          ? 'block text-[12.5px] font-medium text-danger-text'
                          : 'block text-[12.5px] font-medium text-secondary-foreground'
                      }
                    >
                      {meta?.name ?? e.engine}
                    </span>
                    <span className="block text-[11px] leading-relaxed text-faint">
                      {meta?.blurb ?? 'An engine this version of Studio does not recognise.'}
                    </span>
                  </span>
                  <span className="mt-1 h-1.5 w-[70px] shrink-0 overflow-hidden rounded-full bg-[color:var(--gray-100)]">
                    <span
                      className={isFloor ? 'block h-full rounded-full bg-danger' : 'block h-full rounded-full bg-primary'}
                      style={{ width: `${pct(e.count)}%` }}
                    />
                  </span>
                  <span className="mt-1 w-12 shrink-0 text-right font-mono text-[11px] text-secondary-foreground">
                    {pct(e.count)}%
                  </span>
                </li>
              );
            })}
          </ul>

          {/* The alarm gets words, not just a red bar. A founder seeing this has no other way to
              find out, and the useful next step is a log line they'd never think to look for. */}
          {floorCount > 0 && (
            <p className="mt-3 rounded-md border border-danger-border bg-danger-bg px-2.5 py-2 text-[11.5px] leading-relaxed text-danger-text">
              <strong>{floorCount}</strong> question{floorCount === 1 ? '' : 's'} fell back to a
              plain answer because the normal path failed. Those users still got a real reply, so
              nothing looked broken to them — but something upstream is erroring. The API log line{' '}
              <code className="font-mono text-[10.5px]">agent path failed</code> says what.
            </p>
          )}

          <dl className="mt-4 grid grid-cols-2 gap-2.5">
            <div className="rounded-list border border-[color:var(--gray-150)] px-[13px] py-[11px]">
              <dt className="text-[11px] text-muted-foreground">Needed more than one look</dt>
              <dd className="mt-0.5 text-[19px] font-extrabold tracking-tight text-ink">
                {pct(escalated)}%
              </dd>
              <dd className="text-[10.5px] leading-relaxed text-faint">
                The rest were answered on the first pass, at the old speed and cost.
              </dd>
            </div>
            <div className="rounded-list border border-[color:var(--gray-150)] px-[13px] py-[11px]">
              <dt className="text-[11px] text-muted-foreground">Searched or opened a workflow</dt>
              <dd className="mt-0.5 text-[19px] font-extrabold tracking-tight text-ink">
                {pct(withTools)}%
              </dd>
              <dd className="text-[10.5px] leading-relaxed text-faint">
                How often it went looking rather than answering from what it already had.
              </dd>
            </div>
          </dl>

          {/* WHAT IT COST. Tokens rather than money on purpose: converting needs a price per model,
              two models answer on this path, and their rates change — a hardcoded figure drifts into
              confidently wrong, which is worse than one the founder converts against a rate card. */}
          {perQuestion && (
            <div className="mt-4 rounded-list border border-[color:var(--gray-150)] px-[13px] py-[11px]">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[11px] text-muted-foreground">Tokens per question</span>
                <span className="font-mono text-[11px] text-faint">
                  over {tokens!.questions} question{tokens!.questions === 1 ? '' : 's'}
                </span>
              </div>
              <div className="mt-0.5 text-[19px] font-extrabold tracking-tight text-ink">
                {perQuestion.input.toLocaleString()} in
                <span className="px-1.5 text-[13px] font-medium text-faint">·</span>
                {perQuestion.output.toLocaleString()} out
              </div>
              <p className="mt-1 text-[10.5px] leading-relaxed text-faint">
                {perQuestion.cachedPct}% of the input was served from cache and billed at a fraction
                of the rest.{' '}
                {perQuestion.reasoningPct > 0
                  ? `${perQuestion.reasoningPct}% of the output was the model thinking rather than answering.`
                  : 'None of the output was reasoning.'}{' '}
                Multiply by your model&rsquo;s current rate for a cost — the rates are not baked in
                here, so they cannot go stale.
              </p>
            </div>
          )}

          {unrecorded > 0 && (
            <p className="mt-3 text-[11px] text-faint">
              Percentages cover the {recorded} question{recorded === 1 ? '' : 's'} with this
              recorded. A further {unrecorded} in the {label} predate the tracking and are excluded
              rather than guessed at.
            </p>
          )}
        </>
      )}
    </section>
  );
}
