// ═══════════════════════════════════════════
// SESSION POLLING
// ═══════════════════════════════════════════
let _sessionPoll = null;

function startSessionPoll() {
  stopSessionPoll();
  _sessionPoll = setInterval(async () => {
    if (!API.token) return;
    try {
      const res = await fetch('/api/settings', { headers: API.headers() });
      if (res.status === 401) {
        const data = await res.json().catch(() => ({}));
        stopSessionPoll();
        if (data.reason === 'session_replaced') {
          document.getElementById('sessionBanner').classList.add('show');
        } else {
          doLogout();
        }
      }
    } catch {}
  }, 20000);
}

function stopSessionPoll() {
  if (_sessionPoll) { clearInterval(_sessionPoll); _sessionPoll = null; }
}
