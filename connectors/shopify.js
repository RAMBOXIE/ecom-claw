/**
 * Shopify Admin API Connector
 * 电商龙虾 — Shopify 数据层
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, '..', 'config.json');

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    const tplPath = join(__dirname, '..', 'config.template.json');
    throw new Error(`config.json not found. Copy ${tplPath} to config.json and fill in your Shopify credentials.`);
  }
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
}

function getShopifyBase(config) {
  const { shop_domain, api_version } = config.shopify;
  return `https://${shop_domain}/admin/api/${api_version}`;
}

async function shopifyFetch(endpoint, params = {}) {
  const config = loadConfig();
  const base = getShopifyBase(config);
  const token = config.shopify.access_token;

  const url = new URL(`${base}${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json'
    }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify API error ${res.status}: ${text}`);
  }
  return res.json();
}

async function shopifyPut(endpoint, body) {
  const config = loadConfig();
  const base = getShopifyBase(config);
  const token = config.shopify.access_token;

  const res = await fetch(`${base}${endpoint}`, {
    method: 'PUT',
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify API error ${res.status}: ${text}`);
  }
  return res.json();
}

async function shopifyPost(endpoint, body) {
  const config = loadConfig();
  const base = getShopifyBase(config);
  const token = config.shopify.access_token;

  const res = await fetch(`${base}${endpoint}`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify API error ${res.status}: ${text}`);
  }
  return res.json();
}

// ─── 订单 ───────────────────────────────────────────────

/** 获取订单列表 */
export async function getOrders({ status = 'any', limit = 50, created_at_min, created_at_max } = {}) {
  const data = await shopifyFetch('/orders.json', { status, limit, created_at_min, created_at_max });
  return data.orders;
}

/** 获取单个订单 */
export async function getOrder(orderId) {
  const data = await shopifyFetch(`/orders/${orderId}.json`);
  return data.order;
}

/** 获取今日订单 */
export async function getTodayOrders() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  return getOrders({ status: 'any', limit: 250, created_at_min: todayStart });
}

/** 获取最近N小时内的新订单 */
export async function getRecentOrders(hours = 1) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  return getOrders({ status: 'any', limit: 50, created_at_min: since });
}

/** 今日销售汇总 */
export async function getDailySummary(dateStr) {
  const date = dateStr ? new Date(dateStr) : new Date();
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString();
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).toISOString();

  const orders = await getOrders({ status: 'any', limit: 250, created_at_min: start, created_at_max: end });

  const paidOrders = orders.filter(o => o.financial_status === 'paid' || o.financial_status === 'partially_paid');
  const totalRevenue = paidOrders.reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0);
  const totalOrders = paidOrders.length;
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const currency = paidOrders[0]?.currency || 'USD';

  // 商品销量统计
  const productSales = {};
  for (const order of paidOrders) {
    for (const item of order.line_items || []) {
      const key = item.title;
      productSales[key] = (productSales[key] || 0) + item.quantity;
    }
  }
  const topProducts = Object.entries(productSales)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, qty]) => ({ name, qty }));

  // 待处理订单
  const pendingOrders = orders.filter(o => o.fulfillment_status === null || o.fulfillment_status === 'unfulfilled');

  return {
    date: date.toISOString().split('T')[0],
    totalOrders,
    totalRevenue: totalRevenue.toFixed(2),
    avgOrderValue: avgOrderValue.toFixed(2),
    currency,
    topProducts,
    pendingCount: pendingOrders.length,
    allOrders: orders
  };
}

// ─── 商品 ───────────────────────────────────────────────

/** 获取商品列表 */
export async function getProducts({ limit = 50, status = 'active' } = {}) {
  const data = await shopifyFetch('/products.json', { limit, status });
  return data.products;
}

/** 获取单个商品 */
export async function getProduct(productId) {
  const data = await shopifyFetch(`/products/${productId}.json`);
  return data.product;
}

/** 创建商品 */
export async function createProduct(productData) {
  const data = await shopifyPost('/products.json', { product: productData });
  return data.product;
}

/** 更新商品（价格/标题/描述等） */
export async function updateProduct(productId, updates) {
  const data = await shopifyPut(`/products/${productId}.json`, { product: { id: productId, ...updates } });
  return data.product;
}

/** 更新变体价格 */
export async function updateVariantPrice(variantId, price, comparePrice) {
  const body = { variant: { id: variantId, price: String(price) } };
  if (comparePrice !== undefined) body.variant.compare_at_price = comparePrice ? String(comparePrice) : null;
  const data = await shopifyPut(`/variants/${variantId}.json`, body);
  return data.variant;
}

/** 批量更新价格 */
export async function bulkUpdatePrices(updates) {
  const results = [];
  for (const { variantId, price, comparePrice } of updates) {
    const result = await updateVariantPrice(variantId, price, comparePrice);
    results.push(result);
  }
  return results;
}

/** 添加商品图片 */
/** 下载图片到 Buffer（跟随重定向） */
function downloadImageBuffer(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Too many redirects'));
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadImageBuffer(res.headers.location, redirects + 1).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ buffer: Buffer.concat(chunks), contentType: res.headers['content-type'] || 'image/jpeg' }));
    }).on('error', reject);
  });
}

