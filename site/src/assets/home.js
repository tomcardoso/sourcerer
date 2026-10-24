// Sourcerer website: the landing page's motion and interaction. Everything here is decoration on
// top of content that reads fine without it; prefers-reduced-motion stops the loops.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ── Reveal on scroll ───────────────────────────────────────────────────────────────────────
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.05 });
  $$('.reveal, .share-visual').forEach((el) => io.observe(el));
  requestAnimationFrame(() => $('.hl')?.classList.add('on'));

  // Run a loop only while its element is on screen and the tab is visible.
  const whileVisible = (el) => {
    let visible = false;
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(el);
    return async () => { while (!visible || document.hidden) await sleep(300); };
  };

  // ── Hero: the vault decrypts into a source record, the outreach moves on, then it locks ────
  const GLYPHS = '0123456789abcdef';
  const noise = (text) => text.replace(/\S/g, () => GLYPHS[(Math.random() * 16) | 0]);
  const hero = $('.hero-visual');
  if (hero) {
    const vault = $('.vault', hero);
    const state = $('.vault-state', hero);
    const fields = $$('.cx', hero);
    const status = $('.v-status', hero);
    const statusText = $('.cx', status);
    const entries = $$('.v-entry', hero);
    const reminder = $('.v-reminder', hero);
    const original = fields.map((f) => f.dataset.text);

    // Ciphertext is what's on disk; each field reads as hex until its turn to decrypt.
    const lock = () => fields.forEach((f, i) => { f.textContent = noise(original[i]); f.classList.add('cipher'); });
    const reveal = (f, text, ms) => new Promise((done) => {
      f.classList.remove('cipher');
      const start = performance.now();
      const tick = (now) => {
        const p = Math.min(1, (now - start) / ms);
        const n = Math.floor(text.length * p);
        f.textContent = text.slice(0, n) + noise(text.slice(n));
        if (p < 1) requestAnimationFrame(tick); else { f.textContent = text; done(); }
      };
      requestAnimationFrame(tick);
    });
    const setOpen = (open) => {
      vault.classList.toggle('open', open);
      hero.classList.toggle('is-open', open);
      vault.style.setProperty('--unlock', open ? '1' : '0');
      state.textContent = open ? 'Unlocked · in the app' : 'On disk · Vault.sourcerer';
    };
    const setStatus = async (text) => {
      status.classList.remove('bump'); void status.offsetWidth; status.classList.add('bump');
      statusText.textContent = text;
    };

    if (reduced) {
      fields.forEach((f, i) => { f.textContent = original[i]; });
      setStatus('In dialogue'); status.classList.add('live');
      entries.forEach((e) => e.classList.add('show')); reminder.classList.add('show'); setOpen(true);
    } else {
      const wait = whileVisible(hero);
      let shimmer = null;
      const startShimmer = () => { shimmer = setInterval(() => fields.forEach((f, i) => { if (f.classList.contains('cipher')) f.textContent = noise(original[i]); }), 90); };
      lock(); startShimmer();
      (async function loop() {
        await sleep(1400);
        for (;;) {
          await wait();
          setOpen(true);
          for (let i = 0; i < fields.length; i++) { await reveal(fields[i], original[i], 260 + original[i].length * 14); await sleep(40); }
          clearInterval(shimmer);
          await sleep(900);
          await setStatus('Contacted, no reply'); status.classList.add('live');
          entries[0].classList.add('show');
          await sleep(1600);
          await setStatus('In dialogue');
          entries[1].classList.add('show');
          await sleep(1200);
          reminder.classList.add('show');
          await sleep(4800);
          await wait();
          // Auto-lock: the record goes back to ciphertext.
          entries.forEach((e) => e.classList.remove('show'));
          reminder.classList.remove('show');
          status.classList.remove('live');
          setOpen(false);
          lock(); startShimmer();
          await sleep(2600);
        }
      })();
    }
  }

  // ── Hex dump behind the vault, and the wall of ciphertext in the encryption band ───────────
  const hex = (n) => Array.from({ length: n }, () => GLYPHS[(Math.random() * 16) | 0] + GLYPHS[(Math.random() * 16) | 0]);
  const dump = $('.hexdump-body');
  if (dump) {
    // A SQLCipher file has no plaintext header: even its first sixteen bytes are random.
    let offset = 0;
    const line = () => {
      const bytes = hex(16);
      const out = `<b>${(offset * 16).toString(16).padStart(8, '0')}</b>  ${bytes.slice(0, 8).join(' ')}  ${bytes.slice(8).join(' ')}`;
      offset++;
      return out;
    };
    const rows = Array.from({ length: 16 }, line);
    dump.innerHTML = rows.join('\n');
    if (!reduced) {
      const wait = whileVisible(dump);
      (async () => { for (;;) { await wait(); await sleep(420); rows.shift(); rows.push(line()); dump.innerHTML = rows.join('\n'); } })();
    }
  }
  const wall = $('.cipher-wall');
  if (wall) {
    const rows = Array.from({ length: 40 }, () => hex(48).join(''));
    wall.textContent = rows.join('\n');
    if (!reduced) {
      const wait = whileVisible(wall.parentElement);
      (async () => { for (;;) { await wait(); await sleep(160); rows[(Math.random() * rows.length) | 0] = hex(48).join(''); wall.textContent = rows.join('\n'); } })();
    }
  }

  // ── Tour: tabs that advance on their own until someone picks one ───────────────────────────
  const tabs = $$('.tour-tabs [role=tab]');
  if (tabs.length) {
    const DWELL = 6000;
    let current = 0;
    let auto = !reduced;
    let start = performance.now();
    let inView = false;
    const show = (i) => {
      current = (i + tabs.length) % tabs.length;
      const key = tabs[current].dataset.shot;
      tabs.forEach((t, j) => { t.setAttribute('aria-selected', String(j === current)); t.style.setProperty('--p', '0'); });
      $$('.screen').forEach((s) => s.classList.toggle('active', s.dataset.shot === key));
      $$('.caption').forEach((c) => c.classList.toggle('active', c.dataset.shot === key));
      // Load the next screen's images ahead of time.
      $$(`.screen[data-shot="${tabs[(current + 1) % tabs.length].dataset.shot}"] img`).forEach((img) => { img.loading = 'eager'; });
      start = performance.now();
    };
    tabs.forEach((t, i) => t.addEventListener('click', () => { auto = false; show(i); }));
    $('.tour-tabs').addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      auto = false;
      show(current + (e.key === 'ArrowRight' ? 1 : -1));
      tabs[current].focus();
    });
    new IntersectionObserver(([e]) => { inView = e.isIntersecting; start = performance.now(); }).observe($('.tour-stage'));
    const tick = (now) => {
      if (auto && inView && !document.hidden) {
        const p = Math.min(1, (now - start) / DWELL);
        tabs[current].style.setProperty('--p', p.toFixed(3));
        if (p >= 1) show(current + 1);
      } else {
        start = now - (parseFloat(tabs[current].style.getPropertyValue('--p')) || 0) * DWELL;
        if (!auto) tabs[current].style.setProperty('--p', '1');
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // ── Outreach: a source moves along the statuses ────────────────────────────────────────────
  const flow = $('.flow');
  if (flow) {
    const steps = $$('.flow-path li', flow);
    const cursor = $('.flow-cursor', flow);
    const go = (n) => {
      steps.forEach((s, i) => s.classList.toggle('done', i <= n));
      cursor.style.setProperty('--x', `${steps[n].offsetLeft}px`);
    };
    if (reduced) go(steps.length - 1);
    else {
      const wait = whileVisible(flow);
      go(0);
      (async () => {
        for (let n = 0; ; n = (n + 1) % steps.length) {
          await wait();
          go(n);
          await sleep(n === steps.length - 1 ? 3200 : 1500);
        }
      })();
    }
    addEventListener('resize', () => { const n = steps.filter((s) => s.classList.contains('done')).length - 1; if (n >= 0) go(n); });
  }

  // ── Redaction: the button, or the app's own shortcut ───────────────────────────────────────
  const demo = $('.redact-demo');
  const toggle = $('.redact-toggle');
  if (demo && toggle) {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) $('.k-mod', toggle).textContent = '⌘';
    let auto = !reduced;
    const set = (on) => {
      demo.dataset.redacted = String(on);
      toggle.setAttribute('aria-pressed', String(on));
      if (!auto) $('.redact-word', toggle).textContent = on ? 'Show it' : 'Try it';
    };
    const screens = $('.redact-screens', demo);
    new ResizeObserver(() => demo.style.setProperty('--w', `${screens.clientWidth}px`)).observe(screens);
    // Until someone presses the button, the demo sweeps the blur on and off by itself.
    const take = () => {
      // The first press shows the blur, whatever the sweep was showing.
      const next = auto ? true : demo.dataset.redacted !== 'true';
      auto = false;
      demo.classList.remove('sweeping');
      set(next);
    };
    toggle.addEventListener('click', take);
    addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'r') { e.preventDefault(); take(); }
    });
    if (auto) {
      const wait = whileVisible(demo);
      (async () => {
        await sleep(1200);
        while (auto) {
          await wait();
          if (!auto) break;
          demo.classList.add('sweeping');
          set(demo.dataset.redacted !== 'true');
          await sleep(1200);
          demo.classList.remove('sweeping');
          await sleep(2600);
        }
      })();
    }
  }

  // ── Shared projects: the file in the shared folder is only ever ciphertext ─────────────────
  const cipher = $('.node-cipher');
  if (cipher) {
    const fill = () => { cipher.textContent = noise('x'.repeat(28)); };
    fill();
    if (!reduced) setInterval(fill, 140);
  }

  // ── Download: point at this computer's installer ───────────────────────────────────────────
  const ua = navigator.userAgent;
  const os = /Windows/.test(ua) ? 'windows' : /Mac OS X|Macintosh/.test(ua) && !/iPhone|iPad/.test(ua) ? 'mac' : /Linux/.test(ua) && !/Android/.test(ua) ? 'linux' : null;
  const primary = $('.download-primary');
  if (os && primary) {
    const names = { mac: 'Download for Mac', windows: 'Download for Windows', linux: 'Download for Linux' };
    primary.href = primary.dataset[os];
    $('.download-label', primary).textContent = names[os];
    const note = $('.download-note');
    if (note) note.innerHTML = os === 'mac'
      ? 'For Macs with Apple silicon. <a href="#download">Windows and Linux</a>.'
      : `Also for <a href="#download">${os === 'windows' ? 'Mac and Linux' : 'Mac and Windows'}</a>.`;
    $(`.platform[data-os="${os}"]`)?.classList.add('detected');
  }
})();
