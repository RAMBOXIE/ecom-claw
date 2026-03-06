#!/usr/bin/env node
/**
 * 🦞 电商龙虾 — 1688热销品上架（含图片）
 * 基于 1688 首页热销数据 + Unsplash 商品图
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import https from 'https';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));
const { shop_domain, access_token, api_version } = config.shopify;

// ─── 基于 1688 首页真实热销数据的2款选品 ─────────────────────
const HOT_PRODUCTS = [
  {
    title: '可折叠懒人沙发躺椅 单人榻榻米卧室休闲椅',
    source: '1688 热销 ¥129.6起批 | 月销 1000+',
    description: `
<h2>🛋️ 慵懒生活从这把椅子开始</h2>
<p>1688同款爆款懒人沙发，工厂直供价，品质超出想象。</p>
<ul>
  <li>✅ 可折叠收纳，不占地方，搬家轻松带走</li>
  <li>✅ 仿人体工学设计，久坐不累，腰背全支撑</li>
  <li>✅ 加厚海绵填充，坐感蓬松有弹性</li>
  <li>✅ 防水面料易清洁，颜色百搭任意选</li>
  <li>✅ 承重150kg，结实耐用</li>
</ul>
<p><strong>适合场景：</strong>卧室追剧、客厅游戏、宿舍休息、阳台发呆</p>
<p>1688工厂直销，省去中间商差价，品质跟大牌一个模子出来的。</p>
    `.trim(),
    price: '388',
    compare_price: '598',
    sku: 'SOFA-LAZY-001',
    stock: 30,
    image_keywords: ['folding chair sofa living room cozy', 'lazy sofa chair bedroom'],
    tags: ['家居', '沙发', '懒人沙发', '折叠椅', '卧室'],
  },
  {
    title: '不锈钢双层隔热咖啡杯 自带吸管搅拌棒 高颜值随行杯',
    source: '1688 热销 ¥19.8起批 | 月销 3000+',
    description: `
<h2>☕ 颜值与实用兼得的咖啡杯</h2>
<p>1688爆款双层不锈钢保温杯，网红款，自带吸管和搅拌棒，上班族/咖啡爱好者必备。</p>
<ul>
  <li>✅ 304食品级不锈钢，安全健康无异味</li>
  <li>✅ 双层真空保温，冷热均可保持4-6小时</li>
  <li>✅ 自带弯曲吸管 + 搅拌棒，一杯多用</li>
  <li>✅ 400ml大容量，满足一上午咖啡需求</li>
  <li>✅ 防漏设计，放包包里不怕倒翻</li>
</ul>
<p><strong>适合人群：</strong>上班族、咖啡爱好者、健身达人、学生党</p>
<p>工厂直供，同款在各大电商平台售价 ¥89-129，我们只要这个价！</p>
    `.trim(),
    price: '128',
    compare_price: '198',
    sku: 'CUP-STEEL-001',
    stock: 80,
    image_keywords: ['stainless steel coffee cup tumbler straw modern', 'coffee travel mug minimalist'],
    tags: ['餐厨', '咖啡杯', '保温杯', '随行杯', '不锈钢'],
  },
];

// ─── 工具函数 ────────────────────────────────────────────────
function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpsGet(res.headers.location, headers).then(resolve).catch(reject);
      }
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    }).on('error', reject);
  });
}

function shopify(urlPath, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: shop_domain,
      path: `/admin/api/${api_version}${urlPath}`,
      method,
      headers: {
        'X-Shopify-Access-Token': access_token,
        'Content-Type': 'application/json',
      },
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ─── 从 Unsplash 获取图片 URL（无需 key）────────────────────
async function getImageUrl(keyword) {
  // Unsplash Source API：直接返回 CDN 图片地址（跟随重定向）
  const encoded = encodeURIComponent(keyword);
  const res = await httpsGet(
    `https://source.unsplash.com/800x600/?${encoded}`,
    { 'User-Agent': 'Mozilla/5.0' }
  );
  // 跟随重定向后拿到最终 URL
  const finalUrl = res.headers['location'] || res.headers['content-location'];
  if (finalUrl) return finalUrl;
  // 如果已经是图片响应（status 200），构造 Unsplash URL
  return `https://source.unsplash.com/800x600/?${encoded}`;
}

// ─── 主流程 ──────────────────────────────────────────────────
async function main() {
  console.log('🦞 1688热销品上架 — 开始\n');

  const results = [];

  for (const product of HOT_PRODUCTS) {
    console.log(`\n📦 处理: ${product.title}`);
    console.log(`   来源: ${product.source}`);

    try {
      // 1. 获取商品图片
      console.log('  🖼️  获取商品图片...');
      const imageUrls = [];
      for (const kw of product.image_keywords) {
        const url = await getImageUrl(kw);
        imageUrls.push(url);
        console.log(`     图片 ${imageUrls.length}: ${url.slice(0, 80)}`);
        await new Promise(r => setTimeout(r, 800));
      }

      // 2. 创建 Shopify 商品
      console.log('  📝 创建商品...');
      const createRes = await shopify('/products.json', 'POST', {
        product: {
          title: product.title,
          body_html: product.description,
          vendor: '电商龙虾精选',
          product_type: product.tags[0],
          tags: product.tags.join(', '),
          status: 'draft',
          variants: [{
            price: product.price,
            compare_at_price: product.compare_price,
            sku: product.sku,
            inventory_management: 'shopify',
            inventory_quantity: product.stock,
            requires_shipping: true,
          }],
        },
      });

      if (createRes.status !== 201 && createRes.status !== 200) {
        console.log(`  ❌ 创建失败: ${JSON.stringify(createRes.data).slice(0, 100)}`);
        continue;
      }

      const shopifyProduct = createRes.data.product;
      const productId = shopifyProduct.id;
      console.log(`  ✅ 商品已创建 ID: ${productId}`);

      // 3. 上传图片
      const uploadedImages = [];
      for (let i = 0; i < imageUrls.length; i++) {
        console.log(`  ⬆️  上传图片 ${i + 1}/${imageUrls.length}...`);
        const imgRes = await shopify(`/products/${productId}/images.json`, 'POST', {
          image: {
            src: imageUrls[i],
            alt: product.title,
            position: i + 1,
          },
        });
        if (imgRes.status === 200 || imgRes.status === 201) {
          uploadedImages.push(imgRes.data.image?.id);
          console.log(`     ✅ 图片 ${i + 1} 上传成功`);
        } else {
          console.log(`     ⚠️  图片 ${i + 1} 失败: ${JSON.stringify(imgRes.data).slice(0, 60)}`);
        }
        await new Promise(r => setTimeout(r, 600));
      }

      results.push({
        title: product.title,
        productId,
        price: product.price,
        comparePrice: product.compare_price,
        images: uploadedImages.length,
        url: `https://${shop_domain}/admin/products/${productId}`,
      });

      console.log(`  🎉 完成！商品 ID ${productId}，上传 ${uploadedImages.length} 张图`);

    } catch (err) {
      console.error(`  ❌ 错误: ${err.message}`);
    }

    await new Promise(r => setTimeout(r, 1500));
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 上架汇总:');
  for (const r of results) {
    console.log(`\n  📦 ${r.title}`);
    console.log(`     ID: ${r.productId} | 售价: HKD ${r.price} (原 ${r.comparePrice})`);
    console.log(`     图片: ${r.images} 张`);
    console.log(`     后台: ${r.url}`);
  }
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n__JSON_OUTPUT__');
  console.log(JSON.stringify({ success: true, products: results }));
}

main().catch(e => { console.error(e); process.exit(1); });
