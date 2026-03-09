/**
 * 🏪 店铺运营 — 订单处理
 * modules/store/orders.mjs
 *
 * CLI：
 *   node modules/store/orders.mjs list   [--status unfulfilled|any] [--limit 20]
 *   node modules/store/orders.mjs detail  --order-id ID
 *   node modules/store/orders.mjs fulfill --order-id ID --tracking NUM --company 顺丰
 *   node modules/store/orders.mjs refund  --order-id ID --amount 99 --reason "原因" [--confirm]
 *   node modules/store/orders.mjs cancel  --order-id ID [--reason customer] [--confirm]
 *   node modules/store/orders.mjs note    --order-id ID --message "备注"
 *   node modules/store/orders.mjs resend  --order-id ID [--confirm]
 *
 * 导出：listOrders / getOrderDetail / fulfillOrder / refundOrder / cancelOrder / addNote / resendOrder
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

// ─── 加载依赖 ──────────────────────────────────────────────────
async function shopify() { return import(`${ROOT}/connectors/shopify.js`); }
async function audit()   { return import(`${ROOT}/audit/logger.mjs`); }
async function approval(){ return import(`${ROOT}/audit/approval.mjs`); }

// ─── 风险检查（从 config 读取审批规则）─────────────────────────
import { readFileSync, existsSync } from 'fs';

function requiresApproval(action) {
  try {
    const cfg = JSON.parse(readFileSync(`${ROOT}/config.json`, 'utf8'));
    return (cfg.approval?.require || ['refund','cancel','bulk_price','discount_delete']).includes(action);
  } catch { return true; }
}

// ─── 核心 API ──────────────────────────────────────────────────

/** 列出订单 */
export async function listOrders({ status = 'unfulfilled', limit = 20 } = {}) {
  const s = await shopify();
  const orders = status === 'unfulfilled'
    ? await s.getUnfulfilledOrders()
    : await s.getOrders({ status, limit });

  return orders.map(o => ({
    id:          o.id,
    name:        o.name,
    status:      o.fulfillment_status || 'unfulfilled',
    financial:   o.financial_status,
    total:       o.total_price,
    currency:    o.currency,
    itemCount:   o.line_items?.length || 0,
    customer:    o.customer ? `${o.customer.first_name} ${o.customer.last_name}`.trim() : '访客',
    createdAt:   o.created_at,
    tags:        o.tags,
  }));
}

/** 订单详情 */
export async function getOrderDetail(orderId) {
  const s = await shopify();
  const o = await s.getOrder(orderId);
  return {
    id:         o.id,
    name:       o.name,
    status:     o.fulfillment_status,
    financial:  o.financial_status,
    total:      o.total_price,
    currency:   o.currency,
    customer:   o.customer,
    lineItems:  o.line_items?.map(i => ({ id: i.id, title: i.title, qty: i.quantity, price: i.price, sku: i.sku })),
    shipping:   o.shipping_address,
    fulfillments: o.fulfillments,
    note:       o.note,
    tags:       o.tags,
    createdAt:  o.created_at,
  };
}

/** 发货（中风险，默认触发审批） */
export async function fulfillOrder(orderId, { trackingNumber, company, confirm = false } = {}) {
  const s = await shopify();
  const ap = await approval();
  const au = await audit();

  if (!confirm) {
    const order = await s.getOrder(orderId);
    const apRecord = await ap.requestApproval({
      action: 'fulfill',
      description: `发货订单 ${order.name}，运单号 ${trackingNumber}（${company}）`,
      params: { orderId, trackingNumber, company },
      command: `node ${ROOT}/scripts/order-manage.mjs fulfill --order-id ${orderId} --tracking-number ${trackingNumber} --company ${company} --confirm`,
      preview: { '订单': order.name, '运单号': trackingNumber, '快递': company },
    });
    return { pending: true, approvalId: apRecord.id, shortId: apRecord.id.slice(0,8) };
  }

  const order = await s.getOrder(orderId);
  const lineItemIds = order.line_items?.map(i => i.id) || [];
  const result = await s.fulfillOrder(orderId, trackingNumber, company, lineItemIds);
  await au.writeAuditLog({ action: 'fulfill', orderId, orderName: order.name, trackingNumber, company });
  return { ok: true, fulfillment: result };
}

