import { NavLinks } from './nav';

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r bg-background md:flex">
      <div className="flex h-14 items-center gap-2 border-b px-6">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
          S
        </span>
        <span className="font-semibold tracking-tight">Sync Studio</span>
      </div>
      <NavLinks />
      <div className="border-t p-4 text-xs text-muted-foreground">
        In-app help copilot
      </div>
    </aside>
  );
}
