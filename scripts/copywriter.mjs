/**
 * AI 商品文案生成器
 * 电商龙虾 — 根据产品信息生成多平台文案
 *
 * 用法：node copywriter.mjs --name "产品名" --points "卖点1,卖点2" --platform shopify
 * 平台：shopify / taobao / xiaohongshu / douyin / wechat
 */

const args = process.argv.slice(2);
const get = (flag) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
};

const productName = get('--name') || '产品';
const sellingPoints = (get('--points') || '').split(',').filter(Boolean);
const platform = get('--platform') || 'shopify';
const targetAudience = get('--audience') || '普通消费者';
const priceRange = get('--price') || '';

// 各平台文案模板生成
const templates = {
  shopify: (name, points, price) => ({
    title: generateTitle(name, 'seo'),
    description: generateDescription(name, points, 'detailed'),
    metaTitle: generateTitle(name, 'short'),
    metaDescription: `${name} - ${points.slice(0, 2).join('，')}。${price ? '现价 ' + price : ''}`,
  }),

  taobao: (name, points) => ({
    title: generateTitle(name, 'keyword-rich'),
    bulletPoints: points.map(p => `【${p}】`),
    detailPage: generateDescription(name, points, 'detailed'),
    searchKeywords: generateKeywords(name, points),
  }),

  xiaohongshu: (name, points, audience) => ({
    hook: generateXHSHook(name),
    body: generateXHSBody(name, points, audience),
    tags: generateXHSTags(name, points),
  }),

  douyin: (name, points) => ({
    hook: `${name}！${points[0] || '你一定要看看这个'}`,
    script: generateDouyinScript(name, points),
    caption: `${name} ${points.slice(0, 3).join(' ').substring(0, 50)}`,
  }),

  wechat: (name, points, audience) => ({
    title: `${name}：${points[0] || '值得拥有'}`,
    intro: generateDescription(name, points, 'conversational'),
    callToAction: '点击下方链接，限时优惠！',
  }),
};

function generateTitle(name, style) {
  const styles = {
    'seo': `${name} - 优质${name}推荐 | 品质保证`,
    'short': name,
    'keyword-rich': `${name} 正品 高品质 ${name}推荐 好用`,
  };
  return styles[style] || name;
}

function generateDescription(name, points, style) {
  if (style === 'detailed') {
    return [
      `✨ 关于${name}`,
      '',
      points.map(p => `• ${p}`).join('\n'),
      '',
      `无论你是追求品质还是性价比，${name}都是你的理想之选。`,
      `精心设计，用心制造，每一个细节都体现对品质的坚持。`,
    ].join('\n');
  }
  if (style === 'conversational') {
    return `你是不是也在找一款${name}？${points[0] || '这款真的不错'}，${points[1] || '用过的都说好'}。${points.length > 2 ? points[2] : '快来试试！'}`;
  }
  return points.join('，') + '。';
}

function generateKeywords(name, points) {
  return [name, `${name}推荐`, `好用的${name}`, ...points.map(p => p.substring(0, 10))].slice(0, 8).join(' ');
}

function generateXHSHook(name) {
  const hooks = [
    `我买过最值的${name}！`,
    `姐妹们！这个${name}真的绝了`,
    `种草一个月终于入手了这款${name}`,
    `${name}避雷指南 | 这款真的值得买`,
  ];
  return hooks[Math.floor(Math.random() * hooks.length)];
}

function generateXHSBody(name, points, audience) {
  return [
    `作为一个${audience}，我研究${name}研究了很久`,
    '',
    points.map((p, i) => `${['❶', '❷', '❸', '❹', '❺'][i] || '•'} ${p}`).join('\n'),
    '',
    `总结：${name}整体表现很不错，${points[0] || '推荐大家入手'}！`,
    '有问题欢迎评论区问我～',
  ].join('\n');
}

function generateXHSTags(name, points) {
  return [`#${name}`, `#${name}推荐`, '#种草', '#好物分享', '#真实测评']
    .concat(points.slice(0, 2).map(p => `#${p.substring(0, 8)}`))
    .join(' ');
}

function generateDouyinScript(name, points) {
  return [
    `[开场] 今天给大家介绍一款${name}，真的超级好用！`,
    `[展示] ${points[0] || '看这里，这是最大的亮点'}`,
    points[1] ? `[对比] 而且${points[1]}` : '',
    points[2] ? `[加码] 还有一点，${points[2]}` : '',
    `[结尾] 想要的朋友点击下方链接，数量有限，先到先得！`,
  ].filter(Boolean).join('\n');
}

// 主函数
function main() {
  console.log(`\n🦞 电商文案生成 — ${productName}`);
  console.log(`平台：${platform} | 受众：${targetAudience}\n`);

  const generator = templates[platform];
  if (!generator) {
    console.error(`❌ 不支持的平台：${platform}`);
    console.log(`支持的平台：${Object.keys(templates).join(', ')}`);
    process.exit(1);
  }

  const result = generator(productName, sellingPoints, targetAudience, priceRange);

  // 格式化输出
  Object.entries(result).forEach(([key, value]) => {
    console.log(`── ${key} ──`);
    console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
    console.log('');
  });

  process.stdout.write('\n__JSON_OUTPUT__\n' + JSON.stringify({ platform, productName, result }) + '\n');
}

main();
