import axios from 'axios';
import { getApiKey } from './settings';

let API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
API_BASE_URL = API_BASE_URL.replace(/\/+$/, '');
if (!API_BASE_URL.endsWith('/api')) {
    API_BASE_URL += '/api';
}

const client = axios.create({ baseURL: API_BASE_URL });

client.interceptors.request.use((config) => {
    const key = getApiKey();
    if (key) config.headers['X-Gemini-Key'] = key;
    return config;
});

// Normalize errors so callers can show err.message directly.
client.interceptors.response.use(
    (response) => response,
    (error) => {
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

export const sendChat = async (paperId, message) =>
    (await client.post(`/papers/${paperId}/chat`, { message })).data;

// Implementing a paper is a single long Gemini generation; allow up to 5 min.
export const implementPaper = async (paperId, hints = '') =>
    (await client.post(`/papers/${paperId}/implement`, { hints }, { timeout: 300000 })).data;
