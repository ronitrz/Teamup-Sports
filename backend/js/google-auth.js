/**
 * Google Sign-In — uses Google Identity Services (GIS)
 *
 * SETUP: Replace YOUR_GOOGLE_CLIENT_ID below with your real Client ID
 *        from https://console.cloud.google.com/apis/credentials
 */

const GOOGLE_CLIENT_ID = '386883098339-fdtebdvagjpavttg3lv2vhll7h6p7ok1.apps.googleusercontent.com';

/**
 * Called when user clicks "Sign in with Google" / "Sign up with Google"
 */
function handleGoogleSignIn() {
    // Check if GIS library loaded
    if (typeof google === 'undefined' || !google.accounts) {
        Toast.error('Google Sign-In is loading, please try again in a moment.');
        return;
    }

    google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCredential,
        auto_select: false,
    });

    // Show the One Tap / popup prompt
    google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            // Fallback: use the button-based popup
            console.log('[GOOGLE] Prompt not shown, using popup fallback');
            google.accounts.id.renderButton(
                document.createElement('div'), // hidden element
                { type: 'standard' }
            );
            // Try prompting again or use popup
            tryGooglePopup();
        }
    });
}

/**
 * Fallback: open Google OAuth in a popup window
 */
function tryGooglePopup() {
    const client = google.accounts.oauth2.initCodeClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'email profile',
        ux_mode: 'popup',
        callback: async (response) => {
            if (response.code) {
                // For auth code flow we'd need server exchange
                // Instead, use the token client
                Toast.error('Please enable popups and try again.');
            }
        },
    });

    // Use token client instead (simpler, no server exchange needed)
    const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'email profile',
        callback: async (tokenResponse) => {
            if (tokenResponse.access_token) {
                // Get user info from Google
                try {
                    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                        headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
                    });
                    const userInfo = await res.json();

                    // We need the ID token, not access token, for backend verification
                    // Since we can't get ID token from token client easily, show a message
                    Toast.info('Please allow the Google popup to sign in.');
                } catch (err) {
                    Toast.error('Google sign-in failed. Please try again.');
                }
            }
        },
    });

    tokenClient.requestAccessToken();
}

/**
 * Called by GIS when user selects a Google account
 */
async function handleGoogleCredential(response) {
    if (!response.credential) {
        Toast.error('Google sign-in was cancelled.');
        return;
    }

    // Disable the button while processing
    const btn = document.getElementById('googleSignInBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Signing in...'; }

    try {
        const result = await AuthAPI.googleSignIn(response.credential);

        if (result.user) {
            UserSession.setUser(result.user);
            Toast.success('Signed in with Google! 🎉');
            setTimeout(() => window.location.href = 'dashboard.html', 1000);
        }
    } catch (err) {
        console.error('[GOOGLE] Sign-in error:', err);
        Toast.error(err.message || 'Google sign-in failed. Please try again.');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Sign in with Google`;
        }
    }
}