/** 退款（高风险，必须审批） */
export async function refundOrder(orderId, { amount, reason = '客户申请', confirm = false } = {}) {
  const s = await shopify();
  const ap = await approval();
  const au = await audit();

  const order = await s.getOrder(orderId);

  // 检查退款阈值
  let threshold = 0;
  try {
    const cfg = JSON.parse(readFileSync(`${ROOT}/config.json`, 'utf8'));
    threshold = parseFloat(cfg.approval?.refund_threshold || 0);
  } catch {}

  const needsApproval = !confirm && (threshold === 0 || parseFloat(amount) >= threshold);

  if (needsApproval) {
    const apRecord = await ap.requestApproval({
      action: 'refund',
      description: `退款订单 ${order.name}，金额 ${order.currency} ${amount}，原因：${reason}`,
      params: { orderId, amount, reason },
      command: `node ${ROOT}/scripts/order-manage.mjs refund --order-id ${orderId} --amount ${amount} --reason "${reason}" --confirm`,
      preview: { '订单': order.name, '退款金额': `${order.currency} ${amount}`, '原因': reason },
    });
    return { pending: true, approvalId: apRecord.id, shortId: apRecord.id.slice(0,8) };
  }

  const result = await s.createRefund(orderId, parseFloat(amount), reason);
  await au.writeAuditLog({ action: 'refund', orderId, orderName: order.name, amount, reason });
  return { ok: true, refund: result };
}

/** 取消订单（高风险，必须审批） */
export async function cancelOrder(orderId, { reason = 'customer', confirm = false } = {}) {
  const s = await shopify();
  const ap = await approval();
  const au = await audit();

  const order = await s.getOrder(orderId);

  if (!confirm) {
    const apRecord = await ap.requestApproval({
      action: 'cancel',
      description: `取消订单 ${order.name}，原因：${reason}，将自动退款并恢复库存`,
      params: { orderId, reason },
      command: `node ${ROOT}/scripts/order-manage.mjs cancel --order-id ${orderId} --reason ${reason} --confirm`,
      preview: { '订单': order.name, '金额': `${order.currency} ${order.total_price}`, '原因': reason },
    });
    return { pending: true, approvalId: apRecord.id, shortId: apRecord.id.slice(0,8) };
  }

  const result = await s.cancelOrder(orderId, { reason, email: true, restock: true });
  await au.writeAuditLog({ action: 'cancel', orderId, orderName: order.name, reason });
  return { ok: true, order: result };
}

/** 添加订单备注 */
export async function addNote(orderId, message) {
  const s = await shopify();
  const au = await audit();
  const result = await s.addOrderNote(orderId, message);
  await au.writeAuditLog({ action: 'note', orderId, message });
  return { ok: true, note: result };
}

/** 补发（创建 $0 草稿订单） */
export async function resendOrder(orderId, { confirm = false } = {}) {
  const s = await shopify();
  const ap = await approval();
  const au = await audit();

  const order = await s.getOrder(orderId);

  if (!confirm) {
    const apRecord = await ap.requestApproval({
      action: 'resend',
      description: `补发订单 ${order.name}（创建 $0 草稿单，人工完成发货）`,
      params: { orderId },
      command: `node ${ROOT}/scripts/order-manage.mjs resend --order-id ${orderId} --confirm`,
      preview: { '原订单': order.name, '商品数': order.line_items?.length || 0 },
    });
    return { pending: true, approvalId: apRecord.id, shortId: apRecord.id.slice(0,8) };
  }

  const lineItems = order.line_items?.map(i => ({
    variant_id: i.variant_id, quantity: i.quantity, price: '0.00',
  })) || [];

  const draft = await s.createDraftOrder({
    line_items: lineItems,
    tags: `resend,original-${order.name}`,
    note: `补发单 — 原订单 ${order.name} (${order.id})`,
    shipping_address: order.shipping_address,
  });
  await au.writeAuditLog({ action: 'resend', orderId, orderName: order.name, draftId: draft.id });
  return {
    ok: true,
    draftOrderId: draft.id,
    adminUrl: `https://admin.shopify.com/draft_orders/${draft.id}`,
    msg: '草稿单已创建，请在 Shopify 后台完成发货',
  };
}

