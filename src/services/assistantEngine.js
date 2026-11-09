import { getCityWeather } from './weatherApi.js';
import { defaultTokenVault } from './tokenVault.js';

/**
 * Assistant Session Context Store
 *
 * Holds state for user interaction sessions:
 * - User identity and token details (sub, name, email, accessToken)
 * - Cached first-party user profile settings
 * - Conversation turn history
 * - Multi-turn state (e.g. pending city confirmation)
 */
export class SessionManager {
  constructor() {
    this.sessions = new Map();
  }

  getOrCreateSession(sessionId, initialContext = {}) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        id: sessionId,
        user: initialContext.user || null,
        accessToken: initialContext.accessToken || null,
        settings: initialContext.settings || null,
        history: [],
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString()
      });
    } else {
      const session = this.sessions.get(sessionId);
      if (initialContext.user) session.user = initialContext.user;
      if (initialContext.accessToken) session.accessToken = initialContext.accessToken;
      if (initialContext.settings) session.settings = initialContext.settings;
      session.lastActivity = new Date().toISOString();
    }
    return this.sessions.get(sessionId);
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  clearSession(sessionId) {
    this.sessions.delete(sessionId);
  }
}

export const defaultSessionManager = new SessionManager();

/**
 * Deterministic Intent Classifier
 */
