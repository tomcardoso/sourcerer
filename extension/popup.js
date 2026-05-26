const BASE = 'http://127.0.0.1:27371';
const TOKEN_KEY = 'sourcererToken';

const statusEl   = document.getElementById('status');
const btnCapture = document.getElementById('btn-capture');
const btnConnect = document.getElementById('btn-connect');

// Screen management
function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

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

function renderFieldList(query, allContacts, onSelect) {
  const list = document.getElementById('field-list');
  const matches = query
    ? allContacts.filter((c) =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        (c.organization ?? '').toLowerCase().includes(query.toLowerCase()))
    : allContacts;
  list.replaceChildren();
  if (matches.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'contact-list-empty';
    empty.textContent = query ? 'No contacts match.' : 'No contacts found.';
    list.appendChild(empty);
    return;
  }
  matches.slice(0, 40).forEach((c) => {
    const btn = document.createElement('button');
    btn.className = 'contact-item';
    btn.dataset.id = c.id;
    const nameEl = document.createElement('span');
    nameEl.className = 'contact-item-name';
    nameEl.textContent = c.name;
    btn.appendChild(nameEl);
    if (c.organization) {
      const orgEl = document.createElement('span');
      orgEl.className = 'contact-item-org';
      orgEl.textContent = c.organization;
      btn.appendChild(orgEl);
    }
    btn.onclick = () => {
      list.querySelectorAll('.contact-item').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      onSelect(c.id);
      document.getElementById('btn-field-assign').disabled = false;
    };
    list.appendChild(btn);
  });
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

// ── New: read text selected on the active tab ─────────────────────────────
async function getPageSelection(tabId) {
  try {
    const [r] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.getSelection()?.toString().trim() ?? '',
    });
    return r?.result ?? '';
  } catch { return ''; }
}

// ── New: fetch all contacts from the local server ─────────────────────────
async function fetchContacts(token) {
  const r = await fetch(`${BASE}/contacts`, {
    headers: { 'X-Sourcerer-Token': token },
    signal: AbortSignal.timeout(4000),
  });
  const data = await r.json();
  return data.contacts ?? [];
}

// ── New: add a field to an existing contact ───────────────────────────────
async function addContactField(token, contactId, fieldType, value) {
  const r = await fetch(`${BASE}/contact-field`, {
    method: 'POST',
    headers: { 'X-Sourcerer-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ contactId, fieldType, value }),
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new Error(data.error || `Server error ${r.status}`);
  }
}

function isCapturableUrl(url) {
  if (!url) return false;
  return !['chrome://', 'chrome-extension://', 'about:', 'edge://', 'moz-extension://'].some((p) => url.startsWith(p));
}

async function getActiveTabUrl() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const u = tab?.url ?? '';
    return isCapturableUrl(u) ? u : '';
  } catch { return ''; }
}

