/**
 * 每日销售日报
 * 电商龙虾 — 自动拉取昨日数据，格式化推送
 * 
 * 用法：node daily-report.mjs [YYYY-MM-DD]
 */

import { getDailySummary, getShopInfo, getLowStockProducts } from '../connectors/shopify.js';

const dateArg = process.argv[2]; // 可指定日期，默认昨天

async function run() {
  // 默认取昨天
  const targetDate = dateArg
    ? new Date(dateArg)
    : new Date(Date.now() - 86400000);

  const dateStr = targetDate.toISOString().split('T')[0];

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
