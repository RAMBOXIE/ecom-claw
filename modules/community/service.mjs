/**
 * 💬 社区运营 — 客服话术库 (20 场景)
 * modules/community/service.mjs
 *
 * CLI：
 *   node modules/community/service.mjs list
 *   node modules/community/service.mjs show --scenario refund_request
 *   node modules/community/service.mjs fill --scenario shipping_delay --order-id 1234 --days 3
 *
 * 导出：runService / getTemplate
 */

import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── 模板库 ────────────────────────────────────────────────────
const TEMPLATES = [
  {
    scenario: 'refund_request',
    title: '退款申请',
    template_zh: '您好！非常感谢您对我们的支持。关于您的退款申请（订单号：{order_id}），我们已经收到并正在处理中。退款将在 {days} 个工作日内原路退回，请耐心等待。如有任何疑问，欢迎随时联系我们！',
    template_en: 'Hello! Thank you for your support. Regarding your refund request (Order #{order_id}), we have received it and are processing it. The refund will be returned to your original payment method within {days} business days. Feel free to contact us anytime!',
    variables: ['{order_id}', '{days}'],
  },
  {
    scenario: 'shipping_delay',
    title: '物流延迟',
    template_zh: '亲爱的顾客，您好！首先为订单 #{order_id} 的物流延迟深表歉意。受 {reason} 影响，您的包裹预计还需 {days} 天左右送达。物流单号：{tracking_no}，您可实时追踪包裹状态。感谢您的耐心等待！',
    template_en: 'Dear customer, we sincerely apologize for the shipping delay on Order #{order_id}. Due to {reason}, your package is expected to arrive within {days} more days. Tracking number: {tracking_no}. Thank you for your patience!',
    variables: ['{order_id}', '{days}', '{reason}', '{tracking_no}'],
  },
  {
    scenario: 'wrong_item',
    title: '发错商品',
    template_zh: '您好！非常抱歉给您带来困扰，关于订单 #{order_id} 发错商品的问题，我们深感歉意！请您拍照发给我们，我们将立即为您安排补发正确商品，运费由我们承担，无需退回错误商品，请放心！',
    template_en: 'Hello! We sincerely apologize for sending the wrong item in Order #{order_id}. Please send us a photo and we will immediately arrange to ship the correct item. Shipping is on us and you don\'t need to return the wrong item!',
    variables: ['{order_id}'],
  },
  {
    scenario: 'damaged_item',
    title: '商品损坏',
    template_zh: '您好！收到您反馈订单 #{order_id} 商品损坏的问题，我们非常抱歉！请您拍下损坏照片发送给我们。我们将为您提供以下解决方案：①免费补发新品 ②全额退款。请您选择首选方案，我们会第一时间处理！',
    template_en: 'Hello! We are very sorry to hear that the item in Order #{order_id} was damaged. Please send us photos of the damage. We offer two solutions: ① Free replacement ② Full refund. Please let us know your preference and we will act immediately!',
    variables: ['{order_id}'],
  },
  {
    scenario: 'out_of_stock',
    title: '商品缺货',
    template_zh: '您好！非常抱歉，您订购的商品（{product_name}）目前暂时缺货。预计补货时间为 {restock_date}，届时会第一时间通知您发货。如您急需，我们可以为您全额退款，请问您希望等待补货还是申请退款？',
    template_en: 'Hello! We apologize that {product_name} is currently out of stock. Expected restock date is {restock_date}. Would you prefer to wait for restocking or receive a full refund? We will notify you as soon as it\'s available!',
    variables: ['{product_name}', '{restock_date}'],
  },
  {
    scenario: 'cancel_order',
    title: '取消订单',
    template_zh: '您好！已收到您取消订单 #{order_id} 的申请。如果订单尚未发货，我们将立即为您取消并退款。如已发货，请收到后拒收或联系我们安排退货。退款将在 {days} 个工作日内处理完毕。',
    template_en: 'Hello! We have received your cancellation request for Order #{order_id}. If it hasn\'t shipped yet, we\'ll cancel and refund immediately. If already shipped, please refuse delivery or contact us for return arrangements. Refund within {days} business days.',
    variables: ['{order_id}', '{days}'],
  },
  {
    scenario: 'tracking_inquiry',
    title: '物流查询',
    template_zh: '您好！您的订单 #{order_id} 物流信息如下：\n快递公司：{carrier}\n运单号：{tracking_no}\n当前状态：{status}\n预计送达：{eta}\n\n如有疑问欢迎随时联系！',
    template_en: 'Hello! Here is the shipping info for Order #{order_id}:\nCarrier: {carrier}\nTracking #: {tracking_no}\nCurrent Status: {status}\nEstimated Delivery: {eta}\n\nFeel free to contact us anytime!',
    variables: ['{order_id}', '{carrier}', '{tracking_no}', '{status}', '{eta}'],
  },
  {
    scenario: 'exchange_request',
    title: '换货申请',
    template_zh: '您好！已收到您关于订单 #{order_id} 的换货申请。请将{item_name}寄回至：{return_address}（请注明订单号）。我们收到退货后将在 3 个工作日内为您寄出新品，换货运费由我们承担！',
    template_en: 'Hello! We have received your exchange request for Order #{order_id}. Please return {item_name} to: {return_address} (include your order number). Once we receive it, we\'ll ship the new item within 3 business days. Exchange shipping is on us!',
    variables: ['{order_id}', '{item_name}', '{return_address}'],
  },
  {
    scenario: 'complaint_handle',
    title: '投诉处理',
    template_zh: '您好，我是客服主管。首先对您的不愉快体验深表歉意！您的投诉（单号：{order_id}）已被标记为高优先级处理。我们将在 {hours} 小时内给出完整解决方案。请相信我们会对此负责到底。',
    template_en: 'Hello, I am the customer service supervisor. I sincerely apologize for your unpleasant experience! Your complaint (Order #{order_id}) has been marked as high priority. We will provide a complete resolution within {hours} hours. You have our commitment.',
    variables: ['{order_id}', '{hours}'],
  },
  {
    scenario: 'positive_review_thanks',
    title: '好评感谢',
    template_zh: '亲爱的 {customer_name}，您好！非常感谢您给我们的 5 星好评和宝贵意见！您的支持是我们持续进步的最大动力。作为感谢，我们为您准备了 {discount}元 专属优惠券（码：{coupon_code}），期待您的下次光临！',
    template_en: 'Dear {customer_name}, thank you so much for your 5-star review! Your support motivates us to keep improving. As a token of appreciation, here is a ${discount} exclusive coupon for your next order (Code: {coupon_code}). See you again!',
    variables: ['{customer_name}', '{discount}', '{coupon_code}'],
  },
  {
    scenario: 'negative_review_response',
    title: '差评回应',
    template_zh: '您好，感谢您的反馈。对于您的不满意体验，我们深表歉意。您提到的 "{issue}" 问题我们已认真记录并改进。我们诚挚邀请您通过私信联系我们，我们希望有机会弥补您的体验。',
    template_en: 'Hello, thank you for your feedback. We sincerely apologize for your unsatisfactory experience. The issue you mentioned regarding "{issue}" has been recorded and we are working on improvements. Please message us privately so we can make it right.',
    variables: ['{issue}'],
  },
  {
    scenario: 'wholesale_inquiry',
    title: '批发咨询',
    template_zh: '您好！感谢您对批发合作的兴趣！我们的批发政策如下：\n• 起订量：{min_qty} 件\n• 折扣：{discount}折\n• 付款方式：{payment_terms}\n\n请告知您的具体需求，我们将为您定制专属报价方案！',
    template_en: 'Hello! Thank you for your wholesale inquiry! Our wholesale terms:\n• MOQ: {min_qty} units\n• Discount: {discount}% off\n• Payment: {payment_terms}\n\nPlease share your specific needs and we\'ll prepare a custom quote for you!',
    variables: ['{min_qty}', '{discount}', '{payment_terms}'],
  },
  {
    scenario: 'payment_failed',
    title: '支付失败',
    template_zh: '您好！我们注意到您的订单 #{order_id} 支付未完成。这可能是由于网络超时或银行临时限额导致的。您可以：①重新尝试支付 ②更换支付方式 ③联系我们获取其他支付方式。订单将为您保留 {hours} 小时。',
    template_en: 'Hello! We noticed the payment for Order #{order_id} was not completed. This may be due to network timeout or bank limits. You can: ① Retry payment ② Use another payment method ③ Contact us for alternatives. Your order is reserved for {hours} hours.',
    variables: ['{order_id}', '{hours}'],
  },
  {
    scenario: 'discount_request',
    title: '优惠申请',
    template_zh: '您好！感谢您对我们商品的喜爱！我们目前为您提供以下优惠：\n• 折扣码：{coupon_code}（{discount_desc}）\n• 有效期：{expiry}\n\n如需了解更多优惠，欢迎关注我们的官方社交媒体！',
    template_en: 'Hello! Thank you for your interest in our products! Here\'s an exclusive offer for you:\n• Coupon code: {coupon_code} ({discount_desc})\n• Valid until: {expiry}\n\nFollow our social media for more deals!',
    variables: ['{coupon_code}', '{discount_desc}', '{expiry}'],
  },
  {
    scenario: 'product_inquiry',
    title: '商品咨询',
    template_zh: '您好！感谢您对 {product_name} 的询问！\n• 规格：{specs}\n• 材质：{material}\n• 适用场景：{usage}\n• 库存状态：{stock_status}\n\n如需了解更多详情或查看实物图，请告知，我们很乐意为您解答！',
    template_en: 'Hello! Thank you for inquiring about {product_name}!\n• Specs: {specs}\n• Material: {material}\n• Use Case: {usage}\n• Stock: {stock_status}\n\nFeel free to ask for more details or additional photos!',
    variables: ['{product_name}', '{specs}', '{material}', '{usage}', '{stock_status}'],
  },
  {
    scenario: 'return_instructions',
    title: '退货指引',
    template_zh: '您好！以下是退货流程：\n1️⃣ 将商品完好包装（含配件和说明书）\n2️⃣ 寄到：{return_address}\n3️⃣ 备注订单号：{order_id}\n4️⃣ 将运单号发给我们\n\n退货运费：{shipping_policy}\n收到退货后 3 个工作日内处理退款。',
    template_en: 'Hello! Here are the return instructions:\n1️⃣ Pack the item securely (include all accessories)\n2️⃣ Ship to: {return_address}\n3️⃣ Note your order #: {order_id}\n4️⃣ Send us the tracking number\n\nReturn shipping: {shipping_policy}\nRefund processed within 3 business days of receipt.',
    variables: ['{return_address}', '{order_id}', '{shipping_policy}'],
  },
  {
    scenario: 'order_confirmation',
    title: '订单确认',
    template_zh: '您好，{customer_name}！感谢您的订购！您的订单 #{order_id} 已确认：\n• 商品：{items}\n• 金额：{total}\n• 预计发货：{ship_date}\n• 收货地址：{address}\n\n如有任何问题，请随时联系我们！',
    template_en: 'Hello {customer_name}! Thank you for your order! Order #{order_id} confirmed:\n• Items: {items}\n• Total: {total}\n• Est. Ship Date: {ship_date}\n• Delivery Address: {address}\n\nContact us anytime if you have questions!',
    variables: ['{customer_name}', '{order_id}', '{items}', '{total}', '{ship_date}', '{address}'],
  },
  {
    scenario: 'delivery_exception',
    title: '派送异常',
    template_zh: '您好！您的订单 #{order_id} 在派送时遇到异常：{exception_reason}。\n快递方已尝试联系您，请：\n• 主动联系快递员：{courier_phone}\n• 或前往自提点：{pickup_address}\n• 如无法提取，我们将协助重新安排配送。',
    template_en: 'Hello! Order #{order_id} encountered a delivery exception: {exception_reason}.\nThe courier attempted delivery. Please:\n• Contact courier: {courier_phone}\n• Or pick up at: {pickup_address}\n• If unable, we\'ll arrange redelivery for you.',
    variables: ['{order_id}', '{exception_reason}', '{courier_phone}', '{pickup_address}'],
  },
  {
    scenario: 'quality_complaint',
    title: '质量投诉',
    template_zh: '您好！非常抱歉您收到的 {product_name}（订单 #{order_id}）存在质量问题。我们对此高度重视！请您拍照记录问题，我们将：\n①立即为您重新发货\n②对此批次进行质量检查\n③提供 {compensation} 作为补偿\n\n感谢您帮助我们改进产品！',
    template_en: 'Hello! We are truly sorry about the quality issue with {product_name} (Order #{order_id}). We take this very seriously! Please send us photos and we will:\n①Ship a replacement immediately\n②Conduct a quality check on this batch\n③Provide {compensation} as compensation\n\nThank you for helping us improve!',
    variables: ['{product_name}', '{order_id}', '{compensation}'],
  },
  {
    scenario: 'vip_followup',
    title: 'VIP 回访',
    template_zh: '亲爱的 {customer_name}，您好！感谢您长期以来的支持，您是我们尊贵的 {vip_tier} 会员！\n距您上次购物已有 {days} 天，不知是否一切满意？\n本月我们有专属 VIP 活动：{promo_detail}\n期待您的再次光临！🎁',
    template_en: 'Dear {customer_name}, thank you for your continued loyalty as our valued {vip_tier} member! It\'s been {days} days since your last purchase — we hope everything was satisfactory!\nThis month\'s exclusive VIP offer: {promo_detail}\nLooking forward to seeing you again! 🎁',
    variables: ['{customer_name}', '{vip_tier}', '{days}', '{promo_detail}'],
  },
];

