/**
 * 🏪 店铺运营 — 商品目录管理
 * modules/store/catalog.mjs
 *
 * CLI：
 *   node modules/store/catalog.mjs list      [--status active|draft|archived] [--limit 50]
 *   node modules/store/catalog.mjs search    --query "关键词"
 *   node modules/store/catalog.mjs detail    --product-id ID
 *   node modules/store/catalog.mjs create    --title "商品名" --price 99 [--compare 129] [--sku SKU] [--vendor 品牌] [--type 类型] [--tags "tag1,tag2"]
 *   node modules/store/catalog.mjs update    --product-id ID [--title X] [--body "描述"] [--vendor X] [--type X] [--tags X] [--status active|draft]
 *   node modules/store/catalog.mjs archive   --product-id ID [--confirm]
 *   node modules/store/catalog.mjs delete    --product-id ID --confirm
 *   node modules/store/catalog.mjs duplicate --product-id ID [--title "新标题"]
 *   node modules/store/catalog.mjs image     --product-id ID --url "https://..." [--alt "描述"] [--delete --image-id ID]
 *   node modules/store/catalog.mjs variant   --product-id ID <list|add|update> [--variant-id ID] [--price X] [--sku X] [--stock X]
 *
 * 导出：listProducts / searchProducts / getProductDetail / createProduct /
 *       updateProduct / archiveProduct / deleteProduct / duplicateProduct /
 *       manageImage / manageVariant
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

async function shopify() { return import(`${ROOT}/connectors/shopify.js`); }
async function audit()   { return import(`${ROOT}/audit/logger.mjs`); }

import { readFileSync, existsSync } from 'fs';
function requiresApproval(action) {
  try {
    const cfg = JSON.parse(readFileSync(`${ROOT}/config.json`, 'utf8'));
    return (cfg.approval?.require || ['refund','cancel','bulk_price','discount_delete','product_delete']).includes(action);
  } catch { return true; }
}

// ─── 核心操作 ──────────────────────────────────────────────────

/** 列出商品 */
export async function listProducts({ status = 'active', limit = 50 } = {}) {
  const s = await shopify();
  const products = await s.getProducts({ status, limit });
  return products.map(p => ({
    id:       p.id,
    title:    p.title,
    status:   p.status,
    vendor:   p.vendor,
    type:     p.product_type,
    variants: p.variants?.length || 0,
    price:    p.variants?.[0]?.price,
    created:  p.created_at?.slice(0, 10),
    updated:  p.updated_at?.slice(0, 10),
  }));
}

/** 搜索商品 */
export async function searchProducts(query, { limit = 20 } = {}) {
  const s = await shopify();
  const products = await s.searchProducts(query, { limit });
  return products.map(p => ({
    id:     p.id,
    title:  p.title,
    status: p.status,
    vendor: p.vendor,
    price:  p.variants?.[0]?.price,
  }));
}

/** 商品详情（含变体+图片+metafields） */
export async function getProductDetail(productId) {
  const s = await shopify();
  const [prod, meta] = await Promise.all([
    s.getProduct(productId),
    s.getProductMetafields(productId).catch(() => []),
  ]);
  const p = prod.product || prod;
  return {
    id:          p.id,
    title:       p.title,
    status:      p.status,
    vendor:      p.vendor,
    type:        p.product_type,
    tags:        p.tags,
    body_html:   p.body_html,
    variants:    (p.variants || []).map(v => ({
      id:       v.id,
      sku:      v.sku,
      price:    v.price,
      compare:  v.compare_at_price,
      stock:    v.inventory_quantity,
      option1:  v.option1,
    })),
    images:      (p.images || []).map(i => ({ id: i.id, src: i.src, alt: i.alt, position: i.position })),
    metafields:  meta.map(m => ({ namespace: m.namespace, key: m.key, value: m.value })),
    created:     p.created_at,
    updated:     p.updated_at,
  };
}

