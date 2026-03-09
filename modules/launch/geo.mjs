/**
 * 上新模組 — GEO 内容生成（Generative Engine Optimization）
 * 电商龙虾 modules/launch/geo.mjs
 *
 * GEO = 为 AI 搜索引擎（Perplexity / ChatGPT / Gemini）优化内容结构
 *   • FAQ（≥5 条问答，FAQ Schema JSON-LD）
 *   • 适合人群 / 不适合人群（对比段落）
 *   • 规格参数表（结构化）
 *   • 图片 Alt 文本建议
 *
 * 用法：
 *   node modules/launch/geo.mjs --product-id 123             # 生成 GEO 内容草稿
 *   node modules/launch/geo.mjs --product-id 123 --apply     # 写入商品描述
 *   node modules/launch/geo.mjs --product-id 123 --preview   # 预览 HTML 输出
 *
 * 导出：
 *   generateGeo(product, options)  → { faq, comparison, specTable, altTexts, html }
 *   applyGeo(productId, html)
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

async function loadShopify() {
  return import(`${ROOT}/connectors/shopify.js`);
}

// ─── FAQ 生成 ─────────────────────────────────────────────────

/**
 * 从商品数据生成 FAQ 草稿
 * 5个基础问题 + 根据变体/标签动态扩展
 */
function generateFaq(product) {
  const name = product.title;
  const variants = product.variants || [];
  const hasMultipleVariants = variants.length > 1;
  const tags = (product.tags || '').split(',').map(t => t.trim()).filter(Boolean);
  const price = variants[0]?.price || '0';
  const comparePrice = variants[0]?.compare_at_price;
  const stock = variants.reduce((sum, v) => sum + (v.inventory_quantity || 0), 0);

  const faq = [
    {
      q: `${name}的主要特点是什么？`,
      a: `[待填写：请描述商品的 3-5 个核心卖点，建议包含：材质/工艺、功能亮点、与同类产品的差异化优势。]`,
    },
    {
      q: `${name}适合哪些人使用？`,
      a: `[待填写：描述目标用户画像，如年龄段、使用场景、解决的痛点。]`,
    },
    {
      q: `${name}的尺寸/规格是什么？`,
      a: hasMultipleVariants
        ? `本品共有 ${variants.length} 个规格：${variants.map(v => v.title).join('、')}。[待填写：详细尺寸/参数]`
        : `[待填写：商品尺寸、重量、颜色等参数。]`,
    },
    {
      q: `${name}如何清洁和保养？`,
      a: `[待填写：保养说明，如清洗方式、储存条件、使用注意事项。]`,
    },
    {
      q: `${name}的价格是多少？有优惠吗？`,
      a: comparePrice
        ? `${name} 原价 ${comparePrice}，现售价 ${price}。${tags.includes('促销') ? '目前正在促销期间。' : '请关注我们的促销活动获取最新优惠。'}`
        : `${name} 售价 ${price}。请关注我们的促销活动获取最新优惠。`,
    },
    {
      q: `${name}库存充足吗？多久能发货？`,
      a: stock > 0
        ? `当前库存 ${stock} 件，正常情况下 1-3 个工作日内发货。`
        : `[待确认库存状态，请联系客服了解最新库存情况。]`,
    },
    {
      q: `${name}支持退换货吗？`,
      a: `支持7天无理由退换货。商品需保持原包装且未使用状态。如有质量问题，支持免费换货或全额退款。[请根据实际政策调整]`,
    },
  ];

  return faq;
}

// ─── FAQ Schema JSON-LD ───────────────────────────────────────

function generateFaqSchema(faq) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map(item => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.a,
      },
    })),
  };
}

// ─── 适合/不适合对比段落 ──────────────────────────────────────

function generateComparison(product) {
  const name = product.title;
  return {
    suitable: {
      title: `✅ ${name} 适合以下人群`,
      points: [
        '[待填写：适合人群 1，例如：追求性价比的用户]',
        '[待填写：适合人群 2，例如：有特定使用场景的用户]',
        '[待填写：适合人群 3，例如：初次购买该类产品的新手]',
      ],
    },
    notSuitable: {
      title: `⚠️ 以下情况不建议选择`,
      points: [
        '[待填写：不适合场景 1，例如：需要某特定功能的用户]',
        '[待填写：不适合场景 2，例如：预算有限的用户]',
      ],
    },
  };
}

// ─── 规格参数表 ───────────────────────────────────────────────

function generateSpecTable(product) {
  const rows = [
    { label: '商品名称', value: product.title },
    { label: '商品类型', value: product.product_type || '[待填写]' },
    { label: '品牌', value: product.vendor || '[待填写]' },
    { label: '重量', value: product.variants?.[0]?.weight ? `${product.variants[0].weight} ${product.variants[0].weight_unit || 'kg'}` : '[待填写]' },
    { label: '上架时间', value: product.published_at ? new Date(product.published_at).toLocaleDateString('zh-CN') : '[待填写]' },
  ];

  // 从 metafields 或 variants 补充
  if (product.variants?.length > 1) {
    const optionNames = product.options?.map(o => o.name) || [];
    optionNames.forEach(opt => {
      const values = product.options.find(o => o.name === opt)?.values || [];
      rows.push({ label: opt, value: values.join(' / ') });
    });
  }

  return rows;
}

