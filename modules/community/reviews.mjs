/**
 * ⭐ 社区运营 — 评价管理 (Judge.me)
 * modules/community/reviews.mjs
 *
 * CLI：
 *   node modules/community/reviews.mjs list [--limit 20] [--rating 1]
 *   node modules/community/reviews.mjs stats
 *   node modules/community/reviews.mjs alerts    (显示 < 3 星评价)
 *   node modules/community/reviews.mjs keywords  (提取常见关键词)
 *
 * 导出：runReviews / listReviews / getReviewStats / getNegativeReviews
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';
import https from 'https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const JUDGE_ME_BASE = 'https://judge.me/api/v1';

// ─── Config ────────────────────────────────────────────────────
function loadConfig() {
  const cfgPath = join(ROOT, 'config.json');
  if (!existsSync(cfgPath)) return null;
  try {
    return JSON.parse(readFileSync(cfgPath, 'utf8'));
  } catch {
    return null;
  }
}

function checkConfig() {
  const cfg = loadConfig();
  const token = cfg?.judgeme?.api_token;
  const shop = cfg?.judgeme?.shop_domain;
  if (!token || !shop) {
    console.log('⚠️  Judge.me 未配置');
    console.log('');
    console.log('配置 Judge.me：在 config.json 添加:');
    console.log('  judgeme: {');
    console.log('    api_token: \'your_api_token_here\',');
    console.log('    shop_domain: \'yourshop.myshopify.com\'');
    console.log('  }');
    console.log('');
    console.log('获取 API Token: https://judge.me/dashboard → Settings → API');
    return null;
  }
  return { token, shop };
}

// ─── HTTP Helper ───────────────────────────────────────────────
function fetchJson(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      timeout: timeoutMs,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ecom-claw/1.0',
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data: null, raw: data });
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

// ─── 停用词 ────────────────────────────────────────────────────
const STOPWORDS = new Set([
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都',
  '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会',
  '着', '没有', '看', '好', '自己', '这', '那', '但', '还', '使用',
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'it', 'its', 'this',
  'that', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
  'with', 'my', 'i', 'so', 'very', 'not', 'no', 'be',
]);

function extractKeywords(texts) {
  const freq = {};
  for (const text of texts) {
    if (!text) continue;
    const words = text.toLowerCase()
      .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1 && !STOPWORDS.has(w));
    for (const w of words) {
      freq[w] = (freq[w] || 0) + 1;
    }
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word, count]) => ({ word, count }));
}

// ─── 核心 API ──────────────────────────────────────────────────

/** 列出评价 */
export async function listReviews({ limit = 20, rating = null, page = 1 } = {}) {
  const creds = checkConfig();
  if (!creds) return null;

  let url = `${JUDGE_ME_BASE}/reviews?api_token=${creds.token}&shop_domain=${creds.shop}&per_page=${limit}&page=${page}`;
  if (rating) url += `&rating=${rating}`;

  const { data, status } = await fetchJson(url);
  if (status !== 200 || !data) throw new Error(`Judge.me API 错误: ${status}`);

  return (data.reviews || []).map(r => ({
    id: r.id,
    rating: r.rating,
    title: r.title,
    body: r.body,
    reviewer: r.reviewer?.name || '匿名',
    product: r.product_title,
    created: r.created_at,
    verified: r.verified_buyer,
  }));
}

/** 获取评价统计 */
export async function getReviewStats() {
  const creds = checkConfig();
  if (!creds) return null;

  // 获取各星级数量
  const distribution = {};
  let total = 0;

  for (const rating of [1, 2, 3, 4, 5]) {
    const url = `${JUDGE_ME_BASE}/reviews?api_token=${creds.token}&shop_domain=${creds.shop}&rating=${rating}&per_page=1`;
    try {
      const { data } = await fetchJson(url);
      const count = data?.pagination?.total_count || data?.reviews?.length || 0;
      distribution[rating] = count;
      total += count;
    } catch {
      distribution[rating] = 0;
    }
  }

  const weighted = Object.entries(distribution).reduce((sum, [r, c]) => sum + Number(r) * c, 0);
  const average = total > 0 ? parseFloat((weighted / total).toFixed(2)) : 0;

  return { total, average, distribution, response_rate: null };
}

