export interface PlatformSection {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: string;
  features: string[];
}

export const PLATFORM_SECTIONS: PlatformSection[] = [
  {
    id: 'leaderboard',
    title: 'البورد - ترتيب المتداولين',
    description: 'توقعات المتداولين على Polymarket مع تقييم Trust Score و Edge Score',
    href: '/leaderboard',
    icon: '📊',
    features: [
      'Edge Score: 40% ROI + 25% Consistency + 15% Risk + 10% Timing + 10% Volume',
      'ترتيب المتداولين حسب الأداء',
      'فلترة حسب الفئات (Crypto, Sports, Politics, ...)',
      'بحث حساس للمحفظة والاسم',
    ],
  },
  {
    id: 'groups',
    title: 'الجروبات - مجموعات الخبراء',
    description: 'مجموعات مدفوعة للبيع والاستشارات مع دردشة مشفرة',
    href: '/groups',
    icon: '🔒',
    features: [
      'جروبات خاصة مدفوعة (اشتراكات شهرية/سنوية/مرة واحدة)',
      'دردشة Matrix مشفرة من نهاية إلى نهاية',
      'توقعات خاصة للمشتركين',
      'نظام تقييم المشتركين فقط',
    ],
  },
  {
    id: 'marketplace',
    title: 'الماركت بلايس - السوق',
    description: 'سوق البوتات والتطبيقات والتقييمات',
    href: '/bots',
    icon: '🏪',
    features: [
      'بوتات الخبراء (تداول، تنبيهات، أدوات كوانت)',
      'تطبيقات التليجرام',
      'Evaluations للمنصات crypto',
      'نموذج الاشتراك أسطواني أو مرة واحدة',
    ],
  },
  {
    id: 'technology',
    title: 'التكنولوجيا والتعليم',
    description: 'وثائق API وتكامل الوكلاء',
    href: '/learn',
    icon: '⚙️',
    features: [
      'Agent API مع Bearer token',
      'وثائق MCP وSkills',
      'خطوات سحب الـ API',
      'استخدام الوكيل مع المجموعات',
    ],
  },
  {
    id: 'platforms',
    title: 'المنصات الخارجية',
    description: 'Polymarket, Kalshi, Manifold, Jupiter',
    href: '/platforms',
    icon: '🌐',
    features: [
      'Polymarket - أسواق التوقعات الفعلية',
      'Kalshi - عقود الأحداث المنضبطة',
      'Manifold - أسواق اللعب',
      'Jupiter - تبادل العملات (قريباً)',
    ],
  },
];