'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Layout } from '@/widgets/app-shell';

function CounselorNav() {
  const pathname = usePathname() ?? '';
  return (
    <nav className="counselor-nav" aria-label="상담사 메뉴">
      <Link
        href="/schedule"
        className={`counselor-nav-link${pathname.startsWith('/schedule') ? ' is-active' : ''}`}
      >
        상담 일정
      </Link>
      <Link
        href="/performance"
        className={`counselor-nav-link${pathname.startsWith('/performance') ? ' is-active' : ''}`}
      >
        성과 대시보드
      </Link>
      <Link
        href="/availability"
        className={`counselor-nav-link${pathname.startsWith('/availability') ? ' is-active' : ''}`}
      >
        가용 일정 관리
      </Link>
    </nav>
  );
}

export default function CounselorLayout({ children }: { children: React.ReactNode }) {
  return (
    <Layout context="상담사 콘솔">
      <CounselorNav />
      {children}
    </Layout>
  );
}
