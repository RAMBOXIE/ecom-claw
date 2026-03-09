/**
 * WooCommerce REST API Connector
 * 电商龙虾 — WooCommerce 数据层
 *
 * 兼容 WooCommerce REST API v3（WordPress 独立站）
 * 接口与 shopify.js 保持一致，脚本层可无缝切换。
 *
 * 认证：Consumer Key + Consumer Secret（Basic Auth）
 * 配置：config.json → woocommerce.site_url / consumer_key / consumer_secret
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, '..', 'config.json');

// ─── 内部工具 ──────────────────────────────────────────────

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error('config.json not found. Run node setup.mjs to configure.');
  }
  const cfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  if (!cfg.woocommerce?.site_url) {
    throw new Error('WooCommerce not configured. Add woocommerce section to config.json.');
  }
  return cfg;
}

function getBase(config) {
  const { site_url, version = 'v3' } = config.woocommerce;
  return `${site_url.replace(/\/$/, '')}/wp-json/wc/${version}`;
}

function getAuth(config) {
  const { consumer_key, consumer_secret } = config.woocommerce;
  return 'Basic ' + Buffer.from(`${consumer_key}:${consumer_secret}`).toString('base64');
}

async function wcFetch(endpoint, params = {}) {
  const config = loadConfig();
  const base = getBase(config);
  const auth = getAuth(config);

  const url = new URL(`${base}${endpoint}`);
  // WooCommerce 默认 per_page=10，改为 100
  if (!params.per_page) params.per_page = 100;
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: {
      'Authorization': auth,
      'Content-Type': 'application/json'
    }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WooCommerce API error ${res.status}: ${text}`);
  }
  return res.json();
}

async function wcPost(endpoint, body) {
  const config = loadConfig();
  const base = getBase(config);
  const auth = getAuth(config);

  const res = await fetch(`${base}${endpoint}`, {
    method: 'POST',
    headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WooCommerce API error ${res.status}: ${text}`);
  }
  return res.json();
}

async function wcPut(endpoint, body) {
  const config = loadConfig();
  const base = getBase(config);
  const auth = getAuth(config);

  const res = await fetch(`${base}${endpoint}`, {
    method: 'PUT',
    headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WooCommerce API error ${res.status}: ${text}`);
  }
  return res.json();
}

// ─── 订单 ──────────────────────────────────────────────────

/**
 * 获取最近 N 小时内的订单
 * 接口对齐 shopify.js: getRecentOrders(hoursAgo)
 */
export async function getRecentOrders(hoursAgo = 1) {
  const after = new Date(Date.now() - hoursAgo * 3600 * 1000).toISOString();
  return wcFetch('/orders', { after, orderby: 'date', order: 'desc' });
}

/**
 * 通用订单查询
 * @param {Object} params - WooCommerce /orders 支持的参数
 *   status: pending|processing|on-hold|completed|cancelled|refunded|failed
 *   after/before: ISO 日期
 *   per_page: 每页数量（最大100）
 *   page: 页码
 */
export async function getOrders(params = {}) {
  return wcFetch('/orders', params);
}

/**
 * 获取单条订单
 */
export async function getOrderById(id) {
  return wcFetch(`/orders/${id}`);
}

/**
 * 标记订单发货
 * WooCommerce 无原生发货 API，通过：
 * 1. 更新订单状态为 completed
 * 2. 添加订单备注（包含物流单号）
 */
export async function fulfillOrder(orderId, trackingNumber, company) {
  // 更新状态
  await wcPut(`/orders/${orderId}`, { status: 'completed' });

  // 添加备注
  const note = `已发货 | 快递：${company} | 单号：${trackingNumber}`;
  await wcPost(`/orders/${orderId}/notes`, {
    note,
    customer_note: true  // true = 通知买家
  });

  return { orderId, trackingNumber, company, status: 'completed' };
}

/**
 * 退款
 * @param {string|number} orderId
 * @param {number} amount - 退款金额
 * @param {string} reason - 退款原因
 */
export async function refundOrder(orderId, amount, reason = '') {
  return wcPost(`/orders/${orderId}/refunds`, {
    amount: String(amount),
    reason,
    api_refund: false  // false = 不自动退支付渠道（手动退款）
  });
}

// ─── 商品 ──────────────────────────────────────────────────

/**
 * 获取商品列表
 * @param {Object} params - status: publish|draft|private / per_page / page
 */