// ─── 图片 Alt 建议 ────────────────────────────────────────────

function generateAltSuggestions(product) {
  const name = product.title;
  const images = product.images || [];

  return images.map((img, i) => ({
    imageId: img.id,
    src: img.src,
    currentAlt: img.alt || '',
    suggestedAlt: img.alt
      ? img.alt  // 已有则保留
      : i === 0
        ? `${name} - 主图`
        : `${name} - 细节图${i}`,
    needsUpdate: !img.alt || img.alt.trim() === '',
  }));
}

// ─── HTML 输出生成 ────────────────────────────────────────────

function buildHtml({ originalHtml, faq, comparison, specTable }) {
  const faqHtml = faq.map(item => `
<div class="faq-item">
  <h3>${item.q}</h3>
  <p>${item.a}</p>
</div>`).join('');

  const suitableHtml = comparison.suitable.points.map(p => `<li>${p}</li>`).join('');
  const notSuitableHtml = comparison.notSuitable.points.map(p => `<li>${p}</li>`).join('');

  const specHtml = specTable.map(row =>
    `<tr><td><strong>${row.label}</strong></td><td>${row.value}</td></tr>`
  ).join('');

  const faqSchema = JSON.stringify(generateFaqSchema(faq), null, 2);

  return `${originalHtml || ''}

<h2>📋 产品规格</h2>
<table>
  <tbody>${specHtml}</tbody>
</table>

<h2>👥 适用人群</h2>
<h3>${comparison.suitable.title}</h3>
<ul>${suitableHtml}</ul>
<h3>${comparison.notSuitable.title}</h3>
<ul>${notSuitableHtml}</ul>

<h2>❓ 常见问题</h2>
<div class="faq-section">${faqHtml}</div>

<script type="application/ld+json">
${faqSchema}
</script>`;
}

// ─── 主导出 ────────────────────────────────────────────────────

export function generateGeo(product) {
  const faq        = generateFaq(product);
  const comparison = generateComparison(product);
  const specTable  = generateSpecTable(product);
  const altTexts   = generateAltSuggestions(product);
  const html       = buildHtml({
    originalHtml: product.body_html,
    faq, comparison, specTable,
  });

  return { faq, comparison, specTable, altTexts, html, faqSchema: generateFaqSchema(faq) };
}

export async function applyGeo(productId, html) {
  const { shopifyPatch } = await loadShopify();
  await shopifyPatch(`/products/${productId}.json`, {
    product: { id: productId, body_html: html },
  });
  return { ok: true, productId };
}

// ─── CLI ──────────────────────────────────────────────────────

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const get  = f => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };
  const has  = f => args.includes(f);

  const productId = get('--product-id');
  if (!productId) {
    console.error('❌ 缺少 --product-id');
    process.exit(1);
  }

  async function main() {
    const { getProduct } = await loadShopify();
    const product = await getProduct(productId);
    const geo = generateGeo(product);

    console.log(`\n🌐 GEO 内容生成 — ${product.title}\n`);

    // FAQ 预览
    console.log(`── FAQ（${geo.faq.length} 条）────────────────────────`);
    geo.faq.forEach((item, i) => {
      console.log(`  Q${i + 1}: ${item.q}`);
      console.log(`  A:  ${item.a.substring(0, 80)}...\n`);
    });

    // 规格表
    console.log('── 规格参数表 ───────────────────────────────');
    geo.specTable.forEach(r => console.log(`  ${r.label.padEnd(12)}：${r.value}`));

    // Alt 文本
    const needsAlt = geo.altTexts.filter(a => a.needsUpdate);
    if (needsAlt.length > 0) {
      console.log(`\n── 图片 Alt 建议（${needsAlt.length} 张需更新）────────`);
      needsAlt.forEach(a => console.log(`  图片 ${a.imageId}：建议 → "${a.suggestedAlt}"`));
    }

    if (has('--apply')) {
      console.log('\n📝 正在写入商品描述...');
      await applyGeo(productId, geo.html);
      console.log('✅ GEO 内容已写入商品描述');
    } else if (has('--preview')) {
      console.log('\n── HTML 预览 ────────────────────────────────');
      console.log(geo.html.substring(0, 500) + '...');
      console.log('\n（使用 --apply 将内容写入 Shopify）');
    } else {
      console.log('\n  使用 --apply 将生成内容写入 Shopify');
      console.log('  使用 --preview 预览完整 HTML');
    }

    process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify({
      productId, productTitle: product.title,
      faqCount: geo.faq.length,
      specCount: geo.specTable.length,
      altNeedsUpdate: needsAlt.length,
      geo,
    }) + '\n');
  }

  main().catch(e => { console.error('❌', e.message); process.exit(1); });
}
