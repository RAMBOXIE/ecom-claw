/**
 * 📊 数据参谋 — 模块入口
 * 电商龙虾 modules/analytics/index.mjs
 *
 * 子模块：
 *   reports.mjs     报表统一入口（日/周/月一键调用）
 *   insights.mjs    AI 经营洞察（找问题 + 给建议）
 *   benchmarks.mjs  横向对比（多店铺 / 同比环比）
 *   verify.mjs      数据核验（脚本输出 vs 后台数据比对）
 *
 * 用法：
 *   node modules/analytics/index.mjs --report daily
 *   node modules/analytics/index.mjs --report weekly [--weeks-ago 1]
 *   node modules/analytics/index.mjs --report monthly [--months-ago 0]
 *   node modules/analytics/index.mjs --insights
 *   node modules/analytics/index.mjs --benchmarks
 *   node modules/analytics/index.mjs --verify
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const args = process.argv.slice(2);
const has  = f => args.includes(f);
const get  = f => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };

async function main() {
  // ── 报表（直接代理底层脚本）─────────────────────────────
  if (has('--report')) {
    const type = get('--report') || 'daily';
    const scriptMap = {
      daily:   `${ROOT}/scripts/daily-report.mjs`,
      weekly:  `${ROOT}/scripts/weekly-report.mjs`,
      monthly: `${ROOT}/scripts/monthly-report.mjs`,
      all:     null, // 三报连跑
    };

    if (type === 'all') {
      console.log('\n📊 全量报表生成中...\n');
      // 串行执行三个报表
      const { execSync } = await import('child_process');
      ['daily', 'weekly', 'monthly'].forEach(t => {
        console.log(`\n━━ ${t.toUpperCase()} REPORT ${'─'.repeat(35)}`);
        try {
          const out = execSync(`node ${ROOT}/scripts/${t}-report.mjs`, { encoding: 'utf8', cwd: ROOT });
          // 只打印 __JSON_OUTPUT__ 之前的部分
          console.log(out.split('__JSON_OUTPUT__')[0].trim());
        } catch (e) {
          console.error(`  ❌ ${t} report 失败：${e.message}`);
        }
      });
      return;
    }

    const scriptPath = scriptMap[type];
    if (!scriptPath) { console.error(`❌ 不支持的报表类型：${type}，支持：daily / weekly / monthly / all`); process.exit(1); }

    // 透传参数
    const { execSync } = await import('child_process');
    const extraArgs = args.filter(a => a !== '--report' && a !== type).join(' ');
    console.log(`\n📊 ${type.toUpperCase()} 报表生成中...\n`);
    try {
      const out = execSync(`node "${scriptPath}" ${extraArgs}`, { encoding: 'utf8', cwd: ROOT });
      process.stdout.write(out);
    } catch (e) {
      console.error('❌ 报表生成失败：', e.stderr || e.message);
      process.exit(1);
    }
    return;
  }

  // ── AI 经营洞察 ───────────────────────────────────────────
  if (has('--insights')) {
    const { runInsights } = await import('./insights.mjs');
    await runInsights(args);
    return;
  }

  // ── 横向对比 ──────────────────────────────────────────────
  if (has('--benchmarks')) {
    const { execSync } = await import('child_process');
    console.log('\n📊 多平台汇总\n');
    const out = execSync(`node "${ROOT}/scripts/multi-shop.mjs" summary`, { encoding: 'utf8', cwd: ROOT });
    process.stdout.write(out);
    return;
  }

  // ── 数据核验 ──────────────────────────────────────────────
  if (has('--verify')) {
    const { execSync } = await import('child_process');
    console.log('\n📊 数据核验\n');
    const out = execSync(`node "${ROOT}/scripts/verify.mjs"`, { encoding: 'utf8', cwd: ROOT });
    process.stdout.write(out);
    return;
  }

  // ── 帮助 ─────────────────────────────────────────────────
  console.log(`
📊 数据参谋

用法：
  node modules/analytics/index.mjs --report daily
  node modules/analytics/index.mjs --report weekly [--weeks-ago 1]
  node modules/analytics/index.mjs --report monthly [--months-ago 0]
  node modules/analytics/index.mjs --report all      （日报+周报+月报）

  node modules/analytics/index.mjs --insights        （AI 经营洞察 🚧）
  node modules/analytics/index.mjs --benchmarks      （多平台汇总）
  node modules/analytics/index.mjs --verify          （数据核验）

状态：
  ✅ --report     报表生成（代理底层 daily/weekly/monthly-report.mjs）
  ✅ --benchmarks 多平台汇总（代理 multi-shop.mjs）
  ✅ --verify     数据核验（代理 verify.mjs）
  🚧 --insights   AI 经营洞察（开发中）
  `);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
