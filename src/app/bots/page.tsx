'use client';

import { useState } from 'react';
import { BOT_MARKETPLACE, BOT_CATEGORIES, type BotDefinition } from '@/lib/bots/marketplace';

export default function BotMarketplacePage() {
  const [category, setCategory] = useState('all');
  const [selectedBot, setSelectedBot] = useState<BotDefinition | null>(null);
  const [installedBots, setInstalledBots] = useState<string[]>([]);

  const bots = category === 'all' ? BOT_MARKETPLACE : BOT_MARKETPLACE.filter(b => b.category === category);

  const handleInstall = (botId: string) => {
    setInstalledBots(prev => [...prev, botId]);
    setSelectedBot(null);
  };

  return (
    <div className="min-h-screen bg-[#030712] text-white">
      <header className="sticky top-0 z-50 border-b border-[#111827] bg-[#030712]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-4 py-3">
          <h1 className="text-lg font-black"><span className="text-blue-400">NICHE</span>TRUST</h1>
          <nav className="flex items-center gap-1">
            {['Markets', 'Leaderboard', 'Groups', 'Bots', 'Learn'].map(l => (
              <a key={l} href={`/${l.toLowerCase()}`} className="rounded px-2 py-1 text-[11px] font-bold text-zinc-400 hover:text-white transition-colors">{l}</a>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-6">
        <div className="mb-6">
          <h2 className="text-xl font-black text-white">🤖 Bot Marketplace</h2>
          <p className="mt-1 text-xs text-zinc-500">Professional bots for copy trading, alerts, analysis, and risk management</p>
        </div>

        {/* Categories */}
        <div className="mb-6 flex gap-2 flex-wrap">
          {BOT_CATEGORIES.map(c => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
                category === c.id ? 'bg-blue-600 text-white' : 'bg-[#0b1120] border border-[#1f2937] text-zinc-400 hover:text-white'
              }`}
            >
              {c.icon} {c.label}
            </button>
          ))}
        </div>

        {/* Bot Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {bots.map(bot => (
            <div key={bot.id} className="rounded-2xl border border-[#111827] bg-[#0b1120] p-5 hover:border-zinc-700 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-800 text-2xl">{bot.icon}</div>
                  <div>
                    <h3 className="text-sm font-bold text-white">{bot.name}</h3>
                    <div className="text-[10px] text-zinc-500">{bot.description.slice(0, 60)}...</div>
                  </div>
                </div>
                <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${bot.price === 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-blue-500/10 text-blue-400'}`}>
                  {bot.price === 0 ? 'FREE' : `$${bot.price}/mo`}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-1">
                {bot.features.slice(0, 3).map((f, i) => (
                  <span key={i} className="rounded bg-zinc-800 px-1.5 py-0.5 text-[8px] text-zinc-400">{f.slice(0, 30)}</span>
                ))}
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setSelectedBot(bot)}
                  className="flex-1 rounded-lg border border-zinc-700 px-3 py-2 text-[10px] font-bold text-zinc-400 hover:text-white transition-colors"
                >
                  Details
                </button>
                <button
                  onClick={() => handleInstall(bot.id)}
                  disabled={installedBots.includes(bot.id)}
                  className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-[10px] font-bold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {installedBots.includes(bot.id) ? '✓ Installed' : 'Install'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Bot Detail Modal */}
      {selectedBot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-800 bg-[#0b1120] p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-zinc-800 text-3xl">{selectedBot.icon}</div>
                <div>
                  <h3 className="text-lg font-black text-white">{selectedBot.name}</h3>
                  <div className="text-xs text-zinc-500">{selectedBot.description}</div>
                </div>
              </div>
              <button onClick={() => setSelectedBot(null)} className="text-zinc-400 hover:text-white text-lg">✕</button>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <span className={`rounded px-2 py-1 text-xs font-bold ${selectedBot.price === 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-blue-500/10 text-blue-400'}`}>
                {selectedBot.price === 0 ? 'FREE' : `$${selectedBot.price}/month`}
              </span>
              <span className="rounded bg-zinc-800 px-2 py-1 text-[10px] text-zinc-400 capitalize">{selectedBot.category.replace('_', ' ')}</span>
            </div>

            <div className="mt-4">
              <h4 className="text-xs font-bold text-white mb-2">Features</h4>
              <div className="space-y-1.5">
                {selectedBot.features.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-zinc-400">
                    <span className="text-emerald-400">✓</span> {f}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <h4 className="text-xs font-bold text-white mb-2">Configuration</h4>
              <div className="space-y-2">
                {selectedBot.configSchema.map(field => (
                  <div key={field.key} className="rounded-lg border border-zinc-800 p-3">
                    <div className="text-[10px] font-bold text-white">{field.label}</div>
                    <div className="text-[9px] text-zinc-500">{field.description}</div>
                    <div className="mt-1 text-[10px] text-blue-400">Default: {String(field.default)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button onClick={() => setSelectedBot(null)} className="flex-1 rounded-lg border border-zinc-700 px-4 py-2.5 text-xs font-bold text-zinc-400 hover:text-white transition-colors">
                Close
              </button>
              <button
                onClick={() => handleInstall(selectedBot.id)}
                disabled={installedBots.includes(selectedBot.id)}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {installedBots.includes(selectedBot.id) ? '✓ Installed' : `Install ${selectedBot.price === 0 ? 'Free' : `$${selectedBot.price}/mo`}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
