'use client';

import { useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';

/**
 * Date-range selector for the Analytics page — a chip-styled native select that
 * navigates to `?range=N`, driving every aggregation on the (server-rendered)
 * page. Options come from the server so this stays free of server-only imports.
 */
export function AnalyticsRange({
  value,
  options,
}: {
  value: number;
  options: ReadonlyArray<{ days: number; label: string }>;
}) {
  const router = useRouter();
  return (
    <span className="relative inline-flex items-center rounded-control border border-[color:var(--gray-200)] bg-card text-xs text-secondary-foreground">
      <select
        aria-label="Date range"
        value={value}
        onChange={(e) =>
          router.push(`/dashboard/analytics?range=${e.target.value}`)
        }
        className="cursor-pointer appearance-none rounded-control bg-transparent py-1.5 pl-3 pr-7 text-xs text-secondary-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {options.map((o) => (
          <option key={o.days} value={o.days}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-faint" />
    </span>
  );
}
