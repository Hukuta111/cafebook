// ═══════════════════════════════════════════
// API CLIENT
// ═══════════════════════════════════════════
const API = {
  token: null,

  headers() {
    return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + this.token };
  },

  async req(method, path, body) {
    showLoader(true);
    try {
      const res = await fetch('/api' + path, {
        method,
        headers: this.headers(),
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.status === 401) { doLogout(); return null; }
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) return null;
      return await res.json();
    } catch (e) {
      showToast('Ошибка сети: ' + e.message, true);
      return null;
    } finally {
      showLoader(false);
    }
  },

  get: (path) => API.req('GET', path),
  post: (path, body) => API.req('POST', path, body),
  put: (path, body) => API.req('PUT', path, body),
  del: (path) => API.req('DELETE', path),
};

