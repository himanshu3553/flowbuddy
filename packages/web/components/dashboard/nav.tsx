'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bot, Home, Settings, Video, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  match?: string[];
}

export const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Home', icon: Home, exact: true },
  {
    href: '/dashboard/recordings',
    label: 'Recordings',
    icon: Video,
    match: ['/dashboard/recordings', '/dashboard/kb'],
  },
  { href: '/dashboard/copilot', label: 'Copilot', icon: Bot },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];

export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-1 p-3">
      {navItems.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : (item.match ?? [item.href]).some((m) => pathname.startsWith(m));
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-secondary text-secondary-foreground'
                : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
