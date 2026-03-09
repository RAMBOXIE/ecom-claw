/**
 * 🏪 店铺运营 — 促销定价
 * modules/store/promotions.mjs
 *
 * CLI：
 *   node modules/store/promotions.mjs preview --discount 0.8 [--product-ids 1,2,3]
 *   node modules/store/promotions.mjs apply   --discount 0.8 [--product-ids 1,2,3] [--confirm]
 *   node modules/store/promotions.mjs restore [--confirm]
 *   node modules/store/promotions.mjs discounts list
 *   node modules/store/promotions.mjs discounts create --type percent --value 20 --code SAVE20 [--min-order 100]
 *   node modules/store/promotions.mjs discounts delete --rule-id ID [--confirm]
 *
 * 导出：previewDiscount / applyDiscount / restorePrices / listDiscounts / createDiscount / deleteDiscount
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, writeFileSync, existsSync } from 'fs';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const BACKUP_FILE = join(__dirname, '.price-backup.json');

async function shopify() { return import(`${ROOT}/connectors/shopify.js`); }
async function audit()   { return import(`${ROOT}/audit/logger.mjs`); }
async function approval(){ return import(`${ROOT}/audit/approval.mjs`); }

// ─── 核心 API ──────────────────────────────────────────────────

/** 预览折扣效果（不执行） */
export async function previewDiscount({ discount, productIds = [] } = {}) {
  const s = await shopify();
  const products = productIds.length
    ? await Promise.all(productIds.map(id => s.getProduct(id)))
    : await s.getProducts({ limit: 250, status: 'active' });

  let totalItems = 0, totalSavings = 0;
  const preview = [];

  products.forEach(p => {
    (p.variants || []).forEach(v => {
      const oldPrice = parseFloat(v.price);
      const newPrice = +(oldPrice * discount).toFixed(2);
      const saving   = +(oldPrice - newPrice).toFixed(2);
      totalItems++;
      totalSavings += saving;
      preview.push({
        productId: p.id, productTitle: p.title,
        variantId: v.id, variantTitle: v.title,
        oldPrice, newPrice, saving,
        discountPct: Math.round((1 - discount) * 100),
      });
    });
  });

  return {
    discount, discountPct: Math.round((1 - discount) * 100),
    totalItems, totalSavings: +totalSavings.toFixed(2),
    affectedProducts: products.length,
    preview,
    hasBackup: existsSync(BACKUP_FILE),
  };
}

/** 应用折扣（高风险，触发审批） */
export async function applyDiscount({ discount, productIds = [], confirm = false } = {}) {
  const ap = await approval();
  const au = await audit();
  const s  = await shopify();

  const previewData = await previewDiscount({ discount, productIds });

  if (!confirm) {
    const apRecord = await ap.requestApproval({
      action: 'bulk_price',
      description: `全店${Math.round((1-discount)*100)}折，影响 ${previewData.totalItems} 个变体，总让利 ¥${previewData.totalSavings}`,
      params: { discount, productIds },
      command: `node ${ROOT}/scripts/promotion.mjs apply --discount ${discount}${productIds.length ? ' --product-ids ' + productIds.join(',') : ''} --confirm`,
      preview: {
        '折扣': `${Math.round((1-discount)*100)}折`,
        '影响变体': `${previewData.totalItems} 个`,
        '总让利': `¥${previewData.totalSavings}`,
        '商品数': previewData.affectedProducts,
      },
    });
    return { pending: true, approvalId: apRecord.id, shortId: apRecord.id.slice(0,8), preview: previewData };
  }

  // 备份原价
  const backup = {};
  previewData.preview.forEach(item => {
    backup[item.variantId] = item.oldPrice;
  });
  writeFileSync(BACKUP_FILE, JSON.stringify(backup, null, 2), 'utf8');

  // 批量更新
  const updates = previewData.preview.map(item => ({
    variantId: item.variantId, price: item.newPrice.toString(),
  }));
  await s.bulkUpdatePrices(updates);
  await au.writeAuditLog({ action: 'bulk_price_apply', discount, totalItems: previewData.totalItems });

  return { ok: true, discount, totalItems: previewData.totalItems, totalSavings: previewData.totalSavings };
}