/** 创建商品 */
export async function createProduct({ title, price, compare, sku, vendor, type, tags, body, status = 'draft' } = {}) {
  if (!title) throw new Error('--title 必填');
  if (!price) throw new Error('--price 必填');
  const s = await shopify();
  const l = await audit();

  const productData = {
    title,
    status,
    vendor:       vendor || '',
    product_type: type   || '',
    tags:         tags   || '',
    body_html:    body   || '',
    variants: [{
      price:           String(price),
      compare_at_price: compare ? String(compare) : undefined,
      sku:             sku || '',
      inventory_management: 'shopify',
    }],
  };

  const product = await s.createProduct(productData);
  const p = product.product || product;
  await l.logAction('catalog.create', { product_id: p.id, title: p.title });
  return { id: p.id, title: p.title, status: p.status, url: `https://admin.shopify.com/store/products/${p.id}` };
}

/** 更新商品信息 */
export async function updateProduct(productId, updates = {}) {
  const s = await shopify();
  const l = await audit();
  const payload = {};
  if (updates.title)  payload.title        = updates.title;
  if (updates.body)   payload.body_html    = updates.body;
  if (updates.vendor) payload.vendor       = updates.vendor;
  if (updates.type)   payload.product_type = updates.type;
  if (updates.tags)   payload.tags         = updates.tags;
  if (updates.status) payload.status       = updates.status;
  const result = await s.updateProduct(productId, payload);
  const p = result.product || result;
  await l.logAction('catalog.update', { product_id: productId, changes: Object.keys(payload) });
  return { id: p.id, title: p.title, status: p.status, updated: p.updated_at };
}

/** 归档商品 */
export async function archiveProduct(productId, { confirm = false } = {}) {
  if (!confirm) return { requiresConfirm: true, action: 'archive', product_id: productId, message: '加 --confirm 确认归档' };
  const s = await shopify();
  const l = await audit();
  const p = await s.archiveProduct(productId);
  await l.logAction('catalog.archive', { product_id: productId });
  return { id: p.id, title: p.title, status: p.status };
}

/** 永久删除商品（高风险，需审批） */
export async function deleteProduct(productId, { confirm = false } = {}) {
  if (!confirm) return { requiresConfirm: true, action: 'delete', product_id: productId, message: '⚠️ 永久删除，加 --confirm 确认' };
  const s = await shopify();
  const l = await audit();

  if (requiresApproval('product_delete')) {
    const appr = await import(`${ROOT}/audit/approval.mjs`);
    const req = await appr.requestApproval({
      action: 'product_delete',
      params: { product_id: productId },
      description: `永久删除商品 #${productId}`,
      risk: 'high',
    });
    return { pending: true, approval_id: req.id, message: `审批已提交 (${req.id})，等待确认` };
  }

  const result = await s.deleteProduct(productId);
  await l.logAction('catalog.delete', { product_id: productId });
  return { deleted: true, product_id: productId };
}

/** 复制商品为草稿 */
export async function duplicateProduct(productId, { title } = {}) {
  const s = await shopify();
  const l = await audit();
  const p = await s.duplicateProduct(productId, title);
  await l.logAction('catalog.duplicate', { source_id: productId, new_id: p.id, title: p.title });
  return { id: p.id, title: p.title, status: p.status };
}

/** 图片管理（上传/删除） */
export async function manageImage(productId, { url, alt, imageId, deleteImage = false } = {}) {
  const s = await shopify();
  if (deleteImage && imageId) {
    const result = await s.deleteProductImage(productId, imageId);
    return { deleted: true, image_id: imageId };
  }
  if (!url) throw new Error('--url 必填');
  const img = await s.uploadProductImage(productId, url, alt || '', 1);
  return { id: img.id, src: img.src, alt: img.alt };
}

