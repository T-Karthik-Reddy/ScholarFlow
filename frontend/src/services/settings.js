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

const CHAT_MODEL_STORAGE = 'scholarflow-chat-model';
const LOOP_MODEL_STORAGE = 'scholarflow-loop-model';

export function getChatModel() {
    return localStorage.getItem(CHAT_MODEL_STORAGE) || '';
}

export function setChatModel(modelId) {
    if (modelId) localStorage.setItem(CHAT_MODEL_STORAGE, modelId);
    else localStorage.removeItem(CHAT_MODEL_STORAGE);
}

export function getLoopModel() {
    return localStorage.getItem(LOOP_MODEL_STORAGE) || '';
}

export function setLoopModel(modelId) {
    if (modelId) localStorage.setItem(LOOP_MODEL_STORAGE, modelId);
    else localStorage.removeItem(LOOP_MODEL_STORAGE);
}

const TEMPERATURE_STORAGE = 'scholarflow-temperature';
const THINKING_BUDGET_STORAGE = 'scholarflow-thinking-budget';

export function getTemperature() {
    const val = localStorage.getItem(TEMPERATURE_STORAGE);
    return val ? parseFloat(val) : 0.7; // default 0.7
}

export function setTemperature(val) {
    if (val !== undefined && val !== null) localStorage.setItem(TEMPERATURE_STORAGE, val.toString());
    else localStorage.removeItem(TEMPERATURE_STORAGE);
}

export function getThinkingBudget() {
    const val = localStorage.getItem(THINKING_BUDGET_STORAGE);
    return val ? parseInt(val, 10) : 0; // default 0 (off)
}

export function setThinkingBudget(val) {
    if (val !== undefined && val !== null) localStorage.setItem(THINKING_BUDGET_STORAGE, val.toString());
    else localStorage.removeItem(THINKING_BUDGET_STORAGE);
}

const THINKING_LEVEL_STORAGE = 'scholarflow-thinking-level';

export function getThinkingLevel() {
    return localStorage.getItem(THINKING_LEVEL_STORAGE) || 'NONE'; // default NONE
}

export function setThinkingLevel(val) {
    if (val && val !== 'NONE') localStorage.setItem(THINKING_LEVEL_STORAGE, val);
    else localStorage.removeItem(THINKING_LEVEL_STORAGE);
}
