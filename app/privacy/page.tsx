export const metadata = { title: '隐私政策 · 紫微命盘', description: '紫微命盘隐私政策' };

export default function PrivacyPage() {
  return (
    <>
      <header style={{ position: 'sticky', top: 0, zIndex: 50, background: 'var(--bg-0)', borderBottom: '1px solid var(--bdr)', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <a href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--tx-3)', textDecoration: 'none' }}>
          <span style={{ fontSize: '16px' }}>‹</span>
          <span>返回首页</span>
        </a>
        <div style={{ width: '1px', height: '20px', background: 'var(--bdr-med)' }} />
        <span style={{ fontSize: '12px', color: 'var(--ac)', letterSpacing: '0.2em' }}>紫微命盘</span>
      </header>
      <main style={{ maxWidth: 800, margin: '0 auto', padding: '60px 24px 80px', color: 'var(--tx-1)', lineHeight: 1.8 }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, marginBottom: 8 }}>隐私政策</h1>
        <p style={{ fontSize: 12, color: 'var(--tx-3)', marginBottom: 32 }}>最后更新：2026年11月</p>

      <h2 style={{ fontSize: 18, marginTop: 32, marginBottom: 12 }}>1. 排盘与分享</h2>
      <p>免费排盘在浏览器内计算。你主动创建的分享链接包含排盘所需的出生资料，取得链接的人可以打开命盘。请只向你愿意分享的人发送链接。</p>

      <h2 style={{ fontSize: 18, marginTop: 32, marginBottom: 12 }}>2. 登录、订单与报告</h2>
      <p>网站使用 Google 账号标识和已验证邮箱管理登录。你主动保存出生资料时，网站会把姓名或称呼、所选历法、日期、时间、性别和选填地点存到账号下，方便在不同设备排盘。登录后可在排盘表单更新或删除已保存的资料。</p>
      <p>购买报告时，我们保存订单、校正后的出生日期和时辰、性别、报告和追问，以确认付款、交付报告并支持回看。结账草稿在当前标签页内可恢复 15 分钟，仅含校正后的出生日期、时辰与性别。完成下单、退出登录或再次读取已过期草稿时，网站会清除暂存。</p>

      <h2 style={{ fontSize: 18, marginTop: 32, marginBottom: 12 }}>3. 第三方服务</h2>
      <p>Google 处理登录。Waffo Pancake 收银台处理新订单的付款及退款，本站保存支付状态与交易标识。主动生成详解或提交追问时，配置的自动解读服务商会处理生成所需的命盘信息和提问。</p>

      <h2 style={{ fontSize: 18, marginTop: 32, marginBottom: 12 }}>4. 账号与数据请求</h2>
      <p>登录后可以在「我的报告」查看订单和已购报告。{process.env.COMMERCE_SUPPORT_EMAIL && <>如需查询、更正或删除账号数据，请联系 <a href={'mailto:' + process.env.COMMERCE_SUPPORT_EMAIL}>{process.env.COMMERCE_SUPPORT_EMAIL}</a>。</>}</p>

      <h2 style={{ fontSize: 18, marginTop: 32, marginBottom: 12 }}>5. Cookie 与本地存储</h2>
      <p>站点使用 Cookie 维持登录会话，通过浏览器本地存储记住所选主题。</p>

      <h2 style={{ fontSize: 18, marginTop: 32, marginBottom: 12 }}>6. 未成年人</h2>
      <p>本平台命理内容面向 18 岁以上成年用户。未成年人请在监护人同意下使用，并不得将解读用于重大人生决策。</p>

      <h2 style={{ fontSize: 18, marginTop: 32, marginBottom: 12 }}>7. 政策变更</h2>
      <p>本政策可能不定期更新。重大变更将以显著方式通知。继续使用即表示同意更新后的版本。</p>

        <p style={{ marginTop: 48, fontSize: 12, color: 'var(--tx-3)' }}>
          <a href="/terms" style={{ color: 'var(--ac)' }}>服务条款</a> · <a href="/" style={{ color: 'var(--ac)' }}>返回首页</a>
        </p>
      </main>
    </>
  );
}
