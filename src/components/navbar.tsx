import Link from 'next/link';

export function Navbar() {
  return (
    <nav className="flex items-center gap-6 border-b border-[var(--border)] bg-[var(--bg)] px-6 py-4">
      <Link href="/" className="text-lg font-bold text-[var(--accent)]">
        Niche Trust
      </Link>
      <Link
        href="/leaderboard"
        className="text-sm text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
      >
        Leaderboard
      </Link>
      <Link
        href="/admin"
        className="text-sm text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
      >
        Admin
      </Link>
      <div className="ml-auto flex items-center gap-4">
        <a
          href="https://niche-trust.vercel.app/leaderboard"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
        >
          🌐 Live Site
        </a>
      </div>
    </nav>
  );
}