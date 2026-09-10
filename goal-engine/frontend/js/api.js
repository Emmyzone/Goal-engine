/**
 * Thin fetch wrapper shared by all Goal Engine frontend pages.
 * Stores the JWT in memory + sessionStorage (never localStorage requirements here,
 * this is a plain static frontend, not a Claude artifact, so browser storage is fine).
 */
const GoalEngineAPI = (() => {
  const TOKEN_KEY = 'goal_engine_token';

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY);
  }

  function setToken(token) {
    sessionStorage.setItem(TOKEN_KEY, token);
  }

  function clearToken() {
    sessionStorage.removeItem(TOKEN_KEY);
  }

  function requireAuthOrRedirect() {
    if (!getToken()) {
      window.location.href = 'login.html';
    }
  }

  async function request(method, path, body, { auth = true } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth) {
      const token = getToken();
      if (!token) {
        window.location.href = 'login.html';
        return;
      }
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      // no body
    }

    if (res.status === 401 && auth) {
      clearToken();
      window.location.href = 'login.html';
      return;
    }

    if (!res.ok) {
      const message = (data && data.error) || `Request failed (${res.status})`;
      throw new Error(message);
    }

    return data;
  }

  return {
    get: (path, opts) => request('GET', path, undefined, opts),
    post: (path, body, opts) => request('POST', path, body, opts),
    setToken,
    getToken,
    clearToken,
    requireAuthOrRedirect,
  };
})();
