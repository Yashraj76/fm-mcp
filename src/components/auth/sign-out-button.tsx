'use client';

import { signOut } from '@/lib/auth/actions';

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut()}
      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      Sign out
    </button>
  );
}
