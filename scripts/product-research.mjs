/**
 * 选品雷达
 * 电商龙虾 — 商品利润计算 / 关键词建议 / 趋势分析
 *
 * 用法：
 *   node product-research.mjs profit --cost 50 --price 150 --platform-fee 0.05 --shipping 15
 *   node product-research.mjs keywords --product '猫咪零食'
 *   node product-research.mjs trends --keyword '防晒霜'
 */

import https from 'https';

const args = process.argv.slice(2);
const subcommand = args[0];

function getArg(flag) {
  const i = args.indexOf(flag);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
}

function showHelp() {
  console.log(`🦞 电商龙虾 — 选品雷达

用法：
  node product-research.mjs profit --cost 50 --price 150 --platform-fee 0.05 --shipping 15 [--other-cost 0]
  node product-research.mjs keywords --product '猫咪零食'
  node product-research.mjs trends --keyword '防晒霜'

子命令：
  profit     利润计算器
  keywords   SEO关键词建议
  trends     Google Trends 趋势分析`);
}

// ─── profit ───────────────────────────────────────────────

function runProfit() {
  const cost = parseFloat(getArg('--cost'));
  const price = parseFloat(getArg('--price'));
  const platformFee = parseFloat(getArg('--platform-fee') || '0');
  const shipping = parseFloat(getArg('--shipping') || '0');
  const otherCost = parseFloat(getArg('--other-cost') || '0');

  if (isNaN(cost) || isNaN(price)) {
    console.error('❌ 缺少 --cost 或 --price 参数');
    process.exit(1);
  }
  if (platformFee < 0 || platformFee > 1) {
    console.error('❌ --platform-fee 需在 0~1 之间');
    process.exit(1);
  }

  const commission = price * platformFee;
  const totalCost = cost + commission + shipping + otherCost;
  const profit = price - totalCost;
  const profitRate = price > 0 ? (profit / price) : 0;
  const roi = totalCost > 0 ? (profit / totalCost) : 0;

  const suggestedMin = (cost * 1.5).toFixed(2);
  const suggestedMax = (cost * 3).toFixed(2);

  console.log('🦞 电商龙虾 — 利润计算器\n');
  console.log('💰 **成本明细**');
  console.log(`• 进货成本：¥${cost.toFixed(2)}`);
  console.log(`• 平台佣金：¥${commission.toFixed(2)}（${(platformFee * 100).toFixed(1)}%）`);
  console.log(`• 运费：¥${shipping.toFixed(2)}`);
  console.log(`• 其他成本：¥${otherCost.toFixed(2)}`);
  console.log(`• 总成本：¥${totalCost.toFixed(2)}`);
  console.log('');
  console.log('📊 **利润分析**');
  console.log(`• 售价：¥${price.toFixed(2)}`);
  console.log(`• 利润额：¥${profit.toFixed(2)}`);
  console.log(`• 利润率：${(profitRate * 100).toFixed(1)}%`);
  console.log(`• ROI：${(roi * 100).toFixed(1)}%`);
  console.log('');
  console.log('💡 **建议售价区间**');
  console.log(`• 保守（1.5x成本）：¥${suggestedMin}`);
  console.log(`• 理想（3x成本）：¥${suggestedMax}`);

  if (profit < 0) {
    console.log('\n⚠️ **警告：当前售价低于成本，处于亏损状态！**');
  } else if (profitRate < 0.2) {
    console.log('\n⚠️ **提示：利润率偏低，建议调整售价或降低成本**');
  }

  const output = {
    cost, price, platformFee, shipping, otherCost,
    commission: +commission.toFixed(2),
    totalCost: +totalCost.toFixed(2),
    profit: +profit.toFixed(2),
    profitRate: +(profitRate * 100).toFixed(1),
    roi: +(roi * 100).toFixed(1),
    suggestedPriceRange: { min: +suggestedMin, max: +suggestedMax }
  };

  process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(output) + '\n');
}

// ─── keywords ─────────────────────────────────────────────

function runKeywords() {
  const product = getArg('--product');
  if (!product) {
    console.error('❌ 缺少 --product 参数');
    process.exit(1);
  }

  // 本地关键词生成算法
  const chars = [...product];
  const words = product.split(/[\s,，、/]+/).filter(Boolean);

  // 场景词
  const scenes = ['家用', '办公室', '户外', '旅行', '日常', '送礼', '节日', '学生'];
  // 人群词
  const audiences = ['女性', '男性', '儿童', '宝宝', '老人', '上班族', '学生党'];
  // 修饰词
  const modifiers = ['高品质', '热销', '网红', '爆款', '性价比', '平价', '正品', '新款', '畅销', '进口'];
  // 功能词
  const functions = ['推荐', '排行榜', '评测', '对比', '怎么选', '哪个好', '品牌', '批发'];

  const keywords = new Set();

  // 原始词
  keywords.add(product);

  // 拆分组合
  if (words.length >= 2) {
    for (let i = 0; i < words.length; i++) {
      keywords.add(words[i]);
      for (let j = 0; j < words.length; j++) {
        if (i !== j) keywords.add(words[j] + words[i]);
      }
    }
  }

  // 场景词组合
  for (const scene of scenes) {
    keywords.add(scene + product);
    if (keywords.size >= 20) break;
  }

  // 人群词组合
  for (const aud of audiences) {
    keywords.add(aud + product);
    if (keywords.size >= 25) break;
  }

  // 修饰词组合
  for (const mod of modifiers) {
    keywords.add(mod + product);
    if (keywords.size >= 30) break;
  }

  // 功能词组合
  for (const fn of functions) {
    keywords.add(product + fn);
    if (keywords.size >= 35) break;
  }

  // 取 10~15 个
  const result = [...keywords].slice(0, 15);

  console.log(`🦞 电商龙虾 — SEO关键词建议\n`);
  console.log(`🔍 商品：${product}\n`);
  console.log('📝 **推荐关键词**（10~15条）');
  result.forEach((kw, i) => {
    console.log(`${String(i + 1).padStart(2, ' ')}. ${kw}`);
  });
  console.log('\n💡 建议：将以上关键词用于商品标题、描述、标签中以提升搜索排名');

  const output = { product, keywords: result, count: result.length };
  process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(output) + '\n');
}

