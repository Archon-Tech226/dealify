/* ========================================
   DEALIFY - Core Application JavaScript
   app.js — Shared utilities for all pages
   ======================================== */

// ─── Configuration ────────────────────────────────────────
const isLocalHost =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1';

const API_BASE_URL =
  window.__APP_CONFIG__?.API_BASE_URL ||
  localStorage.getItem('dealify_api_base_url') ||
  (isLocalHost ? 'http://localhost:5000/api' : '/api');

let isRefreshingToken = false;
let refreshPromise = null;

async function tryRefreshAccessToken() {
  if (isRefreshingToken && refreshPromise) {
    return refreshPromise;
  }

  isRefreshingToken = true;
  refreshPromise = fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  })
    .then(async (res) => {
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.success || !payload?.data?.token) {
        return false;
      }

      const auth = getAuth();
      if (!auth?.user) return false;
      saveAuth({
        token: payload.data.token,
        user: auth.user,
        seller: auth.seller || null,
      });
      return true;
    })
    .catch(() => false)
    .finally(() => {
      isRefreshingToken = false;
      refreshPromise = null;
    });

  return refreshPromise;
}

// ─── API Helper ───────────────────────────────────────────
// Supports both calling conventions:
//   apiCall('/url', 'POST', { body })   — 3 args
//   apiCall('/url', { method, body })   — 2 args (options object)
//   apiCall('/url')                     — GET request
async function apiCall(endpoint, methodOrOptions = {}, bodyArg) {
  // Normalize arguments: support apiCall(url, method, body) shorthand
  let options = {};
  if (typeof methodOrOptions === 'string') {
    options = { method: methodOrOptions, body: bodyArg };
  } else {
    options = methodOrOptions;
  }

  const auth = getAuth();
  const buildHeaders = (currentAuth) => ({
    'Content-Type': 'application/json',
    ...(options.headers || {}),
    ...(currentAuth && currentAuth.token
      ? { Authorization: `Bearer ${currentAuth.token}` }
      : {}),
  });

  let headers = buildHeaders(auth);

  // If body is FormData, remove Content-Type so browser sets boundary
  if (options.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  try {
    const makeRequest = (customHeaders) => fetch(`${API_BASE_URL}${endpoint}`, {
      method: options.method || 'GET',
      headers: customHeaders,
      credentials: 'include',
      body: options.body
        ? options.body instanceof FormData
          ? options.body
          : JSON.stringify(options.body)
        : undefined,
    });

    let response = await makeRequest(headers);
    if (response.status === 401) {
      const refreshed = await tryRefreshAccessToken();
      if (refreshed) {
        headers = buildHeaders(getAuth());
        if (options.body instanceof FormData) delete headers['Content-Type'];
        response = await makeRequest(headers);
      }
    }

    const data = await response.json();

    if (!response.ok) {
      // Handle 401 — token expired or invalid
      if (response.status === 401) {
        clearAuth();
        showToast('Session expired. Please login again.', 'error');
        setTimeout(() => {
          window.location.href = getAuthPagePath('login.html');
        }, 1500);
        return null;
      }

      const errorMsg =
        data.errors && data.errors.length
          ? data.errors.map((e) => e.msg || e.message).join(', ')
          : data.message || 'Something went wrong';

      showToast(errorMsg, 'error');
      return null;
    }

    return data;
  } catch (error) {
    console.error('API Error:', error);
    showToast('Network error. Please check your connection.', 'error');
    return null;
  }
}

// ─── Auth Token Management (localStorage) ─────────────────
function saveAuth(data) {
  const authData = {
    token: data.token,
    user: data.user || data.data?.user,
    seller: data.seller || data.data?.seller || null,
  };
  localStorage.setItem('dealify_auth', JSON.stringify(authData));
}

function getAuth() {
  try {
    const raw = localStorage.getItem('dealify_auth');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearAuth() {
  localStorage.removeItem('dealify_auth');
}

async function logout() {
  try {
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (_) {
  }

  clearAuth();
  showToast('Logged out successfully', 'success');
  setTimeout(() => {
    window.location.href = getBasePath() + 'index.html';
  }, 800);
}

function isLoggedIn() {
  const auth = getAuth();
  return auth && auth.token && auth.user;
}

// ─── Role-based Redirect Helpers ──────────────────────────
function getDashboardUrl(role) {
  const base = getBasePath();
  switch (role) {
    case 'admin':
      return base + 'pages/admin/dashboard.html';
    case 'seller':
      return base + 'pages/seller/dashboard.html';
    case 'buyer':
    default:
      return base + 'pages/buyer/dashboard.html';
  }
}

// Determine relative base path from current page to frontend root
function getBasePath() {
  const path = window.location.pathname;
  if (path.includes('/pages/auth/')) return '../../';
  if (path.includes('/pages/buyer/')) return '../../';
  if (path.includes('/pages/seller/')) return '../../';
  if (path.includes('/pages/admin/')) return '../../';
  if (path.includes('/pages/')) return '../';
  return '';
}

function getAuthPagePath(page) {
  return getBasePath() + 'pages/auth/' + page;
}

// ─── Navbar Auth State ────────────────────────────────────
function checkAuthState() {
  const auth = getAuth();

  // Pattern 1: index.html uses #navLoggedOut / #navLoggedIn containers
  const navLoggedOut = document.getElementById('navLoggedOut');
  const navLoggedIn = document.getElementById('navLoggedIn');

  // Pattern 2: other pages may use #loginBtn / #signupBtn + .user-dropdown
  const loginBtn = document.getElementById('loginBtn');
  const signupBtn = document.getElementById('signupBtn');
  const userDropdown = document.querySelector('.user-dropdown');

  // If none of these exist, nothing to toggle
  if (!navLoggedOut && !navLoggedIn && !loginBtn && !userDropdown) return;

  if (auth && auth.token) {
    // Logged in
    if (navLoggedOut) navLoggedOut.style.display = 'none';
    if (navLoggedIn) { navLoggedIn.style.display = 'flex'; navLoggedIn.classList.remove('hidden'); }
    if (loginBtn) loginBtn.style.display = 'none';
    if (signupBtn) signupBtn.style.display = 'none';
    if (userDropdown) userDropdown.style.display = 'flex';

    // Set user name
    const nameEl = document.getElementById('navUserName');
    if (nameEl && auth.user) {
      nameEl.textContent = (auth.user.name || 'User').split(' ')[0];
    }

    // Set dashboard link based on role
    const dashLink = document.getElementById('navDashboardLink');
    if (dashLink && auth.user) {
      dashLink.href = getDashboardUrl(auth.user.role);
    }
  } else {
    // Not logged in
    if (navLoggedOut) navLoggedOut.style.display = 'flex';
    if (navLoggedIn) { navLoggedIn.style.display = 'none'; navLoggedIn.classList.add('hidden'); }
    if (loginBtn) loginBtn.style.display = '';
    if (signupBtn) signupBtn.style.display = '';
    if (userDropdown) userDropdown.style.display = 'none';
  }
}

// ─── Toast Notification System ────────────────────────────
function showToast(message, type = 'info', duration = 4000) {
  const container =
    document.getElementById('toastContainer') || createToastContainer();

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
  };

  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-message">${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">×</button>
  `;

  container.appendChild(toast);

  // Auto remove
  setTimeout(() => {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function createToastContainer() {
  const container = document.createElement('div');
  container.className = 'toast-container';
  container.id = 'toastContainer';
  document.body.appendChild(container);
  return container;
}

// ─── Form Helpers ─────────────────────────────────────────
function showFieldError(fieldId, message) {
  const field = document.getElementById(fieldId);
  if (!field) return;
  field.classList.add('input-error');
  let errorEl = field.parentElement.querySelector('.field-error');
  if (!errorEl) {
    errorEl = document.createElement('span');
    errorEl.className = 'field-error';
    errorEl.style.cssText =
      'color:var(--error);font-size:0.75rem;margin-top:4px;display:block;';
    field.parentElement.appendChild(errorEl);
  }
  errorEl.textContent = message;
}

function clearFieldError(fieldId) {
  const field = document.getElementById(fieldId);
  if (!field) return;
  field.classList.remove('input-error');
  const errorEl = field.parentElement.querySelector('.field-error');
  if (errorEl) errorEl.remove();
}

function clearAllFieldErrors() {
  document.querySelectorAll('.input-error').forEach((el) => {
    el.classList.remove('input-error');
  });
  document.querySelectorAll('.field-error').forEach((el) => el.remove());
}

// ─── Utility Helpers ──────────────────────────────────────
function formatPrice(price) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(price);
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function truncate(str, len = 50) {
  if (!str) return '';
  return str.length > len ? str.substring(0, len) + '...' : str;
}

function debounce(func, wait = 300) {
  let timeout;
  return function executedFunction(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// ─── Loading State ────────────────────────────────────────
function setLoading(btn, loading = true) {
  if (!btn) return;
  if (loading) {
    btn.dataset.originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Please wait...';
    btn.disabled = true;
    btn.classList.add('btn-loading');
  } else {
    btn.innerHTML = btn.dataset.originalText || btn.innerHTML;
    btn.disabled = false;
    btn.classList.remove('btn-loading');
  }
}

// ─── Initialize on DOM Ready (for landing/shared pages) ──
document.addEventListener('DOMContentLoaded', () => {
  checkAuthState();

  // User dropdown toggle (landing page navbar)
  const dropdownBtn = document.getElementById('userDropdownBtn');
  const dropdownMenu = document.getElementById('userDropdownMenu');
  if (dropdownBtn && dropdownMenu) {
    dropdownBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdownMenu.classList.toggle('active');
    });
    document.addEventListener('click', () => {
      dropdownMenu.classList.remove('active');
    });
  }
});

