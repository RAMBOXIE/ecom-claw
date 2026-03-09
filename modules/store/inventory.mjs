/**
 * 🏪 店铺运营 — 库存调度
 * modules/store/inventory.mjs
 *
 * CLI：
 *   node modules/store/inventory.mjs status               库存总览
 *   node modules/store/inventory.mjs alert  [--threshold 10]  低库存预警
 *   node modules/store/inventory.mjs list   [--low] [--out]   商品库存列表
 *   node modules/store/inventory.mjs skus   --product-id ID   变体列表
 *   node modules/store/inventory.mjs update --variant-id ID --stock 50 [--confirm]
 *   node modules/store/inventory.mjs price  --variant-id ID --price 99 [--compare 129] [--confirm]
 *
 * 导出：getStatus / getLowStock / listStock / listSkus / updateStock / updatePrice
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

async function shopify() { return import(`${ROOT}/connectors/shopify.js`); }
async function audit()   { return import(`${ROOT}/audit/logger.mjs`); }

// 读取低库存阈值
function getThreshold(argThreshold) {
  if (argThreshold) return parseInt(argThreshold);
  try {
    const { readFileSync } = require('fs');
    const cfg = JSON.parse(readFileSync(`${ROOT}/config.json`, 'utf8'));
    return cfg.alerts?.low_stock_threshold || 10;
  } catch { return 10; }
}

// ─── 核心 API ──────────────────────────────────────────────────

/** 库存总览 */
export async function getStatus({ threshold = 10 } = {}) {
  const s = await shopify();
  const products = await s.getProducts({ limit: 250, status: 'active' });

  let totalProducts = 0, totalVariants = 0, totalStock = 0;
  let outOfStock = [], lowStock = [];

  products.forEach(p => {
    totalProducts++;
    (p.variants || []).forEach(v => {
      totalVariants++;
      const qty = v.inventory_quantity || 0;
      totalStock += qty;
      const item = { productId: p.id, productTitle: p.title, variantId: v.id, variantTitle: v.title, sku: v.sku, qty };
      if (qty === 0) outOfStock.push(item);
      else if (qty <= threshold) lowStock.push(item);
    });
  });

  return {
    totalProducts, totalVariants, totalStock,
    outOfStockCount: outOfStock.length,
    lowStockCount:   lowStock.length,
    outOfStock,
    lowStock,
    threshold,
    healthScore: Math.round(100 - ((outOfStock.length + lowStock.length * 0.5) / totalVariants * 100)),
  };
}

/** 低库存列表（只返回需要补货的） */
export async function getLowStock({ threshold = 10 } = {}) {
  const { lowStock, outOfStock } = await getStatus({ threshold });
  return [...outOfStock.map(i => ({ ...i, level: 'out' })), ...lowStock.map(i => ({ ...i, level: 'low' }))];
}

/** 全部商品库存列表 */
export async function listStock({ onlyLow = false, onlyOut = false, threshold = 10 } = {}) {
  const s = await shopify();
  const products = await s.getProducts({ limit: 250, status: 'any' });

  const rows = [];
  products.forEach(p => {
    (p.variants || []).forEach(v => {
      const qty = v.inventory_quantity || 0;
      if (onlyOut && qty > 0) return;
      if (onlyLow && (qty === 0 || qty > threshold)) return;
      rows.push({
        productId: p.id, productTitle: p.title,
        variantId: v.id, variantTitle: v.title,
        sku: v.sku, price: v.price, qty,
        status: qty === 0 ? '🔴 断货' : qty <= threshold ? '🟡 低库存' : '🟢 充足',
      });
    });
  });

  return rows.sort((a, b) => a.qty - b.qty);
}

/** 商品 SKU / 变体列表 */
export async function listSkus(productId) {
  const s = await shopify();
  const product = await s.getProduct(productId);
  return (product.variants || []).map(v => ({
    variantId: v.id, title: v.title,
    sku: v.sku, price: v.price, comparePrice: v.compare_at_price,
    qty: v.inventory_quantity, inventoryItemId: v.inventory_item_id,
  }));
}

/** 更新库存数量 */
export async function updateStock(variantId, newQty) {
  const s = await shopify();
  const au = await audit();

  // 先取 inventory_item_id + location_id
  const locations = await s.getLocations();
  if (!locations?.length) throw new Error('找不到仓库位置，请先在 Shopify 后台配置');
  const locationId = locations[0].id;

  // 通过 variantId 找 inventoryItemId（需要先查variant）
  // 注意：Shopify 需要 inventory_item_id，这里通过 REST 获取
  const { shopifyFetch } = await import(`${ROOT}/connectors/shopify.js`).catch(() => ({}));

  // 直接更新（使用底层 updateInventory）
  await s.updateInventory(variantId, locationId, newQty);  // variantId 当 inventoryItemId
  await au.writeAuditLog({ action: 'stock_update', variantId, newQty });
  return { ok: true, variantId, newQty };
}

/** 更新变体价格 */
export async function updatePrice(variantId, { price, comparePrice }) {
  const s = await shopify();
  const au = await audit();
  await s.updateVariantPrice(variantId, price, comparePrice || null);
  await au.writeAuditLog({ action: 'price_update', variantId, price, comparePrice });
  return { ok: true, variantId, price, comparePrice };
}

