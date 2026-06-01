/**
 * Bot Marketplace — Professional Trading Bots
 * 
 * Pre-built bots that users can install and configure:
 * 1. Copy Trading Bot — Copy top traders automatically
 * 2. Whale Alert Bot — Get notified of large trades
 * 3. Alpha Hunter Bot — Find high-alpha opportunities
 * 4. Risk Manager Bot — Auto stop-loss and position sizing
 * 5. Signal Aggregator Bot — Combine signals from multiple experts
 */

export interface BotDefinition {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  icon: string;
  category: 'copy_trading' | 'alerts' | 'analysis' | 'risk_management' | 'signals';
  price: number; // 0 = free
  features: string[];
  featuresAr: string[];
  configSchema: BotConfigField[];
  defaultConfig: Record<string, any>;
}

interface BotConfigField {
  key: string;
  label: string;
  labelAr: string;
  type: 'number' | 'select' | 'boolean' | 'text' | 'wallet';
  default: any;
  options?: { value: string; label: string; labelAr: string }[];
  min?: number;
  max?: number;
  description?: string;
  descriptionAr?: string;
}

export const BOT_MARKETPLACE: BotDefinition[] = [
  {
    id: 'copy_trading_pro',
    name: 'Copy Trading Pro',
    nameAr: 'نسخ التداول الاحترافي',
    description: 'Automatically copy trades from top PMI traders with customizable risk settings',
    descriptionAr: 'انسخ صفقات أقوى المتداولين تلقائياً مع إعدادات مخاطر قابلة للتخصيص',
    icon: '🔄',
    category: 'copy_trading',
    price: 29,
    features: [
      'Auto-copy from top 50 PMI traders',
      'Customizable risk multiplier',
      'Max exposure per trade',
      'Stop-loss protection',
      'Daily PnL reports via Telegram',
    ],
    featuresAr: [
      'نسخ تلقائي من أقوى 50 متداول PMI',
      'مضاعف مخاطر قابل للتخصيص',
      'حد أقصى لكل صفقة',
      'حماية وقف الخسارة',
      'تقارب PnL يومية عبر تليجرام',
    ],
    configSchema: [
      {
        key: 'minPMI',
        label: 'Minimum PMI Score',
        labelAr: 'أقل درجة PMI',
        type: 'number',
        default: 70,
        min: 0,
        max: 100,
        description: 'Only copy traders with PMI above this',
        descriptionAr: 'انسخ فقط المتداولين اللي PMI أعلى من كده',
      },
      {
        key: 'riskMultiplier',
        label: 'Risk Multiplier',
        labelAr: 'مضاعف المخاطر',
        type: 'select',
        default: '0.5',
        options: [
          { value: '0.25', label: 'Conservative (0.25x)', labelAr: 'محافظ (0.25x)' },
          { value: '0.5', label: 'Moderate (0.5x)', labelAr: 'متوسط (0.5x)' },
          { value: '1.0', label: 'Full (1.0x)', labelAr: 'كامل (1.0x)' },
          { value: '2.0', label: 'Aggressive (2.0x)', labelAr: 'جريء (2.0x)' },
        ],
      },
      {
        key: 'maxPerTrade',
        label: 'Max Per Trade ($)',
        labelAr: 'حد أقصى لكل صفقة ($)',
        type: 'number',
        default: 500,
        min: 10,
        max: 10000,
      },
      {
        key: 'stopLoss',
        label: 'Stop Loss (%)',
        labelAr: 'وقف الخسارة (%)',
        type: 'number',
        default: 20,
        min: 5,
        max: 50,
      },
      {
        key: 'categories',
        label: 'Categories',
        labelAr: 'الفئات',
        type: 'select',
        default: 'all',
        options: [
          { value: 'all', label: 'All Categories', labelAr: 'كل الفئات' },
          { value: 'politics', label: 'Politics', labelAr: 'سياسة' },
          { value: 'crypto', label: 'Crypto', labelAr: 'كريبتو' },
          { value: 'sports', label: 'Sports', labelAr: 'رياضة' },
          { value: 'economics', label: 'Economics', labelAr: 'اقتصاد' },
        ],
      },
    ],
    defaultConfig: {
      minPMI: 70,
      riskMultiplier: '0.5',
      maxPerTrade: 500,
      stopLoss: 20,
      categories: 'all',
    },
  },
  {
    id: 'whale_tracker',
    name: 'Whale Tracker',
    nameAr: 'متتبع الحيتان',
    description: 'Get instant notifications when large trades are detected on Polymarket',
    descriptionAr: 'احصل على تنبيهات فورية لما تحصل صفقات كبيرة على Polymarket',
    icon: '🐋',
    category: 'alerts',
    price: 0,
    features: [
      'Real-time whale trade detection',
      'Customizable size threshold',
      'Telegram + in-app notifications',
      'Whale wallet tracking',
      'Daily whale activity summary',
    ],
    featuresAr: [
      'كشف صفقات الحيتان في الوقت الحقيقي',
      'حد حجم قابل للتخصيص',
      'تنبيهات تليجرام + داخل التطبيق',
      'تتبع محافظ الحيتان',
      'ملخص نشاط الحيتان اليومي',
    ],
    configSchema: [
      {
        key: 'minSize',
        label: 'Minimum Trade Size ($)',
        labelAr: 'أقل حجم صفقة ($)',
        type: 'number',
        default: 10000,
        min: 1000,
        max: 100000,
      },
      {
        key: 'notifyTelegram',
        label: 'Telegram Notifications',
        labelAr: 'تنبيهات تليجرام',
        type: 'boolean',
        default: true,
      },
      {
        key: 'trackWallets',
        label: 'Tracked Wallets (one per line)',
        labelAr: 'المحافظ المتتبعة (واحد لكل سطر)',
        type: 'text',
        default: '',
        description: 'Specific wallets to track',
        descriptionAr: 'محافظ معينة تتابعها',
      },
    ],
    defaultConfig: {
      minSize: 10000,
      notifyTelegram: true,
      trackWallets: '',
    },
  },
  {
    id: 'alpha_hunter',
    name: 'Alpha Hunter',
    nameAr: 'صياد الألفا',
    description: 'Find high-alpha opportunities before the market moves',
    descriptionAr: 'لاقي فرص الألفا العالية قبل ما السوق يتحرك',
    icon: '🎯',
    category: 'analysis',
    price: 19,
    features: [
      'Scans all markets for alpha opportunities',
      'Detects early smart money entries',
      'Probability change alerts',
      'Sector-specific analysis',
      'Daily top 5 opportunities report',
    ],
    featuresAr: [
      'بيسكان كل الأسواق عشان يلاقي فرص ألفا',
      'يكشف دخول الأموال الذكية المبكرة',
      'تنبيهات تغير الاحتمالات',
      'تحليل حسب القطاع',
      'تقرير يومي لأقوى 5 فرص',
    ],
    configSchema: [
      {
        key: 'minAlpha',
        label: 'Minimum Alpha Score',
        labelAr: 'أقل درجة ألفا',
        type: 'number',
        default: 60,
        min: 0,
        max: 100,
      },
      {
        key: 'minVolume',
        label: 'Minimum Volume ($)',
        labelAr: 'أقل حجم تداول ($)',
        type: 'number',
        default: 50000,
        min: 1000,
        max: 1000000,
      },
      {
        key: 'categories',
        label: 'Categories',
        labelAr: 'الفئات',
        type: 'select',
        default: 'all',
        options: [
          { value: 'all', label: 'All', labelAr: 'الكل' },
          { value: 'politics', label: 'Politics', labelAr: 'سياسة' },
          { value: 'crypto', label: 'Crypto', labelAr: 'كريبتو' },
          { value: 'sports', label: 'Sports', labelAr: 'رياضة' },
          { value: 'economics', label: 'Economics', labelAr: 'اقتصاد' },
        ],
      },
    ],
    defaultConfig: {
      minAlpha: 60,
      minVolume: 50000,
      categories: 'all',
    },
  },
  {
    id: 'risk_manager',
    name: 'Risk Manager',
    nameAr: 'مدير المخاطر',
    description: 'Automated risk management — stop-loss, position sizing, exposure limits',
    descriptionAr: 'إدارة مخاطر آلية — وقف خسارة، تحديد حجم المراكز، حدود التعرض',
    icon: '🛡️',
    category: 'risk_management',
    price: 15,
    features: [
      'Auto stop-loss on all positions',
      'Max daily loss limit',
      'Position sizing based on Kelly criterion',
      'Exposure concentration alerts',
      'Weekly risk report',
    ],
    featuresAr: [
      'وقف خسارة تلقائي لكل المراكز',
      'حد أقصى خسارة يومية',
      'تحديد حجم المركز بناءً على Kelly criterion',
      'تنبيهات تركيز التعرض',
      'تقرير مخاطر أسبوعي',
    ],
    configSchema: [
      {
        key: 'maxDailyLoss',
        label: 'Max Daily Loss ($)',
        labelAr: 'أقصى خسارة يومية ($)',
        type: 'number',
        default: 1000,
        min: 100,
        max: 50000,
      },
      {
        key: 'stopLossPercent',
        label: 'Stop Loss (%)',
        labelAr: 'وقف الخسارة (%)',
        type: 'number',
        default: 15,
        min: 5,
        max: 50,
      },
      {
        key: 'maxExposure',
        label: 'Max Single Exposure ($)',
        labelAr: 'أقصى تعرض لصفقة واحدة ($)',
        type: 'number',
        default: 2000,
        min: 100,
        max: 100000,
      },
      {
        key: 'kellyFraction',
        label: 'Kelly Fraction',
        labelAr: 'كسر Kelly',
        type: 'select',
        default: '0.5',
        options: [
          { value: '0.25', label: 'Quarter Kelly (0.25)', labelAr: 'ربع Kelly (0.25)' },
          { value: '0.5', label: 'Half Kelly (0.5)', labelAr: 'نصف Kelly (0.5)' },
          { value: '1.0', label: 'Full Kelly (1.0)', labelAr: 'Kelly كامل (1.0)' },
        ],
      },
    ],
    defaultConfig: {
      maxDailyLoss: 1000,
      stopLossPercent: 15,
      maxExposure: 2000,
      kellyFraction: '0.5',
    },
  },
  {
    id: 'signal_aggregator',
    name: 'Signal Aggregator',
    nameAr: 'مجمع الإشارات',
    description: 'Combine signals from multiple experts and get consensus-based recommendations',
    descriptionAr: 'اجمع إشارات الخبراء واخد توصيات بناءً على الإجماع',
    icon: '📡',
    category: 'signals',
    price: 25,
    features: [
      'Aggregates signals from top 100 experts',
      'Consensus scoring (bullish/bearish)',
      'Conflict detection between experts',
      'Weighted by PMI and Alpha scores',
      'Daily consensus report',
    ],
    featuresAr: [
      'بيجمع إشارات أقوى 100 خبير',
      'تسجيل الإجماع (صعودي/هبوطي)',
      'كشف التعارض بين الخبراء',
      'مرجح بالـ PMI والـ Alpha',
      'تقرير إجماع يومي',
    ],
    configSchema: [
      {
        key: 'minExperts',
        label: 'Minimum Experts for Consensus',
        labelAr: 'أقل عدد خبراء للإجماع',
        type: 'number',
        default: 3,
        min: 1,
        max: 20,
      },
      {
        key: 'minPMI',
        label: 'Minimum Expert PMI',
        labelAr: 'أقل PMI للخبير',
        type: 'number',
        default: 65,
        min: 0,
        max: 100,
      },
      {
        key: 'consensusThreshold',
        label: 'Consensus Threshold (%)',
        labelAr: 'حد الإجماع (%)',
        type: 'number',
        default: 70,
        min: 50,
        max: 95,
      },
    ],
    defaultConfig: {
      minExperts: 3,
      minPMI: 65,
      consensusThreshold: 70,
    },
  },
];