export async function getProducts(params = {}) {
  return wcFetch('/products', params);
}

/**
 * 获取单个商品
 */
export async function getProductById(id) {
  return wcFetch(`/products/${id}`);
}

/**
 * 创建商品
 * @param {Object} data
 *   name, type(simple/variable), status(publish/draft)
 *   regular_price, sale_price
 *   description, short_description
 *   sku, stock_quantity, manage_stock
 *   images: [{src: url}]
 *   tags: [{name}], categories: [{id}]
 */
export async function createProduct(data) {
  return wcPost('/products', data);
}

/**
 * 更新商品
 */
export async function updateProduct(id, data) {
  return wcPut(`/products/${id}`, data);
}

/**
 * 获取商品变体
 */
export async function getVariants(productId) {
  return wcFetch(`/products/${productId}/variations`, { per_page: 100 });
}

/**
 * 更新变体
 */
export async function updateVariant(productId, variantId, data) {
  return wcPut(`/products/${productId}/variations/${variantId}`, data);
}

// ─── 库存 ──────────────────────────────────────────────────

/**
 * 获取库存（WooCommerce 库存直接在商品/变体上）
 * 返回格式统一为 [{productId, productTitle, sku, stock}]
 */
export async function getInventoryLevels() {
  const products = await getProducts({ per_page: 100, status: 'publish' });
  const result = [];

  for (const p of products) {
    if (p.type === 'simple') {
      result.push({
        productId: p.id,
        productTitle: p.name,
        sku: p.sku,
        stock: p.stock_quantity,
        manageStock: p.manage_stock
      });
    } else if (p.type === 'variable') {
      const variants = await getVariants(p.id);
      for (const v of variants) {
        result.push({
          productId: p.id,
          variantId: v.id,
          productTitle: p.name,
          variantName: v.attributes.map(a => a.option).join(' / '),
          sku: v.sku,
          stock: v.stock_quantity,
          manageStock: v.manage_stock
        });
      }
    }
  }
  return result;
}

/**
 * 更新库存数量
 */
export async function updateInventory(productId, quantity, variantId = null) {
  if (variantId) {
    return wcPut(`/products/${productId}/variations/${variantId}`, {
      manage_stock: true,
      stock_quantity: quantity
    });
  }
  return wcPut(`/products/${productId}`, {
    manage_stock: true,
    stock_quantity: quantity
  });
}

// ─── 客户 ──────────────────────────────────────────────────

/**
 * 获取客户列表
 */
export async function getCustomers(params = {}) {
  return wcFetch('/customers', params);
}

// ─── 图片 ──────────────────────────────────────────────────

/**
 * 关联图片到商品（通过外部 URL）
 * WooCommerce 支持直接用 src URL，无需 base64
 * 注意：图片需公网可访问
 */
export async function uploadImage(productId, imageUrl, alt = '') {
  const product = await getProductById(productId);
  const images = product.images || [];
  images.push({ src: imageUrl, alt });
  return wcPut(`/products/${productId}`, { images });
}

// ─── 店铺信息 ──────────────────────────────────────────────

/**
 * 获取店铺基础信息
 * 需要 WordPress Site API（/wp-json/）
 */
export async function getShopInfo() {
  const config = loadConfig();
  const base = config.woocommerce.site_url.replace(/\/$/, '');

  const res = await fetch(`${base}/wp-json/`, {
    headers: { 'Authorization': getAuth(config) }
  });
  const site = await res.json();

  // 同时拉 WC 设置
  const settings = await wcFetch('/settings/general');
  const currency = settings.find(s => s.id === 'woocommerce_currency')?.value || 'USD';
  const timezone = settings.find(s => s.id === 'woocommerce_default_country')?.value || '';

  return {
    name: site.name,
    description: site.description,
    url: site.url,
    currency,
    timezone
  };
}

// ─── 工具函数 ──────────────────────────────────────────────

/**
 * 测试连接
 */
export async function testConnection() {
  try {
    const info = await getShopInfo();
    return { ok: true, shop: info };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * 将 WooCommerce 订单状态映射为统一状态
 */
export function normalizeOrderStatus(wcStatus) {
  const map = {
    'pending':    'pending_payment',
    'processing': 'paid',
    'on-hold':    'on_hold',
    'completed':  'fulfilled',
    'cancelled':  'cancelled',
    'refunded':   'refunded',
    'failed':     'failed'
  };
  return map[wcStatus] || wcStatus;
}
