# 🦞 电商龙虾 — 工程模块地图

> 按电商团队职能拆分，四大模块覆盖全链路工作

---

## 模块总览

```
ecom-claw/
├── modules/                  ← 高层模块（AI 调度层）
│   ├── selection/            🔍 选品雷达
│   ├── store/                🏪 店铺运营
│   │   └── launch/           ↳ 上新子模块（已完成）
│   ├── community/            📣 内容社媒
│   └── analytics/            📊 数据参谋
│
├── scripts/                  ← 底层脚本（原子操作层，保持不动）
├── connectors/               ← API 连接器
├── audit/                    ← 审批 & 审计系统
└── setup.mjs                 ← 首次配置向导
```

---

## 🔍 选品雷达 `modules/selection/`

> **适用角色：** 选品负责人
> **核心问题：** 卖什么？这个产品值不值得做？

| 文件 | 功能 | 状态 | 底层脚本 |
|------|------|------|---------|
| `index.mjs` | 选品流程总入口 | 🚧 待建 | — |
| `profit.mjs` | 利润测算（含平台费/物流/退货率） | 🚧 待建 | `scripts/product-research.mjs` |
| `trending.mjs` | 趋势挖掘（Google Trends + 关键词） | 🚧 待建 | `scripts/product-research.mjs` |
| `competitor.mjs` | 竞品监控（价格追踪 + 变动告警） | 🚧 待建 | `scripts/competitor-watch.mjs` |
| `sourcing.mjs` | 货源挖掘（1688热销商品分析） | 🚧 待建 | `scripts/list-from-1688-hot.mjs` |

**关键指标输出：**
- 利润率 / ROI / 盈亏平衡点
- 趋势评分（上升/平稳/下降）
- 竞品价格带分布
- 选品评分（综合推荐度）

---

## 🏪 店铺运营 `modules/store/`

> **适用角色：** 店铺运营、仓库管理员
> **核心问题：** 商品怎么上？订单怎么处理？库存够不够？

### 上新子模块 `modules/store/launch/` ✅ **已完成**

| 文件 | 功能 | 状态 |
|------|------|------|
| `index.mjs` | 上新诊断 + 流程调度 | ✅ 完成 |
| `seo.mjs` | SEO 审计（7项评分）+ 写入 Shopify | ✅ 完成 |
| `geo.mjs` | GEO 内容生成（FAQ/对比段落/规格表/Alt文本） | ✅ 完成 |
| `copywriter.mjs` | 多平台文案 v2（7平台含TikTok） | ✅ 完成 |

> ⚠️ 注：`modules/launch/` 是临时路径，后续迁移至 `modules/store/launch/`

### 其他子模块（待建）

| 文件 | 功能 | 状态 | 底层脚本 |
|------|------|------|---------|
| `index.mjs` | 店铺运营总入口 | 🚧 待建 | — |
| `orders.mjs` | 订单全流程（列表/发货/退款/取消/备注） | 🚧 待建 | `scripts/order-manage.mjs` |
| `inventory.mjs` | 库存 & SKU 管理 | 🚧 待建 | `scripts/sku-manage.mjs` + `scripts/stock-alert.mjs` |
| `promotions.mjs` | 促销 & 折扣码 | 🚧 待建 | `scripts/promotion.mjs` + `scripts/discount-codes.mjs` |
| `catalog.mjs` | 商品目录管理（批量上架/下架/同步） | 🚧 待建 | `scripts/list-product.mjs` + `scripts/bulk-import.mjs` |
| `logistics.mjs` | 物流追踪 & 异常订单 | 🚧 待建 | `scripts/logistics.mjs` |

---

## 📣 内容社媒 `modules/community/`

> **适用角色：** 内容运营、客服
> **核心问题：** 评论怎么用？文案怎么写？客服怎么标准化？

