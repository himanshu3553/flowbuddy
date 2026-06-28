'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  BookOpen,
  Bot,
  Home,
  Settings,
  Video,
  type LucideIcon,
} from 'lucide-react';

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
  { href: '/dashboard/recordings', label: 'Recordings', icon: Video },
  { href: '/dashboard/kb', label: 'Knowledge Base', icon: BookOpen },
  { href: '/dashboard/copilot', label: 'Copilot', icon: Bot },
  { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];

export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-1 flex-col gap-1 py-1">
      {navItems.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : (item.match ?? [item.href]).some((m) => pathname.startsWith(m));
        const Icon = item.icon;
        // Settings sits pinned at the bottom of the rail (design IA).
        const pinned = item.href === '/dashboard/settings';
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2.5 rounded-control px-2.5 py-2 text-[13px] transition-colors',
              pinned && 'mt-auto',
              active
                ? 'bg-brand-50 font-semibold text-primary'
                : 'font-medium text-muted-foreground hover:bg-secondary hover:text-foreground',
            )}
          >
            <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.25 : 2} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
