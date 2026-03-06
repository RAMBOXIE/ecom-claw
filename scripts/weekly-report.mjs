/**
 * 周报/月报
 * 电商龙虾 — 销售数据汇总分析
 *
 * 用法：
 *   node weekly-report.mjs                    默认上周数据
 *   node weekly-report.mjs --weeks-ago 2      两周前数据
 *   node weekly-report.mjs --mode monthly     月报（默认上月）
 *   node weekly-report.mjs --mode monthly --months-ago 2
 */

import { getOrders, getShopInfo } from '../connectors/shopify.js';

const args = process.argv.slice(2);

function getArg(flag) {
  const i = args.indexOf(flag);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
}

const mode = getArg('--mode') || 'weekly';
const weeksAgo = parseInt(getArg('--weeks-ago') || '1');
const monthsAgo = parseInt(getArg('--months-ago') || '1');

function getWeekRange(weeksBack) {
  const now = new Date();
  const dayOfWeek = now.getDay() || 7; // 周日=7
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() - dayOfWeek + 1);
  thisMonday.setHours(0, 0, 0, 0);

  const start = new Date(thisMonday);
  start.setDate(thisMonday.getDate() - weeksBack * 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);

  return { start, end };
}

function getMonthRange(monthsBack) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
  const end = new Date(now.getFullYear(), now.getMonth() - monthsBack + 1, 1);
  return { start, end };
}

async function fetchOrdersInRange(start, end) {
  const allOrders = [];
  let pageOrders;
  let created_at_max = end.toISOString();

  // Paginate to get all orders
  do {
    pageOrders = await getOrders({
      status: 'any',
      limit: 250,
      created_at_min: start.toISOString(),
      created_at_max
    });

    if (pageOrders.length > 0) {
      allOrders.push(...pageOrders);
      // Move cursor to oldest order's date for next page
      const oldest = pageOrders[pageOrders.length - 1];
      const oldestDate = new Date(oldest.created_at);
      if (oldestDate <= new Date(start)) break;
      created_at_max = oldest.created_at;
      if (pageOrders.length < 250) break;
    }
  } while (pageOrders.length === 250);

  // Deduplicate by order ID
  const seen = new Set();
  return allOrders.filter(o => {
    if (seen.has(o.id)) return false;
    seen.add(o.id);
    return true;
  });
}

function analyzeOrders(orders) {
  const paidOrders = orders.filter(o => o.financial_status === 'paid' || o.financial_status === 'partially_paid');
  const totalRevenue = paidOrders.reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0);
  const totalOrders = paidOrders.length;
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const currency = paidOrders[0]?.currency || 'USD';

  // 商品销量
  const productSales = {};
  for (const order of paidOrders) {
    for (const item of order.line_items || []) {
      const key = item.title;
      if (!productSales[key]) productSales[key] = { qty: 0, revenue: 0 };
      productSales[key].qty += item.quantity;
      productSales[key].revenue += parseFloat(item.price) * item.quantity;
    }
  }
  const topProducts = Object.entries(productSales)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 10)
    .map(([name, data]) => ({ name, qty: data.qty, revenue: data.revenue.toFixed(2) }));

  // 新客/回头客分析
  const customerIds = paidOrders.map(o => o.customer?.id).filter(Boolean);
  const uniqueCustomers = new Set(customerIds);
  const customerOrderCount = {};
  for (const o of paidOrders) {
    if (o.customer?.id) {
      customerOrderCount[o.customer.id] = (customerOrderCount[o.customer.id] || 0) + 1;
    }
  }
  // 判断是否新客：如果 orders_count <= 1 则为新客
  let newCustomers = 0;
  let returningCustomers = 0;
  for (const o of paidOrders) {
    if (o.customer?.orders_count !== undefined) {
      if (o.customer.orders_count <= 1) newCustomers++;
      else returningCustomers++;
    }
  }

  return {
    totalOrders,
    totalRevenue: totalRevenue.toFixed(2),
    avgOrderValue: avgOrderValue.toFixed(2),
    currency,
    topProducts,
    uniqueCustomers: uniqueCustomers.size,
    newCustomers,
    returningCustomers,
    newCustomerRate: uniqueCustomers.size > 0
      ? ((newCustomers / (newCustomers + returningCustomers)) * 100).toFixed(1)
      : '0.0'
  };
}

