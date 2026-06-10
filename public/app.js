/**
 * BimaFast — App Logic + Gemini AI Integration
 * =============================================
 * Three portals: Rider | Hospital | Admin
 * Three Gemini features: Claim Auditor | Bima Chatbot | Risk Advisor
 */

'use strict';

// ============================================================
// STATE ENGINE
// ============================================================
const STATE_KEY = 'bimafast_state_v2';

const defaultState = {
  rider: {
    name: 'John Kamau',
    phone: '+254712345678',
    wallet: 2500,
    coverageExpiry: 0,          // Unix timestamp ms
    totalPremiumsPaid: 0,
    transactionLog: [],
    claims: [],
  },
  hospital: {
    admissions: [],             // Active/past admissions
  },
  admin: {
    premiumRate: 25,            // KES per ride
    payoutPerNight: 5000,       // KES per night
    totalPremiumsCollected: 0,
    totalBenefitsPaid: 0,
    activePolicies: 0,
    eventStream: [],
  },
  gemini: {
    apiKey: '',
    mode: 'live',                  // 'offline' | 'live'
    modelName: 'gemini-3.0-flash',
  },
  chatHistory: [],              // AI chat message history
};

let state = loadState();

function loadState() {
  try {
    const saved = localStorage.getItem(STATE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Merge with defaults to handle schema changes
      return deepMerge(defaultState, parsed);
    }
  } catch (e) { /* ignore */ }
  return JSON.parse(JSON.stringify(defaultState));
}

function saveState() {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
}

function deepMerge(target, source) {
  const out = Object.assign({}, target);
  for (const key in source) {
    if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      out[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      out[key] = source[key];
    }
  }
  return out;
}

// ============================================================
// PORTAL NAVIGATION
// ============================================================
function switchPortal(portal) {
  if (!Auth.isAuthenticated()) {
    Auth.showLoginScreen();
    return;
  }
  
  const user = Auth.getCurrentUser();
  
  // Gate access based on role
  if (user.role !== 'admin' && user.role !== portal) {
    showGlobalToast(`Access Denied: Your role (${user.role}) cannot access the ${portal} portal.`, 'error');
    return;
  }
  
  document.querySelectorAll('.portal').forEach(el => {
    el.classList.remove('active');
    el.classList.add('hidden');
  });
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.remove('active');
    btn.setAttribute('aria-pressed', 'false');
  });
  
  // Update header navigation visibility based on role
  const navRider = document.getElementById('nav-rider');
  const navHospital = document.getElementById('nav-hospital');
  const navAdmin = document.getElementById('nav-admin');
  
  if (navRider) navRider.style.display = (user.role === 'rider' || user.role === 'admin') ? 'flex' : 'none';
  if (navHospital) navHospital.style.display = (user.role === 'hospital' || user.role === 'admin') ? 'flex' : 'none';
  if (navAdmin) navAdmin.style.display = (user.role === 'admin') ? 'flex' : 'none';
  
  const targetPortal = document.getElementById(`portal-${portal}`);
  if (targetPortal) {
    targetPortal.classList.add('active');
    targetPortal.classList.remove('hidden');
  }
  
  const targetNav = document.getElementById(`nav-${portal}`);
  if (targetNav) {
    targetNav.classList.add('active');
    targetNav.setAttribute('aria-pressed', 'true');
  }
}

function switchPhoneTab(tab) {
  ['home', 'claims', 'chat'].forEach(t => {
    document.getElementById(`phone-${t}`).classList.toggle('hidden', t !== tab);
    document.getElementById(`phone-${t}`).classList.toggle('active', t === tab);
    const btn = document.getElementById(`ptab-${t}`);
    btn.classList.toggle('active', t === tab);
    btn.setAttribute('aria-pressed', t === tab ? 'true' : 'false');
  });
  if (tab === 'chat') updateChatModeBadge();
}

// ============================================================
// GEMINI API CONFIGURATION
// ============================================================
let geminiApiKey = '';

async function loadGeminiApiKey() {
  try {
    const info = await Auth.fetchGeminiKey();
    const available = info && info.available;
    geminiApiKey = '';
    state.gemini.apiKey = '';
    state.gemini.mode = available ? 'live' : 'offline';
  } catch (err) {
    console.warn('Could not load server-side Gemini API key:', err);
    geminiApiKey = '';
    state.gemini.apiKey = '';
    state.gemini.mode = 'offline';
  }
  updateApiStatusUI();
}

async function fetchConfig() {
  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      const config = await res.json();
      state.admin.premiumRate = config.defaultPremium || state.admin.premiumRate;
      state.admin.payoutPerNight = config.defaultPayoutNight || state.admin.payoutPerNight;
      state.rider.phone = config.riderDefaultPhone || state.rider.phone;
      state.gemini.modelName = config.geminiModel || state.gemini.modelName;
    }
  } catch (err) {
    console.error('Failed to load server configurations:', err);
  }
}

function updateSessionHeaderUI(user) {
  if (!user) return;
  const avatar = document.getElementById('session-avatar');
  const name = document.getElementById('session-name');
  const role = document.getElementById('session-role');
  
  const initials = user.name
    ? user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
    : '??';
  
  if (avatar) avatar.textContent = initials;
  if (name) name.textContent = user.name || 'User';
  if (role) role.textContent = user.role ? user.role.toUpperCase() : 'USER';
}

window.onAuthSuccess = async (user) => {
  updateSessionHeaderUI(user);
  await fetchConfig();
  await loadGeminiApiKey();
  switchPortal(user.role);
  renderAll();
};



function updateApiStatusUI() {
  const isLive = state.gemini.mode === 'live';
  const dot = document.getElementById('api-status-dot');
  const label = document.getElementById('api-status-label');
  if (dot) dot.className = `api-dot ${isLive ? 'dot-live' : 'dot-offline'}`;
  if (label) label.textContent = isLive ? 'Live AI' : 'AI Offline';
  updateChatModeBadge();
  
  ['audit-mode-tag', 'risk-mode-tag'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = isLive ? 'LIVE' : 'OFFLINE';
      el.className = `audit-mode-tag ${isLive ? 'live' : ''}`;
    }
  });
}

function updateChatModeBadge() {
  const badge = document.getElementById('chat-mode-badge');
  if (!badge) return;
  const isLive = state.gemini.mode === 'live';
  badge.textContent = isLive ? 'LIVE' : 'OFFLINE';
  badge.className = `chat-mode-badge ${isLive ? 'live' : 'offline'}`;
}