| 文件 | 功能 | 状态 | 底层脚本 |
|------|------|------|---------|
| `index.mjs` | 内容社媒总入口 | 🚧 待建 | — |
| `reviews.mjs` | 评论运营（Judge.me 拉取/分析/差评预警） | 🚧 待建 | Judge.me API |
| `content.mjs` | 社媒文案生成（小红书/抖音/TikTok/微信） | 🚧 待建 | `modules/launch/copywriter.mjs` |
| `faq.mjs` | FAQ 管理（问题沉淀/搜索/导出到 GEO） | 🚧 待建 | `scripts/customer-service.mjs` |
| `service.mjs` | 客服模板库（20类场景模板） | 🚧 待建 | `scripts/customer-service.mjs` |

**Judge.me 集成说明：**
- 需提供 Judge.me Public API Key（店铺后台 → Apps → Judge.me → API）
- 支持：拉取全部评论、差评监控、评论关键词提取、FAQ 反哺

---

## 📊 数据参谋 `modules/analytics/`

> **适用角色：** 老板、数据分析师
> **核心问题：** 今天卖了多少？问题出在哪？下一步怎么做？

| 文件 | 功能 | 状态 | 底层脚本 |
|------|------|------|---------|
| `index.mjs` | 数据参谋总入口 | 🚧 待建 | — |
| `reports.mjs` | 报表统一入口（日/周/月一键调用） | 🚧 待建 | `scripts/daily/weekly/monthly-report.mjs` |
| `insights.mjs` | AI 经营洞察（找问题 + 给建议） | 🚧 待建 | — |
| `benchmarks.mjs` | 横向对比（多店铺 / 同比环比） | 🚧 待建 | `scripts/multi-shop.mjs` |
| `verify.mjs` | 数据核验（脚本输出 vs 后台数据比对） | 🚧 待建 | `scripts/verify.mjs` |

---

## 🔧 基础设施（scripts/ 保持不变）

底层脚本**不动**，模块层是对它们的高层封装。

| 分类 | 脚本 |
|------|------|
| 数据报告 | `daily-report.mjs` `weekly-report.mjs` `monthly-report.mjs` |
| 订单管理 | `order-manage.mjs` `order-notify.mjs` `logistics.mjs` |
| 商品管理 | `list-product.mjs` `bulk-import.mjs` `sku-manage.mjs` |
| 库存营销 | `stock-alert.mjs` `promotion.mjs` `discount-codes.mjs` |
| 选品工具 | `product-research.mjs` `competitor-watch.mjs` `list-from-1688-hot.mjs` |
| 内容文案 | `copywriter.mjs` `customer-service.mjs` |
| 客户管理 | `customers.mjs` |
| 系统工具 | `dashboard-server.mjs` `webhook-server.mjs` `health-check.mjs` `connect-test.mjs` `verify.mjs` |

---

## 📋 开发进度

| 模块 | 完成度 | 剩余工作 |
|------|--------|---------|
| 🔍 选品雷达 | 0% | `index` + `profit` + `trending` + `competitor` + `sourcing` |
| 🏪 店铺运营（上新） | ✅ 100% | — |
| 🏪 店铺运营（其他） | 0% | `orders` + `inventory` + `promotions` + `catalog` + `logistics` |
| 📣 内容社媒 | 0% | `index` + `reviews`(Judge.me) + `content` + `faq` + `service` |
| 📊 数据参谋 | 0% | `index` + `reports` + `insights` + `benchmarks` + `verify` |
| 🔐 审批系统 | ✅ 100% | — |
| 🔗 Connectors | Shopify ✅ WooCommerce ✅ 有赞 ✅ TikTok 🚧 | TikTok 等账号验证 |

---

## 🗓 建议开发顺序

```
Week 1（已完成）：setup v2 + modules/launch + audit system
Week 2（当前）：modules/community → modules/analytics
Week 3：       modules/selection → modules/store（orders/inventory/promotions）
Week 4：       connector/tiktok → 端到端验收 → v2.0 tag
```

---

*最后更新：2026-03-09*
