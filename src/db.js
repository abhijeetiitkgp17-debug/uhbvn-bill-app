// Local storage abstraction
// In native (Capacitor), uses Capacitor Preferences for settings
//   and a JSON-array store for history (kept simple, fast, reliable)
// In browser dev, uses IndexedDB

const Storage = (() => {

  // Detect Capacitor
  const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

  // ---------- SETTINGS ----------
  const SETTINGS_KEY = 'bill_splitter_settings';
  const HISTORY_KEY = 'bill_splitter_history';
  const DEFAULTS = {
    myName: '',
    myNum: '',
    tenantName: '',
    tenantNum: '',
    meterLabel: '',
    lastReading: null,
    lastReadingDate: null
  };

  async function getPrefs() {
    if (isNative && window.Capacitor.Plugins.Preferences) {
      return window.Capacitor.Plugins.Preferences;
    }
    return null;
  }

  async function readKey(key) {
    const prefs = await getPrefs();
    if (prefs) {
      const { value } = await prefs.get({ key });
      return value;
    }
    // Browser fallback: localStorage
    return localStorage.getItem(key);
  }

  async function writeKey(key, value) {
    const prefs = await getPrefs();
    if (prefs) {
      await prefs.set({ key, value });
      return;
    }
    localStorage.setItem(key, value);
  }

  async function deleteKey(key) {
    const prefs = await getPrefs();
    if (prefs) {
      await prefs.remove({ key });
      return;
    }
    localStorage.removeItem(key);
  }

  async function getSettings() {
    try {
      const raw = await readKey(SETTINGS_KEY);
      if (!raw) return { ...DEFAULTS };
      return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch (e) {
      return { ...DEFAULTS };
    }
  }

  async function saveSettings(settings) {
    await writeKey(SETTINGS_KEY, JSON.stringify(settings));
  }

  // ---------- HISTORY ----------
  async function getHistory() {
    try {
      const raw = await readKey(HISTORY_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      // Sort newest first
      return arr.sort((a, b) => b.timestamp - a.timestamp);
    } catch (e) {
      return [];
    }
  }

  async function saveHistoryEntry(entry) {
    const all = await getHistory();
    entry.id = entry.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 7));
    entry.timestamp = entry.timestamp || Date.now();
    all.push(entry);
    await writeKey(HISTORY_KEY, JSON.stringify(all));
    return entry.id;
  }

  async function deleteHistoryEntry(id) {
    const all = await getHistory();
    const filtered = all.filter(e => e.id !== id);
    await writeKey(HISTORY_KEY, JSON.stringify(filtered));
  }

  async function clearHistory() {
    await deleteKey(HISTORY_KEY);
  }

  // ---------- LAST READING (for auto-fill) ----------
  async function updateLastReading(reading) {
    const settings = await getSettings();
    settings.lastReading = reading;
    settings.lastReadingDate = Date.now();
    await saveSettings(settings);
  }

  return {
    getSettings,
    saveSettings,
    getHistory,
    saveHistoryEntry,
    deleteHistoryEntry,
    clearHistory,
    updateLastReading,
    isNative
  };
})();

window.Storage = Storage;