// ============================================================
// GEMINI API CORE CALLER
// ============================================================
async function callGeminiAPI(prompt, systemInstruction = '', responseSchema = null) {
  const modelToUse = state.gemini.modelName || 'gemini-3.0-flash';

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  const maxAttempts = 3;
  const baseDelay = 400; // ms
  let lastErr = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, systemInstruction, responseSchema, modelName: modelToUse }),
      });

      const text = await response.text();

      if (!response.ok) {
        const message = text || `HTTP ${response.status}`;
        if (response.status === 429 || String(message).toLowerCase().includes('quota') || String(message).toLowerCase().includes('rate-limit')) {
          state.gemini.mode = 'offline';
          updateApiStatusUI();
          showGlobalToast('Gemini quota exceeded or rate-limited — switched to offline mode. Please check billing or rotate the API key.', 'error');
          throw new Error('GEMINI_QUOTA_EXCEEDED: ' + message);
        }
        throw new Error(message);
      }

      try {
        const data = JSON.parse(text);
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) throw new Error('Empty response from Gemini');
        return rawText;
      } catch (e) {
        // Non-JSON or unexpected shape; return raw text
        return text;
      }
    } catch (err) {
      lastErr = err;
      console.warn(`Gemini proxy attempt ${attempt} failed:`, err && err.message ? err.message : err);
      if (attempt < maxAttempts) {
        const wait = baseDelay * Math.pow(2, attempt - 1);
        await sleep(wait);
        continue;
      }

      // All retries exhausted — live Gemini is unavailable
      console.error('All Gemini attempts failed.', lastErr);
      state.gemini.mode = 'offline';
      updateApiStatusUI();
      showGlobalToast('All AI attempts failed. Live Gemini is not available at the moment.', 'error');
      throw lastErr;
    }
  }
}

// ============================================================
// FEATURE 1: AI CLAIM AUDITOR
// ============================================================
function setAdmissionMode(mode) {
  const isAI = mode === 'ai';
  document.getElementById('structured-admission-panel').classList.toggle('hidden', isAI);
  document.getElementById('ai-audit-panel').classList.toggle('hidden', !isAI);
  document.getElementById('mode-structured').classList.toggle('active', !isAI);
  document.getElementById('mode-ai').classList.toggle('active', isAI);
  document.getElementById('mode-structured').setAttribute('aria-pressed', !isAI);
  document.getElementById('mode-ai').setAttribute('aria-pressed', isAI);
}

async function executeAuditLogic(doctorNote) {
  const systemInstruction = `You are a medical claims auditor AI for BimaFast micro-insurance in Kenya.
Your task is to extract structured admission data from a raw doctor's clinical note.
You MUST return ONLY valid JSON matching the specified schema.
Be conservative: if data is ambiguous, prefer lower claim amounts.
Payout rate is KES ${state.admin.payoutPerNight} per night of admission.`;

  const responseSchema = {
    type: 'object',
    properties: {
      patient_name: { type: 'string' },
      diagnosis: { type: 'string' },
      admission_nights: { type: 'integer' },
      clinical_indicators: { type: 'array', items: { type: 'string' } },
      claim_decision: { type: 'string', enum: ['APPROVED', 'REJECTED'] },
      confidence_score: { type: 'number' },
      payout_amount_kes: { type: 'integer' },
      rejection_reason: { type: 'string', nullable: true },
    },
    required: ['patient_name', 'diagnosis', 'admission_nights', 'claim_decision', 'payout_amount_kes'],
  };

  const prompt = `Parse this doctor's discharge note and extract admission details for insurance claim processing:

---
${doctorNote}
---

Payout rate: KES ${state.admin.payoutPerNight} per night.
Extract: patient name, diagnosis, number of admitted nights, clinical evidence, and make an APPROVED or REJECTED decision.
If nights > 14 or diagnosis is unclear, REJECT the claim.`;

  const rawResponse = await callGeminiAPI(prompt, systemInstruction, responseSchema);
  const auditResult = JSON.parse(rawResponse.trim());
  auditResult.payout_amount_kes = auditResult.admission_nights * state.admin.payoutPerNight;
  return auditResult;
}

async function runAiAudit() {
  const doctorNote = document.getElementById('doctor-note-input').value.trim();
  if (!doctorNote) {
    showAdmitResult('ai-admit-result', 'error', 'Please paste a doctor\'s discharge note to audit.');
    return;
  }

  const btn = document.getElementById('ai-audit-btn');
  const spinner = document.getElementById('audit-spinner');
  btn.disabled = true;
  spinner.classList.remove('hidden');
  hideElement('ai-admit-result');
  hideElement('ai-audit-log');

  addEvent('ai', 'ai', `AI Claim Auditor started analyzing doctor's note...`);

  try {
    const isLive = state.gemini.mode === 'live';
    const auditResult = await executeAuditLogic(doctorNote);

    // Display the audit console
    displayAuditLog(auditResult, isLive);

    if (auditResult.claim_decision === 'APPROVED') {
      const payout = auditResult.payout_amount_kes;
      state.rider.wallet += payout;
      state.admin.totalBenefitsPaid += payout;
      state.admin.totalPremiumsCollected += state.rider.totalPremiumsPaid;

      const claim = {
        id: Date.now(),
        diagnosis: auditResult.diagnosis,
        nights: auditResult.admission_nights,
        amount: payout,
        status: 'approved',
        method: 'AI Audit (Hospital)',
        date: new Date().toLocaleDateString('en-KE'),
      };
      state.rider.claims.unshift(claim);
      saveState();

      showAdmitResult('ai-admit-result', 'success',
        `AI Claim APPROVED! ${auditResult.patient_name} — ${auditResult.diagnosis} — ${auditResult.admission_nights} nights.\nKES ${payout.toLocaleString()} disbursed to M-Pesa wallet!`);
      addEvent('payout', 'payout', `AI audit approved. KES ${payout.toLocaleString()} M-Pesa payout → ${state.rider.name}`);
      renderAll();
    } else {
      showAdmitResult('ai-admit-result', 'error',
        `AI Claim REJECTED: ${auditResult.rejection_reason || 'Insufficient clinical evidence or policy criteria not met.'}`);
      addEvent('rejection', 'rejection', `AI audit rejected claim: ${auditResult.rejection_reason || 'Policy criteria not met'}`);
    }

  } catch (err) {
    if (err.message === 'NO_API_KEY') {
      showAdmitResult('ai-admit-result', 'error', 'No Gemini API key configured on the server. Please contact your system administrator.');
    } else {
      showAdmitResult('ai-admit-result', 'error', `Gemini API Error: ${err.message}. Please contact your system administrator.`);
    }
    addEvent('ai', 'warning', `Gemini API error: ${err.message}`);
  } finally {
    btn.disabled = false;
    spinner.classList.add('hidden');
  }
}

