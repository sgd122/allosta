'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TabNav } from '@radix-ui/themes';
import { Layout } from '@/widgets/app-shell';

const NAV_ITEMS = [
  { href: '/book',     label: '예약하기' },
  { href: '/bookings', label: '내 예약'  },
  { href: '/results',  label: '검사결과' },
] as const;

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <Layout context="예약">
      <TabNav.Root mb="5">
        {NAV_ITEMS.map(({ href, label }) => {
          const isActive = pathname != null && (pathname === href || pathname.startsWith(`${href}/`));
          return (
            <TabNav.Link key={href} asChild active={isActive}>
              <Link href={href}>{label}</Link>
            </TabNav.Link>
          );
        })}
      </TabNav.Root>
      {children}
    </Layout>
  );
}
