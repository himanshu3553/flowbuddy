import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { ConnectClient } from './connect-client';

export const dynamic = 'force-dynamic';

/** The page the recorder extension opens to link itself to the signed-in account. */
export default async function ConnectPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin');
  return <ConnectClient email={session.user.email ?? ''} />;
}
