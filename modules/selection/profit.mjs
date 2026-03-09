/**
 * 🔍 选品雷达 — 利润测算
 * 电商龙虾 modules/selection/profit.mjs
 */

/**
 * 利润测算
 * @param {Object} opts
 * @param {number} opts.cost          进货成本（含包材）
 * @param {number} opts.price         售价
 * @param {number} opts.platformFee   平台佣金比例（默认 5%）
 * @param {number} opts.shipping      平均运费（默认 15 元）
 * @param {number} opts.returnRate    退货率（默认 3%）
 * @param {number} opts.otherCost     其他杂费（默认 0）
 * @returns {Object}
 */
export function calcProfit({
  cost        = 0,
  price       = 0,
  platformFee = 0.05,
  shipping    = 15,
  returnRate  = 0.03,
  otherCost   = 0,
} = {}) {
  if (price <= 0) throw new Error('售价必须大于 0');

  const platformCost  = price * platformFee;                  // 平台抽成
  const returnCost    = (cost + shipping) * returnRate;       // 退货损耗（每单摊）
  const totalCost     = cost + shipping + platformCost + returnCost + otherCost;
  const grossProfit   = price - cost - shipping - platformCost; // 毛利（不含退货摊销）
  const netProfit     = price - totalCost;                    // 净利润
  const margin        = (netProfit / price) * 100;            // 净利润率
  const roi           = cost > 0 ? (netProfit / cost) * 100 : 0; // ROI
  const breakeven     = totalCost / (1 - platformFee);        // 最低盈亏平衡售价

  const rating = margin >= 40 ? '🟢 优秀（≥40%）'
    : margin >= 25 ? '🟢 良好（25-40%）'
    : margin >= 15 ? '🟡 一般（15-25%）'
    : margin >= 0  ? '🔴 偏低（0-15%）'
    : '❌ 亏损';

  return {
    price, cost, platformFee, shipping, returnRate, otherCost,
    platformCost: +platformCost.toFixed(2),
    returnCost:   +returnCost.toFixed(2),
    totalCost:    +totalCost.toFixed(2),
    grossProfit:  +grossProfit.toFixed(2),
    netProfit:    +netProfit.toFixed(2),
    margin:       +margin.toFixed(2),
    roi:          +roi.toFixed(2),
    breakeven:    +breakeven.toFixed(2),
    rating,
  };
}

/**
 * 批量利润对比（不同定价策略）
 * @param {Object} base   基础参数（cost/platformFee/shipping/returnRate）
 * @param {number[]} prices  待测试售价列表
 */
export function comparePrices(base, prices) {
  return prices.map(price => ({
    price,
    ...calcProfit({ ...base, price }),
  }));
}
