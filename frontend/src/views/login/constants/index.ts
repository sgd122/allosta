import type { DemoAccount } from '../types';

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { role: 'CUSTOMER', label: '고객', email: 'customer@demo.com', password: 'demo1234' },
  { role: 'COUNSELOR', label: '상담사', email: 'counselor@demo.com', password: 'demo1234' },
  { role: 'ADMIN', label: '관리자', email: 'admin@demo.com', password: 'demo1234' },
];

export const ROLE_HOME: Record<string, string> = {
  CUSTOMER: '/book',
  COUNSELOR: '/schedule',
  ADMIN: '/dashboard',
};
