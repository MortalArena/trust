import { PageShell } from '@/components/ui/page-shell';
import { AdminDashboardClient } from './admin-client';

export const metadata = {
  title: 'Admin — Niche Trust Platform',
};

export default function AdminPage() {
  return (
    <PageShell>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <AdminDashboardClient />
      </div>
    </PageShell>
  );
}
