/**
 * 订单管理（完整版）
 * 电商龙虾 — 发货 / 退款 / 取消 / 补发 / 备注 / 详情
 *
 * 用法：
 *   node order-manage.mjs list [--status unfulfilled|any]
 *   node order-manage.mjs detail --order-id ID
 *   node order-manage.mjs fulfill --order-id ID --tracking-number NUM --company NAME --confirm
 *   node order-manage.mjs refund  --order-id ID --amount AMT --reason "原因" --confirm
 *   node order-manage.mjs cancel  --order-id ID [--reason customer|inventory|fraud|other] --confirm
 *   node order-manage.mjs resend  --order-id ID --confirm
 *   node order-manage.mjs note    --order-id ID --message "备注内容"
 */

import {
  getUnfulfilledOrders, getOrders, getOrder,
  fulfillOrder, createRefund,
  cancelOrder, addOrderNote, getOrderEvents,
  createDraftOrder, completeDraftOrder
} from '../connectors/shopify.js';
import { writeAuditLog } from '../audit/logger.mjs';

const args = process.argv.slice(2);
const subcommand = args[0];

function getArg(flag) {
  const i = args.indexOf(flag);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
}
function hasFlag(flag) { return args.includes(flag); }

function showHelp() {
  console.log(`🦞 电商龙虾 — 订单管理

用法：
  node order-manage.mjs list     [--status unfulfilled|any|open]  列出订单
  node order-manage.mjs detail   --order-id ID                    订单详情
  node order-manage.mjs fulfill  --order-id ID --tracking-number NUM --company NAME --confirm
  node order-manage.mjs refund   --order-id ID --amount AMT --reason "原因" --confirm
  node order-manage.mjs cancel   --order-id ID [--reason customer] --confirm
  node order-manage.mjs resend   --order-id ID --confirm           补发（克隆原订单商品创建草稿单）
  node order-manage.mjs note     --order-id ID --message "内容"    添加内部备注

cancel --reason 可选值：
  customer   买家要求取消（默认）
  inventory  无货
  fraud      疑似欺诈
  other      其他
`);
}

// ─── list ─────────────────────────────────────────────────

async function cmdList() {
  const status = getArg('--status') || 'unfulfilled';
  console.log(`🦞 拉取订单（状态：${status}）...\n`);

  const orders = status === 'unfulfilled'
    ? await getUnfulfilledOrders()
    : await getOrders({ status, limit: 50 });

  if (orders.length === 0) {
    console.log('✅ 暂无订单');
    process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify({ orders: [], count: 0 }) + '\n');
    return;
  }

  console.log(`📦 共 ${orders.length} 单：\n`);
  const orderList = orders.map(o => {
    const items = (o.line_items || []).map(i => `${i.title} ×${i.quantity}`).join('、');
    const name = o.shipping_address?.name || o.billing_address?.name || o.email || '未知';
    const addr = o.shipping_address
      ? `${o.shipping_address.province || ''}${o.shipping_address.city || ''}${o.shipping_address.address1 || ''}`
      : '无地址';
    const time = new Date(o.created_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

    console.log(`  #${o.order_number} | ${name} | ${o.currency} ${o.total_price} | ${o.fulfillment_status || 'unfulfilled'}`);
    console.log(`    商品：${items}`);
    console.log(`    地址：${addr}`);
    console.log(`    时间：${time} | 订单ID：${o.id}`);
    console.log('');

    return { orderId: o.id, orderNumber: o.order_number, customer: name, items, total: `${o.currency} ${o.total_price}`, address: addr, createdAt: o.created_at, fulfillmentStatus: o.fulfillment_status };
  });

  process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify({ orders: orderList, count: orderList.length }) + '\n');
}

// ─── detail ───────────────────────────────────────────────

