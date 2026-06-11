import type { FamilyLinkStatus } from '../types';

export const STATUS_LABEL: Record<FamilyLinkStatus, string> = {
  ACCEPTED: '연동됨',
  PENDING: '대기중',
  REVOKED: '해제됨',
};

export const STATUS_COLOR: Record<FamilyLinkStatus, 'teal' | 'amber' | 'gray'> = {
  ACCEPTED: 'teal',
  PENDING: 'amber',
  REVOKED: 'gray',
};