function displayAuditLog(result, isLive) {
  const logEl = document.getElementById('ai-audit-log');
  const jsonEl = document.getElementById('audit-json-output');
  const validationEl = document.getElementById('audit-validation-result');
  const modeTag = document.getElementById('audit-mode-tag');

  jsonEl.textContent = JSON.stringify(result, null, 2);
  modeTag.textContent = isLive ? 'LIVE' : 'OFFLINE';
  modeTag.className = `audit-mode-tag ${isLive ? 'live' : ''}`;

  const isApproved = result.claim_decision === 'APPROVED';
  validationEl.className = `audit-validation-result ${isApproved ? 'valid' : 'invalid'}`;
  validationEl.innerHTML = isApproved
    ? `<strong>APPROVED</strong> — ${result.admission_nights} nights × KES ${state.admin.payoutPerNight.toLocaleString()} = <strong>KES ${result.payout_amount_kes.toLocaleString()}</strong> (Confidence: ${Math.round((result.confidence_score || 0.9) * 100)}%)`
    : `<strong>REJECTED</strong> — ${result.rejection_reason || 'Insufficient clinical evidence'}`;

  logEl.classList.remove('hidden');
}

function toggleRiderClaimForm() {
  const panel = document.getElementById('rider-claim-form-panel');
  const toggleBtn = document.getElementById('toggle-file-claim-btn');
  panel.classList.toggle('hidden');
  if (panel.classList.contains('hidden')) {
    toggleBtn.textContent = '+ File Claim';
    toggleBtn.classList.remove('active');
  } else {
    toggleBtn.textContent = 'Cancel';
    toggleBtn.classList.add('active');
    document.getElementById('rider-note-input').value = '';
    document.getElementById('rider-claim-result').classList.add('hidden');
  }
}

async function submitRiderClaim() {
  const note = document.getElementById('rider-note-input').value.trim();
  const resultEl = document.getElementById('rider-claim-result');
  const btn = document.getElementById('rider-claim-submit-btn');
  const spinner = document.getElementById('rider-audit-spinner');

  if (!note) {
    showAdmitResult('rider-claim-result', 'error', 'Please enter a discharge note.');
    return;
  }

  btn.disabled = true;
  spinner.classList.remove('hidden');
  resultEl.classList.add('hidden');

  addEvent('ai', 'ai', `Rider John Kamau submitted a self-claim for audit.`);

  try {
    const isLive = state.gemini.mode === 'live';
    const auditResult = await executeAuditLogic(note);

    if (auditResult.claim_decision === 'APPROVED') {
      const payout = auditResult.payout_amount_kes;
      state.rider.wallet += payout;
      state.admin.totalBenefitsPaid += payout;
      state.admin.totalPremiumsCollected += state.rider.totalPremiumsPaid;

      const claim = {
        id: Date.now(),
        diagnosis: auditResult.diagnosis,
        nights: auditResult.admission_nights,
        amount: payout,
        status: 'approved',
        method: 'AI Audit (Rider)',
        date: new Date().toLocaleDateString('en-KE')
      };
      state.rider.claims.unshift(claim);
      saveState();

      showAdmitResult('rider-claim-result', 'success', `Claim Approved! KES ${payout.toLocaleString()} paid out instantly.`);
      addEvent('payout', 'payout', `Rider self-claim approved. KES ${payout.toLocaleString()} M-Pesa payout sent.`);
      renderAll();

      await simulateDelay(1500);
      toggleRiderClaimForm();
      showGlobalToast(`Claim approved: KES ${payout.toLocaleString()} sent to M-Pesa!`, 'success');
    } else {
      showAdmitResult('rider-claim-result', 'error', `Claim Rejected: ${auditResult.rejection_reason || 'Insufficient evidence.'}`);
      addEvent('rejection', 'rejection', `Rider self-claim rejected: ${auditResult.rejection_reason || 'Policy criteria not met'}`);
    }
  } catch (err) {
    showAdmitResult('rider-claim-result', 'error', `Error: ${err.message}`);
    addEvent('ai', 'warning', `Rider self-claim error: ${err.message}`);
  } finally {
    btn.disabled = false;
    spinner.classList.add('hidden');
  }
}

// ============================================================
// FEATURE 2: AI BIMA ASSISTANT CHATBOT
// ============================================================
async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  if (!message) return;
  input.value = '';
  await processChat(message);
}

async function sendQuickChat(message) {
  await processChat(message);
}

async function processChat(userMessage) {
  appendChatBubble('user', userMessage);
  state.chatHistory.push({ role: 'user', content: userMessage });

  const typingId = appendChatBubble('agent', 'Thinking...', 'typing');

  const riderContext = {
    name: state.rider.name,
    phone: state.rider.phone,
    wallet: state.rider.wallet,
    coverageActive: Date.now() < state.rider.coverageExpiry,
    coverageExpiry: state.rider.coverageExpiry,
    totalPremiumsPaid: state.rider.totalPremiumsPaid,
    premiumRate: state.admin.premiumRate,
    payoutPerNight: state.admin.payoutPerNight,
    claimsCount: state.rider.claims.length,
  };

  try {
    const systemInstruction = `You are Bima Assistant, a professional micro-insurance chatbot for BimaFast — a daily micro-health-insurance platform for gig workers in Kenya (boda-boda riders, taxi drivers, delivery workers).

RIDER CONTEXT:
- Name: ${riderContext.name}
- Phone: ${riderContext.phone}
- Wallet Balance: KES ${riderContext.wallet.toLocaleString()}
- Coverage Status: ${riderContext.coverageActive ? 'ACTIVE' : 'EXPIRED'}
- Premium Rate: KES ${riderContext.premiumRate} per ride/delivery
- Hospital Cash Benefit: KES ${riderContext.payoutPerNight.toLocaleString()} per night admitted
- Claims Filed: ${riderContext.claimsCount}
- Total Premiums Paid: KES ${riderContext.totalPremiumsPaid}

INSTRUCTIONS:
- Respond in the SAME language the user writes in (English, Swahili, or Sheng/mixed slang)
- Be warm, concise, professional, and conversational.
- Do NOT use any emojis. Keep the typography clean.
- ALWAYS use the rider's actual data (wallet, coverage status) in your answers
- For financial figures, always format in KES with commas
- Max 3-4 sentences per response`;

    // Convert history to native Gemini API multi-turn format (roles: 'user' and 'model')
    const apiHistory = state.chatHistory.slice(-8).map(h => ({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: h.content }]
    }));

    const response = await callGeminiAPI(apiHistory, systemInstruction);

    removeTypingBubble(typingId);
    appendChatBubble('agent', response);
    state.chatHistory.push({ role: 'assistant', content: response });
    if (state.chatHistory.length > 20) state.chatHistory = state.chatHistory.slice(-20);
    saveState();

  } catch (err) {
    removeTypingBubble(typingId);
    if (err.message === 'NO_API_KEY') {
      appendChatBubble('agent', 'No Gemini API key is configured on the server. Please contact your system administrator.');
    } else {
      appendChatBubble('agent', `Connection error: ${err.message}. Please contact your system administrator.`);
    }
  }
}

