#!/usr/bin/env node
/**
 * 🦞 电商龙虾 — 1688 抓图（agent-browser） + Shopify 上传
 * 用法: node fetch-product-images.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import https from 'https';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, '..', 'config.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));

const SHOPIFY_DOMAIN = config.shopify.shop_domain;
const SHOPIFY_TOKEN = config.shopify.access_token;
const API_VERSION = config.shopify.api_version;
const COOKIE_STR = config.ali1688?.cookie || '';

// 5个商品：Shopify ID + 1688搜索关键词
const PRODUCTS = [
  { id: '10227842580759', keyword: 'GaN氮化镓160W快充充电器', alt: 'GaN 160W三口快充头' },
  { id: '10227842613527', keyword: '旅行真空压缩袋USB电动抽气泵', alt: '旅行真空压缩袋套装' },
  { id: '10227842711831', keyword: '厨房锅具收纳架8层橱柜', alt: '厨房8层锅具收纳架' },
  { id: '10227843105047', keyword: '户外便携储能电源500Wh露营', alt: '户外便携储能电源' },
  { id: '10227843596567', keyword: '男士保暖连帽抓绒卫衣加厚', alt: '男士保暖连帽卫衣' },
];

// ─── 把 cookie 字符串转成 Playwright state JSON ──────────────
function buildPlaywrightState(cookieStr) {
  const cookies = cookieStr.split(';').map(c => c.trim()).filter(Boolean).map(c => {
    const idx = c.indexOf('=');
    const name = c.slice(0, idx).trim();
    const value = c.slice(idx + 1).trim();
    return {
      name, value,
      domain: '.1688.com',
      path: '/',
      expires: -1,
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    };
  });
  return { cookies, origins: [] };
}

// ─── 运行 agent-browser 命令 ─────────────────────────────────
function ab(args) {
  try {
    const result = execSync(`agent-browser ${args}`, {
      encoding: 'utf8',
      timeout: 30000,
    });
    return result.trim();
  } catch (e) {
    return (e.stdout || '') + (e.stderr || '');
  }
}

// ─── 用 agent-browser 搜索 1688 并抓图 ───────────────────────
async function search1688Images(keyword, maxImages = 3) {
  console.log(`  🔍 搜索: ${keyword}`);

  // 打开 1688 搜索页（state 已在启动时加载）
  const searchUrl = `https://s.1688.com/selloffer/offerlist.htm?keywords=${encodeURIComponent(keyword)}&n=y`;
  ab(`open "${searchUrl}"`);

  // 等待页面加载
  ab('wait 4000');
  try { ab('wait --text "件"'); } catch (_) {} // 等待商品数量文字出现

  // 用 eval 直接拿图片 URL（最可靠）
  const selectors = [
    '.offer-list-row img',
    '.img-core img',
    '.offerlist-item img',
    '.sm-offer-item img',
    'img[data-src]',
    '.offer img',
  ].join(', ');

  const evalResult = ab(`eval "JSON.stringify([...new Set([...document.querySelectorAll('${selectors}')].map(i=>i.src||i.dataset.lazySrc||i.dataset.src).filter(u=>u&&u.includes('alicdn')&&!u.includes('logo')&&!u.includes('icon')&&u.length>30))].slice(0,${maxImages}))"`);

  let imageUrls = [];
  try {
    // eval 输出可能包含多余内容，找 JSON 数组部分
    const match = evalResult.match(/\[.*\]/s);
    if (match) imageUrls = JSON.parse(match[0]).filter(Boolean);
  } catch (_) {}

  // 备用：从页面源码中用正则提取
  if (imageUrls.length === 0) {
    const html = ab('eval "document.body.innerHTML"');
    const found = new Set();
    const re = /https?:\/\/cbu01\.alicdn\.com\/img\/[^"' \n]+\.jpg/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      const url = m[0].split('?')[0];
      if (!url.includes('logo') && !url.includes('icon')) found.add(url);
      if (found.size >= maxImages) break;
    }
    imageUrls = [...found];
  }

  console.log(`  📷 找到 ${imageUrls.length} 张图`);
  return imageUrls.slice(0, maxImages);
}

function extractImagesFromSnapshot(snapshotText, max) {
  const urls = new Set();
  // 从快照文本中提取 alicdn 图片
  const patterns = [
    /https?:\/\/cbu01\.alicdn\.com\/img\/[^\s"'<>]+\.(?:jpg|jpeg|png)/gi,
    /\/\/img\.alicdn\.com\/[^\s"'<>]+\.(?:jpg|jpeg|png)/gi,
  ];
  for (const p of patterns) {
    let m;
    while ((m = p.exec(snapshotText)) !== null) {
      let url = m[0];
      if (!url.startsWith('http')) url = 'https:' + url;
      url = url.split('?')[0];
      if (!url.includes('logo') && !url.includes('icon') && !url.includes('avatar')) {
        urls.add(url);
      }
      if (urls.size >= max) break;
    }
    if (urls.size >= max) break;
  }
  return [...urls];
}

// ─── Shopify API ─────────────────────────────────────────────
function shopifyRequest(urlPath, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}${urlPath}`;
    const options = {
      method,
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_TOKEN,
        'Content-Type': 'application/json',
      },
    };
    const req = https.request(url, options, res => {
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

async function uploadImageToShopify(productId, imageUrl, altText) {
  console.log(`  ⬆️  上传: ${imageUrl.slice(0, 70)}...`);
  const res = await shopifyRequest(
    `/products/${productId}/images.json`,
    'POST',
    { image: { src: imageUrl, alt: altText } }
  );
  if (res.status === 200 || res.status === 201) {
    console.log(`  ✅ 成功 (图片ID: ${res.data.image?.id})`);
    return res.data.image;
  } else {
    console.log(`  ❌ 失败: ${JSON.stringify(res.data).slice(0, 100)}`);
    return null;
  }
}

// ─── 主流程 ──────────────────────────────────────────────────
async function main() {
  console.log('🦞 电商龙虾 — 1688抓图 → Shopify上传\n');

  if (!COOKIE_STR) {
    console.error('❌ config.json 缺少 ali1688.cookie');
    process.exit(1);
  }

  // 生成 Playwright state 文件
  const tmpDir = path.join(__dirname, '..', 'tmp');
  mkdirSync(tmpDir, { recursive: true });
  const statePath = path.join(tmpDir, '1688-state.json');
  writeFileSync(statePath, JSON.stringify(buildPlaywrightState(COOKIE_STR), null, 2));
  console.log(`✅ Cookie state 已生成: ${statePath}`);
  console.log(`   共 ${COOKIE_STR.split(';').length} 个 cookie\n`);

  // 关闭已有浏览器，重新用 state 启动
  ab('close');
  await new Promise(r => setTimeout(r, 1000));
  console.log('🌐 启动带 Cookie 的浏览器...');
  ab(`state load "${statePath}"`);
  ab('open "https://www.1688.com"');
  ab('wait 3000');
  console.log('✅ 浏览器已就绪\n');

  const results = [];

  for (const product of PRODUCTS) {
    console.log(`\n📦 商品 ID: ${product.id} — ${product.alt}`);

    try {
      const images = await search1688Images(product.keyword, 3);

      if (images.length === 0) {
        console.log(`  ⚠️  未找到图片`);
        results.push({ id: product.id, alt: product.alt, uploaded: 0, reason: '未找到图片' });
        continue;
      }

      let uploaded = 0;
      for (const imgUrl of images) {
        const img = await uploadImageToShopify(product.id, imgUrl, product.alt);
        if (img) uploaded++;
        await new Promise(r => setTimeout(r, 600));
      }

      results.push({ id: product.id, alt: product.alt, uploaded });
      console.log(`  🎉 完成，上传 ${uploaded} 张`);

    } catch (err) {
      console.log(`  ❌ 错误: ${err.message}`);
      results.push({ id: product.id, alt: product.alt, uploaded: 0, reason: err.message });
    }

    await new Promise(r => setTimeout(r, 1500));
  }

  // 关闭浏览器
  ab('close');

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 汇总:');
  for (const r of results) {
    const s = r.uploaded > 0 ? `✅ 上传 ${r.uploaded} 张` : `❌ ${r.reason}`;
    console.log(`  ${r.alt}: ${s}`);
  }
  const total = results.reduce((s, r) => s + r.uploaded, 0);
  console.log(`\n  合计上传: ${total} 张图片`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  console.log('\n__JSON_OUTPUT__');
  console.log(JSON.stringify({ results, totalUploaded: total }));
}

main().catch(e => { console.error(e); process.exit(1); });
