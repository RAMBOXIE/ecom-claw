/**
 * 连接测试
 * 电商龙虾 — 验证 Shopify API 是否接通
 * 
 * 用法：node connect-test.mjs
 */

import { testConnection, getProducts, getTodayOrders } from '../connectors/shopify.js';

async function run() {
  console.log('🦞 电商龙虾 — Shopify 连接测试\n');

  // 1. 基础连接
  process.stdout.write('① 测试 API 连接... ');
  const conn = await testConnection();
  if (!conn.ok) {
    console.log('❌ 失败');
    console.error('   错误：', conn.error);
    console.error('\n💡 请检查 config.json 中的 shop_domain 和 access_token');
    process.exit(1);
  }
  console.log(`✅ 成功`);
  console.log(`   店铺：${conn.shop_name}`);
  console.log(`   域名：${conn.domain}`);
  console.log(`   货币：${conn.currency}`);

  // 2. 商品列表
  process.stdout.write('\n② 拉取商品数据... ');
  const products = await getProducts({ limit: 5 });
  console.log(`✅ 成功（共可访问 ${products.length}+ 件商品）`);
  if (products.length > 0) {
    console.log(`   示例：${products[0].title}`);
  }

  // 3. 今日订单
  process.stdout.write('\n③ 拉取今日订单... ');
  const todayOrders = await getTodayOrders();
  console.log(`✅ 成功`);
  console.log(`   今日订单：${todayOrders.length} 单`);

  console.log('\n🎉 全部通过！电商龙虾已就绪。');
  console.log('   接下来运行：node scripts/daily-report.mjs');
}

run().catch(err => {
  console.error('\n❌ 连接测试失败：', err.message);
  process.exit(1);
});
