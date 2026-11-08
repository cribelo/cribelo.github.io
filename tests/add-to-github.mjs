// The "Add to GitHub" form must open GitHub's new-file editor with a workflow
// that runs as is: the right path, the right branch, and the YAML of the page.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { strict as assert } from 'node:assert';
import { chromium } from 'playwright';

const html = await readFile(new URL('../public/index.html', import.meta.url));
const server = createServer((req, res) => {
  if (req.url === '/' ) return res.writeHead(200, { 'content-type': 'text/html' }).end(html);
  res.writeHead(404).end();
}).listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const cors = { 'access-control-allow-origin': '*' };
const browser = await chromium.launch();
const context = await browser.newContext({ reducedMotion: 'reduce' });
// Nothing leaves the machine: the GitHub API is answered here, the rest is cut.
// Playwright tries the last route first, so the catch-all goes in first.
await context.route(/^https:\/\//, route => route.abort());
await context.route('https://api.github.com/**', route => {
  const known = { '/repos/acme/app': 'trunk' }[new URL(route.request().url()).pathname];
  return known
    ? route.fulfill({ headers: cors, json: { default_branch: known } })
    : route.fulfill({ status: 404, headers: cors, json: { message: 'Not Found' } });
});
const page = await context.newPage();
await page.addInitScript(() => { window.__opened = []; window.open = url => { window.__opened.push(url); return null; }; });
await page.goto(base);

async function submit(repo, button = 'Add to GitHub') {
  await page.fill('#repo', repo);
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: button }).click();
  return page.evaluate(() => window.__opened.pop());
}
function parse(url) {
  const u = new URL(url);
  return { path: u.pathname, filename: u.searchParams.get('filename'), value: u.searchParams.get('value') };
}

let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };

// Default branch read from the API, URL pasted in full.
let r = parse(await submit('https://github.com/acme/app.git'));
ok(r.path === '/acme/app/new/trunk', `branch from the API, got ${r.path}`);
ok(r.filename === '.github/workflows/cribelo.yml', `filename, got ${r.filename}`);
const shown = await page.textContent('.one pre');
ok(r.value === shown + '\n', 'value is the workflow shown on the page');
for (const line of ['name: cribelo', 'on: pull_request', 'pull-requests: write', 'fetch-depth: 0', 'uses: cribelo/cribelo@v2'])
  ok(r.value.includes(line), `workflow holds "${line}"`);

// Private or unknown repository: the API says 404, the branch field is kept.
await page.fill('#branch', 'main');
await page.reload();
r = parse(await submit('acme/private'));
ok(r.path === '/acme/private/new/main', `fallback to main, got ${r.path}`);

// A branch typed by hand wins over the API.
await page.reload();
await page.fill('#branch', 'release/2.x');
r = parse(await submit('acme/app'));
ok(r.path === '/acme/app/new/release/2.x', `typed branch kept, got ${r.path}`);

// The fork comment workflow, triggered by the name of the first one.
await page.reload();
r = parse(await submit('acme/app', 'add the second workflow'));
ok(r.filename === '.github/workflows/cribelo-comment.yml', `comment filename, got ${r.filename}`);
ok(r.value.includes('workflows: [cribelo]') && r.value.includes('uses: cribelo/cribelo/comment@v2') && r.value.includes('actions: read'), 'comment workflow content');

// Garbage is refused, nothing opens.
await page.reload();
await page.fill('#repo', 'not a repo');
await page.getByRole('button', { name: 'Add to GitHub' }).click();
ok((await page.evaluate(() => window.__opened.length)) === 0, 'invalid repository opens nothing');

// The GitLab popin opens, shows the include line, and closes on Escape.
await page.reload();
const opener = page.getByRole('button', { name: 'One line in .gitlab-ci.yml' });
await opener.click();
const dialog = page.getByRole('dialog', { name: 'Cribelo on GitLab' });
ok(await dialog.isVisible(), 'GitLab popin opens');
ok((await dialog.locator('pre').textContent()).includes('remote: https://raw.githubusercontent.com/cribelo/cribelo/v2/ci/gitlab-ci.yml'), 'popin holds the include line');
await page.keyboard.press('Escape');
ok(!(await dialog.isVisible()), 'Escape closes the popin');
ok(await opener.evaluate(b => document.activeElement === b), 'focus returns to the opener');
await opener.click();
await dialog.getByRole('button', { name: 'Close' }).click();
ok(!(await dialog.isVisible()), 'the close button closes the popin');

console.log(`ok   add-to-github, ${checks} checks`);
await browser.close();
server.close();