// ─── trends ───────────────────────────────────────────────

function fetchTrends(keyword) {
  return new Promise((resolve, reject) => {
    const url = `https://trends.google.com/trends/explore?q=${encodeURIComponent(keyword)}&geo=CN`;

    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9'
      },
      timeout: 10000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });
  });
}

async function runTrends() {
  const keyword = getArg('--keyword');
  if (!keyword) {
    console.error('❌ 缺少 --keyword 参数');
    process.exit(1);
  }

  console.log(`🦞 电商龙虾 — 趋势分析\n`);
  console.log(`🔍 关键词：${keyword}\n`);

  let useMock = false;
  let trendData = null;

  try {
    console.log('正在获取 Google Trends 数据...');
    const result = await fetchTrends(keyword);

    // 尝试从页面中提取趋势数据
    const body = result.body;

    // Google Trends 会在页面中嵌入数据，尝试提取
    const dataMatch = body.match(/window\.TrendData\s*=\s*(\{[\s\S]*?\});/);
    const compMatch = body.match(/"comparisonItem":\s*\[([\s\S]*?)\]/);

    if (dataMatch || compMatch) {
      try {
        trendData = JSON.parse(dataMatch ? dataMatch[1] : `{${compMatch[0]}}`);
      } catch {
        useMock = true;
      }
    } else {
      useMock = true;
    }
  } catch (err) {
    console.log(`⚠️ Google Trends 抓取失败：${err.message}`);
    useMock = true;
  }

  if (useMock) {
    console.log('⚠️ 已降级为模拟数据（Google Trends 无法直接抓取，需使用浏览器或代理）\n');

    // 生成近 12 个月的模拟趋势数据
    const months = [];
    const now = new Date();
    const base = 30 + Math.floor(Math.random() * 40);

    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      // 模拟季节性波动
      const seasonal = Math.sin((d.getMonth() - 2) / 12 * Math.PI * 2) * 20;
      const noise = Math.floor(Math.random() * 15) - 7;
      const interest = Math.max(0, Math.min(100, Math.round(base + seasonal + noise)));
      months.push({ month, interest });
    }

    // 相关搜索
    const relatedQueries = [
      `${keyword} 推荐`, `${keyword} 排行榜`, `${keyword} 品牌`,
      `${keyword} 价格`, `${keyword} 测评`, `好用的${keyword}`,
      `${keyword} 哪个好`, `便宜的${keyword}`
    ];

    console.log('📊 **搜索热度趋势**（模拟数据）');
    const maxInterest = Math.max(...months.map(m => m.interest));
    for (const m of months) {
      const barLen = Math.round(m.interest / maxInterest * 30);
      const bar = '█'.repeat(barLen) + '░'.repeat(30 - barLen);
      console.log(`  ${m.month}  ${bar}  ${m.interest}`);
    }

    console.log('\n🔗 **相关搜索**');
    relatedQueries.forEach((q, i) => {
      console.log(`${String(i + 1).padStart(2, ' ')}. ${q}`);
    });

    const peak = months.reduce((max, m) => m.interest > max.interest ? m : max, months[0]);
    const low = months.reduce((min, m) => m.interest < min.interest ? m : min, months[0]);
    console.log(`\n💡 **分析**`);
    console.log(`• 搜索高峰期：${peak.month}（热度 ${peak.interest}）`);
    console.log(`• 搜索低谷期：${low.month}（热度 ${low.interest}）`);
    console.log(`• 建议在高峰前 1~2 个月备货和投放广告`);

    trendData = {
      keyword,
      source: 'mock',
      note: 'Google Trends 无法直接抓取，此为模拟数据。建议使用 Google Trends 网站手动查看',
      trendUrl: `https://trends.google.com/trends/explore?q=${encodeURIComponent(keyword)}&geo=CN`,
      months,
      relatedQueries,
      peak: { month: peak.month, interest: peak.interest },
      low: { month: low.month, interest: low.interest }
    };
  }

  process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(trendData) + '\n');
}

// ─── main ─────────────────────────────────────────────────

async function run() {
  switch (subcommand) {
    case 'profit':
      runProfit();
      break;
    case 'keywords':
      runKeywords();
      break;
    case 'trends':
      await runTrends();
      break;
    default:
      showHelp();
      if (subcommand) {
        console.error(`\n❌ 未知子命令：${subcommand}`);
        process.exit(1);
      }
  }
}

run().catch(err => {
  console.error('❌ 选品雷达错误：', err.message);
  process.exit(1);
});
