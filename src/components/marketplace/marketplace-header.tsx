'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { signOut, useSession } from 'next-auth/react';
import { useApp } from '@/components/providers/app-provider';
import { UserMenu } from './user-menu';
import { GlobalSearch } from './global-search';

const MAIN_SECTIONS = [
  { id: 'leaderboard', title: 'Leaderboard', href: '/leaderboard', icon: '📊', color: 'text-emerald-600' },
  { id: 'groups', title: 'Groups', href: '/groups', icon: '👥', color: 'text-blue-600' },
  { id: 'marketplace', title: 'Marketplace', href: '/bots', icon: '🏪', color: 'text-violet-600' },
  { id: 'platforms', title: 'Platforms', href: '/platforms', icon: '🌐', color: 'text-cyan-600' },
  { id: 'learn', title: 'Learn', href: '/learn', icon: '📖', color: 'text-amber-600' },
] as const;

const SUBMENU: Record<string, { href: string; label: string }[]> = {
  leaderboard: [
    { href: '/leaderboard', label: 'All traders' },
    { href: '/experts', label: 'Experts only' },
    { href: '/leaderboard?sortBy=edgeScore', label: 'By Edge Score' },
  ],
  groups: [
    { href: '/groups', label: 'All groups' },
    { href: '/groups?category=crypto', label: 'Crypto' },
    { href: '/groups?category=sports', label: 'Sports' },
    { href: '/groups?category=politics', label: 'Politics' },
  ],
  marketplace: [
    { href: '/bots', label: 'Expert bots' },
    { href: '/platforms', label: 'External platforms' },
  ],
  platforms: [
    { href: '/platforms', label: 'All platforms' },
    { href: '/polymarket', label: 'Polymarket' },
    { href: '/platforms/kalshi', label: 'Kalshi' },
    { href: '/platforms/manifold', label: 'Manifold' },
  ],
  learn: [
    { href: '/learn', label: 'Documentation' },
    { href: '/learn/quickstart', label: 'Quickstart' },
    { href: '/learn/api-reference', label: 'API Reference' },
    { href: '/learn/agent-api', label: 'Agent API' },
  ],
};

export function MarketplaceHeader() {
  const { t } = useApp();
  const { data: session } = useSession();
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [showMobileSearch, setShowMobileSearch] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('input[name="q"]')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    // Close submenu when clicking outside
    const handleClick = () => setActiveSection(null);
    if (activeSection) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [activeSection]);

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--surface)]">
      <div className="mx-auto max-w-7xl px-4">
        <div className="flex h-16 items-center gap-3">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 text-sm font-bold text-white">
              NT
            </span>
            <span className="hidden font-semibold text-[var(--text-primary)] sm:inline">{t.brand}</span>
          </Link>

          <div className="mx-auto hidden max-w-md flex-1 lg:block">
            <GlobalSearch />
          </div>

          <nav className="hidden items-center gap-1 md:flex">
            {MAIN_SECTIONS.map((s) => (
              <div key={s.id} className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveSection(activeSection === s.id ? null : s.id);
                  }}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    activeSection === s.id
                      ? 'bg-[var(--surface-hover)] text-[var(--text-primary)]'
                      : `${s.color} hover:bg-[var(--surface-hover)]`
                  }`}
                >
                  <span>{s.icon}</span>
                  {t.nav[s.id as keyof typeof t.nav] ?? s.title}
                  <span className="text-xs opacity-60">▾</span>
                </button>

                {activeSection === s.id && (
                  <div
                    className="absolute top-full left-0 mt-2 w-48 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 shadow-lg"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {SUBMENU[s.id].map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="block rounded px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
                        onClick={() => setActiveSection(null)}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {session?.user ? (
              <>
                <Link
                  href="/dashboard"
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
                >
                  {t.nav.dashboard}
                </Link>
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: '/' })}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
                >
                  {t.header.signOut}
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/connect"
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
                >
                  {t.header.login}
                </Link>
                <Link
                  href="/connect"
                  className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  {t.header.signup}
                </Link>
              </>
            )}
            <UserMenu />
          </div>
        </div>
      </div>
    </header>
  );
}