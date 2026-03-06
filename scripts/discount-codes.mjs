/**
 * 折扣码管理
 * 电商龙虾 — 创建/列出/删除 Shopify 折扣码
 *
 * 用法：
 *   node discount-codes.mjs create [--code CODE] --type percent|fixed --value 20 [--min-order 100] [--limit 50] [--expires 2026-12-31]
 *   node discount-codes.mjs list
 *   node discount-codes.mjs delete --rule-id 12345
 */

import { createPriceRule, createDiscountCode, getPriceRules, deletePriceRule } from '../connectors/shopify.js';
import crypto from 'crypto';

const args = process.argv.slice(2);
const subcommand = args[0];

function getArg(flag) {
  const i = args.indexOf(flag);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
}

function showHelp() {
  console.log(`🦞 电商龙虾 — 折扣码管理

用法：
  node discount-codes.mjs create [--code CODE] --type percent|fixed --value 20 [--min-order 100] [--limit 50] [--expires 2026-12-31]
  node discount-codes.mjs list
  node discount-codes.mjs delete --rule-id 12345

参数说明：
  --code      折扣码（不填则随机生成）
  --type      percent=百分比折扣 / fixed=固定金额折扣
  --value     折扣值（如20代表20%或20元）
  --min-order 最低消费金额
  --limit     使用次数上限
  --expires   过期日期 YYYY-MM-DD`);
}

function generateCode() {
  return 'EC' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

// ─── create ───────────────────────────────────────────────

async function cmdCreate() {
  const code = getArg('--code') || generateCode();
  const type = getArg('--type');
  const value = getArg('--value');
  const minOrder = getArg('--min-order');
  const limit = getArg('--limit');
  const expires = getArg('--expires');

  if (!type || !value) {
    console.error('❌ 缺少 --type 或 --value 参数');
    process.exit(1);
  }

  if (type !== 'percent' && type !== 'fixed') {
    console.error('❌ --type 必须为 percent 或 fixed');
    process.exit(1);
  }

  const numValue = parseFloat(value);
  if (isNaN(numValue) || numValue <= 0) {
    console.error('❌ --value 必须为正数');
    process.exit(1);
  }

  // 构建价格规则
  const ruleData = {
    title: code,
    target_type: 'line_item',
    target_selection: 'all',
    allocation_method: 'across',
    customer_selection: 'all',
    starts_at: new Date().toISOString()
  };

  if (type === 'percent') {
    ruleData.value_type = 'percentage';
    ruleData.value = String(-numValue); // Shopify 需要负数
  } else {
    ruleData.value_type = 'fixed_amount';
    ruleData.value = String(-numValue);
  }

  if (minOrder) {
    ruleData.prerequisite_subtotal_range = { greater_than_or_equal_to: String(minOrder) };
  }

  if (limit) {
    ruleData.usage_limit = parseInt(limit);
  }

  if (expires) {
    ruleData.ends_at = new Date(expires + 'T23:59:59Z').toISOString();
  }

  console.log('🦞 电商龙虾 — 创建折扣码\n');

  try {
    const priceRule = await createPriceRule(ruleData);
    const discount = await createDiscountCode(priceRule.id, code);

    console.log('✅ 折扣码创建成功！\n');
    console.log(`🏷️ 折扣码：${discount.code}`);
    console.log(`📋 规则ID：${priceRule.id}`);
    console.log(`💰 类型：${type === 'percent' ? `${numValue}% 百分比折扣` : `¥${numValue} 固定金额折扣`}`);
    if (minOrder) console.log(`🛒 最低消费：¥${minOrder}`);
    if (limit) console.log(`🔢 使用次数上限：${limit}`);
    console.log(`📅 生效时间：${ruleData.starts_at}`);
    if (expires) console.log(`📅 过期时间：${ruleData.ends_at}`);

    const output = {
      action: 'create',
      discountCode: discount.code,
      priceRuleId: priceRule.id,
      type,
      value: numValue,
      minOrder: minOrder ? parseFloat(minOrder) : null,
      usageLimit: limit ? parseInt(limit) : null,
      startsAt: ruleData.starts_at,
      endsAt: ruleData.ends_at || null
    };
    process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(output) + '\n');
  } catch (err) {
    console.error('❌ 创建折扣码失败：', err.message);
    process.exit(1);
  }
}

// ─── list ─────────────────────────────────────────────────

async function cmdList() {
  console.log('🦞 电商龙虾 — 折扣码列表\n');

  try {
    const rules = await getPriceRules();

    if (rules.length === 0) {
      console.log('暂无折扣码');
    } else {
      console.log(`共 ${rules.length} 条价格规则：\n`);

      for (const rule of rules) {
        const valueDisplay = rule.value_type === 'percentage'
          ? `${Math.abs(parseFloat(rule.value))}%`
          : `¥${Math.abs(parseFloat(rule.value))}`;

        const now = new Date();
        const endsAt = rule.ends_at ? new Date(rule.ends_at) : null;
        const isExpired = endsAt && endsAt < now;
        const status = isExpired ? '❌ 已过期' : '✅ 有效';

        console.log(`• ${rule.title}（${status}）`);
        console.log(`  规则ID：${rule.id}`);
        console.log(`  折扣：${valueDisplay}（${rule.value_type === 'percentage' ? '百分比' : '固定金额'}）`);
        if (rule.usage_limit) console.log(`  使用上限：${rule.usage_limit}（已用 ${rule.times_used || 0}）`);
        if (rule.prerequisite_subtotal_range?.greater_than_or_equal_to) {
          console.log(`  最低消费：¥${rule.prerequisite_subtotal_range.greater_than_or_equal_to}`);
        }
        console.log(`  生效：${rule.starts_at}`);
        if (rule.ends_at) console.log(`  过期：${rule.ends_at}`);
        console.log('');
      }
    }

    const output = { action: 'list', priceRules: rules, count: rules.length };
    process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(output) + '\n');
  } catch (err) {
    console.error('❌ 获取折扣码列表失败：', err.message);
    process.exit(1);
  }
}

// ─── delete ───────────────────────────────────────────────

async function cmdDelete() {
  const ruleId = getArg('--rule-id');

  if (!ruleId) {
    console.error('❌ 缺少 --rule-id 参数');
    process.exit(1);
  }

  console.log('🦞 电商龙虾 — 删除折扣码\n');

  try {
    await deletePriceRule(ruleId);
    console.log(`✅ 已删除价格规则 ${ruleId}`);

    const output = { action: 'delete', deletedRuleId: ruleId };
    process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(output) + '\n');
  } catch (err) {
    console.error(`❌ 删除失败：${err.message}`);
    process.exit(1);
  }
}

// ─── main ─────────────────────────────────────────────────

async function run() {
  switch (subcommand) {
    case 'create': await cmdCreate(); break;
    case 'list': await cmdList(); break;
    case 'delete': await cmdDelete(); break;
    default:
      showHelp();
      if (subcommand) {
        console.error(`\n❌ 未知子命令：${subcommand}`);
        process.exit(1);
      }
  }
}

run().catch(err => {
  console.error('❌ 折扣码管理错误：', err.message);
  process.exit(1);
});
