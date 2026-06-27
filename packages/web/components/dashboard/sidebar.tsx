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
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r bg-background md:flex">
      <div className="flex items-center gap-2.5 px-5 pb-3 pt-5">
        <span className="h-7 w-7 rounded-lg bg-gradient-to-br from-[#4a63e8] to-[#3a50dd] shadow-[0_2px_8px_rgba(58,80,221,0.35)]" />
        <span className="text-base font-extrabold tracking-tight">Sync</span>
      </div>
      <div className="px-3">
        <div className="flex items-center gap-2.5 rounded-lg border bg-secondary/40 px-2.5 py-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-amber-400 to-amber-500 text-[10px] font-bold text-white">
            {wsInitial}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground/80">
            {workspaceName}
          </span>
        </div>
      </div>
      <NavLinks />
      <div className="border-t p-3">
        <SidebarUser email={userEmail} role={role} />
      </div>
    </aside>
  );
}
