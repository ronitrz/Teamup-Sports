/**
 * TeamUp Sports - Core Application JavaScript
 * Handles navigation, utilities, and shared functionality
 */

// ============================================
// Configuration & Constants
// ============================================
const APP_CONFIG = {
  appName: 'TeamUp Sports',
  version: '1.0.0',
  storageKeys: {
    user: 'teamup_user',
    matches: 'teamup_matches',
    pendingRequests: 'teamup_pending_requests'
  }
};

// Sports data
const SPORTS = [
  { id: 'cricket', name: 'Cricket', icon: '🏏', color: '#10b981', playersNeeded: 11 },
  { id: 'football', name: 'Football', icon: '⚽', color: '#22d3ee', playersNeeded: 11 },
  { id: 'basketball', name: 'Basketball', icon: '🏀', color: '#f97316', playersNeeded: 5 },
  { id: 'badminton', name: 'Badminton', icon: '🏸', color: '#ec4899', playersNeeded: 2 },
  { id: 'tennis', name: 'Tennis', icon: '🎾', color: '#fbbf24', playersNeeded: 2 },
  { id: 'volleyball', name: 'Volleyball', icon: '🏐', color: '#8b5cf6', playersNeeded: 6 },
  { id: 'hockey', name: 'Hockey', icon: '🏑', color: '#ef4444', playersNeeded: 11 },
  { id: 'kabaddi', name: 'Kabaddi', icon: '🤼', color: '#06b6d4', playersNeeded: 7 }
];

// ============================================
// Utility Functions
// ============================================

/**
 * Generate a random ID
 */
function generateId() {
  return 'id_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

/**
 * Format date to readable string
 */
function formatDate(date, options = {}) {
  const d = new Date(date);
  const defaultOptions = {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...options
  };
  return d.toLocaleDateString('en-IN', defaultOptions);
}

/**
 * Format time to readable string
 */
function formatTime(date) {
  const d = new Date(date);
  return d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * Format currency
 */
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0
  }).format(amount);
}

/**
 * Get sport by ID
 */
function getSportById(sportId) {
  return SPORTS.find(s => s.id === sportId) || SPORTS[0];
}

/**
 * Local Storage helpers
 */
const Storage = {
  get(key) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error('Storage get error:', e);
      return null;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('Storage set error:', e);
      return false;
    }
  },

  remove(key) {
    localStorage.removeItem(key);
  }
};

// ============================================
// User Session Management
// ============================================

const UserSession = {
  getCurrentUser() {
    return Storage.get(APP_CONFIG.storageKeys.user);
  },

  setUser(user) {
    // Clone user to avoid modifying the original referenced object
    const userToSave = { ...user };

    // localStorage has a strict 5MB limit. Large base64 images will throw QuotaExceededError
    // and prevent the user from logging in. Strip it before saving to local cache.
    // The profile page fetches the real image via API anyway.
    if (userToSave.profilePicture && userToSave.profilePicture.length > 50000) {
      delete userToSave.profilePicture;
    }

    Storage.set(APP_CONFIG.storageKeys.user, userToSave);
    this.updateUI();
  },

  logout() {
    Storage.remove(APP_CONFIG.storageKeys.user);
    if (typeof API !== 'undefined') {
      API.clearToken();
    } else {
      localStorage.removeItem('teamup_token');
    }
    this.updateUI();
    window.location.href = 'index.html';
  },

  isLoggedIn() {
    return !!this.getCurrentUser();
  },

  updateUI() {
    const user = this.getCurrentUser();
    const navActions = document.querySelector('.nav-actions');

    if (navActions) {
      if (user) {
        navActions.innerHTML = `
          <a href="profile.html" class="btn btn-ghost" style="display: flex; align-items: center; gap: 0.5rem;">
            <div style="width: 32px; height: 32px; background: var(--primary-gradient); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 600;">
              ${user.name.charAt(0).toUpperCase()}
            </div>
            ${user.name.split(' ')[0]}
          </a>
          <button onclick="UserSession.logout()" class="btn btn-secondary">Logout</button>
        `;
      } else {
        navActions.innerHTML = `
          <a href="login.html" class="btn btn-ghost">Login</a>
          <a href="register.html" class="btn btn-primary">Sign Up</a>
        `;
      }
    }

    // Also update mobile menu auth section
    const mobileAuth = document.getElementById('mobileMenuAuth');
    if (mobileAuth) {
      if (user) {
        mobileAuth.innerHTML = `
          <a href="profile.html" class="mobile-nav-link" style="display: flex; align-items: center; gap: 0.75rem;">
            <div style="width: 36px; height: 36px; background: var(--primary-gradient); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; font-weight: 600;">
              ${user.name.charAt(0).toUpperCase()}
            </div>
            My Profile
          </a>
          <button onclick="UserSession.logout()" class="btn btn-secondary" style="width: 100%; margin-top: var(--space-3);">Logout</button>
        `;
      } else {
        mobileAuth.innerHTML = `
          <a href="login.html" class="mobile-nav-link">Login</a>
          <a href="register.html" class="btn btn-primary" style="margin-top: var(--space-4);">Sign Up</a>
        `;
      }
    }
  }
};

