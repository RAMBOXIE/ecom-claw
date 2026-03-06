# 🦞 电商龙虾 Skill v1.0

专为1人电商设计的全自动化助手。接管重复工作，只让你做判断。

---

## 快速开始（新用户）

**Step 1：** dev.shopify.com → App 设定 → 允许的重定向 URL → 添加 `http://localhost:3457/callback`

**Step 2：** `node setup.mjs` — 对话式引导，自动完成 OAuth，保存 config.json

---

## 自动化 Cron（后台常驻）

| 任务 | 时间 | 说明 |
|------|------|------|
| 每日日报 | 08:00 每天 | 销售/订单/热销/低库存 |
| 新订单通知 | 每15分钟 | 有单即推，无单静默 |
| 库存预警 | 09/15/21点 | 低于阈值即告警 |
| 周报 | 每周一 09:00 | 环比数据+客户分析 |
| 月报 | 每月1日 09:00 | 月度趋势+周分段+峰值 |

---

## 完整脚本能力

### 📊 数据报告
```bash
node scripts/daily-report.mjs [YYYY-MM-DD]   # 日报
node scripts/weekly-report.mjs [--weeks-ago 1] # 周报
node scripts/monthly-report.mjs [--months-ago 0] # 月报
node scripts/multi-shop.mjs summary           # 多平台汇总
```

### 🛍️ 商品管理（上架助手）
```bash
# 单品上架
node scripts/list-product.mjs \
  --title "商品名" --price 99 --compare-price 199 \
  --sku "SKU-001" --stock 100 --images "url1,url2" --draft

# 批量上架（CSV导入）
node scripts/bulk-import.mjs --file products.csv --dry-run
node scripts/bulk-import.mjs --file products.csv

# CSV格式：title,price,compare_price,sku,stock,description,images,status
# images 多图用 | 分隔
```

### 📦 订单管理
```bash
node scripts/order-manage.mjs list                          # 待发货列表
node scripts/order-manage.mjs fulfill \
  --order-id 1234 --tracking-number SF123 --company 顺丰   # 发货
node scripts/order-manage.mjs refund \
  --order-id 1234 --amount 99 --reason "质量问题" --confirm # 退款
```

### 🚚 物流追踪
```bash
node scripts/logistics.mjs track SF1234567890    # 单号查询（自动识别快递）
node scripts/logistics.mjs track-all             # 追踪所有已发货订单
```

### 📉 库存/SKU管理
```bash
node scripts/stock-alert.mjs [threshold]         # 库存预警
node scripts/sku-manage.mjs list [--product-id X] # 变体列表
node scripts/sku-manage.mjs update \
  --variant-id X --price 89 --stock 50 --confirm  # 更新变体
node scripts/sku-manage.mjs add-variant \
  --product-id X --option1 "红色" --price 99 --stock 20 # 添加变体
```

### 💰 营销工具
```bash
# 促销改价
node scripts/promotion.mjs preview --discount 0.8              # 全店8折预览
node scripts/promotion.mjs preview --discount 0.8 --product-ids "id1,id2"
node scripts/promotion.mjs apply --discount 0.8 --confirm      # 执行改价
node scripts/promotion.mjs restore --confirm                   # 恢复原价

# 折扣码（需要 price_rules scope）
node scripts/discount-codes.mjs create \
  --type percent --value 20 --code SAVE20 --min-order 100      # 创建折扣码
node scripts/discount-codes.mjs list                           # 查看折扣码
node scripts/discount-codes.mjs delete --rule-id X            # 删除
```

### 👥 客户管理
```bash
node scripts/customers.mjs list                  # 概览
node scripts/customers.mjs top                   # TOP20消费排行
node scripts/customers.mjs export                # 导出 customers-export.csv
```

### ✍️ 文案生成
```bash
node scripts/copywriter.mjs \
  --name "产品名" \
  --points "卖点1,卖点2,卖点3" \
  --platform xiaohongshu \   # shopify/taobao/xiaohongshu/douyin/wechat
  --audience "目标受众"
```

### 🔍 选品雷达
```bash
node scripts/product-research.mjs profit \
  --cost 50 --price 150 --platform-fee 0.05 --shipping 15   # 利润计算
node scripts/product-research.mjs keywords --product "防晒霜" # 关键词建议
node scripts/product-research.mjs trends --keyword "防晒"    # Google趋势
```

### 💬 客服自动化
```bash
node scripts/customer-service.mjs templates                  # 20条预设模板
node scripts/customer-service.mjs faq-list                   # FAQ列表
node scripts/customer-service.mjs faq-search --query "退货"  # 搜索FAQ
node scripts/customer-service.mjs faq-add \
  --question "问题" --answer "答案" --tags "标签"             # 添加FAQ
node scripts/customer-service.mjs review-monitor             # 差评监控
```

### 🕵️ 竞品监控
```bash
node scripts/competitor-watch.mjs add \
  --name "竞品A" --url "https://..." --note "对标"           # 添加监控
node scripts/competitor-watch.mjs check                      # 立即检查价格
node scripts/competitor-watch.mjs list                       # 查看列表
node scripts/competitor-watch.mjs remove --name "竞品A"      # 删除
```

### 🌐 服务器
```bash
node scripts/dashboard-server.mjs    # Dashboard: http://localhost:3458
node scripts/webhook-server.mjs      # Webhook接收: http://localhost:3459
node scripts/health-check.mjs        # 系统全面检查
```

### 🔗 多平台
```bash
node scripts/multi-shop.mjs status   # 所有平台连接状态
node scripts/multi-shop.mjs summary  # 今日多平台销售汇总
```

---

## 操作权限规则

| 操作 | 规则 |
|------|------|
| 查询/报告/文案/预览 | ✅ 直接执行 |
| 改价/改库存/发货 | ⚡ 需加 --confirm |
| 退款/取消订单 | 🔴 必须明确确认 |
| 批量操作 | 先 --dry-run 预览，再执行 |

---

## 待解锁（需补充 Shopify scope）

折扣码功能需要在 dev.shopify.com 更新 app 权限，添加：
`read_price_rules, write_price_rules, read_discounts, write_discounts`
然后重新运行 `node setup.mjs` 换取新 token。

---

## 平台支持

| 平台 | 状态 | 说明 |
|------|------|------|
| Shopify | ✅ 完整 | 读写订单/商品/库存/客户/发货/退款 |
| 有赞 | ⏳ 待配置 | 填入 config.json youzan.access_token |
| WooCommerce | 🔜 规划中 | — |
