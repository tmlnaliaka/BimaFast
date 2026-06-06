/**
 * BimaFast — Authentication Module
 * ==================================
 * Handles login screen rendering, credential verification via server,
 * session management, and portal gating.
 */

'use strict';

const Auth = (() => {
  const SESSION_KEY = 'bimafast_session';

  // ── Session Management ─────────────────────────────────────────────────────
  function getSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      // Check expiry
      if (session.exp && Date.now() > session.exp) {
        clearSession();
        return null;
      }
      return session;
    } catch { return null; }
  }

  function setSession(token, user) {
    const session = {
      token,
      user,
      exp: Date.now() + 8 * 60 * 60 * 1000, // 8-hour session
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  function isAuthenticated() {
    return getSession() !== null;
  }

  function getCurrentUser() {
    const session = getSession();
    return session ? session.user : null;
  }

  function getToken() {
    const session = getSession();
    return session ? session.token : null;
  }

  // ── Server Communication ───────────────────────────────────────────────────
  async function authenticate(role, credentials) {
    const response = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, credentials }),
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Authentication failed');
    }
    setSession(data.token, data.user);
    return data.user;
  }

  async function fetchGeminiKey() {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');

    const response = await fetch('/api/gemini-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to fetch API key');
    return data.key;
  }

  function logout() {
    clearSession();
    showLoginScreen();
  }

  // ── Login Screen ───────────────────────────────────────────────────────────
  function createLoginScreen() {
    const overlay = document.createElement('div');
    overlay.id = 'auth-screen';
    overlay.className = 'auth-screen';
    overlay.innerHTML = `
      <div class="auth-bg-effects" aria-hidden="true">
        <div class="auth-orb auth-orb-1"></div>
        <div class="auth-orb auth-orb-2"></div>
        <div class="auth-orb auth-orb-3"></div>
      </div>

      <div class="auth-container">
        <div class="auth-brand">
          <div class="auth-logo">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <path d="m9 12 2 2 4-4"/>
            </svg>
          </div>
          <h1 class="auth-title">BimaFast</h1>
          <p class="auth-subtitle">Embedded Daily Micro-Insurance for Gig Workers</p>
        </div>

        <!-- Role Selector Tabs -->
        <div class="auth-role-tabs">
          <button class="auth-role-tab active" data-role="rider" onclick="Auth.switchLoginTab('rider')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>
            Rider
          </button>
          <button class="auth-role-tab" data-role="hospital" onclick="Auth.switchLoginTab('hospital')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14h-5v5h-4v-5H5v-4h5V5h4v5h5z"/></svg>
            Hospital
          </button>
          <button class="auth-role-tab" data-role="admin" onclick="Auth.switchLoginTab('admin')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            Admin
          </button>
        </div>

        <!-- Login Forms -->
        <div class="auth-forms-wrapper">

          <!-- Rider Login -->
          <div id="auth-form-rider" class="auth-form active">
            <div class="auth-form-header">
              <h2>Rider Login</h2>
              <p>Enter your phone number and PIN to access your dashboard</p>
            </div>
            <div class="auth-field">
              <label for="auth-rider-phone">Phone Number</label>
              <div class="auth-input-icon-wrap">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
                <input type="tel" id="auth-rider-phone" class="auth-input" placeholder="+254 712 345 678" value="+254712345678" autocomplete="tel" />
              </div>
            </div>
            <div class="auth-field">
              <label for="auth-rider-pin">4-Digit PIN</label>
              <div class="auth-pin-group">
                <input type="password" maxlength="1" class="auth-pin-box" data-pin="rider" inputmode="numeric" pattern="[0-9]" />
                <input type="password" maxlength="1" class="auth-pin-box" data-pin="rider" inputmode="numeric" pattern="[0-9]" />
                <input type="password" maxlength="1" class="auth-pin-box" data-pin="rider" inputmode="numeric" pattern="[0-9]" />
                <input type="password" maxlength="1" class="auth-pin-box" data-pin="rider" inputmode="numeric" pattern="[0-9]" />
              </div>
            </div>
            <div id="auth-error-rider" class="auth-error hidden"></div>
            <button class="auth-submit-btn" id="auth-submit-rider" onclick="Auth.submitLogin('rider')">
              <span class="auth-btn-text">Sign In</span>
              <div class="auth-btn-spinner hidden"></div>
            </button>
          </div>

          <!-- Hospital Login -->
          <div id="auth-form-hospital" class="auth-form hidden">
            <div class="auth-form-header">
              <h2>Hospital Terminal</h2>
              <p>Enter your facility code and access PIN</p>
            </div>
            <div class="auth-field">
              <label for="auth-hospital-code">Facility Code</label>
              <div class="auth-input-icon-wrap">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14h-5v5h-4v-5H5v-4h5V5h4v5h5z"/></svg>
                <input type="text" id="auth-hospital-code" class="auth-input" placeholder="HOSP-2024" value="HOSP-2024" autocomplete="off" />
              </div>
            </div>
            <div class="auth-field">
              <label for="auth-hospital-pin">Access PIN</label>
              <div class="auth-pin-group">
                <input type="password" maxlength="1" class="auth-pin-box" data-pin="hospital" inputmode="numeric" pattern="[0-9]" />
                <input type="password" maxlength="1" class="auth-pin-box" data-pin="hospital" inputmode="numeric" pattern="[0-9]" />
                <input type="password" maxlength="1" class="auth-pin-box" data-pin="hospital" inputmode="numeric" pattern="[0-9]" />
                <input type="password" maxlength="1" class="auth-pin-box" data-pin="hospital" inputmode="numeric" pattern="[0-9]" />
              </div>
            </div>
            <div id="auth-error-hospital" class="auth-error hidden"></div>
            <button class="auth-submit-btn" id="auth-submit-hospital" onclick="Auth.submitLogin('hospital')">
              <span class="auth-btn-text">Access Terminal</span>
              <div class="auth-btn-spinner hidden"></div>
            </button>
          </div>

          <!-- Admin Login -->
          <div id="auth-form-admin" class="auth-form hidden">
            <div class="auth-form-header">
              <h2>Admin Console</h2>
              <p>Secure access for platform administrators</p>
            </div>
            <div class="auth-field">
              <label for="auth-admin-user">Username</label>
              <div class="auth-input-icon-wrap">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                <input type="text" id="auth-admin-user" class="auth-input" placeholder="admin" value="admin" autocomplete="username" />
              </div>
            </div>
            <div class="auth-field">
              <label for="auth-admin-pass">Password</label>
              <div class="auth-input-icon-wrap">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                <input type="password" id="auth-admin-pass" class="auth-input" placeholder="••••••••••" autocomplete="current-password" />
              </div>
            </div>
            <div id="auth-error-admin" class="auth-error hidden"></div>
            <button class="auth-submit-btn" id="auth-submit-admin" onclick="Auth.submitLogin('admin')">
              <span class="auth-btn-text">Sign In to Console</span>
              <div class="auth-btn-spinner hidden"></div>
            </button>
          </div>

        </div>

        <div class="auth-footer">
          <p>Powered by <strong>Gemini AI</strong> · Secured with server-side authentication</p>
        </div>
      </div>
    `;
    return overlay;
  }

  function showLoginScreen() {
    // Hide main app, show login
    const mainApp = document.getElementById('main-app-wrapper');
    if (mainApp) mainApp.classList.add('hidden');

    let authScreen = document.getElementById('auth-screen');
    if (!authScreen) {
      authScreen = createLoginScreen();
      document.body.prepend(authScreen);
      initPinInputs();
      initEnterKeySubmit();
    }
    authScreen.classList.remove('hidden');
  }

  function hideLoginScreen() {
    const authScreen = document.getElementById('auth-screen');
    if (authScreen) authScreen.classList.add('hidden');

    const mainApp = document.getElementById('main-app-wrapper');
    if (mainApp) mainApp.classList.remove('hidden');
  }

  // ── Tab Switching ──────────────────────────────────────────────────────────
  function switchLoginTab(role) {
    // Tabs
    document.querySelectorAll('.auth-role-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.role === role);
    });
    // Forms
    document.querySelectorAll('.auth-form').forEach(form => {
      const formRole = form.id.replace('auth-form-', '');
      form.classList.toggle('active', formRole === role);
      form.classList.toggle('hidden', formRole !== role);
    });
    // Clear errors
    document.querySelectorAll('.auth-error').forEach(el => el.classList.add('hidden'));
  }

  // ── PIN Input Behavior ─────────────────────────────────────────────────────
  function initPinInputs() {
    document.querySelectorAll('.auth-pin-box').forEach((box, idx, all) => {
      box.addEventListener('input', () => {
        if (box.value.length === 1 && idx < all.length - 1) {
          // Find next box in same group
          const group = box.dataset.pin;
          const groupBoxes = [...document.querySelectorAll(`.auth-pin-box[data-pin="${group}"]`)];
          const myIdx = groupBoxes.indexOf(box);
          if (myIdx < groupBoxes.length - 1) groupBoxes[myIdx + 1].focus();
        }
      });

      box.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !box.value) {
          const group = box.dataset.pin;
          const groupBoxes = [...document.querySelectorAll(`.auth-pin-box[data-pin="${group}"]`)];
          const myIdx = groupBoxes.indexOf(box);
          if (myIdx > 0) {
            groupBoxes[myIdx - 1].focus();
            groupBoxes[myIdx - 1].value = '';
          }
        }
      });

      // Only allow digits
      box.addEventListener('beforeinput', (e) => {
        if (e.data && !/^\d$/.test(e.data)) e.preventDefault();
      });
    });
  }

  // ── Enter-key Submit ───────────────────────────────────────────────────────
  function initEnterKeySubmit() {
    document.querySelectorAll('.auth-input, .auth-pin-box').forEach(input => {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const activeForm = document.querySelector('.auth-form.active');
          if (activeForm) {
            const role = activeForm.id.replace('auth-form-', '');
            submitLogin(role);
          }
        }
      });
    });
  }

  // ── PIN Collector ──────────────────────────────────────────────────────────
  function collectPin(role) {
    const boxes = document.querySelectorAll(`.auth-pin-box[data-pin="${role}"]`);
    return [...boxes].map(b => b.value).join('');
  }

  // ── Submit Login ───────────────────────────────────────────────────────────
  async function submitLogin(role) {
    const btn = document.getElementById(`auth-submit-${role}`);
    const errorEl = document.getElementById(`auth-error-${role}`);
    const spinner = btn.querySelector('.auth-btn-spinner');
    const btnText = btn.querySelector('.auth-btn-text');

    errorEl.classList.add('hidden');
    btn.disabled = true;
    spinner.classList.remove('hidden');
    btnText.textContent = 'Authenticating...';

    let credentials = {};
    try {
      switch (role) {
        case 'rider':
          credentials = {
            phone: document.getElementById('auth-rider-phone').value.trim(),
            pin: collectPin('rider'),
          };
          if (credentials.pin.length !== 4) throw new Error('Please enter your full 4-digit PIN');
          break;
        case 'hospital':
          credentials = {
            code: document.getElementById('auth-hospital-code').value.trim(),
            pin: collectPin('hospital'),
          };
          if (credentials.pin.length !== 4) throw new Error('Please enter your full 4-digit PIN');
          break;
        case 'admin':
          credentials = {
            username: document.getElementById('auth-admin-user').value.trim(),
            password: document.getElementById('auth-admin-pass').value,
          };
          if (!credentials.password) throw new Error('Please enter your password');
          break;
      }

      const user = await authenticate(role, credentials);
      hideLoginScreen();

      // Notify the main app that auth succeeded
      if (typeof window.onAuthSuccess === 'function') {
        window.onAuthSuccess(user);
      }

    } catch (err) {
      errorEl.textContent = err.message || 'Authentication failed';
      errorEl.classList.remove('hidden');

      // Shake animation
      const formCard = document.getElementById(`auth-form-${role}`);
      formCard.classList.add('auth-shake');
      setTimeout(() => formCard.classList.remove('auth-shake'), 500);
    } finally {
      btn.disabled = false;
      spinner.classList.add('hidden');
      const labels = { rider: 'Sign In', hospital: 'Access Terminal', admin: 'Sign In to Console' };
      btnText.textContent = labels[role];
    }
  }

  // ── Init Check ─────────────────────────────────────────────────────────────
  function init() {
    if (isAuthenticated()) {
      hideLoginScreen();
      const user = getCurrentUser();
      if (typeof window.onAuthSuccess === 'function') {
        window.onAuthSuccess(user);
      }
    } else {
      showLoginScreen();
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  return {
    init,
    getSession,
    isAuthenticated,
    getCurrentUser,
    getToken,
    fetchGeminiKey,
    logout,
    switchLoginTab,
    submitLogin,
    showLoginScreen,
    hideLoginScreen,
  };
})();

// Auto-initialize Auth system on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  Auth.init();
});
