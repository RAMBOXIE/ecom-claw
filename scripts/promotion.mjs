/**
 * 营销工具 — 批量打折/恢复原价
 * 电商龙虾 — 全店或指定商品折扣管理
 *
 * 用法：
 *   node promotion.mjs preview --discount 0.8                    预览全店8折
 *   node promotion.mjs preview --discount 0.8 --product-ids 1,2  预览指定商品
 *   node promotion.mjs apply --discount 0.8 --confirm            应用折扣
 *   node promotion.mjs restore --confirm                         恢复原价
 */

import { getProducts, getProduct, updateVariantPrice, bulkUpdatePrices } from '../connectors/shopify.js';
import { requestApproval } from '../audit/approval.mjs';
import { writeAuditLog } from '../audit/logger.mjs';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PRICE_BACKUP_FILE = join(__dirname, '..', '.price-backup.json');

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
  console.log(`🦞 电商龙虾 — 营销工具

用法：
  node promotion.mjs preview --discount 0.8                     预览打折效果
  node promotion.mjs apply --discount 0.8 --confirm             应用折扣
  node promotion.mjs restore --confirm                          恢复原价

子命令：
  preview    预览打折效果（不修改数据）
  apply      应用折扣（需要 --confirm）
  restore    恢复原价（需要 --confirm）

参数：
  --discount       折扣率（如 0.8 = 8折，0.65 = 6.5折）
  --product-ids    指定商品ID，逗号分隔（不填则全店）
  --confirm        确认执行（apply/restore 必须）
`);
}

async function getTargetProducts(productIds) {
  if (productIds) {
    const ids = productIds.split(',').map(s => s.trim());
    const products = [];
    for (const id of ids) {
      const p = await getProduct(id);
      products.push(p);
    }
    return products;
  }
  return getProducts({ limit: 250, status: 'active' });
}

function calculateDiscountedPrices(products, discountRate) {
  const items = [];
  for (const product of products) {
    for (const variant of product.variants || []) {
      const originalPrice = parseFloat(variant.price);
      const discountedPrice = Math.round(originalPrice * discountRate * 100) / 100;

      items.push({
        productId: product.id,
        productTitle: product.title,
        variantId: variant.id,
        variantTitle: variant.title,
        sku: variant.sku,
        originalPrice: originalPrice.toFixed(2),
        discountedPrice: discountedPrice.toFixed(2),
        savings: (originalPrice - discountedPrice).toFixed(2)
      });
    }
  }
  return items;
}

async function preview() {
  const discountStr = getArg('--discount');
  const productIds = getArg('--product-ids');

  if (!discountStr) {
    console.error('❌ 缺少 --discount 参数（如 --discount 0.8）');
    process.exit(1);
  }

  const discount = parseFloat(discountStr);
  if (discount <= 0 || discount >= 1) {
    console.error('❌ 折扣率须在 0~1 之间（如 0.8 = 8折）');
    process.exit(1);
  }

  console.log(`🦞 打折预览 — ${(discount * 10).toFixed(1)}折\n`);

  const products = await getTargetProducts(productIds);
  const items = calculateDiscountedPrices(products, discount);

  console.log(`影响商品：${products.length} 个 | SKU数：${items.length}\n`);

  items.forEach(item => {
    const label = item.variantTitle !== 'Default Title' ? ` (${item.variantTitle})` : '';
    console.log(`  ${item.productTitle}${label}`);
    console.log(`    ${item.originalPrice} → ${item.discountedPrice}（省 ${item.savings}）`);
  });

  const totalSavings = items.reduce((s, i) => s + parseFloat(i.savings), 0);
  console.log(`\n📊 共影响 ${items.length} 个 SKU，平均每件省 ${(totalSavings / items.length).toFixed(2)}`);

  process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify({
    action: 'preview',
    discount,
    discountLabel: `${(discount * 10).toFixed(1)}折`,
    productCount: products.length,
    skuCount: items.length,
    items,
    totalSavings: totalSavings.toFixed(2)
  }) + '\n');
}