/** 获取差评 (< 3星) */
export async function getNegativeReviews() {
  const creds = checkConfig();
  if (!creds) return null;

  const results = [];
  for (const rating of [1, 2]) {
    const url = `${JUDGE_ME_BASE}/reviews?api_token=${creds.token}&shop_domain=${creds.shop}&rating=${rating}&per_page=50`;
    try {
      const { data } = await fetchJson(url);
      const reviews = data?.reviews || [];
      results.push(...reviews.map(r => ({
        rating: r.rating,
        reviewer: r.reviewer?.name || '匿名',
        product: r.product_title,
        body: r.body,
        created: r.created_at,
      })));
    } catch {
      // ignore
    }
  }
  return results;
}

// ─── 主运行函数 ────────────────────────────────────────────────
export async function runReviews(args) {
  const cmd = args[0];
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : null;
  };

  if (cmd === 'list') {
    const limit = parseInt(get('--limit') || '20');
    const rating = get('--rating') ? parseInt(get('--rating')) : null;

    let reviews;
    try {
      reviews = await listReviews({ limit, rating });
    } catch (err) {
      console.error(`❌ 获取评价失败: ${err.message}`);
      return null;
    }
    if (!reviews) return null;

    console.log(`\n⭐ 最近评价 (共 ${reviews.length} 条)\n`);
    reviews.forEach(r => {
      const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
      console.log(`  ${stars} | ${r.reviewer.padEnd(12)} | ${r.product || '(未知商品)'}`);
      if (r.body) console.log(`        "${r.body.substring(0, 80)}"`);
      console.log();
    });
    return reviews;

  } else if (cmd === 'stats') {
    let stats;
    try {
      stats = await getReviewStats();
    } catch (err) {
      console.error(`❌ 获取统计失败: ${err.message}`);
      return null;
    }
    if (!stats) return null;

    console.log('\n📊 评价统计\n');
    console.log(`  总评价数: ${stats.total}`);
    console.log(`  平均星级: ${'★'.repeat(Math.round(stats.average))} (${stats.average})`);
    console.log('\n  星级分布:');
    for (let r = 5; r >= 1; r--) {
      const count = stats.distribution[r] || 0;
      const bar = '█'.repeat(Math.round(count / Math.max(stats.total, 1) * 20));
      console.log(`    ${r}★ ${bar.padEnd(20)} ${count}`);
    }
    return stats;

  } else if (cmd === 'alerts') {
    let reviews;
    try {
      reviews = await getNegativeReviews();
    } catch (err) {
      console.error(`❌ 获取差评失败: ${err.message}`);
      return null;
    }
    if (!reviews) return null;

    console.log(`\n🚨 差评预警 (1-2星，共 ${reviews.length} 条)\n`);
    if (reviews.length === 0) {
      console.log('  🎉 暂无差评，继续保持！');
    } else {
      reviews.forEach(r => {
        console.log(`  ${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)} | ${r.reviewer} | ${r.product || '未知'}`);
        if (r.body) console.log(`    "${r.body.substring(0, 100)}"`);
        console.log(`    时间: ${new Date(r.created).toLocaleDateString('zh-CN')}`);
        console.log();
      });
    }
    return reviews;

  } else if (cmd === 'keywords') {
    let reviews;
    try {
      reviews = await listReviews({ limit: 100 });
    } catch (err) {
      console.error(`❌ 获取评价失败: ${err.message}`);
      return null;
    }
    if (!reviews) return null;

    const bodies = reviews.map(r => r.body).filter(Boolean);
    const keywords = extractKeywords(bodies);

    console.log('\n🔑 评价高频关键词 (Top 20)\n');
    keywords.forEach(({ word, count }, i) => {
      const bar = '▓'.repeat(Math.min(count, 20));
      console.log(`  ${String(i + 1).padStart(2)}. ${word.padEnd(15)} ${bar} (${count})`);
    });
    return keywords;

  } else {
    console.log('用法:');
    console.log('  node modules/community/reviews.mjs list [--limit 20] [--rating 1]');
    console.log('  node modules/community/reviews.mjs stats');
    console.log('  node modules/community/reviews.mjs alerts');
    console.log('  node modules/community/reviews.mjs keywords');
    return null;
  }
}

// ─── CLI 入口 ──────────────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith('reviews.mjs')) {
  const args = process.argv.slice(2);
  const result = await runReviews(args);
  console.log(`\n__JSON_OUTPUT__ ${JSON.stringify({ ok: true, data: result })}`);
}
