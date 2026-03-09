/**
 * 审批系统
 * 电商龙虾 — 高风险操作审批流
 *
 * 用法：
 *   node audit/approval.mjs list                    查看所有待审批
 *   node audit/approval.mjs detail --id UUID        查看审批详情
 *   node audit/approval.mjs approve --id UUID       批准
 *   node audit/approval.mjs reject  --id UUID       拒绝
 *   node audit/approval.mjs expire                  清理过期审批
 *
 * 集成方式（供其他脚本调用）：
 *   import { requestApproval } from '../audit/approval.mjs';
 *   const approval = await requestApproval({ action, description, params, command });
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { writeAuditLog } from './logger.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PENDING_FILE = join(__dirname, 'pending-approvals.json');

// ─── 存储工具 ─────────────────────────────────────────────

function loadPending() {
  if (!existsSync(PENDING_FILE)) return [];
  try { return JSON.parse(readFileSync(PENDING_FILE, 'utf8')); }
  catch { return []; }
}

function savePending(list) {
  writeFileSync(PENDING_FILE, JSON.stringify(list, null, 2), 'utf8');
}

// ─── 风险等级定义 ─────────────────────────────────────────

const RISK_LEVELS = {
  price_change:   { level: 'high',   emoji: '💰', label: '批量改价' },
  bulk_price:     { level: 'high',   emoji: '💰', label: '批量改价' },
  refund:         { level: 'high',   emoji: '💸', label: '退款' },
  cancel:         { level: 'high',   emoji: '❌', label: '取消订单' },
  bulk_publish:   { level: 'medium', emoji: '📋', label: '批量上架' },
  discount_create:{ level: 'medium', emoji: '🏷️', label: '创建折扣码' },
  discount_delete:{ level: 'high',   emoji: '🗑️', label: '删除折扣码' },
  fulfill:        { level: 'medium', emoji: '📦', label: '发货' },
  resend:         { level: 'low',    emoji: '🔄', label: '补发' },
  stock_update:   { level: 'low',    emoji: '📦', label: '库存调整' },
};

// ─── 核心：创建审批请求 ────────────────────────────────────

/**
 * 创建审批请求并推送 Telegram 通知
 * @param {Object} opts
 * @param {string} opts.action       操作类型（见 RISK_LEVELS）
 * @param {string} opts.description  人类可读描述，如「全店打8折，影响23个商品」
 * @param {Object} opts.params       执行参数（审批通过后传给 executor）
 * @param {string} opts.command      审批通过后执行的 shell 命令
 * @param {Object} [opts.preview]    预览数据（在通知中展示）
 * @returns {Object} 审批记录
 */
export async function requestApproval({ action, description, params = {}, command, preview = {} }) {
  const id = randomUUID();
  const risk = RISK_LEVELS[action] || { level: 'medium', emoji: '⚠️', label: action };
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString(); // 24小时过期

  const approval = {
    id,
    action,
    description,
    params,
    command,
    preview,
    status: 'pending',
    riskLevel: risk.level,
    createdAt: new Date().toISOString(),
    expiresAt,
    resolvedAt: null,
    resolvedBy: null,
    telegramMessageId: null
  };

  // 写入待审批列表
  const pending = loadPending();
  pending.push(approval);
  savePending(pending);

  // 构建 Telegram 通知
  const riskBadge = risk.level === 'high' ? '🔴 高风险' : risk.level === 'medium' ? '🟡 中风险' : '🟢 低风险';
  let msg = `${risk.emoji} **待审批：${risk.label}**\n`;
  msg += `风险：${riskBadge}\n\n`;
  msg += `操作说明：${description}\n`;

  if (Object.keys(preview).length > 0) {
    msg += '\n预览数据：\n';
    for (const [k, v] of Object.entries(preview)) {
      msg += `  • ${k}：${v}\n`;
    }
  }

  msg += `\n审批ID：\`${id.slice(0, 8)}\``;
  msg += `\n过期时间：${new Date(expiresAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`;

  // 发送 Telegram 通知（带按钮）
  try {
    const { sendApprovalNotification } = await import('./notifier.mjs');
    const msgId = await sendApprovalNotification(msg, id);
    approval.telegramMessageId = msgId;

    // 更新记录中的 messageId
    const list = loadPending();
    const idx = list.findIndex(a => a.id === id);
    if (idx !== -1) { list[idx].telegramMessageId = msgId; savePending(list); }
  } catch (e) {
    // 通知失败不阻断审批创建
    console.warn(`⚠️  Telegram 通知发送失败：${e.message}`);
    console.log(`   审批 ID：${id}`);
    console.log(`   手动批准：node audit/approval.mjs approve --id ${id}`);
  }

  await writeAuditLog({ action: 'approval_created', approvalId: id, approvalAction: action, description, riskLevel: risk.level });

  return approval;
}

// ─── 执行审批通过 ─────────────────────────────────────────

