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
        if (loginForm) initLoginFlow(loginForm);
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
    
    // ─── OTP LOGIC ───
    let isEmailVerified = false;
    let currentEmail = '';
    let resendTimer = null;
    let resendCountdown = 30;
    
    function initOtpFlow(form) {
        const btnVerifyEmail = document.getElementById('btnVerifyEmail');
        const btnConfirmOtp = document.getElementById('btnConfirmOtp');
        const btnResendOtp = document.getElementById('btnResendOtp');
        const resendText = document.getElementById('resendText');
        const emailInput = document.getElementById('email');
        const otpGroup = document.getElementById('otpGroup');
        const otpInputs = document.querySelectorAll('.otp-input');
        const otpError = document.getElementById('otpError');
        
        if (!btnVerifyEmail || !btnConfirmOtp || otpInputs.length === 0) return;
        
        // Start resend countdown timer
        function startResendTimer() {
            resendCountdown = 30;
            btnResendOtp.disabled = true;
            
            resendTimer = setInterval(() => {
                resendCountdown--;
                if (resendText) {
                    resendText.textContent = `Resend (${resendCountdown}s)`;
                }
                
                if (resendCountdown <= 0) {
                    clearInterval(resendTimer);
                    btnResendOtp.disabled = false;
                    if (resendText) {
                        resendText.textContent = 'Resend';
                    }
                }
            }, 1000);
        }
        
        // Auto-advance logic for 6-box OTP
        otpInputs.forEach((input, index) => {
            input.addEventListener('input', function(e) {
                // Remove non-numeric chars
                this.value = this.value.replace(/[^0-9]/g, '');
                
                if (this.value !== '' && index < otpInputs.length - 1) {
                    otpInputs[index + 1].focus();
                }
                
                // Auto-submit when all 6 digits are entered
                const allFilled = Array.from(otpInputs).every(inp => inp.value.length === 1);
                if (allFilled) {
                    // Small delay for better UX
                    setTimeout(() => btnConfirmOtp.click(), 200);
                }
            });
            
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Backspace' && this.value === '' && index > 0) {
                    otpInputs[index - 1].focus();
                }
            });
            
            // Handle paste of 6 digits
            input.addEventListener('paste', function(e) {
                e.preventDefault();
                const pastedData = e.clipboardData.getData('text').replace(/[^0-9]/g, '').slice(0, 6);
                for (let i = 0; i < pastedData.length; i++) {
                    if (otpInputs[i]) {
                        otpInputs[i].value = pastedData[i];
                    }
                }
                if (pastedData.length > 0) {
                    otpInputs[Math.min(pastedData.length, 5)].focus();
                }
                // Auto-submit if 6 digits pasted
                if (pastedData.length === 6) {
                    setTimeout(() => btnConfirmOtp.click(), 200);
                }
            });
        });

        btnVerifyEmail.addEventListener('click', async function() {
            const email = emailInput.value.trim().toLowerCase();
            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                showToast('Please enter a valid email address first.', 'error');
                return;
            }
            
            currentEmail = email;
            btnVerifyEmail.disabled = true;
            btnVerifyEmail.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px; animation: spin 1s linear infinite;"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg>Sending...';
            
            try {
                const result = await AuthAPI.sendOtp(email);
                showToast(result.message || 'OTP sent to your email!', 'success');
                if (result.note) {
                    setTimeout(() => showToast(result.note, 'info'), 1500);
                }
                
                // Show the OTP box with animation
                otpGroup.style.display = 'block';
                setTimeout(() => {
                    otpGroup.style.opacity = '1';
                    otpGroup.style.transform = 'translateY(0)';
                }, 10);
                
                // Focus first box
                setTimeout(() => otpInputs[0].focus(), 300);
                
                emailInput.disabled = true; // Lock email while verifying
                btnVerifyEmail.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>Sent';
                
                // Start 30-second countdown
                startResendTimer();
            } catch (err) {
                showToast(err.message || 'Failed to send OTP.', 'error');
                btnVerifyEmail.disabled = false;
                btnVerifyEmail.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>Verify';
                emailInput.disabled = false;
            }
        });
        
        // Resend OTP
        if (btnResendOtp) {
            btnResendOtp.addEventListener('click', async function() {
                if (!currentEmail || btnResendOtp.disabled) return;
                
                btnResendOtp.disabled = true;
                const originalText = resendText ? resendText.textContent : 'Resend';
                if (resendText) {
                    resendText.textContent = 'Sending...';
                }
                
                try {
                    const result = await AuthAPI.sendOtp(currentEmail);
                    showToast('New OTP sent!', 'success');
                    // Clear previous OTP inputs
                    otpInputs.forEach(input => {
                        input.value = '';
                        input.classList.remove('error');
                    });
                    otpInputs[0].focus();
                    otpError.style.display = 'none';
                    
                    // Restart 30-second countdown
                    if (resendTimer) clearInterval(resendTimer);
                    startResendTimer();
                } catch (err) {
                    showToast(err.message || 'Failed to resend OTP.', 'error');
                    btnResendOtp.disabled = false;
                    if (resendText) {
                        resendText.textContent = originalText;
                    }
                }
            });
        }
        
        btnConfirmOtp.addEventListener('click', async function() {
            const email = currentEmail || emailInput.value.trim().toLowerCase();
            
            // Collect OTP string from 6 boxes
            let otp = '';
            otpInputs.forEach(input => otp += input.value);
            
            if (otp.length !== 6) {
                otpError.textContent = 'Please enter all 6 digits';
                otpError.style.display = 'block';
                otpInputs.forEach(input => input.classList.add('error'));
                return;
            }
            
            btnConfirmOtp.disabled = true;
            btnConfirmOtp.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px; animation: spin 1s linear infinite;"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg>Verifying...';
            otpError.style.display = 'none';
            otpInputs.forEach(input => input.classList.remove('error'));
            
            try {
                await AuthAPI.verifyOtp(email, otp);
                isEmailVerified = true;
                showToast('✅ Email verified successfully!', 'success');
                
                // Clear timer
                if (resendTimer) clearInterval(resendTimer);
                
                // Update UI to show success
                otpInputs.forEach(input => {
                    input.classList.add('success');
                    input.disabled = true;
                });
                btnVerifyEmail.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px;"><polyline points="20 6 9 17 4 12"></polyline></svg>Verified ✓';
                btnVerifyEmail.style.background = 'var(--accent-green)';
                btnConfirmOtp.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px;"><polyline points="20 6 9 17 4 12"></polyline></svg>Verified ✓';
                btnConfirmOtp.disabled = true;
                btnConfirmOtp.style.background = 'var(--accent-green)';
                if (btnResendOtp) btnResendOtp.style.display = 'none';
                
                // Hide OTP box after 2 seconds
                setTimeout(() => {
                    otpGroup.style.opacity = '0';
                    otpGroup.style.transform = 'translateY(-10px)';
                    setTimeout(() => otpGroup.style.display = 'none', 300);
                }, 2000);
            } catch (err) {
                otpError.textContent = err.message || 'Invalid or expired OTP';
                otpError.style.display = 'block';
                otpInputs.forEach(input => {
                    input.classList.add('error');
                    input.value = ''; // clear on error
                });
                otpInputs[0].focus();
                
                btnConfirmOtp.disabled = false;
                btnConfirmOtp.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px;"><polyline points="20 6 9 17 4 12"></polyline></svg>Confirm Code';
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
        if (!isEmailVerified) { showToast('Please verify your email address first using the Verify button.', 'error'); return; }
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
