import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { getCurrentWorkspace } from '@/lib/session';
import { Sidebar } from '@/components/dashboard/sidebar';
import { MobileNav } from '@/components/dashboard/mobile-nav';
import { UserMenu } from '@/components/dashboard/user-menu';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin');
  const ctx = await getCurrentWorkspace();
  if (!ctx) redirect('/signin');

  return (
    <div className="min-h-screen bg-canvas">
      <Sidebar
        workspaceName={ctx.workspace.name}
        userEmail={session.user.email ?? ''}
      />
      <div className="flex min-h-screen flex-col md:pl-[230px]">
        {/* Mobile-only top bar; on desktop each page renders its own PageHeader. */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden">
          <div className="flex items-center gap-2">
            <MobileNav />
            <span className="text-sm font-semibold tracking-tight">
              Sync Studio
            </span>
          </div>
          <UserMenu email={session.user.email ?? ''} />
        </header>
        <div className="flex-1 overflow-x-clip">{children}</div>
      </div>
    </div>
  );
}
