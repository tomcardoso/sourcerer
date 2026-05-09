const BASE = 'http://127.0.0.1:27371';
const TOKEN_KEY = 'sourcererToken';

const statusEl = document.getElementById('status');
const btnCapture = document.getElementById('btn-capture');
const btnConnect = document.getElementById('btn-connect');

function setStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className = type ?? '';
}

function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }

async function getToken() {
  const data = await chrome.storage.session.get(TOKEN_KEY);
  return data[TOKEN_KEY] ?? null;
}

async function saveToken(token) {
  await chrome.storage.session.set({ [TOKEN_KEY]: token });
}

async function clearToken() {
  await chrome.storage.session.remove(TOKEN_KEY);
}

async function checkStatus() {
  const r = await fetch(`${BASE}/status`, { signal: AbortSignal.timeout(2000) });
  return r.json();
}

async function verifyToken(token) {
  const r = await fetch(`${BASE}/contacts`, {
    headers: { 'X-Sourcerer-Token': token },
    signal: AbortSignal.timeout(2000),
  });
  return r.ok;
}

async function requestAccess() {
  await fetch(`${BASE}/request-access`, { method: 'POST', signal: AbortSignal.timeout(3000) });
}

async function pollAccessStatus() {
  return new Promise((resolve) => {
    const start = Date.now();
    const iv = setInterval(async () => {
      if (Date.now() - start > 30000) {
        clearInterval(iv);
        resolve(null);
        return;
      }
      try {
        const r = await fetch(`${BASE}/access-status`, { signal: AbortSignal.timeout(2000) });
        const data = await r.json();
        if (data.status === 'approved' && data.token) {
          clearInterval(iv);
          resolve(data.token);
        } else if (data.status === 'denied') {
          clearInterval(iv);
          resolve(null);
        }
      } catch {}
    }, 600);
  });
}

async function captureFullPage(tabId, onProgress) {
  // Inject once to find + cache the real scroll container, then return metrics
  const [metricsResult] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      function findScrollRoot() {
        // Try the standard scroll element first
        const docEl = document.scrollingElement || document.documentElement;
        if (docEl.scrollHeight > window.innerHeight + 50) return docEl;

        // Walk the DOM for an element with overflow scroll/auto that is taller than the viewport
        let best = docEl;
        for (const el of document.querySelectorAll('*')) {
          if (el.scrollHeight <= window.innerHeight + 50) continue;
          const { overflowY, overflow } = getComputedStyle(el);
          if (overflowY === 'scroll' || overflowY === 'auto' ||
              overflow  === 'scroll' || overflow  === 'auto') {
            if (el.scrollHeight > best.scrollHeight) best = el;
          }
        }
        return best;
      }

      const el = findScrollRoot();
      window.__srcEl = el; // cache so scroll calls can reuse the same element
      const isDocScroller = el === document.scrollingElement ||
                            el === document.documentElement ||
                            el === document.body;
      const rect = isDocScroller
        ? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
        : (() => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; })();
      return {
        totalHeight: Math.min(el.scrollHeight, 15000),
        origScrollTop: el.scrollTop,
        dpr: window.devicePixelRatio || 1,
        scrollElLeft: rect.left,
        scrollElTop: rect.top,
        scrollElWidth: rect.width,
        scrollElHeight: rect.height,
      };
    },
  });

  if (!metricsResult?.result) throw new Error('Could not read page dimensions — try reloading the tab.');
  const { totalHeight, origScrollTop, dpr,
          scrollElLeft, scrollElTop, scrollElWidth, scrollElHeight } = metricsResult.result;
  const totalSteps = Math.ceil(totalHeight / scrollElHeight);

  onProgress(`Page is ${Math.round(totalHeight)}px — ${totalSteps} section${totalSteps === 1 ? '' : 's'}`);
  await new Promise(r => setTimeout(r, 600));

  // Inject a stylesheet + class to hide fixed/sticky elements.
  // Using a CSS class (not inline style) survives React re-renders because React
  // doesn't manage classes it didn't add. The RAF wait ensures the browser has
  // repainted with the elements hidden before we start capturing.
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const style = document.createElement('style');
      style.id = '__srcCapStyle';
      style.textContent = '.__srcHide{display:none!important}';
      document.head.appendChild(style);
      window.__srcHidden = [];

      function srcHide(el) {
        if (!el.classList.contains('__srcHide')) {
          window.__srcHidden.push(el);
          el.classList.add('__srcHide');
        }
      }

      for (const el of document.querySelectorAll('*')) {
        const pos = getComputedStyle(el).position;
        if (pos === 'fixed' || pos === 'sticky') srcHide(el);
      }

      // Watch for elements added or modified after scroll (e.g. LinkedIn's compact
      // profile bar, which appears after the first scroll via a class change)
      window.__srcObserver = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.type === 'childList') {
            for (const node of m.addedNodes) {
              if (node.nodeType !== 1) continue;
              const pos = getComputedStyle(node).position;
              if (pos === 'fixed' || pos === 'sticky') srcHide(node);
              for (const el of node.querySelectorAll('*')) {
                const p = getComputedStyle(el).position;
                if (p === 'fixed' || p === 'sticky') srcHide(el);
              }
            }
          } else if (m.type === 'attributes') {
            const el = m.target;
            const pos = getComputedStyle(el).position;
            if (pos === 'fixed' || pos === 'sticky') srcHide(el);
          }
        }
      });
      window.__srcObserver.observe(document.body, {
        childList: true, subtree: true,
        attributes: true, attributeFilter: ['class', 'style'],
      });

      return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    },
  });

  const canvas = new OffscreenCanvas(
    Math.round(scrollElWidth * dpr),
    Math.round(totalHeight * dpr),
  );
  const ctx = canvas.getContext('2d');

  try {
    let step = 0;
    for (let y = 0; y < totalHeight; y += scrollElHeight) {
      step++;
      onProgress(`Capturing… (${step}/${totalSteps})`);

      const actualY = Math.min(y, totalHeight - scrollElHeight);
      // Scroll and wait for two animation frames so the browser has repainted
      // (and any React scroll-handler re-renders have settled) before capturing.
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (scrollY) => {
          (window.__srcEl || document.scrollingElement || document.documentElement).scrollTop = scrollY;
          // Two RAFs: first lets scroll handlers + MutationObserver fire and hide
          // any newly fixed/sticky elements; second ensures the browser has repainted.
          return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        },
        args: [actualY],
      });

      const dataUrl = await chrome.tabs.captureVisibleTab({ format: 'jpeg', quality: 88 });
      const bitmap = await createImageBitmap(await fetch(dataUrl).then(r => r.blob()));

      // Crop each captured viewport strip to the scroll container's bounds.
      // For document-level scrollers scrollElLeft/Top are 0 and scrollElWidth/Height
      // equal the viewport, so this degrades gracefully to the original behaviour.
      const srcX = Math.round(scrollElLeft * dpr);
      const srcY = Math.round((scrollElTop + (y - actualY)) * dpr);
      const dstY = Math.round(y * dpr);
      const w    = Math.round(scrollElWidth * dpr);
      const h    = Math.round(Math.min(scrollElHeight, totalHeight - y) * dpr);
      ctx.drawImage(bitmap, srcX, srcY, w, h, 0, dstY, w, h);
      bitmap.close();
    }
  } finally {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (origY) => {
        window.__srcObserver?.disconnect();
        for (const el of (window.__srcHidden || [])) el.classList.remove('__srcHide');
        document.getElementById('__srcCapStyle')?.remove();
        (window.__srcEl || document.scrollingElement || document.documentElement).scrollTop = origY;
        delete window.__srcEl;
        delete window.__srcHidden;
        delete window.__srcObserver;
      },
      args: [origScrollTop],
    });
  }

  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.88 });
}