// ── New: create a new contact ─────────────────────────────────────────────
async function createContact(token, fields) {
  const r = await fetch(`${BASE}/contacts`, {
    method: 'POST',
    headers: { 'X-Sourcerer-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new Error(data.error || `Server error ${r.status}`);
  }
  return r.json();
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

  // Guard band: for non-first strips we scroll back this many px so the top
  // of the captured viewport overlaps with content already committed to the
  // canvas. Those top pixels are then discarded when compositing, which
  // eliminates any fixed/sticky overlay (e.g. LinkedIn's compact profile bar)
  // that appears after a scroll — regardless of CSS specificity or React
  // re-render timing — because we simply never use those pixels.
  const GUARD = 80; // px — must be larger than the tallest sticky bar you expect
  const effectiveStep = scrollElHeight - GUARD;
  const totalSteps = 1 + Math.ceil(Math.max(0, totalHeight - scrollElHeight) / effectiveStep);

  onProgress(`Page is ${Math.round(totalHeight)}px — ${totalSteps} section${totalSteps === 1 ? '' : 's'}`);
  await new Promise(r => setTimeout(r, 600));

  // Best-effort: hide fixed/sticky elements that exist at capture start.
  // This still helps on most sites. For sites like LinkedIn where elements
  // appear dynamically and override our CSS, the guard band is the backstop.
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const style = document.createElement('style');
      style.id = '__srcCapStyle';
      style.textContent = '.__srcHide{display:none!important}';
      document.head.appendChild(style);
      window.__srcHidden = [];
      for (const el of document.querySelectorAll('*')) {
        const pos = getComputedStyle(el).position;
        if ((pos === 'fixed' || pos === 'sticky') && !el.classList.contains('__srcHide')) {
          window.__srcHidden.push(el);
          el.classList.add('__srcHide');
        }
      }
      return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    },
  });

  // Cap output at 1× logical resolution regardless of display DPR so the
  // encoded JPEG stays well under the server's upload limit even on Retina displays.
  const outDpr = Math.min(dpr, 1);
  const canvas = new OffscreenCanvas(
    Math.round(scrollElWidth * outDpr),
    Math.round(totalHeight * outDpr),
  );
  const ctx = canvas.getContext('2d');

  try {
    let step = 0;
    let canvasY = 0;
    while (canvasY < totalHeight) {
      step++;
      onProgress(`Capturing… (${step}/${totalSteps})`);

      const isFirst = step === 1;
      // For non-first strips, scroll back GUARD px so the guard band overlaps
      // the content already written by the previous strip.
      const scrollTo = isFirst ? 0 : canvasY - GUARD;
      // Clamp to prevent scrolling past the bottom.
      const actualScrollTo = Math.min(scrollTo, Math.max(0, totalHeight - scrollElHeight));
      // How much the clamp shifted us — adjusts srcY for the last strip.
      const scrollClamp = scrollTo - actualScrollTo;

      await chrome.scripting.executeScript({
        target: { tabId },
        func: (scrollY) => {
          (window.__srcEl || document.scrollingElement || document.documentElement).scrollTop = scrollY;
          return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        },
        args: [actualScrollTo],
      });

      const dataUrl = await chrome.tabs.captureVisibleTab({ format: 'jpeg', quality: 88 });
      const bitmap = await createImageBitmap(await fetch(dataUrl).then(r => r.blob()));

      // For non-first strips: skip the top (GUARD + scrollClamp) pixels of the
      // captured viewport. Those pixels either contain a fixed/sticky overlay or
      // duplicate content already on the canvas from the previous strip.
      const topSkip = isFirst ? 0 : GUARD + scrollClamp;
      const availH = totalHeight - canvasY;
      const usedH = Math.min(scrollElHeight - topSkip, availH);

      const srcX = Math.round(scrollElLeft * dpr);
      const srcY = Math.round((scrollElTop + topSkip) * dpr);
      const srcW = Math.round(scrollElWidth * dpr);
      const srcH = Math.round(usedH * dpr);
      const dstY = Math.round(canvasY * outDpr);
      const dstW = Math.round(scrollElWidth * outDpr);
      const dstH = Math.round(usedH * outDpr);
      ctx.drawImage(bitmap, srcX, srcY, srcW, srcH, 0, dstY, dstW, dstH);
      bitmap.close();

      canvasY += isFirst ? scrollElHeight : effectiveStep;
    }
  } finally {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (origY) => {
        for (const el of (window.__srcHidden || [])) el.classList.remove('__srcHide');
        document.getElementById('__srcCapStyle')?.remove();
        (window.__srcEl || document.scrollingElement || document.documentElement).scrollTop = origY;
        delete window.__srcEl;
        delete window.__srcHidden;
      },
      args: [origScrollTop],
    });
  }

  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
}

