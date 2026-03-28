/**
 * TeamUp Sports - Profile Module
 * All data is fetched from the live backend API.
 * No demo / sample data is ever used.
 */

// Module-level store for the live history array (used by filter tabs)
let _liveHistory = [];

// ============================================
// Profile Loading
// ============================================

/**
 * Load and display user profile from backend API.
 * Redirects to login if not authenticated.
 */
async function loadProfile() {
    if (!AuthAPI.isLoggedIn()) {
        window.location.href = 'login.html?redirect=profile.html';
        return;
    }

    try {
        // Fetch full profile (includes stats + credit score)
        const profileResult = await UsersAPI.getProfile();
        const user = profileResult.user;

        // Keep localStorage in sync (strip large images to avoid quota errors)
        UserSession.setUser(user);

        renderProfileHeader(user);

        // Fetch detailed stats (includes real attendanceRate)
        try {
            const statsResult = await UsersAPI.getStats();
            renderCreditScore(user.creditScore !== undefined ? user.creditScore : 100, statsResult.attendanceRate);
            renderStats(statsResult.stats);
        } catch (_) {
            // Fallback: use embedded stats from profile response
            renderCreditScore(user.creditScore !== undefined ? user.creditScore : 100, null);
            renderStats(user.stats);
        }

        // Fetch match history
        await loadMatchHistory('all');

        // Fetch pending join requests
        loadPendingRequests();

    } catch (err) {
        console.error('[Profile] Failed to load profile:', err);
        // If token is invalid the auth layer will redirect to login.
        // For any other error, show a message.
        const container = document.getElementById('matchHistoryTimeline');
        if (container) {
            container.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--text-muted);">
                <p>Failed to load profile. Please try refreshing.</p>
            </div>`;
        }
    }
}

// ============================================
// Profile Header
// ============================================

function renderProfileHeader(user) {
    const avatarInitials = document.getElementById('profileAvatarInitials');
    const avatarImage    = document.getElementById('profileAvatarImage');
    const nameEl         = document.getElementById('profileName');
    const locationEl     = document.getElementById('profileLocation');
    const joinedEl       = document.getElementById('profileJoined');
    const sportsEl       = document.getElementById('profileSports');

    // Profile picture
    if (user.profilePicture) {
        if (avatarImage)    { avatarImage.src = user.profilePicture; avatarImage.style.display = 'block'; }
        if (avatarInitials)   avatarInitials.style.display = 'none';
    } else {
        if (avatarInitials) {
            const initials = (user.name || 'U')
                .split(' ').map(n => n.charAt(0)).join('').toUpperCase().slice(0, 2);
            avatarInitials.textContent = initials;
            avatarInitials.style.display = 'block';
        }
        if (avatarImage) avatarImage.style.display = 'none';
    }

    if (nameEl)     nameEl.textContent  = user.name || '—';
    if (locationEl) locationEl.textContent = escapeHTML(user.location) || (
        [user.city, user.state, user.country].filter(Boolean).join(', ') || 'Not specified'
    );
    if (joinedEl && user.joinedDate) {
        joinedEl.textContent = formatDate(user.joinedDate, { month: 'long', year: 'numeric' });
    }

    if (sportsEl && Array.isArray(user.sports)) {
        if (user.sports.length === 0) {
            sportsEl.innerHTML = `<span style="color:var(--text-muted);font-size:0.85rem;">No sports selected</span>`;
        } else {
            sportsEl.innerHTML = user.sports.map(sportId => {
                const sport = getSportById(sportId);
                return `<span class="sport-tag selected">${sport.icon} ${sport.name}</span>`;
            }).join('');
        }
    }
}

// ============================================
// Credit Score
// ============================================

/**
 * Render credit score gauge.
 * @param {number} score  - credit score value
 * @param {number|null} realAttendanceRate - actual attendance % from /users/me/stats (0–100)
 */
function renderCreditScore(score, realAttendanceRate) {
    const gaugeEl      = document.getElementById('creditGaugeFill');
    const numberEl     = document.getElementById('creditScoreNumber');
    const labelEl      = document.getElementById('creditScoreLabel');
    const attendanceEl = document.getElementById('attendanceRate');
    const reliabilityEl= document.getElementById('reliabilityLabel');

    // Cap gauge at 150 visually (score can exceed 100)
    const displayRatio = Math.min(score, 150) / 150;
    const circumference = 534;
    const offset = circumference - displayRatio * circumference;

    let category, colorClass;
    if (score >= 80) {
        category = 'Excellent';  colorClass = 'excellent';
    } else if (score >= 50) {
        category = 'Good';       colorClass = 'good';
    } else {
        category = 'Needs Work'; colorClass = 'poor';
    }

    if (gaugeEl) {
        gaugeEl.className = `credit-gauge-fill ${colorClass}`;
        setTimeout(() => { gaugeEl.style.strokeDashoffset = offset; }, 100);
    }

    if (numberEl) numberEl.textContent = score;
    if (labelEl)  labelEl.textContent  = category;

    // Use the real attendance rate from the API, never a hardcoded value
    if (attendanceEl) {
        if (realAttendanceRate !== null && realAttendanceRate !== undefined) {
            attendanceEl.textContent = `${realAttendanceRate}%`;
        } else {
            attendanceEl.textContent = '—';
        }
    }

    if (reliabilityEl) {
        reliabilityEl.textContent = category;
        reliabilityEl.className = `badge ${score >= 80 ? 'badge-success' : score >= 50 ? 'badge-warning' : 'badge-danger'}`;
    }
}

// ============================================
// Stats
// ============================================

function renderStats(stats) {
    if (!stats) return;
    const map = {
        statMatchesPlayed:   stats.matchesPlayed,
        statMatchesAttended: stats.matchesAttended,
        statNoShows:         stats.noShows,
        statMatchesCreated:  stats.matchesCreated
    };
    Object.entries(map).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value !== undefined ? value : 0;
    });
}

// ============================================
// Match History  (API-driven, tab-filter aware)
// ============================================

/**
 * Fetch history from API for the given filter tab and render it.
 * @param {'all'|'attended'|'missed'} filter
 */
async function loadMatchHistory(filter = 'all') {
    const container = document.getElementById('matchHistoryTimeline');
    if (!container) return;

    // Show skeleton loader
    container.innerHTML = `
        <div style="display:flex;justify-content:center;padding:2rem;">
            <div class="loader"></div>
        </div>`;

    try {
        const result = await UsersAPI.getMatchHistory(filter);
        _liveHistory = result.history || [];
        renderMatchHistory(_liveHistory);
    } catch (err) {
        console.error('[Profile] History fetch failed:', err);
        container.innerHTML = `
            <div style="text-align:center;padding:2rem;color:var(--text-muted);">
                <p>Could not load match history.</p>
            </div>`;
    }
}

/**
 * Render the match history timeline from API response items.
 * API item shape: { id, matchId, role, attended, createdAt, match: { title, sport, venueName, dateTime, status } }
 */
function renderMatchHistory(history) {
    const container = document.getElementById('matchHistoryTimeline');
    if (!container) return;

    if (!history || history.length === 0) {
        container.innerHTML = `
            <div style="text-align:center;padding:var(--space-8);color:var(--text-muted);">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"
                    style="display:block;margin:0 auto 1rem;opacity:0.4;">
                    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
                    <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                <p>No match history yet. Join or create a match to get started!</p>
            </div>`;
        return;
    }

    container.innerHTML = history.map(item => {
        const match = item.match || {};

        // Safely resolve sport
        const sportId = (match.sport || '').toLowerCase();
        const sport   = getSportById(sportId);

        // Safely resolve venue and title
        const venueName = escapeHTML(match.venueName || match.venue_name || match.title || 'Unknown venue');
        const matchTitle = escapeHTML(match.title || '');

        // Safely resolve date
        const rawDate = match.dateTime || match.date_time || item.createdAt;
        const date    = rawDate ? new Date(rawDate) : null;
        const now     = new Date();
        const isUpcoming = date && date > now;

        // Status display
        let markerClass, statusText, statusColor;
        if (isUpcoming) {
            markerClass = 'upcoming';
            statusText  = 'Upcoming';
            statusColor = 'var(--accent-cyan)';
        } else if (item.attended === true) {
            markerClass = 'attended';
            statusText  = 'Attended';
            statusColor = 'var(--accent-green)';
        } else if (item.attended === false) {
            markerClass = 'no-show';
            statusText  = 'Missed';
            statusColor = '#ef4444';
        } else {
            markerClass = 'upcoming';
            statusText  = match.status ? match.status.charAt(0).toUpperCase() + match.status.slice(1) : '—';
            statusColor = 'var(--text-muted)';
        }

        // Role badge
        const isCapain = (item.role || '').toLowerCase() === 'captain';
        const roleBadge = isCapain
            ? `<span class="badge badge-primary" style="margin-left:var(--space-2);">Captain</span>`
            : '';

        // Date/time display
        const dateDisplay = date
            ? `${formatDate(date)} at ${formatTime(date)}`
            : '—';

        return `
        <div class="timeline-item">
            <div class="timeline-marker ${markerClass}"></div>
            <div class="timeline-content">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:var(--space-2);">
                    <div>
                        <span class="sport-badge ${sportId}" style="font-size:0.8rem;padding:var(--space-1) var(--space-2);">
                            ${sport.icon} ${sport.name}
                        </span>
                        ${roleBadge}
                    </div>
                    <span style="font-size:0.8rem;color:${statusColor};font-weight:500;">${statusText}</span>
                </div>
                ${matchTitle ? `<div style="font-weight:600;margin-bottom:var(--space-1);">${matchTitle}</div>` : ''}
                <div style="font-weight:500;margin-bottom:var(--space-1);color:var(--text-secondary);">${venueName}</div>
                <div style="font-size:0.85rem;color:var(--text-muted);">${dateDisplay}</div>
            </div>
        </div>`;
    }).join('');
}

// ============================================
// Pending Join Requests
// ============================================

/**
 * Load and render pending join requests.
 * Uses real API field names from the JoinRequest.to_dict() response.
 */
async function loadPendingRequests() {
    const section = document.getElementById('pendingRequestsSection');
    const list    = document.getElementById('pendingRequestsList');
    const countEl = document.getElementById('pendingCount');

    try {
        const result       = await RequestsAPI.getMyRequests('pending');
        const userRequests = result.requests || [];

        if (userRequests.length === 0) {
            if (section) section.style.display = 'none';
            return;
        }

        if (section)  section.style.display = 'block';
        if (countEl)  countEl.textContent   = userRequests.length;

        if (list) {
            list.innerHTML = userRequests.map(req => {
                // API shape: { id, userId, matchId, message, status, createdAt, match: {...} }
                const match     = req.match || {};
                const sportId   = (match.sport || '').toLowerCase();
                const sport     = getSportById(sportId);
                const rawDate   = match.dateTime || match.date_time;
                const date      = rawDate ? new Date(rawDate) : null;
                const title     = escapeHTML(match.title || 'Match');
                const venue     = escapeHTML(match.venueName || match.venue_name || '');
                const dateStr   = date ? `${formatDate(date)} at ${formatTime(date)}` : '—';

                return `
                <div style="display:flex;align-items:center;gap:var(--space-4);padding:var(--space-3);
                    background:var(--glass-bg);border-radius:var(--radius-lg);margin-bottom:var(--space-3);">
                    <div style="width:50px;height:50px;background:var(--bg-tertiary);border-radius:var(--radius-lg);
                        display:flex;align-items:center;justify-content:center;font-size:1.5rem;flex-shrink:0;">
                        ${sport.icon}
                    </div>
                    <div style="flex:1;min-width:0;">
                        <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${title}</div>
                        ${venue ? `<div style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:2px;">${venue}</div>` : ''}
                        <div style="font-size:0.85rem;color:var(--text-muted);">${dateStr}</div>
                    </div>
                    <span class="badge badge-warning" style="flex-shrink:0;">Pending</span>
                </div>`;
            }).join('');
        }
    } catch (err) {
        console.error('[Profile] Pending requests fetch failed:', err);
        if (section) section.style.display = 'none';
    }
}

// ============================================
// Profile Picture Upload
// ============================================

let pendingProfilePicture = null;

function handleProfilePictureSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        Toast.error('Please select a valid image file');
        return;
    }
    if (file.size > 2 * 1024 * 1024) {
        Toast.error('Image size must be less than 2MB');
        return;
    }

    const reader = new FileReader();
    reader.onload = function (event) {
        pendingProfilePicture = event.target.result;
        const previewImg = document.getElementById('profilePicturePreview');
        if (previewImg) previewImg.src = pendingProfilePicture;
        Modal.open('profilePictureModal');
    };
    reader.readAsDataURL(file);
}

async function saveProfilePicture() {
    if (!pendingProfilePicture) {
        Toast.error('No picture selected');
        return;
    }
    try {
        const result = await UsersAPI.uploadProfilePicture(pendingProfilePicture);
        const newPic = result.profilePicture || pendingProfilePicture;

        // Update DOM
        const avatarImage    = document.getElementById('profileAvatarImage');
        const avatarInitials = document.getElementById('profileAvatarInitials');
        if (avatarImage)    { avatarImage.src = newPic; avatarImage.style.display = 'block'; }
        if (avatarInitials)   avatarInitials.style.display = 'none';

        // Sync localStorage (without giant image to avoid quota issues)
        let user = UserSession.getCurrentUser();
        if (user) { user.profilePicture = newPic; UserSession.setUser(user); }

        Modal.close('profilePictureModal');
        Toast.success('Profile picture updated!');
    } catch (err) {
        Toast.error(err.message || 'Failed to upload profile picture');
    }
    pendingProfilePicture = null;
    const fileInput = document.getElementById('profilePictureInput');
    if (fileInput) fileInput.value = '';
}

// ============================================
// Edit Profile
// ============================================

function openEditProfile() {
    const user = UserSession.getCurrentUser();
    if (!user) { Toast.warning('Please login to edit your profile'); return; }

    document.getElementById('editName').value     = user.name || '';
    document.getElementById('editLocation').value = user.location ||
        [user.city, user.state].filter(Boolean).join(', ') || '';

    document.querySelectorAll('#editSportsSelection .sport-tag').forEach(tag => {
        const sportId  = tag.dataset.sport;
        const checkbox = tag.querySelector('input');
        const selected = Array.isArray(user.sports) && user.sports.includes(sportId);
        checkbox.checked = selected;
        tag.classList.toggle('selected', selected);
    });

    Modal.open('editProfileModal');
}

async function handleEditProfile(e) {
    e.preventDefault();

    const name     = document.getElementById('editName').value.trim();
    const location = document.getElementById('editLocation').value.trim();
    const sports   = Array.from(
        document.querySelectorAll('#editSportsSelection input:checked')
    ).map(i => i.value);

    if (!name) { Toast.error('Name is required'); return; }

    try {
        const result      = await UsersAPI.updateProfile({ name, location, sports });
        const updatedUser = result.user;
        UserSession.setUser(updatedUser);
        Modal.close('editProfileModal');
        Toast.success('Profile updated successfully!');
        renderProfileHeader(updatedUser);
    } catch (err) {
        Toast.error(err.message || 'Failed to update profile');
    }
}

// ============================================
// Initialize Profile Page
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    loadProfile();

    // History filter tabs — re-fetch from API on each tab switch
    document.querySelectorAll('.tab[data-history]').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab[data-history]').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            loadMatchHistory(tab.dataset.history);   // Always API, never sample data
        });
    });

    // Edit profile form
    const editForm = document.getElementById('editProfileForm');
    if (editForm) editForm.addEventListener('submit', handleEditProfile);

    // Sport tag checkboxes in edit modal
    document.querySelectorAll('#editSportsSelection .sport-tag').forEach(tag => {
        tag.addEventListener('click', () => {
            const checkbox = tag.querySelector('input');
            checkbox.checked = !checkbox.checked;
            tag.classList.toggle('selected', checkbox.checked);
        });
    });

    // Profile picture upload
    const profilePictureInput = document.getElementById('profilePictureInput');
    if (profilePictureInput) {
        profilePictureInput.addEventListener('change', handleProfilePictureSelect);
    }
});

// Exports
window.loadProfile         = loadProfile;
window.openEditProfile     = openEditProfile;
window.saveProfilePicture  = saveProfilePicture;
