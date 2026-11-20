// QA click-through of 01_FRONTEND_BRIEF.md §12 against the mock build.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:5173';
const results = [];
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function row(n, name, fn) {
  const t0 = Date.now();
  try { await fn(); results.push({ n, name, ok: true }); console.log(`PASS ${n} ${name} (${Date.now() - t0}ms)`); }
  catch (e) { results.push({ n, name, ok: false, err: String(e.message || e).split('\n')[0] }); console.log(`FAIL ${n} ${name}: ${String(e.message || e).split('\n').slice(0, 3).join(' | ')}`); }
}
function assert(c, msg) { if (!c) throw new Error(msg); }

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const go = async (p) => { await page.goto(BASE + p); await page.waitForLoadState('networkidle'); };
  const setMock = async (o) => page.evaluate((o) => { const s = JSON.parse(localStorage.getItem('ayden_mock_settings') || '{}'); localStorage.setItem('ayden_mock_settings', JSON.stringify({ ...s, ...o })); }, o);
  const url = () => new URL(page.url()).pathname;
  const waitPath = async (re, ms = 8000) => { await page.waitForURL((u) => re.test(new URL(u).pathname), { timeout: ms }); };

  await go('/');
  await page.evaluate(() => localStorage.clear());
  await setMock({ latency: false });
  await go('/');

  await row(1, 'Landing: Try the demo', async () => {
    await page.getByRole('link', { name: /Try the demo, no sign-up/ }).click();
    await waitPath(/^\/onboarding\/software-engineer/);
    await page.getByText('I am 18 or older.').waitFor();
  });
  await row(2, 'Landing: See how it works', async () => {
    await go('/'); await page.getByRole('link', { name: 'See how it works' }).click(); await waitPath(/^\/how-it-works/);
  });
  await row(3, 'Landing: ready role cards link; planned not clickable', async () => {
    await go('/'); await page.locator('a.role-card').first().click(); await waitPath(/^\/roles\/software-engineer$/);
    await setMock({ dataPlanned: true }); await go('/');
    await page.locator('.role-card.planned').waitFor();
    assert(await page.locator('.role-card.planned').evaluate((e) => e.tagName) === 'DIV', 'planned card is a link');
    assert((await page.locator('a.role-card').count()) === 4, 'expected 4 clickable');
    await setMock({ dataPlanned: false });
  });
  await row(4, 'Header nav routes + active state', async () => {
    await go('/');
    for (const [name, path] of [['Roles', '/roles'], ['My progress', '/progress'], ['How it works', '/how-it-works'], ['Privacy', '/privacy']]) {
      await page.locator('.main-nav').getByRole('link', { name }).click(); await waitPath(new RegExp('^' + path));
      await page.locator('.main-nav a[aria-current="page"]', { hasText: name }).waitFor({ timeout: 3000 });
    }
  });
  await row(5, 'EN/हिं toggle switches chrome and persists', async () => {
    await go('/roles'); await page.locator('.topbar .lang-toggle button', { hasText: 'हिं' }).click();
    await page.locator('.main-nav').getByText('भूमिकाएँ').waitFor();
    await page.reload(); await page.locator('.main-nav').getByText('भूमिकाएँ').waitFor();
    assert(await page.evaluate(() => document.documentElement.lang) === 'hi', 'html lang');
    await page.locator('.topbar .lang-toggle button', { hasText: 'EN' }).click(); await page.locator('.main-nav').getByText('Roles').waitFor();
  });
  await row(6, 'Light theme only: stays light even when the OS prefers dark', async () => {
    await page.emulateMedia({ colorScheme: 'dark' }); await page.reload();
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert(bg === 'rgb(255, 255, 255)', 'background ' + bg);
    assert(await page.locator('.topbar').getByRole('button', { name: /^Theme/ }).count() === 0, 'theme toggle still present');
    await page.emulateMedia({ colorScheme: 'light' });
  });
  await row(7, 'Account menu: Edit name → PATCH /me', async () => {
    await go('/roles');
    await page.locator('.account-chip').click(); await page.getByRole('menuitem', { name: /Edit name/ }).click();
    await page.getByLabel('Display name').fill('Mohit QA'); await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    await page.locator('.account-chip', { hasText: 'Mohit QA' }).waitFor();
  });
  await row(9, 'Roles: Start on a card → role detail', async () => {
    await go('/roles'); await page.locator('a.role-card', { hasText: 'Banking' }).click(); await waitPath(/^\/roles\/banking-ops$/);
  });
  await row(10, 'Role detail: back → /roles', async () => {
    await page.getByRole('link', { name: 'Roles' }).first().click(); await waitPath(/^\/roles$/);
  });
  await row(11, 'Role detail tabs: click + arrow keys', async () => {
    await go('/roles/software-engineer');
    await page.getByRole('tab', { name: 'Skills' }).click(); await page.getByText('What we look for').first().waitFor();
    await page.keyboard.press('ArrowRight');
    assert(await page.getByRole('tab', { name: 'Your team' }).getAttribute('aria-selected') === 'true', 'arrow');
    await page.getByText('Arjun Rao').waitFor();
    await page.keyboard.press('ArrowRight'); await page.locator('.timeline').waitFor();
  });
  await row(12, 'Role detail: Full day disabled + Planned', async () => {
    const f = page.locator('.mode-opt.disabled'); assert(await f.getAttribute('aria-disabled') === 'true', 'aria-disabled'); await f.getByText('Planned').waitFor();
  });
  await row(13, 'Role detail: Start rehearsal → onboarding (no setup yet)', async () => {
    await page.getByRole('button', { name: 'Start rehearsal' }).click(); await waitPath(/^\/onboarding\/software-engineer/);
  });
  await row(14, 'Onboarding: Back/Next per step; step 1 Back → role', async () => {
    await page.getByText('I have done projects or training').click();
    await page.getByRole('button', { name: 'Next' }).click(); await page.getByText('How confident are you?').waitFor();
    await page.getByRole('slider').first().focus(); await page.keyboard.press('ArrowRight');
    await page.getByRole('button', { name: 'Next' }).click(); await page.getByText('Before you start').waitFor();
    await page.getByRole('button', { name: 'Back' }).click(); await page.getByText('How confident are you?').waitFor();
    await page.getByRole('button', { name: 'Back' }).click(); await page.getByText('Your experience with this role').waitFor();
    await page.getByRole('button', { name: 'Back' }).click(); await waitPath(/^\/roles\/software-engineer$/);
  });
  await row(15, 'Onboarding: Start disabled until required boxes', async () => {
    await go('/onboarding/software-engineer?demo=1');
    const start = page.getByRole('button', { name: 'Start rehearsal' });
    assert(await start.getAttribute('aria-disabled') === 'true', 'should be disabled');
    await page.getByText('I am 18 or older.').click();
    assert(await start.getAttribute('aria-disabled') === 'true', 'still disabled after one');
    await page.getByText('Save my messages and work').click();
    assert(await start.getAttribute('aria-disabled') === null, 'enabled');
  });
  await row(16, 'Onboarding: Start → consent + onboarding + mission', async () => {
    await page.getByRole('button', { name: 'Start rehearsal' }).click(); await waitPath(/^\/mission\/m_/, 10000);
    await page.locator('.ev-msg').first().waitFor();
  });
  const missionPath = url();

  await row(17, 'Workspace: Exit confirm (Resume stays, Exit → role)', async () => {
    await page.getByRole('button', { name: 'Exit mission' }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Resume' }).click();
    assert(url() === missionPath, 'resume left page');
    await page.getByRole('button', { name: 'Exit mission' }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Exit' }).click();
    await waitPath(/^\/roles\/software-engineer$/);
    await page.getByRole('button', { name: 'Resume mission' }).click(); await waitPath(/^\/mission\//);
    await page.locator('.ev-msg').first().waitFor();
  });
  await row(13.1, 'Role detail: Resume shown when unfinished mission exists', async () => { /* exercised in 17 */ });
  await row(22, 'Workspace: send message via Enter, button and quick reply; reply arrives', async () => {
    const before = await page.locator('.ev-msg').count();
    await page.locator('.ev-msg button.chip-btn', { hasText: 'Can I ask a few questions first?' }).click();
    await page.waitForFunction((b) => document.querySelectorAll('.ev-msg').length >= b + 2, before, { timeout: 8000 });
    await page.locator('#composer').fill('Does the discount apply per line item or to the whole order?');
    await page.keyboard.press('Enter');
    await page.locator('.ev-msg.mine', { hasText: 'whole order?' }).waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('.ev-msg:not(.mine)')].some((e) => e.textContent.includes('Whole order, once')), null, { timeout: 8000 });
    await page.locator('#composer').fill('When do you need it by?');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.waitForFunction(() => [...document.querySelectorAll('.ev-msg')].some((e) => e.textContent.includes('Friday at 4 PM')), null, { timeout: 8000 });
  });
  await row(18, 'Workspace: click each person; unread clears', async () => {
    for (const n of ['Arjun Rao', 'Neha Shah', 'Rohan Mehta', 'Priya Nair']) {
      await page.locator('.ws-rail .rail-item', { hasText: n }).click();
      await page.locator('.conv-head', { hasText: n }).waitFor();
    }
    await setMock({ slowModel: true });
    await page.locator('.ws-rail .rail-item', { hasText: 'Rohan Mehta' }).click();
    await page.locator('#composer').fill('Where should I start looking?'); await page.keyboard.press('Enter');
    await page.locator('.typing').waitFor();
    await setMock({ slowModel: false });
    await page.locator('.ws-rail .rail-item', { hasText: 'Priya Nair' }).click();
    // Rohan's reply lands while another thread is open → unread dot
    await page.waitForSelector('.ws-rail .rail-item:has-text("Rohan Mehta") .unread-dot', { timeout: 14000 });
    await page.locator('.ws-rail .rail-item', { hasText: 'Rohan Mehta' }).click();
    await page.waitForTimeout(300);
    assert(await page.locator('.ws-rail .rail-item:has-text("Rohan Mehta") .unread-dot').count() === 0, 'unread not cleared');
  });
  await row(19, 'Workspace: item viewers (ticket/doc/file/table)', async () => {
    const open = (t) => page.locator('.ws-rail .rail-item', { hasText: t }).click();
    await open('INV-'); await page.locator('.work-body .card .mono', { hasText: 'INV-' }).waitFor();
    await open('CONTRIBUTING.md'); await page.locator('.doc-view .prose h1').waitFor();
    await open('Refund requests'); await page.locator('.work-body table.data-table').waitFor();
    await page.locator('.ws-rail .rail-item[title="pricing.py"]').click(); await page.locator('.work-body .cm-editor').waitFor();
  });
  await row(20, 'Workspace: edit file autosaves; Reset restores', async () => {
    await page.locator('.work-body .cm-content').click();
    await page.keyboard.press('Control+End'); await page.keyboard.type('\n# scratch');
    await page.locator('.save-ind', { hasText: 'Saved' }).waitFor({ timeout: 6000 });
    await page.getByRole('button', { name: 'Reset file' }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Reset file' }).click();
    await page.waitForTimeout(400);
    assert(!(await page.locator('.work-body .cm-content').innerText()).includes('# scratch'), 'not reset');
  });
  await row(25, 'Workspace: Continue disabled with reason until canAdvance', async () => {
    const c = page.getByRole('button', { name: 'Continue to next beat' });
    // beat 1 needs ticket opened + a message: both done → enabled
    await page.waitForFunction(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Continue to next beat')); return b && !b.getAttribute('aria-disabled'); }, null, { timeout: 5000 });
    await c.click(); await page.locator('.beat-title', { hasText: 'Beat 2 of 4' }).waitFor();
    assert(await c.getAttribute('aria-disabled') === 'true', 'should be disabled in beat 2 before checks');
    assert((await page.locator('.prog-help').innerText()).includes('Fix the double discount'), 'reason not shown');
  });
  await row(21, 'Workspace: Run checks → results + Checks tab, hidden masked', async () => {
    await page.locator('.ws-rail .rail-item[title="pricing.py"]').click();
    // fix the bug: remove the discount from line_total
    await page.evaluate(() => { const v = document.querySelector('.work-body .cm-content').cmView?.view; return !!v; });
    await page.locator('.work-body .cm-content').click();
    await page.keyboard.press('Control+a'); await page.keyboard.press('Delete');
    const code = 'VOLUME_THRESHOLD = 10\n\ndef line_total(price, quantity, discount_rate):\nif quantity <= 0:\nraise ValueError("quantity must be positive")\nreturn price * quantity\n\n\ndef total(items, discount_rate):\namount = 0\nfor item in items:\namount += line_total(item["price"], item["quantity"], discount_rate)\n\nif sum(item["quantity"] for item in items) >= VOLUME_THRESHOLD:\namount = amount * (1 - discount_rate)\n\nreturn round(amount, 2)\n';
    await page.keyboard.insertText(code);
    await page.locator('.file-toolbar').getByRole('button', { name: 'Run checks' }).click();
    await page.getByText('Running in a Google-hosted sandbox').waitFor();
    await page.locator('.check-list li').first().waitFor({ timeout: 10000 });
    await page.locator('.check-list', { hasText: 'Hidden check 1' }).waitFor();
    await page.locator('.ev-checks').first().waitFor();
  });
  await row(23.0, 'Workspace: advance to beat 3', async () => {
    await page.getByRole('button', { name: 'Continue to next beat' }).click(); await page.locator('.beat-title', { hasText: 'Beat 3 of 4' }).waitFor();
  });
  await row(24, 'Workspace: Submit artifacts → read-only ✓ and objectives update', async () => {
    await page.locator('.ws-rail .rail-item', { hasText: 'Commit message' }).click();
    await page.locator('.art-input').fill('fix(pricing): apply volume discount once per order (INV-142)\n\nThe discount was applied per line and again on the order total.');
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    await page.locator('.composer-art .chip', { hasText: 'Submitted' }).waitFor();
    await page.locator('.art-submitted').waitFor();
    await page.locator('.item-switch button', { hasText: 'Pull request description' }).click();
    await page.locator('.art-input').fill('## Why\nCustomers on bulk orders were charged the volume discount twice, finance is refunding them.\n\n## What changed\nline_total no longer discounts.\n\n## How I tested\nRan the checks in the sandbox, all visible tests pass.\n\n## Risks\nLow.');
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    await page.locator('.composer-art .chip', { hasText: 'Submitted' }).waitFor();
    await page.getByRole('button', { name: 'Objectives' }).click();
    assert(await page.locator('.popover .obj-item .icon', { hasText: 'check_circle' }).count() === 2, 'checklist not updated');
    await page.keyboard.press('Escape');
  });
  await row(26, 'Workspace: Objectives popover shows objective', async () => {
    await page.getByRole('button', { name: 'Objectives' }).click();
    await page.locator('.popover', { hasText: 'Write the commit message' }).waitFor();
    await page.keyboard.press('Escape'); await page.waitForTimeout(100);
    assert(await page.locator('.popover').count() === 0, 'popover not closed');
  });
  await row(23, 'Workspace: review card → Open file at line', async () => {
    await page.locator('.ws-rail .rail-item', { hasText: 'Arjun Rao' }).click();
    await page.locator('.ev-review').first().waitFor({ timeout: 10000 });
    await page.locator('.ev-review').first().getByRole('button', { name: 'Open file' }).click();
    await page.locator('.work-body .cm-editor').waitFor();
    await page.waitForTimeout(300);
    const sel = await page.evaluate(() => window.getSelection()?.toString() ?? '');
    assert(sel.length > 0, 'line not selected');
  });
  await row(27, 'Workspace: Engine trace opens, filters, Esc closes', async () => {
    // two messages to Priya create a rejected proposal entry
    await page.locator('.ws-rail .rail-item', { hasText: 'Priya Nair' }).click();
    await page.locator('#composer').fill('Status update: PR is up for review.'); await page.keyboard.press('Enter'); await page.waitForTimeout(600);
    await page.getByRole('button', { name: /Engine trace/ }).click();
    await page.getByRole('dialog').getByText('The AI proposes. The engine decides.').waitFor();
    await page.getByRole('dialog').getByRole('button', { name: /Rejected/ }).click();
    const items = page.locator('.trace-item');
    const n = await items.count(); assert(n > 0, 'no rejected entries');
    assert(await page.locator('.trace-item.accepted').count() === 0, 'filter leak');
    await page.locator('.trace-reason').first().waitFor();
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    assert(await page.locator('.drawer').count() === 0, 'not closed');
  });
  await row(28, 'Workspace: ⋯ menu (New variant disabled with reason, Report, Shortcuts)', async () => {
    await page.getByRole('button', { name: 'More options' }).click();
    const nv = page.getByRole('menuitem', { name: /New variant/ });
    assert(await nv.getAttribute('aria-disabled') === 'true', 'new variant should be disabled'); await nv.getByText('Available at the start').waitFor();
    await page.getByRole('menuitem', { name: /Report a problem/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Copy diagnostics' }).click(); await page.locator('.snackbar', { hasText: 'Copied' }).waitFor();
    const clip = await page.evaluate(() => navigator.clipboard.readText()); assert(clip.includes('lastTraceIds'), 'diagnostics');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'More options' }).click(); await page.getByRole('menuitem', { name: /Keyboard shortcuts/ }).click();
    await page.getByRole('dialog').getByText('Alt').first().waitFor(); await page.keyboard.press('Escape');
  });
  await row(30, 'Workspace: refresh restores state', async () => {
    const n = await page.locator('.conv-list > *').count();
    await page.reload(); await page.locator('.ev-msg').first().waitFor();
    await page.locator('.conv-head', { hasText: 'Priya Nair' }).waitFor();
    await page.locator('.beat-title', { hasText: 'Beat 4 of 4' }).or(page.locator('.beat-title', { hasText: 'Beat 3 of 4' })).first().waitFor();
    assert(await page.locator('.conv-list > *').count() >= n - 1, 'events lost');
  });
  await row(31, 'Workspace: Finish → confirm → judging → debrief', async () => {
    await page.getByRole('button', { name: 'Continue to next beat' }).click(); await page.locator('.beat-title', { hasText: 'Beat 4 of 4' }).waitFor();
    await page.locator('.ws-rail .rail-item', { hasText: 'Arjun Rao' }).click();
    await page.locator('#composer').fill('Good catch, thanks. I will add the quantity 0 test now.'); await page.keyboard.press('Enter'); await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Finish and see my report' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Finish and see my report' }).click();
    await waitPath(/\/debrief$/);
  });
  await row(32, 'Debrief: processing → ready', async () => {
    await page.getByText(/Reading your work/).first().waitFor({ timeout: 3000 });
    await page.locator('.skill-res').first().waitFor({ timeout: 15000 });
    await page.locator('.chip', { hasText: 'Only you can see this' }).waitFor();
  });
  await row(33, 'Debrief: View in conversation opens drawer at event', async () => {
    await page.locator('.moment').first().getByRole('button', { name: 'View in conversation' }).click();
    await page.locator('.drawer .ev-highlight').waitFor({ timeout: 6000 });
    await page.keyboard.press('Escape');
  });
  await row(35, 'Debrief: Copy growth summary', async () => {
    await page.getByRole('button', { name: 'Copy a positive growth summary' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Copy', exact: true }).click();
    await page.locator('.snackbar', { hasText: 'Copied' }).waitFor();
    assert((await page.evaluate(() => navigator.clipboard.readText())).includes('Ayden'), 'clipboard');
  });
  const debriefPath = url();
  await row(36, 'Debrief: See my progress / Back to role', async () => {
    await page.locator('.debrief-foot').getByRole('link', { name: 'See my progress' }).click(); await waitPath(/^\/progress\/software-engineer$/);
    await page.goBack(); await page.locator('.debrief-foot').waitFor();
    await page.locator('.debrief-foot').getByRole('link', { name: 'Back to role' }).click(); await waitPath(/^\/roles\/software-engineer$/);
  });
  await row(34, 'Debrief: Start drill → drill mission with hint', async () => {
    await go(debriefPath); await page.locator('.next-card').first().waitFor({ timeout: 8000 });
    await page.locator('.next-card').first().getByRole('button', { name: 'Start drill' }).click();
    await waitPath(/^\/mission\/m_/); await page.locator('.ws-top .chip', { hasText: 'Drill' }).waitFor();
    await page.getByRole('button', { name: 'Objectives' }).click(); await page.locator('.popover', { hasText: 'Hint' }).waitFor(); await page.keyboard.press('Escape');
  });
  await row(38, 'Progress: Badge → See evidence', async () => {
    await go('/progress/software-engineer');
    await page.getByRole('heading', { name: 'Badges' }).waitFor();
    const btn = page.getByRole('button', { name: 'See evidence' }).first();
    await btn.waitFor({ timeout: 4000 }); await btn.click(); await page.locator('.drawer .ev-highlight').waitFor({ timeout: 6000 }); await page.keyboard.press('Escape');
  });
  await row(39, 'Progress: Attempts → Open report / Resume', async () => {
    await page.getByRole('link', { name: 'Resume' }).first().click(); await waitPath(/^\/mission\/m_/);
    await go('/progress/software-engineer'); await page.getByRole('button', { name: 'Open report' }).first().click(); await waitPath(/\/debrief$/);
    await page.locator('.skill-res').first().waitFor({ timeout: 8000 });
  });
  await row(28.1, 'Workspace: New variant at the start works', async () => {
    await go('/roles/banking-ops'); await page.getByRole('button', { name: 'Start rehearsal' }).click(); await waitPath(/^\/onboarding/);
    await page.getByText('I have never worked in this role').click(); await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Start rehearsal' }).click(); await waitPath(/^\/mission\//); await page.locator('.ev-msg').first().waitFor();
    const first = url();
    await page.getByRole('button', { name: 'More options' }).click(); await page.getByRole('menuitem', { name: /New variant/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'New variant' }).click();
    await page.waitForURL((u) => new URL(u).pathname !== first && /\/mission\//.test(new URL(u).pathname));
    await page.locator('.ev-system', { hasText: 'Variant R2HQ' }).waitFor();
  });
  await row(37, 'Progress: Ramp Map next → Start', async () => {
    await go('/progress/banking-ops'); await page.locator('.timeline li').first().waitFor();
    console.log('   ramp states:', await page.locator('.timeline li').evaluateAll((l) => l.map((x) => x.className).join(',')));
    await page.locator('.timeline li.next').first().waitFor({ timeout: 3000 });
    await page.locator('.timeline li.next').getByRole('button', { name: 'Start' }).click(); await waitPath(/^\/mission\//);
  });
  await row(19.1, 'Workspace: record viewer', async () => {
    await go('/progress/banking-ops'); await page.getByRole('link', { name: 'Resume' }).first().click(); await waitPath(/^\/mission\//);
    await page.locator('.ws-rail .rail-item', { hasText: 'Customer KYC record' }).click(); await page.locator('.record-grid').waitFor();
  });
  await row(29, 'Workspace: fallback banner + scripted tags', async () => {
    await setMock({ runtime: 'scripted' }); await page.reload();
    await page.getByText('Running in offline script mode').waitFor();
    await page.locator('.ws-rail .rail-item', { hasText: 'Meera Iyer' }).click();
    await page.locator('#composer').fill('Why is it on hold?'); await page.keyboard.press('Enter');
    await page.locator('.ev-msg .ev-tag', { hasText: 'scripted' }).first().waitFor({ timeout: 8000 });
    await setMock({ runtime: 'live' });
  });
  await row(40, 'Groups: create, copy code/link, suppressed insights', async () => {
    await go('/cohort'); await page.getByRole('button', { name: 'Create group' }).click();
    await page.getByLabel('Group name').fill('SNU Placement Prep'); await page.getByRole('dialog').getByRole('button', { name: 'Create group' }).click();
    await page.getByText('Patterns appear when 5 or more').waitFor();
    await page.getByRole('button', { name: 'Copy code' }).click(); await page.locator('.snackbar', { hasText: 'Copied' }).first().waitFor();
    assert(/^SNU-/.test(await page.evaluate(() => navigator.clipboard.readText())), 'code');
    await page.getByRole('button', { name: 'Copy join link' }).click(); await page.waitForTimeout(200);
    assert((await page.evaluate(() => navigator.clipboard.readText())).includes('/join/SNU-'), 'link');
  });
  await row(41, 'Groups: join by code (success + bad code)', async () => {
    await page.getByRole('tab', { name: 'I am joining a group' }).click();
    await page.getByLabel('Join code', { exact: true }).fill('NOPE-000'); await page.getByRole('button', { name: 'Join' }).click();
    await page.getByText('No group uses that code').waitFor();
    await page.getByLabel('Join code', { exact: true }).fill('SNU-7K2'); await page.getByRole('button', { name: 'Join' }).click();
    await page.getByText(/You joined SNU CSE/).waitFor();
    await go('/join/SNU-7K2'); await page.getByText(/You joined SNU CSE/).waitFor();
  });
  await row(42, 'Privacy: toggle consent; required disabled', async () => {
    await go('/privacy');
    const sw = page.getByRole('switch', { name: /Let my college/ });
    const before = await sw.isChecked(); await sw.click(); await page.locator('.snackbar', { hasText: 'Saved' }).first().waitFor();
    assert((await sw.isChecked()) !== before, 'not toggled');
    assert(await page.getByRole('switch', { name: 'I am 18 or older.' }).isDisabled(), 'required not disabled');
  });
  await row(43, 'Privacy: Export downloads ayden-export.json', async () => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export my data' }).click()]);
    assert(dl.suggestedFilename() === 'ayden-export.json', dl.suggestedFilename());
  });
  await row(45, 'How it works: section nav, counters, diagram', async () => {
    await go('/how-it-works'); await page.locator('svg[aria-labelledby="arch-t arch-d"]').waitFor();
    await page.locator('.how-nav a', { hasText: 'Scoring' }).click(); await page.waitForTimeout(700);
    const top = await page.locator('#scoring').evaluate((e) => e.getBoundingClientRect().top); assert(top < 300, 'not scrolled ' + top);
    await page.getByText('Missions started').waitFor();
    await go('/how-it-works#security'); await page.waitForTimeout(800);
  });
  await row(46, '404, session expired, API error, offline', async () => {
    await go('/nope/nope'); await page.getByRole('heading', { level: 2, name: 'That page does not exist.' }).waitFor();
    await page.getByRole('link', { name: 'Browse roles' }).last().click(); await waitPath(/^\/roles$/);
    await go('/privacy'); await setMock({ forceError: 'internal' }); await page.locator('.main-nav').getByRole('link', { name: 'Roles' }).click(); await page.getByText('Something went wrong').waitFor();
    await page.getByRole('button', { name: 'Retry' }).click(); await page.locator('a.role-card').first().waitFor();
    await go('/progress'); await setMock({ forceError: 'unauthenticated' }); await page.locator('footer').getByRole('link', { name: 'Groups' }).click();
    await page.getByRole('dialog', { name: 'Your session ended' }).waitFor({ timeout: 5000 });
    await page.getByRole('dialog').getByRole('button', { name: 'Start a new session' }).click(); await waitPath(/^\/roles$/);
    await go('/'); await ctx.setOffline(true); await page.waitForTimeout(300);
    await page.getByText('You are offline').waitFor(); await ctx.setOffline(false);
  });
  await row(44, 'Privacy: Delete with typed DELETE → /', async () => {
    await go('/roles'); await page.evaluate(() => 0);
    // make sure a session exists
    await go('/demo'); await waitPath(/^\/onboarding/);
    await go('/privacy'); await page.getByRole('button', { name: 'Delete my data' }).click();
    const del = page.getByRole('dialog').getByRole('button', { name: 'Delete' });
    assert(await del.getAttribute('aria-disabled') === 'true', 'should need typing');
    await page.getByLabel('Type DELETE to confirm').fill('DELETE'); await del.click(); await waitPath(/^\/$/);
  });
  await row(8, 'Header: account menu Delete my data → /', async () => {
    await go('/demo'); await waitPath(/^\/onboarding/);
    await page.locator('.account-chip').click(); await page.getByRole('menuitem', { name: /Delete my data/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click(); await waitPath(/^\/$/);
  });
  await row(47, 'Keyboard-only demo path, visible focus', async () => {
    await go('/'); await page.keyboard.press('Tab');
    assert(await page.evaluate(() => document.activeElement.className.includes('skip-link')), 'skip link first');
    let found = false;
    for (let i = 0; i < 20; i++) { await page.keyboard.press('Tab'); const txt = await page.evaluate(() => document.activeElement?.textContent || ''); if (txt.includes('Try the demo, no sign-up')) { found = true; break; } }
    assert(found, 'CTA not reachable');
    const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle); assert(outline !== 'none', 'no focus ring');
    await page.keyboard.press('Enter'); await waitPath(/^\/onboarding/);
    for (const label of ['I am 18 or older.', 'Save my messages and work so my report can quote them.']) { await page.getByLabel(label).focus(); await page.keyboard.press('Space'); }
    await page.getByRole('button', { name: 'Start rehearsal' }).focus(); await page.keyboard.press('Enter'); await waitPath(/^\/mission\//);
    await page.locator('.ev-msg').first().waitFor();
    await page.keyboard.press('Alt+1'); assert(await page.evaluate(() => document.activeElement.id) === 'composer', 'alt+1');
    await page.keyboard.type('Can I ask a few questions first?'); await page.keyboard.press('Enter');
    await page.locator('.ev-msg.mine').first().waitFor();
  });

  // 48: phone width
  const phone = await browser.newContext({ viewport: { width: 360, height: 760 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p2 = await phone.newPage();
  await row(48, '360 px: no horizontal scroll; workspace bottom nav', async () => {
    await p2.goto(BASE + '/'); await p2.evaluate(() => localStorage.setItem('ayden_mock_settings', JSON.stringify({ latency: false })));
    for (const path of ['/', '/roles', '/roles/software-engineer', '/how-it-works', '/privacy', '/cohort', '/progress']) {
      await p2.goto(BASE + path); await p2.waitForLoadState('networkidle'); await p2.waitForTimeout(300);
      const w = await p2.evaluate(() => document.documentElement.scrollWidth); assert(w <= 361, `${path} scrollWidth ${w}`);
    }
    await p2.goto(BASE + '/demo'); await p2.waitForURL(/onboarding/);
    await p2.getByText('I am 18 or older.').click(); await p2.getByText('Save my messages and work').click();
    await p2.getByRole('button', { name: 'Start rehearsal' }).click(); await p2.waitForURL(/\/mission\//);
    await p2.locator('.bottom-nav').waitFor();
    const w = await p2.evaluate(() => document.documentElement.scrollWidth); assert(w <= 361, 'workspace scroll ' + w);
    for (const tab of ['Work', 'Checks', 'Team', 'Chat']) { await p2.locator('.bottom-nav button', { hasText: tab }).click(); await p2.waitForTimeout(150); }
    await p2.screenshot({ path: 'm-workspace.png' });
  });
  await phone.close();
  await browser.close();
  const fails = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} passed`);
  if (errors.length) console.log('Page errors:\n' + [...new Set(errors)].slice(0, 15).join('\n'));
  require('fs').writeFileSync('qa-results.json', JSON.stringify({ results, errors: [...new Set(errors)] }, null, 2));
})();
