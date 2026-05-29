# Master Consolidation Blueprint

هذا الملف هو خريطة التحكم للنسخة النظيفة من منصة Niche Trust Platform.

## الهدف

تحويل المشروع من كود متراكم من عدة وكلاء إلى مستودع إنتاجي واضح، قابل للفحص، وقابل للتطوير بدون كسر الأقسام الموجودة.

## قرار معماري حالي

المشروع سيظل الآن Next.js واحدًا بدل تقسيمه فورًا إلى Monorepo، لأن:

- النشر الحالي على Vercel.
- الـ API routes موجودة داخل `src/app/api`.
- Prisma وNextAuth والواجهة متشابكين بالفعل.
- التقسيم إلى Express منفصل قبل تثبيت الأساس سيزيد المخاطر.

عندما يكبر المشروع لاحقًا، يمكن نقله إلى:

```text
apps/web
apps/api
packages/shared
packages/ui
packages/config
```

لكن المرحلة الحالية الأفضل فيها هي تنظيف الحدود داخل نفس الريبو.

## الأقسام الأساسية

### 1. واجهة الأسواق الحية

المسارات:

```text
src/app/page.tsx
src/app/market/[id]/page.tsx
src/app/api/markets/live/route.ts
src/app/api/markets/trades/route.ts
src/components/marketplace/*
src/lib/polymarket/*
src/lib/kalshi/*
src/lib/manifold/*
```

المطلوب إنتاجيًا:

- عرض كل الأسواق الحية من Polymarket/Kalshi/Manifold.
- صفحة داخلية لكل توقع بنفس منطق DexScreener.
- ربط الصفقات بالـ market الحالي، وليس global feed.
- إضافة analytics تحت الشارت.

تم في هذه النسخة:

- إصلاح خطأ `noP` الذي كان يكسر TypeScript.
- جعل صفحة `/market/[id]` تطلب trades بناءً على `marketId`.
- جعل `/api/markets/trades` يحل `conditionId` من Polymarket عند توفر `marketId`.
- إضافة:
  - Top Holders Flow
  - Liquidity Size Split
  - Live Line Profile
- إضافة `row-flash-buy` و`row-flash-sell` بزمن 400ms.

ملاحظة مهمة:

Top Holders الحالي مبني على تدفق الصفقات المتاحة من API، وليس ownership snapshot حقيقي من عقد السوق. للحصول على ownership حقيقي نحتاج مصدر بيانات CLOB/positions موثوق لكل market.

### 2. Leaderboard المضاربين

المسارات:

```text
src/app/leaderboard/*
src/app/api/leaderboard/*
src/lib/polymarket/leaderboard.ts
src/lib/intelligence/*
src/lib/analytics/*
prisma/schema.prisma
```

النظام الحالي:

- جدول `PolymarketTrader`.
- حساب `trustScore`.
- حساب `edgeScore`.
- فلاتر category/search/sort.
- دعم pagination.

المطلوب لاحقًا:

- إدخال Kalshi وManifold في نفس leaderboard بدل Polymarket فقط.
- توحيد trader identity بين المحافظ والمنصات.
- إضافة badges نهائية حسب الحجم، المخاطرة، الثبات، وعدد الصفقات.

### 3. الجروبات والخصوصية والاشتراكات

المسارات:

```text
src/app/groups/*
src/app/api/groups/*
src/lib/groups/service.ts
src/lib/subscriptions/manager.ts
src/lib/payments/*
src/lib/matrix/*
src/components/group-hub.tsx
src/components/group-comments.tsx
src/components/subscribe-group-form.tsx
```

النظام الحالي:

- جروبات عامة وخاصة.
- اشتراكات.
- تعليقات.
- Matrix rooms اختيارية.
- توقعات يتم حفظ hash لها على Solana Memo.

المخاطر التي يجب قفلها قبل الإنتاج:

- التأكد أن كل endpoint مدفوع يتحقق من الاشتراك قبل عرض أي payload.
- التأكد أن الرسائل المشفرة لا يتم تخزين plaintext لها في قاعدة البيانات.
- التأكد من أن مفاتيح Matrix/Admin ليست ظاهرة في الواجهة.
- مراجعة payment verification بالكامل قبل قبول أموال حقيقية.

### 4. البوتات والـ Agent API

المسارات:

```text
src/app/bots/page.tsx
src/app/api/bots/route.ts
src/app/api/agent/*
src/components/create-bot-form.tsx
src/components/agent-keys-manager.tsx
public/learn/examples/*
```

النظام الحالي:

- Marketplace بسيط للبوتات.
- Agent keys.
- Feed endpoint للوكيل.
- ملفات أمثلة لـ MCP/skills.

المطلوب لاحقًا:

- pricing واضح: free/sell/rent/course.
- permissions لكل bot.
- API key scopes.
- صفحة developer onboarding سهلة جدًا للعميل غير التقني.

### 5. Admin/Operations

المسارات:

```text
src/app/admin/*
src/app/api/admin/*
src/app/api/cron/*
scripts/worker.ts
src/lib/queue/*
```

النظام الحالي:

- admin dashboard.
- cron endpoints.
- wallet sync worker.
- Redis/BullMQ support.

المطلوب لاحقًا:

- Audit log لكل admin action.
- فصل cron secrets عن أي `NEXT_PUBLIC_*`.
- Health checks مفصلة للـ API والـ DB والـ Matrix والـ Redis.

### 6. Docs/Learn

المسارات:

```text
src/app/learn/*
src/components/learn/*
src/lib/learn/*
public/learn/examples/*
```

النظام الحالي:

- Docs shell.
- API catalog.
- أمثلة agent وMCP.

المطلوب لاحقًا:

- شرح كامل لكل قسم.
- شرح استخدام المنصة للمشتري، الخبير، الأدمن، والمطور.
- توثيق API وMCP وskills.
- صفحات ثقة: security model، on-chain proof، privacy model.

## معيار التصميم

تم تثبيت أساس DexScreener-style:

```text
Background: #090d11
Cards:      #131722
Numbers:    JetBrains Mono / tabular nums fallback
Rows:       row-flash-buy / row-flash-sell 400ms
```

## حالة الفحص الحالية

الأوامر التي نجحت:

```powershell
.\node_modules\.bin\tsc.CMD --noEmit --pretty false
.\node_modules\.bin\eslint.CMD
.\node_modules\.bin\vitest.CMD run
.\node_modules\.bin\next.CMD build
```

النتيجة:

```text
TypeScript: passed
ESLint: passed with warnings only
Vitest: 22 passed
Next build: passed
HTTP smoke: /, /api/markets/live, /api/markets/trades returned 200
Playwright smoke: homepage and /market/[id] rendered, market analytics visible
```

## الأولويات القادمة

1. إزالة تحذيرات unused variables والصور.
2. تشغيل `next build` بعد تثبيت سياسة pnpm build approvals.
3. استبدال simulated Kalshi/Manifold data بتكاملات حقيقية.
4. إضافة ownership/positions API حقيقي لـ Top Holders.
5. مراجعة أمنية كاملة للجروبات والاشتراكات وAgent API.
6. توسيع docs لتكون جاهزة للعميل النهائي.
