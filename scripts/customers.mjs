/**
 * 客户管理
 * 电商龙虾 — 客户列表、排行、导出
 *
 * 用法：
 *   node customers.mjs list                   客户概览
 *   node customers.mjs top                    TOP 20 消费排名
 *   node customers.mjs export                 导出 CSV
 */

import { getCustomers, getOrders } from '../connectors/shopify.js';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const subcommand = args[0];

function showHelp() {
  console.log(`🦞 电商龙虾 — 客户管理

用法：
  node customers.mjs list     客户概览（最近30天新客、总客户数）
  node customers.mjs top      TOP 20 客户消费排名
  node customers.mjs export   导出客户 CSV
`);
}

async function listCustomers() {
  console.log('🦞 客户概览\n');

  const customers = await getCustomers({ limit: 250 });

  // 最近30天新客
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
  const newCustomers = customers.filter(c => new Date(c.created_at) >= thirtyDaysAgo);

  console.log(`👥 总客户数：${customers.length}`);
  console.log(`🆕 最近30天新客：${newCustomers.length}`);
  console.log('');

  if (newCustomers.length > 0) {
    console.log('最近新客：');
    newCustomers.slice(0, 10).forEach(c => {
      const name = `${c.first_name || ''} ${c.last_name || ''}`.trim() || '未命名';
      const date = new Date(c.created_at).toLocaleDateString('zh-CN');
      console.log(`  • ${name} (${c.email || '无邮箱'}) — ${date} 加入，${c.orders_count || 0} 单`);
    });
  }

  process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify({
    totalCustomers: customers.length,
    newCustomers30d: newCustomers.length,
    recentNew: newCustomers.slice(0, 10).map(c => ({
      id: c.id,
      name: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
      email: c.email,
      ordersCount: c.orders_count,
      createdAt: c.created_at
    }))
  }) + '\n');
}

async function topCustomers() {
  console.log('🦞 客户消费排行 TOP 20\n');

  const customers = await getCustomers({ limit: 250 });

  // 按总消费金额排序
  const ranked = customers
    .map(c => ({
      id: c.id,
      name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || '未命名',
      email: c.email || '—',
      totalSpent: parseFloat(c.total_spent || 0),
      ordersCount: c.orders_count || 0,
      currency: c.currency || 'USD',
      lastOrderAt: c.last_order_name ? c.last_order_id : null
    }))
    .sort((a, b) => b.totalSpent - a.totalSpent)
    .slice(0, 20);

  ranked.forEach((c, i) => {
    console.log(`${String(i + 1).padStart(2, ' ')}. ${c.name}`);
    console.log(`    邮箱：${c.email} | 消费：${c.currency} ${c.totalSpent.toFixed(2)} | 订单：${c.ordersCount} 单`);
  });

  console.log(`\n📊 TOP 20 总消费：${ranked[0]?.currency || 'USD'} ${ranked.reduce((s, c) => s + c.totalSpent, 0).toFixed(2)}`);

  process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify({
    top20: ranked
  }) + '\n');
}

async function exportCustomers() {
  console.log('🦞 导出客户数据...\n');

  const customers = await getCustomers({ limit: 250 });

  // CSV header
  const header = ['ID', '名', '姓', '邮箱', '电话', '总消费', '订单数', '货币', '注册时间', '城市', '省份', '国家'].join(',');

  const rows = customers.map(c => {
    const addr = c.default_address || {};
    return [
      c.id,
      `"${(c.first_name || '').replace(/"/g, '""')}"`,
      `"${(c.last_name || '').replace(/"/g, '""')}"`,
      `"${(c.email || '').replace(/"/g, '""')}"`,
      `"${(c.phone || '').replace(/"/g, '""')}"`,
      c.total_spent || 0,
      c.orders_count || 0,
      c.currency || 'USD',
      c.created_at || '',
      `"${(addr.city || '').replace(/"/g, '""')}"`,
      `"${(addr.province || '').replace(/"/g, '""')}"`,
      `"${(addr.country || '').replace(/"/g, '""')}"`
    ].join(',');
  });

  const csv = '\uFEFF' + header + '\n' + rows.join('\n') + '\n'; // BOM for Excel
  const outputPath = join(__dirname, '..', 'customers-export.csv');
  writeFileSync(outputPath, csv, 'utf8');

  console.log(`✅ 导出完成！`);
  console.log(`   文件：${outputPath}`);
  console.log(`   客户数：${customers.length}`);

  process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify({
    success: true,
    filePath: outputPath,
    customerCount: customers.length
  }) + '\n');
}

async function run() {
  if (!subcommand || subcommand === '--help') {
    showHelp();
    return;
  }

  switch (subcommand) {
    case 'list':
      await listCustomers();
      break;
    case 'top':
      await topCustomers();
      break;
    case 'export':
      await exportCustomers();
      break;
    default:
      console.error(`❌ 未知子命令：${subcommand}`);
      showHelp();
      process.exit(1);
  }
}

run().catch(err => {
  console.error('❌ 客户管理失败：', err.message);
  process.exit(1);
});
