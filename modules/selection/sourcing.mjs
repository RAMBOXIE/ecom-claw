/**
 * 🏭 选品研究 — 供货分析
 * modules/selection/sourcing.mjs
 *
 * CLI：
 *   node modules/selection/sourcing.mjs search --keyword "防晒霜"
 *   node modules/selection/sourcing.mjs analyze --cost 30 --price 120 --category "美妆"
 *   node modules/selection/sourcing.mjs report
 *
 * 导出：runSourcing / analyzeSourcingOpportunity
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';
import https from 'https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

// ─── HTTP Helper ───────────────────────────────────────────────
function fetchUrl(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      timeout: timeoutMs,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

// ─── Google 搜索建议 ───────────────────────────────────────────
async function getGoogleSuggestions(query) {
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=zh-CN&q=${encodeURIComponent(query)}`;
  try {
    const { body } = await fetchUrl(url);
    const parsed = JSON.parse(body);
    if (Array.isArray(parsed) && Array.isArray(parsed[1])) {
      return parsed[1].slice(0, 10);
    }
  } catch {
    // ignore
  }
  return [];
}

// ─── 生成采购搜索链接 ─────────────────────────────────────────
function generateSearchUrls(keyword) {
  const kw = encodeURIComponent(keyword);
  return [
    {
      platform: '1688',
      searchUrl: `https://s.1688.com/selloffer/offerlist.htm?keywords=${kw}`,
      tip: '国内批发采购首选，可联系工厂直供',
    },
    {
      platform: '淘宝',
      searchUrl: `https://s.taobao.com/search?q=${kw}`,
      tip: '零售价参考，了解市场售价区间',
    },
    {
      platform: 'Alibaba',
      searchUrl: `https://www.alibaba.com/trade/search?SearchText=${kw}`,
      tip: '国际批发，适合跨境出口采购',
    },
    {
      platform: '义乌购',
      searchUrl: `https://www.yiwugo.com/product/search.html?keywords=${kw}`,
      tip: '义乌货源，价格低，起批量小',
    },
    {
      platform: '拼多多',
      searchUrl: `https://mobile.yangkeduo.com/search_result.html?search_key=${kw}`,
      tip: '下沉市场价格参考',
    },
  ];
}

// ─── 核心 API ──────────────────────────────────────────────────

/**
 * 分析采购机会
 */
export function analyzeSourcingOpportunity(productInfo) {
  const { cost, price, category = '其他', keyword = '' } = productInfo;
  const margin = ((price - cost) / price * 100);
  const marginFixed = parseFloat(margin.toFixed(1));

  let verdict, sourcing_tips;
  const suggest_cost_target = parseFloat((price * 0.5).toFixed(2)); // 目标利润率 50%

  if (marginFixed < 20) {
    verdict = '❌ 利润过低';
    sourcing_tips = [
      '建议压低采购价，目标成本控制在售价 30% 以内',
      `建议采购价不超过 ¥${(price * 0.3).toFixed(2)}`,
      '考虑直接工厂合作或增加订单量获取更低价格',
      '或提高售价：检查竞品定价空间',
    ];
  } else if (marginFixed <= 40) {
    verdict = '✅ 利润合理，可小批试单';
    sourcing_tips = [
      '利润合理，可小批试单测试市场',
      `建议起订量：50-100 件，采购价可进一步压低至 ¥${(price * 0.35).toFixed(2)}`,
      '关注复购率，重点评估长期供应稳定性',
      category === '美妆' ? '美妆类需检查是否有相关认证（FDA/SGS）' : `${category}类注意售后和质量把控`,
    ];
  } else {
    verdict = '🌟 利润优秀，可备货';
    sourcing_tips = [
      '利润优秀，建议备货并扩大销售',
      `当前成本 ¥${cost}，有议价空间，批量采购可再降 10-20%`,
      '建议备货量：200-500 件，锁定供应商',
      '考虑独家/定制化，建立差异化竞争优势',
    ];
  }

  const search_urls = generateSearchUrls(keyword || category);

  return {
    margin: marginFixed,
    verdict,
    suggest_cost_target,
    sourcing_tips,
    search_urls,
    roi: parseFloat(((price - cost) / cost * 100).toFixed(1)),
  };
}

