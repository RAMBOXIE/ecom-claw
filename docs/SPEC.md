# 功能规格 — Clawbot for Ecommerce

> 本文档定义每个模块的预期行为与输出规范。开发以此为准，实现与文档不符视为 Bug。
> 最后更新：2026-03-09

---

## 0. 架构总则

### 执行层优先级（不可颠倒）
1. 官方 API（Shopify Admin API、有赞 Open API 等）
2. CSV / 表格 / 文件流
3. 浏览器自动化（兜底，不作主链路）

### 输出规范（所有模块必须遵守）
- **结构化输出**：每次任务输出 JSON schema，供 Dashboard / 审批 / 日志使用
- **人类可读摘要**：同时提供文字摘要，供 Telegram / Dashboard 展示
- **审计记录**：每次执行自动写入 `audit/YYYY-MM-DD.jsonl`
- **高风险操作**：必须经审批中心确认，不得自动执行

### 任务状态机
每个任务有以下状态：
```
pending → running → awaiting_approval → approved/rejected → completed/failed
```

---

## 1. Selection Bot（选品模块）

### 职责
发现候选品类 / SKU，提供竞品分析和市场机会判断。

### 输入
- 用户描述的方向（自然语言）：如"找适合夏天的户外用品"
- 可选：竞品 URL 列表、目标价格区间、目标市场

### 输出
```json
{
  "task": "selection",
  "candidates": [
    {
      "name": "商品名",
      "category": "品类",
      "estimatedDemand": "高/中/低",
      "competitionLevel": "高/中/低",
      "suggestedPrice": { "min": 0, "max": 0, "currency": "CNY" },
      "userPainPoints": ["痛点1", "痛点2"],
      "keyCompetitors": ["竞品A", "竞品B"],
      "priority": "P1/P2/P3",
      "reason": "推荐理由"
    }
  ],
  "summary": "文字摘要"
}
```

### 功能细节

#### 1.1 竞品分析
- 输入竞品 URL（支持 Shopify / 独立站）
- 抓取：商品名、价格、描述关键词、评价数量
- 输出：竞品功能对比表 + 差异化建议
- **限制**：仅支持 HTML 可见内容（不支持 JS SPA 渲染页面）

#### 1.2 用户痛点提取
- 来源：商品评论文本（需用户粘贴）、FAQ 库、已有社区数据
- 输出：高频痛点关键词 + 情感倾向

#### 1.3 利润计算器
```
毛利润 = 售价 - 成本 - 平台手续费(售价×比例) - 运费
利润率 = 毛利润 / 售价
```
参数：`--cost --price --platform-fee --shipping`

---

## 2. Launch Bot（上新模块）

### 职责
生成商品页草稿，覆盖 SEO 和 GEO 要求，支持多平台适配。

### 输入
- 商品基本信息（名称、卖点、图片 URL）
- 目标平台（Shopify / 有赞 / 淘宝等）
- 目标市场（国内 / 英语 / 多语言）
- 可选：竞品参考、品牌语气

### 输出
```json
{
  "task": "launch",
  "draft": {
    "title": "",
    "subtitle": "",
    "description": "",
    "seo": {
      "metaTitle": "",
      "metaDescription": "",
      "keywords": []
    },
    "geo": {
      "faq": [{ "question": "", "answer": "" }],
      "comparisons": { "suitableFor": [], "notSuitableFor": [] },
      "specs": {},
      "altTexts": []
    },
    "tags": [],
    "variants": [],
    "status": "draft"
  },
  "platform": "shopify",
  "reviewRequired": true
}
```

### 功能细节

#### 2.1 商品页草稿生成
必须包含以下字段（缺一不可）：
- 标题（含核心关键词）
- 卖点列表（3~5条）
- 商品描述（150~400字，视平台调整）
- 标签建议
- 变体结构（颜色/尺码等）

#### 2.2 SEO 补全
- Meta Title（< 60字符）
- Meta Description（< 160字符）
- 关键词建议（5~10个）
- URL handle 建议（英文，小写，连字符）

#### 2.3 GEO 补全（核心差异化）
以下内容需全部生成：
- **FAQ**：至少 5 条问答，格式为自然问句 + 完整答案
- **对比段落**：「适合谁」/「不适合谁」各 3 条
- **规格表**：材质、尺寸、重量、适用场景（结构化 key-value）
- **图片 alt 文本**：每张图描述性 alt 文本
- **事实模块**：物流时效、退换政策、售后说明（可选）

#### 2.4 多平台文案风格

| 平台 | 字数 | 风格 |
|------|------|------|
| Shopify（英）| 150-300字 | 简洁，突出核心卖点 |
| 淘宝 | 200-400字 | 详细，信任背书，转化导向 |
| 小红书 | 100-200字 | 种草体，emoji 丰富 |
| 抖音 | 50-100字 | 口播脚本，节奏感强 |
| 微信 | 200-500字 | 情感化，朋友圈/公众号风格 |

#### 2.5 图片上传（Shopify）
- 下载 URL → buffer → base64 → Shopify attachment 接口
- **注意**：Trial 账号不支持外部 URL 直接引用，必须 base64
- 支持批量上传，失败单张不中断整体流程

