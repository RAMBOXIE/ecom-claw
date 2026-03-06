import https from 'https';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));
const COOKIE = config.ali1688.cookie;

const keyword = 'GaN充电器';
const url = `https://s.1688.com/selloffer/offerlist.htm?keywords=${encodeURIComponent(keyword)}&n=y`;

console.log('请求URL:', url.slice(0, 80) + '...');

const req = https.request(url, {
  headers: {
    'Cookie': COOKIE,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Referer': 'https://www.1688.com/',
  }
}, res => {
  console.log('状态码:', res.statusCode);
  console.log('重定向:', res.headers.location || '(无)');
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    console.log('响应长度:', body.length, 'bytes');
    // alicdn 图片
    const imgs = [...new Set(body.match(/\/\/cbu01\.alicdn\.com\/img\/[^\s"']+\.jpg/gi) || [])];
    console.log('找到 alicdn 图片数:', imgs.length);
    if (imgs.length) imgs.slice(0, 3).forEach(u => console.log('  图片:', u.slice(0, 80)));
    // picUrl 格式
    const picMatches = body.match(/"picUrl":"(\/\/[^"]+\.jpg)"/g) || [];
    console.log('找到 picUrl 格式:', picMatches.length);
    if (picMatches.length) console.log('  示例:', picMatches[0].slice(0, 80));
    // 打印前500字符看内容
    console.log('\n--- 响应前500字符 ---');
    console.log(body.slice(0, 500));
  });
});
req.on('error', e => console.error('错误:', e.message, e.code));
req.end();
