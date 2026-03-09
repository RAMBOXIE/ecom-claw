# 🏪 店铺运营 Skill

> 覆盖电商店铺日常运营的四大核心模块：商品上新 · 订单处理 · 库存调度 · 促销定价

---

## 快速导航

| 模块 | 入口 | 核心能力 |
|------|------|---------|
| 商品上新 | `modules/store/launch/` | SEO审计、GEO内容、多平台文案 |
| 订单处理 | `modules/store/orders.mjs` | 列表、发货、退款、取消、补发、备注 |
| 库存调度 | `modules/store/inventory.mjs` | 总览、预警、SKU管理、价格更新 |
| 促销定价 | `modules/store/promotions.mjs` | 批量改价、原价恢复、折扣码管理 |

---

## 一、商品上新 `launch/`

### AI 使用时机
- 用户说"帮我优化商品SEO"、"写个文案"、"检查一下这个商品是否可以上架"

### 核心命令

```bash
# 上新完整度诊断（12项评分，告诉你缺什么）
node modules/store/launch/index.mjs --product-id <ID>

# 批量查看未完成上新的商品
node modules/store/launch/index.mjs --list-incomplete

# SEO 审计（7项评分 + 修复建议）
node modules/store/launch/seo.mjs --product-id <ID>
# 写入 SEO 字段
node modules/store/launch/seo.mjs --product-id <ID> --apply \
  --meta-title "最佳防晒霜 | SPF50+ 轻薄不油腻" \
  --meta-desc "全天候防晒，适合户外运动，150字以内描述..."

# GEO 内容生成（FAQ + 对比段落 + 规格表 + Alt文本）
node modules/store/launch/geo.mjs --product-id <ID>
node modules/store/launch/geo.mjs --product-id <ID> --apply   # 写入描述

# 多平台文案
node modules/store/launch/copywriter.mjs --product-id <ID> --platform xiaohongshu
node modules/store/launch/copywriter.mjs --product-id <ID> --platform tiktok
node modules/store/launch/copywriter.mjs --product-id <ID> --platform all  # 7平台同出

# 全流程
node modules/store/launch/index.mjs --product-id <ID> --run-all
```

### 支持平台
`shopify` `woocommerce` `taobao` `xiaohongshu` `douyin` `tiktok` `wechat`

### 输出格式
所有命令输出 `__JSON_OUTPUT__` + JSON，AI 可解析后直接展示或二次处理

---

## 二、订单处理 `orders.mjs`

### AI 使用时机
- 用户说"看看有哪些待发货订单"、"帮我发货"、"退款给这个客户"

### 核心命令

```bash
# 查看待发货订单
node modules/store/orders.mjs list
node modules/store/orders.mjs list --status any --limit 50

# 订单详情
node modules/store/orders.mjs detail --order-id 5001234567890

# 发货（会发 Telegram 审批请求，点✅批准后执行）
node modules/store/orders.mjs fulfill \
  --order-id 5001234567890 --tracking-number SF1234567890 --company 顺丰

# 退款（高风险，必须审批）
node modules/store/orders.mjs refund \
  --order-id 5001234567890 --amount 99.00 --reason "商品损坏"

# 取消订单（高风险，必须审批）
node modules/store/orders.mjs cancel --order-id 5001234567890 --reason customer

# 添加备注（直接执行，无需审批）
node modules/store/orders.mjs note \
  --order-id 5001234567890 --message "客户要求延迟发货至周五"

# 补发（创建 $0 草稿单，审批后在后台完成发货）
node modules/store/orders.mjs resend --order-id 5001234567890
```

### 审批规则
| 操作 | 风险等级 | 默认行为 |
|------|---------|---------|
| list / detail / note | 只读 | 直接执行 |
| fulfill | 🟡 中风险 | 发 Telegram 审批 |
| resend | 🟡 中风险 | 发 Telegram 审批 |
| refund | 🔴 高风险 | 必须审批 |
| cancel | 🔴 高风险 | 必须审批 |

> 审批按钮格式：`approve:<uuid>` / `reject:<uuid>`，用户点击后 Agent 自动处理

---

## 三、库存调度 `inventory.mjs`

### AI 使用时机
- 用户说"检查一下库存"、"哪些商品快断货了"、"帮我调整一下这个变体的库存"

### 核心命令

```bash
# 库存总览（健康度评分）
node modules/store/inventory.mjs status

# 低库存预警（低于阈值的全部列出）
node modules/store/inventory.mjs alert --threshold 10

# 完整库存列表
node modules/store/inventory.mjs list
node modules/store/inventory.mjs list --low    # 只看低库存
node modules/store/inventory.mjs list --out    # 只看断货

# 某商品的所有 SKU/变体
node modules/store/inventory.mjs skus --product-id 123456789

# 更新库存数量
node modules/store/inventory.mjs update --variant-id 12345 --stock 50 --confirm

# 更新定价
node modules/store/inventory.mjs price --variant-id 12345 --price 99 --compare 129 --confirm
```

### 健康度评分说明
- `healthScore = 100 - ((断货数 + 低库存数×0.5) / 总变体数 × 100)`
- ≥ 90 🟢 健康  |  70-89 🟡 注意  |  < 70 🔴 需处理

---

## 四、促销定价 `promotions.mjs`

### AI 使用时机
- 用户说"帮我做个全店8折"、"恢复原价"、"创建一个折扣码"

### 核心命令

```bash
# 预览折扣效果（不执行任何操作）
node modules/store/promotions.mjs preview --discount 0.8
node modules/store/promotions.mjs preview --discount 0.8 --product-ids 123,456,789

# 应用折扣（发 Telegram 审批请求）
node modules/store/promotions.mjs apply --discount 0.8

# 恢复原价（发 Telegram 审批请求）
node modules/store/promotions.mjs restore

# 折扣码管理
node modules/store/promotions.mjs discounts list
node modules/store/promotions.mjs discounts create \
  --type percent --value 20 --code SAVE20 --min-order 100
node modules/store/promotions.mjs discounts delete --rule-id 123456
```

### 折扣类型
| `--type` | 说明 | `--value` |
|----------|------|-----------|
| `percent` | 百分比折扣 | `20` = 8折（减20%） |
| `fixed` | 固定金额减免 | `30` = 减30元 |

> ⚠️ 折扣码功能需要 Shopify App 具备 `read_price_rules, write_price_rules, read_discounts, write_discounts` scope

---

## 统一约定

### 输出格式
所有命令都会在标准输出末尾追加：
```
__JSON_OUTPUT__
{"ok":true, ...}
```
AI 可用此结构化输出进行二次处理（展示摘要、触发下一步操作等）。

### 审批集成
高风险写操作通过 `audit/approval.mjs` 发送 Telegram 审批按钮。
- 用户点 **✅ 批准** → Agent 收到 `approve:<uuid>` → 执行命令
- 用户点 **❌ 拒绝** → Agent 收到 `reject:<uuid>` → 放弃操作

审批 ID 24小时过期，可通过 `node audit/approval.mjs list` 查看待审批队列。

### 审计日志
所有写操作自动写入 `audit/audit.log`（JSONL 格式），保留完整操作历史。

---

## 依赖

- `connectors/shopify.js` — Shopify Admin API
- `connectors/woocommerce.js` — WooCommerce REST API（可选）
- `audit/approval.mjs` — 审批系统
- `audit/logger.mjs` — 审计日志
- `config.json` — 店铺配置（含审批规则、通知 ID、库存阈值）

---

*v2.0 | 2026-03-09*
