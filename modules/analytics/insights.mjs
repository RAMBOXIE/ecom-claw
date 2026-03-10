/**
 * 📊 数据参谋 — AI 经营洞察
 * modules/analytics/insights.mjs
 *
 * CLI：
 *   node modules/analytics/insights.mjs
 *   node modules/analytics/insights.mjs --focus inventory|revenue|orders|products
 *   node modules/analytics/insights.mjs --deep
 *
 * 导出：runInsights
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

async function shopify() { return import(`${ROOT}/connectors/shopify.js`); }

// ─── 指标计算 ──────────────────────────────────────────────

function calcMetrics(orders, products) {
  const now = new Date();
  const cutoff = new Date(now - 30 * 24 * 60 * 60 * 1000);

  const recent = orders.filter(o => new Date(o.created_at) >= cutoff);
  const totalRevenue = recent.reduce((s, o) => s + parseFloat(o.total_price || 0), 0);
  const avgOrderValue = recent.length ? totalRevenue / recent.length : 0;
  const ordersPerDay = recent.length / 30;

  // 各商品销量统计
  const productRevenue = {};
  recent.forEach(o => {
    (o.line_items || []).forEach(li => {
      if (!productRevenue[li.product_id]) {
        productRevenue[li.product_id] = { id: li.product_id, name: li.name, revenue: 0, quantity: 0 };
      }
      productRevenue[li.product_id].revenue += parseFloat(li.price || 0) * li.quantity;
      productRevenue[li.product_id].quantity += li.quantity;
    });
  });

  const sorted = Object.values(productRevenue).sort((a, b) => b.revenue - a.revenue);
  const topProducts = sorted.slice(0, 5);
  const slowMovers = sorted.slice(-5).reverse();

  // 履约率
  const fulfilled = recent.filter(o => o.fulfillment_status === 'fulfilled').length;
  const fulfillmentRate = recent.length ? fulfilled / recent.length : 1;

  // 退款检测
  const refunded = recent.filter(o => o.financial_status === 'refunded' || o.financial_status === 'partially_refunded').length;
  const refundRate = recent.length ? refunded / recent.length : 0;

  // 库存风险（日均销量 × 7 天）
  const inventoryRisk = products.filter(p => {
    const v = p.variants?.[0];
    if (!v || v.inventory_quantity == null) return false;
    const pid = p.id;
    const dailySales = (productRevenue[pid]?.quantity || 0) / 30;
    return dailySales > 0 && v.inventory_quantity < dailySales * 7;
  });

  return {
    period: '近30天',
    orders: recent.length,
    ordersPerDay: ordersPerDay.toFixed(1),
    totalRevenue: totalRevenue.toFixed(2),
    avgOrderValue: avgOrderValue.toFixed(2),
    fulfillmentRate: (fulfillmentRate * 100).toFixed(1),
    refundRate: (refundRate * 100).toFixed(1),
    topProducts,
    slowMovers,
    inventoryRisk,
  };
}

// ─── 洞察规则引擎 ──────────────────────────────────────────

function generateInsights(metrics, focus) {
  const insights = [];
  const { orders, ordersPerDay, fulfillmentRate, refundRate, inventoryRisk, slowMovers, avgOrderValue } = metrics;

  // 1. 库存告急
  if (inventoryRisk.length > 0 && (!focus || focus === 'inventory')) {
    insights.push({
      type: 'warning',
      icon: '🚨',
      title: `库存告急：${inventoryRisk.length} 个商品不足 7 天销量`,
      detail: inventoryRisk.map(p => p.title || p.id).join('、'),
      action: '立即补货或暂停广告，避免断货影响评分',
    });
  }

  // 2. 履约率偏低
  if (parseFloat(fulfillmentRate) < 90 && (!focus || focus === 'orders')) {
    insights.push({
      type: 'warning',
      icon: '⚠️',
      title: `履约率偏低：${fulfillmentRate}%（目标 ≥90%）`,
      detail: '存在未发货订单积压，影响买家体验和平台评级',
      action: '运行 --orders list 检查待发货订单，优先处理超时订单',
    });
  }

  // 3. 退款率偏高
  if (parseFloat(refundRate) > 5 && (!focus || focus === 'orders')) {
    insights.push({
      type: 'warning',
      icon: '💸',
      title: `退款率偏高：${refundRate}%（健康值 <5%）`,
      detail: '退款率高通常意味着商品描述、质量或物流存在问题',
      action: '检查 community --reviews alerts 查看差评，分析退款原因',
    });
  }

  // 4. 滞销品促销机会
  if (slowMovers.length >= 3 && (!focus || focus === 'products')) {
    insights.push({
      type: 'opportunity',
      icon: '🏷️',
      title: `发现 ${slowMovers.length} 个滞销商品，适合做清仓促销`,
      detail: slowMovers.map(p => p.name).join('、'),
      action: '运行 --promotions preview --discount 0.8 预览 8 折效果',
    });
  }

  // 5. 客单价提升空间
  if (parseFloat(avgOrderValue) < 100 && orders > 10 && (!focus || focus === 'revenue')) {
    insights.push({
      type: 'opportunity',
      icon: '📈',
      title: `客单价偏低：${metrics.avgOrderValue}（建议 >100）`,
      detail: '可通过捆绑销售、满减门槛或关联推荐提升客单价',
      action: '为热销商品配置关联商品，或设置满额免运费门槛',
    });
  }

  // 6. 订单量下滑
  if (parseFloat(ordersPerDay) < 1 && (!focus || focus === 'orders')) {
    insights.push({
      type: 'info',
      icon: '📉',
      title: `近30天日均订单 ${ordersPerDay} 单，流量偏低`,
      detail: '订单量不足，需要加强内容营销或促销活动',
      action: '运行 community --content 生成社媒文案，配合小红书/抖音引流',
    });
  }

  // 7. 爆品机会
  const top = metrics.topProducts[0];
  if (top && top.quantity > 10 && (!focus || focus === 'products')) {
    insights.push({
      type: 'opportunity',
      icon: '🔥',
      title: `爆品机会：「${top.name}」近30天销量 ${top.quantity} 件`,
      detail: `营收贡献 ${top.revenue.toFixed(2)}，是当前核心 SKU`,
      action: '确保库存充足，考虑推出相关联品或升级款',
    });
  }

  // 8. 一切正常
  if (insights.length === 0) {
    insights.push({
      type: 'info',
      icon: '✅',
      title: '经营状态健康，无明显风险',
      detail: `履约率 ${fulfillmentRate}%，退款率 ${refundRate}%，近30天 ${orders} 单`,
      action: '保持现状，关注库存补货节奏',
    });
  }

  return insights;
}

// ─── 主函数 ────────────────────────────────────────────────

export async function runInsights(args = []) {
  const focus = args[args.indexOf('--focus') + 1] || null;
  const deep  = args.includes('--deep');

  // 检查配置
  const configPath = join(ROOT, 'config.json');
  if (!existsSync(configPath)) {
    console.log('\n📊 AI 经营洞察\n');
    console.log('⚠️  config.json 未配置，显示演示数据\n');
    const demo = [
      { type: 'warning', icon: '🚨', title: '库存告急：防晒霜 不足 7 天销量', detail: '当前库存 5 件，日均销 1.2 件', action: '立即补货' },
      { type: 'opportunity', icon: '🔥', title: '爆品机会：「保湿面膜」近30天销量 48 件', detail: '营收贡献最高', action: '确保库存充足' },
      { type: 'info', icon: '📈', title: '客单价偏低：68（建议 >100）', detail: '可通过捆绑销售提升', action: '配置关联商品' },
    ];
    demo.forEach(i => console.log(`${i.icon} [${i.type.toUpperCase()}] ${i.title}\n   → ${i.action}\n`));
    return { demo: true, insights: demo };
  }

  const s = await shopify();
  console.log('\n📊 AI 经营洞察 — 数据拉取中...\n');

  const [orders, products, lowStock] = await Promise.all([
    s.getOrders({ status: 'any', limit: 250 }),
    s.getProducts({ status: 'active', limit: 250 }),
    s.getLowStockProducts(10).catch(() => []),
  ]);

  const metrics = calcMetrics(orders, products);
  const insights = generateInsights(metrics, focus);

  // 输出
  console.log(`━━ 近30天概况 ${'─'.repeat(40)}`);
  console.log(`  订单：${metrics.orders} 单  日均：${metrics.ordersPerDay}/天`);
  console.log(`  营收：${metrics.totalRevenue}  客单价：${metrics.avgOrderValue}`);
  console.log(`  履约率：${metrics.fulfillmentRate}%  退款率：${metrics.refundRate}%\n`);

  if (deep && metrics.topProducts.length) {
    console.log(`━━ Top 5 商品 ${'─'.repeat(43)}`);
    metrics.topProducts.forEach((p, i) => console.log(`  ${i + 1}. ${p.name}  销量:${p.quantity}  营收:${p.revenue.toFixed(2)}`));
    console.log('');
  }

  console.log(`━━ 洞察与建议 ${'─'.repeat(41)}`);
  insights.forEach(ins => {
    const badge = ins.type === 'warning' ? '🔴' : ins.type === 'opportunity' ? '🟢' : '🔵';
    console.log(`\n${badge} ${ins.icon} ${ins.title}`);
    if (ins.detail) console.log(`   ${ins.detail}`);
    console.log(`   💡 ${ins.action}`);
  });

  console.log(`\n__JSON_OUTPUT__ ${JSON.stringify({ ok: true, metrics, insights })}`);
  return { metrics, insights };
}

// ─── CLI 入口 ──────────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith('insights.mjs')) {
  runInsights(process.argv.slice(2)).catch(e => { console.error('❌', e.message); process.exit(1); });
}
