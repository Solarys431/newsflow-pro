/**
 * API Module
 * Gestione chiamate API
 */

class API {
    constructor() {
        this.baseUrl = Config.api.baseUrl;
    }

    // Generic request method
    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        try {
            const response = await fetch(url, config);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error(`API Error (${endpoint}):`, error);
            throw error;
        }
    }

    // Stories endpoints
    async getStories(filters = {}) {
        const params = new URLSearchParams(filters);
        return this.request(`/stories?${params}`);
    }

    async getStory(id) {
        return this.request(`/stories/${id}`);
    }

    async createStory(story) {
        return this.request('/stories', {
            method: 'POST',
            body: JSON.stringify(story)
        });
    }

    async updateStory(id, updates) {
        return this.request(`/stories/${id}`, {
            method: 'PUT',
            body: JSON.stringify(updates)
        });
    }

    async deleteStory(id) {
        return this.request(`/stories/${id}`, {
            method: 'DELETE'
        });
    }

    async sendToRundown(storyId, params = {}) {
        return this.request(`/stories/${storyId}/send-to-rundown`, {
            method: 'POST',
            body: JSON.stringify(params)
        });
    }

    // Rundown endpoints
    async getRundowns() {
        return this.request('/rundown');
    }

    async getCurrentRundown() {
        return this.request('/rundown/current');
    }

    async getRundownById(id) {
        return this.request(`/rundown/${id}/details`);
    }

    async getRundownItems(rundownId) {
        return this.request(`/rundown/${rundownId}/items`);
    }

    async createRundown(rundownData) {
        return this.request('/rundown', {
            method: 'POST',
            body: JSON.stringify(rundownData)
        });
    }

    async updateRundown(id, updates) {
        return this.request(`/rundown/${id}`, {
            method: 'PUT',
            body: JSON.stringify(updates)
        });
    }

    async deleteRundown(id) {
        return this.request(`/rundown/${id}`, {
            method: 'DELETE'
        });
    }

    async removeFromRundown(itemId) {
        return this.request(`/rundown/items/${itemId}`, {
            method: 'DELETE'
        });
    }

    // Automation endpoints
    async executeAutomation(itemId) {
        return this.request(`/automation/execute/${itemId}`, {
            method: 'POST'
        });
    }

    // Media endpoints
    async getMedia(type = null) {
        const params = type ? `?type=${type}` : '';
        return this.request(`/media${params}`);
    }

    async uploadMedia(file) {
        const formData = new FormData();
        formData.append('file', file);

        return this.request('/media/upload', {
            method: 'POST',
            headers: {}, // Let browser set Content-Type for FormData
            body: formData
        });
    }

    async uploadMediaToCaspar(file) {
        const formData = new FormData();
        formData.append('file', file);

        return this.request('/media/upload-to-caspar', {
            method: 'POST',
            headers: {}, // Let browser set Content-Type for FormData
            body: formData
        });
    }

    async deleteMedia(id) {
        return this.request(`/media/${id}`, {
            method: 'DELETE'
        });
    }

    async testFTPConnection() {
        return this.request('/media/ftp/test');
    }

    async getRemoteMedia() {
        try {
            const result = await this.request('/media/caspar');
            return result.files || [];
        } catch (error) {
            console.warn('Could not get remote media list:', error);
            return [];
        }
    }

    async getTemplates() {
        try {
            const result = await this.request('/media/templates');
            return result.files || [];
        } catch (error) {
            console.warn('Could not get templates:', error);
            return [];
        }
    }

    async deleteFromCaspar(filename) {
        return this.request(`/media/ftp/${encodeURIComponent(filename)}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ confirm: true })
        });
    }

    // System endpoints
    async getHealth() {
        return this.request('/health');
    }

    async testCaspar() {
        return this.request('/caspar/test');
    }
}