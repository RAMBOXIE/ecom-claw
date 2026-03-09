# 路线图 — Clawbot for Ecommerce

> 最后更新：2026-03-09
> 🎯 近期目标：**v2.0 MVP 在 3月13日前交付**

---

## ⏱ 倒计时：4天（3/9 → 3/13）

---

## 当前版本：v1.0（已交付，2026-03-06）

### v1.0 已完成清单
- [x] Shopify Admin API 连接层
- [x] 有赞 API 框架（待激活）
- [x] OAuth 向导（setup.mjs）
- [x] 5 个 Cron 自动化任务（日报/订单通知/库存预警/周报/月报）
- [x] 29 个脚本（报告/上架/订单/库存/营销/客服/竞品/物流）
- [x] Dashboard UI（配置向导 + 实时看板）

### v1.0 已知问题（待修复）
- 🔴 **P0**：所有 Cron 报 HTTP 403（订单通知连续失败 9 次）
- 🔴 **P1**：discount-codes 缺 price_rules scope
- 🟡 **P2**：GitHub repo 未推送
- 🟡 **P2**：有赞未接入
- 🟡 **P2**：物流追踪需快递100 API key

---

## 🚀 v2.0 MVP 开发计划（3/9 - 3/13）

### 总体原则
1. 先修基础设施（Cron 403），再建新能力
2. API-first，不做浏览器自动化主链路
3. 先做闭环，不做大而全
4. 所有 AI 输出结构化，便于审计和二次执行

---

### Day 1（3/9）：修基础 + 搭框架 ✅

**任务 1：修复 Cron HTTP 403** ✅ 已自愈（3月7日临时故障，现已恢复）

**任务 2：GitHub push** ✅ 已完成（commit 41ed333）

**任务 3：重构目录结构**
- 新建 `modules/` 目录（selection / launch / community / ops）
- 新建 `audit/` 目录（审计日志）
- 新建 `sop/` 目录（SOP 模板）
- 现有 scripts/ 不动，模块是对脚本的更高层封装

**任务 4：WooCommerce connector 框架** ← 新增
- 新建 `connectors/woocommerce.js`
- 接口与 shopify.js 对齐（相同函数签名）
- 更新 `config.template.json` 加入 WooCommerce 配置项
- 更新 `setup.mjs` 支持 WooCommerce 引导

---

### Day 2（3/10）：Launch Bot + SEO/GEO

**任务 4：Launch Bot 核心**
- `modules/launch/index.mjs` — 商品页草稿生成入口
- `modules/launch/seo.mjs` — SEO 补全（title/description/keywords/URL handle）
- `modules/launch/geo.mjs` — GEO 补全（FAQ/对比段落/规格表/alt 文本）
- `modules/launch/copywriter.mjs` — 多平台文案（迁移现有 copywriter.mjs）

**输入格式**：
```json
{
  "name": "商品名",
  "keyPoints": ["卖点1", "卖点2"],
  "imageUrls": ["url1"],
  "platform": "shopify",
  "market": "domestic|crossborder",
  "brandTone": "活泼"
}
```

**输出**：完整商品页 JSON draft（含 SEO + GEO 字段）

**验收标准**：
- 输入一个商品基本信息 → 输出包含 FAQ/对比段落/规格表的完整草稿
- 草稿可直接推送 Shopify 创建为 draft 状态商品

---

### Day 3（3/11）：Selection Bot + Community Bot

**任务 5：Selection Bot**
- `modules/selection/index.mjs` — 选品分析入口
- `modules/selection/profit.mjs` — 利润计算（迁移 product-research.mjs）
- `modules/selection/competitor.mjs` — 竞品分析（迁移 competitor-watch.mjs）
- 新增：用户痛点提取（基于文本输入）
- 新增：候选品优先级评分

**任务 6：Community Bot**
- `modules/community/index.mjs` — 社区分析入口
- `modules/community/summarize.mjs` — 评论/问题归纳
- `modules/community/faq-flow.mjs` — FAQ 回流（建议 → 审批 → 写入）
- `modules/community/content-topics.mjs` — 内容选题建议

---

### Day 4（3/12）：审批系统 + Dashboard 重构

