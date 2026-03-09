/**
 * 审批通知发送器
 * 电商龙虾 — 通过 OpenClaw 网关发送带审批按钮的 Telegram 通知
 *
 * 按钮点击后 callback_data 会作为消息发回 agent，agent 处理审批动作：
 *   approve:<id>  →  审批通过，执行操作
 *   reject:<id>   →  拒绝
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, '..', 'config.json');
function loadConfig() {
  if (!existsSync(CONFIG_PATH)) throw new Error('config.json not found');
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
}

function loadOpenClawConfig() {
  const paths = [
    // Windows: %USERPROFILE%\.openclaw\openclaw.json  ← 正确位置
    join(process.env.USERPROFILE || '', '.openclaw', 'openclaw.json'),
    // macOS/Linux: ~/.openclaw/openclaw.json
    join(process.env.HOME || '', '.openclaw', 'openclaw.json'),
    // 旧路径兜底
    join(process.env.APPDATA || '', 'openclaw', 'openclaw.json'),
  ];
  for (const p of paths) {
    if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'));
  }
  return null;
}

/**
 * 通过 OpenClaw 网关发送 Telegram 消息（含审批按钮）
 * @param {string} text  通知内容（Markdown）
 * @param {string} approvalId  审批 UUID
 * @returns {number|null} Telegram message ID（失败返回 null）
 */
export async function sendApprovalNotification(text, approvalId) {
  const ecomConfig = loadConfig();
  const chatId = ecomConfig.notifications?.telegram_chat_id;
  if (!chatId) throw new Error('notifications.telegram_chat_id 未配置');

  const shortId = approvalId.slice(0, 8);

  // 尝试通过 OpenClaw 网关发送
  const ocConfig = loadOpenClawConfig();
  const gatewayToken = ocConfig?.gateway?.auth?.token;
  const gatewayPort = ocConfig?.gateway?.port || 18789;

  if (!gatewayToken) {
    // 无法发送，打印到 stdout 让 agent 处理
    console.log('\n📨 APPROVAL_NOTIFY');
    console.log(JSON.stringify({ chatId, text, approvalId, shortId }));
    return null;
  }

  // 通过 /tools/invoke 调用 message 工具
  const payload = {
    tool: 'message',
    args: {
      action: 'send',
      channel: 'telegram',
      target: String(chatId),
      message: text,
      buttons: [[
        { text: '✅ 批准', callback_data: `approve:${approvalId}` },
        { text: '❌ 拒绝', callback_data: `reject:${approvalId}` }
      ]]
    }
  };

  try {
    const res = await fetch(`http://localhost:${gatewayPort}/tools/invoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${gatewayToken}`
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000)
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`网关错误 ${res.status}: ${err}`);
    }

    const data = await res.json();
    // /tools/invoke 响应结构：{ ok, result: { details: { messageId } } }
    return data?.result?.details?.messageId || data?.result?.messageId || data?.messageId || null;
  } catch (e) {
    // 网关调用失败，降级：打印到 stdout
    console.log('\n📨 APPROVAL_NOTIFY');
    console.log(JSON.stringify({ chatId, text, approvalId, shortId, error: e.message }));
    return null;
  }
}
