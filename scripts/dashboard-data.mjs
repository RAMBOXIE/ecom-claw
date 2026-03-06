/**
 * Dashboard 数据准备
 * 电商龙虾 — 拉取所有数据，生成可直接注入 Canvas 的 HTML
 *
 * 用法：node dashboard-data.mjs
 * 输出：生成 dashboard/live.html（含实时数据）
 */

import { getDailySummary, getLowStockProducts, getShopInfo, getOrders } from '../connectors/shopify.js';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function getWeeklyTrend() {
  const trend = [];
  const today = new Date();

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];

    try {
      const summary = await getDailySummary(dateStr);
      trend.push({ date: dateStr, revenue: parseFloat(summary.totalRevenue), orders: summary.totalOrders });
    } catch {
      trend.push({ date: dateStr, revenue: 0, orders: 0 });
    }
  }
  return trend;
}

async function run() {
  console.log('🦞 正在拉取 Dashboard 数据...');

  const [summary, shop, lowStock, weeklyTrend] = await Promise.all([
    getDailySummary(),
    getShopInfo(),
    getLowStockProducts(),
    getWeeklyTrend()
  ]);

  // 今日日期
  const today = new Date().toISOString().split('T')[0];
  summary.date = today;

  const data = { summary, shop, lowStock, weeklyTrend };

  // 读取基础 HTML 模板
  const templatePath = join(__dirname, '..', 'dashboard', 'index.html');
  let html = readFileSync(templatePath, 'utf8');

  // 在 </body> 前注入数据
  const injection = `\n<script>\nwindow.__ECOM_DATA__ = ${JSON.stringify(data)};\nif(window.loadEcomData) loadEcomData(window.__ECOM_DATA__);\n</script>\n`;
  html = html.replace('</body>', injection + '</body>');

  // 写出 live.html
  const outputPath = join(__dirname, '..', 'dashboard', 'live.html');
  writeFileSync(outputPath, html, 'utf8');

  console.log(`✅ Dashboard 数据已生成：dashboard/live.html`);
  console.log(`   店铺：${shop.name} | 今日订单：${summary.totalOrders} | 低库存：${lowStock.length}`);
  console.log(`\n__OUTPUT_PATH__\n${outputPath}`);
}

run().catch(err => {
  console.error('❌ Dashboard 数据生成失败：', err.message);
  process.exit(1);
});
