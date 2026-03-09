/**
 * 电商龙虾 — 首次配置向导 v2.0
 * 用法：node setup.mjs
 *
 * 引导顺序（从业务到技术，由浅入深）：
 *   Step 1 → 业务模式（国内 / 跨境 / 两者）
 *   Step 2 → 销售渠道（依据 Step 1 过滤选项）
 *   Step 3 → 商品类型（影响文案/物流/SEO 策略）
 *   Step 4 → 优先解决什么（决定 Cron 启用顺序 + Dashboard 入口）
 *   Step 5 → 审批规则（哪些高风险操作需要人工确认 + Telegram 通知配置）
 *   Step 6 → 配置 API（仅配置 Step 2 选中的渠道）
 */

import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';
import { createServer } from 'http';
import { exec } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, 'config.json');
const CALLBACK_PORT = 3457;
const CALLBACK_PATH = '/callback';
const SHOPIFY_SCOPES = [
  'read_orders', 'write_orders',
  'read_products', 'write_products',
  'read_inventory', 'write_inventory',
  'read_customers',
  'read_price_rules', 'write_price_rules',
  'read_discounts', 'write_discounts'
].join(',');

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(r => rl.question(q, r));

function hr() { console.log('\n' + '─'.repeat(50) + '\n'); }
function openBrowser(url) {
  const cmd = process.platform === 'win32' ? `start "" "${url}"`
    : process.platform === 'darwin' ? `open "${url}"`
    : `xdg-open "${url}"`;
  exec(cmd);
}

// ─── 单选 ────────────────────────────────────────────────────

async function singleSelect(prompt, options) {
  console.log(prompt);
  options.forEach((o, i) => console.log(`  ${i + 1}. ${o.label}`));
  while (true) {
    const ans = (await ask('\n请输入编号：')).trim();
    const idx = parseInt(ans) - 1;
    if (idx >= 0 && idx < options.length) return options[idx];
    console.log('  ❌ 无效选项，请重新输入');
  }
}

// ─── 多选 ────────────────────────────────────────────────────

async function multiSelect(prompt, options, minSelect = 1) {
  console.log(prompt);
  options.forEach((o, i) => console.log(`  ${i + 1}. ${o.label}`));
  console.log('\n  多选用逗号分隔，如：1,3');
  while (true) {
    const ans = (await ask('请输入编号：')).trim();
    const indices = ans.split(',').map(s => parseInt(s.trim()) - 1);
    const valid = indices.filter(i => i >= 0 && i < options.length);
    const unique = [...new Set(valid)];
    if (unique.length >= minSelect) return unique.map(i => options[i]);
    console.log(`  ❌ 请至少选择 ${minSelect} 项`);
  }
}

// ─── Shopify OAuth ────────────────────────────────────────────

async function shopifyOAuth(clientId, clientSecret, shopDomain) {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost:${CALLBACK_PORT}`);
      if (url.pathname !== CALLBACK_PATH) { res.end('Not found'); return; }

      const code = url.searchParams.get('code');
      const shop = url.searchParams.get('shop');
      const state = url.searchParams.get('state');

      if (!code) { res.writeHead(400); res.end('Missing code'); return; }
      if (state !== 'ecomclaw-setup') { res.writeHead(400); res.end('Invalid state'); return; }

      try {
        const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code })
        });
        const tokenData = await tokenRes.json();
        if (!tokenData.access_token) throw new Error(JSON.stringify(tokenData));

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0f0f17;color:#fff">
          <div style="font-size:60px">🦞</div>
          <h2 style="color:#4ade80;margin:16px 0">授权成功！</h2>
          <p style="color:#888">可以关闭此页面了。</p>
        </body></html>`);
        server.close();
        resolve(tokenData.access_token);
      } catch (err) {
        res.writeHead(500); res.end(`Error: ${err.message}`);
        server.close();
        reject(err);
      }
    });

    server.listen(CALLBACK_PORT, () => {
      console.log(`\n  ✅ 本地回调服务器已启动（port ${CALLBACK_PORT}）`);
      const redirectUri = `http://localhost:${CALLBACK_PORT}${CALLBACK_PATH}`;
      const authUrl = `https://${shopDomain}/admin/oauth/authorize?client_id=${clientId}&scope=${SHOPIFY_SCOPES}&redirect_uri=${encodeURIComponent(redirectUri)}&state=ecomclaw-setup&grant_options[]=offline`;
      console.log('\n  🌐 正在打开浏览器完成授权...');
      console.log('  如未自动打开，请手动访问：');
      console.log(`  ${authUrl}\n`);
      openBrowser(authUrl);
    });

    server.on('error', reject);
    setTimeout(() => { server.close(); reject(new Error('授权超时（2分钟），请重试')); }, 120000);
  });
}

