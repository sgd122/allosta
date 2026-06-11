import { Layout } from '@/widgets/app-shell';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <Layout context="분석">{children}</Layout>;
}
