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
    <div className="min-h-screen bg-muted/30">
      <Sidebar />
      <div className="flex min-h-screen flex-col md:pl-60">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-8">
          <div className="flex items-center gap-2">
            <MobileNav />
            <span className="text-sm font-medium text-muted-foreground">
              {ctx.workspace.name}
            </span>
          </div>
          <UserMenu email={session.user.email ?? ''} />
        </header>
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