/** 变体管理 */
export async function manageVariant(productId, action, { variantId, price, comparePriceAt, sku, option1, option2, option3 } = {}) {
  const s = await shopify();
  if (action === 'list') {
    const variants = await s.getVariants(productId);
    return (variants.variants || variants).map(v => ({
      id: v.id, sku: v.sku, price: v.price, compare: v.compare_at_price,
      stock: v.inventory_quantity, option1: v.option1,
    }));
  }
  if (action === 'add') {
    const v = await s.addVariant(productId, { price, compare_at_price: comparePriceAt, sku, option1, option2, option3 });
    return v;
  }
  if (action === 'update') {
    if (!variantId) throw new Error('--variant-id 必填');
    const updates = {};
    if (price)          updates.price            = String(price);
    if (comparePriceAt) updates.compare_at_price = String(comparePriceAt);
    if (sku)            updates.sku              = sku;
    if (option1)        updates.option1          = option1;
    const v = await s.updateVariant(variantId, updates);
    return v;
  }
  throw new Error(`未知操作: ${action}，支持 list|add|update`);
}

// ─── CLI 入口 ──────────────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith('catalog.mjs')) {
  const args    = process.argv.slice(2);
  const cmd     = args[0];
  const has     = f => args.includes(f);
  const get     = f => { const i = args.indexOf(f); return i !== -1 ? args[i+1] : null; };

  async function run() {
    let result;
    switch (cmd) {
      case 'list':
        result = await listProducts({ status: get('--status') || 'active', limit: parseInt(get('--limit') || 50) });
        break;
      case 'search':
        result = await searchProducts(get('--query') || '', { limit: parseInt(get('--limit') || 20) });
        break;
      case 'detail':
        result = await getProductDetail(get('--product-id'));
        break;
      case 'create':
        result = await createProduct({
          title:   get('--title'),
          price:   get('--price'),
          compare: get('--compare'),
          sku:     get('--sku'),
          vendor:  get('--vendor'),
          type:    get('--type'),
          tags:    get('--tags'),
          body:    get('--body'),
          status:  get('--status') || 'draft',
        });
        break;
      case 'update':
        result = await updateProduct(get('--product-id'), {
          title:  get('--title'),
          body:   get('--body'),
          vendor: get('--vendor'),
          type:   get('--type'),
          tags:   get('--tags'),
          status: get('--status'),
        });
        break;
      case 'archive':
        result = await archiveProduct(get('--product-id'), { confirm: has('--confirm') });
        break;
      case 'delete':
        result = await deleteProduct(get('--product-id'), { confirm: has('--confirm') });
        break;
      case 'duplicate':
        result = await duplicateProduct(get('--product-id'), { title: get('--title') });
        break;
      case 'image':
        result = await manageImage(get('--product-id'), {
          url:         get('--url'),
          alt:         get('--alt'),
          imageId:     get('--image-id'),
          deleteImage: has('--delete'),
        });
        break;
      case 'variant': {
        const action = args[1] || 'list';
        result = await manageVariant(get('--product-id'), action, {
          variantId:      get('--variant-id'),
          price:          get('--price'),
          comparePriceAt: get('--compare'),
          sku:            get('--sku'),
          option1:        get('--option1'),
        });
        break;
      }
      default:
        console.log(`
🏪 商品目录管理

  list      [--status active|draft|archived] [--limit 50]
  search    --query "关键词"
  detail    --product-id ID
  create    --title "商品名" --price 99 [--compare 129] [--sku SKU] [--vendor X] [--type X] [--tags X]
  update    --product-id ID [--title X] [--body X] [--vendor X] [--type X] [--tags X] [--status active|draft]
  archive   --product-id ID [--confirm]
  delete    --product-id ID --confirm
  duplicate --product-id ID [--title "新标题"]
  image     --product-id ID --url "https://..." [--alt X]
  image     --product-id ID --delete --image-id ID
  variant   --product-id ID list
  variant   --product-id ID add  --price X --sku X --option1 X
  variant   --product-id ID update --variant-id ID --price X
        `);
        return;
    }
    console.log(JSON.stringify(result, null, 2));
    console.log(`\n__JSON_OUTPUT__ ${JSON.stringify({ ok: true, action: cmd, data: result })}`);
  }
  run().catch(e => { console.error('❌', e.message); process.exit(1); });
}
