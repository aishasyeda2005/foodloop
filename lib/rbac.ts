// lib/rbac.ts (Sections B, E)
import { UserRole } from './types';

export type Action =
  | 'lot:create'
  | 'lot:view'
  | 'match:review'
  | 'offer:accept'
  | 'pickup:view'
  | 'handover:confirm'
  | 'impact:view';

const ROLE_PERMISSIONS: Record<UserRole, Action[]> = {
  donor_outlet: [
    'lot:create',
    'lot:view',
    'match:review',
    'pickup:view',
    'handover:confirm',
    'impact:view',
  ],
  charity_coordinator: [
    'lot:view',
    'offer:accept',
    'pickup:view',
    'impact:view',
  ],
  volunteer_dispatcher: [
    'pickup:view',
    'impact:view',
  ],
};

export function hasPermission(role: UserRole, action: Action): boolean {
  return ROLE_PERMISSIONS[role]?.includes(action) ?? false;
}

export function assertAuthorized(role: UserRole, action: Action): void {
  if (!hasPermission(role, action)) {
    throw new Error(`Unauthorized: Role '${role}' lacks permission for '${action}' (Section E).`);
  }
}
