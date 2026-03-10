/**
 * 📈 选品研究 — 趋势分析
 * modules/selection/trending.mjs
 *
 * CLI：
 *   node modules/selection/trending.mjs --keyword "防晒霜"
 *   node modules/selection/trending.mjs --daily [--geo CN]
 *   node modules/selection/trending.mjs --related --keyword "连衣裙"
 *
 * 导出：getTrending / getDailyTrends
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

// ─── HTTP Helper ───────────────────────────────────────────────
function fetchUrl(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

// ─── 核心 API ──────────────────────────────────────────────────

/**
 * 获取 Google 每日热搜榜 (RSS 解析)
 * @param {string} geo - 地区代码，默认 CN
 * @returns {Array<{rank, title, traffic}>}
 */
export async function getDailyTrends(geo = 'CN') {
  const url = `https://trends.google.com/trends/trendingsearches/daily/rss?geo=${geo}`;
  let items = [];
  try {
    const { body } = await fetchUrl(url);
    // 提取 <item> 块
    const itemBlocks = body.match(/<item>([\s\S]*?)<\/item>/g) || [];
    items = itemBlocks.slice(0, 20).map((block, idx) => {
      const titleMatch = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
                         block.match(/<title>(.*?)<\/title>/);
      const trafficMatch = block.match(/<ht:approx_traffic>(.*?)<\/ht:approx_traffic>/);
      return {
        rank: idx + 1,
        title: titleMatch ? titleMatch[1].trim() : '(unknown)',
        traffic: trafficMatch ? trafficMatch[1].trim() : 'N/A',
      };
    });
  } catch (err) {
    console.error(`⚠️ 获取趋势数据失败: ${err.message}`);
  }
  return items;
}

/**
 * 关键词趋势搜索
 * @param {string} keyword
 * @returns {{ keyword, found_in_trending, suggestions, traffic_estimate }}
 */
export async function getTrending(keyword) {
  let found_in_trending = false;
  let traffic_estimate = null;

  // 并行请求趋势 RSS 和 Google 建议
  const [trendingItems, suggestions] = await Promise.all([
    getDailyTrends('CN').catch(() => []),
    getGoogleSuggestions(keyword).catch(() => []),
  ]);

  const matched = trendingItems.find(item =>
    item.title.toLowerCase().includes(keyword.toLowerCase())
  );
  if (matched) {
    found_in_trending = true;
    traffic_estimate = matched.traffic;
  }

  return { keyword, found_in_trending, suggestions, traffic_estimate };
}

/**
 * 获取 Google 搜索建议
 */
async function getGoogleSuggestions(keyword) {
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=zh-CN&q=${encodeURIComponent(keyword)}`;
  try {
    const { body } = await fetchUrl(url);
    const parsed = JSON.parse(body);
    // 格式: [query, [suggestions]]
    if (Array.isArray(parsed) && Array.isArray(parsed[1])) {
      return parsed[1].slice(0, 10);
    }
  } catch {
    // ignore
  }
  return [];
}

// ─── CLI 入口 ──────────────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith('trending.mjs')) {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : null;
  };
  const hasFlag = (flag) => args.includes(flag);

  let result;

  if (hasFlag('--daily')) {
    const geo = get('--geo') || 'CN';
    console.log(`\n📈 Google 每日热搜榜 (${geo})\n`);
    const items = await getDailyTrends(geo);
    if (items.length === 0) {
      console.log('⚠️ 暂无数据（可能网络受限）');
    } else {
      console.log('排名 | 关键词                     | 流量估计');
      console.log('-----|----------------------------|----------');
      items.forEach(({ rank, title, traffic }) => {
        console.log(`${String(rank).padStart(3)}  | ${title.padEnd(28)} | ${traffic}`);
      });
    }
    result = items;

  } else if (get('--keyword')) {
    const keyword = get('--keyword');
    console.log(`\n🔍 关键词趋势分析: "${keyword}"\n`);
    const data = await getTrending(keyword);
    console.log(`📌 是否出现在热搜: ${data.found_in_trending ? '✅ 是' : '❌ 否'}`);
    if (data.traffic_estimate) {
      console.log(`📊 流量估计: ${data.traffic_estimate}`);
    }
    console.log(`\n💡 相关搜索建议 (${data.suggestions.length} 条):`);
    data.suggestions.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
    result = data;

  } else {
    console.log('用法:');
    console.log('  node modules/selection/trending.mjs --keyword "关键词"');
    console.log('  node modules/selection/trending.mjs --daily [--geo CN]');
    console.log('  node modules/selection/trending.mjs --related --keyword "关键词"');
    result = null;
  }

  console.log(`\n__JSON_OUTPUT__ ${JSON.stringify({ ok: true, data: result })}`);
}