// ─── 主流程 ────────────────────────────────────────────────────

async function main() {
  console.log('\n🦞 电商龙虾 — 首次配置向导\n');
  console.log('  我会问你 6 个问题，帮你定制最适合的配置。');
  console.log('  整个过程约需 5 分钟。\n');

  // 已有 config 时询问是否重新配置
  if (existsSync(CONFIG_PATH)) {
    const ans = (await ask('⚠️  检测到已有 config.json，是否重新配置？(y/N) ')).trim();
    if (ans.toLowerCase() !== 'y') {
      console.log('\n跳过，验证现有配置...');
      rl.close();
      const { testConnection } = await import('./connectors/shopify.js');
      const result = await testConnection();
      console.log(result.ok ? `✅ 连接正常！店铺：${result.shop_name}` : `❌ 连接失败：${result.error}`);
      return;
    }
  }

  const config = {};

  // ════════════════════════════════════════════════════════
  // Step 1 — 业务模式
  // ════════════════════════════════════════════════════════
  hr();
  console.log('【Step 1 / 6】业务模式\n');

  const modeChoice = await singleSelect('您的主要业务方向是：', [
    { label: '国内电商     — 面向国内买家，人民币结算', value: 'domestic' },
    { label: '跨境出海     — 面向海外买家，外币结算', value: 'crossborder' },
    { label: '国内+跨境    — 两者都有', value: 'both' },
  ]);
  config.business = { mode: modeChoice.value };

  // ════════════════════════════════════════════════════════
  // Step 2 — 销售渠道（依业务模式过滤选项）
  // ════════════════════════════════════════════════════════
  hr();
  console.log('【Step 2 / 6】销售渠道\n');

  // 按业务模式展示不同渠道
  const allChannels = [
    { label: 'Shopify          — 独立站，支持国内+跨境', value: 'shopify', modes: ['domestic', 'crossborder', 'both'] },
    { label: 'WooCommerce      — WordPress 独立站', value: 'woocommerce', modes: ['domestic', 'crossborder', 'both'] },
    { label: '有赞             — 国内私域/微信小程序', value: 'youzan', modes: ['domestic', 'both'] },
  ].filter(c => c.modes.includes(config.business.mode));

  const channelChoices = await multiSelect(
    '您目前在哪些平台销售？（至少选 1 个）',
    allChannels
  );
  config.business.channels = channelChoices.map(c => c.value);

  // 记录主平台（第一个选的）
  config.business.primaryChannel = config.business.channels[0];

  // ════════════════════════════════════════════════════════
  // Step 3 — 商品类型
  // ════════════════════════════════════════════════════════
  hr();
  console.log('【Step 3 / 6】商品类型\n');
  console.log('  （影响文案风格、物流配置、SEO 关键词策略）\n');

  const categoryChoices = await multiSelect(
    '您主要卖什么类型的商品？（可多选）',
    [
      { label: '服装 / 鞋帽 / 配饰', value: 'fashion' },
      { label: '美妆 / 护肤 / 个护', value: 'beauty' },
      { label: '数码 / 家电 / 配件', value: 'electronics' },
      { label: '家居 / 家装 / 家纺', value: 'home' },
      { label: '食品 / 保健 / 营养品', value: 'food' },
      { label: '户外 / 运动 / 健身', value: 'sports' },
      { label: '母婴 / 玩具 / 儿童', value: 'baby' },
      { label: '其他', value: 'other' },
    ]
  );
  config.business.categories = categoryChoices.map(c => c.value);

  // ════════════════════════════════════════════════════════
  // Step 4 — 优先解决什么
  // ════════════════════════════════════════════════════════
  hr();
  console.log('【Step 4 / 6】优先目标\n');
  console.log('  （决定启动后 Dashboard 入口 + 哪些 Cron 优先激活）\n');

  const priorityChoice = await singleSelect(
    '您最想先解决的问题是：',
    [
      { label: '选品     — 找爆款、算利润、监控竞品', value: 'selection' },
      { label: '上新     — 快速上架、AI 写文案、SEO 优化', value: 'launch' },
      { label: '转化     — 促销定价、折扣码、商品页优化', value: 'conversion' },
      { label: '社区     — 评论分析、FAQ 沉淀、内容创意', value: 'community' },
      { label: '巡检     — 日报/周报/库存预警/订单追踪', value: 'ops' },
    ]
  );
  config.business.priority = priorityChoice.value;

  // ════════════════════════════════════════════════════════
  // Step 5 — 审批规则
  // ════════════════════════════════════════════════════════
  hr();
  console.log('【Step 5 / 6】审批规则\n');
  console.log('  高风险操作执行前，系统会发 Telegram 消息让您点按钮确认。\n');

  // 5a — 哪些操作需要审批
  const approvalChoices = await multiSelect(
    '以下操作，哪些需要人工审批？（可多选，直接回车选默认）\n  默认已勾选：1,2,3,7',
    [
      { label: '退款              🔴 高风险（推荐必选）', value: 'refund' },
      { label: '取消订单          🔴 高风险（推荐必选）', value: 'cancel' },
      { label: '批量改价          🔴 高风险（推荐必选）', value: 'bulk_price' },
      { label: '发货              🟡 中风险', value: 'fulfill' },
      { label: '补发              🟢 低风险', value: 'resend' },
      { label: '创建折扣码        🟡 中风险', value: 'discount_create' },
      { label: '删除折扣码        🔴 高风险（推荐必选）', value: 'discount_delete' },
    ]
  );

  // 5b — 退款金额阈值
  console.log('');
  const thresholdRaw = (await ask('  退款审批金额阈值（低于此金额不需审批，填 0 则全部审批）：')).trim();
  const refundThreshold = parseFloat(thresholdRaw) || 0;

  // 5c — Telegram Chat ID
  console.log('');
  const chatIdRaw = (await ask('  Telegram Chat ID（审批通知发往此 ID，默认 2074812988）：')).trim();
  const chatId = chatIdRaw || '2074812988';

  // 5d — 库存预警阈值
  const stockRaw = (await ask('  库存预警阈值（低于此数量触发告警，默认 10）：')).trim();
  const lowStockThreshold = parseInt(stockRaw) || 10;

  config.approval = {
    require: approvalChoices.map(c => c.value),
    refund_threshold: refundThreshold,
    telegram_chat_id: chatId,
  };
  config.notifications = { telegram_chat_id: chatId };
  config.alerts = {
    low_stock_threshold: lowStockThreshold,
    order_poll_interval_minutes: 15,
  };

  // ════════════════════════════════════════════════════════
  // Step 6 — 配置 API（仅配置 Step 2 选中的渠道）
  // ════════════════════════════════════════════════════════
  hr();
  console.log('【Step 6 / 6】配置 API\n');
  console.log(`  您选择了以下渠道：${config.business.channels.join('、')}`);
  console.log('  依次完成各平台授权。\n');

  // ── Shopify ──
  if (config.business.channels.includes('shopify')) {
    console.log('── Shopify 授权 ──────────────────────────────');
    console.log('前置步骤：在 dev.shopify.com 的 App 设置里，');
    console.log(`把以下地址加入「允许的重定向 URL」：`);
    console.log(`  http://localhost:${CALLBACK_PORT}${CALLBACK_PATH}\n`);

    const domain   = (await ask('  店铺域名（如 my-shop.myshopify.com）：')).trim();
    const clientId = (await ask('  Client ID：')).trim();
    const secret   = (await ask('  Client Secret：')).trim();

    console.log('\n  正在启动 OAuth 授权流程...');
    const accessToken = await shopifyOAuth(clientId, secret, domain);
    console.log('  ✅ Shopify 授权成功\n');

    config.shopify = {
      shop_domain: domain,
      access_token: accessToken,
      client_id: clientId,
      client_secret: secret,
      api_version: '2026-01',
    };
  }

  // ── WooCommerce ──
  if (config.business.channels.includes('woocommerce')) {
    console.log('\n── WooCommerce 授权 ─────────────────────────');
    console.log('  在 WordPress 后台 → WooCommerce → 设置 → 高级 → REST API');
    console.log('  生成一个「读写」权限的 API Key\n');

    const wcUrl    = (await ask('  店铺地址（如 https://mystore.com）：')).trim().replace(/\/$/, '');
    const wcKey    = (await ask('  Consumer Key（ck_...）：')).trim();
    const wcSecret = (await ask('  Consumer Secret（cs_...）：')).trim();

    config.woocommerce = {
      store_url: wcUrl,
      consumer_key: wcKey,
      consumer_secret: wcSecret,
      api_version: 'wc/v3',
    };
    console.log('  ✅ WooCommerce 配置已保存\n');
  }

  // ── 有赞 ──
  if (config.business.channels.includes('youzan')) {
    console.log('\n── 有赞授权 ─────────────────────────────────');
    console.log('  有赞开放平台 → 应用管理 → 获取 Access Token\n');

    const yzToken  = (await ask('  Access Token：')).trim();
    const yzKdtId  = (await ask('  店铺 KDT ID（有赞后台 → 店铺设置）：')).trim();

    config.youzan = {
      access_token: yzToken,
      kdt_id: yzKdtId,
    };
    console.log('  ✅ 有赞配置已保存\n');
  }

  config.report = {
    daily_report_hour: 8,
    timezone: 'Asia/Shanghai',
  };

  // ════════════════════════════════════════════════════════
  // 写入 config.json
  // ════════════════════════════════════════════════════════
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');

  hr();
  console.log('🎉 配置完成！\n');
  console.log('  业务模式：' + { domestic: '国内电商', crossborder: '跨境出海', both: '国内+跨境' }[config.business.mode]);
  console.log('  销售渠道：' + config.business.channels.join('、'));
  console.log('  商品类型：' + config.business.categories.join('、'));
  console.log('  优先目标：' + { selection:'选品', launch:'上新', conversion:'转化', community:'社区', ops:'巡检' }[config.business.priority]);
  console.log('  审批操作：' + (config.approval.require.length ? config.approval.require.join('、') : '全部不需要'));
  console.log('  通知 ID：' + chatId);
  console.log('  库存预警：< ' + lowStockThreshold);

  // 验证主平台连接
  if (config.business.channels.includes('shopify')) {
    console.log('\n  正在验证 Shopify 连接...');
    const { testConnection } = await import('./connectors/shopify.js');
    const result = await testConnection();
    if (result.ok) {
      console.log(`  ✅ Shopify 连接正常：${result.shop_name}（${result.currency}）`);
    } else {
      console.log(`  ⚠️  Shopify 连接验证失败：${result.error}`);
      console.log('      可稍后运行 node scripts/connect-test.mjs 重试');
    }
  }

  console.log('\n  下一步：');
  const nextStepMap = {
    selection: 'node scripts/product-research.mjs profit --cost 50 --price 150',
    launch:    'node scripts/list-product.mjs --help',
    conversion:'node scripts/promotion.mjs preview --discount 0.8',
    community: 'node scripts/customer-service.mjs faq-list',
    ops:       'node scripts/daily-report.mjs',
  };
  console.log(`    ${nextStepMap[config.business.priority]}`);
  console.log('\n  Dashboard：node scripts/dashboard-server.mjs → http://localhost:3458\n');

  rl.close();
}

main().catch(err => {
  console.error('\n❌ 初始化失败：', err.message);
  rl.close();
  process.exit(1);
});
