/**
 * TeamUp Sports - Matches Management
 * Handles match rendering, filtering, and join functionality
 * All data is fetched from the backend PostgreSQL API
 */

// ============================================
// Match Card Rendering
// ============================================

/**
 * Create a match card HTML
 */
function createMatchCard(match) {
    const sport = getSportById(match.sport);
    // Support both API format (currentPlayers/spotsLeft) and legacy format (joinedPlayers)
    const currentPlayers = match.currentPlayers || match.joinedPlayers || 0;
    const spotsLeft = match.spotsLeft !== undefined ? match.spotsLeft : (match.totalPlayers - currentPlayers);
    const matchDate = new Date(match.dateTime);

    // Generate player avatars
    let avatarsHTML = '';
    const displayCount = Math.min(currentPlayers, 4);
    for (let i = 0; i < displayCount; i++) {
        const initials = String.fromCharCode(65 + i);
        avatarsHTML += `<div class="player-avatar">${initials}</div>`;
    }
    if (currentPlayers > 4) {
        avatarsHTML += `<div class="player-avatar remaining">+${currentPlayers - 4}</div>`;
    }

    const statusClass = match.status === 'open' ? 'upcoming' : (match.status || 'upcoming');
    const statusText = match.status === 'live' ? '🔴 Live Now' :
        match.status === 'completed' ? 'Completed' :
            match.status === 'full' ? 'Full' : 'Upcoming';

    // Distance display
    let distanceHTML = '';
    if (match.distance !== undefined && match.distance !== null) {
        distanceHTML = `
          <div class="match-info-item" style="color: var(--accent-cyan);">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>
            </svg>
            <span>${match.distance < 1 ? Math.round(match.distance * 1000) + 'm' : match.distance.toFixed(1) + 'km'} away</span>
          </div>
        `;
    }

    // Location name
    const locationName = match.location ? (match.location.name || match.venueName) : (match.venueName || 'TBA');

    return `
    <div class="card card-glow match-card" data-match-id="${match.id}" onclick="viewMatchDetails('${match.id}')">
      <div class="match-card-header">
        <span class="sport-badge ${match.sport}">
          ${sport.icon} ${sport.name}
        </span>
        <span class="match-status ${statusClass}">${statusText}</span>
      </div>
      
      <div class="match-card-body">
        <h3 class="match-title">${match.title}</h3>
        
        <div class="match-info">
          <div class="match-info-item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
            <span>${locationName}</span>
          </div>
          
          ${distanceHTML}
          
          <div class="match-info-item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <span>${formatDate(matchDate)}</span>
          </div>
          
          <div class="match-info-item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            <span>${formatTime(matchDate)}</span>
          </div>
        </div>
        
        <div class="players-needed">
          <div class="players-avatars">
            ${avatarsHTML}
          </div>
          <span style="color: ${spotsLeft <= 3 ? 'var(--accent-orange)' : 'var(--text-secondary)'};">
            ${spotsLeft > 0 ? `${spotsLeft} spot${spotsLeft > 1 ? 's' : ''} left` : 'Team Full'}
          </span>
        </div>
      </div>
      
      <div class="match-card-footer">
        <div class="contribution">
          ${formatCurrency(match.contribution)}
          <span>/ person</span>
        </div>
        ${match.entriesClosed
            ? `<button class="btn btn-secondary btn-sm" disabled style="opacity:0.6;cursor:not-allowed;">Entries Closed</button>`
            : `<button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); handleJoinRequest('${match.id}')">
              ${spotsLeft > 0 ? 'Join Match' : 'Join Waitlist'}
            </button>`
        }
      </div>
    </div>
  `;
}

/**
 * Render matches to a container
 */
