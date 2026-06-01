'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ── Types ────────────────────────────────────────────────────
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  toolResult?: { name: string; args: Record<string, any>; result: string };
}

interface AgentConfig {
  model: string;
  apiKey: string;
  provider: 'openrouter' | 'openai' | 'anthropic' | 'google' | 'custom';
  apiUrl: string;
  temperature: number;
  maxTokens: number;
  customInstructions: string;
}

// ── Models Registry (محدث 2026) ──────────────────────────────
const MODELS = [
  // OpenRouter (recommended — نموذج واحد لكل الموديلات)
  { id: 'openrouter/auto', label: '🤖 Auto (Recommended)', provider: 'openrouter' as const, apiUrl: 'https://openrouter.ai/api/chat/completions', desc: 'يختار أقوى موديل تلقائياً' },
  { id: 'openrouter/anthropic/claude-sonnet-4', label: 'Claude Sonnet 4', provider: 'openrouter' as const, apiUrl: 'https://openrouter.ai/api/chat/completions', desc: 'Anthropic — ممتاز للتحليل' },
  { id: 'openrouter/anthropic/claude-opus-4', label: 'Claude Opus 4', provider: 'openrouter' as const, apiUrl: 'https://openrouter.ai/api/chat/completions', desc: 'أقوى موديل من Anthropic' },
  { id: 'openrouter/openai/gpt-4o', label: 'GPT-4o', provider: 'openrouter' as const, apiUrl: 'https://openrouter.ai/api/chat/completions', desc: 'OpenAI — سريع ودقيق' },
  { id: 'openrouter/openai/gpt-4o-mini', label: 'GPT-4o Mini', provider: 'openrouter' as const, apiUrl: 'https://openrouter.ai/api/chat/completions', desc: 'رخيص وسريع' },
  { id: 'openrouter/google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'openrouter' as const, apiUrl: 'https://openrouter.ai/api/chat/completions', desc: 'Google — تحليل عميق' },
  { id: 'openrouter/meta-llama/llama-4-maverick', label: 'Llama 4 Maverick', provider: 'openrouter' as const, apiUrl: 'https://openrouter.ai/api/chat/completions', desc: 'Meta — مفتوح المصدر' },
  { id: 'openrouter/deepseek/deepseek-v3', label: 'DeepSeek V3', provider: 'openrouter' as const, apiUrl: 'https://openrouter.ai/api/chat/completions', desc: 'صيني — ممتاز للكود' },

  // Direct APIs
  { id: 'openai/gpt-4o', label: 'GPT-4o (Direct)', provider: 'openai' as const, apiUrl: 'https://api.openai.com/v1/chat/completions', desc: 'OpenAI direct API' },
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o Mini (Direct)', provider: 'openai' as const, apiUrl: 'https://api.openai.com/v1/chat/completions', desc: 'OpenAPI direct — رخيص' },
  { id: 'anthropic/claude-sonnet-4-20250514', label: 'Claude Sonnet 4 (Direct)', provider: 'anthropic' as const, apiUrl: 'https://api.anthropic.com/v1/messages', desc: 'Anthropic direct API' },
  { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro (Direct)', provider: 'google' as const, apiUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent', desc: 'Google direct API' },

  // Custom
  { id: 'custom', label: '⚙️ Custom Endpoint', provider: 'custom' as const, apiUrl: '', desc: 'أي endpoint تاني' },
];

// ── Agent Tools ──────────────────────────────────────────────
const TOOLS = [
  { name: 'get_trader_profile', desc: 'جلب بيانات متداول بالـ wallet address' },
  { name: 'get_leaderboard', desc: 'جلب البورد حسب أي فلتر — PMI, Alpha, ROI, إلخ' },
  { name: 'get_market_detail', desc: 'تفاصيل سوق معين' },
  { name: 'search_markets', desc: 'البحث عن أسواق بكلمة مفتاحية' },
  { name: 'get_portfolio', desc: 'محفظة المستخدم — اشتراكات، توقعات، أرباح' },
  { name: 'get_opportunities', desc: 'فرص ربح مرتبة بالـ Edge Score' },
  { name: 'set_alert', desc: 'إنشاء تنبيه جديد' },
  { name: 'toggle_agent', desc: 'تفعيل/إيقاف الوكيل الآلي' },
  { name: 'update_agent_rules', desc: 'تعديل قواعد الوكيل' },
];

// ── Execute Tool ─────────────────────────────────────────────
async function executeTool(name: string, args: Record<string, any>): Promise<string> {
  try {
    const apiBase = '';

    switch (name) {
      case 'get_trader_profile': {
        const r = await fetch(`${apiBase}/api/trader/${args.wallet}`);
        if (!r.ok) return `❌ مش لاقي متداول بالـ wallet: ${args.wallet}`;
        const d = await res.json();
        const t = d.trader;
        return `📊 **${t.displayName || args.wallet.slice(0, 8) + '...'}**
💰 Volume: $${(t.totalVolumeUsd || 0).toLocaleString()}
📈 ROI: ${(t.roi || 0).toFixed(1)}% · Win: ${(t.winRate || 0).toFixed(0)}%
🎯 PMI: ${(t.v2Scores?.masterPMI || 0).toFixed(1)} · Alpha: ${(t.v2Scores?.alphaScore || 0).toFixed(1)}
🧠 Predictive: ${(t.v2Scores?.predictiveScore || 0).toFixed(1)} · Confidence: ${(t.v2Scores?.confidenceScore || 0).toFixed(1)}
⚡ Trades: ${t.totalTrades || 0} · Risk: ${t.riskLevel || 'N/A'}
🏷 Categories: ${(t.categories || []).join(', ') || 'general'}`;
      }

      case 'get_leaderboard': {
        const p = new URLSearchParams({ limit: String(args.limit || 10), page: '1' });
        if (args.sortBy) p.set('sortBy', args.sortBy);
        if (args.category) p.set('category', args.category);
        const r = await fetch(`${apiBase}/api/leaderboard/traders?${p}`);
        if (!r.ok) return '❌ حصل مشكلة في جلب البورد';
        const d = await res.json();
        const entries = d.entries || [];
        if (!entries.length) return 'مفيش نتائج';
        return entries.map((e: any, i: number) => {
          const t = e.trader;
          const v2 = e.v2 || {};
          return `${i + 1}. **${t.displayName || t.proxyWallet.slice(0, 8) + '...'}**
   🎯 PMI: ${(v2.masterPMI || 0).toFixed(1)} · 📊 ROI: ${(Number(t.roi) || 0).toFixed(1)}%
   🧠 Predictive: ${(v2.predictiveScore || 0).toFixed(1)} · ⚡ Alpha: ${(v2.alphaScore || 0).toFixed(1)}
   💰 Volume: $${(Number(t.totalVolumeUsd) || 0).toLocaleString()} · 🎲 Trades: ${t.totalTrades || 0}`;
        }).join('\n\n');
      }

      case 'get_market_detail': {
        const r = await fetch(`${apiBase}/api/markets/live?id=${args.marketId}`);
        if (!r.ok) return '❌ مش لاقي السوق';
        const d = await res.json();
        const m = d.markets?.[0];
        if (!m) return 'مفيش بيانات';
        return `📈 **${m.question}**
✅ YES: ${m.yes_price}% · ❌ NO: ${m.no_price}%
💰 Volume 24h: $${m.volume_24h?.toLocaleString()} · 💧 Liq: $${m.liquidity?.toLocaleString()}
🏷 ${m.category || 'general'} · 📊 MCAP: $${m.mcap?.toLocaleString()}`;
      }

      case 'search_markets': {
        const r = await fetch(`${apiBase}/api/markets/live?search=${encodeURIComponent(args.query)}&limit=${args.limit || 10}`);
        if (!r.ok) return '❌ حصل مشكلة';
        const d = await res.json();
        const markets = d.markets || [];
        if (!markets.length) return 'مفيش نتائج';
        return markets.map((m: any) =>
          `📈 **${m.question.slice(0, 80)}**\n✅ YES: ${m.yes_price}% · 📊 Vol: $${m.volume_24h?.toLocaleString()}`
        ).join('\n\n');
      }

      case 'get_portfolio': {
        const r = await fetch(`${apiBase}/api/user/dashboard`);
        if (!r.ok) return '❌ محتاج تسجل دخول';
        const d = await res.json();
        return `📊 **محفظتك**
🎯 Active Subs: ${d.activeSubscriptions || 0}
💰 Total Spent: $${(d.totalSpentUsd || 0).toFixed(2)}
📈 Expert Balance: $${(d.expertBalanceUsd || 0).toFixed(2)}
🔮 Predictions: ${d.totalPredictions || 0}`;
      }

      case 'get_opportunities': {
        const p = new URLSearchParams({ limit: String(args.limit || 10) });
        if (args.category) p.set('cat', args.category);
        const r = await fetch(`${apiBase}/api/markets/live?${p}`);
        if (!r.ok) return '❌ حصل مشكلة';
        const d = await res.json();
        const ops = (d.markets || []).slice(0, 5);
        if (!ops.length) return 'مفيش فرص دلوقتي';
        return ops.map((m: any) =>
          `🎯 **${m.question?.slice(0, 70)}**\n✅ ${m.yes_price}% · 📊 Vol: $${m.volume_24h?.toLocaleString()} · 📈 24h: ${m.price_change_24h > 0 ? '+' : ''}${m.price_change_24h?.toFixed(1)}%`
        ).join('\n\n');
      }

      case 'set_alert': {
        const alerts = JSON.parse(localStorage.getItem('agent_alerts') || '[]');
        alerts.push({ id: `alert-${Date.now()}`, type: args.type, label: args.label, threshold: args.threshold, enabled: true, createdAt: Date.now() });
        localStorage.setItem('agent_alerts', JSON.stringify(alerts));
        return `✅ تم إنشاء التنبيه: **${args.label || args.type}**`;
      }

      case 'toggle_agent': {
        const s = { isActive: args.enabled, lastAction: args.enabled ? 'تم تفعيل الوكيل' : 'تم إيقاف الوكيل', lastActionTime: Date.now() };
        localStorage.setItem('agent_status', JSON.stringify(s));
        return args.enabled ? '✅ الوكيل نشط — بيراقب الفرص' : '⏸ تم إيقاف الوكيل';
      }

      case 'update_agent_rules': {
        localStorage.setItem('agent_rules', JSON.stringify(args.rules || []));
        return `✅ تم تحديث ${args.rules?.length || 0} قاعدة`;
      }

      default:
        return `أداة مش معروفة: ${name}`;
    }
  } catch (e: any) {
    return `❌ خطأ: ${e.message}`;
  }
}

// ── Main Component ──────────────────────────────────────────
export function AIChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<AgentConfig>({
    model: 'openrouter/auto',
    apiKey: '',
    provider: 'openrouter',
    apiUrl: 'https://openrouter.ai/api/chat/completions',
    temperature: 0.7,
    maxTokens: 4096,
    customInstructions: '',
  });
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      const s = localStorage.getItem('agent_config');
      if (s) setConfig(JSON.parse(s));
      const m = localStorage.getItem('agent_messages');
      if (m) setMessages(JSON.parse(m));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { localStorage.setItem('agent_config', JSON.stringify(config)); }, [config]);
  useEffect(() => { if (messages.length) localStorage.setItem('agent_messages', JSON.stringify(messages.slice(-50))); }, [messages]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // ── Format system prompt with tools ──────────────────────
  const buildSystemPrompt = useCallback(() => {
    const toolList = TOOLS.map(t => `- **${t.name}**: ${t.desc}`).join('\n');
    return `أنت Niche Trust AI Agent — مساعد ذكي لأسواق التنبؤ.

## الأدوات المتاحة:
${toolList}

## القواعد:
- استخدم الأدوات دائماً قبل الإجابة
- إذا طلب المستخدم بيانات، استخدم الأداة المناسبة فوراً
- أرجع النتائج بالعربي مع تنسيق markdown واضح
- ممنوع تنفيذ صفقات حقيقية — بس تحليل وتوصيات
- إذا مفيش أداة مناسبة، اسأل المستخدم يوضح

${config.customInstructions ? `\n## تعليمات إضافية:\n${config.customInstructions}` : ''}`;
  }, [config]);

  // ── Send message with proper tool execution ──────────────
  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading) return;
    if (!config.apiKey) { setError('⚠️ حط API Key في الإعدادات أولاً'); setShowSettings(true); return; }

    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: input.trim(), timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const systemPrompt = buildSystemPrompt();

      // Build conversation history
      const history = messages.slice(-15).map(m => ({
        role: m.role === 'system' ? 'user' : m.role,
        content: m.content,
      }));

      let currentMessages = [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: input.trim() },
      ];

      // Max 3 rounds of tool execution
      for (let round = 0; round < 3; round++) {
        const res = await fetch(config.apiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
            ...(config.provider === 'openrouter' && { 'HTTP-Referer': window.location.origin, 'X-Title': 'Niche Trust' }),
          },
          body: JSON.stringify({
            model: config.model,
            messages: currentMessages,
            temperature: config.temperature,
            max_tokens: config.maxTokens,
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`API ${res.status}: ${errText.slice(0, 300)}`);
        }

        const data = await res.json();
        const content: string = data.choices?.[0]?.message?.content || data.content?.[0]?.text || '';

        // Check if content contains a tool call (JSON format)
        const toolMatch = content.match(/```json\s*(\{[^}]*"tool"[^}]*\})\s*```/);

        if (toolMatch) {
          try {
            const toolCall = JSON.parse(toolMatch[1]);
            const toolName = toolCall.tool || toolCall.name;
            const toolArgs = toolCall.args || toolCall.arguments || {};

            // Execute the tool
            const toolResult = await executeTool(toolName, toolArgs);

            // Add assistant message with tool call
            const toolMsg: ChatMessage = {
              id: `t-${Date.now()}`,
              role: 'assistant',
              content: `🔧 تم تنفيذ: **${toolName}**`,
              timestamp: Date.now(),
              toolResult: { name: toolName, args: toolArgs, result: toolResult },
            };
            setMessages(prev => [...prev, toolMsg]);

            // Add tool result and continue conversation
            currentMessages.push(
              { role: 'assistant', content: content },
              { role: 'user', content: `Tool result for ${toolName}:\n${toolResult}\n\nBased on this data, provide a helpful response to the user in Arabic.` }
            );
            continue; // Next round

          } catch (parseErr) {
            // Not a valid tool call, show response
            const msg: ChatMessage = { id: `a-${Date.now()}`, role: 'assistant', content, timestamp: Date.now() };
            setMessages(prev => [...prev, msg]);
            break;
          }
        } else {
          // Regular response — add assistant message with markdown support
          const msg: ChatMessage = { id: `a-${Date.now()}`, role: 'assistant', content, timestamp: Date.now() };
          setMessages(prev => [...prev, msg]);
          break;
        }
      }

    } catch (e: any) {
      setError(e.message.slice(0, 200));
      setMessages(prev => [...prev, { id: `e-${Date.now()}`, role: 'assistant', content: `❌ ${e.message.slice(0, 200)}`, timestamp: Date.now() }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [input, loading, config, messages, buildSystemPrompt]);

  return (
    <>
      {/* FAB Button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-lg shadow-blue-600/30 hover:shadow-blue-600/50 hover:scale-105 transition-all text-xl"
      >
        {open ? '✕' : '🤖'}
      </button>

      {/* Chat Panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 flex h-[640px] w-[440px] flex-col rounded-2xl border border-zinc-800 bg-[#06080f] shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3 bg-[#0b1120]">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-violet-600 text-sm">🤖</div>
              <div>
                <div className="text-xs font-bold text-white">Niche Trust Agent</div>
                <div className="text-[9px] text-zinc-500">
                  {MODELS.find(m => m.id === config.model)?.label || 'Select model'} · {config.apiKey ? <span className="text-emerald-400">● Connected</span> : <span className="text-amber-400">● No Key</span>}
                </div>
              </div>
            </div>
            <button onClick={() => setShowSettings(!showSettings)} className="text-zinc-400 hover:text-white text-sm px-2 py-1 rounded hover:bg-zinc-800 transition-colors">⚙️</button>
          </div>

          {/* Settings Panel */}
          {showSettings && (
            <div className="border-b border-zinc-800 p-4 space-y-3 bg-[#0b1120] max-h-[55%] overflow-y-auto">
              <div>
                <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">🤖 اختار الموديل</label>
                <div className="mt-2 space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
                  {MODELS.map(m => (
                    <button
                      key={m.id}
                      onClick={() => setConfig(prev => ({ ...prev, model: m.id, provider: m.provider, apiUrl: m.apiUrl }))}
                      className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                        config.model === m.id
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
                      }`}
                    >
                      <div className="text-[10px] font-bold text-white">{m.label}</div>
                      <div className="text-[8px] text-zinc-500">{m.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">🔑 API Key</label>
                <input
                  type="password"
                  value={config.apiKey}
                  onChange={e => setConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                  placeholder={config.provider === 'openrouter' ? 'sk-or-v1-... (OpenRouter)' : config.provider === 'openai' ? 'sk-... (OpenAI)' : config.provider === 'anthropic' ? 'sk-ant-... (Anthropic)' : 'Your API key'}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-[10px] text-white outline-none focus:border-blue-500 font-mono placeholder:text-zinc-600"
                />
                <div className="mt-1 text-[8px] text-zinc-500">
                  {config.provider === 'openrouter' && '🌐 OpenRouter — بوابة واحدة لكل الموديلات. احصل على key من openrouter.ai'}
                  {config.provider === 'openai' && '🧠 OpenAI — GPT-4o, GPT-4o Mini. احصل على key من platform.openai.com'}
                  {config.provider === 'anthropic' && '🎯 Anthropic — Claude. احصل على key من console.anthropic.com'}
                  {config.provider === 'google' && '🔍 Google — Gemini. احصل على key من aistudio.google.com'}
                </div>
              </div>

              {config.model === 'custom' && (
                <div>
                  <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Custom API URL</label>
                  <input
                    value={config.apiUrl}
                    onChange={e => setConfig(prev => ({ ...prev, apiUrl: e.target.value }))}
                    placeholder="https://your-api.com/v1/chat/completions"
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-[10px] text-white outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              )}

              <div className="rounded-lg bg-zinc-900/50 border border-zinc-800 p-3">
                <div className="text-[9px] font-bold text-zinc-400 mb-2">🔒 صلاحيات الوكيل</div>
                <div className="grid grid-cols-2 gap-1 text-[8px]">
                  {TOOLS.map(t => (
                    <div key={t.name} className="flex items-center gap-1 text-zinc-500">
                      <span className="text-emerald-400">✓</span> {t.desc.slice(0, 30)}
                    </div>
                  ))}
                  <div className="flex items-center gap-1 text-zinc-600 col-span-2 mt-1 pt-1 border-t border-zinc-800">
                    <span className="text-red-400">✗</span> تنفيذ صفقات حقيقية
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-6">
                <div className="text-4xl mb-3">🤖</div>
                <div className="text-sm font-bold text-white mb-1">Niche Trust Agent</div>
                <div className="text-[10px] text-zinc-500 max-w-[300px] mx-auto mb-4">
                  اسألني عن أي متداول، سوق، أو فرصة ربه. هرجعل البيانات اللي عندك.
                </div>
                {[
                  'أظهر أقوى 5 متداولين بالـ PMI',
                  'ابحث عن فرص في أسواق الكريبتو',
                  'حلل محفظتي واشرحلي أدائي',
                  'Alert me when whale buys > $50k',
                ].map(q => (
                  <button key={q} onClick={() => { setInput(q); setTimeout(() => inputRef.current?.focus(), 100); }}
                    className="block w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2.5 text-[10px] text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors text-left mb-1.5">
                    {q}
                  </button>
                ))}
              </div>
            )}

            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[88%] rounded-xl px-3 py-2.5 text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-sm'
                    : msg.content.startsWith('❌')
                    ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                    : 'bg-zinc-800/80 text-zinc-200 rounded-bl-sm'
                }`}>
                  {/* Render content with basic markdown */}
                  <div className="whitespace-pre-wrap break-words">
                    {msg.content.split('\n').map((line, i) => {
                      // Bold
                      const bold = line.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-bold">$1</strong>');
                      return <div key={i} dangerouslySetInnerHTML={{ __html: bold }} />;
                    })}
                  </div>

                  {msg.toolResult && (
                    <div className="mt-2 rounded-lg bg-zinc-900/80 border border-zinc-700 p-2.5">
                      <div className="text-[9px] font-bold text-blue-400 mb-1">🔧 {msg.toolResult.name}</div>
                      <div className="text-[9px] text-zinc-400 whitespace-pre-wrap max-h-[120px] overflow-y-auto">{msg.toolResult.result.slice(0, 600)}</div>
                    </div>
                  )}

                  <div className="mt-1 text-[7px] opacity-40 text-right">{new Date(msg.timestamp).toLocaleTimeString('ar-EG')}</div>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="rounded-xl bg-zinc-800/80 px-4 py-3 text-xs text-zinc-400 rounded-bl-sm">
                  <span className="inline-flex gap-1 items-center">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-bounce" />
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0.15s' }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0.3s' }} />
                  </span>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Error */}
          {error && (
            <div className="mx-4 mb-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-[10px] text-red-400">{error}</div>
          )}

          {/* Input */}
          <div className="border-t border-zinc-800 p-3 bg-[#0b1120]">
            <div className="flex gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder={config.apiKey ? 'اسأل عن أي متداول، سوق، أو فرصة...' : '⚠️ حط API Key في الإعدادات أولاً'}
                disabled={loading}
                rows={1}
                className="flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-xs text-white outline-none focus:border-blue-500 resize-none disabled:opacity-50 placeholder:text-zinc-600"
              />
              <button
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                className="rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 px-4 py-2.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                {loading ? '...' : '➤'}
              </button>
            </div>
            <div className="mt-1.5 text-[7px] text-zinc-600 text-center">
              قراءة البيانات ✅ · تنبيهات ✅ · تحكم بالوكيل ✅ · تنفيذ صفقات ❌
            </div>
          </div>
        </div>
      )}
    </>
  );
}
