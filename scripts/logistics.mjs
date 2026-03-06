/**
 * 物流追踪
 * 电商龙虾 — 通过快递100查询物流信息
 *
 * 用法：
 *   node logistics.mjs track <单号>
 *   node logistics.mjs track-all
 *   node logistics.mjs --help
 */

import https from 'https';
import { getOrders } from '../connectors/shopify.js';

const args = process.argv.slice(2);
const subcommand = args[0];

function showHelp() {
  console.log(`🦞 电商龙虾 — 物流追踪

用法：
  node logistics.mjs track <快递单号>      追踪单个快递
  node logistics.mjs track-all             追踪所有已发货未完成订单

说明：
  使用快递100免费接口，自动识别快递公司
  track-all 会从 Shopify 拉取所有已发货但未完成的订单
`);
}

// 根据单号前缀识别快递公司
function detectCourier(trackingNumber) {
  const num = trackingNumber.toUpperCase();
  if (num.startsWith('SF')) return 'shunfeng';
  if (num.startsWith('JD')) return 'jd';
  if (num.startsWith('YT')) return 'yuantong';
  if (num.startsWith('ZT')) return 'zhongtong';
  if (num.startsWith('ST')) return 'shentong';
  if (num.startsWith('YD')) return 'yunda';
  if (num.startsWith('DB') || num.startsWith('DBK')) return 'debangkuaidi';
  if (num.startsWith('EMS') || num.startsWith('EM')) return 'ems';
  if (num.startsWith('GD')) return 'guotongkuaidi';
  if (/^\d{12}$/.test(num)) return 'zhongtong'; // 12位纯数字多为中通
  if (/^\d{15}$/.test(num)) return 'yunda';      // 15位多为韵达
  return 'auto';
}

function queryKuaidi100(trackingNumber) {
  const company = detectCourier(trackingNumber);
  return new Promise((resolve, reject) => {
    const url = `https://www.kuaidi100.com/query?type=${company}&postid=${encodeURIComponent(trackingNumber)}&id=1`;

    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.kuaidi100.com/'
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve({ status: 'error', message: '解析失败', raw: body.substring(0, 200) });
        }
      });
    }).on('error', reject);
  });
}

async function trackSingle(trackingNumber) {
  console.log(`🦞 查询快递：${trackingNumber}\n`);

  const result = await queryKuaidi100(trackingNumber);

  if (result.status === '200' && result.data && result.data.length > 0) {
    console.log(`快递公司：${result.com || '自动识别'}`);
    console.log(`状态：${result.state === '3' ? '已签收' : result.state === '0' ? '运输中' : '状态码 ' + result.state}`);
    console.log('');
    console.log('物流轨迹：');
    result.data.slice(0, 10).forEach((item, i) => {
      console.log(`  ${item.time} | ${item.context}`);
    });
    if (result.data.length > 10) {
      console.log(`  ...共 ${result.data.length} 条记录`);
    }
  } else {
    console.log(`⚠️  查询结果：${result.message || '无数据'}`);
    if (result.status) console.log(`   状态码：${result.status}`);
  }

  const output = {
    trackingNumber,
    company: result.com || 'auto',
    status: result.state || result.status,
    records: result.data || [],
    raw: result
  };

  process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(output) + '\n');
}

async function trackAll() {
  console.log('🦞 拉取所有已发货订单...\n');

  // 获取已部分发货和已发货的订单
  const orders = await getOrders({ status: 'open', limit: 250 });

  // 收集所有 fulfillment 的快递单号
  const trackingItems = [];
  for (const order of orders) {
    if (!order.fulfillments || order.fulfillments.length === 0) continue;
    for (const f of order.fulfillments) {
      if (f.tracking_number && f.status !== 'cancelled') {
        trackingItems.push({
          orderId: order.id,
          orderNumber: order.order_number,
          customer: order.shipping_address?.name || order.email || '未知',
          trackingNumber: f.tracking_number,
          trackingCompany: f.tracking_company || 'auto',
          fulfillmentStatus: f.status
        });
      }
    }
  }

  if (trackingItems.length === 0) {
    console.log('✅ 暂无需要追踪的快递');
    process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify({ items: [], count: 0 }) + '\n');
    return;
  }

  console.log(`共 ${trackingItems.length} 个快递需要追踪：\n`);

  const results = [];
  for (const item of trackingItems) {
    console.log(`─── 订单 #${item.orderNumber} | ${item.customer} | ${item.trackingNumber} ───`);

    try {
      const result = await queryKuaidi100(item.trackingNumber);

      let statusText = '未知';
      if (result.status === '200' && result.data?.length > 0) {
        statusText = result.state === '3' ? '已签收' : result.state === '0' ? '运输中' : '状态 ' + result.state;
        console.log(`  状态：${statusText}`);
        console.log(`  最新：${result.data[0]?.time} | ${result.data[0]?.context}`);
      } else {
        console.log(`  ⚠️ ${result.message || '无法查询'}`);
      }

      results.push({
        ...item,
        statusText,
        latestRecord: result.data?.[0] || null,
        records: result.data || []
      });
    } catch (err) {
      console.log(`  ❌ 查询失败：${err.message}`);
      results.push({ ...item, statusText: '查询失败', error: err.message });
    }

    console.log('');
  }

  const delivered = results.filter(r => r.statusText === '已签收').length;
  const inTransit = results.filter(r => r.statusText === '运输中').length;

  console.log(`📊 汇总：${results.length} 件快递 | ${delivered} 已签收 | ${inTransit} 运输中`);

  process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify({ items: results, count: results.length, delivered, inTransit }) + '\n');
}

async function run() {
  if (!subcommand || subcommand === '--help') {
    showHelp();
    return;
  }

  switch (subcommand) {
    case 'track': {
      const trackingNum = args[1];
      if (!trackingNum) {
        console.error('❌ 请提供快递单号：node logistics.mjs track <单号>');
        process.exit(1);
      }
      await trackSingle(trackingNum);
      break;
    }
    case 'track-all':
      await trackAll();
      break;
    default:
      console.error(`❌ 未知子命令：${subcommand}`);
      showHelp();
      process.exit(1);
  }
}

run().catch(err => {
  console.error('❌ 物流查询失败：', err.message);
  process.exit(1);
});
