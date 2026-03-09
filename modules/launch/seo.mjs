/**
 * 上新模組 — SEO 审计 & 写入
 * 电商龙虾 modules/launch/seo.mjs
 *
 * 用法：
 *   node modules/launch/seo.mjs --product-id 123          # 审计商品 SEO
 *   node modules/launch/seo.mjs --product-id 123 --apply  # 写入 SEO 字段
 *     --meta-title "..."  --meta-desc "..."  --handle "my-product"
 *
 * 导出：
 *   auditSeo(productId)   → { score, fields, suggestions }
 *   applySeo(productId, { metaTitle, metaDesc, handle, altTexts })
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

async function loadShopify() {
  const m = await import(`${ROOT}/connectors/shopify.js`);
  return m;
}

// ─── SEO 评分规则 ─────────────────────────────────────────────

const RULES = {
  title: {
    label: '商品标题',
    check: (v) => {
      if (!v) return { ok: false, msg: '缺少标题', score: 0 };
      const len = v.length;
      if (len < 20) return { ok: false, msg: `标题过短（${len}字），建议 30-70 字`, score: 30 };
      if (len > 100) return { ok: false, msg: `标题过长（${len}字），建议 30-70 字`, score: 60 };
      return { ok: true, msg: `标题长度 ${len} 字 ✓`, score: 100 };
    },
    weight: 15,
  },
  metaTitle: {
    label: 'Meta 标题',
    check: (v) => {
      if (!v) return { ok: false, msg: '缺少 Meta 标题（影响搜索结果展示标题）', score: 0 };
      const len = v.length;
      if (len < 30) return { ok: false, msg: `Meta 标题过短（${len}字），建议 50-60 字`, score: 40 };
      if (len > 70) return { ok: false, msg: `Meta 标题过长（${len}字），超出截断阈值 60 字`, score: 60 };
      return { ok: true, msg: `Meta 标题 ${len} 字，在 50-60 字理想区间 ✓`, score: 100 };
    },
    weight: 20,
  },
  metaDesc: {
    label: 'Meta 描述',
    check: (v) => {
      if (!v) return { ok: false, msg: '缺少 Meta 描述（影响搜索结果摘要）', score: 0 };
      const len = v.length;
      if (len < 80) return { ok: false, msg: `Meta 描述过短（${len}字），建议 150-160 字`, score: 30 };
      if (len > 200) return { ok: false, msg: `Meta 描述过长（${len}字），超出截断阈值 160 字`, score: 60 };
      return { ok: true, msg: `Meta 描述 ${len} 字 ✓`, score: 100 };
    },
    weight: 20,
  },
  handle: {
    label: 'URL 路径',
    check: (v) => {
      if (!v) return { ok: false, msg: '缺少 URL handle', score: 0 };
      if (/[A-Z]/.test(v)) return { ok: false, msg: '包含大写字母，应全小写', score: 50 };
      if (/[^a-z0-9-]/.test(v)) return { ok: false, msg: '包含特殊字符，应只用字母、数字、连字符', score: 40 };
      if (v.includes('--')) return { ok: false, msg: '包含连续连字符', score: 70 };
      if (v.length > 60) return { ok: false, msg: `URL 过长（${v.length}字符），建议 ≤50 字符`, score: 70 };
      return { ok: true, msg: `URL 路径规范 ✓`, score: 100 };
    },
    weight: 15,
  },
  description: {
    label: '商品描述',
    check: (v) => {
      const text = v ? v.replace(/<[^>]+>/g, '').trim() : '';
      if (!text) return { ok: false, msg: '缺少商品描述', score: 0 };
      if (text.length < 100) return { ok: false, msg: `描述内容过少（${text.length}字），建议 ≥300 字`, score: 30 };
      if (text.length < 300) return { ok: false, msg: `描述内容偏少（${text.length}字），建议 ≥300 字`, score: 70 };
      return { ok: true, msg: `描述内容 ${text.length} 字 ✓`, score: 100 };
    },
    weight: 15,
  },
  images: {
    label: '图片 Alt 文本',
    check: (images) => {
      if (!images || images.length === 0) return { ok: false, msg: '无商品图片', score: 0 };
      const noAlt = images.filter(img => !img.alt || img.alt.trim() === '').length;
      if (noAlt === images.length) return { ok: false, msg: `全部 ${images.length} 张图片缺少 Alt 文本`, score: 0 };
      if (noAlt > 0) return { ok: false, msg: `${noAlt}/${images.length} 张图片缺少 Alt 文本`, score: Math.round((1 - noAlt / images.length) * 80) };
      return { ok: true, msg: `全部 ${images.length} 张图片有 Alt 文本 ✓`, score: 100 };
    },
    weight: 10,
  },
  tags: {
    label: '商品标签',
    check: (tags) => {
      const count = Array.isArray(tags) ? tags.length : (tags || '').split(',').filter(Boolean).length;
      if (count === 0) return { ok: false, msg: '无标签，建议添加 5-10 个关键词标签', score: 0 };
      if (count < 3) return { ok: false, msg: `仅有 ${count} 个标签，建议 5-10 个`, score: 40 };
      if (count > 20) return { ok: false, msg: `标签过多（${count}个），建议精选 5-10 个`, score: 70 };
      return { ok: true, msg: `${count} 个标签 ✓`, score: 100 };
    },
    weight: 5,
  },
};

// ─── 核心：审计 ────────────────────────────────────────────────

export async function auditSeo(productId) {
  const { getProduct, getProductMetafields } = await loadShopify();
  const product = await getProduct(productId);
  const metafields = await getProductMetafields(productId);

  // 提取 SEO metafields
  const metaTitleField = metafields.find(m => m.namespace === 'global' && m.key === 'title_tag');
  const metaDescField  = metafields.find(m => m.namespace === 'global' && m.key === 'description_tag');

  const data = {
    title:    product.title,
    metaTitle: metaTitleField?.value || '',
    metaDesc:  metaDescField?.value || '',
    handle:    product.handle,
    description: product.body_html,
    images:   product.images || [],
    tags:     product.tags,
  };

  // 逐项评分
  let totalScore = 0;
  let totalWeight = 0;
  const fields = {};

  for (const [key, rule] of Object.entries(RULES)) {
    const result = rule.check(data[key]);
    fields[key] = { label: rule.label, ...result, weight: rule.weight };
    totalScore  += result.score * rule.weight;
    totalWeight += rule.weight;
  }

  const score = Math.round(totalScore / totalWeight);
  const grade = score >= 85 ? '🟢 优秀' : score >= 65 ? '🟡 待优化' : '🔴 需修复';

  // 建议（只列未通过的）
  const suggestions = Object.entries(fields)
    .filter(([, f]) => !f.ok)
    .map(([key, f]) => ({ key, label: f.label, msg: f.msg }));

  return {
    productId,
    productTitle: product.title,
    score,
    grade,
    fields,
    suggestions,
    hasMetaTitle: !!metaTitleField,
    hasMetaDesc:  !!metaDescField,
    imageCount:   product.images?.length || 0,
    noAltCount:   (product.images || []).filter(i => !i.alt).length,
  };
}

// ─── 核心：写入 SEO 字段 ───────────────────────────────────────

export async function applySeo(productId, { metaTitle, metaDesc, handle, altTexts = {} }) {
  const { shopifyPatch, upsertProductMetafield } = await loadShopify();
  const results = [];

  // 更新 handle（URL路径）
  if (handle) {
    await shopifyPatch(`/products/${productId}.json`, { product: { id: productId, handle } });
    results.push(`✅ URL handle → ${handle}`);
  }

  // 写入 Meta 标题
  if (metaTitle) {
    await upsertProductMetafield(productId, { namespace: 'global', key: 'title_tag', value: metaTitle, type: 'single_line_text_field' });
    results.push(`✅ Meta 标题 → ${metaTitle}`);
  }

  // 写入 Meta 描述
  if (metaDesc) {
    await upsertProductMetafield(productId, { namespace: 'global', key: 'description_tag', value: metaDesc, type: 'single_line_text_field' });
    results.push(`✅ Meta 描述 → ${metaDesc.substring(0, 50)}...`);
  }

  // 更新图片 Alt 文本 { imageId: altText }
  if (Object.keys(altTexts).length > 0) {
    const { updateImageAlt } = await loadShopify();
    for (const [imageId, alt] of Object.entries(altTexts)) {
      await updateImageAlt(productId, imageId, alt);
      results.push(`✅ 图片 ${imageId} alt → ${alt}`);
    }
  }

  return results;
}

// ─── CLI ──────────────────────────────────────────────────────

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args  = process.argv.slice(2);
  const get   = f => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };
  const has   = f => args.includes(f);

  const productId = get('--product-id');
  if (!productId) {
    console.error('❌ 缺少 --product-id');
    console.log('用法：node modules/launch/seo.mjs --product-id 123 [--apply --meta-title "..." --meta-desc "..." --handle "..."]');
    process.exit(1);
  }

  async function main() {
    if (has('--apply')) {
      // 写入模式
      const opts = {
        metaTitle: get('--meta-title'),
        metaDesc:  get('--meta-desc'),
        handle:    get('--handle'),
      };
      if (!opts.metaTitle && !opts.metaDesc && !opts.handle) {
        console.error('❌ --apply 模式需提供至少一个字段：--meta-title / --meta-desc / --handle');
        process.exit(1);
      }
      console.log(`\n📝 写入 SEO 字段 → 商品 ${productId}\n`);
      const results = await applySeo(productId, opts);
      results.forEach(r => console.log('  ' + r));
      console.log('\n✅ SEO 字段已更新');
      process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify({ ok: true, productId, applied: opts }) + '\n');
    } else {
      // 审计模式
      console.log(`\n🔍 SEO 审计 — 商品 ${productId}\n`);
      const audit = await auditSeo(productId);

      console.log(`商品：${audit.productTitle}`);
      console.log(`综合评分：${audit.score} / 100  ${audit.grade}\n`);
      console.log('── 字段详情 ──────────────────────────');
      for (const [, f] of Object.entries(audit.fields)) {
        const icon = f.ok ? '✅' : '❌';
        console.log(`  ${icon} ${f.label}（权重 ${f.weight}%）：${f.msg}`);
      }

      if (audit.suggestions.length > 0) {
        console.log('\n── 优化建议 ──────────────────────────');
        audit.suggestions.forEach((s, i) => {
          console.log(`  ${i + 1}. [${s.label}] ${s.msg}`);
        });
      } else {
        console.log('\n🎉 所有 SEO 字段均已达标！');
      }

      process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(audit) + '\n');
    }
  }

  main().catch(e => { console.error('❌', e.message); process.exit(1); });
}