// ============================================
// Toast Notifications
// ============================================

const Toast = {
  show(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const icons = {
      success: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>',
      error: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      warning: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
      info: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${icons[type]}</span>
      <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  success(message) { this.show(message, 'success'); },
  error(message) { this.show(message, 'error'); },
  warning(message) { this.show(message, 'warning'); },
  info(message) { this.show(message, 'info'); }
};

// ============================================
// Navigation
// ============================================

function initNavigation() {
  const navbar = document.getElementById('navbar');
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const mobileMenu = document.getElementById('mobileMenu');
  const closeMobileMenu = document.getElementById('closeMobileMenu');

  // Navbar scroll effect
  if (navbar) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }
    });
  }

  // Mobile menu toggle
  if (mobileMenuBtn && mobileMenu) {
    mobileMenuBtn.addEventListener('click', () => {
      mobileMenu.classList.add('active');
      document.body.style.overflow = 'hidden';
    });
  }

  if (closeMobileMenu && mobileMenu) {
    closeMobileMenu.addEventListener('click', () => {
      mobileMenu.classList.remove('active');
      document.body.style.overflow = '';
    });
  }

  // Close mobile menu on link click
  document.querySelectorAll('.mobile-nav-link').forEach(link => {
    link.addEventListener('click', () => {
      if (mobileMenu) {
        mobileMenu.classList.remove('active');
        document.body.style.overflow = '';
      }
    });
  });

  // Close mobile menu on overlay click (clicking outside the menu)
  if (mobileMenu) {
    mobileMenu.addEventListener('click', (e) => {
      // The ::before pseudo-element acts as overlay, but clicks on it
      // register on the mobile-menu itself. Only close if clicking the
      // menu container directly (not its children).
      if (e.target === mobileMenu) {
        mobileMenu.classList.remove('active');
        document.body.style.overflow = '';
      }
    });

    // Close mobile menu on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && mobileMenu.classList.contains('active')) {
        mobileMenu.classList.remove('active');
        document.body.style.overflow = '';
      }
    });
  }

  // Set active nav link based on current page
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-link, .mobile-nav-link').forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPage) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });
}

// ============================================
// Modal Management
// ============================================

const Modal = {
  open(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  },

  close(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('active');
      // Clear any inline styles that may have been set
      modal.style.cssText = '';
      document.body.style.overflow = '';
    }
  },

  init() {
    // Close modal on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.classList.remove('active');
          overlay.style.cssText = '';
          document.body.style.overflow = '';
        }
      });
    });

    // Close modal on close button click
    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => {
        const modal = btn.closest('.modal-overlay');
        if (modal) {
          modal.classList.remove('active');
          modal.style.cssText = '';
          document.body.style.overflow = '';
        }
      });
    });

    // Close modal on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active').forEach(modal => {
          modal.classList.remove('active');
          modal.style.cssText = '';
        });
        document.body.style.overflow = '';
      }
    });
  }
};

// ============================================
// Form Validation
// ============================================

const FormValidator = {
  patterns: {
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    phone: /^[6-9]\d{9}$/,
    password: /^.{6,}$/,
    name: /^[a-zA-Z\s]{2,50}$/
  },

  validate(input, type) {
    const value = input.value.trim();
    const pattern = this.patterns[type];

    if (!pattern) return true;

    const isValid = pattern.test(value);
    this.setFieldState(input, isValid);
    return isValid;
  },

  setFieldState(input, isValid) {
    const formGroup = input.closest('.form-group');
    if (formGroup) {
      const errorEl = formGroup.querySelector('.form-error');
      if (isValid) {
        input.classList.remove('error');
        if (errorEl) errorEl.style.display = 'none';
      } else {
        input.classList.add('error');
        if (errorEl) errorEl.style.display = 'block';
      }
    }
  },

  validateForm(form) {
    let isValid = true;
    const inputs = form.querySelectorAll('[data-validate]');

    inputs.forEach(input => {
      const type = input.dataset.validate;
      if (!this.validate(input, type)) {
        isValid = false;
      }
    });

    return isValid;
  }
};

