/**
 * 🏪 店铺运营 — 物流与履约
 * modules/store/logistics.mjs
 *
 * CLI：
 *   node modules/store/logistics.mjs track      --order-id ID
 *   node modules/store/logistics.mjs list        --order-id ID
 *   node modules/store/logistics.mjs update      --order-id ID --fulfillment-id ID --tracking NUM [--company 顺丰] [--url https://...]
 *   node modules/store/logistics.mjs cancel      --order-id ID --fulfillment-id ID [--confirm]
 *   node modules/store/logistics.mjs zones
 *   node modules/store/logistics.mjs services
 *
 * 导出：trackOrder / listFulfillments / updateTracking / cancelFulfillment / getShippingZones / getFulfillmentServices
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

async function shopify() { return import(`${ROOT}/connectors/shopify.js`); }
async function audit()   { return import(`${ROOT}/audit/logger.mjs`); }

// ─── 核心操作 ──────────────────────────────────────────────────

/** 获取订单追踪摘要 */
export async function trackOrder(orderId) {
  const s = await shopify();
  const [order, fulfillments] = await Promise.all([
    s.getOrder(orderId),
    s.getTrackingSummary(orderId),
  ]);
  const o = order.order || order;
  return {
    order_id:          o.id,
    order_name:        o.name,
    fulfillment_status: o.fulfillment_status,
    financial_status:  o.financial_status,
    customer:          o.email || o.shipping_address?.name,
    shipping_address:  o.shipping_address
      ? `${o.shipping_address.address1}, ${o.shipping_address.city}, ${o.shipping_address.country}`
      : null,
    fulfillments: fulfillments.map(f => ({
      id:               f.id,
      status:           f.status,
      shipment_status:  f.shipment_status,
      tracking_number:  f.tracking_number,
      tracking_company: f.tracking_company,
      tracking_url:     f.tracking_url,
      created_at:       f.created_at?.slice(0, 10),
      items:            f.line_items,
    })),
  };
}

/** 列出订单所有履约记录 */
export async function listFulfillments(orderId) {
  const s = await shopify();
  const fulfillments = await s.getOrderFulfillments(orderId);
  return fulfillments.map(f => ({
    id:               f.id,
    status:           f.status,
    shipment_status:  f.shipment_status,
    tracking_number:  f.tracking_number,
    tracking_company: f.tracking_company,
    tracking_url:     f.tracking_url,
    line_items:       (f.line_items || []).map(li => ({ id: li.id, name: li.name, quantity: li.quantity })),
    created_at:       f.created_at,
  }));
}

/** 更新物流追踪信息 */
export async function updateTracking(orderId, fulfillmentId, { trackingNumber, trackingCompany, trackingUrl } = {}) {
  if (!trackingNumber) throw new Error('--tracking 必填');
  const s = await shopify();
  const l = await audit();
  const result = await s.updateFulfillmentTracking(orderId, fulfillmentId, { trackingNumber, trackingCompany, trackingUrl });
  await l.logAction('logistics.update_tracking', { order_id: orderId, fulfillment_id: fulfillmentId, tracking: trackingNumber });
  return {
    id:               result.id,
    status:           result.status,
    tracking_number:  result.tracking_number,
    tracking_company: result.tracking_company,
    tracking_url:     result.tracking_url,
  };
}

/** 取消履约（需确认） */
export async function cancelFulfillment(orderId, fulfillmentId, { confirm = false } = {}) {
  if (!confirm) {
    return {
      requiresConfirm: true,
      action: 'cancel_fulfillment',
      order_id: orderId,
      fulfillment_id: fulfillmentId,
      message: '加 --confirm 确认取消履约',
    };
  }
  const s = await shopify();
  const l = await audit();
  const result = await s.cancelFulfillment(orderId, fulfillmentId);
  await l.logAction('logistics.cancel_fulfillment', { order_id: orderId, fulfillment_id: fulfillmentId });
  return { cancelled: true, fulfillment_id: fulfillmentId, result };
}

/** 获取配送区域与运费规则 */
export async function getShippingZones() {
  const s = await shopify();
  const zones = await s.getShippingZones();
  return zones.map(z => ({
    id:      z.id,
    name:    z.name,
    countries: (z.countries || []).map(c => c.name),
    weight_based_shipping_rates: (z.weight_based_shipping_rates || []).map(r => ({
      name:       r.name,
      price:      r.price,
      weight_low: r.weight_low,
      weight_high: r.weight_high,
    })),
    price_based_shipping_rates: (z.price_based_shipping_rates || []).map(r => ({
      name:            r.name,
      price:           r.price,
      min_order_subtotal: r.min_order_subtotal,
      max_order_subtotal: r.max_order_subtotal,
    })),
  }));
}

/** 获取履约服务列表 */
export async function getFulfillmentServices() {
  const s = await shopify();
  const services = await s.getFulfillmentServices();
  return services.map(sv => ({
    id:             sv.id,
    name:           sv.name,
    handle:         sv.handle,
    fulfillment_orders_opt_in: sv.fulfillment_orders_opt_in,
    tracking_support: sv.tracking_support,
    inventory_management: sv.inventory_management,
  }));
}

// ─── CLI 入口 ──────────────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith('logistics.mjs')) {
  const args = process.argv.slice(2);
  const cmd  = args[0];
  const has  = f => args.includes(f);
  const get  = f => { const i = args.indexOf(f); return i !== -1 ? args[i+1] : null; };

  async function run() {
    let result;
    switch (cmd) {
      case 'track':
        result = await trackOrder(get('--order-id'));
        break;
      case 'list':
        result = await listFulfillments(get('--order-id'));
        break;
      case 'update':
        result = await updateTracking(get('--order-id'), get('--fulfillment-id'), {
          trackingNumber:  get('--tracking'),
          trackingCompany: get('--company'),
          trackingUrl:     get('--url'),
        });
        break;
      case 'cancel':
        result = await cancelFulfillment(get('--order-id'), get('--fulfillment-id'), { confirm: has('--confirm') });
        break;
      case 'zones':
        result = await getShippingZones();
        break;
      case 'services':
        result = await getFulfillmentServices();
        break;
      default:
        console.log(`
🚚 物流与履约管理

  track    --order-id ID                          订单追踪摘要（含所有包裹）
  list     --order-id ID                          列出履约记录
  update   --order-id ID --fulfillment-id ID      更新物流单号
           --tracking NUM [--company 顺丰] [--url https://...]
  cancel   --order-id ID --fulfillment-id ID      取消履约（加 --confirm）
  zones                                           配送区域与运费规则
  services                                        第三方履约服务列表
        `);
        return;
    }
    console.log(JSON.stringify(result, null, 2));
    console.log(`\n__JSON_OUTPUT__ ${JSON.stringify({ ok: true, action: cmd, data: result })}`);
  }
  run().catch(e => { console.error('❌', e.message); process.exit(1); });
}