function renderMatches(containerId, matches) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!matches || matches.length === 0) {
        container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: var(--space-16); color: var(--text-secondary);">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="margin: 0 auto var(--space-4); opacity: 0.5;">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.3-4.3"/>
        </svg>
        <h3 style="margin-bottom: var(--space-2); color: var(--text-primary);">No matches found</h3>
        <p>Try adjusting your filters or create a new match!</p>
        <a href="create-match.html" class="btn btn-primary" style="margin-top: var(--space-6);">Create Match</a>
      </div>
    `;
        return;
    }

    container.innerHTML = matches.map(match => createMatchCard(match)).join('');
}

/**
 * Render featured matches on home page (limit to 6, fetched from API)
 */
async function renderFeaturedMatches() {
    try {
        // Build filters with location if available
        const filters = { status: 'open' };
        const userLocation = (typeof GeoLocation !== 'undefined') ? GeoLocation.userLocation : null;
        if (userLocation) {
            filters.lat = userLocation.lat;
            filters.lng = userLocation.lng;
            filters.radius = 4;
        }

        const result = await MatchesAPI.list(filters);
        const matches = (result.matches || []).slice(0, 6);
        renderMatches('featuredMatches', matches);
    } catch (err) {
        console.error('Failed to load featured matches:', err);
        renderMatches('featuredMatches', []);
    }
}

// ============================================
// Match Filtering (API-based)
// ============================================

let currentFilters = {
    sport: '',
    search: '',
    status: 'all',
    sortBy: 'date'
};

/**
 * Fetch and filter matches from the backend API
 */
async function fetchAndRenderMatches() {
    const grid = document.getElementById('matchesGrid');
    if (grid) {
        // Show loader
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; display: flex; justify-content: center; padding: var(--space-16);">
                <div class="loader"></div>
            </div>
        `;
    }

    try {
        // Build API filters
        const apiFilters = {};
        if (currentFilters.sport) apiFilters.sport = currentFilters.sport;
        if (currentFilters.status && currentFilters.status !== 'all') {
            apiFilters.status = currentFilters.status;
        }
        if (currentFilters.search) apiFilters.search = currentFilters.search;
        if (currentFilters.sortBy) apiFilters.sortBy = currentFilters.sortBy;

        // Add location filter
        const locationFilterEnabled = Storage.get('teamup_location_filter');
        const userLocation = (typeof GeoLocation !== 'undefined') ? GeoLocation.userLocation : null;
        if (locationFilterEnabled && userLocation) {
            apiFilters.lat = userLocation.lat;
            apiFilters.lng = userLocation.lng;
            apiFilters.radius = 4;
        }

        const result = await MatchesAPI.list(apiFilters);
        const matches = result.matches || [];

        renderMatches('matchesGrid', matches);
        updateMapMarkers(matches);

    } catch (err) {
        console.error('Failed to fetch matches:', err);
        renderMatches('matchesGrid', []);
    }
}

/**
 * Update filters and re-render matches
 */
function updateFilter(filterType, value) {
    currentFilters[filterType] = value;
    fetchAndRenderMatches();

    // Update URL params
    const url = new URL(window.location);
    if (value) {
        url.searchParams.set(filterType, value);
    } else {
        url.searchParams.delete(filterType);
    }
    window.history.replaceState({}, '', url);
}

/**
 * Initialize filters from URL params
 */
function initFiltersFromURL() {
    const params = new URLSearchParams(window.location.search);

    currentFilters.sport = params.get('sport') || '';
    currentFilters.search = params.get('search') || '';
    currentFilters.status = params.get('status') || 'all';

    // Update filter UI elements
    const sportFilter = document.getElementById('sportFilter');
    const searchInput = document.getElementById('searchInput');
    const statusTabs = document.querySelectorAll('.tab[data-status]');

    if (sportFilter) sportFilter.value = currentFilters.sport;
    if (searchInput) searchInput.value = currentFilters.search;

    statusTabs.forEach(tab => {
        if (tab.dataset.status === currentFilters.status) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
}

// ============================================
// Match Join Flow (API-based)
// ============================================

/**
 * Handle join match request via backend API
 */
async function handleJoinRequest(matchId) {
    const user = UserSession.getCurrentUser();

    if (!user) {
        Toast.warning('Please login to join a match');
        setTimeout(() => {
            window.location.href = 'login.html?redirect=' + encodeURIComponent(window.location.href);
        }, 1000);
        return;
    }

    try {
        const result = await MatchesAPI.join(matchId);
        Toast.success(result.message || 'Join request sent! Waiting for captain approval.');

        // Re-fetch matches to update UI
        fetchAndRenderMatches();
    } catch (err) {
        Toast.error(err.message || 'Failed to send join request');
    }
}

/**
 * View match details
 */
function viewMatchDetails(matchId) {
    window.location.href = `match-details.html?id=${matchId}`;
}

// ============================================
// Dashboard Map
// ============================================

let dashboardMap = null;
let mapMarkers = [];
let userLocationMarker = null;
let radiusCircle = null;
let mapVisible = true;

/**
 * Initialize the dashboard map
 */
function initDashboardMap() {
    const mapContainer = document.getElementById('matchMap');
    if (!mapContainer || !window.L) return;

    // Default center: Mumbai
    const defaultCenter = [19.0760, 72.8777];
    const defaultZoom = 13;

    dashboardMap = L.map('matchMap', {
        center: defaultCenter,
        zoom: defaultZoom,
        zoomControl: true,
        scrollWheelZoom: true,
        attributionControl: true
    });

    // OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19
    }).addTo(dashboardMap);

    // If user location is available, center on it and show radius
    const userLocation = GeoLocation ? GeoLocation.userLocation : null;
    if (userLocation) {
        dashboardMap.setView([userLocation.lat, userLocation.lng], 14);
        showUserLocationOnMap(userLocation);
    }
}

