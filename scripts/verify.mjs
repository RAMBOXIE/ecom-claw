/**
 * 数据验收工具
 * 电商龙虾 — 验证系统数据与 Shopify 后台一致性
 *
 * 用法：
 *   node scripts/verify.mjs orders   [--date YYYY-MM-DD]   验证订单数据
 *   node scripts/verify.mjs products                       验证商品/库存数据
 *   node scripts/verify.mjs report   [--date YYYY-MM-DD]   完整日报数据验收
 *   node scripts/verify.mjs all                            全量验收
 */

import { getOrders, getProducts, getVariants, getShopInfo, getDailySummary } from '../connectors/shopify.js';

const args = process.argv.slice(2);
const subcommand = args[0];

function getArg(flag) {
  const i = args.indexOf(flag);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
}

function formatDate(d) {
  return new Date(d).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
}

function section(title) {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`▶ ${title}`);
  console.log('─'.repeat(50));
}

// ─── 验证订单 ─────────────────────────────────────────────

async function verifyOrders(date) {
  const targetDate = date || new Date().toISOString().slice(0, 10);
  const start = new Date(targetDate + 'T00:00:00+08:00').toISOString();
  const end   = new Date(targetDate + 'T23:59:59+08:00').toISOString();

  section(`订单验收 — ${targetDate}`);
  console.log('📥 从 Shopify 拉取原始订单数据...\n');

  const orders = await getOrders({ status: 'any', created_at_min: start, created_at_max: end, limit: 250 });

  if (orders.length === 0) {
    console.log(`  当日无订单`);
    return { date: targetDate, orderCount: 0, totalRevenue: 0, orders: [] };
  }

  // 计算汇总
  let totalRevenue = 0;
  let paidCount = 0;
  let pendingCount = 0;
  let refundedCount = 0;

  const orderRows = orders.map(o => {
    const isPaid = ['paid', 'partially_paid'].includes(o.financial_status);
    const isRefunded = ['refunded', 'partially_refunded'].includes(o.financial_status);
    if (isPaid) { totalRevenue += parseFloat(o.total_price); paidCount++; }
    if (isRefunded) refundedCount++;
    if (o.financial_status === 'pending') pendingCount++;

    return {
      orderNumber: o.order_number,
      total: `${o.currency} ${o.total_price}`,
      status: o.financial_status,
      fulfillment: o.fulfillment_status || 'unfulfilled',
      time: formatDate(o.created_at),
      items: (o.line_items || []).map(i => `${i.title}×${i.quantity}`).join(', ')
    };
  });

  // 输出表格
  console.log(`  总订单数：${orders.length}`);
  console.log(`  已付款：${paidCount}`);
  console.log(`  待付款：${pendingCount}`);
  console.log(`  已退款：${refundedCount}`);
  console.log(`  总收入：${orders[0]?.currency || ''} ${totalRevenue.toFixed(2)}`);
  console.log('');
  console.log('  原始订单列表（与 Shopify 后台 Orders 对照）：');
  orderRows.forEach(o => {
    console.log(`  #${o.orderNumber} | ${o.total} | ${o.status} | ${o.fulfillment} | ${o.time}`);
    console.log(`    商品：${o.items}`);
  });

  console.log('\n✅ 请在 Shopify 后台 → 订单 → 按日期筛选 对照以上数据');

  const result = { date: targetDate, orderCount: orders.length, paidCount, totalRevenue: totalRevenue.toFixed(2), currency: orders[0]?.currency, orders: orderRows };
  process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(result) + '\n');
  return result;
}

// ─── 验证商品/库存 ────────────────────────────────────────

async function verifyProducts() {
  section('商品 & 库存验收');
  console.log('📥 从 Shopify 拉取商品数据...\n');

  const products = await getProducts({ limit: 250, status: 'active' });

  if (products.length === 0) {
    console.log('  暂无上架商品');
    return;
  }

  let totalSKUs = 0;
  let lowStockCount = 0;
  const rows = [];

  for (const p of products) {
    const variants = p.variants || [];
    variants.forEach(v => {
      totalSKUs++;
      const stock = v.inventory_quantity;
      if (stock !== null && stock < 10) lowStockCount++;
      rows.push({
        productId: p.id,
        productTitle: p.title,
        sku: v.sku || '—',
        variantTitle: v.title !== 'Default Title' ? v.title : '',
        price: `${v.price}`,
        stock: stock ?? '不追踪',
        status: p.status
      });
    });
  }

  console.log(`  上架商品数：${products.length}`);
  console.log(`  总 SKU 数：${totalSKUs}`);
  console.log(`  低库存（<10）：${lowStockCount}`);
  console.log('');
  console.log('  商品清单（与 Shopify 后台 → 商品对照）：');
  rows.forEach(r => {
    const variant = r.variantTitle ? ` / ${r.variantTitle}` : '';
    console.log(`  [${r.productId}] ${r.productTitle}${variant} | SKU: ${r.sku} | 价格: ${r.price} | 库存: ${r.stock}`);
  });

  console.log('\n✅ 请在 Shopify 后台 → 商品 → 库存 对照以上数据');

  const result = { productCount: products.length, skuCount: totalSKUs, lowStockCount, products: rows };
  process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(result) + '\n');
  return result;
}

// ─── 完整日报验收 ─────────────────────────────────────────

async function verifyReport(date) {
  const targetDate = date || new Date(Date.now() - 86400000).toISOString().slice(0, 10); // 默认昨天

  section(`完整日报验收 — ${targetDate}`);
  console.log('正在拉取所有数据，请稍候...\n');

  const [orderResult, productResult] = await Promise.all([
    verifyOrders(targetDate),
    verifyProducts()
  ]);

  section('验收汇总');
  console.log(`日期：${targetDate}`);
  console.log(`订单数：${orderResult.orderCount}（已付款 ${orderResult.paidCount}）`);
  console.log(`总收入：${orderResult.currency || ''} ${orderResult.totalRevenue}`);
  console.log(`商品数：${productResult?.productCount || 0} | SKU：${productResult?.skuCount || 0}`);
  console.log(`低库存：${productResult?.lowStockCount || 0}`);
  console.log('');
  console.log('🔍 对照步骤：');
  console.log('  1. Shopify 后台 → 分析 → 概览 → 按日期查看销售额');
  console.log('  2. Shopify 后台 → 订单 → 筛选日期 → 核对订单数量');
  console.log('  3. Shopify 后台 → 商品 → 库存 → 核对低库存数量');
}

// ─── main ─────────────────────────────────────────────────

async function run() {
  const date = getArg('--date');

  const shopInfo = await getShopInfo();
  console.log(`🦞 电商龙虾 数据验收工具`);
  console.log(`   店铺：${shopInfo.name}（${shopInfo.myshopify_domain}）`);
  console.log(`   货币：${shopInfo.currency}`);

  switch (subcommand) {
    case 'orders':   await verifyOrders(date); break;
    case 'products': await verifyProducts(); break;
    case 'report':   await verifyReport(date); break;
    case 'all':      await verifyReport(date); break;
    default:
      console.log(`\n用法：
  node scripts/verify.mjs orders   [--date YYYY-MM-DD]
  node scripts/verify.mjs products
  node scripts/verify.mjs report   [--date YYYY-MM-DD]
  node scripts/verify.mjs all`);
  }
}

run().catch(err => {
  console.error('❌ 验收失败：', err.message);
  process.exit(1);
});
