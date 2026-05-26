import { getCurrentUser } from '@/lib/auth/get-user';
import { SignOutButton } from './sign-out-button';

export async function UserNav() {
  const user = await getCurrentUser();
  if (!user) return null;

  // Show initials avatar
  const initials = user.email?.substring(0, 2).toUpperCase() ?? 'U';

  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
        <span className="text-xs font-semibold text-primary-foreground">{initials}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-foreground truncate">{user.email}</p>
      </div>
      <SignOutButton />
    </div>
  );
}