function formatChatMarkdown(text) {
  if (!text) return '';
  let formatted = escapeHtml(text);
  
  // 1. Fenced Code Blocks (```code```)
  formatted = formatted.replace(/```([\s\S]*?)```/g, '<pre class="audit-json-pre">$1</pre>');
  
  // 2. Inline Code (`code`)
  formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // 3. Bold (**text**)
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  
  // 4. Italics (*text*)
  formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  
  // 5. Line-by-line processing for lists
  const lines = formatted.split('\n');
  let inUl = false;
  let inOl = false;
  const processedLines = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Bullet list item
    if (line.startsWith('- ') || line.startsWith('* ')) {
      if (inOl) {
        processedLines.push('</ol>');
        inOl = false;
      }
      if (!inUl) {
        processedLines.push('<ul>');
        inUl = true;
      }
      processedLines.push(`<li>${line.substring(2)}</li>`);
    }
    // Numbered list item
    else if (/^\d+\.\s/.test(line)) {
      if (inUl) {
        processedLines.push('</ul>');
        inUl = false;
      }
      if (!inOl) {
        processedLines.push('<ol>');
        inOl = true;
      }
      const content = line.replace(/^\d+\.\s/, '');
      processedLines.push(`<li>${content}</li>`);
    }
    // Regular line
    else {
      if (inUl) {
        processedLines.push('</ul>');
        inUl = false;
      }
      if (inOl) {
        processedLines.push('</ol>');
        inOl = false;
      }
      processedLines.push(lines[i]);
    }
  }
  
  if (inUl) processedLines.push('</ul>');
  if (inOl) processedLines.push('</ol>');
  
  return processedLines.join('<br>')
    .replace(/<br><(ul|ol|li|pre|\/ul|\/ol)/g, '<$1')
    .replace(/<\/(ul|ol|pre)><br>/g, '</$1>');
}

function appendChatBubble(role, text, extra = '') {
  const container = document.getElementById('chat-messages');
  const bubble = document.createElement('div');
  const id = `bubble-${Date.now()}-${Math.random()}`;
  bubble.id = id;
  bubble.className = `chat-bubble ${role} ${extra}`;
  
  if (extra === 'typing') {
    bubble.innerHTML = `
      <div class="typing-wave" aria-label="Bima Assistant is thinking">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    `;
  } else {
    bubble.innerHTML = formatChatMarkdown(text);
  }
  
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
  return id;
}