/**
 * Show user location and 4km radius on map
 */
function showUserLocationOnMap(location) {
    if (!dashboardMap || !location) return;

    // Remove existing user marker and radius
    if (userLocationMarker) dashboardMap.removeLayer(userLocationMarker);
    if (radiusCircle) dashboardMap.removeLayer(radiusCircle);

    // User location marker (pulsing blue dot)
    const userIcon = L.divIcon({
        className: 'user-location-marker',
        html: `<div style="
            width: 16px; height: 16px;
            background: #3b82f6;
            border: 3px solid #fff;
            border-radius: 50%;
            box-shadow: 0 0 10px rgba(59,130,246,0.6), 0 0 30px rgba(59,130,246,0.3);
            animation: pulse 2s infinite;
        "></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8]
    });

    userLocationMarker = L.marker([location.lat, location.lng], { icon: userIcon })
        .addTo(dashboardMap)
        .bindPopup('<div class="map-popup-title">📍 Your Location</div>');

    // 4km radius circle
    const locationFilterEnabled = Storage.get('teamup_location_filter');
    if (locationFilterEnabled) {
        radiusCircle = L.circle([location.lat, location.lng], {
            radius: 4000, // 4km in meters
            color: '#8b5cf6',
            fillColor: '#8b5cf6',
            fillOpacity: 0.08,
            weight: 2,
            dashArray: '8, 8',
            opacity: 0.5
        }).addTo(dashboardMap);
    }
}

/**
 * Update match markers on the map
 */
function updateMapMarkers(matches) {
    if (!dashboardMap) return;

    // Clear existing markers
    mapMarkers.forEach(marker => dashboardMap.removeLayer(marker));
    mapMarkers = [];

    const bounds = [];

    matches.forEach(match => {
        let lat, lng;

        // Support API format (location.lat/lng) and nested coordinates
        if (match.location && match.location.lat) {
            lat = match.location.lat;
            lng = match.location.lng;
        } else if (match.location && match.location.coordinates) {
            lat = match.location.coordinates.lat;
            lng = match.location.coordinates.lng;
        }

        if (!lat || !lng) return;

        const sport = getSportById(match.sport);
        const currentPlayers = match.currentPlayers || match.joinedPlayers || 0;
        const spotsLeft = match.spotsLeft !== undefined ? match.spotsLeft : (match.totalPlayers - currentPlayers);
        const distanceText = match.distance !== undefined && match.distance !== null
            ? `<div class="map-popup-distance">${match.distance < 1 ? Math.round(match.distance * 1000) + 'm' : match.distance.toFixed(1) + 'km'} away</div>`
            : '';

        // Custom colored marker
        const markerIcon = L.divIcon({
            className: 'match-marker',
            html: `<div style="
                width: 36px; height: 36px;
                background: var(--primary-gradient, linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%));
                border-radius: 50% 50% 50% 0;
                transform: rotate(-45deg);
                display: flex; align-items: center; justify-content: center;
                box-shadow: 0 3px 12px rgba(139, 92, 246, 0.5);
                border: 2px solid rgba(255,255,255,0.3);
            "><span style="transform: rotate(45deg); font-size: 16px;">${sport.icon}</span></div>`,
            iconSize: [36, 36],
            iconAnchor: [18, 36],
            popupAnchor: [0, -36]
        });

        const marker = L.marker([lat, lng], { icon: markerIcon })
            .addTo(dashboardMap)
            .bindPopup(`
                <div class="map-popup-title">${match.title}</div>
                <div class="map-popup-sport">${sport.icon} ${sport.name} · ${spotsLeft > 0 ? spotsLeft + ' spots left' : 'Full'}</div>
                ${distanceText}
                <a class="map-popup-link" onclick="viewMatchDetails('${match.id}')">View Details →</a>
            `);

        mapMarkers.push(marker);
        bounds.push([lat, lng]);
    });

    // Add user location to bounds if available
    const userLocation = GeoLocation ? GeoLocation.userLocation : null;
    if (userLocation) {
        bounds.push([userLocation.lat, userLocation.lng]);
        showUserLocationOnMap(userLocation);
    }

    // Fit map to show all markers
    if (bounds.length > 1) {
        dashboardMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    } else if (bounds.length === 1) {
        dashboardMap.setView(bounds[0], 14);
    }
}

