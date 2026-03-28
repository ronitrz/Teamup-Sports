/**
 * TeamUp Sports - Authentication (Traditional)
 * Register: Fill form → Submit → Account created → Redirect to dashboard
 * Login: Email/phone + password → Sign In
 */

(function () {
    'use strict';

    let busy = false;

    document.addEventListener('DOMContentLoaded', function () {
        const registerForm = document.getElementById('registerForm');
        const loginForm = document.getElementById('loginForm');

        if (registerForm) initRegisterFlow(registerForm);
        if (loginForm) {
            initLoginFlow(loginForm);
            initForgotPasswordFlow();
        }
    });


    // ═══════════════════════════════════════════
    // REGISTER FLOW
    // ═══════════════════════════════════════════

    function initRegisterFlow(form) {
        const passwordToggle = document.getElementById('togglePassword');

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            e.stopPropagation();
            submitRegister();
            return false;
        });

        // ─── Password toggle ───
        if (passwordToggle) {
            passwordToggle.addEventListener('click', function (e) {
                e.preventDefault();
                var pwInput = document.getElementById('password');
                if (pwInput) pwInput.type = pwInput.type === 'password' ? 'text' : 'password';
            });
        }

        // ─── Cascading Location Dropdowns ───
        initLocationDropdowns();

        // ─── OTP Flow ───
        initOtpFlow(form);
    }

    let emailVerified = false;

    function initOtpFlow(form) {
        const btnSendOtp = document.getElementById('btnSendOtp');
        const btnVerifyOtp = document.getElementById('btnVerifyOtp');
        const emailInput = document.getElementById('email');
        const otpGroup = document.getElementById('otpGroup');
        const otpInputs = document.querySelectorAll('.otp-digit');
        const badge = document.getElementById('emailVerifiedBadge');

        if (!btnSendOtp || !btnVerifyOtp) return;

        // Auto-advance logic for 6-digit square OTP
        if (otpInputs.length === 6) {
            otpInputs.forEach((input, index) => {
                // Select text automatically on focus so typing overwrites effortlessly
                input.addEventListener('focus', (e) => {
                    e.target.select();
                });

                input.addEventListener('input', (e) => {
                    // Strictly enforce numeric only
                    e.target.value = e.target.value.replace(/[^0-9]/g, '');
                    
                    // If a valid number was typed, advance focus or auto-submit
                    if (e.target.value !== '') {
                        if (index < 5) {
                            otpInputs[index + 1].focus();
                        } else if (index === 5) {
                            setTimeout(() => {
                                const btn = document.getElementById('btnVerifyOtp');
                                if (btn && !btn.disabled) btn.click();
                            }, 100);
                        }
                    }
                });

                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Backspace') {
                        // If current is empty, jump to previous AND clear it instantly
                        if (e.target.value === '' && index > 0) {
                            otpInputs[index - 1].focus();
                            otpInputs[index - 1].value = '';
                        }
                    } else if (e.key === 'ArrowLeft' && index > 0) {
                        otpInputs[index - 1].focus();
                    } else if (e.key === 'ArrowRight' && index < 5) {
                        otpInputs[index + 1].focus();
                    }
                });

                input.addEventListener('paste', (e) => {
                    e.preventDefault();
                    // Extract up to 6 numeric characters from paste
                    const pastedData = e.clipboardData.getData('text').replace(/[^0-9]/g, '').slice(0, 6).split('');
                    if (pastedData.length > 0) {
                        otpInputs.forEach(i => i.value = ''); // clear all
                        pastedData.forEach((char, i) => {
                            otpInputs[i].value = char;
                        });
                        // Land focus on the box after the last pasted digit (or the very last box)
                        const nextFocusTarget = Math.min(pastedData.length, 5);
                        otpInputs[nextFocusTarget].focus();
                        
                        if (pastedData.length >= 6) {
                            setTimeout(() => {
                                const btn = document.getElementById('btnVerifyOtp');
                                if (btn && !btn.disabled) btn.click();
                            }, 100);
                        }
                    }
                });
            });
        }

        btnSendOtp.addEventListener('click', async function() {
            const email = emailInput.value.trim().toLowerCase();
            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                showToast('Enter a valid email address first.', 'error');
                return;
            }

            const originalText = btnSendOtp.textContent;
            btnSendOtp.disabled = true;
            btnSendOtp.textContent = 'Sending...';

            try {
                // Call AuthAPI.sendOtp (will add to api.js next)
                await AuthAPI.sendOtp(email);
                showToast('OTP sent to your email!', 'success');
                
                // Slide down animation (increased height to fit confirm button + spacing)
                otpGroup.style.maxHeight = '200px';
                otpGroup.style.opacity = '1';
                otpGroup.style.marginBottom = 'var(--space-4)';
                
                // Resend countdown
                let seconds = 60;
                const timer = setInterval(() => {
                    seconds--;
                    btnSendOtp.textContent = `Resend (${seconds}s)`;
                    if (seconds <= 0) {
                        clearInterval(timer);
                        btnSendOtp.disabled = false;
                        btnSendOtp.textContent = 'Verify';
                    }
                }, 1000);

            } catch (err) {
                showToast(err.message || 'Failed to send OTP', 'error');
                btnSendOtp.disabled = false;
                btnSendOtp.textContent = originalText;
            }
        });

        btnVerifyOtp.addEventListener('click', async function() {
            const email = emailInput.value.trim().toLowerCase();
            const code = Array.from(otpInputs).map(inp => inp.value).join('');

            if (code.length !== 6) {
                showToast('Enter the full 6-digit code', 'error');
                return;
            }

            const originalText = btnVerifyOtp.textContent;
            btnVerifyOtp.disabled = true;
            btnVerifyOtp.textContent = 'Checking...';

            try {
                await AuthAPI.verifyOtp(email, code);
                emailVerified = true;
                
                // Success styling
                showToast('Email verified successfully!', 'success');
                
                // Hide sliding field, show badge, disable email input
                otpGroup.style.maxHeight = '0';
                otpGroup.style.opacity = '0';
                otpGroup.style.marginBottom = '0';
                setTimeout(() => otpGroup.style.display = 'none', 400);

                emailInput.readOnly = true;
                emailInput.style.backgroundColor = 'var(--bg-secondary)';
                btnSendOtp.style.display = 'none';
                if(badge) {
                    badge.style.display = 'flex';
                }
            } catch (err) {
                showToast(err.message || 'Invalid code', 'error');
                btnVerifyOtp.disabled = false;
                btnVerifyOtp.textContent = originalText;
            }
        });
    }

    // ─── LOCATION DROPDOWN LOGIC ───
    async function initLocationDropdowns() {
        const countrySelect = document.getElementById('country');
        const stateSelect = document.getElementById('state');
        const citySelect = document.getElementById('city');

        if (!countrySelect || !stateSelect || !citySelect) return;

        // Load countries
        try {
            const result = await LocationsAPI.getCountries();
            const countries = result.countries || [];
            countrySelect.innerHTML = '<option value="">Select Country</option>';
            countries.forEach(function (c) {
                const opt = document.createElement('option');
                opt.value = c;
                opt.textContent = c;
                if (c === 'India') opt.selected = true;
                countrySelect.appendChild(opt);
            });

            // Auto-load states for India
            if (countrySelect.value === 'India') {
                loadStates('India');
            }
        } catch (err) {
            console.error('Failed to load countries:', err);
            countrySelect.innerHTML = '<option value="India" selected>India</option>';
            loadStates('India');
        }

        // Country change → load states
        countrySelect.addEventListener('change', function () {
            const country = countrySelect.value;
            stateSelect.innerHTML = '<option value="">Loading...</option>';
            stateSelect.disabled = true;
            citySelect.innerHTML = '<option value="">Select state first</option>';
            citySelect.disabled = true;

            if (country) {
                loadStates(country);
            }
        });

        // State change → load cities
        stateSelect.addEventListener('change', function () {
            const country = countrySelect.value;
            const state = stateSelect.value;
            citySelect.innerHTML = '<option value="">Loading...</option>';
            citySelect.disabled = true;

            if (country && state) {
                loadCities(country, state);
            }
        });
    }

    async function loadStates(country) {
        const stateSelect = document.getElementById('state');
        const citySelect = document.getElementById('city');
        try {
            const result = await LocationsAPI.getStates(country);
            const states = result.states || [];
            stateSelect.innerHTML = '<option value="">Select State</option>';
            states.forEach(function (s) {
                const opt = document.createElement('option');
                opt.value = s;
                opt.textContent = s;
                stateSelect.appendChild(opt);
            });
            stateSelect.disabled = false;
        } catch (err) {
            console.error('Failed to load states:', err);
            stateSelect.innerHTML = '<option value="">Failed to load</option>';
        }
        citySelect.innerHTML = '<option value="">Select state first</option>';
        citySelect.disabled = true;
    }

    async function loadCities(country, state) {
        const citySelect = document.getElementById('city');
        try {
            const result = await LocationsAPI.getCities(country, state);
            const cities = result.cities || [];
            citySelect.innerHTML = '<option value="">Select City</option>';
            cities.forEach(function (c) {
                const opt = document.createElement('option');
                opt.value = c;
                opt.textContent = c;
                citySelect.appendChild(opt);
            });
            citySelect.disabled = false;
        } catch (err) {
            console.error('Failed to load cities:', err);
            citySelect.innerHTML = '<option value="">Failed to load</option>';
        }
    }


    // ─── SUBMIT REGISTRATION ───
    async function submitRegister() {
        if (busy) return;

        var firstName = (document.getElementById('firstName') || {}).value || '';
        var lastName = (document.getElementById('lastName') || {}).value || '';
        var email = (document.getElementById('email') || {}).value || '';
        var phone = (document.getElementById('phone') || {}).value || '';
        var password = (document.getElementById('password') || {}).value || '';
        var country = (document.getElementById('country') || {}).value || '';
        var state = (document.getElementById('state') || {}).value || '';
        var city = (document.getElementById('city') || {}).value || '';

        firstName = firstName.trim();
        lastName = lastName.trim();
        email = email.trim().toLowerCase();
        phone = phone.trim();

        // Validation
        if (!firstName || !lastName) { showToast('Enter your full name.', 'error'); return; }
        if (!email) { showToast('Enter your email address.', 'error'); return; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast('Enter a valid email address.', 'error'); return; }
        if (!emailVerified) { showToast('Please verify your email by clicking "Verify".', 'error'); return; }
        if (!phone) { showToast('Enter your phone number.', 'error'); return; }
        if (password.length < 6) { showToast('Password needs at least 6 characters.', 'error'); return; }
        if (!country) { showToast('Select your country.', 'error'); return; }
        if (!state) { showToast('Select your state.', 'error'); return; }
        if (!city) { showToast('Select your city.', 'error'); return; }

        var termsCheckbox = document.getElementById('terms');
        if (termsCheckbox && !termsCheckbox.checked) {
            showToast('Please accept the Terms of Service.', 'error');
            return;
        }

        var submitBtn = document.getElementById('btnRegister');
        busy = true;
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Creating Account...'; }

        try {
            var sportsCheckboxes = document.querySelectorAll('input[name="sports"]:checked');
            var sports = [];
            sportsCheckboxes.forEach(function (cb) { sports.push(cb.value); });

            var result = await AuthAPI.register({
                name: firstName + ' ' + lastName,
                email: email,
                phone: phone,
                country: country,
                state: state,
                city: city,
                password: password,
                sports: sports
            });

            if (result.token) {
                API.setToken(result.token);
            }
            if (result.user) {
                UserSession.setUser(result.user);
                showToast('🎉 Welcome to TeamUp Sports!', 'success');
                setTimeout(function () { window.location.href = 'dashboard.html'; }, 1500);
            }
        } catch (err) {
            showToast(err.message || 'Registration failed.', 'error');
        }

        busy = false;
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Create Account'; }
    }


    // ═══════════════════════════════════════════
    // LOGIN FLOW
    // ═══════════════════════════════════════════

    function initLoginFlow(form) {
        var identifierInput = document.getElementById('loginIdentifier');
        var passwordToggle = document.getElementById('toggleLoginPassword');

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            e.stopPropagation();
            submitLogin(identifierInput, form);
            return false;
        });

        if (passwordToggle) {
            passwordToggle.addEventListener('click', function (e) {
                e.preventDefault();
                var pwInput = document.getElementById('loginPassword');
                if (pwInput) pwInput.type = pwInput.type === 'password' ? 'text' : 'password';
            });
        }
    }

    async function submitLogin(identifierInput, form) {
        if (busy) return;

        var identifier = (identifierInput || {}).value || '';
        var password = (document.getElementById('loginPassword') || {}).value || '';
        identifier = identifier.trim();

        if (!identifier) { showToast('Enter your email or phone.', 'error'); return; }
        if (!password) { showToast('Enter your password.', 'error'); return; }

        var submitBtn = form.querySelector('button[type="submit"]');
        busy = true;
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Signing In...'; }

        try {
            var result = await AuthAPI.login(identifier, password);
            if (result.token) {
                API.setToken(result.token);
            }
            if (result.user) {
                UserSession.setUser(result.user);
                showToast('Welcome back! 🎉', 'success');
                setTimeout(function () { window.location.href = 'dashboard.html'; }, 1000);
            }
        } catch (err) {
            showToast(err.message || 'Login failed.', 'error');
        }

        busy = false;
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Sign In'; }
    }


    // ═══════════════════════════════════════════
    // FORGOT PASSWORD FLOW
    // ═══════════════════════════════════════════

    function initForgotPasswordFlow() {
        const linkFp = document.getElementById('linkForgotPassword');
        const loginView = document.getElementById('loginView');
        const fpView = document.getElementById('forgotPasswordView');
        
        const fpStep1 = document.getElementById('fpStep1');
        const fpStep2 = document.getElementById('fpStep2');
        const fpStep3 = document.getElementById('fpStep3');
        
        const btnSendFpOtp = document.getElementById('btnSendFpOtp');
        const btnVerifyFpOtp = document.getElementById('btnVerifyFpOtp');
        const btnResetPassword = document.getElementById('btnResetPassword');
        
        const btnBackToLogin1 = document.getElementById('btnBackToLogin1');
        const btnBackToLogin2 = document.getElementById('btnBackToLogin2');

        if (!linkFp || !fpView) return;

        let resetEmail = "";
        let resetOtp = "";

        // Toggle to Forgot Password View
        linkFp.addEventListener('click', (e) => {
            e.preventDefault();
            loginView.style.display = 'none';
            fpView.style.display = 'block';
            fpStep1.style.display = 'block';
            fpStep2.style.display = 'none';
            fpStep3.style.display = 'none';
        });

        const cancelFp = () => {
            fpView.style.display = 'none';
            loginView.style.display = 'block';
        };

        if(btnBackToLogin1) btnBackToLogin1.addEventListener('click', cancelFp);
        if(btnBackToLogin2) btnBackToLogin2.addEventListener('click', cancelFp);

        // Step 1 -> 2: Send OTP
        if(btnSendFpOtp) {
            btnSendFpOtp.addEventListener('click', async () => {
                const emailInput = document.getElementById('fpEmail');
                const email = emailInput.value.trim().toLowerCase();
                if (!email) {
                    showToast('Please enter your email', 'error');
                    return;
                }
                
                const originalText = btnSendFpOtp.textContent;
                btnSendFpOtp.disabled = true;
                btnSendFpOtp.textContent = 'Sending...';
                
                try {
                    await AuthAPI.forgotPasswordOtp(email);
                    showToast('OTP sent securely!', 'success');
                    resetEmail = email;
                    
                    document.getElementById('fpDisplayEmail').textContent = email;
                    
                    fpStep1.style.display = 'none';
                    fpStep2.style.display = 'block';
                    fpStep2.style.animation = 'slideInRight 0.3s forwards';
                    
                } catch (err) {
                    showToast(err.message || 'Failed to send OTP', 'error');
                } finally {
                    btnSendFpOtp.disabled = false;
                    btnSendFpOtp.textContent = originalText;
                }
            });
        }

        // OTP Array Logic
        const fpOtpInputs = document.querySelectorAll('.fp-otp-digit');
        if (fpOtpInputs.length === 6) {
            fpOtpInputs.forEach((input, index) => {
                input.addEventListener('focus', (e) => e.target.select());
                input.addEventListener('input', (e) => {
                    e.target.value = e.target.value.replace(/[^0-9]/g, '');
                    if (e.target.value !== '') {
                        if (index < 5) fpOtpInputs[index + 1].focus();
                        else if (index === 5) {
                            setTimeout(() => { if (!btnVerifyFpOtp.disabled) btnVerifyFpOtp.click(); }, 100);
                        }
                    }
                });
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Backspace') {
                        if (e.target.value === '' && index > 0) {
                            fpOtpInputs[index - 1].focus();
                            fpOtpInputs[index - 1].value = '';
                        }
                    } else if (e.key === 'ArrowLeft' && index > 0) {
                        fpOtpInputs[index - 1].focus();
                    } else if (e.key === 'ArrowRight' && index < 5) {
                        fpOtpInputs[index + 1].focus();
                    }
                });
                input.addEventListener('paste', (e) => {
                    e.preventDefault();
                    const pastedData = e.clipboardData.getData('text').replace(/[^0-9]/g, '').slice(0, 6).split('');
                    if (pastedData.length > 0) {
                        fpOtpInputs.forEach(i => i.value = '');
                        pastedData.forEach((char, i) => { if(fpOtpInputs[i]) fpOtpInputs[i].value = char; });
                        const nextFocusTarget = Math.min(pastedData.length, 5);
                        fpOtpInputs[nextFocusTarget].focus();
                        if (pastedData.length >= 6) {
                            setTimeout(() => { if (!btnVerifyFpOtp.disabled) btnVerifyFpOtp.click(); }, 100);
                        }
                    }
                });
            });
        }

        // Step 2 -> 3: Pass OTP directly
        if(btnVerifyFpOtp) {
            btnVerifyFpOtp.addEventListener('click', () => {
                const code = Array.from(fpOtpInputs).map(inp => inp.value).join('');
                if (code.length !== 6) {
                    showToast('Please enter the full 6-digit code', 'error');
                    return;
                }
                resetOtp = code;
                fpStep2.style.display = 'none';
                fpStep3.style.display = 'block';
                fpStep3.style.animation = 'slideInRight 0.3s forwards';
            });
        }

        // Step 3 -> Finish: Reset Password
        if(btnResetPassword) {
            btnResetPassword.addEventListener('click', async () => {
                const newPassword = document.getElementById('fpNewPassword').value;
                if (newPassword.length < 6) {
                    showToast('Password must be at least 6 characters', 'error');
                    return;
                }
                
                const originalText = btnResetPassword.textContent;
                btnResetPassword.disabled = true;
                btnResetPassword.textContent = 'Resetting...';
                
                try {
                    await AuthAPI.resetPassword(resetEmail, resetOtp, newPassword);
                    showToast('Password reset! Logging you in...', 'success');
                    
                    setTimeout(async () => {
                        try {
                            const loginRes = await AuthAPI.login(resetEmail, newPassword);
                            if (loginRes.user) {
                                UserSession.setUser(loginRes.user);
                                window.location.href = 'dashboard.html';
                            }
                        } catch (e) {
                             cancelFp();
                        }
                    }, 1000);
                } catch (err) {
                    showToast(err.message || 'Failed to reset password', 'error');
                    btnResetPassword.disabled = false;
                    btnResetPassword.textContent = originalText;
                    
                    if (err.message && err.message.toLowerCase().includes('code')) {
                        fpStep3.style.display = 'none';
                        fpStep2.style.display = 'block';
                    }
                }
            });
        }
    }


    // ═══════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════

    function showToast(message, type) {
        if (typeof Toast !== 'undefined' && Toast[type]) {
            Toast[type](message);
        } else if (typeof Toast !== 'undefined' && Toast.show) {
            Toast.show(message, type);
        } else {
            console.log('[Toast]', type, message);
        }
    }

})();
