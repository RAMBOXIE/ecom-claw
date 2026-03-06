/**
 * 客服自动化
 * 电商龙虾 — FAQ管理 / 模板回复 / 评论监控
 *
 * 用法：
 *   node customer-service.mjs faq-add --question '...' --answer '...' --tags '标签1,标签2'
 *   node customer-service.mjs faq-search --query '退货'
 *   node customer-service.mjs faq-list
 *   node customer-service.mjs templates
 *   node customer-service.mjs review-monitor
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');
const FAQ_PATH = join(DATA_DIR, 'faq.json');

const args = process.argv.slice(2);
const subcommand = args[0];

function getArg(flag) {
  const i = args.indexOf(flag);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
}

function showHelp() {
  console.log(`🦞 电商龙虾 — 客服自动化

用法：
  node customer-service.mjs faq-add --question '问题' --answer '答案' [--tags '标签1,标签2']
  node customer-service.mjs faq-search --query '搜索词'
  node customer-service.mjs faq-list
  node customer-service.mjs templates
  node customer-service.mjs review-monitor`);
}

// ─── FAQ 数据管理 ─────────────────────────────────────────

const DEFAULT_FAQS = [
  { id: 1, question: '多久可以发货？', answer: '下单后1-3个工作日内发货，节假日顺延。', tags: ['发货', '物流'] },
  { id: 2, question: '支持退换货吗？', answer: '收到商品7天内支持无理由退换货，请保持商品完好及包装完整。', tags: ['退货', '售后'] },
  { id: 3, question: '快递用什么？', answer: '默认发顺丰/圆通/中通快递，偏远地区可能使用邮政。可备注指定快递。', tags: ['物流', '快递'] },
  { id: 4, question: '能开发票吗？', answer: '支持开具电子发票，下单时请备注发票抬头和税号。', tags: ['发票', '财务'] },
  { id: 5, question: '商品是正品吗？', answer: '本店所有商品均为正品，支持验货，假一赔十。', tags: ['正品', '质量'] },
  { id: 6, question: '到货时间大概几天？', answer: '国内大部分地区2-5天到货，偏远地区5-7天。具体可查询物流单号。', tags: ['物流', '时间'] },
  { id: 7, question: '质量有问题怎么办？', answer: '收到商品如有质量问题，请拍照联系客服，我们将免费换货或全额退款。', tags: ['质量', '售后'] },
  { id: 8, question: '有优惠活动吗？', answer: '关注店铺可获取最新优惠信息，不定期有满减、折扣活动。', tags: ['优惠', '活动'] },
  { id: 9, question: '可以修改地址吗？', answer: '未发货前可以修改地址，请尽快联系客服处理。已发货则无法修改。', tags: ['地址', '订单'] },
  { id: 10, question: '支持哪些付款方式？', answer: '支持支付宝、微信支付、银行卡、信用卡等多种支付方式。', tags: ['支付', '付款'] }
];

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadFAQ() {
  ensureDataDir();
  if (!existsSync(FAQ_PATH)) {
    writeFileSync(FAQ_PATH, JSON.stringify(DEFAULT_FAQS, null, 2), 'utf8');
    return [...DEFAULT_FAQS];
  }
  try {
    return JSON.parse(readFileSync(FAQ_PATH, 'utf8'));
  } catch {
    return [...DEFAULT_FAQS];
  }
}

function saveFAQ(faqs) {
  ensureDataDir();
  writeFileSync(FAQ_PATH, JSON.stringify(faqs, null, 2), 'utf8');
}

// ─── faq-add ──────────────────────────────────────────────

function faqAdd() {
  const question = getArg('--question');
  const answer = getArg('--answer');
  const tagsStr = getArg('--tags');

  if (!question || !answer) {
    console.error('❌ 缺少 --question 或 --answer 参数');
    process.exit(1);
  }

  const faqs = loadFAQ();
  const maxId = faqs.reduce((max, f) => Math.max(max, f.id || 0), 0);
  const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : [];

  const newFaq = { id: maxId + 1, question, answer, tags };
  faqs.push(newFaq);
  saveFAQ(faqs);

  console.log('🦞 电商龙虾 — FAQ已添加\n');
  console.log(`✅ ID: ${newFaq.id}`);
  console.log(`❓ 问题：${question}`);
  console.log(`💬 答案：${answer}`);
  if (tags.length) console.log(`🏷️ 标签：${tags.join(', ')}`);

  const output = { action: 'faq-add', faq: newFaq, totalCount: faqs.length };
  process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(output) + '\n');
}

// ─── faq-search ───────────────────────────────────────────

function faqSearch() {
  const query = getArg('--query');
  if (!query) {
    console.error('❌ 缺少 --query 参数');
    process.exit(1);
  }

  const faqs = loadFAQ();
  const queryLower = query.toLowerCase();
  const queryChars = [...queryLower];

  // 模糊匹配打分
  const scored = faqs.map(faq => {
    let score = 0;
    const qLower = faq.question.toLowerCase();
    const aLower = faq.answer.toLowerCase();
    const tLower = (faq.tags || []).join(' ').toLowerCase();

    // 完全包含
    if (qLower.includes(queryLower)) score += 10;
    if (aLower.includes(queryLower)) score += 5;
    if (tLower.includes(queryLower)) score += 8;

    // 字符匹配
    for (const ch of queryChars) {
      if (qLower.includes(ch)) score += 2;
      if (aLower.includes(ch)) score += 1;
      if (tLower.includes(ch)) score += 1;
    }

    return { ...faq, score };
  });

  const results = scored.filter(f => f.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);

  console.log(`🦞 电商龙虾 — FAQ搜索\n`);
  console.log(`🔍 搜索：${query}\n`);

  if (results.length === 0) {
    console.log('未找到匹配的FAQ');
  } else {
    console.log(`找到 ${results.length} 条相关FAQ：\n`);
    for (const r of results) {
      console.log(`📌 [${r.id}] ${r.question}`);
      console.log(`   ${r.answer}`);
      if (r.tags?.length) console.log(`   🏷️ ${r.tags.join(', ')}`);
      console.log('');
    }
  }

  const output = { action: 'faq-search', query, results: results.map(({ score, ...rest }) => rest), count: results.length };
  process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(output) + '\n');
}

// ─── faq-list ─────────────────────────────────────────────

function faqList() {
  const faqs = loadFAQ();

  console.log('🦞 电商龙虾 — FAQ列表\n');
  console.log(`共 ${faqs.length} 条FAQ：\n`);

  for (const faq of faqs) {
    console.log(`[${faq.id}] ❓ ${faq.question}`);
    console.log(`    💬 ${faq.answer}`);
    if (faq.tags?.length) console.log(`    🏷️ ${faq.tags.join(', ')}`);
    console.log('');
  }

  const output = { action: 'faq-list', faqs, count: faqs.length };
  process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(output) + '\n');
}

// ─── templates ────────────────────────────────────────────

function templates() {
  const TEMPLATES = [
    { id: 1, category: '发货时间', template: '亲，您好！您的订单将在1-3个工作日内发出，发货后会发送物流单号给您，请耐心等待~' },
    { id: 2, category: '发货时间', template: '亲，已经为您加急处理，预计明天就可以发出哦~' },
    { id: 3, category: '退换货', template: '亲，收到商品7天内可以无理由退换货，请保持商品完好并联系我们安排退货地址~' },
    { id: 4, category: '退换货', template: '亲，退货运费由买家承担，如果是质量问题我们承担运费哦~' },
    { id: 5, category: '质量问题', template: '非常抱歉给您带来不好的体验！请拍照发给我们，确认后立即为您重新发货或全额退款~' },
    { id: 6, category: '质量问题', template: '亲，我们已经记录了您反馈的问题，会加强品控，给您补偿一张优惠券作为歉意~' },
    { id: 7, category: '物流查询', template: '亲，您的物流单号是{tracking_number}，您可以在快递官网查询最新物流信息~' },
    { id: 8, category: '物流查询', template: '亲，快递显示正在派送中，如果今天没收到可以联系快递员哦~' },
    { id: 9, category: '优惠活动', template: '亲，目前店铺有满{amount}减{discount}的活动，赶快下单吧~' },
    { id: 10, category: '优惠活动', template: '亲，关注店铺即可领取{discount}元优惠券，新品上架还有限时折扣哦~' },
    { id: 11, category: '付款问题', template: '亲，我们支持支付宝、微信、银行卡等多种支付方式，如遇支付问题可换个方式试试~' },
    { id: 12, category: '订单修改', template: '亲，未发货的订单可以修改地址和数量，请告诉我需要修改什么~' },
    { id: 13, category: '订单修改', template: '抱歉亲，订单已经发出无法修改，您可以收到后申请退换货~' },
    { id: 14, category: '催发货', template: '亲，非常理解您着急的心情！已经为您催促仓库优先发货，请再耐心等待一下~' },
    { id: 15, category: '缺货', template: '抱歉亲，这款商品暂时缺货，预计{days}天后补货到位，到货后第一时间通知您~' },
    { id: 16, category: '议价', template: '亲，我们的价格已经是最优惠的了，产品品质有保障。现在下单还有小礼品赠送哦~' },
    { id: 17, category: '好评返现', template: '亲，感谢您的购买！收到商品满意的话帮忙给个好评，截图给客服可获{amount}元返现~' },
    { id: 18, category: '售后跟进', template: '亲，您之前反馈的问题已经处理完毕，请查收。如有其他问题随时联系我们~' },
    { id: 19, category: '尺码咨询', template: '亲，建议参考详情页的尺码表，如果平时穿{size}码，建议选{suggest_size}哦~' },
    { id: 20, category: '欢迎语', template: '亲，欢迎光临！有什么可以帮助您的？我们的工作时间是9:00-22:00~' }
  ];

  console.log('🦞 电商龙虾 — 客服模板\n');
  console.log(`共 ${TEMPLATES.length} 条预设模板：\n`);

  let lastCategory = '';
  for (const t of TEMPLATES) {
    if (t.category !== lastCategory) {
      console.log(`\n📁 **${t.category}**`);
      lastCategory = t.category;
    }
    console.log(`  [${t.id}] ${t.template}`);
  }

  console.log('\n💡 模板中 {variable} 为占位符，使用时替换为实际内容');

  const output = { action: 'templates', templates: TEMPLATES, count: TEMPLATES.length };
  process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(output) + '\n');
}

// ─── review-monitor ───────────────────────────────────────

async function reviewMonitor() {
  let shopify;
  try {
    shopify = await import('../connectors/shopify.js');
  } catch (err) {
    console.error('❌ 无法加载 Shopify 连接器：', err.message);
    process.exit(1);
  }

  console.log('🦞 电商龙虾 — 评论/订单备注监控\n');

  const negativeKeywords = [
    '差评', '退货', '质量差', '破损', '假货', '不满意', '投诉', '欺骗',
    '退款', '骗人', '垃圾', '差劲', '有问题', '坏了', '不好', '恶心',
    'bad', 'terrible', 'broken', 'fake', 'scam', 'refund', 'worst',
    'disappointed', 'poor quality', 'damaged', 'defective'
  ];

  try {
    const orders = await shopify.getOrders({ status: 'any', limit: 50 });
    const flagged = [];

    for (const order of orders) {
      const note = (order.note || '').toLowerCase();
      if (!note) continue;

      const matched = negativeKeywords.filter(kw => note.includes(kw.toLowerCase()));
      if (matched.length > 0) {
        flagged.push({
          orderId: order.id,
          orderName: order.name,
          note: order.note,
          matchedKeywords: matched,
          customer: order.customer ? `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim() : '未知',
          createdAt: order.created_at
        });
      }
    }

    if (flagged.length > 0) {
      console.log(`⚠️ 发现 ${flagged.length} 条包含负面关键词的订单备注：\n`);
      for (const f of flagged) {
        console.log(`• 订单 ${f.orderName}（${f.customer}）`);
        console.log(`  备注：${f.note}`);
        console.log(`  触发词：${f.matchedKeywords.join(', ')}`);
        console.log(`  时间：${f.createdAt}`);
        console.log('');
      }
    } else {
      console.log('✅ 最近50条订单备注中未发现负面关键词');
    }

    console.log('─────────────────');
    console.log('📌 **关于 Shopify 商品评论（Reviews）**');
    console.log('Shopify 基础版不含评论系统，需安装额外 App：');
    console.log('• Shopify Product Reviews（免费官方插件）');
    console.log('• Judge.me（免费版可用，支持导入/导出）');
    console.log('• Loox（支持图片评论，付费）');
    console.log('• Yotpo（专业评论管理，付费）');
    console.log('\n安装后可通过对应 App 的 API 获取评论数据');

    const output = {
      action: 'review-monitor',
      flaggedOrders: flagged,
      flaggedCount: flagged.length,
      totalChecked: orders.length,
      note: 'Shopify 需安装 Product Reviews App 才能获取商品评论'
    };
    process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(output) + '\n');
  } catch (err) {
    console.error('❌ 获取订单数据失败：', err.message);
    process.exit(1);
  }
}

// ─── main ─────────────────────────────────────────────────

async function run() {
  switch (subcommand) {
    case 'faq-add': faqAdd(); break;
    case 'faq-search': faqSearch(); break;
    case 'faq-list': faqList(); break;
    case 'templates': templates(); break;
    case 'review-monitor': await reviewMonitor(); break;
    default:
      showHelp();
      if (subcommand) {
        console.error(`\n❌ 未知子命令：${subcommand}`);
        process.exit(1);
      }
  }
}

run().catch(err => {
  console.error('❌ 客服自动化错误：', err.message);
  process.exit(1);
});
