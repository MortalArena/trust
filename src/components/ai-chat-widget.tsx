'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ── Types ────────────────────────────────────────────────────
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  toolCall?: {
    name: string;
    args: Record<string, any>;
    result?: string;
  };
}

interface AgentConfig {
  model: string;
  apiKey: string;
  apiUrl: string;
  temperature: number;
  maxTokens: number;
  customInstructions: string;
}

interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
}

// ── Available Models ─────────────────────────────────────────
const AVAILABLE_MODELS = [
  { id: 'anthropic/claude-opus-4-20250514', label: 'Claude Opus 4', provider: 'Anthropic', apiUrl: 'https://api.anthropic.com/v1/messages' },
  { id: 'anthropic/claude-sonnet-4-20250514', label: 'Claude Sonnet 4', provider: 'Anthropic', apiUrl: 'https://api.anthropic.com/v1/messages' },
  { id: 'openai/gpt-4o', label: 'GPT-4o', provider: 'OpenAI', apiUrl: 'https://api.openai.com/v1/chat/completions' },
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o Mini', provider: 'OpenAI', apiUrl: 'https://api.openai.com/v1/chat/completions' },
  { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'Google', apiUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:streamGenerateContent' },
  { id: 'openrouter/auto', label: 'Auto (OpenRouter)', provider: 'OpenRouter', apiUrl: 'https://openrouter.ai/api/v1/chat/completions' },
];

// ── Agent Tools ──────────────────────────────────────────────
const AGENT_TOOLS: ToolDefinition[] = [
  {
    name: 'get_trader_profile',
    description: 'Get full trader profile by wallet address including V2 scores, trade history, positions',
    parameters: {
      wallet: { type: 'string', description: 'EVM wallet address (0x...)', required: true },
    },
  },
  {
    name: 'get_leaderboard',
    description: 'Get leaderboard data with filters (sortBy, category, page)',
    parameters: {
      sortBy: { type: 'string', description: 'Sort field: masterPMI, alphaScore, predictiveScore, roi, winRate, totalTrades' },
      category: { type: 'string', description: 'Filter by category: politics, crypto, sports, economics, etc.' },
      limit: { type: 'number', description: 'Number of results (default 20)' },
    },
  },
  {
    name: 'get_market_detail',
    description: 'Get detailed market information by market ID',
    parameters: {
      marketId: { type: 'string', description: 'Market ID from Polymarket', required: true },
    },
  },
  {
    name: 'search_markets',
    description: 'Search markets by keyword',
    parameters: {
      query: { type: 'string', description: 'Search query', required: true },
      limit: { type: 'number', description: 'Number of results (default 10)' },
    },
  },
  {
    name: 'get_user_portfolio',
    description: 'Get current user portfolio — subscriptions, predictions, agent status',
    parameters: {},
  },
  {
    name: 'get_opportunities',
    description: 'Get current market opportunities sorted by edge score',
    parameters: {
      minEdge: { type: 'number', description: 'Minimum edge score (default 50)' },
      category: { type: 'string', description: 'Filter by category' },
      limit: { type: 'number', description: 'Number of results (default 10)' },
    },
  },
  {
    name: 'set_alert',
    description: 'Create a new alert rule',
    parameters: {
      type: { type: 'string', description: 'Alert type: whale_move, pmi_threshold, alpha_spike, volume_surge' },
      label: { type: 'string', description: 'Alert label' },
      threshold: { type: 'number', description: 'Alert threshold value' },
    },
  },
  {
    name: 'toggle_agent',
    description: 'Enable or disable the automated trading agent',
    parameters: {
      enabled: { type: 'boolean', description: 'true to enable, false to disable', required: true },
    },
  },
  {
    name: 'update_agent_rules',
    description: 'Update agent trading rules',
    parameters: {
      rules: { type: 'array', description: 'Array of rule objects with type, label, enabled, config' },
    },
  },
];

// ── Component ────────────────────────────────────────────────
export function AIChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [config, setConfig] = useState<AgentConfig>({
    model: 'anthropic/claude-sonnet-4-20250514',
    apiKey: '',
    apiUrl: 'https://api.anthropic.com/v1/messages',
    temperature: 0.7,
    maxTokens: 4096,
    customInstructions: '',
  });
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load config from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('agent_config');
    if (saved) {
      try { setConfig(JSON.parse(saved)); } catch { /* ignore */ }
    }
    const savedMessages = localStorage.getItem('agent_messages');
    if (savedMessages) {
      try { setMessages(JSON.parse(savedMessages)); } catch { /* ignore */ }
    }
  }, []);

  // Save config
  useEffect(() => {
    localStorage.setItem('agent_config', JSON.stringify(config));
  }, [config]);

  // Save messages
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('agent_messages', JSON.stringify(messages.slice(-50)));
    }
  }, [messages]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const selectedModel = AVAILABLE_MODELS.find(m => m.id === config.model);

  // ── Execute Tool Call ─────────────────────────────────────
  const executeTool = useCallback(async (toolName: string, args: Record<string, any>): Promise<string> => {
    try {
      switch (toolName) {
        case 'get_trader_profile': {
          const res = await fetch(`/api/trader/${args.wallet}`);
          if (!res.ok) return `Error: Could not fetch trader profile for ${args.wallet}`;
          const data = await res.json();
          return JSON.stringify(data.trader, null, 2);
        }
        case 'get_leaderboard': {
          const params = new URLSearchParams({
            limit: String(args.limit || 20),
            page: '1',
            ...(args.sortBy && { sortBy: args.sortBy }),
            ...(args.category && { category: args.category }),
          });
          const res = await fetch(`/api/leaderboard/traders?${params}`);
          if (!res.ok) return 'Error: Could not fetch leaderboard';
          const data = await res.json();
          return JSON.stringify(data.entries?.slice(0, 10), null, 2);
        }
        case 'get_market_detail': {
          const res = await fetch(`/api/markets/live?id=${args.marketId}`);
          if (!res.ok) return `Error: Could not fetch market ${args.marketId}`;
          const data = await res.json();
          return JSON.stringify(data.markets?.[0], null, 2);
        }
        case 'search_markets': {
          const res = await fetch(`/api/markets/live?search=${encodeURIComponent(args.query)}&limit=${args.limit || 10}`);
          if (!res.ok) return `Error: Could not search markets`;
          const data = await res.json();
          return JSON.stringify(data.markets?.slice(0, 10), null, 2);
        }
        case 'get_user_portfolio': {
          const res = await fetch('/api/user/dashboard');
          if (!res.ok) return 'Error: Could not fetch portfolio';
          const data = await res.json();
          return JSON.stringify(data, null, 2);
        }
        case 'get_opportunities': {
          const params = new URLSearchParams({
            limit: String(args.limit || 10),
            ...(args.category && { cat: args.category }),
          });
          const res = await fetch(`/api/markets/live?${params}`);
          if (!res.ok) return 'Error: Could not fetch opportunities';
          const data = await res.json();
          return JSON.stringify(data.markets?.slice(0, 10), null, 2);
        }
        case 'set_alert': {
          // Save alert to localStorage (client-side for now)
          const alerts = JSON.parse(localStorage.getItem('agent_alerts') || '[]');
          alerts.push({ id: `alert-${Date.now()}`, type: args.type, label: args.label, threshold: args.threshold, enabled: true, createdAt: Date.now() });
          localStorage.setItem('agent_alerts', JSON.stringify(alerts));
          return `✅ Alert created: ${args.label || args.type}`;
        }
        case 'toggle_agent': {
          const agentStatus = JSON.parse(localStorage.getItem('agent_status') || '{"isActive":false}');
          agentStatus.isActive = args.enabled;
          agentStatus.lastAction = args.enabled ? 'Agent enabled' : 'Agent disabled';
          agentStatus.lastActionTime = Date.now();
          localStorage.setItem('agent_status', JSON.stringify(agentStatus));
          return args.enabled ? '✅ Agent enabled — watching for opportunities' : '⏸ Agent disabled';
        }
        case 'update_agent_rules': {
          localStorage.setItem('agent_rules', JSON.stringify(args.rules));
          return `✅ Agent rules updated: ${args.rules.length} rules`;
        }
        default:
          return `Unknown tool: ${toolName}`;
      }
    } catch (e: any) {
      return `Error executing ${toolName}: ${e.message}`;
    }
  }, []);

  // ── Send Message ─────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading) return;
    if (!config.apiKey) {
      setError('Please enter your API key in settings');
      return;
    }

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      // Build system prompt with tool definitions
      const toolDescriptions = AGENT_TOOLS.map(t =>
        `## ${t.name}\n${t.description}\nParameters: ${JSON.stringify(t.parameters)}`
      ).join('\n\n');

      const systemPrompt = `You are Niche Trust AI Agent — an intelligent assistant for prediction market trading.

You have access to real-time Polymarket data and can execute tools to help the user.

## Available Tools:
${toolDescriptions}

## Permissions:
- ✅ READ all data (traders, markets, leaderboard, portfolio)
- ✅ CREATE alerts
- ✅ ENABLE/DISABLE automated agent
- ✅ UPDATE agent rules
- ❌ EXECUTE real trades (not allowed — only recommendations)
- ❌ ACCESS other users' data
- ❌ MODIFY platform settings

## Guidelines:
- Always use tools to get fresh data before answering
- Provide actionable insights, not just raw data
- When analyzing traders, mention PMI, Alpha, Predictive scores
- Suggest specific actions the user can take
- Be concise but thorough
- Use markdown formatting for readability

${config.customInstructions ? `\n## Custom Instructions:\n${config.customInstructions}` : ''}`;

      // Build messages for API
      const apiMessages = [
        { role: 'system', content: systemPrompt },
        ...messages.slice(-20).map(m => ({ role: m.role === 'system' ? 'user' : m.role, content: m.content })),
        { role: 'user', content: input.trim() },
      ];

      // Determine API format based on model provider
      const isAnthropic = config.model.includes('anthropic');
      const isOpenAI = config.model.includes('openai');

      let apiBody: any;
      let headers: Record<string, string>;

      if (isAnthropic) {
        apiBody = {
          model: config.model.replace('anthropic/', ''),
          max_tokens: config.maxTokens,
          temperature: config.temperature,
          system: systemPrompt,
          messages: messages.slice(-20).map(m => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content,
          })),
        };
        headers = {
          'x-api-key': config.apiKey,
          'content-type': 'application/json',
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        };
      } else {
        apiBody = {
          model: config.model,
          messages: apiMessages,
          temperature: config.temperature,
          max_tokens: config.maxTokens,
          stream: false,
        };
        headers = {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        };
      }

      const res = await fetch(config.apiUrl || selectedModel?.apiUrl || config.apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(apiBody),
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`API Error ${res.status}: ${errBody.slice(0, 200)}`);
      }

      const data = await res.json();

      let assistantContent = '';
      if (isAnthropic) {
        assistantContent = data.content?.[0]?.text || 'No response';
      } else {
        assistantContent = data.choices?.[0]?.message?.content || 'No response';
      }

      // Check if response contains a tool call pattern
      const toolMatch = assistantContent.match(/<tool_call>\s*({[\s\S]*?})\s*<\/tool_call>/);
      if (toolMatch) {
        try {
          const toolCall = JSON.parse(toolMatch[1]);
          const result = await executeTool(toolCall.name, toolCall.args || {});

          const toolMsg: ChatMessage = {
            id: `msg-${Date.now()}-tool`,
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
            toolCall: { name: toolCall.name, args: toolCall.args || {}, result },
          };
          setMessages(prev => [...prev, toolMsg]);

          // Send follow-up with tool result
          const followUpBody = {
            ...apiBody,
            messages: [
              ...(isAnthropic ? apiBody.messages : apiMessages),
              { role: 'assistant', content: assistantContent },
              { role: 'user', content: `Tool result:\n${result}` },
            ],
          };

          const followUpRes = await fetch(config.apiUrl || selectedModel?.apiUrl || config.apiUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(followUpBody),
          });

          if (followUpRes.ok) {
            const followUpData = await followUpRes.json();
            if (isAnthropic) {
              assistantContent = followUpData.content?.[0]?.text || '';
            } else {
              assistantContent = followUpData.choices?.[0]?.message?.content || '';
            }
          }
        } catch (e) {
          // Tool call parsing failed, use raw content
        }
      }

      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: assistantContent,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, assistantMsg]);

    } catch (e: any) {
      setError(e.message);
      const errorMsg: ChatMessage = {
        id: `msg-${Date.now()}-error`,
        role: 'assistant',
        content: `❌ Error: ${e.message}`,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [input, loading, config, messages, selectedModel, executeTool]);

  // ── Render ───────────────────────────────────────────────
  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/30 hover:bg-blue-700 transition-all hover:scale-105"
      >
        {open ? '✕' : '🤖'}
      </button>

      {/* Chat Panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 flex h-[600px] w-[420px] flex-col rounded-2xl border border-zinc-800 bg-[#0b1120] shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🤖</span>
              <div>
                <div className="text-xs font-bold text-white">Niche Trust Agent</div>
                <div className="text-[9px] text-zinc-500">{selectedModel?.label || 'Select model'} · {config.apiKey ? '✅ Connected' : '⚠️ No API key'}</div>
              </div>
            </div>
            <button onClick={() => setShowSettings(!showSettings)} className="text-zinc-400 hover:text-white text-xs">⚙️</button>
          </div>

          {/* Settings */}
          {showSettings && (
            <div className="border-b border-zinc-800 p-4 space-y-3 max-h-[50%] overflow-y-auto">
              <div>
                <label className="text-[9px] font-bold text-zinc-500 uppercase">Model</label>
                <select
                  value={config.model}
                  onChange={e => {
                    const model = AVAILABLE_MODELS.find(m => m.id === e.target.value);
                    setConfig(prev => ({ ...prev, model: e.target.value, apiUrl: model?.apiUrl || prev.apiUrl }));
                  }}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-white outline-none focus:border-blue-500"
                >
                  {AVAILABLE_MODELS.map(m => (
                    <option key={m.id} value={m.id}>{m.label} ({m.provider})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[9px] font-bold text-zinc-500 uppercase">API Key</label>
                <input
                  type="password"
                  value={config.apiKey}
                  onChange={e => setConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                  placeholder={selectedModel?.provider === 'Anthropic' ? 'sk-ant-...' : 'sk-...'}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-white outline-none focus:border-blue-500 font-mono"
                />
              </div>
              <div>
                <label className="text-[9px] font-bold text-zinc-500 uppercase">Custom Instructions (optional)</label>
                <textarea
                  value={config.customInstructions}
                  onChange={e => setConfig(prev => ({ ...prev, customInstructions: e.target.value }))}
                  placeholder="e.g., Focus on crypto markets..."
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-white outline-none focus:border-blue-500 resize-none"
                />
              </div>
              <div className="text-[8px] text-zinc-600">
                🔒 API key is stored locally in your browser. Never sent to our servers.
              </div>
              <div className="text-[8px] text-zinc-500">
                <strong className="text-zinc-400">Permissions:</strong> READ all data · CREATE alerts · ENABLE/DISABLE agent · UPDATE rules · ❌ EXECUTE trades
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <div className="text-3xl mb-3">🤖</div>
                <div className="text-xs font-bold text-white mb-1">Niche Trust AI Agent</div>
                <div className="text-[10px] text-zinc-500 max-w-[280px] mx-auto">
                  I can analyze traders, find opportunities, read leaderboard data, and help you make better trading decisions.
                </div>
                <div className="mt-4 space-y-1">
                  {['Find top 5 traders by PMI score', 'Analyze whale activity today', 'Show me crypto opportunities', 'What are the hottest markets?'].map(q => (
                    <button
                      key={q}
                      onClick={() => { setInput(q); }}
                      className="block w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-[10px] text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors text-left"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : msg.content.startsWith('❌')
                    ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                    : 'bg-zinc-800 text-zinc-200'
                }`}>
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                  {msg.toolCall && (
                    <div className="mt-2 rounded-lg bg-zinc-900/50 p-2 text-[9px]">
                      <div className="font-bold text-blue-400">🔧 {msg.toolCall.name}</div>
                      {msg.toolCall.result && (
                        <pre className="mt-1 max-h-[100px] overflow-y-auto text-zinc-400 whitespace-pre-wrap">{msg.toolCall.result.slice(0, 500)}</pre>
                      )}
                    </div>
                  )}
                  <div className="mt-1 text-[8px] opacity-50">{new Date(msg.timestamp).toLocaleTimeString()}</div>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="rounded-xl bg-zinc-800 px-3 py-2 text-xs text-zinc-400">
                  <span className="inline-flex gap-1">
                    <span className="animate-bounce">●</span>
                    <span className="animate-bounce" style={{ animationDelay: '0.1s' }}>●</span>
                    <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>●</span>
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Error */}
          {error && (
            <div className="mx-4 mb-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-[10px] text-red-400">
              {error}
            </div>
          )}

          {/* Input */}
          <div className="border-t border-zinc-800 p-3">
            <div className="flex gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder={config.apiKey ? "Ask anything about markets, traders, opportunities..." : "Enter API key first..."}
                disabled={loading || !config.apiKey}
                rows={1}
                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-white outline-none focus:border-blue-500 resize-none disabled:opacity-50"
              />
              <button
                onClick={sendMessage}
                disabled={loading || !input.trim() || !config.apiKey}
                className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? '...' : 'Send'}
              </button>
            </div>
            <div className="mt-1 text-[8px] text-zinc-600 text-center">
              Agent can READ all data · CREATE alerts · MANAGE agent · ❌ CANNOT execute trades
            </div>
          </div>
        </div>
      )}
    </>
  );
}