/** 恢复原价（高风险，触发审批） */
export async function restorePrices({ confirm = false } = {}) {
  const ap = await approval();
  const au = await audit();
  const s  = await shopify();

  if (!existsSync(BACKUP_FILE)) throw new Error('找不到价格备份文件，无法恢复。请确认之前是否执行过折扣。');
  const backup = JSON.parse(readFileSync(BACKUP_FILE, 'utf8'));
  const count  = Object.keys(backup).length;

  if (!confirm) {
    const apRecord = await ap.requestApproval({
      action: 'bulk_price',
      description: `恢复原价，将更新 ${count} 个变体的价格`,
      params: {},
      command: `node ${ROOT}/scripts/promotion.mjs restore --confirm`,
      preview: { '变体数': count, '操作': '恢复原价' },
    });
    return { pending: true, approvalId: apRecord.id, shortId: apRecord.id.slice(0,8) };
  }

  const updates = Object.entries(backup).map(([variantId, price]) => ({
    variantId: parseInt(variantId), price: price.toString(),
  }));
  await s.bulkUpdatePrices(updates);
  await au.writeAuditLog({ action: 'bulk_price_restore', count });

  return { ok: true, restored: count };
}

/** 折扣码列表 */
export async function listDiscounts() {
  const s = await shopify();
  const rules = await s.getPriceRules();
  return rules.map(r => ({
    ruleId:    r.id,
    title:     r.title,
    type:      r.value_type,
    value:     r.value,
    minOrder:  r.prerequisite_subtotal_range?.greater_than_or_equal_to || 0,
    startsAt:  r.starts_at,
    endsAt:    r.ends_at,
    status:    r.status,
  }));
}

/** 创建折扣码 */
export async function createDiscount({ type = 'percentage', value, code, minOrder = 0, startsAt, endsAt } = {}) {
  const s  = await shopify();
  const au = await audit();

  const rule = await s.createPriceRule({
    title:       `${code}_${Date.now()}`,
    target_type: 'line_item',
    target_selection: 'all',
    allocation_method: 'across',
    value_type:  type === 'percent' || type === 'percentage' ? 'percentage' : 'fixed_amount',
    value:       `-${Math.abs(parseFloat(value))}`,
    customer_selection: 'all',
    prerequisite_subtotal_range: minOrder > 0 ? { greater_than_or_equal_to: minOrder.toString() } : undefined,
    starts_at:   startsAt || new Date().toISOString(),
    ends_at:     endsAt || null,
  });

  const discount = await s.createDiscountCode(rule.id, code);
  await au.writeAuditLog({ action: 'discount_create', ruleId: rule.id, code, type, value, minOrder });

  return { ok: true, ruleId: rule.id, code: discount.code, type, value };
}

/** 删除折扣码规则（高风险） */
export async function deleteDiscount(ruleId, { confirm = false } = {}) {
  const ap = await approval();
  const au = await audit();
  const s  = await shopify();

  if (!confirm) {
    const apRecord = await ap.requestApproval({
      action: 'discount_delete',
      description: `删除折扣规则 ID ${ruleId}，该规则下所有折扣码将失效`,
      params: { ruleId },
      command: `node ${ROOT}/scripts/discount-codes.mjs delete --rule-id ${ruleId} --confirm`,
      preview: { '规则 ID': ruleId },
    });
    return { pending: true, approvalId: apRecord.id, shortId: apRecord.id.slice(0,8) };
  }

  await s.deletePriceRule(ruleId);
  await au.writeAuditLog({ action: 'discount_delete', ruleId });
  return { ok: true, ruleId };
}

