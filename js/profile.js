/**
 * TeamUp Sports - Profile Module
 * Handles user profile display, credit score, and match history
 */

// ============================================
// Profile Rendering
// ============================================

/**
 * Load and display user profile from backend API
 */
/**
 * Load and display user profile from backend API.
 * If ?id=<userId> is present in the URL, load that user's public profile.
 * Otherwise load the logged-in user's own profile.
 */
async function loadProfile() {
    const params = new URLSearchParams(window.location.search);
    const viewUserId = params.get('id');
    const loggedInUser = UserSession.getCurrentUser();
    const isOwnProfile = !viewUserId || (loggedInUser && String(loggedInUser.id) === String(viewUserId));

    // Show/hide edit button based on whose profile this is
    const editBtn = document.querySelector('.profile-header button[onclick="openEditProfile()"]');
    const avatarUploadOverlay = document.querySelector('.profile-avatar-container');

    if (!isOwnProfile) {
        if (editBtn) editBtn.style.display = 'none';
        // Disable avatar click-to-upload for other users
        if (avatarUploadOverlay) avatarUploadOverlay.style.cursor = 'default';
        if (avatarUploadOverlay) avatarUploadOverlay.onclick = null;

        // Load the other user's public profile
        try {
            const result = await UsersAPI.getUserById(viewUserId);
            const user = result.user;
            renderProfileHeader(user);
            renderCreditScore(user.creditScore !== undefined ? user.creditScore : 100);
            renderStats(user.stats);
            renderMatchHistory([]);
            // Hide pending requests section for other users
            const pendingSection = document.getElementById('pendingRequestsSection');
            if (pendingSection) pendingSection.style.display = 'none';
            // Update page title
            document.title = `${user.name}'s Profile - TeamUp Sports`;
        } catch (err) {
            console.error('Failed to load user profile:', err);
            const content = document.querySelector('.profile-page .container');
            if (content) content.innerHTML = `<div style="text-align:center;padding:4rem;color:var(--text-muted);">
                <h2>Profile not found</h2><p>This user could not be loaded.</p>
                <a href="dashboard.html" class="btn btn-primary" style="margin-top:1rem;">Back to Matches</a>
            </div>`;
        }
        return;
    }

    // Own profile: full view with all data
    try {
        const result = await UsersAPI.getProfile();
        const user = result.user;

        // Update localStorage with latest data
        UserSession.setUser(user);

        renderProfileHeader(user);
        renderCreditScore(user.creditScore !== undefined ? user.creditScore : 100);
        renderStats(user.stats);

        // Load match history from API
        try {
            const historyResult = await UsersAPI.getMatchHistory();
            renderMatchHistory(historyResult.history || []);
        } catch (e) {
            renderMatchHistory(user.history || []);
        }

        loadPendingRequests();
    } catch (err) {
        // Fallback to localStorage
        let user = UserSession.getCurrentUser();
        if (user) {
            renderProfileHeader(user);
            renderCreditScore(user.creditScore !== undefined ? user.creditScore : 100);
            renderStats(user.stats);
            renderMatchHistory([]);
            loadPendingRequests();
        } else {
            console.error(err);
        }
    }
}


/**
 * Render profile header
 */
function renderProfileHeader(user) {
    const avatarInitials = document.getElementById('profileAvatarInitials');
    const avatarImage = document.getElementById('profileAvatarImage');
    const name = document.getElementById('profileName');
    const location = document.getElementById('profileLocation');
    const joined = document.getElementById('profileJoined');
    const sportsContainer = document.getElementById('profileSports');

    // Handle profile picture
    if (user.profilePicture) {
        if (avatarImage) {
            avatarImage.src = user.profilePicture;
            avatarImage.style.display = 'block';
        }
        if (avatarInitials) {
            avatarInitials.style.display = 'none';
        }
    } else {
        if (avatarInitials) {
            const initials = user.name.split(' ').map(n => n.charAt(0)).join('').toUpperCase();
            avatarInitials.textContent = initials;
            avatarInitials.style.display = 'block';
        }
        if (avatarImage) {
            avatarImage.style.display = 'none';
        }
    }

    if (name) name.textContent = user.name;
    if (location) location.textContent = user.location || 'Not specified';
    if (joined) joined.textContent = formatDate(user.joinedDate, { month: 'long', year: 'numeric' });

    if (sportsContainer && user.sports) {
        sportsContainer.innerHTML = user.sports.map(sportId => {
            const sport = getSportById(sportId);
            return `<span class="sport-tag selected">${sport.icon} ${sport.name}</span>`;
        }).join('');
    }
}

