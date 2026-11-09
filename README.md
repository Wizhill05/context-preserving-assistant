# The Context-Preserving Assistant
### Auth0 Challenge: Full-Stack Identity & API Access

An intelligent, full-stack personal assistant that securely preserves user identity across an entire conversational session, seamlessly invoking **both a custom first-party API** and a **public third-party API** on the user's behalf.

Built with **Node.js 22 (ESM)**, **Express**, **Auth0 Universal Login** (`express-openid-connect`), and **JWT bearer protection** (`express-oauth2-jwt-bearer`).

---

## 🌟 What It Does

1. **Authenticates the User**:
   - Web application user signs in via **Auth0 Universal Login** using `express-openid-connect`.
   - The user's authenticated session holds their ID token identity (`sub`, `name`, `email`) and obtains an access token scoped for the custom first-party API.
   - Also features an offline **Mock / Demo mode** that runs out-of-the-box without external network dependencies.

2. **Accesses the First-Party API**:
   - Express router mounted at `/api/settings` and protected with `express-oauth2-jwt-bearer`.
   - Every request requires a valid bearer token matching the specified audience (e.g. `https://api.assistant.local`).
   - Profile settings (such as `homeCity`, `temperatureUnit`, `name`, `bio`) are keyed directly to the token's subject claim (`sub`).

3. **Calls a Third-Party API on the User's Behalf**:
   - Integrates with the public **Open-Meteo Weather API** (requires no paid key, provides geocoding and real-time conditions).
   - In a single conversational turn, the assistant resolves the user's home city from their authenticated first-party profile (e.g., `"Mangalore"`), then calls Open-Meteo to fetch local weather conditions and formats the response using their preferred unit.

4. **Pluggable Auth0 Token Vault Architecture**:
   - Implements a pluggable provider token adapter (`TokenVaultAdapter` in `src/services/tokenVault.js`) documenting and demonstrating how Auth0 Token Vault manages delegated credentials for third-party providers (such as Google Calendar or GitHub) without storing third-party secrets in the app database.

5. **Deterministic Intent Router**:
   - Powered by a fast, deterministic intent classifier and session manager—no paid LLM keys required.
   - Tracks session turns and actions (`FIRST_PARTY_API_CALL`, `THIRD_PARTY_API_CALL`, `AUTH0_TOKEN_VAULT_DELEGATION`).

---

## 🏗️ Architecture & Data Flow

```
+-----------------------------------------------------------------------------------------+
|                                     Web Browser                                         |
|                   (Chat UI + Real-Time Identity & Settings Inspector)                   |
+-----------------------------------------------------------------------------------------+
                                 │                            ▲
                 1. User Login   │                            │ 6. Response with
                 & Session Chat  ▼                            │    Actions & Context
+─────────────────────────────────────────────────────────────────────────────────────────+
|                         Context-Preserving Assistant (Node.js)                          |
|                                                                                         |
|  [Auth Layer: express-openid-connect / Mock Provider]                                   |
|   └── Validates user session; extracts 'sub' (e.g., auth0|demo-user-123) & access token |
|                                                                                         |
|  [Deterministic Intent Router & Session Context Manager]                                |
|   ├── Message: "What's the weather in my home city?"                                    |
|   │                                                                                     |
|   ├── 2. First-Party API Call: GET /api/settings                                        |
|   │   └── Protected with [express-oauth2-jwt-bearer] (Audience: api.assistant.local)    |
|   │   └── Returns Profile: { homeCity: 'Mangalore', unit: 'celsius' }                   |
|   │                                                                                     |
|   ├── 3. Third-Party API Call: Open-Meteo Weather                                       |
|   │   └── Queries weather for 'Mangalore' formatted with unit 'celsius'                 |
|   │                                                                                     |
|   └── 4. Pluggable Auth0 Token Vault: Delegated Provider Token Access                   |
|       └── Requests delegated credentials for Google Calendar tied to 'sub'             |
+─────────────────────────────────────────────────────────────────────────────────────────+
```

---

## 🛠️ Auth0 Dashboard Setup (Live Mode)

To run with live Auth0 credentials:

### 1. Create the Auth0 Regular Web Application
1. In the [Auth0 Dashboard](https://manage.auth0.com/), navigate to **Applications** > **Applications** > **Create Application**.
2. Select **Regular Web Applications**.
3. Under the **Settings** tab:
   - **Allowed Callback URLs**: `http://localhost:3000/callback`
   - **Allowed Logout URLs**: `http://localhost:3000/`
4. Copy the following values into your `.env`:
   - `ISSUER_BASE_URL` (Domain, e.g. `https://dev-xyz.auth0.com`)
   - `CLIENT_ID`
   - `CLIENT_SECRET`

### 2. Create the Custom First-Party API
1. Navigate to **Applications** > **APIs** > **Create API**.
2. Name: `Context Preserving Assistant API`
3. Identifier (Audience): `https://api.assistant.local`
4. Signing Algorithm: `RS256`
5. Permissions (Scopes):
   - `read:settings` (Read user profile and preferences)
   - `write:settings` (Update user profile and preferences)
6. Add `API_AUDIENCE=https://api.assistant.local` to `.env`.

### 3. (Optional) Configure Auth0 Token Vault
For external provider delegation (e.g., Google Calendar):
1. In the Auth0 Dashboard, enable **Token Vault** (under Marketplace / Integrations or Extensions).
2. Create an API connection for **Google** or your target OAuth provider with calendar scopes (`calendar.readonly`).
3. Set `TOKEN_VAULT_ENABLED=true` in `.env`.

---

## ⚙️ Environment Variables

Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

| Variable | Description | Default / Example |
|---|---|---|
| `PORT` | Local HTTP port | `3000` |
| `AUTH_MODE` | `mock` (offline local dev/test) or `auth0` (live Universal Login) | `mock` |
| `ISSUER_BASE_URL` | Auth0 domain URL | `https://YOUR_DOMAIN.auth0.com` |
| `CLIENT_ID` | Auth0 Application Client ID | `YOUR_CLIENT_ID` |
| `CLIENT_SECRET` | Auth0 Application Client Secret | `YOUR_CLIENT_SECRET` |
| `SECRET` | Session encryption secret (min 32 chars) | `random_secret_at_least_32_characters_12345` |
| `BASE_URL` | Application base URL | `http://localhost:3000` |
| `API_AUDIENCE` | First-Party API identifier | `https://api.assistant.local` |
| `TOKEN_VAULT_ENABLED` | Enable Auth0 Token Vault adapter | `false` |

---

## 🚀 How to Run

### Requirements
- **Node.js 22+**
- npm

### Installation
```bash
npm install
```

### Running in Mock / Demo Mode (No Auth0 account needed)
Runs locally and offline with simulated authentication and pre-seeded profile settings:
```bash
AUTH_MODE=mock npm start
```
Open **http://localhost:3000** in your browser.

### Running in Real Auth0 Mode
Ensure `.env` has your Auth0 credentials and set:
```bash
AUTH_MODE=auth0 npm start
```
Visiting **http://localhost:3000** will redirect you to Auth0 Universal Login to authenticate before accessing the assistant.

---

## 🧪 Running Tests

The test suite uses the built-in Node.js 22 test runner (`node:test`) and requires zero external test runners:

```bash
npm test
```

### Test Coverage Summary:
- **`test/assistantFlow.test.js`**:
  - Full single-turn context preservation test: Auth0 identity context -> First-Party API (`GET /api/settings`) -> Third-Party Weather API (`Open-Meteo`).
  - Multi-turn conversation test: Updating user home city via First-Party API (`PUT /api/settings`) and verifying subsequent weather calls immediately use the updated city.
  - Auth0 Token Vault delegation test: Verifies provider token resolution is scoped to the user's `sub`.
  - Introspection test: Verifies `/api/identity` returns authenticated context.
- **`test/settings.test.js`**:
  - Tests `SettingsStore` CRUD operations keyed to `sub`.
  - Verifies First-Party API router with Bearer token authentication.
- **`test/weather.test.js`**:
  - Tests Open-Meteo geocoding and forecast retrieval.
  - Verifies temperature unit conversion and offline fallback resilience.
- **`test/tokenVault.test.js`**:
  - Tests the pluggable Token Vault adapter and delegated calendar access.

---

## 🏆 How This Meets the Challenge Success Criteria

The challenge requires:
> *"a SINGLE conversation where the assistant references a user-specific setting from the first-party API (e.g. 'your home city is Mangalore') and then performs a task with the third-party API (e.g. 'weather in your home city') all secured by the initial user authentication."*

Here is how each criterion is met:

1. **User Authentication with Auth0 Universal Login (`express-openid-connect`)**:
   - `src/app.js` configures `express-openid-connect` with `authorizationParams` specifying the API audience (`API_AUDIENCE`) and scopes.
   - When a user logs in, their identity (`sub`) and access token are bound to the session.

2. **First-Party API Protected by `express-oauth2-jwt-bearer`**:
   - `src/services/firstPartyApi.js` defines a separate Express router providing `GET /api/settings` and `PUT /api/settings`.
   - In live mode, requests are verified against Auth0's JWKS and issuer using `express-oauth2-jwt-bearer`. In mock mode, a deterministic JWT validator verifies bearer tokens and populates `req.auth`.
   - Settings are strictly partitioned and accessed by the token's `sub` claim.

3. **Context Preservation Across APIs in a Single Turn**:
   - When the user types *"What is the weather in my home city?"*, `src/services/assistantEngine.js`:
     1. Reads the user's authenticated `sub` from the session.
     2. Queries the first-party settings store to resolve their `homeCity` (`"Mangalore"`).
     3. Calls the public Open-Meteo API for `"Mangalore"`.
     4. Responds: *"Using your saved first-party profile settings, I checked your home city Mangalore: Weather in Mangalore... 29°C"*.
   - Both `FIRST_PARTY_API_CALL` and `THIRD_PARTY_API_CALL` are tagged and visually surfaced in the web UI.

4. **Auth0 Token Vault Delegation Pattern**:
   - `src/services/tokenVault.js` implements a pluggable provider token adapter.
   - Demonstrates how external services (like Google Calendar) receive delegated access tokens exchanged through Auth0 Token Vault for the authenticated user's `sub`.

5. **Self-Contained & Production-Ready**:
   - Zero hardcoded secrets (configured via environment variables).
   - Clean, modern dark-mode web interface with live context and action badges.
   - 100% test pass rate with Node 22 native test runner.