// ─── CLI ──────────────────────────────────────────────────────
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const cmd  = args[0];
  const sub  = args[1];
  const get  = f => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };
  const has  = f => args.includes(f);

  async function run() {
    switch (cmd) {
      case 'preview': {
        const discount    = parseFloat(get('--discount') || '1');
        const productIds  = get('--product-ids')?.split(',').map(Number).filter(Boolean) || [];
        if (discount <= 0 || discount > 1) { console.error('❌ --discount 应为 0-1 之间的小数，如 0.8 = 8折'); break; }
        console.log(`\n🏷️  折扣预览 — ${Math.round((1-discount)*100)}折\n`);
        const p = await previewDiscount({ discount, productIds });
        console.log(`  影响商品：${p.affectedProducts} 个  变体：${p.totalItems} 个  总让利：¥${p.totalSavings}`);
        console.log(`\n  商品预览（前 10 条）：`);
        p.preview.slice(0, 10).forEach(i => {
          console.log(`    ${i.productTitle} — ${i.variantTitle}：¥${i.oldPrice} → ¥${i.newPrice}`);
        });
        if (!p.hasBackup) console.log('\n  ⚠️  尚无价格备份，执行后可恢复原价');
        process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(p) + '\n');
        break;
      }

      case 'apply': {
        const discount   = parseFloat(get('--discount') || '1');
        const productIds = get('--product-ids')?.split(',').map(Number).filter(Boolean) || [];
        if (discount <= 0 || discount > 1) { console.error('❌ --discount 应为 0-1 之间的小数'); break; }
        const result = await applyDiscount({ discount, productIds, confirm: has('--confirm') });
        if (result.pending) console.log(`\n⏳ 批量改价审批已发送（ID: ${result.shortId}），等待确认`);
        else console.log(`\n✅ 折扣已应用，更新 ${result.totalItems} 个变体，让利 ¥${result.totalSavings}`);
        process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(result) + '\n');
        break;
      }

      case 'restore': {
        const result = await restorePrices({ confirm: has('--confirm') });
        if (result.pending) console.log(`\n⏳ 恢复原价审批已发送（ID: ${result.shortId}）`);
        else console.log(`\n✅ 原价已恢复，更新 ${result.restored} 个变体`);
        process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(result) + '\n');
        break;
      }

      case 'discounts': {
        switch (sub) {
          case 'list': {
            console.log('\n🏷️  折扣码列表\n');
            const list = await listDiscounts();
            if (list.length === 0) { console.log('  暂无折扣码'); break; }
            list.forEach(r => {
              const val = r.type === 'percentage' ? `${Math.abs(r.value)}折扣` : `减¥${Math.abs(r.value)}`;
              console.log(`  [${r.ruleId}] ${r.title}  ${val}  最低消费¥${r.minOrder}`);
            });
            process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify({ list }) + '\n');
            break;
          }
          case 'create': {
            const type     = get('--type') || 'percent';
            const value    = get('--value'); if (!value) { console.error('❌ 缺少 --value'); break; }
            const code     = get('--code');  if (!code)  { console.error('❌ 缺少 --code'); break; }
            const minOrder = parseFloat(get('--min-order') || '0');
            const result   = await createDiscount({ type, value, code, minOrder });
            console.log(`\n✅ 折扣码已创建：${result.code}  ${type === 'percent' ? value + '% off' : '减¥' + value}`);
            process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(result) + '\n');
            break;
          }
          case 'delete': {
            const ruleId = get('--rule-id'); if (!ruleId) { console.error('❌ 缺少 --rule-id'); break; }
            const result = await deleteDiscount(ruleId, { confirm: has('--confirm') });
            if (result.pending) console.log(`\n⏳ 删除审批已发送（ID: ${result.shortId}）`);
            else console.log(`\n✅ 折扣规则 ${ruleId} 已删除`);
            process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(result) + '\n');
            break;
          }
          default:
            console.log('用法：node modules/store/promotions.mjs discounts list|create|delete');
        }
        break;
      }

      default:
        console.log(`
🏷️  促销定价

  node modules/store/promotions.mjs preview   --discount 0.8 [--product-ids 1,2]
  node modules/store/promotions.mjs apply     --discount 0.8 [--product-ids 1,2] [--confirm]
  node modules/store/promotions.mjs restore   [--confirm]

  node modules/store/promotions.mjs discounts list
  node modules/store/promotions.mjs discounts create --type percent --value 20 --code SAVE20 [--min-order 100]
  node modules/store/promotions.mjs discounts delete --rule-id ID [--confirm]

  高风险操作（apply/restore/delete）默认发审批，加 --confirm 跳过`);
    }
  }

  run().catch(e => { console.error('❌', e.message); process.exit(1); });
}