function removeTypingBubble(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

// ============================================================
// FEATURE 3: AI ADMIN RISK ADVISOR
// ============================================================
async function runRiskAnalysis() {
  const btn = document.getElementById('risk-analysis-btn');
  const spinner = document.getElementById('risk-spinner');
  btn.disabled = true;
  spinner.classList.remove('hidden');
  hideElement('risk-report-container');

  const metrics = {
    activePolicies: state.admin.activePolicies,
    premiumsCollected: state.admin.totalPremiumsCollected,
    benefitsPaid: state.admin.totalBenefitsPaid,
    lossRatio: state.admin.totalPremiumsCollected > 0
      ? ((state.admin.totalBenefitsPaid / state.admin.totalPremiumsCollected) * 100).toFixed(1)
      : '0.0',
    premiumRate: state.admin.premiumRate,
    payoutPerNight: state.admin.payoutPerNight,
  };

  addEvent('ai', 'ai', `AI Risk Advisor analyzing portfolio: ${metrics.activePolicies} policies, Loss Ratio ${metrics.lossRatio}%`);

  try {
    const systemInstruction = `You are a senior actuarial AI advisor for BimaFast, a Kenyan micro-insurance insurtech.
You are analyzing a portfolio of daily micro-health insurance policies sold to gig workers (boda-boda, taxi, delivery).
Provide strategic risk and sustainability recommendations.
Format your response as: one headline sentence, then 4 bullet-point recommendations.
Be specific with numbers. Use KES currency. Keep it under 200 words.`;

    const prompt = `Analyze this insurance portfolio and provide risk assessment:

PORTFOLIO METRICS:
- Active Policies: ${metrics.activePolicies}
- Total Premiums Collected: KES ${metrics.premiumsCollected.toLocaleString()}
- Total Benefits Paid: KES ${metrics.benefitsPaid.toLocaleString()}
- Loss Ratio: ${metrics.lossRatio}%
- Current Premium Rate: KES ${metrics.premiumRate}/ride
- Payout Rate: KES ${metrics.payoutPerNight}/night
- Product: Rolling 24-hour health insurance for gig economy workers in Kenya

Provide: risk level (LOW/MEDIUM/HIGH), a headline, and 4 strategic recommendations.`;

    const rawResponse = await callGeminiAPI(prompt, systemInstruction);
    const report = { isRaw: true, content: rawResponse, generatedAt: new Date().toLocaleString('en-KE') };

    renderRiskReport(report);
    showElement('risk-report-container');
    addEvent('ai', 'ai', `Risk analysis complete. Report generated.`);

  } catch (err) {
    showGlobalToast(`Gemini Error: ${err.message}`, 'error');
    addEvent('ai', 'warning', `Risk analysis failed: ${err.message}`);
  } finally {
    btn.disabled = false;
    spinner.classList.add('hidden');
  }
}

function renderRiskReport(report) {
  const container = document.getElementById('risk-report-content');
  const modeTag = document.getElementById('risk-mode-tag');
  if (modeTag) {
    const isLive = state.gemini.mode === 'live';
    modeTag.textContent = isLive ? 'LIVE' : 'OFFLINE';
    modeTag.className = `audit-mode-tag ${isLive ? 'live' : ''}`;
  }

  // Raw Gemini text response
  container.innerHTML = `<div style="white-space:pre-wrap; font-size:0.78rem; line-height:1.8; color: var(--text-2);">${escapeHtml(report.content)}</div>
    <div style="margin-top:0.75rem; font-size:0.65rem; color:var(--text-3);">Generated by Gemini AI · ${report.generatedAt}</div>`;
}

// ============================================================
// STRUCTURED ADMISSION FLOW
// ============================================================
let admissionNights = 3;
function changeNights(delta) {
  admissionNights = Math.max(1, Math.min(30, admissionNights + delta));
  document.getElementById('nights-value').textContent = admissionNights;
}

async function admitPatient() {
  const phone = document.getElementById('patient-phone').value.trim();
  const diagnosis = document.getElementById('admission-diagnosis').value;
  const btn = document.getElementById('admit-btn');

  hideElement('admit-result');

  if (!phone) {
    showAdmitResult('admit-result', 'error', 'Please enter a valid patient phone number.');
    return;
  }

  // Check if rider phone matches
  const isKnownRider = phone.replace(/\s+/g, '') === state.rider.phone.replace(/\s+/g, '');
  const isActive = Date.now() < state.rider.coverageExpiry;

  if (!isKnownRider) {
    showAdmitResult('admit-result', 'error', `Phone ${phone} not found in BimaFast network. Patient is not enrolled.`);
    addEvent('rejection', 'rejection', `Admission declined — ${phone} not in network`);
    return;
  }
  if (!isActive) {
    showAdmitResult('admit-result', 'error', `Admission Declined — No Active Coverage. ${state.rider.name}'s policy has expired. Advise them to renew via a transit payment.`);
    addEvent('rejection', 'rejection', `Admission declined — ${state.rider.name} coverage expired`);
    return;
  }

  btn.disabled = true;
  addEvent('admission', 'admission', `${state.rider.name} admitted at Nairobi General — ${diagnosis}`);

  const admission = {
    id: Date.now(), phone, diagnosis,
    nights: admissionNights, status: 'processing',
    timestamp: new Date().toLocaleTimeString('en-KE'),
  };
  state.hospital.admissions.unshift(admission);
  renderAdmissionsList();

  await simulateDelay(2200);

  const payout = admissionNights * state.admin.payoutPerNight;
  state.rider.wallet += payout;
  state.admin.totalBenefitsPaid += payout;
  admission.status = 'verified';

  const claim = {
    id: Date.now(), diagnosis, nights: admissionNights,
    amount: payout, status: 'approved',
    method: 'Structured Form', date: new Date().toLocaleDateString('en-KE'),
  };
  state.rider.claims.unshift(claim);
  saveState();

  showAdmitResult('admit-result', 'success',
    `Admission verified! ${state.rider.name} — ${diagnosis} — ${admissionNights} nights.\nKES ${payout.toLocaleString()} M-Pesa payout sent!`);
  addEvent('payout', 'payout', `KES ${payout.toLocaleString()} hospital benefit → ${state.rider.name} (${diagnosis}, ${admissionNights} nights)`);

  renderAdmissionsList();
  renderWallet();
  renderClaimsList();
  updateAdminMetrics();
  btn.disabled = false;
}

function renderAdmissionsList() {
  const container = document.getElementById('admissions-list');
  if (!state.hospital.admissions.length) {
    container.innerHTML = '<div class="admissions-empty">No active admissions on record.</div>';
    return;
  }
  const statusIcon = {
    processing: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    verified:   `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
    rejected:   `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  };
  const statusLabel = {
    processing: 'Processing…',
    verified: 'Verified — Payout Sent',
    rejected: 'Rejected',
  };
  container.innerHTML = state.hospital.admissions.slice(0, 8).map(a => `
    <div class="admission-entry ${a.status}">
      <div class="admission-phone">${a.phone}</div>
      <div class="admission-diag">${a.diagnosis}</div>
      <div class="admission-nights">${a.nights} night${a.nights !== 1 ? 's' : ''} · ${a.timestamp || ''}</div>
      <div class="admission-status ${a.status}">${statusIcon[a.status] || ''} ${statusLabel[a.status] || a.status}</div>
    </div>`).join('');
}

// ============================================================
// RIDER — TRANSIT SIMULATION
// ============================================================
const RIDE_CONFIG = {
  boda:     { label: 'Boda-boda Ride',  price: 150, icon: 'boda' },
  delivery: { label: 'Delivery Job',    price: 350, icon: 'delivery' },
  taxi:     { label: 'Taxi Trip',       price: 200, icon: 'taxi' },
};

async function triggerDeduction(type) {
  const cfg = RIDE_CONFIG[type];
  const btn = document.getElementById(`btn-${type}`);
  btn.disabled = true;
  btn.style.opacity = '0.6';

  showRiderToast(`Processing ${cfg.label}...`);
  await simulateDelay(700);

  const premium = state.admin.premiumRate;
  state.rider.wallet -= premium;
  state.rider.totalPremiumsPaid += premium;
  state.admin.totalPremiumsCollected += premium;

  // Extend coverage to 24h from now (or from current expiry if still active)
  const now = Date.now();
  const base = state.rider.coverageExpiry > now ? state.rider.coverageExpiry : now;
  state.rider.coverageExpiry = base + 24 * 60 * 60 * 1000;

  if (state.admin.activePolicies === 0) state.admin.activePolicies = 1;

  state.rider.transactionLog.unshift({
    type: 'debit', icon: cfg.icon,
    text: `${cfg.label} — KES ${cfg.price} paid. Premium KES ${premium} deducted.`,
    time: new Date().toLocaleTimeString('en-KE'),
  });

  saveState();

  showRiderToast(`${cfg.label} complete! KES ${premium} premium deducted. Cover ACTIVE`, 'success');
  addEvent('premium', 'premium', `${state.rider.name} paid KES ${premium} premium (${cfg.label} KES ${cfg.price})`);

  renderAll();
  btn.disabled = false;
  btn.style.opacity = '1';
}

// ============================================================
// ADMIN CONFIG
// ============================================================
function updatePremium(val) {
  state.admin.premiumRate = parseInt(val);
  document.getElementById('premium-slider-val').textContent = val;
  document.getElementById('premium-display-rider').textContent = val;
  document.getElementById('premium-display-detail').textContent = val;
  saveState();
}

function updatePayout(val) {
  state.admin.payoutPerNight = parseInt(val);
  const formatted = parseInt(val).toLocaleString();
  document.getElementById('payout-slider-val').textContent = formatted;
  document.getElementById('payout-display').textContent = formatted;
  saveState();
}

// ============================================================
// RENDER FUNCTIONS
// ============================================================
function getIconSvg(iconKey, width = 16, height = 16) {
  const icons = {
    boda: `<svg width="${width}" height="${height}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/><path d="M12 12H9l-3-6h4l2 6z"/><path d="M12 12V8h5v4z"/></svg>`,
    delivery: `<svg width="${width}" height="${height}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
    taxi: `<svg width="${width}" height="${height}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>`,
    ai: `<svg width="${width}" height="${height}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275Z"/></svg>`,
    payout: `<svg width="${width}" height="${height}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
    admission: `<svg width="${width}" height="${height}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14h-5v5h-4v-5H5v-4h5V5h4v5h5z"/></svg>`,
    rejection: `<svg width="${width}" height="${height}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/></svg>`,
    premium: `<svg width="${width}" height="${height}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`,
    warning: `<svg width="${width}" height="${height}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    withdrawal: `<svg width="${width}" height="${height}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>`
  };
  return icons[iconKey] || '';
}

function renderSustainabilityChart() {
  const svg = document.getElementById('admin-sustainability-chart');
  if (!svg) return;
  
  const premiums = state.admin.totalPremiumsCollected || 0;
  const payouts = state.admin.totalBenefitsPaid || 0;
  const maxVal = Math.max(1000, premiums * 1.2, payouts * 1.2);
  
  const chartHeight = 110;
  const chartWidth = 320;
  const startX = 50;
  const startY = 20;
  
  const scale = chartHeight / maxVal;
  
  const hPremiums = premiums * scale;
  const hPayouts = payouts * scale;
  
  let gridLines = '';
  for (let i = 1; i <= 3; i++) {
    const yVal = startY + chartHeight - (chartHeight * i / 3);
    const labelVal = Math.round(maxVal * i / 3);
    gridLines += `
      <line x1="${startX}" y1="${yVal}" x2="${startX + chartWidth}" y2="${yVal}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="3,3" />
      <text x="${startX - 8}" y="${yVal + 4}" fill="var(--text-3)" font-size="9" text-anchor="end">${labelVal >= 1000 ? (labelVal/1000).toFixed(1) + 'k' : labelVal}</text>
    `;
  }
  
  svg.innerHTML = `
    <!-- Grid & Axes -->
    <line x1="${startX}" y1="${startY}" x2="${startX}" y2="${startY + chartHeight}" stroke="var(--border-hi)" />
    <line x1="${startX}" y1="${startY + chartHeight}" x2="${startX + chartWidth}" y2="${startY + chartHeight}" stroke="var(--border-hi)" />
    <text x="${startX - 8}" y="${startY + chartHeight + 4}" fill="var(--text-3)" font-size="9" text-anchor="end">0</text>
    
    ${gridLines}
    
    <!-- Bar 1: Premiums -->
    <rect x="${startX + 60}" y="${startY + chartHeight - hPremiums}" width="50" height="${hPremiums}" rx="4" fill="url(#premiumGrad)" />
    <text x="${startX + 85}" y="${startY + chartHeight - hPremiums - 6}" fill="var(--text-1)" font-size="10" font-weight="600" text-anchor="middle">${premiums.toLocaleString()}</text>
    <text x="${startX + 85}" y="${startY + chartHeight + 16}" fill="var(--text-2)" font-size="10" text-anchor="middle">Premiums</text>
    
    <!-- Bar 2: Payouts -->
    <rect x="${startX + 190}" y="${startY + chartHeight - hPayouts}" width="50" height="${hPayouts}" rx="4" fill="url(#payoutGrad)" />
    <text x="${startX + 215}" y="${startY + chartHeight - hPayouts - 6}" fill="var(--text-1)" font-size="10" font-weight="600" text-anchor="middle">${payouts.toLocaleString()}</text>
    <text x="${startX + 215}" y="${startY + chartHeight + 16}" fill="var(--text-2)" font-size="10" text-anchor="middle">Payouts</text>
    
    <!-- Definitions for Gradients -->
    <defs>
      <linearGradient id="premiumGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--blue)" />
        <stop offset="100%" stop-color="var(--blue-dim)" />
      </linearGradient>
      <linearGradient id="payoutGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--green)" />
        <stop offset="100%" stop-color="var(--green-dim)" />
      </linearGradient>
    </defs>
  `;
}

function renderAll() {
  renderCoverageStatus();
  renderWallet();
  renderTransactionLog();
  renderClaimsList();
  renderAdmissionsList();
  updateAdminMetrics();
  updateApiStatusUI();
  renderSustainabilityChart();
}

function renderCoverageStatus() {
  const now = Date.now();
  const isActive = state.rider.coverageExpiry > now;
  const remaining = Math.max(0, state.rider.coverageExpiry - now);

  // Badge
  const badge = document.getElementById('coverage-badge');
  const badgeText = document.getElementById('badge-text');
  badge.className = `coverage-badge ${isActive ? 'active-cover' : 'expired'}`;
  badgeText.textContent = isActive ? 'ACTIVE' : 'EXPIRED';

  // Countdown card
  const card = document.getElementById('coverage-timer-card');
  const countdown = document.getElementById('coverage-countdown');
  const subtext = document.getElementById('coverage-subtext');
  card.className = `coverage-card ${isActive ? 'active-card' : 'expired-card'}`;
  countdown.className = `coverage-countdown ${isActive ? 'ticking' : ''}`;
  countdown.textContent = isActive ? formatDuration(remaining) : '00:00:00';
  subtext.textContent = isActive ? 'Full hospital cash cover active!' : 'No active cover — take a ride to activate!';

  // Detail status
  const statusEl = document.getElementById('cover-status-detail');
  statusEl.textContent = isActive ? 'ACTIVE' : 'EXPIRED';
  statusEl.className = `detail-card-value ${isActive ? 'status-active' : 'status-expired'}`;
}

function renderWallet() {
  document.getElementById('rider-wallet').textContent = state.rider.wallet.toLocaleString();
}

function renderTransactionLog() {
  const container = document.getElementById('transaction-log');
  if (!state.rider.transactionLog.length) {
    container.innerHTML = '<p class="log-empty">No transactions yet. Take a ride to start coverage!</p>';
    return;
  }
  container.innerHTML = state.rider.transactionLog.slice(0, 12).map(entry => `
    <div class="log-entry ${entry.type}">
      <span class="log-entry-icon">${getIconSvg(entry.icon)}</span>
      <span class="log-entry-text">${entry.text}</span>
      <span class="log-entry-time">${entry.time}</span>
    </div>`).join('');
}

function renderClaimsList() {
  const container = document.getElementById('claims-list');
  if (!state.rider.claims.length) {
    container.innerHTML = `<div class="claims-empty-state">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
      <p>No claims yet</p>
    </div>`;
    return;
  }
  container.innerHTML = state.rider.claims.map(c => `
    <div class="claim-item">
      <div class="claim-item-header">
        <span class="claim-diagnosis">${c.diagnosis}</span>
        <span class="claim-status-badge ${c.status}">${c.status}</span>
      </div>
      <div class="claim-date">${c.date} · ${c.nights} night${c.nights !== 1 ? 's' : ''} · ${c.method}</div>
      ${c.status === 'approved' ? `<div class="claim-amount">+ KES ${c.amount.toLocaleString()}</div>` : ''}
    </div>`).join('');
}

function animateCounter(el, target, duration = 600) {
  if (!el) return;
  const start = parseInt(el.getAttribute('data-current') || '0');
  if (start === target) return;
  el.setAttribute('data-current', target);
  const startTime = performance.now();
  function step(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3); // ease-out-cubic
    const current = Math.round(start + (target - start) * ease);
    el.textContent = current.toLocaleString();
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function updateAdminMetrics() {
  const premiums = state.admin.totalPremiumsCollected;
  const payouts = state.admin.totalBenefitsPaid;
  const lossRatio = premiums > 0 ? ((payouts / premiums) * 100).toFixed(1) : 0;

  animateCounter(document.getElementById('metric-active-policies'), state.admin.activePolicies);
  animateCounter(document.getElementById('metric-premiums'), premiums);
  animateCounter(document.getElementById('metric-payouts'), payouts);
  document.getElementById('metric-loss-ratio').textContent = `${lossRatio}%`;

  // Sync sliders
  document.getElementById('premium-slider').value = state.admin.premiumRate;
  document.getElementById('premium-slider-val').textContent = state.admin.premiumRate;
  document.getElementById('payout-slider').value = state.admin.payoutPerNight;
  document.getElementById('payout-slider-val').textContent = state.admin.payoutPerNight.toLocaleString();
  document.getElementById('premium-display-rider').textContent = state.admin.premiumRate;
  document.getElementById('premium-display-detail').textContent = state.admin.premiumRate;
  document.getElementById('payout-display').textContent = state.admin.payoutPerNight.toLocaleString();
}

function addEvent(type, icon, text) {
  const event = { type, icon, text, time: new Date().toLocaleTimeString('en-KE') };
  state.admin.eventStream.unshift(event);
  if (state.admin.eventStream.length > 50) state.admin.eventStream.pop();
  saveState();
  renderEventStream();
}

function renderEventStream() {
  const container = document.getElementById('event-stream');
  if (!state.admin.eventStream.length) {
    container.innerHTML = '<div class="event-stream-empty">System initialized. Awaiting events...</div>';
    return;
  }
  container.innerHTML = state.admin.eventStream.map(e => `
    <div class="event-item ${e.type}">
      <span class="event-icon">${getIconSvg(e.icon)}</span>
      <span class="event-text">${e.text}</span>
      <span class="event-time">${e.time}</span>
    </div>`).join('');
}

// ============================================================
// COVERAGE COUNTDOWN TICKER
// ============================================================
function getCountdownString() {
  const remaining = Math.max(0, state.rider.coverageExpiry - Date.now());
  return formatDuration(remaining);
}

function formatDuration(ms) {
  const totalSecs = Math.floor(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

setInterval(() => {
  renderCoverageStatus();
  // Update active policy count dynamically
  const isActive = Date.now() < state.rider.coverageExpiry;
  if (!isActive && state.admin.activePolicies > 0) {
    state.admin.activePolicies = 0;
    saveState();
    updateAdminMetrics();
  }
}, 1000);

// ============================================================
// UTILITY FUNCTIONS
// ============================================================
function simulateDelay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function showRiderToast(msg, type = '') {
  const toast = document.getElementById('rider-toast');
  toast.textContent = msg;
  toast.className = `rider-toast ${type}`;
  setTimeout(() => toast.classList.add('hidden'), 4000);
}

function showGlobalToast(msg, type = 'info') {
  const toast = document.getElementById('global-toast');
  toast.textContent = msg;
  toast.className = `global-toast ${type}`;
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => toast.classList.add('hidden'), 4500);
}

function showAdmitResult(id, type, msg) {
  const el = document.getElementById(id);
  el.className = `admit-result ${type}`;
  el.innerHTML = msg.replace(/\n/g, '<br>');
}

function hideElement(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

function showElement(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ============================================================
// DEMO RESET
// ============================================================
function resetDemoData() {
  if (!confirm('Reset all demo data to factory defaults? This will clear all transactions, claims, and admissions.')) return;
  localStorage.removeItem(STATE_KEY);
  state = JSON.parse(JSON.stringify(defaultState));
  saveState();
  renderAll();
  renderEventStream();
  addEvent('ai', 'ai', 'BimaFast demo data reset. System ready for demonstration.');
  showGlobalToast('Demo data reset to defaults.', 'info');
}

// ============================================================
// DATA EXPORT
// ============================================================
function exportAdminReport() {
  const now = new Date().toLocaleString('en-KE');
  const premiums = state.admin.totalPremiumsCollected;
  const payouts = state.admin.totalBenefitsPaid;
  const lossRatio = premiums > 0 ? ((payouts / premiums) * 100).toFixed(1) : '0.0';

  const filename = `bimafast-report-${Date.now()}.pdf`;

  // Build HTML content for the PDF
  const admissionsRows = state.hospital.admissions.map(a => `
    <tr><td>${escapeHtml(a.phone)}</td><td>${escapeHtml(a.diagnosis)}</td><td>${a.nights}</td><td>${escapeHtml(a.status)}</td><td>${escapeHtml(a.timestamp || '')}</td></tr>
  `).join('') || '<tr><td colspan="5">No admissions recorded</td></tr>';

  const claimsRows = state.rider.claims.map(c => `
    <tr><td>${escapeHtml(c.date)}</td><td>${escapeHtml(c.diagnosis)}</td><td>${c.nights}</td><td>${escapeHtml(c.status)}</td><td>KES ${Number(c.amount).toLocaleString()}</td><td>${escapeHtml(c.method || '')}</td></tr>
  `).join('') || '<tr><td colspan="6">No claims recorded</td></tr>';

  const eventsHtml = state.admin.eventStream.map(e => `<div>${escapeHtml('[' + e.time + '] ' + e.text)}</div>`).join('') || '<div>No events</div>';

  const content = `
    <style>
      @page { margin: 0; }
      .pdf-report { font-family: 'Inter', Arial, sans-serif; color:#f1f5f9; background:#0f172a; padding:24px; }
      .pdf-report .report-header { display:flex; gap:16px; align-items:center; border-bottom:3px solid #5b21b6; padding-bottom:12px; margin-bottom:18px; }
      .pdf-report .brand-logo { width:64px; height:64px; border-radius:10px; background:linear-gradient(135deg,#5b21b6,#06b6d4); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:18px; }
      .pdf-report h1 { font-size:20px; margin:0; color:#f1f5f9; }
      .pdf-report .meta { color:#94a3b8; font-size:12px; margin-top:6px; }
      .pdf-report .metrics { display:flex; gap:12px; margin:16px 0; flex-wrap:wrap; }
      .pdf-report .metric { background:#1e293b; padding:12px; border-radius:8px; min-width:160px; border:1px solid #334155; }
      .pdf-report .metric .label { font-size:11px; color:#64748b; }
      .pdf-report .metric .value { font-weight:700; font-size:16px; color:#f1f5f9; margin-top:6px; }
      .pdf-report table { width:100%; border-collapse:collapse; margin-top:12px; font-size:12px; }
      .pdf-report th { background:#5b21b6; color:#fff; padding:10px 8px; text-align:left; font-weight:700; }
      .pdf-report td { border-bottom:1px solid #334155; padding:10px 8px; color:#cbd5e1; }
      .pdf-report .section { margin-top:20px; }
      .pdf-report .section h3 { margin:0 0 10px 0; color:#5b21b6; font-size:14px; font-weight:700; }
      .pdf-report .footer { margin-top:24px; font-size:11px; color:#64748b; padding-top:12px; border-top:1px solid #334155; }
      .pdf-report .status-approved { color:#10b981; font-weight:700; }
      .pdf-report .status-pending { color:#f59e0b; font-weight:700; }
      .pdf-report .status-rejected { color:#ef4444; font-weight:700; }
    </style>

    <div class="pdf-report">
      <div class="report-header">
        <div class="brand-logo">BF</div>
        <div>
          <h1>BimaFast — Admin Portfolio Report</h1>
          <div class="meta">Generated: ${now}</div>
        </div>
      </div>

      <div class="metrics">
        <div class="metric"><div class="label">Active Policies</div><div class="value">${state.admin.activePolicies}</div></div>
        <div class="metric"><div class="label">Total Premiums Collected</div><div class="value">KES ${premiums.toLocaleString()}</div></div>
        <div class="metric"><div class="label">Total Benefits Paid</div><div class="value">KES ${payouts.toLocaleString()}</div></div>
        <div class="metric"><div class="label">Loss Ratio</div><div class="value">${lossRatio}%</div></div>
      </div>

      <div class="section">
        <h3>Portfolio Settings</h3>
        <table>
          <tr><th>Premium Rate</th><td>KES ${state.admin.premiumRate}/ride</td></tr>
          <tr><th>Payout Rate</th><td>KES ${state.admin.payoutPerNight}/night</td></tr>
        </table>
      </div>

      <div class="section">
        <h3>Claims Summary</h3>
        <table>
          <thead><tr><th>Date</th><th>Diagnosis</th><th>Nights</th><th>Status</th><th>Amount</th><th>Method</th></tr></thead>
          <tbody>${claimsRows}</tbody>
        </table>
      </div>

      <div class="section">
        <h3>Hospital Admissions</h3>
        <table>
          <thead><tr><th>Phone</th><th>Diagnosis</th><th>Nights</th><th>Status</th><th>Timestamp</th></tr></thead>
          <tbody>${admissionsRows}</tbody>
        </table>
      </div>

      <div class="section">
        <h3>Event Log</h3>
        <div style="font-size:11px; color:#94a3b8; line-height:1.8;">${eventsHtml}</div>
      </div>

      <div class="footer">Generated by BimaFast · ${escapeHtml(now)} | Powered by Gemini AI</div>
    </div>
  `;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = content;
  document.body.appendChild(wrapper);

  const opt = {
    margin:       10,
    filename:     filename,
    image:        { type: 'jpeg', quality: 0.95 },
    html2canvas:  { scale: 2, useCORS: true },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  html2pdf().set(opt).from(wrapper).save().then(() => {
    document.body.removeChild(wrapper);
    showGlobalToast('Report exported successfully!', 'success');
    addEvent('ai', 'ai', 'Admin exported portfolio report.');
  }).catch(err => {
    console.error('PDF export failed', err);
    document.body.removeChild(wrapper);
    showGlobalToast('Failed to export report as PDF', 'error');
  });
}

// ============================================================
// BOOT / INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  // Restore slider values
  const premiumSlider = document.getElementById('premium-slider');
  const payoutSlider = document.getElementById('payout-slider');
  
  if (premiumSlider) premiumSlider.value = state.admin.premiumRate;
  if (payoutSlider) payoutSlider.value = state.admin.payoutPerNight;

  // Initial render / Resume session
  if (Auth.isAuthenticated()) {
    const user = Auth.getCurrentUser();
    updateSessionHeaderUI(user);
    await fetchConfig();
    await loadGeminiApiKey();
    switchPortal(user.role);
    renderAll();
  } else {
    Auth.showLoginScreen();
  }

  // Log startup event if fresh
  if (!state.admin.eventStream.length) {
    addEvent('ai', 'ai', 'BimaFast system initialized. Gemini AI integration ready.');
  }

  console.log('%cBimaFast Initialized', 'color:#6366f1;font-weight:700;font-size:14px');
});

// ============================================================
// WITHDRAWAL MODAL ACTIONS
// ============================================================
function openWithdrawModal() {
  const modal = document.getElementById('withdraw-modal');
  modal.classList.remove('hidden');
  document.getElementById('withdraw-amount-input').value = '';
  document.getElementById('withdraw-modal-status').classList.add('hidden');
}

function closeWithdrawModal() {
  document.getElementById('withdraw-modal').classList.add('hidden');
}

async function submitWithdrawal() {
  const amountInput = document.getElementById('withdraw-amount-input');
  const amount = parseInt(amountInput.value);
  const phone = document.getElementById('withdraw-phone-input').value.trim();
  const statusEl = document.getElementById('withdraw-modal-status');
  const btn = document.getElementById('btn-withdraw-submit');
  
  if (isNaN(amount) || amount < 50) {
    showAdmitResult('withdraw-modal-status', 'error', 'Please enter a valid amount (minimum KES 50).');
    return;
  }
  if (amount > state.rider.wallet) {
    showAdmitResult('withdraw-modal-status', 'error', 'Insufficient funds in your M-Pesa wallet.');
    return;
  }
  if (!phone) {
    showAdmitResult('withdraw-modal-status', 'error', 'Please enter a recipient M-Pesa phone number.');
    return;
  }
  
  btn.disabled = true;
  showAdmitResult('withdraw-modal-status', 'success', 'Processing withdrawal... Please verify STK Push on your device.');
  
  await simulateDelay(1500);
  
  state.rider.wallet -= amount;
  state.rider.transactionLog.unshift({
    type: 'debit',
    icon: 'withdrawal',
    text: `M-Pesa cash-out to ${phone}. Amount: KES ${amount.toLocaleString()}.`,
    time: new Date().toLocaleTimeString('en-KE')
  });
  
  addEvent('payout', 'payout', `M-Pesa cash-out completed: KES ${amount.toLocaleString()} → ${phone}`);
  
  saveState();
  renderAll();
  
  showAdmitResult('withdraw-modal-status', 'success', `SUCCESS: KES ${amount.toLocaleString()} withdrawn.`);
  
  await simulateDelay(800);
  btn.disabled = false;
  closeWithdrawModal();
  showGlobalToast(`Withdrew KES ${amount.toLocaleString()} to M-Pesa successfully!`, 'success');
}