#### 2.6 批量上架
- CSV 格式：`title,price,compare_price,sku,stock,description,images,status`
- `images` 多图用 `|` 分隔
- 支持 `--dry-run` 预览、`--confirm` 执行
- 失败行记录错误，不中断整体

---

## 3. Community Bot（社区模块）

### 职责
汇总社区问题、归纳评论情感、将高价值信息回流到 FAQ 和内容策略。

### 输入
- 用户粘贴的评论文本 / 社群记录
- 可选：平台评价数据（CSV 导出）

### 输出
```json
{
  "task": "community",
  "summary": {
    "totalItems": 0,
    "sentimentScore": 0.0,
    "topIssues": ["问题1", "问题2"],
    "positiveHighlights": [],
    "suggestedFaqAdditions": [
      { "question": "", "answer": "", "source": "用户原话" }
    ],
    "contentTopics": ["内容选题1", "内容选题2"],
    "ugcLeads": []
  }
}
```

### 功能细节

#### 3.1 问题归纳
- 按频率排序高频问题
- 标注情感倾向（正面/中性/负面）
- 提取用户原始表达（保留真实语言）

#### 3.2 FAQ 回流
- 将高频问题自动建议添加到 FAQ 库（`scripts/data/faq.json`）
- 需人工审批后才写入
- 写入后同步到 Launch Bot 的 GEO FAQ 模板

#### 3.3 内容选题建议
- 基于用户痛点和问题生成博客/指南选题
- 输出选题列表 + 预计 SEO 价值评分（高/中/低）

---

## 4. Ops Bot（日常运营模块）

### 职责
日报/周报/月报、库存预警、页面巡检、多渠道健康度检查。

### 4.1 日报（daily-report）

**触发**：Cron 每天 08:00 HKT，或手动

**参数**：`[YYYY-MM-DD]`（默认昨日）

**输出内容**：
- 当日销售额、订单数、客单价
- 热销商品 TOP5（按销量）
- 待发货订单数
- 库存预警列表（低于阈值）
- 与前一日环比变化

**输出 Schema**：
```json
{
  "date": "YYYY-MM-DD",
  "revenue": 0,
  "orders": 0,
  "avgOrderValue": 0,
  "topProducts": [],
  "pendingShipment": 0,
  "lowStock": [],
  "vsYesterday": { "revenue": "+0%", "orders": "+0%" }
}
```

### 4.2 周报（weekly-report）
- 本周 vs 上周：销售额、订单数、新客数
- 每日趋势（7天折线数据）
- TOP10 商品（周销量排行）
- 新客 vs 回头客比例

### 4.3 月报（monthly-report）
- 月度销售额、订单量
- 周分段数据（第1~4周）
- 客户留存率
- 月度峰值日

### 4.4 订单通知（order-notify）
- **触发**：Cron 每 15 分钟
- 读 `.last-order-check.json` → 拉新订单 → 过滤已通知 → 推送
- 有新订单：格式化消息推 Telegram
- 无新订单：静默退出

**输出 Schema**：
```json
{
  "newOrders": [
    {
      "id": 0,
      "orderNumber": 0,
      "total": "0.00",
      "currency": "HKD",
      "payStatus": "paid",
      "items": [],
      "messages": ["消息文本"]
    }
  ]
}
```

### 4.5 库存预警（stock-alert）
- **触发**：Cron 09/15/21 点 HKT
- 有低库存：推送告警
- 全部正常：静默

**输出 Schema**：
```json
{
  "ok": true,
  "lowStockItems": [
    { "productTitle": "", "sku": "", "stock": 0, "threshold": 10 }
  ]
}
```

### 4.6 页面巡检（health-check）
检查项：
1. config.json 存在且格式正确
2. Shopify API 连通（GET /shop.json）
3. 有赞 API 连通（如有配置）
4. Cron 任务状态
5. 磁盘空间（logs / tmp 目录）

---

## 5. 连接层（connectors/）

### 5.1 shopify.js

| 函数 | 说明 |
|------|------|
| `getRecentOrders(hoursAgo)` | 最近N小时订单 |
| `getOrders(params)` | 通用查询 |
| `getOrderById(id)` | 单条详情 |
| `fulfillOrder(orderId, tracking, company)` | 标记发货 |
| `refundOrder(orderId, amount, reason)` | 退款 |
| `getProducts(params)` | 商品列表 |
| `createProduct(data)` | 创建商品 |
| `updateProduct(id, data)` | 更新商品 |
| `getInventoryLevels(variantIds)` | 库存查询 |
| `updateInventory(itemId, locationId, qty)` | 更新库存 |
| `getCustomers(params)` | 客户列表 |
| `uploadImageBase64(productId, b64, name)` | 图片上传 |

**规范**：
- 所有函数返回 Promise，出错 throw Error（含 HTTP 状态码）
- 自动从 `config.json` 读凭证
- Shopify 429 自动等待 Retry-After 重试（最多3次）

