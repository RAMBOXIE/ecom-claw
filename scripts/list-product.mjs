/**
 * 上架助手
 * 电商龙虾 — 快速创建商品
 *
 * 用法：node list-product.mjs --title "商品名" --price 29.99 [选项]
 * 选项：
 *   --title         商品标题（必填）
 *   --description   商品描述
 *   --price         售价（必填）
 *   --compare-price 划线价（原价）
 *   --sku           SKU 编号
 *   --stock         库存数量（默认0，不追踪）
 *   --images        图片URL，逗号分隔
 *   --draft         以草稿状态创建
 *   --help          显示帮助
 */

import { createProduct, getShopInfo } from '../connectors/shopify.js';

const args = process.argv.slice(2);

function getArg(flag) {
  const i = args.indexOf(flag);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
}

function hasFlag(flag) {
  return args.includes(flag);
}

function showHelp() {
  console.log(`🦞 电商龙虾 — 上架助手

用法：node list-product.mjs --title "商品名" --price 29.99 [选项]

必填参数：
  --title           商品标题
  --price           售价

可选参数：
  --description     商品描述
  --compare-price   划线价（原价对比）
  --sku             SKU 编号
  --stock           库存数量
  --images          图片URL，逗号分隔
  --draft           以草稿状态上架
  --help            显示此帮助

示例：
  node list-product.mjs --title "潮流T恤" --price 99 --compare-price 199 --sku "TS-001" --stock 100
  node list-product.mjs --title "测试商品" --price 9.99 --draft
`);
}

async function run() {
  if (hasFlag('--help') || args.length === 0) {
    showHelp();
    return;
  }

  const title = getArg('--title');
  const price = getArg('--price');

  if (!title) {
    console.error('❌ 缺少 --title 参数');
    process.exit(1);
  }
  if (!price) {
    console.error('❌ 缺少 --price 参数');
    process.exit(1);
  }

  const description = getArg('--description') || '';
  const comparePrice = getArg('--compare-price');
  const sku = getArg('--sku') || '';
  const stock = getArg('--stock');
  const imagesRaw = getArg('--images');
  const isDraft = hasFlag('--draft');

  console.log(`🦞 上架助手 — 创建商品中...`);
  console.log(`   标题：${title}`);
  console.log(`   售价：${price}${comparePrice ? '（原价 ' + comparePrice + '）' : ''}`);
  if (isDraft) console.log('   状态：草稿');

  const variant = { price: String(price) };
  if (comparePrice) variant.compare_at_price = String(comparePrice);
  if (sku) variant.sku = sku;
  if (stock) {
    variant.inventory_management = 'shopify';
    variant.inventory_quantity = parseInt(stock);
  }

  const productData = {
    title,
    body_html: description,
    status: isDraft ? 'draft' : 'active',
    variants: [variant]
  };

  if (imagesRaw) {
    productData.images = imagesRaw.split(',').map(url => ({ src: url.trim() }));
  }

  const product = await createProduct(productData);
  const shop = await getShopInfo();

  const productUrl = `https://${shop.domain}/products/${product.handle}`;

  console.log('');
  console.log('✅ 商品创建成功！');
  console.log(`   ID：${product.id}`);
  console.log(`   标题：${product.title}`);
  console.log(`   状态：${product.status}`);
  console.log(`   链接：${productUrl}`);
  if (product.variants?.[0]) {
    console.log(`   变体ID：${product.variants[0].id}`);
    console.log(`   价格：${product.variants[0].price}`);
  }

  const output = {
    success: true,
    productId: product.id,
    title: product.title,
    handle: product.handle,
    status: product.status,
    url: productUrl,
    variantId: product.variants?.[0]?.id,
    price: product.variants?.[0]?.price,
    comparePrice: product.variants?.[0]?.compare_at_price
  };

  process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(output) + '\n');
}

run().catch(err => {
  console.error('❌ 商品创建失败：', err.message);
  process.exit(1);
});