// ============================================
// Profile Picture Upload
// ============================================

let pendingProfilePicture = null;

/**
 * Handle profile picture file selection
 */
function handleProfilePictureSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
        Toast.error('Please select a valid image file');
        return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
        Toast.error('Image size must be less than 5MB');
        return;
    }

    // Read and preview the file
    const reader = new FileReader();
    reader.onload = function (event) {
        pendingProfilePicture = event.target.result;

        // Show preview modal
        const previewImg = document.getElementById('profilePicturePreview');
        if (previewImg) {
            previewImg.src = pendingProfilePicture;
        }
        Modal.open('profilePictureModal');
    };
    reader.readAsDataURL(file);
}

/**
 * Save profile picture to backend API
 */
async function saveProfilePicture() {
    if (!pendingProfilePicture) {
        Toast.error('No picture selected');
        return;
    }

    try {
        // Upload to backend API
        const result = await UsersAPI.uploadProfilePicture(pendingProfilePicture);

        // Update localStorage with latest user data
        let user = UserSession.getCurrentUser();
        if (user) {
            user.profilePicture = result.profilePicture || pendingProfilePicture;
            UserSession.setUser(user);
        }

        // Update display
        const avatarImage = document.getElementById('profileAvatarImage');
        const avatarInitials = document.getElementById('profileAvatarInitials');

        if (avatarImage) {
            avatarImage.src = result.profilePicture || pendingProfilePicture;
            avatarImage.style.display = 'block';
        }
        if (avatarInitials) {
            avatarInitials.style.display = 'none';
        }

        // Close modal and show success
        Modal.close('profilePictureModal');
        Toast.success('Profile picture updated!');

    } catch (err) {
        Toast.error(err.message || 'Failed to upload profile picture');
    }

    // Clear pending
    pendingProfilePicture = null;

    // Reset file input
    const fileInput = document.getElementById('profilePictureInput');
    if (fileInput) fileInput.value = '';
}

/**
 * Render credit score gauge
 */
function renderCreditScore(score) {
    const gaugeEl = document.getElementById('creditGaugeFill');
    const numberEl = document.getElementById('creditScoreNumber');
    const labelEl = document.getElementById('creditScoreLabel');
    const attendanceEl = document.getElementById('attendanceRate');
    const reliabilityEl = document.getElementById('reliabilityLabel');

    // Calculate offset (534 is full circumference)
    const circumference = 534;
    const offset = circumference - (score / 100) * circumference;

    // Determine score category
    let category, colorClass;
    if (score >= 80) {
        category = 'Excellent';
        colorClass = 'excellent';
    } else if (score >= 60) {
        category = 'Good';
        colorClass = 'good';
    } else {
        category = 'Needs Work';
        colorClass = 'poor';
    }

    if (gaugeEl) {
        gaugeEl.className = `credit-gauge-fill ${colorClass}`;
        // Animate the gauge
        setTimeout(() => {
            gaugeEl.style.strokeDashoffset = offset;
        }, 100);
    }

    if (numberEl) numberEl.textContent = score;
    if (labelEl) labelEl.textContent = category;

    if (attendanceEl) {
        const rate = score >= 80 ? '95%' : score >= 60 ? '78%' : '52%';
        attendanceEl.textContent = rate;
    }

    if (reliabilityEl) {
        reliabilityEl.textContent = category;
        reliabilityEl.className = `badge ${score >= 80 ? 'badge-success' : score >= 60 ? 'badge-warning' : 'badge-danger'}`;
    }
}

/**
 * Render stats
 */
function renderStats(stats) {
    if (!stats) return;

    const elements = {
        statMatchesPlayed: stats.matchesPlayed,
        statMatchesAttended: stats.matchesAttended,
        statNoShows: stats.noShows,
        statMatchesCreated: stats.matchesCreated
    };

    Object.entries(elements).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value || 0;
    });
}

