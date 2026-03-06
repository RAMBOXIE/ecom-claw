/**
 * 有赞开放平台 API Connector
 * 电商龙虾 — 有赞数据层（完整实现）
 *
 * 有赞开放平台：https://open.youzanyun.com/
 * 认证方式：Bearer Token（config.youzan.access_token）
 * API 签名：MD5
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import crypto from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, '..', 'config.json');

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error('config.json not found');
  }
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  if (!config.youzan || !config.youzan.access_token) {
    throw new Error('有赞配置缺失：请在 config.json 中添加 youzan.access_token');
  }
  return config;
}

/**
 * 有赞 API 签名（MD5）
 * 将所有参数按 key 排序后拼接 key+value，加上 secret 做 MD5
 */
function sign(params, secret) {
  const keys = Object.keys(params).sort();
  let str = '';
  for (const key of keys) {
    const val = params[key];
    if (val !== undefined && val !== null && val !== '') {
      str += key + (typeof val === 'object' ? JSON.stringify(val) : String(val));
    }
  }
  str = secret + str + secret;
  return crypto.createHash('md5').update(str, 'utf8').digest('hex').toLowerCase();
}

function youzanFetch(apiName, apiVersion, params = {}) {
  return new Promise((resolve, reject) => {
    const config = loadConfig();
    const token = config.youzan.access_token;
    const secret = config.youzan.client_secret || '';

    // 如果配置了 client_secret，添加签名
    const requestParams = { ...params };
    if (secret) {
      requestParams.sign = sign(params, secret);
    }

    const postData = JSON.stringify(requestParams);
    const urlPath = `/api/${apiName}/${apiVersion}?access_token=${encodeURIComponent(token)}`;

    const options = {
      hostname: 'open.youzanyun.com',
      port: 443,
      path: urlPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Authorization': `Bearer ${token}`
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (data.error_response) {
            reject(new Error(`有赞 API 错误: ${data.error_response.msg || data.error_response.code || JSON.stringify(data.error_response)}`));
          } else {
            resolve(data.response || data);
          }
        } catch {
          reject(new Error(`有赞 API 解析失败: ${body.substring(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('有赞 API 请求超时')); });
    req.write(postData);
    req.end();
  });
}

// ─── 连接测试 ─────────────────────────────────────────

/** 连接测试 — 调用 youzan.shop.basic.get，返回店铺名 */
export async function testConnection() {
  try {
    let result;
    try {
      result = await youzanFetch('youzan.shop.basic.get', '3.0.0');
    } catch {
      // 降级尝试 youzan.shop.get
      result = await youzanFetch('youzan.shop.get', '3.0.0');
    }

    const shop = result?.shop || result;
    return {
      ok: true,
      platform: 'youzan',
      shop_name: shop.name || shop.shop_name || '有赞店铺',
      shop_id: shop.id || shop.shop_id || shop.kdt_id
    };
  } catch (err) {
    return { ok: false, platform: 'youzan', error: err.message };
  }
}

// ─── 订单 ─────────────────────────────────────────────

/** 获取订单列表 — 调用 youzan.trades.sold.get */
export async function getOrders(params = {}) {
  const { status, start_created, end_created, page_no = 1, page_size = 50 } = params;

  const apiParams = { page_no, page_size };
  if (status) apiParams.status = status;
  if (start_created) apiParams.start_created = start_created;
  if (end_created) apiParams.end_created = end_created;

  const result = await youzanFetch('youzan.trades.sold.get', '4.0.0', apiParams);
  return result?.trades || [];
}

// ─── 商品 ─────────────────────────────────────────────

/** 获取商品列表 — 调用 youzan.items.inventory.get */
export async function getProducts(params = {}) {
  const { page_no = 1, page_size = 50 } = params;

  let result;
  try {
    result = await youzanFetch('youzan.items.inventory.get', '3.0.0', {
      page_no,
      page_size
    });
  } catch {
    // 降级尝试 youzan.items.onsale.get
    result = await youzanFetch('youzan.items.onsale.get', '3.0.0', {
      page_no,
      page_size
    });
  }
  return result?.items || [];
}

// ─── 销售汇总 ─────────────────────────────────────────

/** 汇总当日有赞订单数据 */
export async function getDailySummary(dateStr) {
  const date = dateStr ? new Date(dateStr) : new Date();
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);

  // 有赞时间格式: yyyy-MM-dd HH:mm:ss
  const fmt = d => {
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  const orders = await getOrders({
    start_created: fmt(start),
    end_created: fmt(end),
    page_size: 100
  });

  const paidOrders = orders.filter(o =>
    o.status === 'WAIT_SELLER_SEND_GOODS' ||
    o.status === 'WAIT_BUYER_CONFIRM_GOODS' ||
    o.status === 'TRADE_SUCCESS'
  );

  const totalRevenue = paidOrders.reduce((sum, o) => sum + parseFloat(o.payment || o.total_fee || 0), 0);
  const totalOrders = paidOrders.length;
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  // 商品销量统计
  const productSales = {};
  for (const order of paidOrders) {
    for (const item of order.orders || []) {
      const key = item.title || item.item_name || '未知商品';
      if (!productSales[key]) productSales[key] = { qty: 0, revenue: 0 };
      productSales[key].qty += parseInt(item.num || 1);
      productSales[key].revenue += parseFloat(item.payment || item.total_fee || 0);
    }
  }

  const topProducts = Object.entries(productSales)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 5)
    .map(([name, data]) => ({ name, qty: data.qty, revenue: data.revenue.toFixed(2) }));

  return {
    platform: 'youzan',
    date: date.toISOString().split('T')[0],
    totalOrders,
    totalRevenue: totalRevenue.toFixed(2),
    avgOrderValue: avgOrderValue.toFixed(2),
    currency: 'CNY',
    topProducts,
    pendingCount: orders.filter(o => o.status === 'WAIT_SELLER_SEND_GOODS').length
  };
}

// ─── 库存 ─────────────────────────────────────────────

/** 检查有赞商品库存 */
export async function getLowStockProducts(threshold = 10) {
  const products = await getProducts({ page_size: 100 });
  const lowStock = [];

  for (const item of products) {
    const skus = item.skus || [];
    for (const sku of skus) {
      const qty = parseInt(sku.quantity || sku.stock_num || 0);
      if (qty <= threshold) {
        lowStock.push({
          productId: item.item_id || item.id,
          productTitle: item.title,
          variantTitle: sku.properties_name_json || sku.sku_id || 'Default',
          sku: sku.sku_no || '',
          quantity: qty
        });
      }
    }
    // 单品无 SKU 时检查总库存
    if (skus.length === 0 && item.quantity !== undefined) {
      const qty = parseInt(item.quantity || 0);
      if (qty <= threshold) {
        lowStock.push({
          productId: item.item_id || item.id,
          productTitle: item.title,
          variantTitle: 'Default',
          sku: '',
          quantity: qty
        });
      }
    }
  }

  return lowStock;
}