// ============================================
// Sample Data Generator
// ============================================

function generateSampleMatches() {
  const locations = [
    { name: 'Central Park Ground', address: 'MG Road, Mumbai', lat: 19.0760, lng: 72.8777 },
    { name: 'Sports Complex', address: 'Andheri West, Mumbai', lat: 19.1136, lng: 72.8697 },
    { name: 'Community Stadium', address: 'Bandra, Mumbai', lat: 19.0560, lng: 72.8330 },
    { name: 'Green Field Arena', address: 'Powai, Mumbai', lat: 19.1265, lng: 72.9140 },
    { name: 'City Sports Hub', address: 'Thane, Mumbai', lat: 19.2183, lng: 72.9781 }
  ];

  const captains = [
    { id: 'u1', name: 'Rahul Sharma', creditScore: 92 },
    { id: 'u2', name: 'Priya Patel', creditScore: 88 },
    { id: 'u3', name: 'Amit Kumar', creditScore: 75 },
    { id: 'u4', name: 'Sneha Reddy', creditScore: 95 },
    { id: 'u5', name: 'Vikram Singh', creditScore: 82 }
  ];

  const matches = [];
  const now = new Date();

  for (let i = 0; i < 12; i++) {
    const sport = SPORTS[Math.floor(Math.random() * SPORTS.length)];
    const location = locations[Math.floor(Math.random() * locations.length)];
    const captain = captains[Math.floor(Math.random() * captains.length)];

    const matchDate = new Date(now);
    matchDate.setDate(matchDate.getDate() + Math.floor(Math.random() * 14));
    matchDate.setHours(6 + Math.floor(Math.random() * 14), Math.random() > 0.5 ? 0 : 30, 0, 0);

    const totalPlayers = sport.playersNeeded * 2;
    const joinedPlayers = Math.floor(Math.random() * (totalPlayers - 2)) + 2;

    const status = matchDate < now ? 'completed' :
      (matchDate.getTime() - now.getTime() < 3600000 ? 'live' : 'upcoming');

    matches.push({
      id: generateId(),
      sport: sport.id,
      title: `${sport.name} Match - ${location.name}`,
      location: {
        name: location.name,
        address: location.address,
        coordinates: { lat: location.lat, lng: location.lng }
      },
      dateTime: matchDate.toISOString(),
      captain: captain,
      totalPlayers: totalPlayers,
      joinedPlayers: joinedPlayers,
      contribution: Math.floor(Math.random() * 10) * 50 + 100,
      status: status,
      description: `Join us for an exciting ${sport.name.toLowerCase()} match! All skill levels welcome.`,
      players: []
    });
  }

  return matches;
}

function generateSampleUser() {
  return {
    id: generateId(),
    name: 'Rishi Chavda',
    email: 'rishi@example.com',
    phone: '9876543210',
    location: 'Mumbai, Maharashtra',
    sports: ['cricket', 'football', 'badminton'],
    creditScore: 85,
    joinedDate: '2024-01-15',
    stats: {
      matchesPlayed: 24,
      matchesAttended: 22,
      noShows: 2,
      matchesCreated: 5
    },
    history: [
      { matchId: 'm1', sport: 'cricket', date: '2024-02-01', attended: true },
      { matchId: 'm2', sport: 'football', date: '2024-01-28', attended: true },
      { matchId: 'm3', sport: 'badminton', date: '2024-01-20', attended: false },
      { matchId: 'm4', sport: 'cricket', date: '2024-01-15', attended: true }
    ]
  };
}

// ============================================
// Initialize App
// ============================================

function initApp() {
  // Initialize navigation
  initNavigation();

  // Initialize modals
  Modal.init();

  // Update UI based on session
  UserSession.updateUI();
}

// Run on DOM ready
document.addEventListener('DOMContentLoaded', initApp);

// Export for use in other modules
window.APP_CONFIG = APP_CONFIG;
window.SPORTS = SPORTS;
window.Storage = Storage;
window.UserSession = UserSession;
window.Toast = Toast;
window.Modal = Modal;
window.FormValidator = FormValidator;
window.getSportById = getSportById;
window.formatDate = formatDate;
window.formatTime = formatTime;
window.formatCurrency = formatCurrency;
window.generateId = generateId;
window.generateSampleUser = generateSampleUser;
