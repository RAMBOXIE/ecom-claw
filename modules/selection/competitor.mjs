/**
 * 🕵️ 选品研究 — 竞品价格追踪
 * modules/selection/competitor.mjs
 *
 * CLI：
 *   node modules/selection/competitor.mjs list
 *   node modules/selection/competitor.mjs add --name "竞品A" --url "https://..." [--selector ".price"]
 *   node modules/selection/competitor.mjs check
 *   node modules/selection/competitor.mjs remove --name "竞品A"
 *   node modules/selection/competitor.mjs history --name "竞品A"
 *
 * 导出：runCompetitor / addCompetitor / checkPrices / listCompetitors
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import https from 'https';
import http from 'http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const DATA_FILE = join(ROOT, 'tmp', 'competitors.json');

// ─── 数据读写 ──────────────────────────────────────────────────
function ensureDir() {
  const dir = join(ROOT, 'tmp');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function loadData() {
  ensureDir();
  if (!existsSync(DATA_FILE)) {
    return { competitors: [] };
  }
  try {
    return JSON.parse(readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { competitors: [] };
  }
}

function saveData(data) {
  ensureDir();
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// ─── HTTP Helper ───────────────────────────────────────────────
function fetchPage(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      timeout: timeoutMs,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      }
    }, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchPage(res.headers.location, timeoutMs).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

// ─── 价格提取 ──────────────────────────────────────────────────
function extractPrice(html, selector) {
  // 尝试通过 CSS selector 类名或 id 提取价格
  // selector 可能是 ".price" 或 "#price" 或 "[class*=price]"
  const patterns = [];

  if (selector) {
    // 类选择器 .price -> class="price" 或 class="price xxx"
    const classMatch = selector.match(/^\.([\w-]+)$/);
    const idMatch = selector.match(/^#([\w-]+)$/);

    if (classMatch) {
      const cls = classMatch[1];
      patterns.push(new RegExp(`class="[^"]*${cls}[^"]*"[^>]*>\\s*([¥$€£₩\\d.,\\s]+)`, 'i'));
      patterns.push(new RegExp(`class='[^']*${cls}[^']*'[^>]*>\\s*([¥$€£₩\\d.,\\s]+)`, 'i'));
    } else if (idMatch) {
      const id = idMatch[1];
      patterns.push(new RegExp(`id="${id}"[^>]*>\\s*([¥$€£₩\\d.,\\s]+)`, 'i'));
    }
  }

  // 通用价格模式
  patterns.push(/(?:price|价格|售价|¥)\s*[：:]?\s*([\d,]+\.?\d*)/i);
  patterns.push(/([¥$€])\s*([\d,]+\.?\d*)/);
  patterns.push(/"price"\s*:\s*"?([\d.]+)"?/);

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      const raw = match[match.length - 1].trim().replace(/,/g, '');
      const price = parseFloat(raw);
      if (!isNaN(price) && price > 0) {
        return { price, raw: match[0].substring(0, 100) };
      }
    }
  }
  return null;
}

// ─── ASCII Sparkline ───────────────────────────────────────────
const SPARK_CHARS = '▁▂▃▄▅▆▇█';
function sparkline(values) {
  if (!values || values.length === 0) return '(无数据)';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values.map(v => {
    const idx = Math.round(((v - min) / range) * (SPARK_CHARS.length - 1));
    return SPARK_CHARS[idx];
  }).join('');
}

// ─── 核心 API ──────────────────────────────────────────────────

/** 添加竞品 */
export function addCompetitor(name, url, selector = '') {
  const data = loadData();
  const existing = data.competitors.find(c => c.name === name);
  if (existing) {
    existing.url = url;
    existing.selector = selector;
    saveData(data);
    return { updated: true, name };
  }
  data.competitors.push({
    name,
    url,
    selector,
    priceHistory: [],
    lastChecked: null,
    lastPrice: null,
    alertThreshold: 0.10,
  });
  saveData(data);
  return { added: true, name };
}

/** 列出所有竞品 */
export function listCompetitors() {
  const data = loadData();
  return data.competitors.map(c => {
    const history = c.priceHistory;
    let change = null;
    if (history.length >= 2) {
      const prev = history[history.length - 2].price;
      const curr = history[history.length - 1].price;
      change = prev ? ((curr - prev) / prev * 100).toFixed(1) : null;
    }
    return {
      name: c.name,
      url: c.url,
      lastPrice: c.lastPrice,
      lastChecked: c.lastChecked,
      change,
    };
  });
}