async function captureAndSend(token) {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tabUrl = tab?.url ?? null;

  const blob = await captureFullPage(tab.id, (msg) => setStatus(msg, ''));

  const headers = { 'Content-Type': 'image/jpeg', 'X-Sourcerer-Token': token };
  if (tabUrl) headers['X-Tab-Url'] = tabUrl;

  const r = await fetch(`${BASE}/screenshot`, { method: 'POST', headers, body: blob });
  if (!r.ok) throw new Error(`Server responded ${r.status}`);
  return r.json();
}

async function pollForAssignment(tempId, token) {
  const start = Date.now();
  const iv = setInterval(async () => {
    if (Date.now() - start > 120000) { clearInterval(iv); return; }
    try {
      const r = await fetch(`${BASE}/screenshot-status/${tempId}`, {
        headers: { 'X-Sourcerer-Token': token },
        signal: AbortSignal.timeout(2000),
      });
      const data = await r.json();
      if (data.status === 'assigned') {
        clearInterval(iv);
        setStatus('Saved in Sourcerer.', 'ok');
      }
    } catch {}
  }, 1500);
}

function wireCapture(token) {
  show(btnCapture);
  btnCapture.disabled = false;
  btnCapture.onclick = async () => {
    btnCapture.disabled = true;
    setStatus('Capturing…', '');
    try {
      const { tempId } = await captureAndSend(token);
      setStatus('Sent! Assign it in Sourcerer.', 'ok');
      pollForAssignment(tempId, token);
    } catch (err) {
      setStatus(`Error: ${err.message}`, 'err');
      btnCapture.disabled = false;
    }
  };
}

async function init() {
  let appStatus;
  try {
    appStatus = await checkStatus();
  } catch {
    setStatus('Sourcerer is not running. Open the app first.', 'err');
    return;
  }

  if (appStatus.locked) {
    setStatus('Sourcerer is locked. Unlock the app first.', 'err');
    return;
  }

  let token = await getToken();
  if (token) {
    const valid = await verifyToken(token).catch(() => false);
    if (!valid) {
      await clearToken();
      token = null;
    }
  }

  if (token) {
    setStatus('Connected', 'ok');
    wireCapture(token);
    return;
  }

  setStatus('Not connected to Sourcerer.', '');
  show(btnConnect);

  btnConnect.onclick = async () => {
    btnConnect.disabled = true;
    setStatus('Requesting access — approve in Sourcerer…', '');
    try {
      fetch(`${BASE}/focus`, { method: 'POST', signal: AbortSignal.timeout(1000) }).catch(() => {});
      await requestAccess();
      const newToken = await pollAccessStatus();
      if (newToken) {
        await saveToken(newToken);
        hide(btnConnect);
        setStatus('Connected', 'ok');
        wireCapture(newToken);
      } else {
        setStatus('Access denied or timed out.', 'err');
        btnConnect.disabled = false;
      }
    } catch (err) {
      setStatus(`Error: ${err.message}`, 'err');
      btnConnect.disabled = false;
    }
  };
}

init();