/**
 * Generate sample match history
 */
function generateSampleHistory() {
    const sports = ['cricket', 'football', 'basketball', 'badminton'];
    const venues = ['Central Park Ground', 'Sports Complex', 'City Arena', 'Community Stadium'];
    const history = [];

    const now = new Date();

    for (let i = 0; i < 8; i++) {
        const date = new Date(now);
        date.setDate(date.getDate() - (i * 3 + Math.floor(Math.random() * 3)));

        const attended = Math.random() > 0.15; // 85% attendance rate

        history.push({
            id: generateId(),
            sport: sports[Math.floor(Math.random() * sports.length)],
            venue: venues[Math.floor(Math.random() * venues.length)],
            date: date.toISOString(),
            attended: attended,
            role: Math.random() > 0.7 ? 'Captain' : 'Player'
        });
    }

    // Add an upcoming match
    const upcomingDate = new Date(now);
    upcomingDate.setDate(upcomingDate.getDate() + 2);
    history.unshift({
        id: generateId(),
        sport: 'cricket',
        venue: 'Green Field Arena',
        date: upcomingDate.toISOString(),
        attended: null, // Upcoming
        role: 'Player'
    });

    return history;
}

/**
 * Render match history timeline
 */
function renderMatchHistory(history, filter = 'all') {
    const container = document.getElementById('matchHistoryTimeline');
    if (!container) return;

    // Filter history
    let filteredHistory = history;
    if (filter === 'attended') {
        filteredHistory = history.filter(h => h.attended === true);
    } else if (filter === 'missed') {
        filteredHistory = history.filter(h => h.attended === false);
    }

    if (filteredHistory.length === 0) {
        container.innerHTML = `
      <div style="text-align: center; padding: var(--space-8); color: var(--text-muted);">
        <p>No matches found</p>
      </div>
    `;
        return;
    }

    container.innerHTML = filteredHistory.map(item => {
        const matchData = item.match || {};
        const sportId = matchData.sport || item.sport || 'cricket';
        const venueName = matchData.venueName || item.venue || 'Unknown Venue';
        const dateStr = matchData.dateTime || item.date || new Date().toISOString();
        const role = (item.role || 'Player').charAt(0).toUpperCase() + (item.role || 'Player').slice(1).toLowerCase();
        
        const sport = getSportById(sportId);
        const date = new Date(dateStr);
        const now = new Date();
        const isUpcoming = date > now;

        let markerClass, statusText, statusColor;
        if (isUpcoming) {
            markerClass = 'upcoming';
            statusText = 'Upcoming';
            statusColor = 'var(--accent-cyan)';
        } else if (item.attended) {
            markerClass = 'attended';
            statusText = 'Attended';
            statusColor = 'var(--accent-green)';
        } else {
            markerClass = 'no-show';
            statusText = 'Missed';
            statusColor = '#ef4444';
        }

        return `
      <div class="timeline-item">
        <div class="timeline-marker ${markerClass}"></div>
        <div class="timeline-content">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: var(--space-2);">
            <div>
              <span class="sport-badge ${sportId}" style="font-size: 0.8rem; padding: var(--space-1) var(--space-2);">
                ${sport.icon} ${sport.name}
              </span>
              ${role === 'Captain' ? '<span class="badge badge-primary" style="margin-left: var(--space-2);">Captain</span>' : ''}
            </div>
            <span style="font-size: 0.8rem; color: ${statusColor}; font-weight: 500;">${statusText}</span>
          </div>
          <div style="font-weight: 500; margin-bottom: var(--space-1);">${venueName}</div>
          <div style="font-size: 0.85rem; color: var(--text-muted);">
            ${formatDate(date)} at ${formatTime(date)}
          </div>
        </div>
      </div>
    `;
    }).join('');
}

/**
 * Load pending join requests
 */
