/**
 * 上新模組 — 多平台文案生成器 v2
 * 电商龙虾 modules/launch/copywriter.mjs
 * （从 scripts/copywriter.mjs 迁移，新增 TikTok 平台 + 商品ID拉取）
 *
 * 用法：
 *   node modules/launch/copywriter.mjs --product-id 123 --platform xiaohongshu
 *   node modules/launch/copywriter.mjs --name "防晒霜" --points "轻薄,防水,SPF50" --platform tiktok
 *
 * 平台：shopify / woocommerce / taobao / xiaohongshu / douyin / tiktok / wechat
 *
 * 导出：
 *   generateCopy({ name, points, platform, audience, price, comparePrice }) → result
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

// ─── 各平台生成函数 ────────────────────────────────────────────

function genShopify(name, points, price, comparePrice) {
  const savings = comparePrice ? ` (原价 ${comparePrice}，立省 ${(parseFloat(comparePrice) - parseFloat(price)).toFixed(2)})` : '';
  return {
    title:           `${name} - ${points[0] || '高品质'}`,
    metaTitle:       `${name} | ${points.slice(0, 2).join(' · ')} | 正品保证`.substring(0, 60),
    metaDescription: `${name}，${points.join('，')}。${price ? `现价 ${price}${savings}` : ''}立即选购！`.substring(0, 160),
    description: [
      `<h2>关于 ${name}</h2>`,
      `<ul>`,
      points.map(p => `  <li>${p}</li>`).join('\n'),
      `</ul>`,
      price ? `<p><strong>售价：${price}</strong>${comparePrice ? ` <del>${comparePrice}</del>` : ''}</p>` : '',
      `<p>${name} — 品质之选，每一个细节都经过精心打磨。</p>`,
    ].filter(Boolean).join('\n'),
    seoKeywords: [name, ...points.slice(0, 3).map(p => p.substring(0, 15))].join(', '),
  };
}

function genWooCommerce(name, points, price) {
  return {
    name:             name,
    short_description: points.slice(0, 3).map(p => `✓ ${p}`).join('  '),
    description: [
      `<h3>${name} — 产品特点</h3>`,
      `<ul>` + points.map(p => `<li>${p}</li>`).join('') + `</ul>`,
      `<h3>为什么选择 ${name}？</h3>`,
      `<p>${points[0] || ''}，${points[1] || ''}。无论是质量还是性价比，${name}都是您的理想之选。</p>`,
    ].join('\n'),
    yoast_meta_title:       `${name} - ${points[0] || ''}`.substring(0, 60),
    yoast_meta_description: `${name}：${points.join('，')}。${price ? '现价 ' + price : ''}`.substring(0, 160),
  };
}

function genTaobao(name, points) {
  return {
    title:          `【正品】${name} ${points.slice(0, 2).join(' ')} 包邮`.substring(0, 60),
    bulletPoints:   points.map(p => `【${p}】`),
    detailPage: [
      `★★★ ${name} 核心亮点 ★★★`,
      '',
      points.map((p, i) => `${['①','②','③','④','⑤'][i] || '▶'} ${p}`).join('\n'),
      '',
      `✅ 正品保障  ✅ 极速发货  ✅ 7天退换`,
    ].join('\n'),
    searchKeywords: [name, `${name}推荐`, `好用的${name}`, ...points.map(p => p.substring(0, 8))].slice(0, 10).join(' '),
  };
}

function genXiaohongshu(name, points, audience) {
  const hooks = [
    `我买过最值的${name}！姐妹们必看`,
    `${name}深度测评｜用了三个月的真实感受`,
    `种草了很久终于入手｜${name}真实反馈`,
    `${name}避雷&推荐｜这款真的有必要买吗`,
    `作为一个${audience}，我花了半个月选到了这款${name}`,
  ];
  const hook = hooks[Math.floor(Math.random() * hooks.length)];

  return {
    标题: hook,
    正文: [
      hook,
      '',
      `最近入手了 ${name}，分享一下真实使用体验 👇`,
      '',
      points.map((p, i) => `${['❶','❷','❸','❹','❺'][i] || '•'} ${p}`).join('\n'),
      '',
      `总结：${name}对于${audience}来说性价比确实不错`,
      `${points[0] ? `最喜欢的一点是${points[0]}` : ''}，推荐大家入手！`,
      '',
      '有问题评论区见，我都会回～',
    ].filter(Boolean).join('\n'),
    标签: [`#${name}`, `#${name}测评`, `#种草`, `#好物分享`, `#真实测评`,
           ...points.slice(0, 2).map(p => `#${p.substring(0, 8)}`)].join(' '),
  };
}

function genDouyin(name, points) {
  return {
    封面文案:  `${name}！${points[0] || '你一定要看看这个'}`,
    口播脚本: [
      `[开场 0-3s] 今天测评一款${name}，真的有点出乎意料！`,
      `[展示 3-10s] 先看${points[0] || '外观'}——${points[0] || '第一眼就爱上了'}`,
      points[1] ? `[对比 10-20s] 重点来了，${points[1]}，同价位很少见` : '',
      points[2] ? `[加码 20-30s] 还有一个细节，${points[2]}` : '',
      `[转化 30s+] 想要的朋友点下方链接，限量库存，手慢无！`,
    ].filter(Boolean).join('\n'),
    视频标题: `${name}真实测评！${points.slice(0,2).join('，')}`.substring(0, 30),
    评论区引导: `有没有用过${name}的朋友？来评论区聊聊 👇`,
  };
}

function genTikTok(name, points, audience) {
  return {
    videoHook:   `POV: you finally found the perfect ${name} 😍`,
    caption:     `${name} that actually works! ${points.slice(0,2).join(' + ')} ✨ Link in bio 🛒`,
    script: [
      `[Hook 0-2s] Stop scrolling! This ${name} is insane 👀`,
      `[Problem 2-5s] If you've been struggling with [problem this solves]...`,
      `[Solution 5-15s] Meet the ${name}. ${points[0] || 'Here\'s what makes it different:'}`,
      points[1] ? `[Feature 15-20s] And ${points[1]} — which you rarely see at this price` : '',
      points[2] ? `[Bonus 20-25s] PLUS: ${points[2]}` : '',
      `[CTA 25-30s] Link in bio, limited stock. Thank me later 🙌`,
    ].filter(Boolean).join('\n'),
    hashtags:    `#${name.replace(/\s+/g,'')} #TikTokShop #fyp #tiktokmademebuyit #shopnow`.toLowerCase(),
    productTitle: `${name} - ${points[0] || 'Premium Quality'}`.substring(0, 80),
    bulletPoints: points.map(p => `✅ ${p}`),
  };
}

function genWechat(name, points, audience) {
  return {
    标题:  `${name}：${points[0] || '值得拥有'}`,
    副标题: `${audience}必看！我研究了一个月选出来的`,
    正文: [
      `最近帮朋友选${name}，顺便整理了一下选购指南。`,
      '',
      `📌 为什么推荐这款？`,
      points.map(p => `→ ${p}`).join('\n'),
      '',
      `适合：${audience}日常使用`,
      '',
      `👇 点击下方小程序/链接直接购买`,
    ].join('\n'),
    朋友圈文案: `发现一款好用的${name}，${points[0] || '真心推荐'}！${points[1] ? points[1] + '，' : ''}感兴趣的朋友私我 💬`,
  };
}

// ─── 主导出 ────────────────────────────────────────────────────

export function generateCopy({ name, points = [], platform, audience = '普通消费者', price = '', comparePrice = '' }) {
  const generators = {
    shopify:     () => genShopify(name, points, price, comparePrice),
    woocommerce: () => genWooCommerce(name, points, price),
    taobao:      () => genTaobao(name, points),
    xiaohongshu: () => genXiaohongshu(name, points, audience),
    douyin:      () => genDouyin(name, points),
    tiktok:      () => genTikTok(name, points, audience),
    wechat:      () => genWechat(name, points, audience),
  };

  const gen = generators[platform];
  if (!gen) throw new Error(`不支持的平台：${platform}。支持：${Object.keys(generators).join(', ')}`);

  return gen();
}

// 从 Shopify 商品数据提取生成参数
export function extractFromProduct(product) {
  const variants = product.variants || [];
  const price = variants[0]?.price || '';
  const comparePrice = variants[0]?.compare_at_price || '';

  // 从 body_html 提取卖点（简单版：取 <li> 内容）
  const liMatches = (product.body_html || '').match(/<li[^>]*>([^<]+)<\/li>/gi) || [];
  const points = liMatches
    .map(li => li.replace(/<[^>]+>/g, '').trim())
    .filter(p => p.length > 3 && p.length < 50)
    .slice(0, 6);

  return {
    name:  product.title,
    points: points.length > 0 ? points : ['高品质材料', '精心设计', '耐用耐用'],
    price,
    comparePrice,
    productType: product.product_type,
  };
}

// ─── CLI ──────────────────────────────────────────────────────

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const get  = f => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };

  const productId    = get('--product-id');
  const platform     = get('--platform') || 'shopify';
  const manualName   = get('--name');
  const manualPoints = get('--points');
  const audience     = get('--audience') || '普通消费者';
  const price        = get('--price') || '';

  // 支持一次生成多平台
  const allPlatforms = ['shopify','woocommerce','taobao','xiaohongshu','douyin','tiktok','wechat'];
  const platforms = platform === 'all' ? allPlatforms : [platform];

  async function main() {
    let opts;

    if (productId) {
      const { getProduct } = await import(`${ROOT}/connectors/shopify.js`);
      const product = await getProduct(productId);
      const extracted = extractFromProduct(product);
      console.log(`\n✅ 已拉取商品：${product.title}`);
      console.log(`   自动提取卖点：${extracted.points.join('，')}\n`);
      opts = { ...extracted, audience, platform };
      // 允许手动覆盖卖点
      if (manualPoints) opts.points = manualPoints.split(',').filter(Boolean);
    } else if (manualName) {
      opts = {
        name:   manualName,
        points: (manualPoints || '').split(',').filter(Boolean),
        audience, price, platform,
      };
    } else {
      console.error('❌ 需提供 --product-id 或 --name');
      process.exit(1);
    }

    console.log(`🦞 文案生成 — ${opts.name}`);
    const results = {};

    for (const p of platforms) {
      console.log(`\n━━ ${p.toUpperCase()} ${'─'.repeat(40 - p.length)}`);
      const result = generateCopy({ ...opts, platform: p });
      results[p] = result;
      // 打印输出
      Object.entries(result).forEach(([key, val]) => {
        console.log(`\n【${key}】`);
        console.log(typeof val === 'string' ? val : Array.isArray(val) ? val.join('\n') : JSON.stringify(val, null, 2));
      });
    }

    process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify({
      name: opts.name, platforms, results,
    }) + '\n');
  }

  main().catch(e => { console.error('❌', e.message); process.exit(1); });
}