/**
 * 上传商品图片（自动用 base64 方案，兼容 Trial 账号）
 * @param {string|number} productId - Shopify 商品 ID
 * @param {string} imageUrl - 图片 URL（会先下载再 base64 上传）
 * @param {string} [alt] - 图片 alt 文字
 * @param {number} [position] - 图片排序位置
 */
export async function uploadProductImage(productId, imageUrl, alt = '', position = 1) {
  const { buffer, contentType } = await downloadImageBuffer(imageUrl);
  const ext = contentType.includes('png') ? 'png' : contentType.includes('gif') ? 'gif' : 'jpg';
  const data = await shopifyPost(`/products/${productId}/images.json`, {
    image: {
      attachment: buffer.toString('base64'),
      filename: `product-${productId}-${position}.${ext}`,
      alt,
      position,
    }
  });
  return data.image;
}

// ─── 库存 ───────────────────────────────────────────────

/** 获取库存水位（低库存预警用） */
export async function getLowStockProducts(threshold) {
  const config = loadConfig();
  const minQty = threshold ?? config.alerts?.low_stock_threshold ?? 10;

  const products = await getProducts({ limit: 250, status: 'active' });
  const lowStock = [];

  for (const product of products) {
    for (const variant of product.variants || []) {
      if (variant.inventory_management === 'shopify' && variant.inventory_quantity <= minQty) {
        lowStock.push({
          productId: product.id,
          productTitle: product.title,
          variantId: variant.id,
          variantTitle: variant.title,
          sku: variant.sku,
          quantity: variant.inventory_quantity
        });
      }
    }
  }
  return lowStock;
}

/** 更新库存数量 */
export async function updateInventory(inventoryItemId, locationId, newQuantity) {
  const data = await shopifyPut('/inventory_levels/set.json', {
    inventory_item_id: inventoryItemId,
    location_id: locationId,
    available: newQuantity
  });
  return data.inventory_level;
}

// ─── 客户 ───────────────────────────────────────────────

/** 获取客户列表 */
export async function getCustomers({ limit = 50 } = {}) {
  const data = await shopifyFetch('/customers.json', { limit });
  return data.customers;
}

// ─── 店铺信息 ─────────────────────────────────────────

/** 获取店铺基本信息 */
export async function getShopInfo() {
  const data = await shopifyFetch('/shop.json');
  return data.shop;
}

