# BimaFast — Embedded Daily Micro-Insurance for Gig Workers

BimaFast is a modern, responsive web application designed to provide embedded daily micro-health insurance for gig economy workers (such as boda-boda riders, taxi drivers, and delivery workers) in Kenya. By integrating real-time automated claims processing, role-based portals, and Google Gemini AI, BimaFast makes daily health coverage accessible, affordable, and instant.

---

## 🚀 System Architecture Overview

The project is structured as a single-page application (SPA) powered by a secure Node.js/Express server and integrated with Google Gemini AI.

```
├── bima-fast/            # Frontend Web Assets (Static Root)
│   ├── index.html        # Main Application Interface
│   ├── app.js            # Core Frontend State & Logic
│   ├── auth.js           # Client-side Auth & Key Delivery Helper
│   └── style.css         # Custom Glassmorphic CSS Styling
├── server.js             # Express Server with Auth & Configuration APIs
├── .env                  # Environment Variables (Secrets & Configuration)
├── package.json          # Node Dependencies & NPM scripts
└── README.md             # Project Documentation
```

---

## 🔑 Portals & Roles

BimaFast provides role-based interfaces secured server-side using base64 tokens.

### 1. Rider Dashboard (John Kamau)
Designed for mobile-first views of gig workers.
* **Coverage Status:** Real-time indicator showing if daily coverage is active or expired.
* **M-Pesa Wallet:** Displays current balance and allows instant payouts.
* **Self-File Claims:** Submit doctors' discharge notes directly for instant AI-audited payouts.
* **Interactive AI Chatbot:** Multi-lingual support assistant conversing in English, Swahili, or Sheng.

### 2. Hospital Terminal (Nairobi General Hospital)
Designed for healthcare providers to process admissions.
* **Structured Admission:** Admit patient by phone number and select diagnosis/nights manually.
* **AI Claim Auditor:** Paste raw doctors' notes to let Gemini extract admission data and approve/reject claims.

### 3. Admin Console (BimaFast Admin)
Designed for actuarial operations.
* **Adjust Rates:** Configure live daily premiums and night payout rates.
* **Live Metrics:** Real-time calculations of Premiums Collected, Benefits Disbursed, Active Policies, and Loss Ratio.
* **AI Risk Advisor:** Prompt Gemini to analyze active insurance metrics and formulate strategic actuarial recommendations.

---

## 🤖 Gemini AI Integrations

The system leverages the Gemini API (e.g. `gemini-2.5-flash`) for three key features:

1. **AI Claim Auditor:** Parses unformatted, messy doctors' notes and returns a structured JSON object containing:
   * Patient Name
   * Diagnosis
   * Nights Admitted (calculating payout amount based on nightly rate)
   * Approval Decision & Confidence Score
2. **Bima Assistant Chatbot:** A friendly chatbot that holds context of the user's coverage status, wallet balance, and premium history, answering questions without emojis and in the customer's preferred language (English, Swahili, or Sheng).
3. **AI Actuarial Risk Advisor:** Analyzes active portfolio metrics and evaluates financial risk, outputting a risk score (LOW/MEDIUM/HIGH) along with 4 actionable recommendations.

---

## 🛠️ Configuration & Local Run

### 1. Environment Setup
Create a `.env` file in the root directory:
```ini
PORT=3000
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash

# Default App Settings
DEFAULT_PREMIUM_KES=25
DEFAULT_PAYOUT_PER_NIGHT_KES=5000

# Credentials
RIDER_DEFAULT_PHONE=+254712345678
RIDER_PIN=1234
HOSPITAL_CODE=HOSP-2024
HOSPITAL_PIN=9999
ADMIN_USERNAME=admin
ADMIN_PASSWORD=bimafast@admin2024
```

### 2. Commands
Install project dependencies:
```bash
npm install
```

Start the development server with hot-reloading:
```bash
npm run dev
```
Open **`http://localhost:3000`** in your browser.