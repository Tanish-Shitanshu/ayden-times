const { chromium } = require('playwright');
const axe = require('axe-core');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  for (const path of ['/', '/roles', '/roles/software-engineer', '/how-it-works', '/privacy', '/onboarding/software-engineer?demo=1']) {
    await p.goto('http://127.0.0.1:4173' + path); await p.waitForLoadState('networkidle'); await p.waitForTimeout(600);
    await p.addScriptTag({ content: axe.source });
    const r = await p.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] })).violations.map((v) => `${v.id} (${v.nodes.length}): ${v.nodes.slice(0,2).map(n=>n.target.join(' ')).join(' | ')}`));
    console.log(path, r.length ? r : 'OK');
  }
  await b.close();
})();