/** 连接测试 */
export async function testConnection() {
  try {
    const shop = await getShopInfo();
    return { ok: true, shop_name: shop.name, domain: shop.domain, currency: shop.currency };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ─── 发货 & 退款 ─────────────────────────────────────────

/** 获取仓库地点列表 */
export async function getLocations() {
  const data = await shopifyFetch('/locations.json');
  return data.locations;
}

/** 获取所有待发货订单 */
export async function getUnfulfilledOrders() {
  const data = await shopifyFetch('/orders.json', { fulfillment_status: 'unfulfilled', status: 'open', limit: 250 });
  return data.orders;
}

/** 创建发货记录 */
export async function fulfillOrder(orderId, trackingNumber, trackingCompany, lineItems) {
  // 先获取 fulfillment orders
  const foData = await shopifyFetch(`/orders/${orderId}/fulfillment_orders.json`);
  const fulfillmentOrders = foData.fulfillment_orders || [];
  const openFO = fulfillmentOrders.find(fo => fo.status === 'open' || fo.status === 'in_progress');
  if (!openFO) throw new Error(`订单 ${orderId} 无可发货的 fulfillment order`);

  const fulfillmentLineItems = lineItems
    ? lineItems.map(li => ({ id: li.id, quantity: li.quantity }))
    : openFO.line_items.map(li => ({ id: li.id, quantity: li.fulfillable_quantity }));

  const body = {
    fulfillment: {
      line_items_by_fulfillment_order: [{
        fulfillment_order_id: openFO.id,
        fulfillment_order_line_items: fulfillmentLineItems
      }],
      tracking_info: {
        number: trackingNumber,
        company: trackingCompany
      },
      notify_customer: true
    }
  };

  const data = await shopifyPost('/fulfillments.json', body);
  return data.fulfillment;
}

/** 创建退款 */
export async function createRefund(orderId, amount, reason) {
  // 先计算退款
  const calcBody = { refund: { currency: 'USD', shipping: { amount: '0.00' } } };
  const calcData = await shopifyPost(`/orders/${orderId}/refunds/calculate.json`, calcBody);

  const body = {
    refund: {
      currency: calcData.refund?.currency || 'USD',
      notify: true,
      note: reason || '退款',
      transactions: [{
        parent_id: calcData.refund?.transactions?.[0]?.parent_id,
        amount: String(amount),
        kind: 'refund',
        gateway: calcData.refund?.transactions?.[0]?.gateway || 'manual'
      }]
    }
  };

  const data = await shopifyPost(`/orders/${orderId}/refunds.json`, body);
  return data.refund;
}

// ─── 客户（扩展） ─────────────────────────────────────────

/** 搜索客户 */
export async function searchCustomers(query) {
  const data = await shopifyFetch('/customers/search.json', { query, limit: 250 });
  return data.customers;
}

/** 获取客户订单 */
export async function getCustomerOrders(customerId) {
  const data = await shopifyFetch(`/customers/${customerId}/orders.json`, { status: 'any', limit: 250 });
  return data.orders;
}

// ─── 折扣码 / 价格规则 ────────────────────────────────────

/** 创建价格规则 */
export async function createPriceRule(ruleData) {
  const data = await shopifyPost('/price_rules.json', { price_rule: ruleData });
  return data.price_rule;
}

/** 创建折扣码 */
export async function createDiscountCode(priceRuleId, code) {
  const data = await shopifyPost(`/price_rules/${priceRuleId}/discount_codes.json`, {
    discount_code: { code }
  });
  return data.discount_code;
}

/** 获取所有价格规则 */
export async function getPriceRules() {
  const data = await shopifyFetch('/price_rules.json');
  return data.price_rules;
}

/** 删除价格规则 */
export async function deletePriceRule(ruleId) {
  const config = loadConfig();
  const base = getShopifyBase(config);
  const token = config.shopify.access_token;

  const res = await fetch(`${base}/price_rules/${ruleId}.json`, {
    method: 'DELETE',
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json'
    }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify API error ${res.status}: ${text}`);
  }
  return true;
}

// ─── 订单扩展操作 ─────────────────────────────────────────

/** 取消订单 */
export async function cancelOrder(orderId, { reason = 'customer', email = true, restock = true } = {}) {
  const data = await shopifyPost(`/orders/${orderId}/cancel.json`, {
    reason,
    email,
    restock
  });
  return data.order;
}

/** 添加订单备注（内部，不通知买家） */
export async function addOrderNote(orderId, message, { notify = false } = {}) {
  // Shopify 使用 metafields 或 order notes，这里通过更新 note 字段
  const result = await shopifyPut(`/orders/${orderId}.json`, {
    order: { id: parseInt(orderId), note: message }
  });
  return result.order;
}

/** 获取订单事件（timeline） */
export async function getOrderEvents(orderId) {
  const data = await shopifyFetch(`/orders/${orderId}/events.json`);
  return data.events;
}

// ─── 草稿订单（补发/换货用） ──────────────────────────────

/** 创建草稿订单（用于补发、换货） */
export async function createDraftOrder(draftData) {
  const data = await shopifyPost('/draft_orders.json', { draft_order: draftData });
  return data.draft_order;
}

/** 获取草稿订单 */
export async function getDraftOrder(id) {
  const data = await shopifyFetch(`/draft_orders/${id}.json`);
  return data.draft_order;
}

/** 完成草稿订单（转为正式订单） */
export async function completeDraftOrder(id) {
  const data = await shopifyPut(`/draft_orders/${id}/complete.json`, {});
  return data.draft_order;
}

// ─── 变体管理 ──────────────────────────────────────────────

/** 获取商品所有变体 */
export async function getVariants(productId) {
  const data = await shopifyFetch(`/products/${productId}/variants.json`);
  return data.variants;
}

/** 更新变体 */
export async function updateVariant(variantId, updateData) {
  const result = await shopifyPut(`/variants/${variantId}.json`, { variant: { id: parseInt(variantId), ...updateData } });
  return result.variant;
}

/** 添加变体 */
export async function addVariant(productId, variantData) {
  const data = await shopifyPost(`/products/${productId}/variants.json`, { variant: variantData });
  return data.variant;
}

// ─── SEO / GEO 支持 ─────────────────────────────────────────

/** 通用 PUT 包装（供模块层调用） */
export async function shopifyPatch(endpoint, body) {
  return shopifyPut(endpoint, body);
}

/** 获取商品所有 Metafields */
export async function getProductMetafields(productId) {
  const data = await shopifyFetch(`/products/${productId}/metafields.json`);
  return data.metafields || [];
}

/**
 * 创建或更新 Metafield（upsert）
 * @param {string|number} productId
 * @param {{ namespace, key, value, type }} metafield
 */
export async function upsertProductMetafield(productId, { namespace, key, value, type = 'single_line_text_field' }) {
  // 先查是否已存在
  const existing = await getProductMetafields(productId);
  const found = existing.find(m => m.namespace === namespace && m.key === key);

  if (found) {
    // 更新
    const data = await shopifyPut(`/metafields/${found.id}.json`, {
      metafield: { id: found.id, value, type }
    });
    return data.metafield;
  } else {
    // 新建
    const data = await shopifyPost(`/products/${productId}/metafields.json`, {
      metafield: { namespace, key, value, type }
    });
    return data.metafield;
  }
}

/** 更新商品图片 Alt 文本 */
export async function updateImageAlt(productId, imageId, alt) {
  const data = await shopifyPut(`/products/${productId}/images/${imageId}.json`, {
    image: { id: parseInt(imageId), alt }
  });
  return data.image;
}
