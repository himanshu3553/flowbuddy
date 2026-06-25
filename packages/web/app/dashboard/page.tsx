import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Check, Code2, KeyRound, ShieldCheck, Video } from 'lucide-react';

import { auth } from '@/auth';
import { prisma } from '@sync/db';
import { getCurrentWorkspace } from '@/lib/session';
import { resolveCoverageGap } from '@/lib/copilot-actions';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await auth();
  const ctx = await getCurrentWorkspace();
  if (!session?.user || !ctx) redirect('/signin');
  const wsId = ctx.workspace.id;

  const [tokenCount, readyCount, approvalCount, queryCount, openGaps] =
    await Promise.all([
      prisma.apiToken.count({ where: { workspaceId: wsId } }),
      prisma.knowledgeSource.count({
        where: { workspaceId: wsId, status: { in: ['ready', 'done'] } },
      }),
      prisma.copilotApproval.count({ where: { workspaceId: wsId } }),
      prisma.copilotQuery.count({ where: { workspaceId: wsId } }),
      prisma.coverageGap.findMany({
        where: { workspaceId: wsId, status: 'open' },
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
    ]);

  const steps = [
    {
      done: tokenCount > 0,
      icon: KeyRound,
      title: 'Connect the recorder',
      desc: 'Generate a token — or use the extension’s Connect button.',
      href: '/dashboard/settings',
      cta: 'Get token',
    },
    {
      done: readyCount > 0,
      icon: Video,
      title: 'Record & review a workflow',
      desc: 'Record your product; the worker turns it into knowledge.',
      href: '/dashboard/recordings',
      cta: 'View recordings',
    },
    {
      done: approvalCount > 0,
      icon: ShieldCheck,
      title: 'Approve a workflow for the copilot',
      desc: 'Approve the workflows the copilot may answer from.',
      href: '/dashboard/recordings',
      cta: 'Approve',
    },
    {
      done: queryCount > 0,
      icon: Code2,
      title: 'Embed the copilot',
      desc: 'Copy the snippet into your app and start answering.',
      href: '/dashboard/copilot',
      cta: 'Get snippet',
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 px-4 py-8 md:px-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome to Sync Studio
        </h1>
        <p className="text-sm text-muted-foreground">
          Record your product, approve workflows, and embed an in-app copilot
          grounded only in what you approve.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Get started</CardTitle>
            <span className="text-sm text-muted-foreground">
              {doneCount} of {steps.length} done
            </span>
          </div>
          <CardDescription>
            Four steps to a live, grounded copilot in your app.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {steps.map((s, i) => {
              const Icon = s.icon;
              return (
                <li key={i} className="flex items-center gap-4 py-3">
                  <span
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                      s.done
                        ? 'bg-green-100 text-green-700'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {s.done ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Icon className="h-4 w-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        'text-sm font-medium',
                        s.done && 'text-muted-foreground',
                      )}
                    >
                      {s.title}
                    </p>
                    <p className="text-xs text-muted-foreground">{s.desc}</p>
                  </div>
                  {!s.done && (
                    <Button asChild variant="outline" size="sm">
                      <Link href={s.href}>{s.cta}</Link>
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Coverage gaps — record these next
          </CardTitle>
          <CardDescription>
            Questions your copilot couldn’t answer from approved workflows.
            Record (and approve) these to close the gap.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {openGaps.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No open gaps. Once the copilot is live, questions it can’t answer
              show up here.
            </p>
          ) : (
            <ul className="divide-y">
              {openGaps.map((g) => (
                <li key={g.id} className="flex items-center gap-3 py-3">
                  <Badge variant="secondary" className="capitalize">
                    {g.source}
                  </Badge>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{g.prompt}</span>
                    {g.reason && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {g.reason}
                      </span>
                    )}
                  </span>
                  <form action={resolveCoverageGap.bind(null, g.id)}>
                    <Button type="submit" variant="ghost" size="sm">
                      Dismiss
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
