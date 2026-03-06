/**
 * 订单管理
 * 电商龙虾 — 发货 / 退款 / 待发货列表
 *
 * 用法：
 *   node order-manage.mjs list
 *   node order-manage.mjs fulfill --order-id 123 --tracking-number SF123 --company "顺丰"
 *   node order-manage.mjs refund --order-id 123 --amount 50 --reason "退货" --confirm
 */

import { getUnfulfilledOrders, fulfillOrder, createRefund, getOrder } from '../connectors/shopify.js';

const args = process.argv.slice(2);
const subcommand = args[0];

function getArg(flag) {
  const i = args.indexOf(flag);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
}

function hasFlag(flag) {
  return args.includes(flag);
}

function showHelp() {
  console.log(`🦞 电商龙虾 — 订单管理

用法：
  node order-manage.mjs list                                         列出待发货订单
  node order-manage.mjs fulfill --order-id ID --tracking-number NUM --company NAME   发货
  node order-manage.mjs refund --order-id ID --amount AMT --reason "原因" --confirm   退款

子命令：
  list      列出所有待发货订单
  fulfill   创建发货记录
  refund    创建退款

fulfill 参数：
  --order-id          订单ID（必填）
  --tracking-number   快递单号（必填）
  --company           快递公司（必填）

refund 参数：
  --order-id    订单ID（必填）
  --amount      退款金额（必填）
  --reason      退款原因
  --confirm     确认执行退款（不加则仅预览）
`);
}

async function listOrders() {
  console.log('🦞 拉取待发货订单...\n');

  const orders = await getUnfulfilledOrders();

  if (orders.length === 0) {
    console.log('✅ 暂无待发货订单');
    process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify({ orders: [], count: 0 }) + '\n');
    return;
  }

  console.log(`📦 待发货订单共 ${orders.length} 单：\n`);

  const orderList = orders.map(o => {
    const items = (o.line_items || []).map(i => `${i.title} ×${i.quantity}`).join('、');
    const name = o.shipping_address?.name || o.billing_address?.name || o.email || '未知';
    const addr = o.shipping_address
      ? `${o.shipping_address.province || ''}${o.shipping_address.city || ''}${o.shipping_address.address1 || ''}`
      : '无地址';
    const time = new Date(o.created_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

    console.log(`  #${o.order_number} | ${name} | ${o.currency} ${o.total_price} | ${time}`);
    console.log(`    商品：${items}`);
    console.log(`    地址：${addr}`);
    console.log(`    订单ID：${o.id}`);
    console.log('');

    return {
      orderId: o.id,
      orderNumber: o.order_number,
      customer: name,
      items,
      total: `${o.currency} ${o.total_price}`,
      address: addr,
      createdAt: o.created_at
    };
  });

  process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify({ orders: orderList, count: orderList.length }) + '\n');
}

async function fulfill() {
  const orderId = getArg('--order-id');
  const trackingNumber = getArg('--tracking-number');
  const company = getArg('--company');

  if (!orderId) { console.error('❌ 缺少 --order-id'); process.exit(1); }
  if (!trackingNumber) { console.error('❌ 缺少 --tracking-number'); process.exit(1); }
  if (!company) { console.error('❌ 缺少 --company'); process.exit(1); }

  console.log(`🦞 发货处理中...`);
  console.log(`   订单ID：${orderId}`);
  console.log(`   快递单号：${trackingNumber}`);
  console.log(`   快递公司：${company}`);

  const fulfillment = await fulfillOrder(orderId, trackingNumber, company);

  console.log('');
  console.log('✅ 发货成功！');
  console.log(`   Fulfillment ID：${fulfillment.id}`);
  console.log(`   状态：${fulfillment.status}`);
  console.log(`   快递追踪：${fulfillment.tracking_number}`);

  const output = {
    success: true,
    fulfillmentId: fulfillment.id,
    orderId,
    trackingNumber,
    company,
    status: fulfillment.status
  };

  process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(output) + '\n');
}

async function refund() {
  const orderId = getArg('--order-id');
  const amount = getArg('--amount');
  const reason = getArg('--reason') || '退款';
  const confirmed = hasFlag('--confirm');

  if (!orderId) { console.error('❌ 缺少 --order-id'); process.exit(1); }
  if (!amount) { console.error('❌ 缺少 --amount'); process.exit(1); }

  // 获取订单信息
  const order = await getOrder(orderId);
  console.log(`🦞 退款预览`);
  console.log(`   订单：#${order.order_number}`);
  console.log(`   订单金额：${order.currency} ${order.total_price}`);
  console.log(`   退款金额：${order.currency} ${amount}`);
  console.log(`   退款原因：${reason}`);
  console.log('');

  if (!confirmed) {
    console.log('⚠️  这是预览模式，添加 --confirm 参数确认执行退款');
    const output = {
      preview: true,
      orderId,
      orderNumber: order.order_number,
      orderTotal: order.total_price,
      refundAmount: amount,
      reason,
      currency: order.currency
    };
    process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(output) + '\n');
    return;
  }

  console.log('执行退款中...');
  const refundResult = await createRefund(orderId, parseFloat(amount), reason);

  console.log('✅ 退款成功！');
  console.log(`   退款ID：${refundResult.id}`);

  const output = {
    success: true,
    refundId: refundResult.id,
    orderId,
    orderNumber: order.order_number,
    refundAmount: amount,
    reason
  };

  process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(output) + '\n');
}

async function run() {
  if (!subcommand || subcommand === '--help') {
    showHelp();
    return;
  }

  switch (subcommand) {
    case 'list':
      await listOrders();
      break;
    case 'fulfill':
      await fulfill();
      break;
    case 'refund':
      await refund();
      break;
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