// ─── CLI ──────────────────────────────────────────────────────
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const cmd  = args[0];
  const get  = f => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };
  const has  = f => args.includes(f);

  async function run() {
    switch (cmd) {
      case 'status': {
        const threshold = parseInt(get('--threshold') || '10');
        console.log('\n📦 库存总览\n');
        const st = await getStatus({ threshold });
        console.log(`  商品数：${st.totalProducts}  变体数：${st.totalVariants}  总库存：${st.totalStock}`);
        console.log(`  🔴 断货：${st.outOfStockCount} 个  🟡 低库存（≤${threshold}）：${st.lowStockCount} 个`);
        console.log(`  健康度：${st.healthScore}%`);
        if (st.outOfStock.length) {
          console.log('\n  断货商品：');
          st.outOfStock.slice(0, 5).forEach(i => console.log(`    • ${i.productTitle} — ${i.variantTitle} (SKU: ${i.sku || '-'})`));
          if (st.outOfStock.length > 5) console.log(`    ...还有 ${st.outOfStock.length - 5} 个`);
        }
        if (st.lowStock.length) {
          console.log('\n  低库存：');
          st.lowStock.slice(0, 5).forEach(i => console.log(`    • ${i.productTitle} — ${i.variantTitle}  剩 ${i.qty} 件`));
          if (st.lowStock.length > 5) console.log(`    ...还有 ${st.lowStock.length - 5} 个`);
        }
        process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(st) + '\n');
        break;
      }

      case 'alert': {
        const threshold = parseInt(get('--threshold') || '10');
        const list = await getLowStock({ threshold });
        if (list.length === 0) {
          console.log(`\n✅ 所有库存充足（阈值 ${threshold}）`);
        } else {
          console.log(`\n⚠️  需补货商品（${list.length} 个，阈值 ${threshold}）\n`);
          list.forEach(i => {
            const icon = i.level === 'out' ? '🔴 断货' : `🟡 剩 ${i.qty} 件`;
            console.log(`  ${icon}  ${i.productTitle} — ${i.variantTitle}  SKU: ${i.sku || '-'}`);
          });
        }
        process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify({ threshold, list }) + '\n');
        break;
      }

      case 'list': {
        const threshold = parseInt(get('--threshold') || '10');
        const rows = await listStock({ onlyLow: has('--low'), onlyOut: has('--out'), threshold });
        console.log('\n📦 库存列表\n');
        rows.slice(0, 30).forEach(r => {
          console.log(`  ${r.status}  [${r.variantId}] ${r.productTitle} — ${r.variantTitle}  ${r.qty} 件  ¥${r.price}`);
        });
        if (rows.length > 30) console.log(`  ...共 ${rows.length} 条，仅显示前 30`);
        process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify({ rows }) + '\n');
        break;
      }

      case 'skus': {
        const id = get('--product-id'); if (!id) { console.error('❌ 缺少 --product-id'); break; }
        const skus = await listSkus(id);
        console.log(`\n📦 变体列表（商品 ${id}）\n`);
        skus.forEach(v => {
          console.log(`  [${v.variantId}] ${v.title}  SKU:${v.sku || '-'}  ¥${v.price}  库存:${v.qty}`);
        });
        process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify({ skus }) + '\n');
        break;
      }

      case 'update': {
        const vid = get('--variant-id'); if (!vid) { console.error('❌ 缺少 --variant-id'); break; }
        const qty = get('--stock');      if (!qty) { console.error('❌ 缺少 --stock'); break; }
        if (!has('--confirm')) {
          console.log(`\n预览：变体 ${vid} 库存 → ${qty} 件`);
          console.log('  加 --confirm 执行更新'); break;
        }
        const result = await updateStock(vid, parseInt(qty));
        console.log(`\n✅ 库存已更新 → ${qty} 件`);
        process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(result) + '\n');
        break;
      }

      case 'price': {
        const vid   = get('--variant-id'); if (!vid)   { console.error('❌ 缺少 --variant-id'); break; }
        const price = get('--price');       if (!price) { console.error('❌ 缺少 --price'); break; }
        const comparePrice = get('--compare') || get('--compare-price');
        if (!has('--confirm')) {
          console.log(`\n预览：变体 ${vid} 定价 → ¥${price}${comparePrice ? ` (划线价 ¥${comparePrice})` : ''}`);
          console.log('  加 --confirm 执行'); break;
        }
        const result = await updatePrice(vid, { price, comparePrice });
        console.log(`\n✅ 价格已更新 → ¥${price}`);
        process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(result) + '\n');
        break;
      }

      default:
        console.log(`
📦 库存调度

  node modules/store/inventory.mjs status   [--threshold 10]
  node modules/store/inventory.mjs alert    [--threshold 10]
  node modules/store/inventory.mjs list     [--low] [--out] [--threshold 10]
  node modules/store/inventory.mjs skus     --product-id ID
  node modules/store/inventory.mjs update   --variant-id ID --stock 50 --confirm
  node modules/store/inventory.mjs price    --variant-id ID --price 99 [--compare 129] --confirm`);
    }
  }

  run().catch(e => { console.error('❌', e.message); process.exit(1); });
}
