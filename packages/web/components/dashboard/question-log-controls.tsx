'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown, Search, X } from 'lucide-react';

/**
 * Search + filter + range controls for the question log. All three live in the URL (so a filtered
 * view is linkable and the back button works), and the server page re-renders from them.
 *
 * Any change resets `page` — landing on page 7 of a result set that now has 2 pages is the classic
 * way a filter feels broken. Search is debounced so typing doesn't fire a navigation per keystroke.
 */

const DEBOUNCE_MS = 350;

/** Build the next URL from the current params + an override set. Empty/default values are DROPPED
 *  rather than written as `?q=&filter=all`, so a plain view has a plain URL. */
function buildHref(
  pathname: string,
  params: URLSearchParams,
  patch: Record<string, string | number | null>,
): string {
  const next = new URLSearchParams(params);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === '' || v === 'all') next.delete(k);
    else next.set(k, String(v));
  }
  next.delete('page'); // every control change returns to page 1
  const qs = next.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export function QuestionLogControls({
  search,
  filter,
  range,
  filterOptions,
  rangeOptions,
}: {
  search: string;
  filter: string;
  range: number;
  filterOptions: ReadonlyArray<{ value: string; label: string }>;
  rangeOptions: ReadonlyArray<{ days: number; label: string }>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [term, setTerm] = useState(search);
  // Track what the URL says so an external change (back button, a "view all declines" link) syncs
  // the box instead of being overwritten by stale local state.
  const urlSearch = useRef(search);
  useEffect(() => {
    if (urlSearch.current !== search) {
      urlSearch.current = search;
      setTerm(search);
    }
  }, [search]);

  useEffect(() => {
    if (term === urlSearch.current) return; // nothing typed since the last navigation
    const id = setTimeout(() => {
      urlSearch.current = term;
      router.push(buildHref(pathname, params, { q: term }));
    }, DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [term, pathname, params, router]);

  const selectClass =
    'cursor-pointer appearance-none rounded-control border border-[color:var(--gray-200)] bg-card py-1.5 pl-3 pr-7 text-xs text-secondary-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-0 flex-1 sm:min-w-[260px]">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
        <input
          type="search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search questions or page path…"
          aria-label="Search questions"
          maxLength={100}
          className="h-[34px] w-full rounded-control border border-[color:var(--gray-200)] bg-card pl-8 pr-8 text-[13px] text-secondary-foreground placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {term && (
          <button
            type="button"
            onClick={() => setTerm('')}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-faint hover:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <span className="relative inline-flex items-center">
        <select
          aria-label="Filter questions"
          value={filter}
          onChange={(e) =>
            router.push(buildHref(pathname, params, { filter: e.target.value }))
          }
          className={selectClass}
        >
          {filterOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-faint" />
      </span>

      <span className="relative inline-flex items-center">
        <select
          aria-label="Date range"
          value={range}
          onChange={(e) =>
            router.push(buildHref(pathname, params, { range: e.target.value }))
          }
          className={selectClass}
        >
          {rangeOptions.map((o) => (
            <option key={o.days} value={o.days}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-faint" />
      </span>
    </div>
  );
}
