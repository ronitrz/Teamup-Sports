/**
 * TeamUp Sports - API Configuration
 * Handles all communication with the Python Flask backend
 */

const API_CONFIG = {
    BASE_URL: (window.BACKEND_URL || 'http://localhost:5000') + '/api',
    TIMEOUT: 30000
};

/**
 * API Client - Centralized HTTP request handler
 */
const API = {
    /**
     * Get the stored JWT token
     */
    getToken() {
        return localStorage.getItem('teamup_token');
    },

    /**
     * Set the JWT token
     */
    setToken(token) {
        localStorage.setItem('teamup_token', token);
    },

    /**
     * Clear the JWT token
     */
    clearToken() {
        localStorage.removeItem('teamup_token');
    },

    /**
     * Get default headers with authentication
     */
    getHeaders(includeAuth = true) {
        const headers = {
            'Content-Type': 'application/json'
        };

        if (includeAuth) {
            const token = this.getToken();
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
        }

        return headers;
    },

    /**
     * Make an API request
     */
    async request(method, endpoint, data = null, options = {}) {
        const url = `${API_CONFIG.BASE_URL}${endpoint}`;

        const fetchOptions = {
            method: method.toUpperCase(),
            headers: this.getHeaders(options.auth !== false),
        };

        if (data && ['POST', 'PUT', 'PATCH'].includes(fetchOptions.method)) {
            fetchOptions.body = JSON.stringify(data);
        }

        try {
            console.log(`[API] Fetching ${url}...`);
            const response = await fetch(url, fetchOptions);
            const result = await response.json();

            if (!response.ok) {
                console.error(`[API] Error Response (${response.status}):`, result);
                // Handle specific error codes
                if (response.status === 401) {
                    console.warn('[API] 401 Unauthorized detected. Clearing token.');
                    // Token expired or invalid
                    this.clearToken();
                    if (options.redirectOnUnauth !== false) {
                        console.warn('[API] Redirecting to login.html due to 401');
                        window.location.href = '/login.html';
                    }
                }
                throw new Error(result.error || 'Request failed');
            }

            return result;
        } catch (error) {
            console.error(`[API] Fetch Error [${method} ${endpoint}]:`, error);
            throw error;
        }
    },

    // HTTP method shortcuts
    get(endpoint, options = {}) {
        return this.request('GET', endpoint, null, options);
    },

    post(endpoint, data, options = {}) {
        return this.request('POST', endpoint, data, options);
    },

    put(endpoint, data, options = {}) {
        return this.request('PUT', endpoint, data, options);
    },

    delete(endpoint, options = {}) {
        return this.request('DELETE', endpoint, null, options);
    }
};

// ============================================
// Auth API
// ============================================

const AuthAPI = {
    async register(userData) {
        const result = await API.post('/auth/register', userData, { auth: false });
        if (result.token) {
            API.setToken(result.token);
        }
        return result;
    },

    async login(identifier, password) {
        const result = await API.post('/auth/login', { identifier, password }, { auth: false });
        if (result.token) {
            API.setToken(result.token);
        }
        return result;
    },

    async googleSignIn(credential) {
        const result = await API.post('/auth/google', { credential }, { auth: false });
        if (result.token) {
            API.setToken(result.token);
        }
        return result;
    },

    async sendOtp(email) {
        return API.post('/auth/send-otp', { email }, { auth: false });
    },

    async verifyOtp(email, otp) {
        return API.post('/auth/verify-otp', { email, otp }, { auth: false });
    },

    async sendPasswordResetOtp(email) {
        return API.post('/auth/forgot-password', { email }, { auth: false });
    },

    async verifyPasswordResetOtp(email, otp) {
        return API.post('/auth/verify-reset-otp', { email, otp }, { auth: false });
    },

    async resetPassword(email, newPassword) {
        return API.post('/auth/reset-password', { email, password: newPassword }, { auth: false });
    },

    async getCurrentUser() {
        return API.get('/auth/me');
    },

    logout() {
        API.clearToken();
        localStorage.removeItem('teamup_user');
        window.location.href = '/index.html';
    },

    isLoggedIn() {
        return !!API.getToken();
    }
};