/**
 * Toggle map visibility
 */
function toggleMatchMap() {
    const wrapper = document.getElementById('matchMapWrapper');
    const toggleText = document.getElementById('toggleMapText');
    const toggleIcon = document.getElementById('toggleMapIcon');

    if (!wrapper) return;

    mapVisible = !mapVisible;

    if (mapVisible) {
        wrapper.classList.remove('collapsed');
        if (toggleText) toggleText.textContent = 'Hide Map';
        if (toggleIcon) toggleIcon.innerHTML = '<polyline points="6 9 12 15 18 9"/>';
        // Invalidate map size after expanding
        setTimeout(() => {
            if (dashboardMap) dashboardMap.invalidateSize();
        }, 400);
    } else {
        wrapper.classList.add('collapsed');
        if (toggleText) toggleText.textContent = 'Show Map';
        if (toggleIcon) toggleIcon.innerHTML = '<polyline points="6 15 12 9 18 15"/>';
    }
}

// ============================================
// Dashboard Page Initialization
// ============================================

function initDashboardPage() {
    // Initialize filters from URL
    initFiltersFromURL();

    // Initialize map
    if (!dashboardMap) {
        initDashboardMap();
    }

    // Auto-request location on first visit
    const locationFilterEnabled = Storage.get('teamup_location_filter');
    if (locationFilterEnabled === null || locationFilterEnabled === undefined || locationFilterEnabled === true) {
        // Auto-enable location filter and request permission
        Storage.set('teamup_location_filter', true);
        requestLocationPermission().then(() => {
            fetchAndRenderMatches();
        }).catch(() => {
            // If denied, show all matches
            Storage.set('teamup_location_filter', false);
            fetchAndRenderMatches();
        });
    } else {
        // Location filter explicitly disabled by user
        fetchAndRenderMatches();
    }

    // Setup filter event listeners
    const sportFilter = document.getElementById('sportFilter');
    const searchInput = document.getElementById('searchInput');
    const statusTabs = document.querySelectorAll('.tab[data-status]');
    const sortFilter = document.getElementById('sortFilter');

    if (sportFilter) {
        sportFilter.addEventListener('change', (e) => {
            updateFilter('sport', e.target.value);
        });
    }

    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                updateFilter('search', e.target.value);
            }, 300);
        });
    }

    statusTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            statusTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            updateFilter('status', tab.dataset.status);
        });
    });

    if (sortFilter) {
        sortFilter.addEventListener('change', (e) => {
            updateFilter('sortBy', e.target.value);
        });
    }

    // Auto-refresh matches every 30 seconds for real-time status updates
    setInterval(() => {
        fetchAndRenderMatches();
    }, 30000);
}

// Export functions
window.createMatchCard = createMatchCard;
window.renderMatches = renderMatches;
window.renderFeaturedMatches = renderFeaturedMatches;
window.fetchAndRenderMatches = fetchAndRenderMatches;
window.updateFilter = updateFilter;
window.handleJoinRequest = handleJoinRequest;
window.viewMatchDetails = viewMatchDetails;
window.initDashboardPage = initDashboardPage;
window.toggleMatchMap = toggleMatchMap;
window.initDashboardMap = initDashboardMap;
window.updateMapMarkers = updateMapMarkers;