export function classifyIntent(messageText) {
  const raw = (messageText || '').trim();
  const text = raw.toLowerCase();

  // Greeting
  if (/^(hi|hello|hey|greetings|good\s*(morning|afternoon|evening))\b/i.test(text)) {
    return { type: 'GREETING' };
  }

  // Combined context flow: Weather in home city / local weather / home weather
  if (
    /weather.*(home|my\s*city|here)|(home|my\s*city).*weather|what('?s| is) the weather in my (home\s*)?city/i.test(text) ||
    /how('?s| is) the weather.*(home|my city)/i.test(text)
  ) {
    return { type: 'WEATHER_HOME_CITY' };
  }

  // Specific city weather: e.g. "weather in Tokyo", "what's the weather in London"
  const weatherCityMatch = raw.match(/(?:weather|temperature|forecast)(?:\s+(?:in|for|at))?\s+([a-zA-Z\s]+)/i);
  if (weatherCityMatch && !weatherCityMatch[1].toLowerCase().includes('home')) {
    const city = weatherCityMatch[1].trim();
    if (city.length > 0 && !['today', 'now', 'tomorrow'].includes(city.toLowerCase())) {
      return { type: 'WEATHER_SPECIFIC_CITY', city };
    }
  }

  // Pure weather query without city specified
  if (/^(weather|forecast|temperature|how is the weather|what('?s| is) the weather)\??$/i.test(text)) {
    return { type: 'WEATHER_HOME_CITY' };
  }

  // View settings / profile
  if (/(show|view|get|what('?s| are| is))\s*(my\s*)?(settings|profile|preferences|info)/i.test(text) || text === 'settings' || text === 'profile') {
    return { type: 'VIEW_SETTINGS' };
  }

  // Update home city setting: e.g. "change my home city to Bengaluru", "set home city to Mumbai"
  const updateCityMatch = raw.match(/(?:set|change|update)\s+(?:my\s+)?(?:home\s+city|city)\s+to\s+([a-zA-Z\s]+)/i);
  if (updateCityMatch) {
    return { type: 'UPDATE_HOME_CITY', city: updateCityMatch[1].trim() };
  }

  // Third-Party Token Vault delegation demo (Calendar / external integration)
  if (/(calendar|events|google\s*calendar|schedule|token\s*vault)/i.test(text)) {
    return { type: 'TOKEN_VAULT_DELEGATION' };
  }

  // Identity / session verification inquiry
  if (/(who am i|my identity|whoami|token|auth status|claims|show token)/i.test(text)) {
    return { type: 'WHOAMI' };
  }

  // Help
  if (/^(help|\?|commands|what can you do)/i.test(text)) {
    return { type: 'HELP' };
  }

  return { type: 'UNKNOWN', query: text };
}

/**
 * Handle a chat interaction turn preserving user identity and context
 *
 * @param {Object} params
 * @param {string} params.sessionId
 * @param {string} params.message
 * @param {Object} params.userContext - Authenticated user identity (sub, name, email, accessToken)
 * @param {import('./settingsStore.js').SettingsStore} params.settingsStore
 * @param {import('./tokenVault.js').TokenVaultAdapter} [params.tokenVault]
 * @param {Function} [params.weatherFetcher] - Optional custom fetcher for testing
 */
export async function processAssistantMessage({
  sessionId,
  message,
  userContext,
  settingsStore,
  tokenVault = defaultTokenVault,
  weatherFetcher = globalThis.fetch,
  sessionManager = defaultSessionManager
}) {
  const session = sessionManager.getOrCreateSession(sessionId, {
    user: userContext,
    accessToken: userContext?.accessToken
  });

  const sub = userContext?.sub || session.user?.sub;
  if (!sub) {
    return {
      reply: 'Authentication required. Please sign in with Auth0 to continue.',
      context: { authenticated: false },
      actions: []
    };
  }

  // Always fetch latest first-party profile settings using user's sub identity
  const userSettings = settingsStore.getProfile(sub);
  session.settings = userSettings;

  const intent = classifyIntent(message);
  const actionsTaken = [];
  let reply = '';
  let metaData = {};

  switch (intent.type) {
    case 'GREETING': {
      reply = `Hello ${userSettings.name}! 👋 I am your context-preserving assistant. I know your home city is set to **${userSettings.homeCity}** in your first-party profile. How can I help you today? You can ask me for the weather, check your settings, or inspect external calendar events via Auth0 Token Vault.`;
      break;
    }

    case 'VIEW_SETTINGS': {
      actionsTaken.push({ type: 'FIRST_PARTY_API_CALL', endpoint: 'GET /api/settings', sub });
      reply = `Here are your current settings from your First-Party API profile:\n\n` +
        `• **Name**: ${userSettings.name}\n` +
        `• **User Sub (Auth0)**: \`${userSettings.sub}\`\n` +
        `• **Email**: ${userSettings.email}\n` +
        `• **Home City**: **${userSettings.homeCity}**\n` +
        `• **Units**: ${userSettings.temperatureUnit === 'fahrenheit' ? 'Fahrenheit (°F)' : 'Celsius (°C)'}\n` +
        `• **Theme**: ${userSettings.theme}\n` +
        `• **Bio**: ${userSettings.bio}`;
      metaData = { settings: userSettings };
      break;
    }

    case 'UPDATE_HOME_CITY': {
      const newCity = intent.city;
      settingsStore.updateProfile(sub, { homeCity: newCity });
      session.settings = settingsStore.getProfile(sub);
      actionsTaken.push({ type: 'FIRST_PARTY_API_CALL', endpoint: 'PUT /api/settings', updatedField: 'homeCity', value: newCity });
      reply = `I have updated your home city in your First-Party profile to **${newCity}**. Any future weather inquiries without a city will now use ${newCity}!`;
      metaData = { updatedCity: newCity };
      break;
    }

    case 'WEATHER_HOME_CITY': {
      // 1. First-Party API context lookup (User's home city and preferred unit)
      actionsTaken.push({
        type: 'FIRST_PARTY_API_CALL',
        endpoint: 'GET /api/settings',
        userSub: sub,
        resolvedContext: {
          homeCity: userSettings.homeCity,
          temperatureUnit: userSettings.temperatureUnit
        }
      });

      // 2. Third-Party API call (Open-Meteo) using the resolved context
      const weather = await getCityWeather(userSettings.homeCity, userSettings.temperatureUnit, weatherFetcher);
      actionsTaken.push({
        type: 'THIRD_PARTY_API_CALL',
        provider: 'Open-Meteo',
        city: userSettings.homeCity,
        temperature: weather.temperature,
        unit: weather.unit
      });

      reply = `Using your saved first-party profile settings, I checked your home city **${userSettings.homeCity}**:\n\n` +
        `🌤️ **Weather in ${weather.city}${weather.country ? ', ' + weather.country : ''}**: ${weather.condition}\n` +
        `• **Temperature**: ${weather.temperature}${weather.unit} (Feels like: ${weather.apparentTemperature}${weather.unit})\n` +
        `• **Humidity**: ${weather.humidity}%\n` +
        `• **Wind Speed**: ${weather.windSpeed} km/h\n\n` +
        `*(Identity context preserved: user **${userSettings.name}** [${sub}] → 1st-party API profile setting → 3rd-party Open-Meteo call)*`;

      metaData = { weather, resolvedCity: userSettings.homeCity };
      break;
    }

    case 'WEATHER_SPECIFIC_CITY': {
      const city = intent.city;
      const weather = await getCityWeather(city, userSettings.temperatureUnit, weatherFetcher);
      actionsTaken.push({
        type: 'THIRD_PARTY_API_CALL',
        provider: 'Open-Meteo',
        city,
        unit: userSettings.temperatureUnit
      });

      reply = `Here is the current weather for **${weather.city}** (using your preferred unit ${userSettings.temperatureUnit}):\n\n` +
        `🌤️ **Condition**: ${weather.condition}\n` +
        `• **Temperature**: ${weather.temperature}${weather.unit} (Feels like: ${weather.apparentTemperature}${weather.unit})\n` +
        `• **Humidity**: ${weather.humidity}%\n` +
        `• **Wind Speed**: ${weather.windSpeed} km/h`;

      metaData = { weather, city };
      break;
    }

    case 'TOKEN_VAULT_DELEGATION': {
      actionsTaken.push({
        type: 'AUTH0_TOKEN_VAULT_DELEGATION',
        provider: 'google-calendar',
        userSub: sub
      });

      const calResult = await tokenVault.mockCallGoogleCalendar({
        userId: sub,
        userAccessToken: session.accessToken
      });

      reply = `📅 **Auth0 Token Vault Delegation Result**:\n\n` +
        `The assistant requested a delegated provider token for \`${calResult.service}\` tied to your identity \`${sub}\`.\n\n` +
        `**Upcoming Events for ${userSettings.name}**:\n` +
        calResult.events.map(e => `• **${e.summary}** at ${new Date(e.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (${e.location})`).join('\n') +
        `\n\n*(Delegated token used: \`${calResult.providerTokenUsed}\`)*`;

      metaData = { tokenVault: calResult };
      break;
    }

    case 'WHOAMI': {
      reply = `**Authenticated Identity Details**:\n` +
        `• **Subject (\`sub\`)**: \`${sub}\`\n` +
        `• **Name**: ${userContext?.name || userSettings.name}\n` +
        `• **Email**: ${userContext?.email || userSettings.email}\n` +
        `• **Access Token Status**: ${session.accessToken ? 'Active (Audience: ' + (process.env.API_AUDIENCE || 'https://api.assistant.local') + ')' : 'Mock Dev Token'}\n` +
        `• **Auth Provider**: ${process.env.AUTH_MODE === 'auth0' ? 'Auth0 Universal Login' : 'Local Mock Authenticator'}`;
      metaData = { user: userContext, session: { id: sessionId, sub } };
      break;
    }

    case 'HELP':
    default: {
      if (intent.type === 'UNKNOWN') {
        reply = `I didn't quite catch that. Here is what I can do for you with your authenticated context:\n\n`;
      } else {
        reply = `Here are commands you can try:\n\n`;
      }
      reply += `1. **"What's the weather in my home city?"** — Retrieves your home city (${userSettings.homeCity}) from the First-Party API and calls Open-Meteo.\n` +
        `2. **"Show my settings"** — Queries \`GET /api/settings\` using your JWT credentials.\n` +
        `3. **"Change my home city to London"** — Updates your first-party settings via \`PUT /api/settings\`.\n` +
        `4. **"Check my calendar"** — Demonstrates Auth0 Token Vault delegated API access.\n` +
        `5. **"Who am I"** — Shows the active Auth0 identity and token claims.`;
      break;
    }
  }

  // Record conversation history
  session.history.push({
    role: 'user',
    content: message,
    timestamp: new Date().toISOString()
  });
  session.history.push({
    role: 'assistant',
    content: reply,
    timestamp: new Date().toISOString(),
    actionsTaken
  });

  return {
    reply,
    actions: actionsTaken,
    context: {
      authenticated: true,
      sub,
      homeCity: userSettings.homeCity,
      temperatureUnit: userSettings.temperatureUnit
    },
    meta: metaData
  };
}
