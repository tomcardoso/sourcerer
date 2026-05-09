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

async function captureAndSend(token) {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tabUrl = tab?.url ?? null;

  const dataUrl = await chrome.tabs.captureVisibleTab({ format: 'jpeg', quality: 85 });
  const blob = await fetch(dataUrl).then(r => r.blob());

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
