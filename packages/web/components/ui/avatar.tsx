import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Lightweight avatar: renders an image when `src` is given, otherwise the
 * `fallback` initials on a muted disc. Kept dependency-free (no
 * @radix-ui/react-avatar) since we only need initials + image today.
 */
const Avatar = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement> & { src?: string; fallback?: string }
>(({ className, src, fallback, ...props }, ref) => (
  <span
    ref={ref}
    className={cn(
      'relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-semibold text-muted-foreground',
      className,
    )}
    {...props}
  >
    {src ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" className="h-full w-full object-cover" />
    ) : (
      <span>{fallback}</span>
    )}
  </span>
));
Avatar.displayName = 'Avatar';

export { Avatar };
