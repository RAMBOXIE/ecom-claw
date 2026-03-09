/**
 * 📣 内容社媒 — 模块入口
 * 电商龙虾 modules/community/index.mjs
 *
 * 子模块：
 *   reviews.mjs   评论运营（Judge.me：拉取/分析/差评预警/关键词提取）
 *   content.mjs   社媒文案生成（小红书/抖音/TikTok/微信/Shopify）
 *   faq.mjs       FAQ 管理（沉淀/搜索/导出到 GEO 内容）
 *   service.mjs   客服模板库（20类场景标准化回复）
 *
 * 用法：
 *   node modules/community/index.mjs --reviews
 *   node modules/community/index.mjs --content --product-id 123 --platform xiaohongshu
 *   node modules/community/index.mjs --faq --list
 *   node modules/community/index.mjs --service --templates
 */

const args = process.argv.slice(2);
const has  = f => args.includes(f);
const get  = f => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };

async function main() {
  // ── 评论运营 ──────────────────────────────────────────────
  if (has('--reviews')) {
    const { runReviews } = await import('./reviews.mjs');
    await runReviews(args);
    return;
  }

  // ── 社媒文案 ──────────────────────────────────────────────
  if (has('--content')) {
    // 复用 launch/copywriter 但加入更多社媒维度
    const { generateCopy, extractFromProduct } = await import('../launch/copywriter.mjs');
    const productId = get('--product-id');
    const platform  = get('--platform') || 'xiaohongshu';

    if (!productId) { console.error('❌ 缺少 --product-id'); process.exit(1); }

    const ROOT = new URL('../..', import.meta.url).pathname;
    const { getProduct } = await import(`${ROOT}/connectors/shopify.js`);
    const product = await getProduct(productId);
    const opts    = extractFromProduct(product);
    const result  = generateCopy({ ...opts, platform });

    console.log(`\n📣 ${platform.toUpperCase()} 文案 — ${product.title}\n`);
    Object.entries(result).forEach(([k, v]) => {
      console.log(`【${k}】\n${typeof v === 'string' ? v : Array.isArray(v) ? v.join('\n') : JSON.stringify(v, null, 2)}\n`);
    });
    process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify({ platform, result }) + '\n');
    return;
  }

  // ── FAQ 管理 ──────────────────────────────────────────────
  if (has('--faq')) {
    const { runFaq } = await import('./faq.mjs');
    await runFaq(args);
    return;
  }

  // ── 客服模板 ──────────────────────────────────────────────
  if (has('--service')) {
    const { runService } = await import('./service.mjs');
    await runService(args);
    return;
  }

  // ── 帮助 ─────────────────────────────────────────────────
  console.log(`
📣 内容社媒

用法：
  node modules/community/index.mjs --reviews
    [--alert]             仅显示差评

  node modules/community/index.mjs --content
    --product-id <ID>
    --platform <平台>     xiaohongshu / douyin / tiktok / wechat / shopify

  node modules/community/index.mjs --faq --list
  node modules/community/index.mjs --faq --search --query "退货"
  node modules/community/index.mjs --faq --add

  node modules/community/index.mjs --service --templates

状态：
  ✅ --content    社媒文案生成（已完成，复用 launch/copywriter）
  🚧 --reviews    评论运营（等待 Judge.me API Key）
  🚧 --faq        FAQ 管理（开发中）
  🚧 --service    客服模板（底层脚本已就绪）
  `);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
