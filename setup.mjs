/**
 * 电商龙虾 — 一键初始化（内置 OAuth 服务器）
 * 用法：node setup.mjs
 *
 * 流程：
 * 1. 填写店铺域名 + Client ID + Client Secret
 * 2. 自动启动本地回调服务器（port 3457）
 * 3. 自动打开浏览器完成 Shopify 授权
 * 4. 自动换取 access token，写入 config.json
 */

import { writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';
import { createServer } from 'http';
import { exec } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, 'config.json');
const CALLBACK_PORT = 3457;
const CALLBACK_PATH = '/callback';
const SCOPES = 'read_orders,write_orders,read_products,write_products,read_inventory,write_inventory,read_customers';

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(r => rl.question(q, r));

// 打开浏览器（跨平台）
function openBrowser(url) {
  const cmd = process.platform === 'win32' ? `start "" "${url}"`
    : process.platform === 'darwin' ? `open "${url}"`
    : `xdg-open "${url}"`;
  exec(cmd);
}

// 启动本地 OAuth 回调服务器
function startCallbackServer(clientId, clientSecret, shopDomain) {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost:${CALLBACK_PORT}`);
      if (url.pathname !== CALLBACK_PATH) {
        res.end('Not found'); return;
      }

      const code = url.searchParams.get('code');
      const shop = url.searchParams.get('shop');
      const state = url.searchParams.get('state');

      if (!code) {
        res.writeHead(400); res.end('Missing code'); return;
      }

      // 验证 state
      if (state !== 'ecomclaw-setup') {
        res.writeHead(400); res.end('Invalid state'); return;
      }

      try {
        // 用 code 换 access token
        const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code })
        });
        const tokenData = await tokenRes.json();

        if (!tokenData.access_token) {
          throw new Error(JSON.stringify(tokenData));
        }

        // 成功页面
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0f0f17;color:#fff">
            <div style="font-size:60px">🦞</div>
            <h2 style="color:#4ade80;margin:16px 0">授权成功！</h2>
            <p style="color:#888">Token 已保存，可以关闭此页面了。</p>
          </body></html>
        `);

        server.close();
        resolve(tokenData.access_token);
      } catch (err) {
        res.writeHead(500); res.end(`Error: ${err.message}`);
        server.close();
        reject(err);
      }
    });

    server.listen(CALLBACK_PORT, () => {
      console.log(`\n✅ 本地回调服务器已启动（port ${CALLBACK_PORT}）`);

      const redirectUri = `http://localhost:${CALLBACK_PORT}${CALLBACK_PATH}`;
      const authUrl = `https://${shopDomain}/admin/oauth/authorize?client_id=${clientId}&scope=${SCOPES}&redirect_uri=${encodeURIComponent(redirectUri)}&state=ecomclaw-setup&grant_options[]=offline`;

      console.log('\n🌐 正在打开浏览器...');
      console.log('   如果没有自动打开，请手动访问：');
      console.log(`   ${authUrl}\n`);
      openBrowser(authUrl);
    });

    server.on('error', reject);

    // 2分钟超时
    setTimeout(() => {
      server.close();
      reject(new Error('授权超时（2分钟），请重新运行 setup.mjs'));
    }, 120000);
  });
}

async function main() {
  console.log('\n🦞 电商龙虾 — 初始化向导\n');
  console.log('前置步骤：在 dev.shopify.com 的 App 设置里');
  console.log(`把这个地址加入「允许的重定向 URL」：`);
  console.log(`  http://localhost:${CALLBACK_PORT}${CALLBACK_PATH}\n`);

  if (existsSync(CONFIG_PATH)) {
    const ans = await ask('⚠️  config.json 已存在，是否重新授权？(y/N) ');
    if (ans.toLowerCase() !== 'y') {
      console.log('\n跳过，直接测试现有配置...');
      rl.close();
      const { testConnection } = await import('./connectors/shopify.js');
      const result = await testConnection();
      if (result.ok) {
        console.log(`✅ 连接正常！店铺：${result.shop_name}`);
      } else {
        console.error(`❌ 连接失败：${result.error}`);
      }
      return;
    }
  }

  const domain   = (await ask('① Shopify 域名（如 my-shop.myshopify.com）：')).trim();
  const clientId = (await ask('② Client ID（dev.shopify.com 设定页面）：')).trim();
  const secret   = (await ask('③ Client Secret（用戶端密碼）：')).trim();
  const chatId   = (await ask('④ Telegram Chat ID（默认 1196749626）：')).trim() || '1196749626';
  const lowQty   = (await ask('⑤ 库存预警阈值（默认 10）：')).trim();

  rl.close();
  console.log('\n──────────────────────────────');

  // 启动 OAuth 流程
  const accessToken = await startCallbackServer(clientId, secret, domain);

  console.log('✅ Token 获取成功！');

  // 写入 config.json
  const config = {
    shopify: {
      shop_domain: domain,
      access_token: accessToken,
      client_id: clientId,
      client_secret: secret,
      api_version: '2026-01'
    },
    notifications: { telegram_chat_id: chatId },
    alerts: {
      low_stock_threshold: parseInt(lowQty) || 10,
      order_poll_interval_minutes: 15
    },
    report: { daily_report_hour: 8, timezone: 'Asia/Shanghai' }
  };

  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
  console.log('✅ config.json 已保存\n');

  // 验证连接
  console.log('正在验证连接...');
  const { testConnection } = await import('./connectors/shopify.js');
  const result = await testConnection();

  if (result.ok) {
    console.log(`\n🎉 全部完成！`);
    console.log(`   店铺：${result.shop_name}`);
    console.log(`   货币：${result.currency}`);
    console.log(`\n   下一步：node scripts/daily-report.mjs`);
  } else {
    console.error(`\n❌ 连接验证失败：${result.error}`);
  }
}

main().catch(err => {
  console.error('\n❌ 初始化失败：', err.message);
  process.exit(1);
});