async function cmdDetail() {
  const orderId = getArg('--order-id');
  if (!orderId) { console.error('❌ 缺少 --order-id'); process.exit(1); }

  const o = await getOrder(orderId);
  const items = (o.line_items || []).map(i =>
    `  • ${i.title}${i.variant_title ? ' / ' + i.variant_title : ''} ×${i.quantity} — ${o.currency} ${i.price}`
  ).join('\n');

  console.log(`🦞 订单详情 #${o.order_number}\n`);
  console.log(`买家：${o.shipping_address?.name || o.email}`);
  console.log(`邮箱：${o.email}`);
  console.log(`手机：${o.phone || o.shipping_address?.phone || '—'}`);
  console.log(`\n商品：\n${items}`);
  console.log(`\n小计：${o.currency} ${o.subtotal_price}`);
  console.log(`运费：${o.currency} ${o.total_shipping_price_set?.shop_money?.amount || '0.00'}`);
  console.log(`总计：${o.currency} ${o.total_price}`);
  console.log(`\n付款状态：${o.financial_status}`);
  console.log(`发货状态：${o.fulfillment_status || 'unfulfilled'}`);
  console.log(`\n收货地址：${o.shipping_address
    ? [o.shipping_address.name, o.shipping_address.address1, o.shipping_address.city, o.shipping_address.province, o.shipping_address.country].filter(Boolean).join(', ')
    : '无'}`);
  console.log(`创建时间：${new Date(o.created_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
  if (o.note) console.log(`备注：${o.note}`);

  if (o.fulfillments?.length > 0) {
    console.log(`\n物流信息：`);
    o.fulfillments.forEach(f => {
      console.log(`  单号：${f.tracking_number} | ${f.tracking_company || '—'} | ${f.status}`);
    });
  }

  process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(o) + '\n');
}

// ─── fulfill ──────────────────────────────────────────────

async function cmdFulfill() {
  const orderId = getArg('--order-id');
  const trackingNumber = getArg('--tracking-number');
  const company = getArg('--company');
  const confirmed = hasFlag('--confirm');

  if (!orderId) { console.error('❌ 缺少 --order-id'); process.exit(1); }
  if (!trackingNumber) { console.error('❌ 缺少 --tracking-number'); process.exit(1); }
  if (!company) { console.error('❌ 缺少 --company'); process.exit(1); }

  const order = await getOrder(orderId);
  console.log(`🦞 发货预览`);
  console.log(`   订单：#${order.order_number} | ${order.currency} ${order.total_price}`);
  console.log(`   快递：${company} — ${trackingNumber}`);

  if (!confirmed) {
    console.log('\n⚠️  预览模式，加 --confirm 执行发货');
    process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify({ preview: true, orderId, trackingNumber, company }) + '\n');
    return;
  }

  const fulfillment = await fulfillOrder(orderId, trackingNumber, company);
  await writeAuditLog({ action: 'fulfill', orderId, orderNumber: order.order_number, trackingNumber, company, fulfillmentId: fulfillment.id });

  console.log('\n✅ 发货成功！');
  console.log(`   Fulfillment ID：${fulfillment.id}`);

  process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify({
    success: true, fulfillmentId: fulfillment.id, orderId, trackingNumber, company, status: fulfillment.status
  }) + '\n');
}

// ─── refund ───────────────────────────────────────────────

async function cmdRefund() {
  const orderId = getArg('--order-id');
  const amount = getArg('--amount');
  const reason = getArg('--reason') || '退款';
  const confirmed = hasFlag('--confirm');

  if (!orderId) { console.error('❌ 缺少 --order-id'); process.exit(1); }
  if (!amount) { console.error('❌ 缺少 --amount'); process.exit(1); }

  const order = await getOrder(orderId);
  console.log(`🦞 退款预览`);
  console.log(`   订单：#${order.order_number} | 订单总额 ${order.currency} ${order.total_price}`);
  console.log(`   退款金额：${order.currency} ${amount}`);
  console.log(`   退款原因：${reason}`);

  if (!confirmed) {
    console.log('\n⚠️  预览模式，加 --confirm 执行退款');
    process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify({ preview: true, orderId, orderNumber: order.order_number, refundAmount: amount, reason }) + '\n');
    return;
  }

  const refundResult = await createRefund(orderId, parseFloat(amount), reason);
  await writeAuditLog({ action: 'refund', orderId, orderNumber: order.order_number, amount, reason, refundId: refundResult.id });

  console.log('\n✅ 退款成功！');
  console.log(`   退款ID：${refundResult.id}`);

  process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify({
    success: true, refundId: refundResult.id, orderId, orderNumber: order.order_number, refundAmount: amount, reason
  }) + '\n');
}

// ─── cancel ───────────────────────────────────────────────

async function cmdCancel() {
  const orderId = getArg('--order-id');
  const reason = getArg('--reason') || 'customer';
  const confirmed = hasFlag('--confirm');
  const validReasons = ['customer', 'inventory', 'fraud', 'other'];

  if (!orderId) { console.error('❌ 缺少 --order-id'); process.exit(1); }
  if (!validReasons.includes(reason)) {
    console.error(`❌ --reason 无效，可选：${validReasons.join(' | ')}`);
    process.exit(1);
  }

  const order = await getOrder(orderId);
  const reasonMap = { customer: '买家取消', inventory: '库存不足', fraud: '疑似欺诈', other: '其他' };

  console.log(`🦞 取消订单预览`);
  console.log(`   订单：#${order.order_number} | ${order.currency} ${order.total_price}`);
  console.log(`   商品：${(order.line_items || []).map(i => `${i.title} ×${i.quantity}`).join('、')}`);
  console.log(`   取消原因：${reasonMap[reason]}`);
  console.log(`   ⚠️  取消后将自动退款并恢复库存`);

  if (!confirmed) {
    console.log('\n⚠️  预览模式，加 --confirm 执行取消');
    process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify({ preview: true, orderId, orderNumber: order.order_number, reason }) + '\n');
    return;
  }

  const result = await cancelOrder(orderId, { reason, email: true, restock: true });
  await writeAuditLog({ action: 'cancel', orderId, orderNumber: order.order_number, reason, before: { status: order.financial_status, fulfillmentStatus: order.fulfillment_status } });

  console.log('\n✅ 订单已取消！');
  console.log(`   订单状态：${result.financial_status}`);

  process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify({
    success: true, orderId, orderNumber: order.order_number, cancelledAt: result.cancelled_at, reason
  }) + '\n');
}

