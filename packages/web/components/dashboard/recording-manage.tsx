'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  Loader2,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Trash2,
} from 'lucide-react';

import {
  deleteRecording,
  renameRecording,
  reprocessRecording,
} from '@/lib/recording-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function RecordingManageMenu({
  id,
  currentTitle,
  appUrl,
  status,
  redirectOnDelete = false,
}: {
  id: string;
  /** The founder-set title (null = none yet). */
  currentTitle: string | null;
  appUrl: string | null;
  status: string;
  /** Detail page → jump back to the list after delete; list → just revalidate. */
  redirectOnDelete?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [renameOpen, setRenameOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [name, setName] = React.useState(currentTitle ?? '');
  const [toast, setToast] = React.useState<{ text: string; busy: boolean } | null>(null);
  const failed = status === 'error';

  function doRename() {
    startTransition(async () => {
      await renameRecording(id, name);
      setRenameOpen(false);
      router.refresh();
    });
  }

  function doReprocess() {
    setToast({ text: 'Re-processing recording…', busy: true });
    startTransition(async () => {
      try {
        await reprocessRecording(id);
        setToast({ text: 'Queued for re-processing', busy: false });
      } catch {
        setToast({ text: 'Couldn’t re-process — please try again', busy: false });
      } finally {
        router.refresh();
        setTimeout(() => setToast(null), 3500);
      }
    });
  }

  function doDelete() {
    startTransition(async () => {
      await deleteRecording(id);
      setDeleteOpen(false);
      if (redirectOnDelete) router.push('/dashboard/recordings');
      else router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label="Manage recording"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setName(currentTitle ?? '');
              setRenameOpen(true);
            }}
          >
            <Pencil className="h-4 w-4" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              // Defer until the menu has fully closed so Radix restores `pointer-events` on
              // <body>; running the action + router.refresh() synchronously here can leave the
              // page frozen (no clicks) because the closing overlay never clears that style.
              setTimeout(doReprocess, 0);
            }}
          >
            <RefreshCw className="h-4 w-4" />
            {failed ? 'Re-process (retry)' : 'Re-process'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-danger focus:bg-danger-bg focus:text-danger"
            onSelect={(e) => {
              e.preventDefault();
              setDeleteOpen(true);
            }}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Rename */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename recording</DialogTitle>
            <DialogDescription>
              A clear name helps when you’ve recorded the same app many times.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={appUrl || 'e.g. Invite a teammate'}
            onKeyDown={(e) => {
              if (e.key === 'Enter') doRename();
            }}
          />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={doRename} disabled={pending}>
              {pending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this recording?</DialogTitle>
            <DialogDescription>
              This permanently removes the recording, its captured screenshots and
              narration audio, and any workflows distilled from it. This can’t be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={doDelete}
              disabled={pending}
            >
              {pending ? 'Deleting…' : 'Delete recording'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Re-process feedback */}
      {toast && (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-full border bg-card px-4 py-2.5 text-[13px] font-medium text-ink shadow-dialog"
        >
          {toast.busy ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-success-text" />
          )}
          {toast.text}
        </div>
      )}
    </>
  );
}
