import Link from 'next/link';

import { cn } from '@/lib/utils';

/**
 * The workflow page's sections. A LINK per tab (not client state) so the choice survives a reload
 * and the back button, and the page stays a server component — the same reason the Knowledge Base
 * list drives its split through `?tab=`. The `?wf=` selector rides along, or switching tabs would
 * silently jump to the recording's first workflow.
 */
export interface WorkflowTab {
  key: string;
  label: string;
}

export function WorkflowTabs({
  tabs,
  active,
  basePath,
  wf,
}: {
  tabs: WorkflowTab[];
  active: string;
  basePath: string;
  wf: number | null;
}) {
  return (
    <div role="tablist" aria-label="Workflow sections" className="flex items-center gap-[18px] border-b">
      {tabs.map((t) => {
        const on = t.key === active;
        const params = new URLSearchParams();
        if (wf != null) params.set('wf', String(wf));
        if (t.key !== tabs[0]?.key) params.set('tab', t.key);
        const qs = params.toString();
        return (
          <Link
            key={t.key}
            href={qs ? `${basePath}?${qs}` : basePath}
            role="tab"
            aria-selected={on}
            scroll={false}
            className={cn(
              '-mb-px border-b-2 px-0.5 pb-2.5 text-[12.5px] font-semibold transition-colors',
              on ? 'border-primary text-ink' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
