/**
 * 下载图片 → base64 → 上传 Shopify
 */
import https from 'https';
import http from 'http';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));
const { shop_domain, access_token, api_version } = config.shopify;

// 直接用已知的 Unsplash CDN 图片 ID（固定高质量图）
const PRODUCT_IMAGES = {
  // 懒人沙发 — productId: 10227922698519
  '10227922698519': [
    'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800&q=80&fit=crop',  // 沙发
    'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&q=80&fit=crop', // 室内椅子
  ],
  // 咖啡杯 — productId: 10227922796823
  '10227922796823': [
    'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=800&q=80&fit=crop',  // 咖啡杯
    'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=800&q=80&fit=crop',  // 保温杯
  ],
};

function downloadImageBuffer(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadImageBuffer(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ buffer: Buffer.concat(chunks), type: res.headers['content-type'] || 'image/jpeg' }));
    }).on('error', reject);
  });
}

function shopifyPost(urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({
      hostname: shop_domain,
      path: `/admin/api/${api_version}${urlPath}`,
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': access_token,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    }, res => {
      let out = '';
      res.on('data', c => out += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(out) }); }
        catch { resolve({ status: res.statusCode, data: out }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function uploadBase64Image(productId, imageUrl, position, alt) {
  console.log(`  ⬇️  下载图片: ${imageUrl.slice(0, 70)}...`);
  const { buffer, type } = await downloadImageBuffer(imageUrl);
  const base64 = buffer.toString('base64');
  const ext = type.includes('png') ? 'png' : 'jpg';
  console.log(`  📦 大小: ${(buffer.length / 1024).toFixed(1)}KB | 类型: ${type}`);

  console.log(`  ⬆️  base64 上传到 Shopify...`);
  const res = await shopifyPost(`/products/${productId}/images.json`, {
    image: {
      attachment: base64,
      filename: `product-${productId}-${position}.${ext}`,
      alt,
      position,
    },
  });

  if (res.status === 200 || res.status === 201) {
    console.log(`  ✅ 上传成功! 图片 ID: ${res.data.image?.id}`);
    return res.data.image;
  } else {
    console.log(`  ❌ 失败 (${res.status}): ${JSON.stringify(res.data).slice(0, 120)}`);
    return null;
  }
}

async function main() {
  console.log('🦞 图片上传（base64 模式）\n');

  const alts = {
    '10227922698519': '可折叠懒人沙发躺椅',
    '10227922796823': '不锈钢双层隔热咖啡杯',
  };

  let totalUploaded = 0;

  for (const [productId, urls] of Object.entries(PRODUCT_IMAGES)) {
    console.log(`\n📦 商品 ID: ${productId} — ${alts[productId]}`);
    let pos = 1;
    for (const url of urls) {
      const img = await uploadBase64Image(productId, url, pos++, alts[productId]);
      if (img) totalUploaded++;
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✅ 完成，共上传 ${totalUploaded} 张图片`);
  console.log(`\n商品后台链接：`);
  console.log(`  懒人沙发: https://${shop_domain}/admin/products/10227922698519`);
  console.log(`  咖啡杯:   https://${shop_domain}/admin/products/10227922796823`);
}

main().catch(e => { console.error(e); process.exit(1); });
