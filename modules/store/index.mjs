/**
 * 🏪 店铺运营 — 总入口
 * modules/store/index.mjs
 *
 * 用法：
 *   node modules/store/index.mjs --launch    [--product-id ID] [--list-incomplete] [--run-all]
 *   node modules/store/index.mjs --orders    <list|detail|fulfill|refund|cancel|note|resend> [...]
 *   node modules/store/index.mjs --inventory <status|alert|list|skus|update|price> [...]
 *   node modules/store/index.mjs --promotions <preview|apply|restore|discounts> [...]
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));

const args    = process.argv.slice(2);
const has     = f => args.includes(f);
const getFlag = f => { const i = args.indexOf(f); return i !== -1 ? args[i+1] : null; };

async function delegate(modulePath, extraArgs = []) {
  // 把参数注入 process.argv，然后 import 模块（利用其 CLI 入口）
  const orig = process.argv.splice(2);
  process.argv.splice(2, 0, ...extraArgs);
  try {
    await import(modulePath + '?ts=' + Date.now()); // 避免缓存
  } finally {
    process.argv.splice(2);
    process.argv.splice(2, 0, ...orig);
  }
}

async function main() {
  // ── 商品上新 ──────────────────────────────────────────────
  if (has('--launch')) {
    const { execSync } = await import('child_process');
    const extra = args.filter(a => a !== '--launch').join(' ');
    const out   = execSync(`node "${join(__dirname, 'launch', 'index.mjs')}" ${extra}`, {
      encoding: 'utf8', cwd: join(__dirname, '..', '..')
    });
    process.stdout.write(out);
    return;
  }

  // ── 订单处理 ──────────────────────────────────────────────
  if (has('--orders')) {
    const { execSync } = await import('child_process');
    const extra = args.filter(a => a !== '--orders').join(' ');
    const out   = execSync(`node "${join(__dirname, 'orders.mjs')}" ${extra}`, {
      encoding: 'utf8', cwd: join(__dirname, '..', '..')
    });
    process.stdout.write(out);
    return;
  }

  // ── 库存调度 ──────────────────────────────────────────────
  if (has('--inventory')) {
    const { execSync } = await import('child_process');
    const extra = args.filter(a => a !== '--inventory').join(' ');
    const out   = execSync(`node "${join(__dirname, 'inventory.mjs')}" ${extra}`, {
      encoding: 'utf8', cwd: join(__dirname, '..', '..')
    });
    process.stdout.write(out);
    return;
  }

  // ── 促销定价 ──────────────────────────────────────────────
  if (has('--promotions')) {
    const { execSync } = await import('child_process');
    const extra = args.filter(a => a !== '--promotions').join(' ');
    const out   = execSync(`node "${join(__dirname, 'promotions.mjs')}" ${extra}`, {
      encoding: 'utf8', cwd: join(__dirname, '..', '..')
    });
    process.stdout.write(out);
    return;
  }

  // ── 帮助 ─────────────────────────────────────────────────
  console.log(`
🏪 店铺运营

────────────────────────────────────────────────────────
  商品上新
────────────────────────────────────────────────────────
  node modules/store/index.mjs --launch --product-id ID
  node modules/store/index.mjs --launch --list-incomplete
  node modules/store/index.mjs --launch --product-id ID --run-all
  node modules/store/index.mjs --launch --product-id ID --run-seo
  node modules/store/index.mjs --launch --product-id ID --run-geo
  node modules/store/index.mjs --launch --product-id ID --run-copy --platform xiaohongshu

────────────────────────────────────────────────────────
  订单处理
────────────────────────────────────────────────────────
  node modules/store/index.mjs --orders list
  node modules/store/index.mjs --orders detail  --order-id ID
  node modules/store/index.mjs --orders fulfill --order-id ID --tracking-number NUM --company 顺丰
  node modules/store/index.mjs --orders refund  --order-id ID --amount 99 --reason "原因"
  node modules/store/index.mjs --orders cancel  --order-id ID
  node modules/store/index.mjs --orders note    --order-id ID --message "备注"
  node modules/store/index.mjs --orders resend  --order-id ID

────────────────────────────────────────────────────────
  库存调度
────────────────────────────────────────────────────────
  node modules/store/index.mjs --inventory status
  node modules/store/index.mjs --inventory alert    [--threshold 10]
  node modules/store/index.mjs --inventory list     [--low] [--out]
  node modules/store/index.mjs --inventory skus     --product-id ID
  node modules/store/index.mjs --inventory update   --variant-id ID --stock 50 --confirm
  node modules/store/index.mjs --inventory price    --variant-id ID --price 99 --compare 129 --confirm

────────────────────────────────────────────────────────
  促销定价
────────────────────────────────────────────────────────
  node modules/store/index.mjs --promotions preview     --discount 0.8
  node modules/store/index.mjs --promotions apply       --discount 0.8
  node modules/store/index.mjs --promotions restore
  node modules/store/index.mjs --promotions discounts list
  node modules/store/index.mjs --promotions discounts create --type percent --value 20 --code SAVE20
  node modules/store/index.mjs --promotions discounts delete --rule-id ID

  详细文档：cat modules/store/SKILL.md
  `);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
