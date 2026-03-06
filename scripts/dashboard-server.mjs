/**
 * Dashboard HTTP 服务器
 * 电商龙虾 — 本地 HTTP 服务，实时 Dashboard
 *
 * 用法：node dashboard-server.mjs
 * 访问：http://localhost:3458
 * 支持 ?refresh=1 强制刷新数据
 */

import http from 'http';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getDailySummary, getLowStockProducts, getShopInfo, getOrders } from '../connectors/shopify.js';

const CONFIG_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'config.json');

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 3458;
const REFRESH_INTERVAL = 5 * 60 * 1000; // 5分钟

let cachedData = null;
let lastFetchTime = 0;

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

async function fetchDashboardData() {
  console.log('📊 刷新 Dashboard 数据...');

  const [summary, shop, lowStock, weeklyTrend] = await Promise.all([
    getDailySummary(),
    getShopInfo(),
    getLowStockProducts(),
    getWeeklyTrend()
  ]);

  const today = new Date().toISOString().split('T')[0];
  summary.date = today;

  cachedData = { summary, shop, lowStock, weeklyTrend };
  lastFetchTime = Date.now();

  console.log(`✅ 数据刷新完成 — 订单：${summary.totalOrders} | 低库存：${lowStock.length}`);
  return cachedData;
}

async function getData(forceRefresh) {
  if (forceRefresh || !cachedData || (Date.now() - lastFetchTime > REFRESH_INTERVAL)) {
    return fetchDashboardData();
  }
  return cachedData;
}

function buildHTML(data) {
  const templatePath = join(__dirname, '..', 'dashboard', 'index.html');
  let html = readFileSync(templatePath, 'utf8');

  const injection = `\n<script>\nwindow.__ECOM_DATA__ = ${JSON.stringify(data)};\nif(window.loadEcomData) loadEcomData(window.__ECOM_DATA__);\n</script>\n`;
  html = html.replace('</body>', injection + '</body>');

  return html;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    if (url.pathname === '/' || url.pathname === '/index.html') {
      const forceRefresh = url.searchParams.get('refresh') === '1';
      const data = await getData(forceRefresh);
      const html = buildHTML(data);

      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache'
      });
      res.end(html);
      return;
    }

    // ── Config API ───────────────────────────────────────────
    if (url.pathname === '/api/config' && req.method === 'GET') {
      const cfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
      // 脱敏：token 只返回前8位
      const safe = JSON.parse(JSON.stringify(cfg));
      if (safe.shopify?.access_token) safe.shopify.access_token_masked = safe.shopify.access_token.slice(0,8)+'...';
      if (safe.ali1688?.cookie) safe.ali1688.cookie_set = true, delete safe.ali1688.cookie;
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(safe));
      return;
    }

    if (url.pathname === '/api/config' && req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        try {
          const updates = JSON.parse(body);
          const cfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
          // 深度合并（只允许白名单字段）
          const allowed = ['shopify','ali1688','notifications','alerts','report','tavily'];
          for (const key of allowed) {
            if (updates[key]) cfg[key] = { ...cfg[key], ...updates[key] };
          }
          writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      });
      return;
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST', 'Access-Control-Allow-Headers': 'Content-Type' });
      res.end(); return;
    }

    if (url.pathname === '/api/data') {
      const forceRefresh = url.searchParams.get('refresh') === '1';
      const data = await getData(forceRefresh);

      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache'
      });
      res.end(JSON.stringify(data));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  } catch (err) {
    console.error('❌ 请求处理失败：', err.message);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error: ' + err.message);
  }
});

// 启动服务器
server.listen(PORT, () => {
  console.log(`🦞 电商龙虾 Dashboard 服务器已启动`);
  console.log(`📊 访问地址：http://localhost:${PORT}`);
  console.log(`🔄 数据每 5 分钟自动刷新（或访问 ?refresh=1 强制刷新）`);
  console.log('');

  // 首次加载数据
  fetchDashboardData().catch(err => {
    console.error('⚠️  首次数据加载失败：', err.message);
    console.error('   Dashboard 仍可访问，数据将在下次请求时重试');
  });
});

// 定时刷新
setInterval(() => {
  fetchDashboardData().catch(err => {
    console.error('⚠️  定时刷新失败：', err.message);
  });
}, REFRESH_INTERVAL);
