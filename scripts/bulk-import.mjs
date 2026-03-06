/**
 * 批量上架（CSV导入）
 * 电商龙虾 — 从CSV文件批量创建商品
 *
 * 用法：
 *   node bulk-import.mjs --file products.csv [--dry-run]
 *
 * CSV格式（第一行为表头）：
 *   title,price,compare_price,sku,stock,description,images,status
 *   其中 images 用 | 分隔多图，status 为 active 或 draft（默认 draft）
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);

function getArg(flag) {
  const i = args.indexOf(flag);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
}

function hasFlag(flag) {
  return args.includes(flag);
}

function showHelp() {
  console.log(`🦞 电商龙虾 — 批量上架（CSV导入）

用法：
  node bulk-import.mjs --file products.csv [--dry-run]

CSV格式（第一行为表头）：
  title,price,compare_price,sku,stock,description,images,status

说明：
  • images 字段多图用 | 分隔
  • status 为 active 或 draft，默认 draft
  • 字段可用双引号包裹（支持字段内含逗号）
  • --dry-run 仅预览不执行`);
}

// ─── CSV 解析 ─────────────────────────────────────────────

function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        // 双引号转义 ""
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        current += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ',') {
        fields.push(current.trim());
        current = '';
        i++;
      } else {
        current += ch;
        i++;
      }
    }
  }

  fields.push(current.trim());
  return fields;
}

function parseCSV(content) {
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) {
    throw new Error('CSV文件至少需要表头行和一行数据');
  }

  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = fields[j] || '';
    }
    row._lineNumber = i + 1;
    rows.push(row);
  }

  return { headers, rows };
}

// ─── 主流程 ───────────────────────────────────────────────

async function run() {
  const filePath = getArg('--file');
  const dryRun = hasFlag('--dry-run');

  if (!filePath) {
    showHelp();
    console.error('\n❌ 缺少 --file 参数');
    process.exit(1);
  }

  const resolvedPath = join(process.cwd(), filePath);
  const actualPath = existsSync(resolvedPath) ? resolvedPath : filePath;

  if (!existsSync(actualPath)) {
    console.error(`❌ 文件不存在：${actualPath}`);
    process.exit(1);
  }

  const content = readFileSync(actualPath, 'utf8').replace(/^\uFEFF/, ''); // 去 BOM
  const { headers, rows } = parseCSV(content);

  console.log(`🦞 电商龙虾 — 批量上架${dryRun ? '（预览模式）' : ''}\n`);
  console.log(`📄 文件：${actualPath}`);
  console.log(`📊 共 ${rows.length} 条商品数据`);
  console.log(`📝 字段：${headers.join(', ')}`);
  console.log('');

  // 验证必要字段
  if (!headers.includes('title') || !headers.includes('price')) {
    console.error('❌ CSV必须包含 title 和 price 字段');
    process.exit(1);
  }

  if (dryRun) {
    console.log('👀 **预览模式** — 以下商品将被创建：\n');
    for (const row of rows) {
      console.log(`  第${row._lineNumber}行：${row.title || '(无标题)'}`);
      console.log(`    价格：¥${row.price || '0'}`);
      if (row.compare_price) console.log(`    原价：¥${row.compare_price}`);
      if (row.sku) console.log(`    SKU：${row.sku}`);
      if (row.stock) console.log(`    库存：${row.stock}`);
      if (row.images) console.log(`    图片：${row.images.split('|').length} 张`);
      console.log(`    状态：${row.status || 'draft'}`);
      console.log('');
    }

    const output = { action: 'dry-run', totalRows: rows.length, rows: rows.map(r => ({ ...r })) };
    process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(output) + '\n');
    return;
  }

  // 实际导入
  let shopify;
  try {
    shopify = await import('../connectors/shopify.js');
  } catch (err) {
    console.error('❌ 无法加载 Shopify 连接器：', err.message);
    process.exit(1);
  }

  let successCount = 0;
  let failCount = 0;
  const errors = [];
  const created = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const progress = `[${i + 1}/${rows.length}]`;

    try {
      if (!row.title) {
        throw new Error('标题为空');
      }

      const productData = {
        title: row.title,
        body_html: row.description || '',
        status: row.status === 'active' ? 'active' : 'draft',
        variants: [{
          price: String(row.price || '0'),
          sku: row.sku || '',
          inventory_management: 'shopify'
        }]
      };

      if (row.compare_price) {
        productData.variants[0].compare_at_price = String(row.compare_price);
      }

      // 图片
      if (row.images) {
        const imageUrls = row.images.split('|').map(u => u.trim()).filter(Boolean);
        productData.images = imageUrls.map(src => ({ src }));
      }

      const product = await shopify.createProduct(productData);
      successCount++;

      // 更新库存（如果指定了stock）
      if (row.stock && product.variants?.[0]) {
        try {
          const variant = product.variants[0];
          if (variant.inventory_item_id) {
            const locations = await shopify.getLocations();
            if (locations.length > 0) {
              await shopify.updateInventory(variant.inventory_item_id, locations[0].id, parseInt(row.stock));
            }
          }
        } catch {
          // 库存更新失败不影响整体
        }
      }

      console.log(`${progress} ✅ ${row.title}（ID: ${product.id}）`);
      created.push({ lineNumber: row._lineNumber, title: row.title, productId: product.id });
    } catch (err) {
      failCount++;
      console.log(`${progress} ❌ ${row.title || '(无标题)'}：${err.message}`);
      errors.push({
        lineNumber: row._lineNumber,
        title: row.title || '',
        error: err.message,
        row
      });
    }
  }

  // 写入失败记录
  if (errors.length > 0) {
    const errorCsvPath = join(dirname(actualPath), 'bulk-import-errors.csv');
    const csvHeader = headers.join(',') + ',error\n';
    const csvRows = errors.map(e => {
      const fields = headers.map(h => {
        const val = e.row[h] || '';
        return val.includes(',') ? `"${val}"` : val;
      });
      fields.push(`"${e.error.replace(/"/g, '""')}"`);
      return fields.join(',');
    });
    writeFileSync(errorCsvPath, '\uFEFF' + csvHeader + csvRows.join('\n') + '\n', 'utf8');
    console.log(`\n📝 失败记录已写入：${errorCsvPath}`);
  }

  console.log('\n─────────────────');
  console.log('📊 **导入汇总**');
  console.log(`• 总计：${rows.length} 条`);
  console.log(`• 成功：${successCount} 条`);
  console.log(`• 失败：${failCount} 条`);

  const output = {
    action: 'import',
    total: rows.length,
    success: successCount,
    failed: failCount,
    created,
    errors: errors.map(e => ({ lineNumber: e.lineNumber, title: e.title, error: e.error }))
  };
  process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify(output) + '\n');
}

run().catch(err => {
  console.error('❌ 批量导入错误：', err.message);
  process.exit(1);
});
