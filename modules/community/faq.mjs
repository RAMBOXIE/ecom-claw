/**
 * 📚 社区运营 — FAQ 知识库管理
 * modules/community/faq.mjs
 *
 * CLI：
 *   node modules/community/faq.mjs list [--category shipping|refund|product|other]
 *   node modules/community/faq.mjs add --question "..." --answer "..." [--category shipping]
 *   node modules/community/faq.mjs search --query "退货"
 *   node modules/community/faq.mjs delete --id ID
 *   node modules/community/faq.mjs export
 *
 * 导出：runFaq
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const DATA_FILE = join(ROOT, 'tmp', 'faqs.json');

const VALID_CATEGORIES = ['shipping', 'refund', 'product', 'payment', 'other'];

const CATEGORY_LABELS = {
  shipping: '📦 物流',
  refund: '💰 退款',
  product: '🛍️ 商品',
  payment: '💳 支付',
  other: '📋 其他',
};

// ─── 数据读写 ──────────────────────────────────────────────────
function ensureDir() {
  const dir = join(ROOT, 'tmp');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function loadData() {
  ensureDir();
  if (!existsSync(DATA_FILE)) return { faqs: [] };
  try {
    return JSON.parse(readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { faqs: [] };
  }
}

function saveData(data) {
  ensureDir();
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// ─── 主运行函数 ────────────────────────────────────────────────
export async function runFaq(args) {
  const cmd = args[0];
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : null;
  };

  if (cmd === 'list') {
    const category = get('--category');
    const data = loadData();
    let items = data.faqs;

    if (category) {
      if (!VALID_CATEGORIES.includes(category)) {
        console.error(`无效分类: ${category}，有效值: ${VALID_CATEGORIES.join(', ')}`);
        return null;
      }
      items = items.filter(f => f.category === category);
    }

    if (items.length === 0) {
      console.log(category ? `暂无 ${CATEGORY_LABELS[category] || category} 类 FAQ` : '暂无 FAQ，使用 add 命令添加');
      return [];
    }

    console.log(`\n📚 FAQ 列表${category ? ` (${CATEGORY_LABELS[category] || category})` : ''} — 共 ${items.length} 条\n`);
    console.log('ID  | 分类       | 问题                                     | 命中数');
    console.log('----|------------|------------------------------------------|-------');
    items.forEach(f => {
      const cat = CATEGORY_LABELS[f.category] || f.category;
      const q = f.question.length > 40 ? f.question.substring(0, 37) + '...' : f.question;
      console.log(`${String(f.id).padStart(3)} | ${cat.padEnd(10)} | ${q.padEnd(40)} | ${f.hits || 0}`);
    });
    return items;

  } else if (cmd === 'add') {
    const question = get('--question');
    const answer = get('--answer');
    const category = get('--category') || 'other';

    if (!question || !answer) {
      console.error('需要提供 --question 和 --answer');
      return null;
    }
    if (!VALID_CATEGORIES.includes(category)) {
      console.error(`无效分类: ${category}，有效值: ${VALID_CATEGORIES.join(', ')}`);
      return null;
    }

    const data = loadData();
    const maxId = data.faqs.reduce((m, f) => Math.max(m, f.id || 0), 0);
    const newFaq = {
      id: maxId + 1,
      question,
      answer,
      category,
      created: new Date().toISOString(),
      hits: 0,
    };
    data.faqs.push(newFaq);
    saveData(data);
    console.log(`✅ FAQ #${newFaq.id} 已添加 [${CATEGORY_LABELS[category]}]`);
    console.log(`  问: ${question}`);
    console.log(`  答: ${answer}`);
    return newFaq;

  } else if (cmd === 'search') {
    const query = get('--query');
    if (!query) { console.error('需要提供 --query'); return null; }

    const data = loadData();
    const lower = query.toLowerCase();

    const matched = data.faqs
      .filter(f =>
        f.question.toLowerCase().includes(lower) ||
        f.answer.toLowerCase().includes(lower)
      )
      .sort((a, b) => (b.hits || 0) - (a.hits || 0));

    // 增加命中计数
    let updated = false;
    matched.forEach(f => {
      const original = data.faqs.find(x => x.id === f.id);
      if (original) { original.hits = (original.hits || 0) + 1; updated = true; }
    });
    if (updated) saveData(data);

    console.log(`\n🔍 搜索 "${query}" — 找到 ${matched.length} 条结果\n`);
    if (matched.length === 0) {
      console.log('  暂无匹配的 FAQ');
    } else {
      matched.forEach(f => {
        const cat = CATEGORY_LABELS[f.category] || f.category;
        console.log(`  [#${f.id} ${cat}] ${f.question}`);
        console.log(`  → ${f.answer}`);
        console.log();
      });
    }
    return matched;

  } else if (cmd === 'delete') {
    const id = parseInt(get('--id'));
    if (isNaN(id)) { console.error('需要提供有效的 --id'); return null; }

    const data = loadData();
    const before = data.faqs.length;
    data.faqs = data.faqs.filter(f => f.id !== id);
    saveData(data);

    const removed = before - data.faqs.length;
    if (removed > 0) {
      console.log(`✅ FAQ #${id} 已删除`);
    } else {
      console.log(`⚠️ 未找到 FAQ #${id}`);
    }
    return { removed: removed > 0, id };

  } else if (cmd === 'export') {
    const data = loadData();
    if (data.faqs.length === 0) {
      console.log('暂无 FAQ 可导出');
      return '';
    }

    console.log('\n# FAQ 知识库\n');
    const grouped = {};
    for (const cat of VALID_CATEGORIES) {
      grouped[cat] = data.faqs.filter(f => f.category === cat);
    }

    let md = '# FAQ 知识库\n\n';
    for (const [cat, items] of Object.entries(grouped)) {
      if (items.length === 0) continue;
      const label = CATEGORY_LABELS[cat] || cat;
      md += `## ${label}\n\n`;
      console.log(`## ${label}\n`);
      items.forEach(f => {
        const block = `### Q: ${f.question}\n**A:** ${f.answer}\n\n`;
        md += block;
        console.log(block);
      });
    }
    return md;

  } else {
    console.log('用法:');
    console.log('  node modules/community/faq.mjs list [--category shipping|refund|product|payment|other]');
    console.log('  node modules/community/faq.mjs add --question "问题" --answer "答案" [--category shipping]');
    console.log('  node modules/community/faq.mjs search --query "退货"');
    console.log('  node modules/community/faq.mjs delete --id ID');
    console.log('  node modules/community/faq.mjs export');
    return null;
  }
}

// ─── CLI 入口 ──────────────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith('faq.mjs')) {
  const args = process.argv.slice(2);
  const result = await runFaq(args);
  console.log(`\n__JSON_OUTPUT__ ${JSON.stringify({ ok: true, data: result })}`);
}
