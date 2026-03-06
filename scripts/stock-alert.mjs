/**
 * 库存预警
 * 电商龙虾 — 检查低库存 SKU，生成预警消息
 *
 * 用法：node stock-alert.mjs [threshold]
 */

import { getLowStockProducts, getShopInfo } from '../connectors/shopify.js';

const threshold = parseInt(process.argv[2]) || undefined;

async function run() {
  const [lowStock, shop] = await Promise.all([
    getLowStockProducts(threshold),
    getShopInfo()
  ]);

  if (lowStock.length === 0) {
    console.log('✅ 库存正常，无预警');
    process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify({ ok: true, lowStock: [], message: null }) + '\n');
    return;
  }

  // 按库存量升序
  lowStock.sort((a, b) => a.quantity - b.quantity);

  const critical = lowStock.filter(p => p.quantity <= 3);
  const low = lowStock.filter(p => p.quantity > 3);

  const lines = [];
  lines.push(`📦 **库存预警** — ${shop.name}`);
  lines.push(`共 ${lowStock.length} 个 SKU 需要关注`);

  if (critical.length > 0) {
    lines.push('');
    lines.push('🔴 **紧急补货**（≤3件）');
    critical.forEach(p => {
      const name = p.productTitle + (p.variantTitle !== 'Default Title' ? ` · ${p.variantTitle}` : '');
      lines.push(`• ${name} → 仅剩 **${p.quantity}** 件`);
    });
  }

  if (low.length > 0) {
    lines.push('');
    lines.push('🟡 **低库存提醒**');
    low.forEach(p => {
      const name = p.productTitle + (p.variantTitle !== 'Default Title' ? ` · ${p.variantTitle}` : '');
      lines.push(`• ${name} → 剩余 ${p.quantity} 件`);
    });
  }

  const message = lines.join('\n');
  console.log('\n' + message);

  process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify({ ok: false, lowStock, message }) + '\n');
}

run().catch(err => {
  console.error('❌ 库存检查失败：', err.message);
  process.exit(1);
});