### 5.2 youzan.js
框架已建，待填 access_token 后激活。
预期导出：`getYouzanOrders / getYouzanProducts / getYouzanInventory`

---

## 6. 审批与审计系统

### 6.1 权限等级

| 等级 | 说明 |
|------|------|
| 只读模式 | 仅查询，不写入 |
| 建议模式 | 输出建议，需人工操作 |
| 草稿模式 | 创建草稿，需审批发布 |
| 确认模式 | 执行前弹出确认，用户点 approve |
| 自动模式 | 仅限低风险操作（日报/库存查询） |

### 6.2 高风险操作（默认不自动执行）
- 大范围价格修改
- 退款 / 发货 / 取消订单
- 对外发布内容到高敏感渠道
- 批量修改关键商品属性

### 6.3 审计日志格式
每次执行写入 `audit/YYYY-MM-DD.jsonl`：
```json
{
  "timestamp": "ISO8601",
  "task": "task_name",
  "module": "ops/launch/selection/community",
  "input": {},
  "output": {},
  "status": "completed/failed/pending_approval",
  "approvedBy": "user/auto",
  "before": {},
  "after": {},
  "canRollback": true,
  "error": null
}
```

### 6.4 幂等与回滚
- 同一任务不可重复提交（task_id 唯一）
- 重试不重复创建对象
- 修改类操作保留 before 快照
- 支持撤销（调用对应 API 反操作）

---

## 7. Dashboard 信息架构

Dashboard 以**经营动作**组织，不以技术模块组织。

### 首页结构

#### A. 今日重点
- 待审批事项（数量 badge）
- 异常预警（库存/价格/连通性）
- 可发布商品草稿
- 社区高频问题
- 今日内容建议

#### B. 生命周期导航
- 选品 / 上新与传播 / 转化优化 / 日常运营 / 社区与复购 / 增长复盘

#### C. SOP 中心
- 已启用 SOP 列表
- 执行成功率
- 最近失败点
- 推荐优化项

#### D. 渠道面板
- 国内渠道 / 跨境渠道
- 各渠道健康度
- 各渠道待处理重点

#### E. AI Copilot 入口
支持自然语言：
- "帮我整理本周值得上的候选品"
- "把这批商品生成英文上新草稿"
- "总结社区里用户最关心的问题"
- "生成本周 SEO + GEO 内容计划"

---

## 8. SOP 模板系统

### 模板 A：国内内容电商
- 上新 SOP：商品信息收集 → 文案生成 → 审批 → 发布
- 评论摘要 SOP：定时抓取 → 归纳 → FAQ 建议 → 人工审批
- 日报 SOP：自动执行，无需审批

### 模板 B：独立站品牌
- Launch SOP：商品页草稿 → SEO 补全 → GEO 补全 → 审批 → 发布
- 巡检 SOP：页面健康度检查 → 问题报告 → 优先级排序
- 内容 SOP：选题建议 → 内容大纲 → 人工撰写 → 发布

### 模板 C：跨境卖家
- 多语言 SOP：中文原稿 → 翻译 → 本地化 → 审批 → 多站点发布
- 市场 SOP：市场筛选 → 本地化检查 → 履约信息核验

---

## 9. 配置规格

### config.json 完整结构
```json
{
  "shopify": {
    "shop_domain": "xxx.myshopify.com",
    "access_token": "shpat_...",
    "api_version": "2026-01",
    "client_id": "",
    "client_secret": ""
  },
  "youzan": {
    "access_token": "",
    "client_id": "",
    "client_secret": "",
    "shop_id": ""
  },
  "notifications": {
    "telegram_chat_id": "1196749626"
  },
  "alerts": {
    "low_stock_threshold": 10,
    "order_poll_interval_minutes": 15
  },
  "report": {
    "daily_report_hour": 8,
    "timezone": "Asia/Hong_Kong"
  },
  "approval": {
    "required_for": ["price_change", "refund", "fulfill", "bulk_publish"],
    "approver_telegram_id": ""
  },
  "business": {
    "type": "domestic|crossborder|both",
    "template": "A|B|C",
    "category": "商品品类",
    "brand_tone": "专业|活泼|温馨"
  }
}
```

---

## 10. 错误处理规范

| 场景 | 处理方式 |
|------|--------|
| config.json 不存在 | 提示运行 `node setup.mjs`，exit 1 |
| Shopify 401 | 提示 token 过期，重新 `node setup.mjs` |
| Shopify 429 | 等待 Retry-After 自动重试（最多3次） |
| 网络超时 | 报错 + exit 1，写审计日志，不静默失败 |
| 缺少 --confirm | 显示 dry-run 结果，提示加 --confirm |
| 审批未通过 | 任务状态标记 rejected，写审计日志，不执行 |

---

## 11. `__JSON_OUTPUT__` 规范

所有需要被 Cron/AI 解析的脚本，在 stdout 输出：
```
__JSON_OUTPUT__ {"key": "value"}
```

### Telegram 推送规范
- 每条消息不超过 4000 字符
- 使用 Markdown 加粗关键数字
- 结尾加「以上」
- 无数据时不发消息（静默）
