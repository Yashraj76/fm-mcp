'use client';

import { signOut } from '@/lib/auth/actions';
import { useQueryClient } from '@tanstack/react-query';

export function SignOutButton() {
  const queryClient = useQueryClient();

  async function handleSignOut() {
    // Wipe ALL cached query data immediately so no stale data from this
    // user's session can ever appear for the next user who logs in.
    queryClient.clear();
    await signOut();
  }

  return (
    <button
      onClick={handleSignOut}
      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      Sign out
    </button>
  );
}