// ─── resend ───────────────────────────────────────────────

async function cmdResend() {
  const orderId = getArg('--order-id');
  const confirmed = hasFlag('--confirm');

  if (!orderId) { console.error('❌ 缺少 --order-id'); process.exit(1); }

  const order = await getOrder(orderId);
  const items = (order.line_items || []).map(i => ({
    variant_id: i.variant_id,
    quantity: i.quantity,
    title: i.title,
    price: i.price
  }));

  console.log(`🦞 补发预览（克隆原订单商品，创建新草稿单）`);
  console.log(`   原订单：#${order.order_number}`);
  console.log(`   补发商品：`);
  items.forEach(i => console.log(`     • ${i.title} ×${i.quantity}`));
  console.log(`   收货人：${order.shipping_address?.name || order.email}`);
  console.log(`   地址：${order.shipping_address?.address1 || '—'}`);
  console.log(`\n   ⚠️  补发单金额为 $0（免费发出），需在 Shopify 后台手动确认发货`);

  if (!confirmed) {
    console.log('\n⚠️  预览模式，加 --confirm 创建补发草稿单');
    process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify({ preview: true, orderId, itemCount: items.length }) + '\n');
    return;
  }

  const draftData = {
    line_items: items.map(i => ({
      variant_id: i.variant_id,
      quantity: i.quantity,
      price: '0.00'  // 补发免费
    })),
    shipping_address: order.shipping_address,
    email: order.email,
    note: `补发单 — 原订单 #${order.order_number}`,
    tags: `resend,original-${order.order_number}`
  };

  const draft = await createDraftOrder(draftData);
  await writeAuditLog({ action: 'resend', originalOrderId: orderId, originalOrderNumber: order.order_number, draftOrderId: draft.id, draftOrderNumber: draft.order_number });

  console.log('\n✅ 补发草稿单已创建！');
  console.log(`   草稿单ID：${draft.id}`);
  console.log(`   草稿单编号：${draft.name}`);
  console.log(`   ⚠️  请在 Shopify 后台完成草稿单并安排发货`);
  console.log(`   链接：https://${draft.admin_graphql_api_id?.split('/').includes('DraftOrder') ? '' : ''}${order.id}`);

  process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify({
    success: true,
    originalOrderId: orderId,
    originalOrderNumber: order.order_number,
    draftOrderId: draft.id,
    draftOrderName: draft.name,
    shopifyAdminUrl: `https://admin.shopify.com/draft_orders/${draft.id}`
  }) + '\n');
}

// ─── note ─────────────────────────────────────────────────

async function cmdNote() {
  const orderId = getArg('--order-id');
  const message = getArg('--message');

  if (!orderId) { console.error('❌ 缺少 --order-id'); process.exit(1); }
  if (!message) { console.error('❌ 缺少 --message'); process.exit(1); }

  const order = await getOrder(orderId);
  const newNote = order.note ? `${order.note}\n[${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}] ${message}` : message;

  await addOrderNote(orderId, newNote);
  await writeAuditLog({ action: 'note', orderId, orderNumber: order.order_number, message });

  console.log(`✅ 备注已添加到订单 #${order.order_number}`);
  process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify({ success: true, orderId, message }) + '\n');
}

// ─── main ─────────────────────────────────────────────────

async function run() {
  if (!subcommand || subcommand === '--help') { showHelp(); return; }

  switch (subcommand) {
    case 'list':    await cmdList(); break;
    case 'detail':  await cmdDetail(); break;
    case 'fulfill': await cmdFulfill(); break;
    case 'refund':  await cmdRefund(); break;
    case 'cancel':  await cmdCancel(); break;
    case 'resend':  await cmdResend(); break;
    case 'note':    await cmdNote(); break;
    default:
      console.error(`❌ 未知子命令：${subcommand}`);
      showHelp();
      process.exit(1);
  }
}

run().catch(err => {
  console.error('❌ 订单操作失败：', err.message);
  process.exit(1);
});
