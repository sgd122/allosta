import type { Role } from '@/shared/config';

export const ROLE_LABEL: Record<Role, string> = {
  CUSTOMER: '고객',
  COUNSELOR: '상담사',
  ADMIN: '관리자',
};

export const ROLE_COLOR: Record<Role, 'teal' | 'amber' | 'violet'> = {
  CUSTOMER: 'teal',
  COUNSELOR: 'amber',
  ADMIN: 'violet',
};
