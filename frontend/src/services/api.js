import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000/api';

export const ingestPaper = async (arxivUrl, collectionId) => {
    const response = await axios.post(`${API_BASE_URL}/ingest`, { arxiv_url: arxivUrl, collection_id: collectionId });
    return response.data;
};

export const getCollections = async () => {
    const response = await axios.get(`${API_BASE_URL}/collections`);
    return response.data;
};

export const createCollection = async (name, description = "") => {
    const response = await axios.post(`${API_BASE_URL}/collections`, { name, description });
    return response.data;
};

export const deleteCollection = async (collectionId) => {
    const response = await axios.delete(`${API_BASE_URL}/collections/${collectionId}`);
    return response.data;
};

export const moveAllPapers = async (collectionId, targetCollectionId) => {
    const response = await axios.post(`${API_BASE_URL}/collections/${collectionId}/move_all`, { target_collection_id: targetCollectionId });
    return response.data;
};

export const movePaper = async (paperId, targetCollectionId) => {
    const response = await axios.patch(`${API_BASE_URL}/papers/${paperId}/move`, { target_collection_id: targetCollectionId });
    return response.data;
};

export const getPapers = async () => {
    const response = await axios.get(`${API_BASE_URL}/papers`);
    return response.data;
};

export const deletePaper = async (paperId) => {
    const response = await axios.delete(`${API_BASE_URL}/papers/${paperId}`);
    return response.data;
};

export const getChats = async (paperId) => {
    const response = await axios.get(`${API_BASE_URL}/papers/${paperId}/chats`);
    return response.data;
};

export const sendChat = async (paperId, message) => {
    const response = await axios.post(`${API_BASE_URL}/papers/${paperId}/chat`, { message });
    return response.data;
};