// ─── CLI ──────────────────────────────────────────────────────
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const cmd  = args[0];
  const get  = f => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };
  const has  = f => args.includes(f);

  async function run() {
    switch (cmd) {
      case 'list': {
        const status = get('--status') || 'unfulfilled';
        const limit  = parseInt(get('--limit') || '20');
        console.log(`\n📦 订单列表（${status}）\n`);
        const orders = await listOrders({ status, limit });
        if (orders.length === 0) { console.log('  暂无订单'); break; }
        orders.forEach(o => {
          console.log(`  [${o.id}] ${o.name}  ${o.status}  ${o.currency} ${o.total}  ${o.customer}  ${o.itemCount}件`);
        });
        console.log(`\n  共 ${orders.length} 条`);
        process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify({ orders }) + '\n');
        break;
      }

      case 'detail': {
        const id = get('--order-id'); if (!id) { console.error('❌ 缺少 --order-id'); break; }
        const o = await getOrderDetail(id);
        console.log('\n📦 订单详情\n');
        console.log(`  订单：${o.name}  状态：${o.status}  金额：${o.currency} ${o.total}`);
        console.log(`  客户：${o.customer?.first_name} ${o.customer?.last_name}  地址：${o.shipping?.city || '-'}`);
        console.log(`  商品：`);
        o.lineItems?.forEach(i => console.log(`    • ${i.title} ×${i.qty}  ${i.price}`));
        if (o.note) console.log(`  备注：${o.note}`);
        process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(o) + '\n');
        break;
      }

      case 'fulfill': {
        const id = get('--order-id'); if (!id) { console.error('❌ 缺少 --order-id'); break; }
        const tracking = get('--tracking-number') || get('--tracking');
        const company  = get('--company') || '顺丰';
        if (!tracking) { console.error('❌ 缺少 --tracking-number'); break; }
        const result = await fulfillOrder(id, { trackingNumber: tracking, company, confirm: has('--confirm') });
        if (result.pending) console.log(`\n⏳ 审批请求已发送（ID: ${result.shortId}），等待确认`);
        else console.log(`\n✅ 发货成功`);
        process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(result) + '\n');
        break;
      }

      case 'refund': {
        const id = get('--order-id'); if (!id) { console.error('❌ 缺少 --order-id'); break; }
        const amount = get('--amount'); if (!amount) { console.error('❌ 缺少 --amount'); break; }
        const reason = get('--reason') || '客户申请';
        const result = await refundOrder(id, { amount, reason, confirm: has('--confirm') });
        if (result.pending) console.log(`\n⏳ 退款审批已发送（ID: ${result.shortId}），等待确认`);
        else console.log(`\n✅ 退款成功`);
        process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(result) + '\n');
        break;
      }

      case 'cancel': {
        const id = get('--order-id'); if (!id) { console.error('❌ 缺少 --order-id'); break; }
        const reason = get('--reason') || 'customer';
        const result = await cancelOrder(id, { reason, confirm: has('--confirm') });
        if (result.pending) console.log(`\n⏳ 取消审批已发送（ID: ${result.shortId}），等待确认`);
        else console.log(`\n✅ 订单已取消`);
        process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(result) + '\n');
        break;
      }

      case 'note': {
        const id  = get('--order-id');   if (!id)  { console.error('❌ 缺少 --order-id'); break; }
        const msg = get('--message');    if (!msg) { console.error('❌ 缺少 --message'); break; }
        const result = await addNote(id, msg);
        console.log('\n✅ 备注已添加');
        process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(result) + '\n');
        break;
      }

      case 'resend': {
        const id = get('--order-id'); if (!id) { console.error('❌ 缺少 --order-id'); break; }
        const result = await resendOrder(id, { confirm: has('--confirm') });
        if (result.pending) console.log(`\n⏳ 补发审批已发送（ID: ${result.shortId}）`);
        else console.log(`\n✅ 补发草稿单已创建：${result.adminUrl}`);
        process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(result) + '\n');
        break;
      }

      default:
        console.log(`
📦 订单处理

用法：
  node modules/store/orders.mjs list    [--status unfulfilled|any] [--limit 20]
  node modules/store/orders.mjs detail   --order-id ID
  node modules/store/orders.mjs fulfill  --order-id ID --tracking-number NUM --company 顺丰
  node modules/store/orders.mjs refund   --order-id ID --amount 99 --reason "原因"
  node modules/store/orders.mjs cancel   --order-id ID [--reason customer|inventory|fraud]
  node modules/store/orders.mjs note     --order-id ID --message "备注内容"
  node modules/store/orders.mjs resend   --order-id ID

  高风险操作（refund/cancel）默认发送审批，加 --confirm 跳过审批直接执行`);
    }
  }

  run().catch(e => { console.error('❌', e.message); process.exit(1); });
}
