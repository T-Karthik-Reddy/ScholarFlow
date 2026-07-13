import axios from 'axios';
import { getApiKey, getAuthToken, getChatModel, getLoopModel } from './settings';

let API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
API_BASE_URL = API_BASE_URL.replace(/\/+$/, '');
if (!API_BASE_URL.endsWith('/api')) {
    API_BASE_URL += '/api';
}

const client = axios.create({ baseURL: API_BASE_URL });

client.interceptors.request.use((config) => {
    const key = getApiKey();
    if (key) config.headers['X-Gemini-Key'] = key;
    
    const chatModel = getChatModel();
    if (chatModel) config.headers['X-Gemini-Chat-Model'] = chatModel;
    
    const loopModel = getLoopModel();
    if (loopModel) config.headers['X-Gemini-Loop-Model'] = loopModel;
    
    const token = getAuthToken();
    if (token) config.headers['Authorization'] = `Bearer ${token}`;
    
    return config;
});

export const register = async (username, password) =>
    (await client.post('/register', { username, password })).data;

export const updateAccount = async (username, password) =>
    (await client.patch('/user', { username, password })).data;

export const login = async (username, password) => {
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);
    return (await client.post('/login', formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    })).data;
};

// Normalize errors so callers can show err.message directly.
client.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('scholarflow-auth-token');
            window.location.href = '/';
            return Promise.reject(error);
        }

        const detail = error.response?.data?.detail;
        if (typeof detail === 'string' && detail) {
            error.message = detail;
        } else if (error.code === 'ERR_NETWORK') {
            error.message = 'Cannot reach the ScholarFlow backend. Is it running on port 8000?';
        }
        return Promise.reject(error);
    }
);

export const getHealth = async () => (await client.get('/health')).data;

export const getAvailableModels = async () => (await client.get('/settings/models')).data;

export const validateApiKey = async (apiKey) =>
    (await client.post('/settings/validate_key', { api_key: apiKey })).data;

export const ingestPaper = async (arxivUrl, collectionId) =>
    (await client.post('/ingest', { arxiv_url: arxivUrl, collection_id: collectionId })).data;

export const fetchPaperPdf = async (paperId) =>
    (await client.get(`/papers/${paperId}/pdf`)).data;

export const getCollections = async () => (await client.get('/collections')).data;

export const createCollection = async (name, description = '') =>
    (await client.post('/collections', { name, description })).data;

export const deleteCollection = async (collectionId) =>
    (await client.delete(`/collections/${collectionId}`)).data;

export const moveAllPapers = async (collectionId, targetCollectionId) =>
    (await client.post(`/collections/${collectionId}/move_all`, { target_collection_id: targetCollectionId })).data;

export const movePaper = async (paperId, targetCollectionId) =>
    (await client.patch(`/papers/${paperId}/move`, { target_collection_id: targetCollectionId })).data;

export const getPapers = async () => (await client.get('/papers')).data;

export const deletePaper = async (paperId) => (await client.delete(`/papers/${paperId}`)).data;

export const getChats = async (paperId) => (await client.get(`/papers/${paperId}/chats`)).data;

export const clearChatHistory = async (paperId) => (await client.delete(`/papers/${paperId}/chats`)).data;

export const sendChat = async (paperId, message) =>
    (await client.post(`/papers/${paperId}/chat`, { message })).data;

export const sendChatStream = async (paperId, message, onChunk) => {
    const { getApiKey, getAuthToken, getChatModel } = require('./settings');
    const headers = { 'Content-Type': 'application/json' };
    const key = getApiKey();
    if (key) headers['X-Gemini-Key'] = key;
    const chatModel = getChatModel();
    if (chatModel) headers['X-Gemini-Chat-Model'] = chatModel;
    const token = getAuthToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${API_BASE_URL}/papers/${paperId}/chat_stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message })
    });

    if (!response.ok) {
        if (response.status === 401) {
            localStorage.removeItem('scholarflow-auth-token');
            window.location.href = '/';
            throw new Error('Unauthorized');
        }
        let errMsg = 'Failed to send message.';
        try {
            const errData = await response.json();
            errMsg = errData.detail || errMsg;
        } catch(e) {}
        throw new Error(errMsg);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let doneReading = false;
    let buffer = '';

    while (!doneReading) {
        const { value, done } = await reader.read();
        doneReading = done;
        if (value) {
            buffer += decoder.decode(value, { stream: true });
            const blocks = buffer.split('\n\n');
            buffer = blocks.pop() || ''; // Keep incomplete block in buffer
            
            for (const block of blocks) {
                const line = block.replace(/^data:\s*/, '').trim();
                if (!line) continue;
                try {
                    const data = JSON.parse(line);
                    onChunk(data);
                } catch(e) { 
                    console.error("SSE parse error", e, line);
                }
            }
        }
    }
};

// Implementing a paper is a single long Gemini generation; allow up to 5 min.
export const implementPaper = async (paperId, hints = '') =>
    (await client.post(`/papers/${paperId}/implement`, { hints }, { timeout: 300000 })).data;