**任务 7：审批与审计系统**
- `audit/logger.mjs` — 审计日志写入工具
- `audit/approval.mjs` — 审批流（pending / approve / reject）
- 所有写操作调用 `audit/logger.mjs` 记录 before/after
- 高风险操作（改价/退款/发货）必须经 approval.mjs

**审批通知格式（Telegram）**：
```
⚠️ 待审批操作
操作：批量改价（全店8折）
影响商品：23个
需要你确认：
[✅ 批准] [❌ 拒绝]
```

**任务 8：Dashboard 重构**
- 首页：今日重点（待审批/预警/草稿/社区问题）
- 导航：生命周期六阶段（选品/上新/转化/运营/社区/复盘）
- SOP 中心：模板 A/B/C 选择与启用
- Copilot 入口：自然语言输入框

---

### Day 5（3/13）：集成测试 + 验收

**任务 9：端到端验收**

验收场景 1：完整上新流程
1. 输入商品基本信息
2. Launch Bot 生成草稿（含 SEO + GEO）
3. 审批中心确认
4. 推送 Shopify 创建草稿商品
5. 审计日志记录完整

验收场景 2：自动化运营
1. Cron 日报正常推送
2. 新订单 15 分钟内通知到 Telegram
3. 库存低于阈值告警

验收场景 3：社区回流
1. 粘贴 10 条用户评论
2. Community Bot 输出问题归纳 + FAQ 建议
3. 人工审批后写入 FAQ 库

**任务 10：文档 + GitHub**
- 更新 README.md（使用说明）
- 更新 SKILL.md（AI 使用入口）
- GitHub push 最终版本
- 打 v2.0 tag

---

## MVP 验收标准

### 产品层
- [ ] 用户 5~10 分钟完成首次接入（问答式 onboarding）
- [ ] 无需填写复杂表单即可获得首批结果
- [ ] 用户能理解系统在做什么

### 工程层
- [ ] 任务链路可追踪（audit log）
- [ ] 高风险操作无法绕过审批
- [ ] 失败任务可明确定位原因
- [ ] 所有 Cron 正常运行（无 403）

### 业务层（至少覆盖以下场景）
- [ ] 商品页草稿生成（含 SEO + GEO）
- [ ] 社区问题整理 → FAQ 回流
- [ ] 日报/订单通知正常推送

---

## v3.0 中期规划（3月后）

### 平台扩展
- [ ] 淘宝/天猫 TOP API 接入
- [ ] Amazon SP-API 接入
- [ ] 1688 热销榜自动采集（Chrome Relay）

### 功能增强
- [ ] 定时促销（自动改价/恢复原价）
- [ ] 多语言商品页生成（中→英/日/韩）
- [ ] 邮件营销集成（Klaviyo）
- [ ] 评价监控（Judge.me / WooCommerce 原生评论）
- [ ] Webhook 替代订单轮询（需公网 IP）
- [ ] 多店铺并行管理（Shopify + WooCommerce 同时跑）

## v4.0 长期愿景

- [ ] SaaS 化（Hosted 版本，用户只填一个 key）
- [ ] Web 管理后台（替代命令行）
- [ ] 多租户支持
- [ ] npm 包发布

---

## 决策记录

| 日期 | 决策 | 原因 |
|------|------|------|
| 2026-03-06 | 图片上传用 base64 | Trial 账号不支持外部 URL |
| 2026-03-06 | 订单通知用轮询 | 本机无公网 IP，webhook 接不到 |
| 2026-03-06 | 1688 采集用 Chrome Relay | 无头浏览器被同盾风控拦截 |
| 2026-03-07 | 文档驱动开发 | 先对齐目标，再动手 |
| 2026-03-09 | 项目升级为全生命周期经营助手 | 原定位太窄，产品价值未充分体现 |
| 2026-03-09 | API-first，不做 RPA 主链路 | 浏览器自动化维护成本高、风控风险大 |
| 2026-03-09 | 单主控 + 多模块，不做多 Agent | MVP 阶段需要稳定性和可审计性 |
| 2026-03-09 | WooCommerce 与 Shopify 同优先级（v2.0） | 全球独立站 30%+ 跑在 WordPress 上，REST API 接入成本低，connector 层可复用大部分脚本 |
