/**
 * 竞品价格监控
 * 电商龙虾 — 添加/检查/管理竞品价格
 *
 * 用法：
 *   node competitor-watch.mjs add --name '竞品A' --url 'https://...' [--selector '.price'] [--note '备注']
 *   node competitor-watch.mjs check
 *   node competitor-watch.mjs list
 *   node competitor-watch.mjs remove --name '竞品A'
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');
const COMPETITORS_PATH = join(DATA_DIR, 'competitors.json');

const args = process.argv.slice(2);
const subcommand = args[0];

function getArg(flag) {
  const i = args.indexOf(flag);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
}

function showHelp() {
  console.log(`🦞 电商龙虾 — 竞品价格监控

用法：
  node competitor-watch.mjs add --name '竞品A' --url 'https://...' [--selector '.price'] [--note '备注']
  node competitor-watch.mjs check
  node competitor-watch.mjs list
  node competitor-watch.mjs remove --name '竞品A'`);
}

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function loadCompetitors() {
  ensureDataDir();
  if (!existsSync(COMPETITORS_PATH)) {
    writeFileSync(COMPETITORS_PATH, '[]', 'utf8');
    return [];
  }
  try {
    return JSON.parse(readFileSync(COMPETITORS_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function saveCompetitors(data) {
  ensureDataDir();
  writeFileSync(COMPETITORS_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// ─── 价格提取 ─────────────────────────────────────────────

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9'
      },
      timeout: 15000
    }, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchUrl(res.headers.location).then(resolve).catch(reject);
        return;
      }
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });
  });
}

function extractPrice(html, selector) {
  let price = null;

  // 策略1：CSS选择器（简单实现：匹配class/id对应的标签内容）
  if (selector && !price) {
    // 支持 .class 和 #id 选择器
    let pattern;
    if (selector.startsWith('.')) {
      const cls = selector.slice(1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      pattern = new RegExp(`class=["'][^"']*${cls}[^"']*["'][^>]*>([^<]+)`, 'i');
    } else if (selector.startsWith('#')) {
      const id = selector.slice(1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      pattern = new RegExp(`id=["']${id}["'][^>]*>([^<]+)`, 'i');
    } else {
      const sel = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      pattern = new RegExp(`${sel}[^>]*>([^<]+)`, 'i');
    }

    if (pattern) {
      const match = html.match(pattern);
      if (match) {
        const numMatch = match[1].match(/[\d,]+\.?\d*/);
        if (numMatch) price = parseFloat(numMatch[0].replace(/,/g, ''));
      }
    }
  }

  // 策略2：正则匹配常见价格模式
  if (!price) {
    const pricePatterns = [
      /¥\s*([\d,]+\.?\d*)/,
      /￥\s*([\d,]+\.?\d*)/,
      /\$\s*([\d,]+\.?\d*)/,
      /HK\$\s*([\d,]+\.?\d*)/,
      /(?:price|价格|售价|现价)[：:]\s*(?:[¥￥$])?\s*([\d,]+\.?\d*)/i,
      /"price"\s*:\s*"?([\d.]+)"?/i,
      /data-price=["']([\d.]+)["']/i
    ];

    for (const pattern of pricePatterns) {
      const match = html.match(pattern);
      if (match) {
        price = parseFloat(match[1].replace(/,/g, ''));
        if (price > 0) break;
        price = null;
      }
    }
  }

  // 策略3：meta og:price 标签
  if (!price) {
    const ogMatch = html.match(/property=["']og:price:amount["']\s*content=["']([\d.]+)["']/i)
      || html.match(/content=["']([\d.]+)["']\s*property=["']og:price:amount["']/i)
      || html.match(/name=["']price["']\s*content=["']([\d.]+)["']/i);
    if (ogMatch) {
      price = parseFloat(ogMatch[1]);
    }
  }

  return price;
}

// ─── add ──────────────────────────────────────────────────

function cmdAdd() {
  const name = getArg('--name');
  const url = getArg('--url');
  const selector = getArg('--selector') || null;
  const note = getArg('--note') || '';

  if (!name || !url) {
    console.error('❌ 缺少 --name 或 --url 参数');
    process.exit(1);
  }

  const competitors = loadCompetitors();
  const existing = competitors.find(c => c.name === name);
  if (existing) {
    console.error(`❌ 竞品 "${name}" 已存在，请先删除再重新添加`);
    process.exit(1);
  }

  const entry = {
    name,
    url,
    selector,
    note,
    priceHistory: [],
    addedAt: new Date().toISOString()
  };

  competitors.push(entry);
  saveCompetitors(competitors);

  console.log('🦞 电商龙虾 — 竞品已添加\n');
  console.log(`✅ ${name}`);
  console.log(`   URL：${url}`);
  if (selector) console.log(`   选择器：${selector}`);
  if (note) console.log(`   备注：${note}`);

  const output = { action: 'add', competitor: entry, totalCount: competitors.length };
  process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(output) + '\n');
}

// ─── check ────────────────────────────────────────────────

async function cmdCheck() {
  const competitors = loadCompetitors();

  if (competitors.length === 0) {
    console.log('🦞 电商龙虾 — 竞品价格检查\n');
    console.log('暂无监控的竞品，请先用 add 命令添加');
    process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify({ action: 'check', results: [], count: 0 }) + '\n');
    return;
  }

  console.log('🦞 电商龙虾 — 竞品价格检查\n');
  console.log(`正在检查 ${competitors.length} 个竞品...\n`);

  const results = [];

  for (const comp of competitors) {
    try {
      const html = await fetchUrl(comp.url);
      const price = extractPrice(html, comp.selector);

      const lastPrice = comp.priceHistory.length > 0
        ? comp.priceHistory[comp.priceHistory.length - 1].price
        : null;

      let change = '';
      if (lastPrice !== null && price !== null) {
        if (price > lastPrice) change = `↑ +${(price - lastPrice).toFixed(2)}`;
        else if (price < lastPrice) change = `↓ -${(lastPrice - price).toFixed(2)}`;
        else change = '→ 不变';
      }

      if (price !== null) {
        comp.priceHistory.push({
          price,
          checkedAt: new Date().toISOString()
        });
      }

      const status = price !== null ? '✅' : '⚠️';
      console.log(`${status} ${comp.name}`);
      console.log(`   价格：${price !== null ? '¥' + price.toFixed(2) : '未能提取'}`);
      if (change) console.log(`   变化：${change}`);
      console.log(`   URL：${comp.url}`);
      console.log('');

      results.push({
        name: comp.name,
        price,
        previousPrice: lastPrice,
        change: change || null,
        url: comp.url,
        success: price !== null
      });
    } catch (err) {
      console.log(`❌ ${comp.name}`);
      console.log(`   错误：${err.message}`);
      console.log(`   URL：${comp.url}`);
      console.log('');

      results.push({
        name: comp.name,
        price: null,
        error: err.message,
        url: comp.url,
        success: false
      });
    }
  }

  saveCompetitors(competitors);

  const successCount = results.filter(r => r.success).length;
  console.log(`─────────────────`);
  console.log(`📊 检查完成：${successCount}/${results.length} 成功提取价格`);

  const output = { action: 'check', results, totalChecked: results.length, successCount };
  process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(output) + '\n');
}

// ─── list ─────────────────────────────────────────────────

function cmdList() {
  const competitors = loadCompetitors();

  console.log('🦞 电商龙虾 — 竞品监控列表\n');

  if (competitors.length === 0) {
    console.log('暂无监控的竞品');
  } else {
    console.log(`共 ${competitors.length} 个竞品：\n`);
    for (const comp of competitors) {
      const lastEntry = comp.priceHistory?.length > 0
        ? comp.priceHistory[comp.priceHistory.length - 1]
        : null;
      const lastPrice = lastEntry ? `¥${lastEntry.price.toFixed(2)}` : '未检测';
      const lastCheck = lastEntry ? lastEntry.checkedAt : '—';

      console.log(`• ${comp.name}`);
      console.log(`  URL：${comp.url}`);
      console.log(`  最新价格：${lastPrice}`);
      console.log(`  上次检测：${lastCheck}`);
      if (comp.selector) console.log(`  选择器：${comp.selector}`);
      if (comp.note) console.log(`  备注：${comp.note}`);
      if (comp.priceHistory?.length > 1) {
        const prices = comp.priceHistory.slice(-5).map(p => `¥${p.price.toFixed(2)}`);
        console.log(`  近期价格：${prices.join(' → ')}`);
      }
      console.log('');
    }
  }

  const output = { action: 'list', competitors, count: competitors.length };
  process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(output) + '\n');
}

// ─── remove ───────────────────────────────────────────────

function cmdRemove() {
  const name = getArg('--name');
  if (!name) {
    console.error('❌ 缺少 --name 参数');
    process.exit(1);
  }

  const competitors = loadCompetitors();
  const index = competitors.findIndex(c => c.name === name);

  if (index === -1) {
    console.error(`❌ 未找到竞品 "${name}"`);
    process.exit(1);
  }

  const removed = competitors.splice(index, 1)[0];
  saveCompetitors(competitors);

  console.log('🦞 电商龙虾 — 竞品已删除\n');
  console.log(`✅ 已删除：${removed.name}`);
  console.log(`   剩余 ${competitors.length} 个竞品`);

  const output = { action: 'remove', removed: removed.name, remainingCount: competitors.length };
  process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(output) + '\n');
}

// ─── main ─────────────────────────────────────────────────

async function run() {
  switch (subcommand) {
    case 'add': cmdAdd(); break;
    case 'check': await cmdCheck(); break;
    case 'list': cmdList(); break;
    case 'remove': cmdRemove(); break;
    default:
      showHelp();
      if (subcommand) {
        console.error(`\n❌ 未知子命令：${subcommand}`);
        process.exit(1);
      }
  }
}

run().catch(err => {
  console.error('❌ 竞品监控错误：', err.message);
  process.exit(1);
});
