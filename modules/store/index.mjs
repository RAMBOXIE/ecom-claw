/**
 * 🏪 店铺运营 — 模块入口
 * 电商龙虾 modules/store/index.mjs
 *
 * 子模块：
 *   launch/        上新助手（SEO/GEO/文案）✅ 已完成
 *   orders.mjs     订单管理（列表/发货/退款/取消/备注）
 *   inventory.mjs  库存 & SKU 管理
 *   promotions.mjs 促销 & 折扣码
 *   catalog.mjs    商品目录（批量上架/下架）
 *   logistics.mjs  物流追踪 & 异常订单
 *
 * 用法：
 *   node modules/store/index.mjs --launch --product-id 123
 *   node modules/store/index.mjs --orders --list
 *   node modules/store/index.mjs --inventory --alert
 *   node modules/store/index.mjs --promotions --preview --discount 0.8
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const args = process.argv.slice(2);
const has  = f => args.includes(f);
const get  = f => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };

async function main() {
  // ── 上新助手（完整子模块）───────────────────────────────
  if (has('--launch')) {
    // 透传到 modules/launch/index.mjs（或 modules/store/launch/index.mjs）
    const launchPath = join(__dirname, '..', 'launch', 'index.mjs');
    const { default: launch } = await import(launchPath).catch(() => null) || {};
    const { execSync } = await import('child_process');
    const extraArgs = args.filter(a => a !== '--launch').join(' ');
    const out = execSync(`node "${launchPath}" ${extraArgs}`, { encoding: 'utf8', cwd: ROOT });
    process.stdout.write(out);
    return;
  }

  // ── 订单管理 ──────────────────────────────────────────────
  if (has('--orders')) {
    const { execSync } = await import('child_process');
    const extraArgs = args.filter(a => a !== '--orders').map(a => a.replace('--', '')).join(' ');
    const subCmd = args.find(a => ['--list','--detail','--fulfill','--refund','--cancel','--resend','--note'].includes(a))?.replace('--','') || 'list';
    const out = execSync(`node "${ROOT}/scripts/order-manage.mjs" ${subCmd} ${args.filter(a => !['--orders', `--${subCmd}`].includes(a)).join(' ')}`, { encoding: 'utf8', cwd: ROOT });
    process.stdout.write(out);
    return;
  }

  // ── 库存管理 ──────────────────────────────────────────────
  if (has('--inventory')) {
    const { execSync } = await import('child_process');
    if (has('--alert')) {
      const threshold = get('--threshold') || '10';
      const out = execSync(`node "${ROOT}/scripts/stock-alert.mjs" ${threshold}`, { encoding: 'utf8', cwd: ROOT });
      process.stdout.write(out);
    } else {
      const extraArgs = args.filter(a => a !== '--inventory').join(' ');
      const out = execSync(`node "${ROOT}/scripts/sku-manage.mjs" ${extraArgs}`, { encoding: 'utf8', cwd: ROOT });
      process.stdout.write(out);
    }
    return;
  }

  // ── 促销管理 ──────────────────────────────────────────────
  if (has('--promotions')) {
    const { execSync } = await import('child_process');
    const subCmd = has('--preview') ? 'preview' : has('--apply') ? 'apply' : has('--restore') ? 'restore' : 'preview';
    const extraArgs = args.filter(a => !['--promotions', `--${subCmd}`].includes(a)).join(' ');
    const out = execSync(`node "${ROOT}/scripts/promotion.mjs" ${subCmd} ${extraArgs}`, { encoding: 'utf8', cwd: ROOT });
    process.stdout.write(out);
    return;
  }

  // ── 物流追踪 ──────────────────────────────────────────────
  if (has('--logistics')) {
    const { execSync } = await import('child_process');
    const trackNum = get('--tracking') || '';
    const subCmd = trackNum ? `track ${trackNum}` : 'track-all';
    const out = execSync(`node "${ROOT}/scripts/logistics.mjs" ${subCmd}`, { encoding: 'utf8', cwd: ROOT });
    process.stdout.write(out);
    return;
  }

  // ── 帮助 ─────────────────────────────────────────────────
  console.log(`
🏪 店铺运营

用法：
  node modules/store/index.mjs --launch --product-id <ID>
    [--run-seo] [--run-geo] [--run-copy --platform xiaohongshu] [--run-all]
    [--list-incomplete]

  node modules/store/index.mjs --orders --list
  node modules/store/index.mjs --orders --fulfill --order-id <ID> --tracking-number SF123 --company 顺丰 --confirm
  node modules/store/index.mjs --orders --refund  --order-id <ID> --amount 99 --confirm
  node modules/store/index.mjs --orders --cancel  --order-id <ID> --confirm

  node modules/store/index.mjs --inventory --alert [--threshold 10]
  node modules/store/index.mjs --inventory list

  node modules/store/index.mjs --promotions --preview --discount 0.8
  node modules/store/index.mjs --promotions --apply   --discount 0.8 --confirm

  node modules/store/index.mjs --logistics
  node modules/store/index.mjs --logistics --tracking SF1234567890

状态：
  ✅ --launch     上新助手（SEO/GEO/文案，完整子模块）
  ✅ --orders     订单管理（代理 order-manage.mjs）
  ✅ --inventory  库存管理（代理 sku-manage + stock-alert）
  ✅ --promotions 促销管理（代理 promotion.mjs）
  ✅ --logistics  物流追踪（代理 logistics.mjs）
  `);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
