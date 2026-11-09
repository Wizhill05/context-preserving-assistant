import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getCityWeather, geocodeCity } from '../src/services/weatherApi.js';

describe('Weather API Integration (Open-Meteo)', () => {
  test('geocodeCity uses predefined coordinates for known cities', async () => {
    const coords = await geocodeCity('Mangalore');
    assert.equal(coords.name, 'Mangalore');
    assert.equal(coords.latitude, 12.9141);
    assert.equal(coords.longitude, 74.8560);
  });

  test('getCityWeather with mock fetch returns structured weather payload', async () => {
    const mockFetch = async (url) => {
      return {
        ok: true,
        json: async () => ({
          current: {
            temperature_2m: 28.5,
            relative_humidity_2m: 72,
            apparent_temperature: 31.0,
            weather_code: 1,
            wind_speed_10m: 14.2,
            time: '2026-11-09T10:00'
          }
        })
      };
    };

    const weather = await getCityWeather('Mangalore', 'celsius', mockFetch);
    assert.equal(weather.success, true);
    assert.equal(weather.city, 'Mangalore');
    assert.equal(weather.temperature, 28.5);
    assert.equal(weather.unit, '°C');
    assert.equal(weather.humidity, 72);
    assert.match(weather.condition, /Mainly clear/);
  });

  test('getCityWeather handles temperature unit fahrenheit', async () => {
    const mockFetch = async (url) => {
      assert.ok(url.includes('temperature_unit=fahrenheit'));
      return {
        ok: true,
        json: async () => ({
          current: {
            temperature_2m: 83.3,
            relative_humidity_2m: 70,
            apparent_temperature: 88.0,
            weather_code: 0,
            wind_speed_10m: 10.0
          }
        })
      };
    };

    const weather = await getCityWeather('Mangalore', 'fahrenheit', mockFetch);
    assert.equal(weather.unit, '°F');
    assert.equal(weather.temperature, 83.3);
  });

  test('getCityWeather returns graceful fallback when network fails', async () => {
    const failingFetch = async () => {
      throw new Error('Network error');
    };

    const weather = await getCityWeather('Mangalore', 'celsius', failingFetch);
    assert.equal(weather.success, true);
    assert.equal(weather.city, 'Mangalore');
    assert.equal(weather.unit, '°C');
    assert.ok(weather.temperature !== undefined);
  });
});
