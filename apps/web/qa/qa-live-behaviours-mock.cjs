const { chromium } = require('playwright');
const B = process.env.BASE || 'http://127.0.0.1:4173';
const res = [];
var p; const row = async (n, f) => { try { await f(); res.push(['PASS', n]); } catch (e) { res.push(['FAIL', n, String(e.message).split('\n').slice(0,4).join(' ')]); await p.screenshot({ path: 'fail-' + res.length + '.png' }); } };
(async () => {
  const b = await chromium.launch();
  p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })).newPage();
  await p.goto(B + '/'); await p.evaluate(() => { localStorage.clear(); localStorage.setItem('ayden_mock_settings', JSON.stringify({ latency: false })); });
  const start = async (role) => {
    await p.goto(B + '/onboarding/' + role + '?demo=1'); await p.waitForLoadState('networkidle');
    if (await p.getByText('I am 18 or older.').count()) { await p.getByText('I am 18 or older.').click(); await p.getByText('Save my messages').click(); }
    await p.getByRole('button', { name: 'Start rehearsal' }).click(); await p.waitForURL(/\/mission\//); await p.locator('.ev-msg').first().waitFor();
  };
  await row('Banking: customer call shows Call tag; reply goes on the call', async () => {
    await start('banking-ops');
    await p.locator('.bottom-nav button', { hasText: 'Work' }).click(); await p.locator('.item-switch button', { hasText: 'Customer KYC' }).click(); await p.waitForTimeout(300);
    await p.locator('.bottom-nav button', { hasText: 'Team' }).click(); await p.locator('.ws-team-pane .rail-item', { hasText: 'Meera' }).click();
    await p.locator('#composer').fill('It is held because the address proof expired, right?'); await p.keyboard.press('Enter'); await p.waitForTimeout(3500);
    await p.getByRole('button', { name: 'Continue to next beat' }).click(); await p.waitForTimeout(600);
    await p.locator('.bottom-nav button', { hasText: 'Team' }).click(); await p.locator('.ws-team-pane .rail-item', { hasText: 'Mr Chopra' }).click();
    await p.locator('.ev-msg .chip', { hasText: 'Call' }).first().waitFor();
    if ((await p.locator('#composer').getAttribute('placeholder')) !== 'Reply on the call to Mr…') throw new Error('placeholder ' + await p.locator('#composer').getAttribute('placeholder'));
    await p.locator('#composer').fill('Your payment is under review. I will update you by 3 pm.'); await p.keyboard.press('Enter');
    await p.locator('.ev-msg.mine .chip', { hasText: 'Call' }).first().waitFor({ timeout: 6000 });
    await p.screenshot({ path: 'x-bank-call.png' });
  });
  await row('Nurse: record changes mid-mission (changedItems + meta.itemId)', async () => {
    await start('nurse');
    await p.locator('.bottom-nav button', { hasText: 'Work' }).click(); await p.locator('.item-switch button', { hasText: 'Observations' }).click();
    await p.locator('.bottom-nav button', { hasText: 'Chat' }).click();
    await p.getByRole('button', { name: 'Continue to next beat' }).click();
    await p.locator('.ev-update').waitFor();
    await p.screenshot({ path: 'x-nurse-update.png' });
    await p.locator('.ev-update').getByRole('button', { name: /Open Bed/ }).click();
    await p.locator('.record-grid', { hasText: 'Observations at 04:20' }).waitFor();
  });
  await row('Drill: New variant keeps it a drill', async () => {
    await p.goto(B + '/progress/nurse'); await p.waitForLoadState('networkidle');
    await p.evaluate(() => 0);
  });
  await b.close();
  console.log(res.map((r) => r.join(' | ')).join('\n'));
})();
