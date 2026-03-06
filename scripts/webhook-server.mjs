/**
 * Webhook 服务器
 * 电商龙虾 — 接收 Shopify Webhook 事件
 *
 * 用法：
 *   node webhook-server.mjs
 *
 * 监听端口 3459
 * 路由：
 *   POST /webhooks/orders/create    — 新订单
 *   POST /webhooks/orders/updated   — 订单更新
 *   POST /webhooks/products/update  — 商品更新
 *   GET  /health                    — 健康检查
 */

import http from 'http';
import crypto from 'crypto';
import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, '..', 'config.json');
const DATA_DIR = join(__dirname, 'data');
const EVENTS_PATH = join(DATA_DIR, 'webhook-events.jsonl');
const PORT = 3459;

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function getWebhookSecret() {
  const config = loadConfig();
  return config.webhooks?.secret || '';
}

// ─── HMAC 签名验证 ───────────────────────────────────────

function verifyHmac(body, hmacHeader, secret) {
  if (!secret) return true; // 未配置 secret 则跳过验证
  if (!hmacHeader) return false;

  const computed = crypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('base64');

  return crypto.timingSafeEqual(
    Buffer.from(computed),
    Buffer.from(hmacHeader)
  );
}

// ─── 事件记录 ─────────────────────────────────────────────

function logEvent(topic, payload) {
  ensureDataDir();
  const event = {
    topic,
    receivedAt: new Date().toISOString(),
    payload
  };
  appendFileSync(EVENTS_PATH, JSON.stringify(event) + '\n', 'utf8');
}

// ─── 事件处理 ─────────────────────────────────────────────

function handleOrderCreate(payload) {
  const name = payload.name || payload.order_number || '?';
  const total = payload.total_price || '0';
  const currency = payload.currency || 'USD';
  const customer = payload.customer
    ? `${payload.customer.first_name || ''} ${payload.customer.last_name || ''}`.trim()
    : '未知';
  const itemCount = (payload.line_items || []).length;

  console.log(`🛒 新订单：${name} — ${currency} ${total}（${customer}，${itemCount} 个商品）`);
  logEvent('orders/create', payload);
}

function handleOrderUpdated(payload) {
  const name = payload.name || payload.order_number || '?';
  const status = payload.financial_status || '?';
  const fulfillment = payload.fulfillment_status || 'unfulfilled';

  console.log(`🔄 订单更新：${name} — 支付状态: ${status}，发货状态: ${fulfillment}`);
  logEvent('orders/updated', payload);
}

function handleProductUpdate(payload) {
  const title = payload.title || '?';
  const id = payload.id || '?';
  const status = payload.status || '?';
  const variants = (payload.variants || []).length;

  console.log(`📦 商品更新：${title}（ID: ${id}）— 状态: ${status}，${variants} 个变体`);
  logEvent('products/update', payload);
}

// ─── HTTP 服务器 ──────────────────────────────────────────

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const { method, url } = req;

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Shopify-Hmac-Sha256, X-Shopify-Topic');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ─── GET /health ────────────────────────────────
  if (method === 'GET' && url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'ecom-claw-webhook', port: PORT, uptime: process.uptime() }));
    return;
  }

  // ─── POST /webhooks/* ──────────────────────────
  if (method === 'POST' && url.startsWith('/webhooks/')) {
    const body = await readBody(req);
    const hmacHeader = req.headers['x-shopify-hmac-sha256'] || '';
    const secret = getWebhookSecret();

    // 验证 HMAC
    if (secret && !verifyHmac(body, hmacHeader, secret)) {
      console.log(`⚠️ HMAC 验证失败：${url}`);
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'HMAC verification failed' }));
      return;
    }

    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    const topic = url.replace('/webhooks/', '');

    switch (url) {
      case '/webhooks/orders/create':
        handleOrderCreate(payload);
        break;
      case '/webhooks/orders/updated':
        handleOrderUpdated(payload);
        break;
      case '/webhooks/products/update':
        handleProductUpdate(payload);
        break;
      default:
        console.log(`📨 收到未知 Webhook：${url}`);
        logEvent(topic, payload);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ received: true, topic }));
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

server.listen(PORT, () => {
  console.log(`🦞 电商龙虾 — Webhook 服务器已启动\n`);
  console.log(`📡 监听端口：${PORT}`);
  console.log(`🔗 地址：http://localhost:${PORT}\n`);
  console.log('路由：');
  console.log('  POST /webhooks/orders/create    — 新订单');
  console.log('  POST /webhooks/orders/updated   — 订单更新');
  console.log('  POST /webhooks/products/update  — 商品更新');
  console.log('  GET  /health                    — 健康检查');
  console.log('');
  console.log('─────────────────────────────────────');
  console.log('📋 **Shopify Webhook 注册步骤**：');
  console.log('');
  console.log('方法一：Shopify 后台手动添加');
  console.log('  1. 登录 Shopify 后台 → Settings → Notifications → Webhooks');
  console.log('  2. 点击 "Create webhook"');
  console.log('  3. 选择事件（如 Order creation），填入 URL');
  console.log('  4. 格式选 JSON');
  console.log('');
  console.log('方法二：使用 Shopify API');
  console.log('  POST /admin/api/2026-01/webhooks.json');
  console.log('  { "webhook": { "topic": "orders/create", "address": "https://your-domain/webhooks/orders/create", "format": "json" } }');
  console.log('');
  console.log('📡 **暴露本地端口到公网**（使用 ngrok）：');
  console.log('  1. 安装 ngrok：https://ngrok.com/download');
  console.log('  2. 运行：ngrok http 3459');
  console.log('  3. 将生成的 https://xxx.ngrok.io 作为 Webhook URL');
  console.log('  4. 示例：https://xxx.ngrok.io/webhooks/orders/create');
  console.log('');
  console.log('⏳ 等待 Webhook 事件...');
  console.log('─────────────────────────────────────');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ 端口 ${PORT} 已被占用`);
  } else {
    console.error('❌ 服务器错误：', err.message);
  }
  process.exit(1);
});
