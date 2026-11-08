// Runs axe-core on every page of public/, in light and dark mode.
// Reduced motion is emulated so the demo animation sits on its final state.
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';

const root = new URL('../public/', import.meta.url).pathname;
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain' };

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  try {
    const body = await readFile(join(root, path.endsWith('/') ? path + 'index.html' : path));
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const pages = (await readdir(root)).filter(f => f.endsWith('.html'));
const browser = await chromium.launch();
let failures = 0;

for (const colorScheme of ['light', 'dark']) {
  for (const width of [1280, 375]) {
    const context = await browser.newContext({ colorScheme, reducedMotion: 'reduce', viewport: { width, height: 900 } });
    const page = await context.newPage();
    for (const file of pages) {
      await page.goto(base + file, { waitUntil: 'networkidle' });
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
      const label = `${file} ${colorScheme} ${width}px`;
      if (!violations.length) { console.log(`ok   ${label}`); continue; }
      failures += violations.length;
      console.log(`FAIL ${label}`);
      for (const v of violations) {
        console.log(`  ${v.id}: ${v.help}`);
        for (const n of v.nodes.slice(0, 5)) console.log(`    ${n.target.join(' ')}  ${n.failureSummary.split('\n').slice(1).join(' ').trim()}`);
        if (v.nodes.length > 5) console.log(`    +${v.nodes.length - 5} more`);
      }
    }
    await context.close();
  }
}

await browser.close();
server.close();
process.exit(failures ? 1 : 0);