/** 检查所有竞品价格 */
export async function checkPrices() {
  const data = loadData();
  const results = [];

  for (const c of data.competitors) {
    console.log(`  🔍 检查 ${c.name} ...`);
    try {
      const { body } = await fetchPage(c.url);
      const extracted = extractPrice(body, c.selector);

      if (extracted) {
        const { price, raw } = extracted;
        const date = new Date().toISOString();
        const prevPrice = c.lastPrice;

        c.priceHistory.push({ date, price, raw });
        if (c.priceHistory.length > 90) c.priceHistory.shift(); // 保留最近 90 条

        c.lastChecked = date;
        c.lastPrice = price;

        let alert = null;
        if (prevPrice && Math.abs(price - prevPrice) / prevPrice > c.alertThreshold) {
          const pct = ((price - prevPrice) / prevPrice * 100).toFixed(1);
          alert = `⚠️ 价格变动 ${pct}%: ${prevPrice} → ${price}`;
          console.log(`  ${alert}`);
        }

        results.push({ name: c.name, price, prevPrice, alert });
      } else {
        console.log(`  ⚠️ ${c.name}: 未能提取价格`);
        results.push({ name: c.name, price: null, error: '未能提取价格' });
      }
    } catch (err) {
      console.log(`  ❌ ${c.name}: ${err.message}`);
      results.push({ name: c.name, price: null, error: err.message });
    }
  }

  saveData(data);
  return results;
}

// ─── 主运行函数 ────────────────────────────────────────────────
export async function runCompetitor(args) {
  const cmd = args[0];
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : null;
  };

  if (cmd === 'list') {
    const items = listCompetitors();
    if (items.length === 0) {
      console.log('暂无竞品数据，使用 add 命令添加竞品');
      return [];
    }
    console.log('\n竞品价格追踪列表:\n');
    console.log('名称         | 最新价格 | 最后检查时间              | 变动%  | URL');
    console.log('-------------|----------|---------------------------|--------|------------------------');
    items.forEach(c => {
      const price = c.lastPrice ? `¥${c.lastPrice}` : '未检查';
      const checked = c.lastChecked ? new Date(c.lastChecked).toLocaleString('zh-CN') : '未检查';
      const change = c.change ? `${c.change}%` : '-';
      const urlShort = c.url.length > 30 ? c.url.substring(0, 27) + '...' : c.url;
      console.log(`${c.name.padEnd(12)} | ${price.padEnd(8)} | ${checked.padEnd(25)} | ${change.padEnd(6)} | ${urlShort}`);
    });
    return items;

  } else if (cmd === 'add') {
    const name = get('--name');
    const url = get('--url');
    const selector = get('--selector') || '';
    if (!name || !url) {
      console.error('需要提供 --name 和 --url');
      return null;
    }
    const result = addCompetitor(name, url, selector);
    console.log(`✅ ${result.added ? '已添加' : '已更新'}: ${name}`);
    return result;

  } else if (cmd === 'check') {
    console.log('\n🔍 开始检查竞品价格...\n');
    const results = await checkPrices();
    console.log(`\n✅ 检查完成，共 ${results.length} 个竞品`);
    return results;

  } else if (cmd === 'remove') {
    const name = get('--name');
    if (!name) { console.error('需要提供 --name'); return null; }
    const data = loadData();
    const before = data.competitors.length;
    data.competitors = data.competitors.filter(c => c.name !== name);
    saveData(data);
    const removed = before - data.competitors.length;
    console.log(removed > 0 ? `✅ 已删除: ${name}` : `⚠️ 未找到: ${name}`);
    return { removed: removed > 0, name };

  } else if (cmd === 'history') {
    const name = get('--name');
    if (!name) { console.error('需要提供 --name'); return null; }
    const data = loadData();
    const c = data.competitors.find(c => c.name === name);
    if (!c) { console.error(`未找到竞品: ${name}`); return null; }
    console.log(`\n📊 ${name} 价格历史 (最近 ${c.priceHistory.length} 条)\n`);
    const prices = c.priceHistory.map(h => h.price).filter(Boolean);
    if (prices.length > 0) {
      console.log(`  价格趋势: ${sparkline(prices)}`);
      console.log(`  最低: ¥${Math.min(...prices)}  最高: ¥${Math.max(...prices)}  当前: ¥${prices[prices.length - 1]}\n`);
      c.priceHistory.slice(-10).forEach(h => {
        console.log(`  ${new Date(h.date).toLocaleString('zh-CN')}  ¥${h.price}`);
      });
    } else {
      console.log('  暂无价格记录，请先运行 check 命令');
    }
    return c.priceHistory;

  } else {
    console.log('用法:');
    console.log('  node modules/selection/competitor.mjs list');
    console.log('  node modules/selection/competitor.mjs add --name "竞品A" --url "https://..." [--selector ".price"]');
    console.log('  node modules/selection/competitor.mjs check');
    console.log('  node modules/selection/competitor.mjs remove --name "竞品A"');
    console.log('  node modules/selection/competitor.mjs history --name "竞品A"');
    return null;
  }
}

// ─── CLI 入口 ──────────────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith('competitor.mjs')) {
  const args = process.argv.slice(2);
  const result = await runCompetitor(args);
  console.log(`\n__JSON_OUTPUT__ ${JSON.stringify({ ok: true, data: result })}`);
}