// ── Bot Instance (user-installed bot) ────────────────────────
export interface BotInstance {
  id: string;
  botId: string;
  userId: string;
  config: Record<string, any>;
  isActive: boolean;
  installedAt: number;
  lastRun?: number;
  stats: {
    totalAlerts: number;
    totalTrades: number;
    totalPnl: number;
    successRate: number;
  };
}

// ── Get bots by category ─────────────────────────────────────
export function getBotsByCategory(category: string): BotDefinition[] {
  if (category === 'all') return BOT_MARKETPLACE;
  return BOT_MARKETPLACE.filter(b => b.category === category);
}

export function getBotById(id: string): BotDefinition | undefined {
  return BOT_MARKETPLACE.find(b => b.id === id);
}

export const BOT_CATEGORIES = [
  { id: 'all', label: 'All Bots', labelAr: 'كل البوتات', icon: '🤖' },
  { id: 'copy_trading', label: 'Copy Trading', labelAr: 'نسخ التداول', icon: '🔄' },
  { id: 'alerts', label: 'Alerts', labelAr: 'التنبيهات', icon: '🔔' },
  { id: 'analysis', label: 'Analysis', labelAr: 'التحليل', icon: '📊' },
  { id: 'risk_management', label: 'Risk Management', labelAr: 'إدارة المخاطر', icon: '🛡️' },
  { id: 'signals', label: 'Signals', labelAr: 'الإشارات', icon: '📡' },
];