async function apply() {
  const discountStr = getArg('--discount');
  const productIds = getArg('--product-ids');
  const confirmed = hasFlag('--confirm');

  if (!discountStr) {
    console.error('❌ 缺少 --discount 参数');
    process.exit(1);
  }

  const discount = parseFloat(discountStr);
  if (discount <= 0 || discount >= 1) {
    console.error('❌ 折扣率须在 0~1 之间');
    process.exit(1);
  }

  const products = await getTargetProducts(productIds);
  const items = calculateDiscountedPrices(products, discount);

  const force = hasFlag('--force'); // 审批系统批准后使用

  if (!confirmed && !force) {
    console.log(`⚠️  即将对 ${items.length} 个 SKU 应用 ${(discount * 10).toFixed(1)}折`);
    console.log('   添加 --confirm 发起审批请求');
    process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify({ action: 'apply', preview: true, skuCount: items.length }) + '\n');
    return;
  }

  // ── 审批流：--confirm 触发审批请求 ──────────────────────
  if (confirmed && !force) {
    const discountLabel = `${(discount * 10).toFixed(1)}折`;
    const productIdsPart = productIds ? ` --product-ids ${productIds}` : '';
    const command = `node scripts/promotion.mjs apply --discount ${discountStr}${productIdsPart} --force`;

    console.log(`📨 发起审批请求...`);
    const approval = await requestApproval({
      action: 'bulk_price',
      description: `全店批量改价：${discountLabel}，影响 ${products.length} 个商品，${items.length} 个 SKU`,
      params: { discount, productIds, skuCount: items.length },
      command,
      preview: {
        '折扣率': discountLabel,
        '影响商品数': `${products.length} 个`,
        '影响SKU数': `${items.length} 个`,
        '示例': items.slice(0,3).map(i => `${i.productTitle} ${i.originalPrice}→${i.discountedPrice}`).join(' | ')
      }
    });

    console.log(`\n⏳ 审批请求已创建，等待确认`);
    console.log(`   审批 ID：${approval.id.slice(0,8)}`);
    console.log(`   Telegram 已推送通知，点击「✅ 批准」执行改价`);
    console.log(`   或手动批准：node audit/approval.mjs approve --id ${approval.id.slice(0,8)}`);

    process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify({
      action: 'apply',
      status: 'pending_approval',
      approvalId: approval.id,
      discount,
      skuCount: items.length
    }) + '\n');
    return;
  }

  // ── --force：审批通过后执行 ──────────────────────────────
  console.log(`🦞 应用折扣 — ${(discount * 10).toFixed(1)}折（审批已通过）\n`);

  // 备份原价
  const backup = items.map(item => ({
    variantId: item.variantId,
    productTitle: item.productTitle,
    originalPrice: item.originalPrice
  }));
  writeFileSync(PRICE_BACKUP_FILE, JSON.stringify(backup, null, 2), 'utf8');
  console.log(`💾 原价已备份至 .price-backup.json\n`);

  // 批量更新价格
  const updates = items.map(item => ({
    variantId: item.variantId,
    price: item.discountedPrice,
    comparePrice: item.originalPrice
  }));

  await bulkUpdatePrices(updates);
  await writeAuditLog({ action: 'price_change', discount, skuCount: items.length, canRollback: true });

  console.log(`✅ 折扣已应用！共更新 ${items.length} 个 SKU`);

  process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify({
    action: 'apply',
    success: true,
    discount,
    skuCount: items.length,
    backupFile: PRICE_BACKUP_FILE
  }) + '\n');
}

async function restore() {
  const confirmed = hasFlag('--confirm');
  const force = hasFlag('--force');

  if (!existsSync(PRICE_BACKUP_FILE)) {
    console.error('❌ 未找到价格备份文件（.price-backup.json），无法恢复');
    process.exit(1);
  }

  const backup = JSON.parse(readFileSync(PRICE_BACKUP_FILE, 'utf8'));

  console.log(`⚠️  即将恢复 ${backup.length} 个 SKU 的原价：`);
  backup.slice(0, 3).forEach(item => console.log(`  ${item.productTitle} → ${item.originalPrice}`));
  if (backup.length > 3) console.log(`  ...还有 ${backup.length - 3} 个`);

  if (!confirmed && !force) {
    console.log('\n   添加 --confirm 发起审批请求');
    process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify({ action: 'restore', preview: true, skuCount: backup.length }) + '\n');
    return;
  }

  if (confirmed && !force) {
    const approval = await requestApproval({
      action: 'bulk_price',
      description: `恢复原价：将 ${backup.length} 个 SKU 还原至打折前价格`,
      params: { skuCount: backup.length },
      command: `node scripts/promotion.mjs restore --force`,
      preview: { 'SKU 数量': `${backup.length} 个`, '操作': '恢复打折前原价' }
    });
    console.log(`\n⏳ 审批请求已创建，审批 ID：${approval.id.slice(0,8)}`);
    console.log(`   Telegram 已推送通知，点击「✅ 批准」恢复原价`);
    process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify({ action: 'restore', status: 'pending_approval', approvalId: approval.id }) + '\n');
    return;
  }

  console.log(`\n🦞 恢复原价中（审批已通过）...\n`);
  const updates = backup.map(item => ({ variantId: item.variantId, price: item.originalPrice, comparePrice: null }));
  await bulkUpdatePrices(updates);
  await writeAuditLog({ action: 'price_change', note: '恢复原价', skuCount: backup.length, canRollback: false });

  console.log(`✅ 原价已恢复！共更新 ${backup.length} 个 SKU`);
  process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify({ action: 'restore', success: true, skuCount: backup.length }) + '\n');
}

async function run() {
  if (!subcommand || subcommand === '--help') {
    showHelp();
    return;
  }

  switch (subcommand) {
    case 'preview':
      await preview();
      break;
    case 'apply':
      await apply();
      break;
    case 'restore':
      await restore();
      break;
    default:
      console.error(`❌ 未知子命令：${subcommand}`);
      showHelp();
      process.exit(1);
  }
}

run().catch(err => {
  console.error('❌ 营销操作失败：', err.message);
  process.exit(1);
});
