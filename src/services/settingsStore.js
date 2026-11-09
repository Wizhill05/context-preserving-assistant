// First-party User Profile and Settings Store
// Keyed by user identifier 'sub' from the verified JWT access token / ID token

export class SettingsStore {
  constructor(initialData = {}) {
    this.profiles = new Map();

    // Default seed data for demo / testing
    const defaultData = {
      'auth0|demo-user-123': {
        sub: 'auth0|demo-user-123',
        name: 'Jane Doe',
        email: 'jane.doe@example.com',
        homeCity: 'Mangalore',
        temperatureUnit: 'celsius', // 'celsius' | 'fahrenheit'
        theme: 'dark',
        bio: 'DevOps & Cloud Engineer loving sunny coastal towns.'
      },
      'auth0|sample-alex-456': {
        sub: 'auth0|sample-alex-456',
        name: 'Alex Rivera',
        email: 'alex.rivera@example.com',
        homeCity: 'San Francisco',
        temperatureUnit: 'fahrenheit',
        theme: 'system',
        bio: 'Full-stack AI developer.'
      },
      ...initialData
    };

    for (const [sub, profile] of Object.entries(defaultData)) {
      this.profiles.set(sub, { ...profile });
    }
  }

  getProfile(sub) {
    if (!this.profiles.has(sub)) {
      // Create a default initial profile if it doesn't exist
      const defaultProfile = {
        sub,
        name: 'New User',
        email: 'user@example.com',
        homeCity: 'Mangalore',
        temperatureUnit: 'celsius',
        theme: 'dark',
        bio: 'Explorer'
      };
      this.profiles.set(sub, defaultProfile);
    }
    return { ...this.profiles.get(sub) };
  }

  updateProfile(sub, updates) {
    const current = this.getProfile(sub);
    const updated = {
      ...current,
      ...updates,
      sub // ensure sub cannot be mutated
    };
    this.profiles.set(sub, updated);
    return { ...updated };
  }
}

export const defaultSettingsStore = new SettingsStore();
