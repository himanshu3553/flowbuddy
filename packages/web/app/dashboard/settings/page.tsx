import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { getCurrentWorkspace } from '@/lib/session';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { CreateToken } from '../create-token';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await auth();
  const ctx = await getCurrentWorkspace();
  if (!ctx || !session?.user) redirect('/signin');

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 md:px-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Your workspace and recorder connection.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workspace</CardTitle>
          <CardDescription>Account &amp; workspace details.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center justify-between border-b pb-2">
            <span className="text-muted-foreground">Workspace</span>
            <span className="font-medium">{ctx.workspace.name}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Account</span>
            <span className="font-medium">{session.user.email}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Extension API token</CardTitle>
          <CardDescription>
            Generate a token and paste it into the Sync Recorder extension. (The
            extension&apos;s &ldquo;Connect&rdquo; button does this for you
            automatically.)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateToken />
        </CardContent>
      </Card>
    </div>
  );
}