// ─── 主运行函数 ────────────────────────────────────────────────
export async function runSourcing(args) {
  const cmd = args[0];
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : null;
  };

  if (cmd === 'search') {
    const keyword = get('--keyword');
    if (!keyword) { console.error('需要提供 --keyword'); return null; }

    console.log(`\n🔍 采购来源搜索: "${keyword}"\n`);

    // 获取 Google 建议
    const [suggestions1, suggestions2] = await Promise.all([
      getGoogleSuggestions(`1688 ${keyword} 热销`).catch(() => []),
      getGoogleSuggestions(`wholesale ${keyword}`).catch(() => []),
    ]);

    const allSuggestions = [...new Set([...suggestions1, ...suggestions2])];

    console.log('💡 相关搜索建议:');
    allSuggestions.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));

    const searchUrls = generateSearchUrls(keyword);
    console.log('\n🔗 推荐采购平台:');
    searchUrls.forEach(({ platform, searchUrl, tip }) => {
      console.log(`  ${platform}: ${searchUrl}`);
      console.log(`    💡 ${tip}`);
    });

    const result = { keyword, suggestions: allSuggestions, search_urls: searchUrls };
    return result;

  } else if (cmd === 'analyze') {
    const cost = parseFloat(get('--cost'));
    const price = parseFloat(get('--price'));
    const category = get('--category') || '其他';
    const keyword = get('--keyword') || category;

    if (isNaN(cost) || isNaN(price)) {
      console.error('需要提供 --cost 和 --price');
      return null;
    }

    console.log(`\n📊 采购机会分析\n`);
    console.log(`  商品类目: ${category}`);
    console.log(`  采购成本: ¥${cost}`);
    console.log(`  销售价格: ¥${price}`);

    const analysis = analyzeSourcingOpportunity({ cost, price, category, keyword });

    console.log(`\n  毛利率: ${analysis.margin}%`);
    console.log(`  ROI: ${analysis.roi}%`);
    console.log(`  评估结论: ${analysis.verdict}`);
    console.log(`  建议目标成本: ¥${analysis.suggest_cost_target}`);
    console.log('\n  采购建议:');
    analysis.sourcing_tips.forEach(tip => console.log(`    • ${tip}`));
    console.log('\n  采购渠道:');
    analysis.search_urls.forEach(({ platform, searchUrl }) => {
      console.log(`    ${platform}: ${searchUrl}`);
    });

    return analysis;

  } else if (cmd === 'report') {
    console.log('\n📋 采购机会报告\n');

    // 读取 Shopify 配置
    const cfgPath = join(ROOT, 'config.json');
    if (!existsSync(cfgPath)) {
      console.log('⚠️ 未找到 config.json，请先完成初始化配置');
      console.log('建议先运行: node modules/analytics/daily-report.mjs');
      return null;
    }

    // 尝试读取最近的日报数据
    const reportPath = join(ROOT, 'tmp', 'daily-report.json');
    if (!existsSync(reportPath)) {
      console.log('⚠️ 暂无销售数据，请先运行日报分析:');
      console.log('  node modules/analytics/daily-report.mjs');
      console.log('\n示例采购分析:');

      const examples = [
        { name: '防晒霜 SPF50', cost: 25, price: 89, category: '美妆' },
        { name: '连衣裙夏款', cost: 45, price: 168, category: '女装' },
        { name: '无线耳机', cost: 80, price: 199, category: '电子' },
      ];

      examples.forEach(ex => {
        const a = analyzeSourcingOpportunity({ ...ex, keyword: ex.name });
        console.log(`\n  📦 ${ex.name}`);
        console.log(`     成本 ¥${ex.cost} → 售价 ¥${ex.price} | 毛利率 ${a.margin}% | ${a.verdict}`);
      });

      return { examples: examples.map(ex => ({
        ...ex,
        ...analyzeSourcingOpportunity({ ...ex, keyword: ex.name })
      }))};
    }

    try {
      const report = JSON.parse(readFileSync(reportPath, 'utf8'));
      const topProducts = report.top_products || [];
      console.log(`找到 ${topProducts.length} 个热销商品，生成采购建议:\n`);
      topProducts.slice(0, 10).forEach((p, i) => {
        console.log(`  ${i + 1}. ${p.title || p.name}`);
        console.log(`     销售额: ¥${p.revenue || 0}  销量: ${p.quantity || 0}`);
      });
      return { top_products: topProducts };
    } catch {
      console.log('⚠️ 日报数据读取失败，请重新运行日报分析');
      return null;
    }

  } else {
    console.log('用法:');
    console.log('  node modules/selection/sourcing.mjs search --keyword "防晒霜"');
    console.log('  node modules/selection/sourcing.mjs analyze --cost 30 --price 120 --category "美妆"');
    console.log('  node modules/selection/sourcing.mjs report');
    return null;
  }
}

// ─── CLI 入口 ──────────────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith('sourcing.mjs')) {
  const args = process.argv.slice(2);
  const result = await runSourcing(args);
  console.log(`\n__JSON_OUTPUT__ ${JSON.stringify({ ok: true, data: result })}`);
}
