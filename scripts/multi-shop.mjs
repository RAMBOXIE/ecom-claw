/**
 * 多平台统一入口
 * 电商龙虾 — 跨平台连接状态 & 销售汇总
 *
 * 用法：
 *   node multi-shop.mjs status    所有平台连接状态
 *   node multi-shop.mjs summary   今日所有平台销售汇总
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, '..', 'config.json');

const args = process.argv.slice(2);
const subcommand = args[0];

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error('config.json not found');
  }
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
}

function getConfiguredPlatforms(config) {
  const platforms = [];
  if (config.shopify?.access_token) platforms.push('shopify');
  if (config.youzan?.access_token) platforms.push('youzan');
  return platforms;
}

function showHelp() {
  console.log(`🦞 电商龙虾 — 多平台统一入口

用法：
  node multi-shop.mjs status    查看所有平台连接状态
  node multi-shop.mjs summary   今日所有平台销售汇总
`);
}

async function checkStatus() {
  console.log('🦞 多平台连接状态\n');

  const config = loadConfig();
  const platforms = getConfiguredPlatforms(config);

  if (platforms.length === 0) {
    console.log('⚠️  未配置任何平台，请在 config.json 中添加平台凭据');
    process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify({ platforms: [], statuses: [] }) + '\n');
    return;
  }

  console.log(`已配置平台：${platforms.join(', ')}\n`);

  const statuses = [];

  for (const platform of platforms) {
    process.stdout.write(`  ${platform}... `);
    try {
      let connector;
      if (platform === 'shopify') {
        connector = await import('../connectors/shopify.js');
      } else if (platform === 'youzan') {
        connector = await import('../connectors/youzan.js');
      }

      const result = await connector.testConnection();
      if (result.ok) {
        console.log(`✅ 连接正常 — ${result.shop_name || result.domain || ''}`);
        statuses.push({ platform, ok: true, shopName: result.shop_name, ...result });
      } else {
        console.log(`❌ 连接失败 — ${result.error}`);
        statuses.push({ platform, ok: false, error: result.error });
      }
    } catch (err) {
      console.log(`❌ 错误 — ${err.message}`);
      statuses.push({ platform, ok: false, error: err.message });
    }
  }

  console.log(`\n📊 平台总数：${platforms.length} | 正常：${statuses.filter(s => s.ok).length} | 异常：${statuses.filter(s => !s.ok).length}`);

  process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify({ platforms, statuses }) + '\n');
}

async function summary() {
  console.log('🦞 今日多平台销售汇总\n');

  const config = loadConfig();
  const platforms = getConfiguredPlatforms(config);

  if (platforms.length === 0) {
    console.log('⚠️  未配置任何平台');
    process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify({ platforms: [], summaries: [] }) + '\n');
    return;
  }

  const summaries = [];
  let grandTotalOrders = 0;
  let grandTotalRevenue = 0;

  for (const platform of platforms) {
    console.log(`── ${platform} ──`);
    try {
      let connector;
      if (platform === 'shopify') {
        connector = await import('../connectors/shopify.js');
      } else if (platform === 'youzan') {
        connector = await import('../connectors/youzan.js');
      }

      const s = await connector.getDailySummary();
      console.log(`  订单：${s.totalOrders} 单`);
      console.log(`  销售额：${s.currency} ${s.totalRevenue}`);
      console.log(`  客单价：${s.currency} ${s.avgOrderValue}`);
      console.log('');

      summaries.push({ platform, ...s });
      grandTotalOrders += s.totalOrders;
      grandTotalRevenue += parseFloat(s.totalRevenue);
    } catch (err) {
      console.log(`  ❌ 获取失败：${err.message}\n`);
      summaries.push({ platform, error: err.message });
    }
  }

  console.log('── 汇总 ──');
  console.log(`  平台数：${platforms.length}`);
  console.log(`  总订单：${grandTotalOrders} 单`);
  console.log(`  总销售额（估算）：${grandTotalRevenue.toFixed(2)}`);
  console.log('  注：不同币种简单相加，仅供参考');

  process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify({
    platforms,
    summaries,
    grand: {
      totalOrders: grandTotalOrders,
      totalRevenue: grandTotalRevenue.toFixed(2),
      note: '不同币种简单相加'
    }
  }) + '\n');
}

async function run() {
  if (!subcommand || subcommand === '--help') {
    showHelp();
    return;
  }

  switch (subcommand) {
    case 'status':
      await checkStatus();
      break;
    case 'summary':
      await summary();
      break;
    default:
      console.error(`❌ 未知子命令：${subcommand}`);
      showHelp();
      process.exit(1);
  }
}

run().catch(err => {
  console.error('❌ 多平台操作失败：', err.message);
  process.exit(1);
});
