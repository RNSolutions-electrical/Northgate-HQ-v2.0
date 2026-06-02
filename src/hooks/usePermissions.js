import { useUser } from '@clerk/clerk-react';

export function usePermissions() {
  const { user, isLoaded, isSignedIn } = useUser();

  return {
    isLoaded,
    isSignedIn,
    userId: user?.id ?? null,
    role: 'Developer',
    division: 'Admin',
    canAccessDeveloper: true,
    canManageInventory: true,
    canViewFinancials: true,
  };
}
