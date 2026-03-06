/**
 * 🦞 电商龙虾 — 一行安装
 * 
 * 用法（在 OpenClaw workspace 目录下运行）：
 *   node install.mjs
 * 
 * 或远程安装：
 *   node -e "$(curl -fsSL https://raw.githubusercontent.com/RAMBOXIE/ecom-claw/main/install.mjs)"
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const REPO = 'https://github.com/RAMBOXIE/ecom-claw.git';
const WORKSPACE = join(homedir(), '.openclaw', 'workspace');
const SKILL_DIR = join(WORKSPACE, 'skills', 'ecommerce');

console.log('\n🦞 电商龙虾安装程序\n');

// 检查 workspace
if (!existsSync(WORKSPACE)) {
  console.error(`❌ 未找到 OpenClaw workspace: ${WORKSPACE}`);
  console.error('   请先安装并初始化 OpenClaw');
  process.exit(1);
}

// 已安装则更新
if (existsSync(SKILL_DIR)) {
  console.log('⚡ 检测到已安装，执行更新...');
  execSync('git pull', { cwd: SKILL_DIR, stdio: 'inherit' });
  console.log('✅ 更新完成！');
} else {
  // 首次安装
  console.log('📦 克隆电商龙虾...');
  mkdirSync(join(WORKSPACE, 'skills'), { recursive: true });
  execSync(`git clone ${REPO} "${SKILL_DIR}"`, { stdio: 'inherit' });
  console.log('✅ 安装完成！');
}

console.log(`
📍 安装位置：${SKILL_DIR}

🚀 下一步：
   node "${join(SKILL_DIR, 'setup.mjs')}"

💡 首次运行 setup.mjs 前，请在 Shopify dev dashboard 的 App 设置中
   将以下地址加入「允许的重定向 URL」：
   http://localhost:3457/callback
`);