async function captureAndSend(token) {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tabUrl = tab?.url ?? null;

  const blob = await captureFullPage(tab.id, (msg) => setStatus(msg, ''));

  const headers = { 'Content-Type': 'image/jpeg', 'X-Sourcerer-Token': token };
  if (tabUrl) headers['X-Tab-Url'] = tabUrl;

  const r = await fetch(`${BASE}/screenshot`, { method: 'POST', headers, body: blob, signal: AbortSignal.timeout(30000) });
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

async function wireConnected(token) {
  setStatus('Connected · Sourcerer is running', 'ok');

  // Screenshot
  wireCapture(token);

  // New contact screen
  const btnNewContact = document.getElementById('btn-new-contact');
  show(btnNewContact);
  document.getElementById('btn-contact-back').onclick = () => showScreen('screen-main');
  btnNewContact.onclick = async () => {
    document.getElementById('contact-name').value  = '';
    document.getElementById('contact-org').value   = '';
    document.getElementById('contact-title').value = '';
    document.getElementById('contact-email').value = '';
    document.getElementById('contact-phone').value = '';
    document.getElementById('contact-url').value   = await getActiveTabUrl();
    const st = document.getElementById('contact-status');
    st.textContent = ''; st.className = 'screen-status';
    document.getElementById('btn-contact-save').disabled = false;
    showScreen('screen-contact');
    setTimeout(() => document.getElementById('contact-name').focus(), 50);
  };
  document.getElementById('btn-contact-save').onclick = async () => {
    const name  = document.getElementById('contact-name').value.trim();
    const org   = document.getElementById('contact-org').value.trim();
    const title = document.getElementById('contact-title').value.trim();
    const email = document.getElementById('contact-email').value.trim();
    const phone = document.getElementById('contact-phone').value.trim();
    const url   = document.getElementById('contact-url').value.trim();
    const st = document.getElementById('contact-status');
    if (!name) { st.textContent = 'Name is required.'; st.className = 'screen-status err'; return; }
    document.getElementById('btn-contact-save').disabled = true;
    st.textContent = 'Saving…'; st.className = 'screen-status';
    try {
      await createContact(token, { name, organization: org || undefined, title: title || undefined, email: email || undefined, phone: phone || undefined, url: url || undefined });
      st.textContent = '✓ Contact added.'; st.className = 'screen-status ok';
      setTimeout(() => showScreen('screen-main'), 1400);
    } catch (err) {
      st.textContent = `Error: ${err.message}`; st.className = 'screen-status err';
      document.getElementById('btn-contact-save').disabled = false;
    }
  };

  // Selection-based field save — prefer pending context menu selection over active-tab selection
  try {
    // Check for a selection stored by the background service worker (context menu click)
    const stored = await chrome.storage.session.get('pendingContextSelection');
    const pending = stored.pendingContextSelection ?? null;
    if (pending) await chrome.storage.session.remove('pendingContextSelection');

    // If context menu said "Add as new contact", go straight to that screen
    if (pending?.action === 'contact') {
      document.getElementById('contact-name').value  = pending.text.slice(0, 120);
      document.getElementById('contact-org').value   = '';
      document.getElementById('contact-title').value = '';
      document.getElementById('contact-email').value = '';
      document.getElementById('contact-phone').value = '';
      document.getElementById('contact-url').value   = await getActiveTabUrl();
      const st = document.getElementById('contact-status');
      st.textContent = ''; st.className = 'screen-status';
      document.getElementById('btn-contact-save').disabled = false;
      showScreen('screen-contact');
      setTimeout(() => document.getElementById('contact-name').focus(), 50);
      return;
    }

    let selection = pending?.text ?? '';
    let initialFieldType = pending?.action ?? 'note'; // 'email' | 'phone' | 'note'

    if (!selection) {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tab?.id == null) return;
      selection = await getPageSelection(tab.id);
      initialFieldType = 'note';
    }

    if (!selection) return;

    const btnSaveField = document.getElementById('btn-save-field');
    show(btnSaveField);
    document.getElementById('field-preview').textContent =
      selection.length > 160 ? selection.slice(0, 160) + '…' : selection;
    document.getElementById('field-type').value = initialFieldType;

    // If triggered from context menu, jump straight to the field screen
    if (pending) {
      let allContacts = [];
      let selectedContactId = null;

      document.getElementById('btn-field-back').onclick = () => showScreen('screen-main');
      document.getElementById('btn-field-assign').disabled = true;
      const st = document.getElementById('field-status');
      st.textContent = 'Loading contacts…'; st.className = 'screen-status';
      showScreen('screen-field');
      try {
        allContacts = await fetchContacts(token);
        st.textContent = '';
      } catch {
        st.textContent = 'Could not connect to Sourcerer — is the app running?';
        st.className = 'screen-status err';
      }
      renderFieldList('', allContacts, (id) => { selectedContactId = id; });
      document.getElementById('field-search').oninput = (e) => renderFieldList(e.target.value, allContacts, (id) => { selectedContactId = id; });
      setTimeout(() => document.getElementById('field-search').focus(), 50);

      document.getElementById('btn-field-assign').onclick = async () => {
        if (!selectedContactId) return;
        const fieldType = document.getElementById('field-type').value;
        document.getElementById('btn-field-assign').disabled = true;
        st.textContent = 'Saving…'; st.className = 'screen-status';
        try {
          await addContactField(token, selectedContactId, fieldType, selection);
          st.textContent = '✓ Saved.'; st.className = 'screen-status ok';
          setTimeout(() => showScreen('screen-main'), 1400);
        } catch (err) {
          st.textContent = `Error: ${err.message}`; st.className = 'screen-status err';
          document.getElementById('btn-field-assign').disabled = false;
        }
      };
      return;
    }

    let allContacts = [];
    let selectedContactId = null;

    document.getElementById('btn-field-back').onclick = () => showScreen('screen-main');

    btnSaveField.onclick = async () => {
      selectedContactId = null;
      document.getElementById('btn-field-assign').disabled = true;
      const st = document.getElementById('field-status');
      st.textContent = ''; st.className = 'screen-status';
      document.getElementById('field-search').value = '';
      if (!allContacts.length) {
        st.textContent = 'Loading contacts…';
        try {
          allContacts = await fetchContacts(token);
          st.textContent = '';
        } catch {
          st.textContent = 'Could not connect to Sourcerer — is the app running?';
          st.className = 'screen-status err';
        }
      }
      renderFieldList('', allContacts, (id) => { selectedContactId = id; });
      document.getElementById('field-search').oninput = (e) => renderFieldList(e.target.value, allContacts, (id) => { selectedContactId = id; });
      showScreen('screen-field');
      setTimeout(() => document.getElementById('field-search').focus(), 50);
    };

    document.getElementById('btn-field-assign').onclick = async () => {
      if (!selectedContactId) return;
      const fieldType = document.getElementById('field-type').value;
      const st = document.getElementById('field-status');
      document.getElementById('btn-field-assign').disabled = true;
      st.textContent = 'Saving…'; st.className = 'screen-status';
      try {
        await addContactField(token, selectedContactId, fieldType, selection);
        st.textContent = '✓ Saved.'; st.className = 'screen-status ok';
        setTimeout(() => showScreen('screen-main'), 1400);
      } catch (err) {
        st.textContent = `Error: ${err.message}`; st.className = 'screen-status err';
        document.getElementById('btn-field-assign').disabled = false;
      }
    };
  } catch {}
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
    await wireConnected(token);
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
        await wireConnected(newToken);
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