async function run() {
  const shop = await getShopInfo();

  let current, previous, periodLabel, prevLabel;

  if (mode === 'monthly') {
    const curRange = getMonthRange(monthsAgo);
    const prevRange = getMonthRange(monthsAgo + 1);
    periodLabel = `${curRange.start.getFullYear()}-${String(curRange.start.getMonth() + 1).padStart(2, '0')} 月报`;
    prevLabel = `${prevRange.start.getFullYear()}-${String(prevRange.start.getMonth() + 1).padStart(2, '0')}`;

    console.log(`🦞 电商龙虾月报 — ${periodLabel}\n`);
    console.log('拉取数据中...');

    const [curOrders, prevOrders] = await Promise.all([
      fetchOrdersInRange(curRange.start, curRange.end),
      fetchOrdersInRange(prevRange.start, prevRange.end)
    ]);
    current = analyzeOrders(curOrders);
    previous = analyzeOrders(prevOrders);
  } else {
    const curRange = getWeekRange(weeksAgo);
    const prevRange = getWeekRange(weeksAgo + 1);
    const fmtDate = d => d.toISOString().split('T')[0];
    periodLabel = `${fmtDate(curRange.start)} ~ ${fmtDate(curRange.end)} 周报`;
    prevLabel = `${fmtDate(prevRange.start)} ~ ${fmtDate(prevRange.end)}`;

    console.log(`🦞 电商龙虾周报 — ${periodLabel}\n`);
    console.log('拉取数据中...');

    const [curOrders, prevOrders] = await Promise.all([
      fetchOrdersInRange(curRange.start, curRange.end),
      fetchOrdersInRange(prevRange.start, prevRange.end)
    ]);
    current = analyzeOrders(curOrders);
    previous = analyzeOrders(prevOrders);
  }

  // 计算涨跌
  function pctChange(cur, prev) {
    const c = parseFloat(cur);
    const p = parseFloat(prev);
    if (p === 0) return c > 0 ? '+∞' : '—';
    const pct = ((c - p) / p * 100).toFixed(1);
    return parseFloat(pct) >= 0 ? `+${pct}%` : `${pct}%`;
  }

  const lines = [];
  lines.push(`🦞 **电商龙虾${mode === 'monthly' ? '月' : '周'}报** — ${shop.name}`);
  lines.push(`📅 ${periodLabel}`);
  lines.push('');
  lines.push('💰 **销售概况**');
  lines.push(`• 成交订单：${current.totalOrders} 单（${pctChange(current.totalOrders, previous.totalOrders)}）`);
  lines.push(`• 总销售额：${current.currency} ${current.totalRevenue}（${pctChange(current.totalRevenue, previous.totalRevenue)}）`);
  lines.push(`• 客单价：${current.currency} ${current.avgOrderValue}（${pctChange(current.avgOrderValue, previous.avgOrderValue)}）`);
  lines.push('');
  lines.push(`👥 **客户分析**`);
  lines.push(`• 独立客户：${current.uniqueCustomers} 人`);
  lines.push(`• 新客占比：${current.newCustomerRate}%（新客 ${current.newCustomers} / 回头客 ${current.returningCustomers}）`);

  if (current.topProducts.length > 0) {
    lines.push('');
    lines.push('🏆 **TOP 10 商品**');
    current.topProducts.forEach((p, i) => {
      lines.push(`${String(i + 1).padStart(2, ' ')}. ${p.name}（×${p.qty}，${current.currency} ${p.revenue}）`);
    });
  }

  lines.push('');
  lines.push(`📊 **对比上期**（${prevLabel}）`);
  lines.push(`• 上期订单：${previous.totalOrders} 单 | 上期销售额：${previous.currency} ${previous.totalRevenue}`);
  lines.push('─────────────────');

  const report = lines.join('\n');
  console.log('\n' + report);

  const output = {
    mode,
    period: periodLabel,
    current,
    previous,
    comparison: {
      ordersChange: pctChange(current.totalOrders, previous.totalOrders),
      revenueChange: pctChange(current.totalRevenue, previous.totalRevenue),
      aovChange: pctChange(current.avgOrderValue, previous.avgOrderValue)
    },
    report
  };

  process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(output) + '\n');
}

run().catch(err => {
  console.error('❌ 报表生成失败：', err.message);
  process.exit(1);
});
