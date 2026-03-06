/**
 * 变体/SKU管理
 * 电商龙虾 — 列出/更新/添加 商品变体
 *
 * 用法：
 *   node sku-manage.mjs list [--product-id 12345]
 *   node sku-manage.mjs update --variant-id 12345 [--price 99] [--compare-price 129] [--stock 50] [--sku SKU001] [--confirm]
 *   node sku-manage.mjs add-variant --product-id 12345 --option1 红色 [--option2 XL] --price 99 [--stock 50] [--sku SKU002]
 */

import { getProducts, getProduct, getVariants, updateVariant, addVariant, getLocations, updateInventory } from '../connectors/shopify.js';

const args = process.argv.slice(2);
const subcommand = args[0];

function getArg(flag) {
  const i = args.indexOf(flag);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
}

function hasFlag(flag) {
  return args.includes(flag);
}

function showHelp() {
  console.log(`🦞 电商龙虾 — 变体/SKU管理

用法：
  node sku-manage.mjs list [--product-id 12345]
  node sku-manage.mjs update --variant-id 12345 [--price 99] [--compare-price 129] [--stock 50] [--sku SKU001] [--confirm]
  node sku-manage.mjs add-variant --product-id 12345 --option1 红色 [--option2 XL] --price 99 [--stock 50] [--sku SKU002]`);
}

// ─── list ─────────────────────────────────────────────────

async function cmdList() {
  const productId = getArg('--product-id');

  console.log('🦞 电商龙虾 — 变体/SKU列表\n');

  let products;

  if (productId) {
    const product = await getProduct(productId);
    products = [product];
  } else {
    products = await getProducts({ limit: 50, status: 'active' });
  }

  const allVariants = [];

  for (const product of products) {
    const variants = product.variants || [];
    if (variants.length === 0) continue;

    console.log(`📦 ${product.title}（ID: ${product.id}）`);

    for (const v of variants) {
      const optionStr = [v.option1, v.option2, v.option3].filter(Boolean).join(' / ');
      console.log(`  • ${optionStr || 'Default'}`);
      console.log(`    变体ID：${v.id}`);
      console.log(`    SKU：${v.sku || '—'}`);
      console.log(`    价格：¥${v.price}`);
      if (v.compare_at_price) console.log(`    原价：¥${v.compare_at_price}`);
      console.log(`    库存：${v.inventory_quantity ?? '—'}`);
      console.log('');

      allVariants.push({
        productId: product.id,
        productTitle: product.title,
        variantId: v.id,
        option1: v.option1,
        option2: v.option2,
        option3: v.option3,
        sku: v.sku || '',
        price: v.price,
        compareAtPrice: v.compare_at_price,
        inventoryQuantity: v.inventory_quantity
      });
    }
  }

  console.log(`共 ${products.length} 个商品，${allVariants.length} 个变体`);

  const output = { action: 'list', products: products.length, variants: allVariants, count: allVariants.length };
  process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(output) + '\n');
}

// ─── update ───────────────────────────────────────────────

async function cmdUpdate() {
  const variantId = getArg('--variant-id');
  const price = getArg('--price');
  const comparePrice = getArg('--compare-price');
  const stock = getArg('--stock');
  const sku = getArg('--sku');
  const confirm = hasFlag('--confirm');

  if (!variantId) {
    console.error('❌ 缺少 --variant-id 参数');
    process.exit(1);
  }

  if (!price && !comparePrice && stock === null && !sku) {
    console.error('❌ 至少指定一个更新字段：--price / --compare-price / --stock / --sku');
    process.exit(1);
  }

  console.log('🦞 电商龙虾 — 更新变体\n');

  // 构建更新数据
  const updateData = {};
  const changes = [];

  if (price) {
    updateData.price = String(price);
    changes.push(`价格 → ¥${price}`);
  }
  if (comparePrice) {
    updateData.compare_at_price = String(comparePrice);
    changes.push(`原价 → ¥${comparePrice}`);
  }
  if (sku) {
    updateData.sku = sku;
    changes.push(`SKU → ${sku}`);
  }

  console.log(`🔄 变体 ${variantId} 变更预览：`);
  for (const c of changes) {
    console.log(`  • ${c}`);
  }
  if (stock) {
    console.log(`  • 库存 → ${stock}`);
  }

  if (!confirm) {
    console.log('\n⚠️ 这是预览模式，添加 --confirm 参数执行更新');
    const output = { action: 'update-preview', variantId, changes, needConfirm: true };
    process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(output) + '\n');
    return;
  }

  try {
    let updatedVariant = null;

    if (Object.keys(updateData).length > 0) {
      updatedVariant = await updateVariant(variantId, updateData);
    }

    // 库存更新
    if (stock && updatedVariant?.inventory_item_id) {
      try {
        const locations = await getLocations();
        if (locations.length > 0) {
          await updateInventory(updatedVariant.inventory_item_id, locations[0].id, parseInt(stock));
        }
      } catch (err) {
        console.log(`⚠️ 库存更新失败：${err.message}`);
      }
    }

    console.log('\n✅ 变体更新成功！');

    const output = { action: 'update', variantId, changes, variant: updatedVariant };
    process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(output) + '\n');
  } catch (err) {
    console.error(`❌ 更新失败：${err.message}`);
    process.exit(1);
  }
}

// ─── add-variant ──────────────────────────────────────────

async function cmdAddVariant() {
  const productId = getArg('--product-id');
  const option1 = getArg('--option1');
  const option2 = getArg('--option2');
  const price = getArg('--price');
  const stock = getArg('--stock');
  const sku = getArg('--sku');

  if (!productId) {
    console.error('❌ 缺少 --product-id 参数');
    process.exit(1);
  }
  if (!option1) {
    console.error('❌ 缺少 --option1 参数');
    process.exit(1);
  }
  if (!price) {
    console.error('❌ 缺少 --price 参数');
    process.exit(1);
  }

  console.log('🦞 电商龙虾 — 添加变体\n');

  const variantData = {
    option1,
    price: String(price),
    inventory_management: 'shopify'
  };

  if (option2) variantData.option2 = option2;
  if (sku) variantData.sku = sku;

  try {
    const variant = await addVariant(productId, variantData);

    // 更新库存
    if (stock && variant.inventory_item_id) {
      try {
        const locations = await getLocations();
        if (locations.length > 0) {
          await updateInventory(variant.inventory_item_id, locations[0].id, parseInt(stock));
        }
      } catch {
        // 库存更新失败不影响整体
      }
    }

    console.log('✅ 变体添加成功！\n');
    console.log(`📦 商品ID：${productId}`);
    console.log(`🆔 变体ID：${variant.id}`);
    console.log(`🏷️ 选项：${[option1, option2].filter(Boolean).join(' / ')}`);
    console.log(`💰 价格：¥${price}`);
    if (sku) console.log(`📝 SKU：${sku}`);
    if (stock) console.log(`📊 库存：${stock}`);

    const output = { action: 'add-variant', productId, variant };
    process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(output) + '\n');
  } catch (err) {
    console.error(`❌ 添加变体失败：${err.message}`);
    process.exit(1);
  }
}

// ─── main ─────────────────────────────────────────────────

async function run() {
  switch (subcommand) {
    case 'list': await cmdList(); break;
    case 'update': await cmdUpdate(); break;
    case 'add-variant': await cmdAddVariant(); break;
    default:
      showHelp();
      if (subcommand) {
        console.error(`\n❌ 未知子命令：${subcommand}`);
        process.exit(1);
      }
  }
}

run().catch(err => {
  console.error('❌ SKU管理错误：', err.message);
  process.exit(1);
});
