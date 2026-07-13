const API_KEY_STORAGE = 'scholarflow-gemini-key';
const THEME_STORAGE = 'scholarflow-theme';
const ONBOARDED_STORAGE = 'scholarflow-onboarded';
const AUTH_TOKEN_STORAGE = 'scholarflow-auth-token';

export function getAuthToken() {
    return localStorage.getItem(AUTH_TOKEN_STORAGE) || '';
}

export function setAuthToken(token) {
    if (token) localStorage.setItem(AUTH_TOKEN_STORAGE, token);
    else localStorage.removeItem(AUTH_TOKEN_STORAGE);
}

export function getApiKey() {
    return localStorage.getItem(API_KEY_STORAGE) || '';
}

export function setApiKey(key) {
    if (key) localStorage.setItem(API_KEY_STORAGE, key.trim());
    else localStorage.removeItem(API_KEY_STORAGE);
}

export function getTheme() {
    return localStorage.getItem(THEME_STORAGE) || 'light';
}

export function setTheme(theme) {
    localStorage.setItem(THEME_STORAGE, theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
}

export function isOnboarded() {
    return localStorage.getItem(ONBOARDED_STORAGE) === 'true';
}

export function setOnboarded() {
    localStorage.setItem(ONBOARDED_STORAGE, 'true');
}