// ─── 核心 API ──────────────────────────────────────────────────

/**
 * 获取模板并填充变量
 */
export function getTemplate(scenario, vars = {}) {
  const tmpl = TEMPLATES.find(t => t.scenario === scenario);
  if (!tmpl) return null;

  let text_zh = tmpl.template_zh;
  let text_en = tmpl.template_en;

  for (const [key, value] of Object.entries(vars)) {
    const placeholder = `{${key}}`;
    text_zh = text_zh.replaceAll(placeholder, value);
    text_en = text_en.replaceAll(placeholder, value);
  }

  return { ...tmpl, filled_zh: text_zh, filled_en: text_en };
}

// ─── 主运行函数 ────────────────────────────────────────────────
export async function runService(args) {
  const cmd = args[0];
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : null;
  };

  if (cmd === 'list') {
    console.log('\n💬 客服话术场景库\n');
    console.log('场景 ID                  | 标题');
    console.log('-------------------------|----------');
    TEMPLATES.forEach(t => {
      console.log(`${t.scenario.padEnd(25)} | ${t.title}`);
    });
    console.log(`\n共 ${TEMPLATES.length} 个场景。使用 show --scenario <id> 查看详情`);
    return TEMPLATES.map(t => ({ scenario: t.scenario, title: t.title }));

  } else if (cmd === 'show') {
    const scenario = get('--scenario');
    if (!scenario) { console.error('需要提供 --scenario'); return null; }
    const tmpl = TEMPLATES.find(t => t.scenario === scenario);
    if (!tmpl) {
      console.error(`未找到场景: ${scenario}`);
      console.log('可用场景: ' + TEMPLATES.map(t => t.scenario).join(', '));
      return null;
    }
    console.log(`\n💬 ${tmpl.title} (${tmpl.scenario})\n`);
    console.log('【中文模板】');
    console.log(tmpl.template_zh);
    console.log('\n【English Template】');
    console.log(tmpl.template_en);
    console.log(`\n变量: ${tmpl.variables.join(', ')}`);
    return tmpl;

  } else if (cmd === 'fill') {
    const scenario = get('--scenario');
    if (!scenario) { console.error('需要提供 --scenario'); return null; }

    // 收集所有 --xxx yyy 参数为变量
    const vars = {};
    for (let i = 0; i < args.length - 1; i++) {
      if (args[i].startsWith('--') && args[i] !== '--scenario') {
        const key = args[i].substring(2).replace(/-/g, '_'); // --order-id -> order_id
        vars[key] = args[i + 1];
      }
    }

    const filled = getTemplate(scenario, vars);
    if (!filled) {
      console.error(`未找到场景: ${scenario}`);
      return null;
    }

    console.log(`\n💬 ${filled.title} — 填充后\n`);
    console.log('【中文】');
    console.log(filled.filled_zh);
    console.log('\n【English】');
    console.log(filled.filled_en);

    // 检查是否有未填充的变量
    const remaining = (filled.filled_zh.match(/\{[\w_]+\}/g) || []);
    if (remaining.length > 0) {
      console.log(`\n⚠️ 以下变量未填充: ${remaining.join(', ')}`);
    }
    return filled;

  } else {
    console.log('用法:');
    console.log('  node modules/community/service.mjs list');
    console.log('  node modules/community/service.mjs show --scenario refund_request');
    console.log('  node modules/community/service.mjs fill --scenario shipping_delay --order-id 1234 --days 3');
    return null;
  }
}

// ─── CLI 入口 ──────────────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith('service.mjs')) {
  const args = process.argv.slice(2);
  const result = await runService(args);
  console.log(`\n__JSON_OUTPUT__ ${JSON.stringify({ ok: true, data: result })}`);
}
