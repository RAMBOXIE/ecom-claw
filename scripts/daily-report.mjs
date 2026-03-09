/**
 * 每日销售日报
 * 电商龙虾 — 自动拉取昨日数据，格式化推送
 *
 * 用法：node daily-report.mjs [YYYY-MM-DD] [--raw]
 *   --raw  输出原始 API 数据（用于与 Shopify 后台对照验收）
 */

import { getDailySummary, getOrders, getShopInfo, getLowStockProducts } from '../connectors/shopify.js';

const args = process.argv.slice(2);
const dateArg = args.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a));
const rawMode = args.includes('--raw');

async function run() {
  // 默认取昨天
  const targetDate = dateArg
    ? new Date(dateArg)
    : new Date(Date.now() - 86400000);

  const dateStr = targetDate.toISOString().split('T')[0];

  // ── --raw 模式：输出原始 API 数据供人工对照 ──────────────
  if (rawMode) {
    console.log(`🔍 [RAW MODE] 拉取 ${dateStr} 原始数据...\n`);
    const start = new Date(dateStr + 'T00:00:00+08:00').toISOString();
    const end   = new Date(dateStr + 'T23:59:59+08:00').toISOString();
    const orders = await getOrders({ status: 'any', created_at_min: start, created_at_max: end, limit: 250 });

    console.log(`原始订单数：${orders.length}`);
    console.log(`（请在 Shopify 后台 → 订单 → 按日期 ${dateStr} 筛选对照）\n`);
    orders.forEach(o => {
      const items = (o.line_items || []).map(i => `${i.title}×${i.quantity}`).join(', ');
      console.log(`  #${o.order_number} | ${o.currency} ${o.total_price} | ${o.financial_status} | ${new Date(o.created_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
      console.log(`    ${items}`);
    });

    const total = orders.reduce((s, o) => ['paid','partially_paid'].includes(o.financial_status) ? s + parseFloat(o.total_price) : s, 0);
    console.log(`\n计算总收入（已付款）：${orders[0]?.currency || ''} ${total.toFixed(2)}`);
    process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify({ date: dateStr, rawOrders: orders }) + '\n');
    return;
  }

  console.log(`📊 拉取 ${dateStr} 数据中...`);

  const [summary, shop, lowStock] = await Promise.all([
    getDailySummary(dateStr),
    getShopInfo(),
    getLowStockProducts()
  ]);

  const lines = [];
  lines.push(`🦞 **电商龙虾日报** — ${dateStr}`);
  lines.push(`店铺：${shop.name}`);
  lines.push('');
  lines.push('💰 **销售概况**');
  lines.push(`• 成交订单：${summary.totalOrders} 单`);
  lines.push(`• 总销售额：${summary.currency} ${summary.totalRevenue}`);
  lines.push(`• 客单价：${summary.currency} ${summary.avgOrderValue}`);
  lines.push(`• 待发货：${summary.pendingCount} 单 ⚠️`);

  if (summary.topProducts.length > 0) {
    lines.push('');
    lines.push('🏆 **热销商品 Top5**');
    summary.topProducts.forEach((p, i) => {
      lines.push(`${i + 1}. ${p.name}（×${p.qty}）`);
    });
  }

  if (lowStock.length > 0) {
    lines.push('');
    lines.push(`📦 **低库存预警** (${lowStock.length} 个 SKU)`);
    lowStock.slice(0, 5).forEach(p => {
      lines.push(`• ${p.productTitle}${p.variantTitle !== 'Default Title' ? ' - ' + p.variantTitle : ''} → 剩余 ${p.quantity} 件`);
    });
    if (lowStock.length > 5) lines.push(`  ...还有 ${lowStock.length - 5} 个`);
  } else {
    lines.push('');
    lines.push('📦 库存正常，无预警');
  }

  lines.push('');
  lines.push('─────────────────');

  const report = lines.join('\n');
  console.log('\n' + report);

  // 输出 JSON 供上层脚本读取
  const output = { report, summary, lowStock, shop };
  process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(output) + '\n');
}

run().catch(err => {
  console.error('❌ 日报生成失败：', err.message);
  process.exit(1);
});
