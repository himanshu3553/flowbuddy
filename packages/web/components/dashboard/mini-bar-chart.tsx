import type { DayBucket } from '@/lib/copilot-metrics';

/**
 * Lightweight stacked bar chart (answered + declined per day). Pure CSS — no
 * charting dependency. Heights are relative to the busiest day in the series.
 */
export function MiniBarChart({
  data,
  height = 120,
}: {
  data: DayBucket[];
  height?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.answered + d.declined));
  const empty = data.every((d) => d.answered + d.declined === 0);

  return (
    <div>
      <div className="flex items-end gap-2" style={{ height }}>
        {data.map((d, i) => (
          <div
            key={i}
            className="flex flex-1 flex-col justify-end gap-0.5"
            title={`${d.label}: ${d.answered} answered · ${d.declined} declined`}
          >
            <div
              className="rounded-t-sm bg-amber-300"
              style={{ height: `${(d.declined / max) * 100}%` }}
            />
            <div
              className="rounded-b-sm bg-primary"
              style={{ height: `${(d.answered / max) * 100}%` }}
            />
            {d.answered + d.declined === 0 && (
              <div className="h-px rounded-full bg-border" />
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        {data.map((d, i) => (
          <div
            key={i}
            className="flex-1 text-center text-[10px] text-muted-foreground"
          >
            {d.label}
          </div>
        ))}
      </div>
      {empty && (
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          No questions in the last 7 days yet.
        </p>
      )}
    </div>
  );
}

export function ChartLegend() {
  return (
    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-sm bg-primary" />
        answered
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-sm bg-amber-300" />
        declined
      </span>
    </div>
  );
}
