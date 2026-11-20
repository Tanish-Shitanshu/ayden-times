const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const out = [];
  for (const [w, g] of [[1280, 40], [1024, 24], [768, 24], [360, 16]]) {
    const p = await (await b.newContext({ viewport: { width: w, height: 800 } })).newPage();
    await p.goto('http://127.0.0.1:4173/'); await p.evaluate(() => { localStorage.clear(); localStorage.setItem('ayden_mock_settings', JSON.stringify({ latency: false })); });
    await p.goto('http://127.0.0.1:4173/demo'); await p.waitForURL(/onboarding/);
    for (const path of ['/', '/roles', '/roles/software-engineer', '/onboarding/software-engineer', '/progress', '/cohort', '/privacy', '/how-it-works', '/nope']) {
      await p.goto('http://127.0.0.1:4173' + path); await p.waitForLoadState('networkidle'); await p.waitForTimeout(300);
      const r = await p.evaluate(() => {
        const h = document.querySelector('main h1:not(.sr-only)') || document.querySelector('main h2');
        const c = document.querySelector('main .container');
        return { h1: h ? Math.round(h.getBoundingClientRect().left) : null, pad: c ? getComputedStyle(c).paddingLeft : null, sw: document.documentElement.scrollWidth };
      });
      const ok = r.h1 !== null && r.h1 >= g - 1 && r.sw <= w + 1;
      out.push(`${ok ? 'OK ' : 'BAD'} ${w}px ${path} h1.left=${r.h1} pad=${r.pad} scrollW=${r.sw}`);
    }
    if (w === 1280) { await p.goto('http://127.0.0.1:4173/roles/software-engineer'); await p.waitForTimeout(500); await p.screenshot({ path: 'gutter-role-1280.png' }); }
  }
  console.log(out.join('\n')); await b.close();
})();