async function loadPendingRequests() {
    const section = document.getElementById('pendingRequestsSection');
    const list = document.getElementById('pendingRequestsList');
    const count = document.getElementById('pendingCount');

    try {
        const result = await RequestsAPI.getMyRequests('pending');
        const userRequests = result.requests || [];

        if (userRequests.length === 0) {
            if (section) section.style.display = 'none';
            return;
        }

        if (section) section.style.display = 'block';
        if (count) count.textContent = userRequests.length;

        if (list) {
            list.innerHTML = userRequests.map(request => {
                const sport = getSportById(request.sport || 'cricket');
                const date = request.matchDateTime ? new Date(request.matchDateTime) : new Date();
                const matchTitle = request.matchTitle || 'Match';

                return `
            <div style="display: flex; align-items: center; gap: var(--space-4); padding: var(--space-3); background: var(--glass-bg); border-radius: var(--radius-lg); margin-bottom: var(--space-3);">
              <div style="width: 50px; height: 50px; background: var(--bg-tertiary); border-radius: var(--radius-lg); display: flex; align-items: center; justify-content: center; font-size: 1.5rem;">
                ${sport.icon}
              </div>
              <div style="flex: 1;">
                <div style="font-weight: 500;">${matchTitle}</div>
                <div style="font-size: 0.85rem; color: var(--text-muted);">${formatDate(date)} at ${formatTime(date)}</div>
              </div>
              <span class="badge badge-warning">Pending</span>
            </div>
          `;
            }).join('');
        }
    } catch (err) {
        if (section) section.style.display = 'none';
    }
}

// ============================================
// Edit Profile
// ============================================

/**
 * Open edit profile modal
 */
function openEditProfile() {
    const user = UserSession.getCurrentUser();
    if (!user) {
        Toast.warning('Please login to edit your profile');
        return;
    }

    // Pre-fill form
    document.getElementById('editName').value = user.name || '';
    document.getElementById('editLocation').value = user.location || '';

    // Update sport selections
    document.querySelectorAll('#editSportsSelection .sport-tag').forEach(tag => {
        const sportId = tag.dataset.sport;
        const checkbox = tag.querySelector('input');
        const isSelected = user.sports && user.sports.includes(sportId);

        checkbox.checked = isSelected;
        tag.classList.toggle('selected', isSelected);
    });

    Modal.open('editProfileModal');
}

/**
 * Handle edit profile form
 */
async function handleEditProfile(e) {
    e.preventDefault();

    const name = document.getElementById('editName').value.trim();
    const location = document.getElementById('editLocation').value.trim();
    const selectedSports = Array.from(document.querySelectorAll('#editSportsSelection input:checked'))
        .map(input => input.value);

    if (!name) {
        Toast.error('Name is required');
        return;
    }

    try {
        const result = await UsersAPI.updateProfile({ name, location, sports: selectedSports });
        const updatedUser = result.user;

        // Update localStorage with latest data
        UserSession.setUser(updatedUser);

        Modal.close('editProfileModal');
        Toast.success('Profile updated successfully!');

        // Re-render profile
        renderProfileHeader(updatedUser);
    } catch (err) {
        Toast.error(err.message || 'Failed to update profile');
    }
}

// ============================================
// Initialize Profile Page
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    // Load profile
    loadProfile();

    // Setup history filter tabs
    document.querySelectorAll('.tab[data-history]').forEach(tab => {
        tab.addEventListener('click', async () => {
            document.querySelectorAll('.tab[data-history]').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            try {
                const historyResult = await UsersAPI.getMatchHistory();
                renderMatchHistory(historyResult.history || [], tab.dataset.history);
            } catch (err) {
                renderMatchHistory([], tab.dataset.history);
            }
        });
    });

    // Setup edit profile form
    const editForm = document.getElementById('editProfileForm');
    if (editForm) {
        editForm.addEventListener('submit', handleEditProfile);
    }

    // Setup sport tag selection in edit modal
    document.querySelectorAll('#editSportsSelection .sport-tag').forEach(tag => {
        tag.addEventListener('click', () => {
            const checkbox = tag.querySelector('input');
            checkbox.checked = !checkbox.checked;
            tag.classList.toggle('selected', checkbox.checked);
        });
    });

    // Setup profile picture upload
    const profilePictureInput = document.getElementById('profilePictureInput');
    if (profilePictureInput) {
        profilePictureInput.addEventListener('change', handleProfilePictureSelect);
    }
});

// Export functions
window.loadProfile = loadProfile;
window.openEditProfile = openEditProfile;
window.saveProfilePicture = saveProfilePicture;
