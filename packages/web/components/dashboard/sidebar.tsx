import { ChevronDown } from 'lucide-react';

import { NavLinks } from './nav';
import { SidebarUser } from './sidebar-user';

export function Sidebar({
  workspaceName,
  userEmail,
  role = 'Owner',
}: {
  workspaceName: string;
  userEmail: string;
  role?: string;
}) {
  const wsInitial = (workspaceName.trim()[0] ?? 'W').toUpperCase();
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[230px] flex-col border-r bg-card px-3.5 py-[18px] md:flex">
      <div className="flex items-center gap-2.5 px-2 pb-4">
        <span className="h-[26px] w-[26px] rounded-lg bg-primary-gradient-logo shadow-[0_2px_8px_rgba(58,80,221,0.35)]" />
        <span className="text-base font-extrabold tracking-tight text-ink">
          FlowBuddy
        </span>
      </div>
      <button
        type="button"
        className="mb-2.5 flex items-center gap-2.5 rounded-tile border bg-[color:var(--paper-2)] px-2.5 py-2 text-left transition-colors hover:bg-secondary"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-amber-400 to-amber-500 text-[10px] font-bold text-white">
          {wsInitial}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-secondary-foreground">
          {workspaceName}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-faint" />
      </button>
      <NavLinks />
      <div className="mt-2 border-t pt-3">
        <SidebarUser email={userEmail} role={role} />
      </div>
    </aside>
  );
}
