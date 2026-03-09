/**
 * 🔍 选品雷达 — 模块入口
 * 电商龙虾 modules/selection/index.mjs
 *
 * 子模块：
 *   profit.mjs     利润测算（成本/平台费/物流/退货率）
 *   trending.mjs   趋势挖掘（Google Trends + 关键词热度）
 *   competitor.mjs 竞品监控（价格追踪 + 变动告警）
 *   sourcing.mjs   货源挖掘（1688热销商品分析）
 *
 * 用法：
 *   node modules/selection/index.mjs --profit --cost 50 --price 150
 *   node modules/selection/index.mjs --trending --keyword "防晒霜"
 *   node modules/selection/index.mjs --competitor --list
 *   node modules/selection/index.mjs --sourcing
 */

const args = process.argv.slice(2);
const has  = f => args.includes(f);
const get  = f => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };

const ROOT = new URL('../..', import.meta.url).pathname;

async function main() {
  // ── 利润测算 ──────────────────────────────────────────────
  if (has('--profit')) {
    const { calcProfit } = await import('./profit.mjs');
    const cost         = parseFloat(get('--cost') || 0);
    const price        = parseFloat(get('--price') || 0);
    const platformFee  = parseFloat(get('--platform-fee') || 0.05);
    const shipping     = parseFloat(get('--shipping') || 15);
    const returnRate   = parseFloat(get('--return-rate') || 0.03);
    const result = calcProfit({ cost, price, platformFee, shipping, returnRate });
    console.log('\n🔍 利润测算\n');
    console.log(`  售价：${price}  成本：${cost}  平台费：${(platformFee*100).toFixed(0)}%  运费：${shipping}`);
    console.log(`  毛利润：${result.grossProfit.toFixed(2)}  净利润：${result.netProfit.toFixed(2)}`);
    console.log(`  利润率：${result.margin.toFixed(1)}%  ROI：${result.roi.toFixed(1)}%`);
    console.log(`  盈亏平衡价：${result.breakeven.toFixed(2)}`);
    console.log(result.margin >= 30 ? '\n  ✅ 利润达标（≥30%）' : result.margin >= 15 ? '\n  🟡 利润偏低（15-30%）' : '\n  🔴 利润不足（<15%）');
    process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(result) + '\n');
    return;
  }

  // ── 趋势挖掘 ──────────────────────────────────────────────
  if (has('--trending')) {
    const { getTrending } = await import('./trending.mjs');
    const keyword = get('--keyword') || get('--product') || '';
    await getTrending(keyword);
    return;
  }

  // ── 竞品监控 ──────────────────────────────────────────────
  if (has('--competitor')) {
    const { runCompetitor } = await import('./competitor.mjs');
    await runCompetitor(args);
    return;
  }

  // ── 货源挖掘 ──────────────────────────────────────────────
  if (has('--sourcing')) {
    const { runSourcing } = await import('./sourcing.mjs');
    await runSourcing(args);
    return;
  }

  // ── 帮助 ─────────────────────────────────────────────────
  console.log(`
🔍 选品雷达

用法：
  node modules/selection/index.mjs --profit
    --cost <成本> --price <售价>
    [--platform-fee 0.05] [--shipping 15] [--return-rate 0.03]

  node modules/selection/index.mjs --trending --keyword "防晒霜"

  node modules/selection/index.mjs --competitor --list
  node modules/selection/index.mjs --competitor --check
  node modules/selection/index.mjs --competitor --add --name "竞品A" --url "https://..."

  node modules/selection/index.mjs --sourcing

状态：
  ✅ --profit     利润测算（已完成）
  🚧 --trending   趋势挖掘（开发中）
  🚧 --competitor 竞品监控（开发中，底层脚本已就绪）
  🚧 --sourcing   货源挖掘（开发中，底层脚本已就绪）
  `);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
