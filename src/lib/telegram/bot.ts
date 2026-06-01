/**
 * Telegram Bot Server
 * 
 * Handles Telegram bot commands and sends alerts/updates to users.
 * 
 * Commands:
 * /start — Welcome + link account
 * /leaderboard — Top traders
 * /trader <wallet> — Trader profile
 * /market <query> — Search markets
 * /alerts — Manage alerts
 * /agent — Agent status
 * /feed — Latest feed
 */

import { Bot, webhookCallback } from 'grammy';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export function createBot() {
  if (!BOT_TOKEN) {
    console.warn('TELEGRAM_BOT_TOKEN not set — bot disabled');
    return null;
  }

  const bot = new Bot(BOT_TOKEN);

  // ── Commands ─────────────────────────────────────────────
  bot.command('start', async (ctx) => {
    await ctx.reply(
      `🤖 **Niche Trust Bot**\n\n` +
      `مرحباً! أنا وكيل Niche Trust على تليجرام.\n\n` +
      `📊 /leaderboard — أقوى المتداولين\n` +
      `🔍 /trader <wallet> — تحليل متداول\n` +
      `📈 /market <query> — البحث عن أسواق\n` +
      `🔔 /alerts — إدارة التنبيهات\n` +
      `🤖 /agent — حالة الوكيل\n` +
      `⚡ /feed — آخر التحركات\n` +
      `💰 /opportunities — فرص الربح\n\n` +
      `🌐 ${APP_URL}`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('leaderboard', async (ctx) => {
    try {
      const args = ctx.message?.text?.split(' ').slice(1) || [];
      const sortBy = args[0] || 'masterPMI';
      const limit = Math.min(10, parseInt(args[1] || '5'));

      const res = await fetch(`${APP_URL}/api/leaderboard/traders?limit=${limit}&sortBy=${sortBy}`);
      const data = await res.json();
      const entries = data.entries || [];

      if (!entries.length) {
        return ctx.reply('مفيش بيانات حالياً');
      }

      const msg = `📊 **Leaderboard** (sorted by ${sortBy})\n\n` +
        entries.map((e: any, i: number) => {
          const t = e.trader;
          const v2 = e.v2 || {};
          return `${i + 1}. **${t.displayName || t.proxyWallet?.slice(0, 8) + '...'}**\n` +
            `   🎯 PMI: ${(v2.masterPMI || 0).toFixed(1)} · 📊 ROI: ${(Number(t.roi) || 0).toFixed(1)}%\n` +
            `   ⚡ Alpha: ${(v2.alphaScore || 0).toFixed(1)} · 🎲 Trades: ${t.totalTrades || 0}`;
        }).join('\n\n');

      await ctx.reply(msg, { parse_mode: 'Markdown' });
    } catch (e: any) {
      await ctx.reply(`❌ Error: ${e.message?.slice(0, 200) || 'Unknown error'}`);
    }
  });

  bot.command('trader', async (ctx) => {
    const args = ctx.message?.text?.split(' ').slice(1) || [];
    if (!args[0]) {
      return ctx.reply('⚠️ Usage: /trader <wallet_address>\nExample: /trader 0x1234...');
    }

    try {
      const res = await fetch(`${APP_URL}/api/trader/${args[0]}`);
      const data = await res.json();
      const t = data.trader;
      if (!t) return ctx.reply('❌ Trader not found');

      const v2 = t.v2Scores || {};
      const msg = `📊 **Trader Profile**\n\n` +
        `🏷 ${t.displayName || t.proxyWallet?.slice(0, 12) + '...'}\n` +
        `💰 Volume: $${(Number(t.totalVolumeUsd) || 0).toLocaleString()}\n` +
        `📈 ROI: ${(Number(t.roi) || 0).toFixed(1)}% · Win: ${(Number(t.winRate) || 0).toFixed(0)}%\n\n` +
        `🎯 **V2 Scores:**\n` +
        `   PMI: ${(v2.masterPMI || 0).toFixed(1)}\n` +
        `   Alpha: ${(v2.alphaScore || 0).toFixed(1)}\n` +
        `   Predictive: ${(v2.predictiveScore || 0).toFixed(1)}\n` +
        `   Confidence: ${(v2.confidenceScore || 0).toFixed(1)}\n` +
        `   Risk: ${(v2.riskScore || 0).toFixed(1)}\n` +
        `   Behavior: ${(v2.behaviorScore || 0).toFixed(1)}\n\n` +
        `🎲 Trades: ${t.totalTrades || 0} · Risk: ${t.riskLevel || 'N/A'}\n` +
        `🏷 Categories: ${(t.categories || []).join(', ') || 'general'}`;

      await ctx.reply(msg, { parse_mode: 'Markdown' });
    } catch (e: any) {
      await ctx.reply(`❌ Error: ${e.message?.slice(0, 200) || 'Unknown error'}`);
    }
  });

  bot.command('market', async (ctx) => {
    const query = ctx.message?.text?.split(' ').slice(1).join(' ');
    if (!query) {
      return ctx.reply('⚠️ Usage: /market <query>\nExample: /market trump election');
    }

    try {
      const res = await fetch(`${APP_URL}/api/markets/live?search=${encodeURIComponent(query)}&limit=5`);
      const data = await res.json();
      const markets = data.markets || [];

      if (!markets.length) {
        return ctx.reply(`مفيش نتائج لـ "${query}"`);
      }

      const msg = `🔍 **Search: ${query}**\n\n` +
        markets.map((m: any) =>
          `📈 ${m.question?.slice(0, 70)}\n✅ YES: ${m.yes_price}% · Vol: $${m.volume_24h?.toLocaleString()}`
        ).join('\n\n');

      await ctx.reply(msg, { parse_mode: 'Markdown' });
    } catch (e: any) {
      await ctx.reply(`❌ Error: ${e.message?.slice(0, 200) || 'Unknown error'}`);
    }
  });

  bot.command('opportunities', async (ctx) => {
    try {
      const res = await fetch(`${APP_URL}/api/markets/live?limit=10&order=volume24hr`);
      const data = await res.json();
      const markets = (data.markets || []).slice(0, 5);

      if (!markets.length) {
        return ctx.reply('مفيش فرص دلوقتي');
      }

      const msg = `🎯 **Top Opportunities**\n\n` +
        markets.map((m: any) =>
          `📈 ${m.question?.slice(0, 65)}\n✅ ${m.yes_price}% · Vol: $${m.volume_24h?.toLocaleString()} · 📈 24h: ${m.price_change_24h > 0 ? '+' : ''}${m.price_change_24h?.toFixed(1)}%`
        ).join('\n\n');

      await ctx.reply(msg, { parse_mode: 'Markdown' });
    } catch (e: any) {
      await ctx.reply(`❌ Error: ${e.message?.slice(0, 200) || 'Unknown error'}`);
    }
  });

  bot.command('alerts', async (ctx) => {
    const alerts = JSON.parse(getUserAlerts(ctx.from?.id?.toString() || '') || '[]');
    if (!alerts.length) {
      return ctx.reply('🔔 **Alerts**\n\nمفيش تنبيهات نشطة.\n\nاستخدم /setalert لإنشاء تنبيه.', { parse_mode: 'Markdown' });
    }

    const msg = `🔔 **Your Alerts**\n\n` +
      alerts.map((a: any, i: number) =>
        `${i + 1}. ${a.enabled ? '🟢' : '⚪'} ${a.label || a.type}${a.threshold ? ` (>${a.threshold})` : ''}`
      ).join('\n');

    await ctx.reply(msg, { parse_mode: 'Markdown' });
  });

  bot.command('agent', async (ctx) => {
    const status = JSON.parse(getUserAgentStatus(ctx.from?.id?.toString() || '') || '{"isActive":false}');
    const msg = `🤖 **Agent Status**\n\n` +
      `Status: ${status.isActive ? '🟢 Active' : '⚪ Inactive'}\n` +
      `Total Trades: ${status.totalTrades || 0}\n` +
      `Net PnL: $${(status.totalPnl || 0).toFixed(2)}\n` +
      `Last Action: ${status.lastAction || 'None'}\n\n` +
      `Use /agent_on to enable\nUse /agent_off to disable`;

    await ctx.reply(msg, { parse_mode: 'Markdown' });
  });

  bot.command('agent_on', async (ctx) => {
    saveUserAgentStatus(ctx.from?.id?.toString() || '', { isActive: true, lastAction: 'Agent enabled via Telegram', lastActionTime: Date.now() });
    await ctx.reply('✅ **Agent Enabled**\n\nالوكيل نشط وبيراقب الفرص.');
  });

  bot.command('agent_off', async (ctx) => {
    saveUserAgentStatus(ctx.from?.id?.toString() || '', { isActive: false, lastAction: 'Agent disabled via Telegram', lastActionTime: Date.now() });
    await ctx.reply('⏸ **Agent Disabled**\n\nتم إيقاف الوكيل.');
  });

  bot.command('feed', async (ctx) => {
    const feed = JSON.parse(getUserFeed(ctx.from?.id?.toString() || '') || '[]');
    if (!feed.length) {
      return ctx.reply('⚡ **Smart Feed**\n\nمفيش تحركات جديدة. هيتم إشعارك لما يحصل شيء مهم.');
    }

    const msg = `⚡ **Smart Feed**\n\n` +
      feed.slice(-10).map((f: any) =>
        `${f.type === 'whale' ? '🐋' : f.type === 'signal' ? '📡' : '⚡'} ${f.action}\n` +
        `${f.market?.slice(0, 60) || ''}${f.size ? ` · $${f.size?.toLocaleString()}` : ''}${f.change ? ` · ${f.change > 0 ? '+' : ''}${f.change?.toFixed(1)}%` : ''}`
      ).join('\n\n');

    await ctx.reply(msg, { parse_mode: 'Markdown' });
  });

  // Error handler
  bot.catch((err) => {
    console.error('Telegram bot error:', err);
  });

  return bot;
}

// ── Helper functions (client-side storage simulation) ─────────
function getUserAlerts(userId: string): string {
  try { return localStorage.getItem(`tg_alerts_${userId}`) || '[]'; } catch { return '[]'; }
}

function saveUserAlert(userId: string, alert: any) {
  try {
    const alerts = JSON.parse(getUserAlerts(userId));
    alerts.push(alert);
    localStorage.setItem(`tg_alerts_${userId}`, JSON.stringify(alerts));
  } catch { /* */ }
}

function getUserAgentStatus(userId: string): string {
  try { return localStorage.getItem(`tg_agent_${userId}`) || '{"isActive":false}'; } catch { return '{"isActive":false}'; }
}

function saveUserAgentStatus(userId: string, status: any) {
  try { localStorage.setItem(`tg_agent_${userId}`, JSON.stringify(status)); } catch { /* */ }
}

function getUserFeed(userId: string): string {
  try { return localStorage.getItem(`tg_feed_${userId}`) || '[]'; } catch { return '[]'; }
}

// ── Webhook handler for Next.js ──────────────────────────────
export async function telegramWebhookHandler(req: Request) {
  const bot = createBot();
  if (!bot) return new Response('Bot not configured', { status: 503 });
  
  // In production, use webhookCallback
  // For development, use polling
  return webhookCallback(bot, 'next-js')(req);
}

// ── Send alert to specific user ──────────────────────────────
export async function sendTelegramAlert(chatId: string, message: string) {
  if (!BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' }),
    });
  } catch (e) {
    console.error('Failed to send Telegram alert:', e);
  }
}
