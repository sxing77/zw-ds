# 紫微命盘（zw-ds）

基于 Next.js 16 + TypeScript 构建的紫微斗数在线排盘、双人合盘、古籍原典检索与深度命盘报告平台（东方刊本视觉体系）。

## 核心功能

- **紫微斗数排盘（`/`、`/chart`）**：支持公历/农历互转、全国 2724 区县及海外华人城市经度真太阳时校时、1986–1991 历史夏令时自动提示、大限/流年切换与三方四正联动；支持免登录本机生辰档案快速选用及云端账号同步。
- **书卷式命书批注与付费详批**：排盘下方全宽双栏书卷阅读区，未解锁提供主星试读（服务端强制截断 + IP 限流），支持解锁「紫微命盘详批全书」四章深度报告与专属追问。
- **双人合盘（`/heming` → `/chart?mode=compatibility`）**：双向对照双方命盘、夫妻宫与命宫主星/借星、生年四化落宫，并支持按份购买完整合盘报告。
- **古籍原典库与星曜录（`/library`、`/knowledge`）**：收录《紫微斗数全集》《紫微斗数全书》《骨髓赋》全文检索，以及十四主星 × 十二宫位静态 SEO 落地页。
- **账号与支付体系（`/login`、`/checkout/*`、`/account/reports`）**：支持邮箱密码注册/登录（Node 原生 `scrypt` 加盐哈希）与 Google OAuth、`HttpOnly` Cookie 会话、按 `user_id` 隔离的订单与报告持久化，接入 Waffo 收银台与 Webhook 对账。

---

## 本地开发

```bash
npm install
npm run dev
```

访问 `http://localhost:3000`。常用校验命令：

```bash
npm run typecheck   # TypeScript 类型检查
npm test            # 运行全部 11 项排盘与合盘回归测试
npm run build       # Next.js 生产构建校验
npm run db:migrate  # 执行 migrations/001~005 数据库迁移（需先配置 DATABASE_URL）
```

---

## 环境变量配置

参考 `.env.example`，线上部署核心变量如下：

### 1. 模型与试读控制
```env
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=...
NEXT_PUBLIC_SITE_URL=https://你的域名
# 默认生产环境关闭免费流式试读；如需开启线上主星试读（服务端强制仅输出前两节 + IP 限流）可设为 1
INTERPRET_PREVIEW_ENABLED=1
```

### 2. 数据库与账号登录
```env
DATABASE_URL=postgresql://...
COMMERCE_ENABLED=1
COMMERCE_SITE_URL=https://你的域名
COMMERCE_SUPPORT_EMAIL=support@你的域名
# 可选：Google 登录
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
# 仅本地开发测试登录/下单时开启
# COMMERCE_LOCAL_TEST=1
```

### 3. Waffo 收款（单盘与合盘）
```env
WAFFO_MERCHANT_ID=...
WAFFO_PRIVATE_KEY=...
WAFFO_WEBHOOK_PUBLIC_KEY=...
WAFFO_STORE_ID=STO_...
WAFFO_PRODUCT_ID=PROD_...
# 可选：紫微单盘独立商品 ID（不填则复用 WAFFO_PRODUCT_ID）
WAFFO_ZIWEI_PRODUCT_ID=PROD_...
WAFFO_ENVIRONMENT=prod
COMMERCE_LIVE_PAYMENTS=1
```

### 4. Cloudflare R2 压缩语料库（推荐私有桶）
使用 `npx tsx scripts/pack-dataset-r2.ts --all` 将原始语料按块 Brotli 压缩（77 年约 4.83 GB，可落入 R2 10GB 免费档），上传至 R2 私有桶后配置：

```env
ZIWEI_DATASET_R2_URL=https://<AccountID>.r2.cloudflarestorage.com/<BucketName>
ZIWEI_DATASET_R2_ACCESS_KEY_ID=...
ZIWEI_DATASET_R2_SECRET_ACCESS_KEY=...
```

---

## 开源与数据来源致谢

本项目部分紫微斗数排盘引擎与参考数据集基于上游开源项目 [Renhuai123/ziwei-doushu](https://github.com/Renhuai123/ziwei-doushu)（代码 MIT License，数据集 CC BY 4.0），古籍原文属公有领域。
