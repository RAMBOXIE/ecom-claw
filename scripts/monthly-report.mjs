/**
 * 月报
 * 电商龙虾 — 月度销售数据汇总分析
 *
 * 用法：
 *   node monthly-report.mjs                 默认上个月
 *   node monthly-report.mjs --months-ago 0  本月
 *   node monthly-report.mjs --months-ago 2  两个月前
 */

import { getOrders, getShopInfo } from '../connectors/shopify.js';

const args = process.argv.slice(2);

function getArg(flag) {
  const i = args.indexOf(flag);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
}

const monthsAgo = parseInt(getArg('--months-ago') ?? '1');

function getMonthRange(monthsBack) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
  const end = new Date(now.getFullYear(), now.getMonth() - monthsBack + 1, 1);
  return { start, end };
}

function fmtMonth(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmtDate(d) {
  return d.toISOString().split('T')[0];
}

async function fetchOrdersInRange(start, end) {
  const allOrders = [];
  let created_at_max = end.toISOString();

  while (true) {
    const pageOrders = await getOrders({
      status: 'any',
      limit: 250,
      created_at_min: start.toISOString(),
      created_at_max
    });

    if (pageOrders.length === 0) break;
    allOrders.push(...pageOrders);

    const oldest = pageOrders[pageOrders.length - 1];
    const oldestDate = new Date(oldest.created_at);
    if (oldestDate <= start) break;
    created_at_max = oldest.created_at;
    if (pageOrders.length < 250) break;
  }

  // Deduplicate
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

  // 新客/回头客
  let newCustomers = 0;
  let returningCustomers = 0;
  for (const o of paidOrders) {
    if (o.customer?.orders_count !== undefined) {
      if (o.customer.orders_count <= 1) newCustomers++;
      else returningCustomers++;
    }
  }
  const uniqueCustomers = new Set(paidOrders.map(o => o.customer?.id).filter(Boolean)).size;

  return {
    totalOrders,
    totalRevenue: totalRevenue.toFixed(2),
    avgOrderValue: avgOrderValue.toFixed(2),
    currency,
    topProducts,
    uniqueCustomers,
    newCustomers,
    returningCustomers,
    newCustomerRate: (newCustomers + returningCustomers) > 0
      ? ((newCustomers / (newCustomers + returningCustomers)) * 100).toFixed(1)
      : '0.0',
    paidOrders
  };
}

function pctChange(cur, prev) {
  const c = parseFloat(cur);
  const p = parseFloat(prev);
  if (p === 0) return c > 0 ? '+∞' : '—';
  const pct = ((c - p) / p * 100).toFixed(1);
  return parseFloat(pct) >= 0 ? `+${pct}%` : `${pct}%`;
}

async function run() {
  const shop = await getShopInfo();
  const curRange = getMonthRange(monthsAgo);
  const prevRange = getMonthRange(monthsAgo + 1);
  const periodLabel = `${fmtMonth(curRange.start)} 月报`;
  const prevLabel = fmtMonth(prevRange.start);

  console.log(`🦞 电商龙虾月报 — ${periodLabel}\n`);
  console.log('拉取数据中...');

  const [curOrders, prevOrders] = await Promise.all([
    fetchOrdersInRange(curRange.start, curRange.end),
    fetchOrdersInRange(prevRange.start, prevRange.end)
  ]);

  const current = analyzeOrders(curOrders);
  const previous = analyzeOrders(prevOrders);

  // 按天汇总
  const dailyMap = {};
  for (const o of current.paidOrders) {
    const day = o.created_at.split('T')[0];
    if (!dailyMap[day]) dailyMap[day] = { date: day, revenue: 0, orders: 0 };
    dailyMap[day].revenue += parseFloat(o.total_price || 0);
    dailyMap[day].orders += 1;
  }
  const dailySummary = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

  // 最高单日
  let peakDay = { date: '—', revenue: 0, orders: 0 };
  for (const d of dailySummary) {
    if (d.revenue > peakDay.revenue) peakDay = d;
  }

  // 每周趋势（按该月的周分段）
  const weeklyTrend = [];
  const monthStart = curRange.start;
  const monthEnd = curRange.end;
  let weekStart = new Date(monthStart);
  let weekNum = 1;

  while (weekStart < monthEnd) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const actualEnd = weekEnd > monthEnd ? monthEnd : weekEnd;

    const weekOrders = current.paidOrders.filter(o => {
      const d = new Date(o.created_at);
      return d >= weekStart && d < actualEnd;
    });

    const weekRevenue = weekOrders.reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0);
    weeklyTrend.push({
      week: `第${weekNum}周`,
      startDate: fmtDate(weekStart),
      endDate: fmtDate(actualEnd),
      orders: weekOrders.length,
      revenue: weekRevenue.toFixed(2)
    });

    weekStart = new Date(actualEnd);
    weekNum++;
  }

  // 输出报告
  const lines = [];
  lines.push(`🦞 **电商龙虾月报** — ${shop.name}`);
  lines.push(`📅 ${periodLabel}`);
  lines.push('');
  lines.push('💰 **月度概况**');
  lines.push(`• 总销售额：${current.currency} ${current.totalRevenue}（环比 ${pctChange(current.totalRevenue, previous.totalRevenue)}）`);
  lines.push(`• 成交订单：${current.totalOrders} 单（环比 ${pctChange(current.totalOrders, previous.totalOrders)}）`);
  lines.push(`• 客单价：${current.currency} ${current.avgOrderValue}（环比 ${pctChange(current.avgOrderValue, previous.avgOrderValue)}）`);
  lines.push('');

  lines.push('📅 **每周趋势**');
  for (const w of weeklyTrend) {
    lines.push(`• ${w.week}（${w.startDate} ~ ${w.endDate}）：${w.orders} 单，${current.currency} ${w.revenue}`);
  }
  lines.push('');

  if (current.topProducts.length > 0) {
    lines.push('🏆 **TOP 10 商品**');
    current.topProducts.forEach((p, i) => {
      lines.push(`${String(i + 1).padStart(2, ' ')}. ${p.name}（×${p.qty}，${current.currency} ${p.revenue}）`);
    });
    lines.push('');
  }

  lines.push('👥 **客户分析**');
  lines.push(`• 独立客户：${current.uniqueCustomers} 人`);
  lines.push(`• 新客占比：${current.newCustomerRate}%（新客 ${current.newCustomers} / 回头客 ${current.returningCustomers}）`);
  lines.push('');

  lines.push('📈 **最高单日**');
  lines.push(`• ${peakDay.date}：${peakDay.orders} 单，${current.currency} ${peakDay.revenue.toFixed(2)}`);
  lines.push('');

  lines.push(`📊 **对比上月**（${prevLabel}）`);
  lines.push(`• 上月订单：${previous.totalOrders} 单 | 上月销售额：${previous.currency} ${previous.totalRevenue}`);
  lines.push('─────────────────');

  const report = lines.join('\n');
  console.log('\n' + report);

  const output = {
    mode: 'monthly',
    period: periodLabel,
    current: {
      totalOrders: current.totalOrders,
      totalRevenue: current.totalRevenue,
      avgOrderValue: current.avgOrderValue,
      currency: current.currency,
      topProducts: current.topProducts,
      uniqueCustomers: current.uniqueCustomers,
      newCustomers: current.newCustomers,
      returningCustomers: current.returningCustomers,
      newCustomerRate: current.newCustomerRate
    },
    previous: {
      totalOrders: previous.totalOrders,
      totalRevenue: previous.totalRevenue,
      avgOrderValue: previous.avgOrderValue,
      currency: previous.currency
    },
    comparison: {
      ordersChange: pctChange(current.totalOrders, previous.totalOrders),
      revenueChange: pctChange(current.totalRevenue, previous.totalRevenue),
      aovChange: pctChange(current.avgOrderValue, previous.avgOrderValue)
    },
    dailySummary: dailySummary.map(d => ({ ...d, revenue: d.revenue.toFixed(2) })),
    weeklyTrend,
    peakDay: { date: peakDay.date, orders: peakDay.orders, revenue: peakDay.revenue.toFixed(2) },
    report
  };

  process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(output) + '\n');
}

run().catch(err => {
  console.error('❌ 月报生成失败：', err.message);
  process.exit(1);
});