// ============================================
// Users API
// ============================================

const UsersAPI = {
    async getProfile() {
        return API.get('/users/me');
    },

    async updateProfile(data) {
        return API.put('/users/me', data);
    },

    async uploadProfilePicture(imageBase64) {
        return API.post('/users/me/picture', { image: imageBase64 });
    },

    async getMatchHistory(filter = 'all') {
        return API.get(`/users/me/history?filter=${filter}`);
    },

    async getStats() {
        return API.get('/users/me/stats');
    },

    async getUserById(userId) {
        return API.get(`/users/${userId}`, { auth: false });
    }
};

// ============================================
// Matches API
// ============================================

const MatchesAPI = {
    async list(filters = {}) {
        const params = new URLSearchParams();

        if (filters.sport) params.append('sport', filters.sport);
        if (filters.status) params.append('status', filters.status);
        if (filters.search) params.append('search', filters.search);
        if (filters.sortBy) params.append('sortBy', filters.sortBy);
        if (filters.lat) params.append('lat', filters.lat);
        if (filters.lng) params.append('lng', filters.lng);
        if (filters.radius) params.append('radius', filters.radius);

        const queryString = params.toString();
        return API.get(`/matches${queryString ? '?' + queryString : ''}`, { auth: false });
    },

    async getById(matchId) {
        return API.get(`/matches/${matchId}`, { auth: false });
    },

    async create(matchData) {
        return API.post('/matches', matchData);
    },

    async update(matchId, data) {
        return API.put(`/matches/${matchId}`, data);
    },

    async delete(matchId) {
        return API.delete(`/matches/${matchId}`);
    },

    async join(matchId, message = '') {
        return API.post(`/matches/${matchId}/join`, { message });
    },

    async getRequests(matchId, status = 'pending') {
        return API.get(`/matches/${matchId}/requests?status=${status}`);
    }
};

// ============================================
// Join Requests API
// ============================================

const RequestsAPI = {
    async getMyRequests(status = 'all') {
        return API.get(`/requests/my?status=${status}`);
    },

    async approve(requestId) {
        return API.put(`/requests/${requestId}/approve`);
    },

    async reject(requestId) {
        return API.put(`/requests/${requestId}/reject`);
    },

    async cancel(requestId) {
        return API.delete(`/requests/${requestId}/cancel`);
    }
};

// ============================================
// Locations API
// ============================================

const LocationsAPI = {
    async getCountries() {
        return API.get('/locations/countries', { auth: false });
    },

    async getStates(country) {
        return API.get(`/locations/states?country=${encodeURIComponent(country)}`, { auth: false });
    },

    async getCities(country, state) {
        return API.get(`/locations/cities?country=${encodeURIComponent(country)}&state=${encodeURIComponent(state)}`, { auth: false });
    }
};

// ============================================
// Live Stream API
// ============================================

const LiveStreamAPI = {
    async startStream(matchId, cameraLabel) {
        return API.post('/livestream/start', { match_id: matchId, camera_label: cameraLabel });
    },

    async stopStream(streamId) {
        return API.post(`/livestream/stop/${streamId}`);
    },

    async getMatchStreams(matchId) {
        return API.get(`/livestream/match/${matchId}`, { auth: false });
    },

    async getActiveStreams(city = '') {
        const url = city ? `/livestream/active?city=${encodeURIComponent(city)}` : '/livestream/active';
        return API.get(url, { auth: false });
    },

    async getCities() {
        return API.get('/livestream/cities', { auth: false });
    },

    async updateViewerCount(streamId, action) {
        return API.post(`/livestream/${streamId}/viewers`, { action }, { auth: false });
    }
};

// ============================================
// Export for use
// ============================================

window.API = API;
window.AuthAPI = AuthAPI;
window.UsersAPI = UsersAPI;
window.MatchesAPI = MatchesAPI;
window.RequestsAPI = RequestsAPI;
window.LocationsAPI = LocationsAPI;
window.LiveStreamAPI = LiveStreamAPI;
