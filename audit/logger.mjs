/**
 * 审计日志系统
 * 电商龙虾 — 所有写操作的可追溯记录
 *
 * 日志格式：JSONL，每行一条记录
 * 存储路径：audit/YYYY-MM-DD.jsonl
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUDIT_DIR = __dirname;

// 确保 audit 目录存在
if (!existsSync(AUDIT_DIR)) {
  mkdirSync(AUDIT_DIR, { recursive: true });
}

/**
 * 写入审计日志
 * @param {Object} entry 日志条目
 * @param {string} entry.action  操作类型（fulfill/refund/cancel/resend/price_change/bulk_publish...）
 * @param {Object} [entry.before] 操作前快照
 * @param {Object} [entry.after]  操作后快照
 * @param {boolean} [entry.canRollback] 是否可回滚
 */
export async function writeAuditLog(entry) {
  const today = new Date().toISOString().slice(0, 10);
  const logPath = join(AUDIT_DIR, `${today}.jsonl`);

  const record = {
    timestamp: new Date().toISOString(),
    ...entry,
    canRollback: entry.canRollback ?? false
  };

  try {
    appendFileSync(logPath, JSON.stringify(record) + '\n', 'utf8');
  } catch (e) {
    // 审计日志失败不阻断主流程，仅 console 警告
    console.warn(`⚠️  审计日志写入失败：${e.message}`);
  }

  return record;
}

/**
 * 读取审计日志
 * @param {string} [date] YYYY-MM-DD，默认今天
 * @returns {Array} 日志条目数组
 */
export function readAuditLog(date) {
  const target = date || new Date().toISOString().slice(0, 10);
  const logPath = join(AUDIT_DIR, `${target}.jsonl`);

  if (!existsSync(logPath)) return [];

  return readFileSync(logPath, 'utf8')
    .split('\n')
    .filter(line => line.trim())
    .map(line => {
      try { return JSON.parse(line); }
      catch { return null; }
    })
    .filter(Boolean);
}

/**
 * 查看最近 N 条审计记录
 * @param {number} n 条数，默认 20
 */
export function getRecentLogs(n = 20) {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  const logs = [
    ...readAuditLog(yesterday),
    ...readAuditLog(today)
  ];

  return logs.slice(-n);
}

/**
 * CLI 模式：直接运行查看日志
 * node audit/logger.mjs [--date YYYY-MM-DD] [--last 20]
 */
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const dateArg = args[args.indexOf('--date') + 1];
  const lastArg = parseInt(args[args.indexOf('--last') + 1]) || 20;

  const logs = dateArg ? readAuditLog(dateArg) : getRecentLogs(lastArg);

  if (logs.length === 0) {
    console.log('暂无审计记录');
  } else {
    console.log(`🔍 审计日志（共 ${logs.length} 条）\n`);

    const actionMap = {
      fulfill:      '📦 发货',
      refund:       '💸 退款',
      cancel:       '❌ 取消订单',
      resend:       '🔄 补发',
      note:         '📝 备注',
      price_change: '💰 改价',
      bulk_publish: '📋 批量上架',
      stock_update: '📦 库存调整'
    };

    logs.forEach(log => {
      const time = new Date(log.timestamp).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
      const actionLabel = actionMap[log.action] || log.action;
      console.log(`[${time}] ${actionLabel}`);

      if (log.orderNumber) console.log(`  订单：#${log.orderNumber}`);
      if (log.trackingNumber) console.log(`  物流：${log.company} ${log.trackingNumber}`);
      if (log.amount) console.log(`  金额：${log.amount}`);
      if (log.reason) console.log(`  原因：${log.reason}`);
      if (log.message) console.log(`  备注：${log.message}`);
      if (log.canRollback) console.log(`  ↩️  可回滚`);
      console.log('');
    });
  }
}
