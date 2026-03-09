/**
 * 上新模組 — 总入口（上新诊断 + 流程调度）
 * 电商龙虾 modules/launch/index.mjs
 *
 * 用法：
 *   node modules/launch/index.mjs --product-id 123          # 商品上新诊断
 *   node modules/launch/index.mjs --product-id 123 --run-seo    # 运行 SEO 审计
 *   node modules/launch/index.mjs --product-id 123 --run-geo    # 生成 GEO 内容
 *   node modules/launch/index.mjs --product-id 123 --run-copy   # 生成文案（指定平台）
 *   node modules/launch/index.mjs --product-id 123 --run-all    # 全流程诊断
 *   node modules/launch/index.mjs --list-drafts               # 列出所有草稿商品
 *   node modules/launch/index.mjs --list-incomplete           # 列出上新不完整的商品
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

async function loadShopify() {
  return import(`${ROOT}/connectors/shopify.js`);
}

// ─── 上新完整度评估 ────────────────────────────────────────────

function assessLaunchReadiness(product) {
  const checks = [];
  let totalScore = 0;
  const maxScore = 100;

  function check(label, condition, score, suggestion) {
    const passed = Boolean(condition);
    checks.push({ label, passed, score: passed ? score : 0, maxScore: score, suggestion: passed ? null : suggestion });
    if (passed) totalScore += score;
  }

  // 基础信息
  check('商品标题',    product.title && product.title.length >= 10, 10, '标题过短，建议 20-70 字');
  check('商品描述',    product.body_html && product.body_html.replace(/<[^>]+>/g,'').trim().length >= 100, 15, '描述内容不足 100 字，建议写 300 字以上');
  check('商品分类',    product.product_type, 5, '未设置商品分类（product_type）');
  check('供应商/品牌', product.vendor, 5, '未设置品牌/供应商');

  // 图片
  const imgCount = product.images?.length || 0;
  check('主图',       imgCount >= 1, 10, '没有上传任何商品图片');
  check('多角度图',   imgCount >= 3, 5, `建议上传至少 3 张图片（当前 ${imgCount} 张）`);
  const noAlt = (product.images || []).filter(i => !i.alt).length;
  check('图片 Alt',   noAlt === 0 && imgCount > 0, 5, `${noAlt} 张图片缺少 Alt 文本`);

  // 价格&库存
  const price = parseFloat(product.variants?.[0]?.price || 0);
  const stock = (product.variants || []).reduce((s, v) => s + (v.inventory_quantity || 0), 0);
  check('售价',       price > 0, 10, '未设置售价或售价为 0');
  check('库存',       stock > 0, 10, `库存为 0，上架后将无法购买`);
  check('SKU 编码',   product.variants?.[0]?.sku, 5, '未设置 SKU 编码，不利于仓库管理');

  // SEO
  const tags = (product.tags || '').split(',').filter(Boolean);
  check('商品标签',   tags.length >= 3, 5, `标签不足 3 个（当前 ${tags.length} 个）`);
  // metafields 需要单独查，这里从已有数据预估
  check('商品状态',   product.status === 'active', 10, `商品状态为 ${product.status}，尚未上架`);

  // 评分
  const score = totalScore;
  const grade = score >= 85 ? '🟢 可以上架' : score >= 65 ? '🟡 建议完善后上架' : '🔴 上架条件不足';
  const missing = checks.filter(c => !c.passed);

  return { score, grade, maxScore, checks, missing };
}

// ─── 列出草稿/不完整商品 ──────────────────────────────────────

async function listIncomplete(status = 'any') {
  const { getProducts } = await loadShopify();
  const allProducts = await getProducts({ limit: 250, status: status === 'draft' ? 'draft' : 'any' });

  return allProducts
    .map(p => {
      const readiness = assessLaunchReadiness(p);
      return { id: p.id, title: p.title, status: p.status, score: readiness.score, grade: readiness.grade, missingCount: readiness.missing.length };
    })
    .filter(p => p.score < 85)
    .sort((a, b) => a.score - b.score);
}

// ─── CLI ──────────────────────────────────────────────────────

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const get  = f => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };
  const has  = f => args.includes(f);

  const productId = get('--product-id');
  const platform  = get('--platform') || 'shopify';

  async function main() {
    // ── 列出草稿/不完整商品 ───────────────────────────────────
    if (has('--list-drafts') || has('--list-incomplete')) {
      const mode = has('--list-drafts') ? 'draft' : 'any';
      console.log(`\n📋 ${mode === 'draft' ? '草稿商品' : '上新不完整商品'} 列表\n`);
      const list = await listIncomplete(mode);
      if (list.length === 0) {
        console.log('✅ 所有商品上新完整度均达标（≥85分）');
      } else {
        list.forEach(p => {
          console.log(`  ${p.grade} [${p.id}] ${p.title}`);
          console.log(`    评分：${p.score}/100  状态：${p.status}  缺少 ${p.missingCount} 项\n`);
        });
      }
      process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify({ list }) + '\n');
      return;
    }

    // ── 单品操作（需要 --product-id）─────────────────────────
    if (!productId) {
      console.log(`
🦞 电商龙虾 — 上新模組

用法：
  node modules/launch/index.mjs --product-id <ID>             商品上新诊断
  node modules/launch/index.mjs --product-id <ID> --run-seo   SEO 审计
  node modules/launch/index.mjs --product-id <ID> --run-geo   GEO 内容生成
  node modules/launch/index.mjs --product-id <ID> --run-copy --platform xiaohongshu
  node modules/launch/index.mjs --product-id <ID> --run-all   全流程
  node modules/launch/index.mjs --list-drafts                 草稿列表
  node modules/launch/index.mjs --list-incomplete             上新不完整列表
      `);
      process.exit(0);
    }

    const { getProduct } = await loadShopify();
    const product = await getProduct(productId);

    console.log(`\n🦞 上新诊断 — ${product.title} [${productId}]`);
    console.log(`状态：${product.status}  |  上架时间：${product.published_at || '未上架'}\n`);

    // ── 全量诊断（默认 / --run-all）──────────────────────────
    if (!has('--run-seo') && !has('--run-geo') && !has('--run-copy') || has('--run-all')) {
      const readiness = assessLaunchReadiness(product);
      console.log(`上新完整度：${readiness.score} / ${readiness.maxScore}  ${readiness.grade}\n`);
      console.log('── 详细检查 ─────────────────────────────────');
      readiness.checks.forEach(c => {
        console.log(`  ${c.passed ? '✅' : '❌'} ${c.label}（${c.score}/${c.maxScore}分）${c.suggestion ? '  → ' + c.suggestion : ''}`);
      });

      if (readiness.missing.length > 0) {
        console.log(`\n── 优先修复（${readiness.missing.length} 项）────────────────`);
        readiness.missing
          .sort((a, b) => b.maxScore - a.maxScore)
          .slice(0, 5)
          .forEach((m, i) => console.log(`  ${i + 1}. [${m.maxScore}分] ${m.label}：${m.suggestion}`));

        console.log('\n── 下一步建议 ────────────────────────────');
        console.log('  node modules/launch/index.mjs --product-id ' + productId + ' --run-seo');
        console.log('  node modules/launch/index.mjs --product-id ' + productId + ' --run-geo');
        console.log('  node modules/launch/index.mjs --product-id ' + productId + ' --run-copy --platform xiaohongshu');
      }

      if (!has('--run-all')) {
        process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify({ productId, title: product.title, readiness }) + '\n');
        return;
      }
    }

    // ── SEO 审计 ──────────────────────────────────────────────
    if (has('--run-seo') || has('--run-all')) {
      console.log('\n\n━━ SEO 审计 ' + '─'.repeat(38));
      const { auditSeo } = await import('./seo.mjs');
      const seo = await auditSeo(productId);
      console.log(`综合评分：${seo.score}/100  ${seo.grade}`);
      seo.suggestions.forEach(s => console.log(`  ❌ ${s.label}：${s.msg}`));
      if (seo.suggestions.length === 0) console.log('  ✅ 所有 SEO 字段达标');
    }

    // ── GEO 内容 ──────────────────────────────────────────────
    if (has('--run-geo') || has('--run-all')) {
      console.log('\n\n━━ GEO 内容生成 ' + '─'.repeat(34));
      const { generateGeo } = await import('./geo.mjs');
      const geo = generateGeo(product);
      console.log(`FAQ：${geo.faq.length} 条  |  规格：${geo.specTable.length} 行  |  需补 Alt：${geo.altTexts.filter(a => a.needsUpdate).length} 张`);
      console.log('  使用 --run-geo --apply 将内容写入 Shopify');
    }

    // ── 文案生成 ──────────────────────────────────────────────
    if (has('--run-copy') || has('--run-all')) {
      console.log('\n\n━━ 文案生成 ' + '─'.repeat(38));
      const { generateCopy, extractFromProduct } = await import('./copywriter.mjs');
      const opts = extractFromProduct(product);
      const copy = generateCopy({ ...opts, platform });
      console.log(`平台：${platform}`);
      Object.entries(copy).slice(0, 2).forEach(([k, v]) => {
        console.log(`\n  [${k}]`);
        console.log('  ' + (typeof v === 'string' ? v.substring(0, 100) + '...' : JSON.stringify(v).substring(0, 100) + '...'));
      });
    }

    // 汇总 JSON 输出
    process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify({
      productId,
      title: product.title,
      status: product.status,
      ran: {
        seo:   has('--run-seo') || has('--run-all'),
        geo:   has('--run-geo') || has('--run-all'),
        copy:  has('--run-copy') || has('--run-all'),
      },
    }) + '\n');
  }

  main().catch(e => { console.error('❌', e.message); process.exit(1); });
}
