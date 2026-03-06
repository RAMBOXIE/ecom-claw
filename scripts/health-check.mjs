/**
 * 系统健康检查
 * 电商龙虾 — 检查所有服务和配置状态
 *
 * 用法：
 *   node health-check.mjs
 */

import { readFileSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import https from 'https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, '..', 'config.json');
const DATA_DIR = join(__dirname, 'data');

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) return null;
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  } catch { return null; }
}

function httpGet(url, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('超时')); });
  });
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function run() {
  console.log('🦞 电商龙虾 — 系统健康检查\n');

  const checks = [];
  let hasError = false;
  let hasWarning = false;

  // ─── 1. Shopify API 连接 ────────────────────────
  try {
    const shopify = await import('../connectors/shopify.js');
    const result = await shopify.testConnection();
    if (result.ok) {
      console.log(`✅ Shopify API 连接正常 — 店铺：${result.shop_name}`);
      checks.push({ name: 'Shopify API', status: 'ok', detail: result.shop_name });
    } else {
      console.log(`❌ Shopify API 连接失败 — ${result.error}`);
      checks.push({ name: 'Shopify API', status: 'error', detail: result.error });
      hasError = true;
    }
  } catch (err) {
    console.log(`❌ Shopify API 连接失败 — ${err.message}`);
    checks.push({ name: 'Shopify API', status: 'error', detail: err.message });
    hasError = true;
  }

  // ─── 2. 有赞 API 连接 ──────────────────────────
  const config = loadConfig();
  if (config?.youzan?.access_token) {
    try {
      const youzan = await import('../connectors/youzan.js');
      const result = await youzan.testConnection();
      if (result.ok) {
        console.log(`✅ 有赞 API 连接正常 — 店铺：${result.shop_name}`);
        checks.push({ name: '有赞 API', status: 'ok', detail: result.shop_name });
      } else {
        console.log(`❌ 有赞 API 连接失败 — ${result.error}`);
        checks.push({ name: '有赞 API', status: 'error', detail: result.error });
        hasError = true;
      }
    } catch (err) {
      console.log(`❌ 有赞 API 连接失败 — ${err.message}`);
      checks.push({ name: '有赞 API', status: 'error', detail: err.message });
      hasError = true;
    }
  } else {
    console.log('⚠️ 有赞 API 未配置（跳过）');
    checks.push({ name: '有赞 API', status: 'skipped', detail: '未配置 access_token' });
    hasWarning = true;
  }

  // ─── 3. 快递100接口 ────────────────────────────
  try {
    const res = await httpGet('https://www.kuaidi100.com/query?type=auto&postid=test123');
    if (res.status === 200) {
      console.log('✅ 快递100接口可用');
      checks.push({ name: '快递100', status: 'ok', detail: 'HTTP 200' });
    } else {
      console.log(`⚠️ 快递100接口返回 HTTP ${res.status}`);
      checks.push({ name: '快递100', status: 'warning', detail: `HTTP ${res.status}` });
      hasWarning = true;
    }
  } catch (err) {
    console.log(`❌ 快递100接口不可用 — ${err.message}`);
    checks.push({ name: '快递100', status: 'error', detail: err.message });
    hasError = true;
  }

  // ─── 4. Dashboard 服务器 ──────────────────────
  try {
    const res = await httpGet('http://localhost:3458/health');
    if (res.status === 200) {
      console.log('✅ Dashboard 服务器运行中（端口 3458）');
      checks.push({ name: 'Dashboard', status: 'ok', detail: '端口 3458' });
    } else {
      console.log(`⚠️ Dashboard 服务器返回 HTTP ${res.status}`);
      checks.push({ name: 'Dashboard', status: 'warning', detail: `HTTP ${res.status}` });
      hasWarning = true;
    }
  } catch {
    console.log('⚠️ Dashboard 服务器未运行（端口 3458）');
    checks.push({ name: 'Dashboard', status: 'warning', detail: '未运行' });
    hasWarning = true;
  }

  // ─── 5. Webhook 服务器 ────────────────────────
  try {
    const res = await httpGet('http://localhost:3459/health');
    if (res.status === 200) {
      console.log('✅ Webhook 服务器运行中（端口 3459）');
      checks.push({ name: 'Webhook', status: 'ok', detail: '端口 3459' });
    } else {
      console.log(`⚠️ Webhook 服务器返回 HTTP ${res.status}`);
      checks.push({ name: 'Webhook', status: 'warning', detail: `HTTP ${res.status}` });
      hasWarning = true;
    }
  } catch {
    console.log('⚠️ Webhook 服务器未运行（端口 3459）');
    checks.push({ name: 'Webhook', status: 'warning', detail: '未运行' });
    hasWarning = true;
  }

  // ─── 6. data/ 目录和文件 ──────────────────────
  console.log('');
  console.log('📂 **数据文件检查**');

  const dataFiles = [
    'faq.json',
    'competitors.json',
    'webhook-events.jsonl'
  ];

  if (existsSync(DATA_DIR)) {
    console.log(`✅ data/ 目录存在`);
    checks.push({ name: 'data/ 目录', status: 'ok', detail: DATA_DIR });

    for (const file of dataFiles) {
      const filePath = join(DATA_DIR, file);
      if (existsSync(filePath)) {
        const stat = statSync(filePath);
        console.log(`  ✅ ${file}（${formatSize(stat.size)}）`);
        checks.push({ name: `data/${file}`, status: 'ok', detail: formatSize(stat.size) });
      } else {
        console.log(`  ⚠️ ${file}（不存在）`);
        checks.push({ name: `data/${file}`, status: 'warning', detail: '不存在' });
      }
    }
  } else {
    console.log('⚠️ data/ 目录不存在');
    checks.push({ name: 'data/ 目录', status: 'warning', detail: '不存在' });
    hasWarning = true;
  }

  // ─── 7. config.json 完整性 ────────────────────
  console.log('');
  console.log('⚙️ **配置完整性检查**');

  if (!config) {
    console.log('❌ config.json 不存在或无法解析');
    checks.push({ name: 'config.json', status: 'error', detail: '文件不存在' });
    hasError = true;
  } else {
    const requiredFields = [
      { path: 'shopify.shop_domain', label: 'Shopify 店铺域名' },
      { path: 'shopify.access_token', label: 'Shopify Access Token' },
      { path: 'shopify.api_version', label: 'Shopify API 版本' }
    ];

    const optionalFields = [
      { path: 'youzan.access_token', label: '有赞 Access Token' },
      { path: 'notifications.telegram_chat_id', label: 'Telegram Chat ID' },
      { path: 'alerts.low_stock_threshold', label: '低库存阈值' },
      { path: 'webhooks.secret', label: 'Webhook Secret' }
    ];

    let configOk = true;

    for (const field of requiredFields) {
      const parts = field.path.split('.');
      let val = config;
      for (const p of parts) val = val?.[p];

      if (val && !String(val).includes('xxx') && !String(val).includes('your_')) {
        console.log(`  ✅ ${field.label}`);
      } else {
        console.log(`  ❌ ${field.label}（${val ? '未填写' : '缺失'}）`);
        configOk = false;
        hasError = true;
      }
    }

    for (const field of optionalFields) {
      const parts = field.path.split('.');
      let val = config;
      for (const p of parts) val = val?.[p];

      if (val && !String(val).includes('xxx') && !String(val).includes('your_')) {
        console.log(`  ✅ ${field.label}`);
      } else {
        console.log(`  ⚠️ ${field.label}（可选，未配置）`);
      }
    }

    checks.push({ name: 'config.json', status: configOk ? 'ok' : 'error', detail: configOk ? '必填字段完整' : '部分必填字段缺失' });
  }

  // ─── 汇总 ─────────────────────────────────────
  console.log('\n─────────────────');
  let overallStatus;
  if (hasError) {
    overallStatus = 'error';
    console.log('🔴 **整体状态：有错误** — 部分服务不可用');
  } else if (hasWarning) {
    overallStatus = 'warning';
    console.log('🟡 **整体状态：有警告** — 核心服务正常，部分可选项未配置');
  } else {
    overallStatus = 'ok';
    console.log('🟢 **整体状态：全绿** — 所有服务正常运行');
  }

  const output = {
    overallStatus,
    checks,
    checkedAt: new Date().toISOString()
  };

  process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(output) + '\n');
}

run().catch(err => {
  console.error('❌ 健康检查失败：', err.message);
  process.exit(1);
});
