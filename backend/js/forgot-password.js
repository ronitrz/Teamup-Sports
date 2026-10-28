/**
 * TeamUp Sports - Forgot Password Flow
 */

(function () {
    'use strict';

    let currentEmail = '';
    let otpVerified = false;
    let resendTimer = null;
    let resendCountdown = 30;

    document.addEventListener('DOMContentLoaded', function () {
        initForgotPasswordFlow();
    });

    function initForgotPasswordFlow() {
        const forgotPasswordForm = document.getElementById('forgotPasswordForm');
        const otpSection = document.getElementById('otpSection');
        const newPasswordForm = document.getElementById('newPasswordForm');
        const btnSendReset = document.getElementById('btnSendReset');
        const btnVerifyResetOtp = document.getElementById('btnVerifyResetOtp');
        const btnResendResetOtp = document.getElementById('btnResendResetOtp');
        const btnResetPassword = document.getElementById('btnResetPassword');
        const resetResendText = document.getElementById('resetResendText');
        const otpInputs = document.querySelectorAll('#resetOtpInputs .otp-input');
        const resetOtpError = document.getElementById('resetOtpError');

        // Start resend countdown timer
        function startResendTimer() {
            resendCountdown = 30;
            btnResendResetOtp.disabled = true;

            resendTimer = setInterval(() => {
                resendCountdown--;
                if (resetResendText) {
                    resetResendText.textContent = `Resend (${resendCountdown}s)`;
                }

                if (resendCountdown <= 0) {
                    clearInterval(resendTimer);
                    btnResendResetOtp.disabled = false;
                    if (resetResendText) {
                        resetResendText.textContent = 'Resend';
                    }
                }
            }, 1000);
        }

        // Auto-advance OTP inputs
        otpInputs.forEach((input, index) => {
            input.addEventListener('input', function () {
                this.value = this.value.replace(/[^0-9]/g, '');
                if (this.value !== '' && index < otpInputs.length - 1) {
                    otpInputs[index + 1].focus();
                }
                
                // Auto-submit when all 6 digits entered
                const allFilled = Array.from(otpInputs).every(inp => inp.value.length === 1);
                if (allFilled) {
                    setTimeout(() => btnVerifyResetOtp.click(), 200);
                }
            });

            input.addEventListener('keydown', function (e) {
                if (e.key === 'Backspace' && this.value === '' && index > 0) {
                    otpInputs[index - 1].focus();
                }
            });

            // Handle paste
            input.addEventListener('paste', function (e) {
                e.preventDefault();
                const pastedData = e.clipboardData.getData('text').replace(/[^0-9]/g, '').slice(0, 6);
                for (let i = 0; i < pastedData.length; i++) {
                    if (otpInputs[i]) {
                        otpInputs[i].value = pastedData[i];
                    }
                }
                if (pastedData.length === 6) {
                    setTimeout(() => btnVerifyResetOtp.click(), 200);
                }
            });
        });

        // Step 1: Send Reset Code
        forgotPasswordForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            const email = document.getElementById('resetEmail').value.trim().toLowerCase();

            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                showToast('Please enter a valid email address', 'error');
                return;
            }

            currentEmail = email;
            btnSendReset.disabled = true;
            btnSendReset.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px; animation: spin 1s linear infinite;"><circle cx="12" cy="12" r="10"></circle></svg>Sending...';

            try {
                await AuthAPI.sendPasswordResetOtp(email);
                showToast('Reset code sent to your email!', 'success');

                // Show OTP section
                forgotPasswordForm.style.display = 'none';
                otpSection.style.display = 'block';
                setTimeout(() => otpInputs[0].focus(), 300);

                // Start countdown
                startResendTimer();
            } catch (err) {
                showToast(err.message || 'Failed to send reset code', 'error');
                btnSendReset.disabled = false;
                btnSendReset.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>Send Reset Code';
            }
        });

        // Step 2: Verify OTP
        btnVerifyResetOtp.addEventListener('click', async function () {
            let otp = '';
            otpInputs.forEach(input => otp += input.value);

            if (otp.length !== 6) {
                resetOtpError.textContent = 'Please enter all 6 digits';
                resetOtpError.style.display = 'block';
                otpInputs.forEach(input => input.classList.add('error'));
                return;
            }

            btnVerifyResetOtp.disabled = true;
            btnVerifyResetOtp.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px; animation: spin 1s linear infinite;"><circle cx="12" cy="12" r="10"></circle></svg>Verifying...';
            resetOtpError.style.display = 'none';
            otpInputs.forEach(input => input.classList.remove('error'));

            try {
                await AuthAPI.verifyPasswordResetOtp(currentEmail, otp);
                otpVerified = true;
                showToast('✅ Code verified!', 'success');

                // Clear timer
                if (resendTimer) clearInterval(resendTimer);

                // Show new password form
                otpSection.style.display = 'none';
                newPasswordForm.style.display = 'block';
                setTimeout(() => document.getElementById('newPassword').focus(), 300);
            } catch (err) {
                resetOtpError.textContent = err.message || 'Invalid or expired code';
                resetOtpError.style.display = 'block';
                otpInputs.forEach(input => {
                    input.classList.add('error');
                    input.value = '';
                });
                otpInputs[0].focus();

                btnVerifyResetOtp.disabled = false;
                btnVerifyResetOtp.innerHTML = 'Verify Code';
            }
        });

        // Resend OTP
        btnResendResetOtp.addEventListener('click', async function () {
            if (!currentEmail || btnResendResetOtp.disabled) return;

            btnResendResetOtp.disabled = true;
            const originalText = resetResendText ? resetResendText.textContent : 'Resend';
            if (resetResendText) resetResendText.textContent = 'Sending...';

            try {
                await AuthAPI.sendPasswordResetOtp(currentEmail);
                showToast('New code sent!', 'success');
                otpInputs.forEach(input => {
                    input.value = '';
                    input.classList.remove('error');
                });
                otpInputs[0].focus();
                resetOtpError.style.display = 'none';

                // Restart countdown
                if (resendTimer) clearInterval(resendTimer);
                startResendTimer();
            } catch (err) {
                showToast(err.message || 'Failed to resend code', 'error');
                btnResendResetOtp.disabled = false;
                if (resetResendText) resetResendText.textContent = originalText;
            }
        });

        // Step 3: Reset Password
        newPasswordForm.addEventListener('submit', async function (e) {
            e.preventDefault();

            if (!otpVerified) {
                showToast('Please verify your email first', 'error');
                return;
            }

            const newPassword = document.getElementById('newPassword').value;
            const confirmPassword = document.getElementById('confirmPassword').value;

            if (newPassword.length < 6) {
                showToast('Password must be at least 6 characters', 'error');
                return;
            }

            if (newPassword !== confirmPassword) {
                showToast('Passwords do not match', 'error');
                return;
            }

            btnResetPassword.disabled = true;
            btnResetPassword.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px; animation: spin 1s linear infinite;"><circle cx="12" cy="12" r="10"></circle></svg>Resetting...';

            try {
                await AuthAPI.resetPassword(currentEmail, newPassword);
                showToast('✅ Password reset successful!', 'success');
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 2000);
            } catch (err) {
                showToast(err.message || 'Failed to reset password', 'error');
                btnResetPassword.disabled = false;
                btnResetPassword.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;"><polyline points="20 6 9 17 4 12"></polyline></svg>Reset Password';
            }
        });
    }

    function showToast(message, type) {
        if (typeof Toast !== 'undefined' && Toast[type]) {
            Toast[type](message);
        } else {
            console.log('[Toast]', type, message);
        }
    }
})();
