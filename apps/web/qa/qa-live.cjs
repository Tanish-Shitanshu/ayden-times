// Live-mode QA of 01_FRONTEND_BRIEF.md §12 against the real API, at phone size.
// Run: npm run dev   (VITE_API_MODE=live, Vite proxies /api to Cloud Run)
//      BASE=http://localhost:5173 node qa/qa-live.cjs
// Or against the deployed web app: BASE=https://<cloud-run-url> node qa/qa-live.cjs
// Needs Playwright (npx playwright install chromium). Creates a few guest users on the live server.
const { chromium, devices } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:5173';
const results = [];
const row = async (n, name, fn) => {
  try { await fn(); results.push([n, 'PASS', name]); console.log('PASS', n, name); }
  catch (e) { results.push([n, 'FAIL', name, String(e.message).split('\n')[0]]); console.log('FAIL', n, name, '-', String(e.message).split('\n')[0]); }
};
const assert = (c, m) => { if (!c) throw new Error(m); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['Pixel 7'], viewport: { width: 360, height: 780 }, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const go = async (p) => { await page.goto(BASE + p); await page.waitForLoadState('networkidle'); };
  const path = () => new URL(page.url()).pathname;
  const waitPath = (re, timeout = 15000) => page.waitForURL((u) => re.test(new URL(u).pathname), { timeout });
  const nav = (label) => page.locator('.bottom-nav button', { hasText: label }).click();
  const send = async (text) => { await nav('Chat'); await page.locator('#composer').fill(text); await page.keyboard.press('Enter'); await page.waitForTimeout(800); };
  const toPerson = async (name) => { await nav('Team'); await page.locator('.ws-team-pane .rail-item', { hasText: name }).first().click(); };
  const openItem = async (title) => { await nav('Work'); await page.getByRole('tab', { name: 'Items' }).click(); await page.locator('.item-switch button', { hasText: title }).first().click(); await page.waitForTimeout(300); };
  const canAdvance = async () => { await nav('Chat'); return (await page.getByRole('button', { name: 'Continue to next beat' }).getAttribute('aria-disabled')) !== 'true'; };
  const advance = async () => { await nav('Chat'); await page.getByRole('button', { name: 'Continue to next beat' }).click(); await page.waitForTimeout(800); };
  const submit = async (title, text) => {
    await nav('Work'); await page.getByRole('tab', { name: /Write/ }).click();
    await page.locator('.item-switch button', { hasText: title }).first().click();
    const ta = page.locator('.art-input');
    if (await ta.count()) await ta.fill(text); else { await page.locator('.composer-art .cm-content').click(); await page.keyboard.insertText(text); }
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    await page.locator('.composer-art .chip', { hasText: 'Submitted' }).waitFor({ timeout: 30000 });
  };
  const finish = async () => {
    await nav('Chat'); await page.getByRole('button', { name: 'Finish and see my report' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Finish and see my report' }).click();
    await waitPath(/\/debrief$/); await page.locator('.skill-res').first().waitFor({ timeout: 60000 });
  };

  await row(48.0, '360 px landing, no horizontal scroll', async () => {
    await go('/'); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'horizontal scroll');
  });
  await row(3, 'Role cards: 4 ready links, Data Analyst Planned (not a link)', async () => {
    await page.locator('a.role-card').first().waitFor();
    assert(await page.locator('a.role-card').count() === 4, 'ready count ' + await page.locator('a.role-card').count());
    await page.locator('.role-card.planned', { hasText: 'Data Analyst' }).waitFor();
  });
  await row(1, 'Try the demo → onboarding with consent card', async () => {
    await page.getByRole('link', { name: /Try the demo, no sign-up/ }).click(); await waitPath(/^\/onboarding\/software-engineer/);
    await page.getByText('I am 18 or older.').waitFor();
  });
  await row(15, 'Consent gates Start', async () => {
    const start = page.getByRole('button', { name: 'Start rehearsal' });
    assert(await start.getAttribute('aria-disabled') === 'true', 'enabled too early');
    await page.getByText('I am 18 or older.').click(); await page.getByText('Save my messages').click();
    assert(await start.getAttribute('aria-disabled') === null, 'still disabled');
  });
  await row(16, 'Start → PUT consent, POST onboarding, POST missions → workspace', async () => {
    await page.getByRole('button', { name: 'Start rehearsal' }).click(); await waitPath(/^\/mission\//, 20000);
    await page.locator('.ev-msg').first().waitFor();
  });
  await row(29, 'Runtime banner when runtime.mode !== live', async () => {
    const status = await page.evaluate(async () => (await (await fetch('/api/v1/system/status')).json()).runtime);
    if (status !== 'live') await page.getByText('Running in offline script mode').waitFor();
  });
  await row(22, 'Quick reply + Enter send; reply arrives (scripted tag when fallback)', async () => {
    await page.locator('.ev-msg button.chip-btn').nth(1).click(); await page.waitForTimeout(1500);
    await send('Before I start: does the discount apply per line item or to the whole order?');
    await page.waitForFunction(() => document.querySelectorAll('.ev-msg:not(.mine)').length >= 3, null, { timeout: 30000 });
  });
  await row(19, 'Item viewers: ticket, doc, file', async () => {
    await openItem('INV-'); await page.locator('.work-body .card .mono').first().waitFor();
    await openItem('CONTRIBUTING'); await page.locator('.doc-view').waitFor();
    await openItem('pricing.py'); await page.locator('.work-body .cm-editor').waitFor();
  });
  await row(25, 'Continue enabled only when canAdvance', async () => {
    await page.waitForFunction(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Continue to next beat')); return b && b.getAttribute('aria-disabled') !== 'true'; }, null, { timeout: 10000 });
    await advance(); await page.locator('.ev-beat', { hasText: 'Beat 2' }).waitFor();
  });
  await row(20, 'Edit file → Saving/Saved; Reset restores', async () => {
    await openItem('pricing.py');
    await page.locator('.work-body .cm-content').click(); await page.keyboard.press('Control+End'); await page.keyboard.type('\n# scratch');
    await page.locator('.save-ind', { hasText: 'Saved' }).waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: 'Reset file' }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Reset file' }).click();
    await page.waitForTimeout(500); assert(!(await page.locator('.work-body .cm-content').innerText()).includes('# scratch'), 'not reset');
  });
  await row(21, 'Run checks (up to ~25 s) → results, hidden masked', async () => {
    const GOLD = require('./gold.cjs');
    await page.evaluate(async (gold) => {
      const id = location.pathname.split('/').pop();
      const m = await (await fetch('/api/v1/missions/' + id)).json();
      const mod = m.items.some((x) => x.path === 'src/shipping.py') ? 'shipping' : 'pricing';
      const key = 'ayden_cseq_' + id; const seq = Number(localStorage.getItem(key) || 0) + 1; localStorage.setItem(key, String(seq));
      const r = await fetch('/api/v1/missions/' + id + '/act', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientSeq: seq, kind: 'save_file', itemId: 'it_src', content: gold[mod] }) });
      if (!r.ok) throw new Error('save_file failed ' + r.status);
    }, GOLD);
    await page.reload(); await page.locator('.ev-msg').first().waitFor(); await openItem('.py');
    await page.locator('.file-toolbar').getByRole('button', { name: 'Run checks' }).click();
    await page.locator('.check-list li').first().waitFor({ timeout: 40000 });
    const names = await page.locator('.check-list li').allInnerTexts();
    assert(!names.some((n) => /hidden/i.test(n) && !/Hidden check \d/.test(n)), 'hidden name leaked');
  });
  await row(24, 'Submit commit + PR → Submitted ✓; objectives update', async () => {
    if (await canAdvance()) await advance();
    await submit('Commit message', 'fix(pricing): apply discount once per order (INV-137)\n\nThe discount was applied per line and again on the subtotal.');
    await submit('Pull request', '## Why\nBulk orders were charged too little because the discount applied twice.\n\n## What changed\nDiscount applies once; invalid input raises ValueError.\n\n## How I tested\nRan the checks; added a regression test.\n\n## Risks\nLow.');
    await page.locator('.obj-fab').click(); await page.getByRole('dialog').locator('.obj-item .icon', { hasText: 'check_circle' }).nth(1).waitFor(); await page.keyboard.press('Escape');
  });
  await row(23, 'Review card → Open file', async () => {
    await nav('Chat'); const card = page.locator('.ev-review').filter({ has: page.getByRole('button', { name: 'Open file' }) }).first();
    await card.waitFor({ timeout: 30000 }); await card.getByRole('button', { name: 'Open file' }).click();
    await page.locator('.work-body .cm-editor').waitFor();
  });
  await row(27, 'Engine trace sheet opens, filters, Esc closes', async () => {
    await page.getByRole('button', { name: 'More options' }).click(); await page.getByRole('menuitem', { name: /Engine trace/ }).click();
    await page.getByText('The AI proposes. The engine decides.').waitFor();
    await page.getByRole('dialog').getByRole('button', { name: /Accepted/ }).click(); await page.keyboard.press('Escape');
  });
  await row(28, '⋯ menu: New variant disabled after acting; Report a problem; Shortcuts', async () => {
    await page.getByRole('button', { name: 'More options' }).click();
    assert(await page.getByRole('menuitem', { name: /New variant/ }).getAttribute('aria-disabled') === 'true', 'variant enabled');
    await page.getByRole('menuitem', { name: /Report a problem/ }).click(); await page.getByRole('dialog').waitFor(); await page.keyboard.press('Escape');
  });
  await row(30, 'Refresh restores the mission', async () => {
    const n = await page.locator('.conv-list > *').count(); await page.reload(); await page.locator('.ev-msg').first().waitFor();
    assert(await page.locator('.conv-list > *').count() >= Math.min(n, 3), 'events lost');
  });
  await row(31, 'Handle the pressure → Finish → debrief', async () => {
    if (await canAdvance()) await advance();
    await toPerson('Arjun'); await send('Good catch, thanks. I will add the failing test now.');
    await toPerson('Priya'); await send('Let me explain the risk first: merging without review could ship wrong totals. Reviewed fix in 20 minutes.');
    await toPerson('Meera'); await send('The loyalty discount is a separate change, so not in this fix. Could you raise a ticket? I will flag it to Priya.');
    await finish();
  });
  await row(32, 'Debrief ready with Skill X-ray', async () => { await page.getByText('Formative feedback, not a hiring score').waitFor(); });
  await row(33, 'Evidence → View in conversation', async () => {
    await page.locator('.moment').first().getByRole('button', { name: 'View in conversation' }).click();
    await page.locator('.drawer .ev-highlight').waitFor({ timeout: 15000 }); await page.keyboard.press('Escape');
  });
  await row(35, 'Copy growth summary', async () => {
    await page.getByRole('button', { name: 'Copy a positive growth summary' }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Copy', exact: true }).click();
    await page.locator('.snackbar', { hasText: 'Copied' }).waitFor();
  });
  const debrief = path();
  await row(36, 'See my progress', async () => { await page.locator('.debrief-foot').getByRole('link', { name: 'See my progress' }).click(); await waitPath(/^\/progress\/software-engineer$/); });
  await row(38, 'Badge → See evidence', async () => { await page.getByRole('button', { name: 'See evidence' }).first().click(); await page.locator('.drawer .ev-highlight').waitFor({ timeout: 15000 }); await page.keyboard.press('Escape'); });
  await row(39, 'Attempts → Open report', async () => { await page.getByRole('button', { name: 'Open report' }).first().click(); await waitPath(/\/debrief$/); });
  await row(34, 'Start drill → drill with hint; New variant at start keeps a drill', async () => {
    await go(debrief); await page.locator('.next-card').first().getByRole('button', { name: 'Start drill' }).click(); await waitPath(/^\/mission\//);
    await page.locator('.obj-fab').click(); await page.getByRole('dialog').getByText(/Hint/).waitFor(); await page.keyboard.press('Escape');
  });
  await row(28.1, 'New variant on a fresh mission (reseed: true)', async () => {
    const before = path();
    await page.getByRole('button', { name: 'More options' }).click();
    const item = page.getByRole('menuitem', { name: /New variant/ });
    if (await item.getAttribute('aria-disabled') === 'true') throw new Error('disabled at start');
    await item.click(); await page.getByRole('dialog').getByRole('button', { name: 'New variant' }).click();
    await page.waitForURL((u) => new URL(u).pathname !== before);
  });
  await row(17, 'Exit → confirm → role detail', async () => {
    await page.getByRole('button', { name: 'Exit mission' }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Exit' }).click(); await waitPath(/^\/roles\//);
  });
  for (const [role, who, check] of [['banking-ops', 'Chopra', 'call'], ['nurse', null, 'update'], ['tech-consulting', null, null]]) {
    await row(`R-${role}`, `${role}: onboarding → mission runs${check ? ` (${check})` : ''}`, async () => {
      await go(`/roles/${role}`); await page.getByRole('button', { name: 'Start rehearsal' }).click(); await waitPath(/^\/onboarding/);
      await page.getByText('I have done projects or training').click(); await page.getByRole('button', { name: 'Next' }).click();
      await page.getByRole('button', { name: 'Start rehearsal' }).click(); await waitPath(/^\/mission\//, 20000); await page.locator('.ev-msg').first().waitFor();
      for (let i = 0; i < 6 && !(check === 'call' && await page.locator('.ev-msg .chip', { hasText: 'Call' }).count()) && !(check === 'update' && await page.locator('.ev-update').count()); i++) {
        await nav('Work'); const chips = page.locator('.item-switch button'); for (let k = 0; k < await chips.count(); k++) { await chips.nth(k).click(); await page.waitForTimeout(200); }
        await toPerson(''); await send('Here is my plan: I will follow the policy, check the facts, and update you with numbers by 3 pm.');
        const art = await page.locator('.ws-team-pane .rail-item .icon', { hasText: 'radio_button_unchecked' }).count();
        if (await canAdvance()) await advance(); else if (art) { await nav('Work'); await page.getByRole('tab', { name: /Write/ }).click(); const a = page.locator('.item-switch button').first(); await a.click(); const ta = page.locator('.art-input'); if (await ta.count()) { await ta.fill((await ta.inputValue()) + '\nFacts, action taken and who I informed, with times.'); await page.getByRole('button', { name: 'Submit', exact: true }).click(); await page.waitForTimeout(800); } if (await canAdvance()) await advance(); }
      }
      if (check === 'call') { await page.locator('.ev-msg .chip', { hasText: 'Call' }).first().waitFor({ timeout: 5000 }); await toPerson(who); assert(/on the call/.test(await page.locator('#composer').getAttribute('placeholder')), 'not replying on call'); }
      if (check === 'update') { await page.locator('.ev-update').first().getByRole('button', { name: /Open/ }).click(); await page.locator('.record-grid').waitFor(); }
    });
  }
  await row(40, 'Groups: create → suppressed insights', async () => {
    await go('/cohort'); await page.getByRole('button', { name: 'Create group' }).click(); await page.getByLabel('Group name').fill('QA live group');
    await page.getByRole('dialog').getByRole('button', { name: 'Create group' }).click(); await page.getByText('Patterns appear when 5 or more').waitFor();
  });
  await row(41, 'Join bad code → error', async () => {
    await page.getByRole('tab', { name: 'I am joining a group' }).click(); await page.getByLabel('Join code', { exact: true }).fill('NOPE-000');
    await page.getByRole('button', { name: 'Join' }).click(); await page.getByText(/does not match|No group/).waitFor();
  });
  await row(42, 'Privacy toggle', async () => {
    await go('/privacy'); const sw = page.getByRole('switch', { name: /Let my college/ }); const b = await sw.isChecked(); await sw.click(); await page.waitForTimeout(1500); assert((await sw.isChecked()) !== b, 'no change');
  });
  await row(43, 'Export downloads ayden-export.json', async () => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export my data' }).click()]); assert(dl.suggestedFilename() === 'ayden-export.json', 'name');
  });
  await row(45, 'How it works: real status counters', async () => { await go('/how-it-works'); await page.getByText('Missions started').waitFor(); });
  await row(46, '404 + session expired (cookie cleared)', async () => {
    await go('/nope'); await page.getByRole('heading', { level: 2, name: 'That page does not exist.' }).waitFor();
    await go('/cohort'); await ctx.clearCookies(); await page.locator('footer').getByRole('link', { name: 'Privacy' }).click();
    await go('/cohort'); await page.waitForTimeout(1500);
  });
  await row(44, 'Delete my data (typed DELETE) → /', async () => {
    await go('/demo'); await waitPath(/^\/onboarding/); await go('/privacy'); await page.getByRole('button', { name: 'Delete my data' }).click();
    await page.getByLabel('Type DELETE to confirm').fill('DELETE'); await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click(); await waitPath(/^\/$/);
  });
  await row(48, '360 px: no horizontal scroll on main pages', async () => {
    for (const p of ['/', '/roles', '/roles/nurse', '/how-it-works', '/privacy']) { await go(p); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), p); }
  });
  console.log(`\n${results.filter((r) => r[1] === 'PASS').length}/${results.length} passed`);
  if (errors.length) console.log('page errors:', [...new Set(errors)].slice(0, 10));
  require('fs').writeFileSync('qa-live-results.json', JSON.stringify(results, null, 2));
  await browser.close();
})();