export async function approveRequest(id) {
  const list = loadPending();
  const idx = list.findIndex(a => a.id === id || a.id.startsWith(id));

  if (idx === -1) throw new Error(`找不到审批 ID：${id}`);

  const approval = list[idx];
  if (approval.status !== 'pending') throw new Error(`该审批已${approval.status === 'approved' ? '批准' : '拒绝'}`);
  if (new Date(approval.expiresAt) < new Date()) throw new Error('该审批已过期');

  // 执行命令
  if (approval.command) {
    const { execSync } = await import('child_process');
    console.log(`\n▶ 执行：${approval.command}\n`);
    try {
      const output = execSync(approval.command, { encoding: 'utf8', cwd: join(__dirname, '..') });
      console.log(output);
    } catch (e) {
      throw new Error(`命令执行失败：${e.message}`);
    }
  }

  // 更新状态
  list[idx].status = 'approved';
  list[idx].resolvedAt = new Date().toISOString();
  list[idx].resolvedBy = 'user';
  savePending(list);

  await writeAuditLog({
    action: 'approval_approved',
    approvalId: approval.id,
    approvalAction: approval.action,
    description: approval.description,
    command: approval.command
  });

  return approval;
}

// ─── 拒绝审批 ─────────────────────────────────────────────

export async function rejectRequest(id, reason = '') {
  const list = loadPending();
  const idx = list.findIndex(a => a.id === id || a.id.startsWith(id));

  if (idx === -1) throw new Error(`找不到审批 ID：${id}`);

  const approval = list[idx];
  if (approval.status !== 'pending') throw new Error(`该审批已处理`);

  list[idx].status = 'rejected';
  list[idx].resolvedAt = new Date().toISOString();
  list[idx].resolvedBy = 'user';
  list[idx].rejectReason = reason;
  savePending(list);

  await writeAuditLog({
    action: 'approval_rejected',
    approvalId: approval.id,
    approvalAction: approval.action,
    description: approval.description,
    reason
  });

  return approval;
}

// ─── 查看待审批列表 ───────────────────────────────────────

export function listPending() {
  const list = loadPending();
  const now = new Date();
  return list.filter(a => a.status === 'pending' && new Date(a.expiresAt) > now);
}

export function listAll() {
  return loadPending();
}

// ─── 清理过期 ─────────────────────────────────────────────

export function expireOld() {
  const list = loadPending();
  const now = new Date();
  let count = 0;
  list.forEach(a => {
    if (a.status === 'pending' && new Date(a.expiresAt) < now) {
      a.status = 'expired';
      count++;
    }
  });
  savePending(list);
  return count;
}

// ─── CLI 入口 ─────────────────────────────────────────────

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const idArg = args[args.indexOf('--id') + 1];
  const reasonArg = args[args.indexOf('--reason') + 1];

  const risk = RISK_LEVELS;
  const riskColor = { high: '🔴', medium: '🟡', low: '🟢' };

  async function main() {
    switch (cmd) {
      case 'list': {
        const pending = listPending();
        if (pending.length === 0) {
          console.log('✅ 暂无待审批操作');
          break;
        }
        console.log(`⏳ 待审批（${pending.length} 条）：\n`);
        pending.forEach(a => {
          const r = RISK_LEVELS[a.action] || { level: 'medium', emoji: '⚠️', label: a.action };
          const expires = new Date(a.expiresAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
          console.log(`${riskColor[r.level]} [${a.id.slice(0,8)}] ${r.emoji} ${r.label}`);
          console.log(`   ${a.description}`);
          console.log(`   创建：${new Date(a.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} | 过期：${expires}`);
          if (a.command) console.log(`   命令：${a.command}`);
          console.log('');
        });
        break;
      }

      case 'detail': {
        if (!idArg) { console.error('❌ 缺少 --id'); process.exit(1); }
        const all = listAll();
        const found = all.find(a => a.id === idArg || a.id.startsWith(idArg));
        if (!found) { console.error('❌ 找不到该审批'); process.exit(1); }
        console.log(JSON.stringify(found, null, 2));
        break;
      }

      case 'approve': {
        if (!idArg) { console.error('❌ 缺少 --id'); process.exit(1); }
        console.log(`✅ 正在批准审批 ${idArg}...\n`);
        const result = await approveRequest(idArg);
        console.log(`\n✅ 已批准：${result.description}`);
        break;
      }

      case 'reject': {
        if (!idArg) { console.error('❌ 缺少 --id'); process.exit(1); }
        const result = await rejectRequest(idArg, reasonArg || '');
        console.log(`❌ 已拒绝：${result.description}`);
        break;
      }

      case 'expire': {
        const n = expireOld();
        console.log(`🧹 已标记 ${n} 条过期审批`);
        break;
      }

      default:
        console.log(`🦞 电商龙虾 — 审批系统

用法：
  node audit/approval.mjs list                    查看待审批
  node audit/approval.mjs detail  --id ID        审批详情
  node audit/approval.mjs approve --id ID        批准
  node audit/approval.mjs reject  --id ID [--reason 原因]  拒绝
  node audit/approval.mjs expire                  清理过期`);
    }
  }

  main().catch(err => {
    console.error('❌ 审批操作失败：', err.message);
    process.exit(1);
  });
}
