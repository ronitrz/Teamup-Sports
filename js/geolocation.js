/**
 * TeamUp Sports - Geolocation Module
 * Handles user location and distance-based filtering
 */

// Geolocation state
const GeoLocation = {
    userLocation: null,
    isWatching: false,
    watchId: null,

    /**
     * Calculate distance between two coordinates using Haversine formula
     * @returns distance in kilometers
     */
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth's radius in kilometers
        const dLat = this.toRad(lat2 - lat1);
        const dLon = this.toRad(lon2 - lon1);

        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    },

    toRad(deg) {
        return deg * (Math.PI / 180);
    },

    /**
     * Get user's current location
     */
    async getCurrentLocation() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocation is not supported by your browser'));
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    this.userLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                        accuracy: position.coords.accuracy,
                        timestamp: new Date().toISOString()
                    };

                    // Save to storage
                    Storage.set('teamup_user_location', this.userLocation);
                    resolve(this.userLocation);
                },
                (error) => {
                    console.error('Geolocation error:', error);
                    reject(error);
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 300000 // 5 minutes cache
                }
            );
        });
    },

    /**
     * Get saved location or request new one
     */
    async getLocation() {
        // Try to get from storage first
        const saved = Storage.get('teamup_user_location');

        if (saved) {
            const savedTime = new Date(saved.timestamp);
            const now = new Date();
            const ageMinutes = (now - savedTime) / (1000 * 60);

            // Use cached location if less than 30 minutes old
            if (ageMinutes < 30) {
                this.userLocation = saved;
                return saved;
            }
        }

        // Get fresh location
        return this.getCurrentLocation();
    },

    /**
     * Check if a match is within specified radius
     */
    isWithinRadius(matchLocation, radiusKm = 4) {
        if (!this.userLocation || !matchLocation) return true; // Show if no location data

        const distance = this.calculateDistance(
            this.userLocation.lat,
            this.userLocation.lng,
            matchLocation.lat,
            matchLocation.lng
        );

        return distance <= radiusKm;
    },

    /**
     * Get distance to match location
     */
    getDistanceToMatch(matchLocation) {
        if (!this.userLocation || !matchLocation) return null;

        return this.calculateDistance(
            this.userLocation.lat,
            this.userLocation.lng,
            matchLocation.lat,
            matchLocation.lng
        );
    },

    /**
     * Format distance for display
     */
    formatDistance(distanceKm) {
        if (distanceKm === null) return 'Distance unknown';
        if (distanceKm < 1) {
            return `${Math.round(distanceKm * 1000)}m away`;
        }
        return `${distanceKm.toFixed(1)}km away`;
    }
};

/**
 * Filter matches by location radius
 */
function filterMatchesByLocation(matches, radiusKm = 3, userLocation = null) {
    if (!userLocation && !GeoLocation.userLocation) {
        return matches; // Return all if no location
    }

    const loc = userLocation || GeoLocation.userLocation;

    return matches.filter(match => {
        if (!match.location || !match.location.coordinates) {
            // If match doesn't have coordinates, include it but mark distance as unknown
            return true;
        }

        const distance = GeoLocation.calculateDistance(
            loc.lat,
            loc.lng,
            match.location.coordinates.lat,
            match.location.coordinates.lng
        );

        // Add distance to match object for display
        match.distance = distance;

        return distance <= radiusKm;
    });
}

/**
 * Add coordinates to existing matches (simulation for demo)
 */
function addCoordinatesToMatches(matches) {
    // Mumbai area coordinates for simulation
    const mumbaiLocations = [
        { lat: 19.0760, lng: 72.8777 }, // Mumbai center
        { lat: 19.1136, lng: 72.8697 }, // Andheri
        { lat: 19.0560, lng: 72.8330 }, // Bandra
        { lat: 19.1265, lng: 72.9140 }, // Powai
        { lat: 19.2183, lng: 72.9781 }, // Thane
        { lat: 19.0330, lng: 72.8563 }, // Worli
        { lat: 19.0886, lng: 72.8656 }, // Juhu
        { lat: 18.9523, lng: 72.8325 }, // Colaba
        { lat: 19.1816, lng: 72.8547 }, // Kandivali
        { lat: 19.2403, lng: 72.8569 }, // Borivali
    ];

    return matches.map((match, index) => {
        if (!match.location.coordinates) {
            match.location.coordinates = mumbaiLocations[index % mumbaiLocations.length];
        }
        return match;
    });
}

/**
 * Request location permission with UI
 */
async function requestLocationPermission() {
    const locationStatus = document.getElementById('locationStatus');

    try {
        if (locationStatus) {
            locationStatus.innerHTML = `
        <div style="display: flex; align-items: center; gap: var(--space-3); padding: var(--space-4); background: rgba(251, 191, 36, 0.1); border-radius: var(--radius-lg); margin-bottom: var(--space-4);">
          <div class="loader" style="width: 24px; height: 24px;"></div>
          <span>Getting your location...</span>
        </div>
      `;
        }

        const location = await GeoLocation.getCurrentLocation();

        if (locationStatus) {
            locationStatus.innerHTML = `
        <div style="display: flex; align-items: center; gap: var(--space-3); padding: var(--space-4); background: rgba(16, 185, 129, 0.1); border-radius: var(--radius-lg); margin-bottom: var(--space-4);">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-green)" stroke-width="2">
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          <span>Location enabled - showing matches within 4km</span>
          <button onclick="toggleLocationFilter(false)" class="btn btn-ghost btn-sm" style="margin-left: auto;">Show All</button>
        </div>
      `;
        }

        Toast.success('Location enabled! Showing nearby matches.');
        return location;

    } catch (error) {
        if (locationStatus) {
            locationStatus.innerHTML = `
        <div style="display: flex; align-items: center; gap: var(--space-3); padding: var(--space-4); background: rgba(239, 68, 68, 0.1); border-radius: var(--radius-lg); margin-bottom: var(--space-4);">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>Location access denied. Showing all matches.</span>
          <button onclick="requestLocationPermission()" class="btn btn-ghost btn-sm" style="margin-left: auto;">Try Again</button>
        </div>
      `;
        }

        Toast.warning('Location access denied. Showing all matches.');
        return null;
    }
}

/**
 * Toggle location filter on/off
 */
function toggleLocationFilter(enabled) {
    Storage.set('teamup_location_filter', enabled);

    const locationStatus = document.getElementById('locationStatus');

    if (enabled) {
        requestLocationPermission().then(() => {
            if (typeof initDashboardPage === 'function') {
                initDashboardPage();
            }
        });
    } else {
        if (locationStatus) {
            locationStatus.innerHTML = `
        <div style="display: flex; align-items: center; gap: var(--space-3); padding: var(--space-4); background: var(--glass-bg); border-radius: var(--radius-lg); margin-bottom: var(--space-4);">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2">
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          <span>Showing all matches</span>
          <button onclick="toggleLocationFilter(true)" class="btn btn-primary btn-sm" style="margin-left: auto;">Enable Location</button>
        </div>
      `;
        }

        if (typeof initDashboardPage === 'function') {
            initDashboardPage();
        }
    }
}

// Export functions
window.GeoLocation = GeoLocation;
window.filterMatchesByLocation = filterMatchesByLocation;
window.addCoordinatesToMatches = addCoordinatesToMatches;
window.requestLocationPermission = requestLocationPermission;
window.toggleLocationFilter = toggleLocationFilter;
