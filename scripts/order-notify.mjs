/**
 * 新订单轮询通知
 * 电商龙虾 — 检查最近N分钟内的新订单，有则输出
 * 
 * 用法：node order-notify.mjs [minutes=30]
 */

import { getRecentOrders } from '../connectors/shopify.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(__dirname, '..', '.last-order-check.json');

const minutes = parseInt(process.argv[2] || '30');

function loadState() {
  if (!existsSync(STATE_FILE)) return { lastOrderId: null, lastCheckedAt: null };
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')); } catch { return { lastOrderId: null }; }
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state), 'utf8');
}

function formatOrder(order) {
  const items = (order.line_items || []).map(i => `${i.title} ×${i.quantity}`).join('、');
  const name = order.shipping_address?.name || order.billing_address?.name || order.email || '买家';
  const city = order.shipping_address?.city || '';
  const province = order.shipping_address?.province || '';
  const total = `${order.currency} ${order.total_price}`;
  const payStatus = order.financial_status === 'paid' ? '✅已付款' : `⏳${order.financial_status}`;

  return [
    `🛍️ **新订单 #${order.order_number}**`,
    `• 买家：${name}${city ? '（' + province + city + '）' : ''}`,
    `• 商品：${items}`,
    `• 金额：${total} ${payStatus}`,
    `• 时间：${new Date(order.created_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`
  ].join('\n');
}

async function run() {
  const state = loadState();
  const orders = await getRecentOrders(minutes / 60);

  // 过滤掉已通知过的订单
  const newOrders = state.lastOrderId
    ? orders.filter(o => o.id > state.lastOrderId)
    : orders;

  if (newOrders.length === 0) {
    console.log(`✅ 最近${minutes}分钟无新订单`);
    process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify({ newOrders: [], messages: [] }) + '\n');
    return;
  }

  // 更新状态
  const maxId = Math.max(...newOrders.map(o => o.id));
  saveState({ lastOrderId: maxId, lastCheckedAt: new Date().toISOString() });

  const messages = newOrders.map(formatOrder);
  messages.forEach(m => console.log('\n' + m));

  process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify({ newOrders, messages }) + '\n');
}

run().catch(err => {
  console.error('❌ 订单检查失败：', err.message);
  process.exit(1);
});
