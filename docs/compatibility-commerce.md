# 紫微合盘报告购买

## 本地验收

1. 准备独立 PostgreSQL 数据库，在 `.env.local` 设置 `DATABASE_URL` 和 `COMMERCE_LOCAL_TEST=1`。
2. 执行 `node scripts/migrate-commerce.mjs`，然后以 `npm run dev` 启动。
3. 在 `http://127.0.0.1:3000/chart?mode=compatibility` 生成免费结果，打开报告预览，选择购买。登录本地测试账号，检查双盘资料、创建订单、模拟付款、生成四章报告和提交两次追问。
4. 刷新报告页，在 `/account/reports` 找到保存的订单。在新的浏览器上下文前往 `/ops/orders`，登录本地运营账号，按订单号查单、重试交付或模拟全额退款。

本地默认用该对命盘的计算事实交付测试正文。配置模型并设置 `COMMERCE_LOCAL_USE_MODEL=1` 可以测试正式报告与追问的生成，仍使用本地模拟付款。旧版仅预览弹窗内的模拟解锁在未启用购买链路时仍可用。

更新已有环境时重新执行 `node scripts/migrate-commerce.mjs`，创建 `birth_profiles` 表并添加 Waffo 订单字段。出生资料使用同一套登录配置。登录后可在紫微单盘、合盘双方和八字表单第一行保存、选择、更新或删除资料。

上线前核对托管 PostgreSQL 的连接 TLS、磁盘和备份加密与访问权限，确保 CDN 保留 `/api/birth-profiles` 的 `Cache-Control: private, no-store`，并关闭对该接口的请求和响应正文采集。旧版命盘分享链接使用查询参数。如果旧版已部署过，另行检查历史访问日志和统计数据的保留情况。

## 支付沙盒与上线

- 为预发布环境创建 PostgreSQL 数据库并运行迁移。配置真实 HTTPS 站点地址 `NEXT_PUBLIC_SITE_URL`、Google OAuth 客户端和 `COMMERCE_SUPPORT_EMAIL`，再启用 `COMMERCE_ENABLED=1`。
- 如果部署平台在启动时注入环境变量，将 `COMMERCE_SITE_URL` 设为相同的 HTTPS 地址，以便服务端校验来源并生成回调。
- Google 回调地址为 `<站点地址>/api/commerce/google-callback`，使用 Web OAuth 客户端。配置 `COMMERCE_ADMIN_EMAILS` 为逗号分隔的运营邮箱。
- 在 Waffo Pancake 的测试商店创建一个一次性商品。设置 `WAFFO_ENVIRONMENT=test`、`WAFFO_MERCHANT_ID`、`WAFFO_PRIVATE_KEY`、`WAFFO_STORE_ID`、`WAFFO_PRODUCT_ID` 和测试环境的 `WAFFO_WEBHOOK_PUBLIC_KEY`。密钥只配置在服务端。代码为收银台锁定 US$6.99 含税，税务分类默认 `digital_goods`，可按商户商品分类设置 `WAFFO_TAX_CATEGORY`。 [Waffo 一次性商品](https://docs.waffo.ai/guides/one-time-payments)
- 在商店 Webhooks 中把 HTTPS 回调设为 `<站点地址>/api/commerce/waffo-webhook`，订阅 `order.completed`、`refund.succeeded` 和 `refund.failed`。测试环境和正式环境使用各自的 Waffo 凭据、回调公钥和数据库。 [Waffo Webhook 文档](https://docs.waffo.ai/api-reference/webhooks)
- 沙盒验收付款后关闭页面、重复回调、过期订单、生成失败后重试、退款后收回报告权限及跨账号访问隔离。报告正文由模型生成，需要按真实双盘样本确认质量。部署平台需允许报告接口的生成时限。
- 付费合盘默认按服务端排盘事实生成。确认语料获准商用后，可在预发布配置 `ZIWEI_DATASET_DIR`、`ZIWEI_DATASET_INDEX` 和 `COMMERCE_HEMING_DATASET=1`。合盘会分别查询甲乙的感情、性格和福德，复核命盘键和命宫主星。语料缺失或不匹配时仍可按引擎事实生成。先比较启用前后同一批合成双盘的报告。
- 商店通过 Waffo 正式收款审核并完成沙盒测试后，将 `WAFFO_ENVIRONMENT` 改为 `prod`，使用正式凭据，设置 `COMMERCE_LIVE_PAYMENTS=1`。一份报告含两次追问。已有 Stripe 订单可继续回看。有旧渠道结算或退款需要时，保留原环境的 `STRIPE_SECRET_KEY` 与 `STRIPE_WEBHOOK_SECRET` 供旧订单核对。 [Waffo 商户审核](https://docs.waffo.ai/mor/account-reviews)

付款确认会持久化。用户从订单页发起生成，失败后可重试或由运营补交付。运营操作会记录操作者和时间。客户从订单页给支持邮箱发送订单号，以申请协助或退款。
