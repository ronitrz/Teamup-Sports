"""
Authentication Routes - Register, Login, Google Sign-In, Change Password
All edge cases are covered: race-condition safe registration, timing-attack
resistant login, robust Google token verification, and change-password.
"""
from flask import Blueprint, request, jsonify, current_app
from sqlalchemy.exc import IntegrityError
from database import db
from models.user import User
from models.otp import OTP
import random
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import threading
from datetime import datetime
from utils.auth import (
    hash_password, verify_password, generate_token,
    decode_token, auth_required, get_current_user, _extract_bearer_token
)
from utils.validators import (
    validate_email, validate_phone, validate_password,
    validate_name, normalize_phone
)

auth_bp = Blueprint('auth', __name__)


# ─── Register ─────────────────────────────────────────────────────────────────

@auth_bp.route('/register', methods=['POST'])
def register():
    """Register a new user with email, phone, and password."""
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Request body must be JSON', 'code': 'NO_DATA'}), 400

    name     = str(data.get('name', '')).strip()
    email    = str(data.get('email', '')).strip().lower()
    phone    = normalize_phone(str(data.get('phone', '')))
    password = str(data.get('password', ''))

    # Verify that an OTP was completed for this email
    otp_record = OTP.query.filter_by(identifier=email, verified=True).order_by(OTP.id.desc()).first()
    if not otp_record or otp_record.is_expired:
        return jsonify({
            'error': 'Email not verified. Please verify your email with an OTP first.',
            'code': 'UNVERIFIED_EMAIL'
        }), 403

    # ── Validate inputs ──
    errors = {}

    valid, err = validate_name(name)
    if not valid:
        errors['name'] = err

    if not validate_email(email):
        errors['email'] = 'Invalid email format'

    if not validate_phone(phone):
        errors['phone'] = 'Invalid phone number (10 digits starting with 6-9)'

    valid, err = validate_password(password)
    if not valid:
        errors['password'] = err

    if errors:
        return jsonify({'error': 'Validation failed', 'errors': errors}), 400

    # ── Uniqueness checks ──
    if User.query.filter_by(email=email).first():
        return jsonify({'error': 'Email already registered', 'code': 'EMAIL_EXISTS'}), 409
    if User.query.filter_by(phone=phone).first():
        return jsonify({'error': 'Phone number already registered', 'code': 'PHONE_EXISTS'}), 409

    # ── Create user ──
    sports_list = data.get('sports', [])
    if not isinstance(sports_list, list):
        sports_list = []

    user = User(
        name=name,
        email=email,
        phone=phone,
        password_hash=hash_password(password),
        country=str(data.get('country', 'India'))[:100],
        state=str(data.get('state', ''))[:100],
        city=str(data.get('city', ''))[:100],
        sports=','.join(str(s) for s in sports_list),
        credit_score=100,
        is_email_verified=True,
        is_verified=True
    )

    try:
        db.session.add(user)
        db.session.commit()
    except IntegrityError:
        # Race-condition guard: another request registered the same email/phone
        db.session.rollback()
        return jsonify({'error': 'Email or phone already registered', 'code': 'CONFLICT'}), 409

    token = generate_token(user.id)
    return jsonify({
        'message': 'Registration successful',
        'token': token,
        'user': user.to_dict(include_private=True)
    }), 201


# ─── OTP Verification ──────────────────────────────────────────────────────────

def send_otp_email_async(app, to_email, code):
    with app.app_context():
        try:
            sender_email = app.config.get('MAIL_USERNAME')
            sender_password = app.config.get('MAIL_PASSWORD')
            smtp_server = app.config.get('MAIL_SERVER', 'smtp.gmail.com')
            smtp_port = app.config.get('MAIL_PORT', 587)

            if not sender_email or not sender_password:
                print("❌ SMTP Credentials not found. Skipping real email.")
                return

            msg = MIMEMultipart('alternative')
            msg['Subject'] = 'Your TeamUP Sports Verification Code'
            msg['From'] = f"TeamUP Sports <{sender_email}>"
            msg['To'] = to_email

            html_content = f"""
            <html>
              <body style="font-family: Arial, sans-serif; color: #333; padding: 20px;">
                <h2>Welcome to TeamUP Sports!</h2>
                <p>Your email verification code is:</p>
                <div style="font-size: 24px; font-weight: bold; padding: 10px 20px; background: #f0f0f0; border-radius: 5px; display: inline-block; letter-spacing: 5px; color: #007bff;">
                  {code}
                </div>
                <p>This code will expire in 5 minutes.</p>
                <p>If you didn't request this, you can safely ignore this email.</p>
              </body>
            </html>
            """
            msg.attach(MIMEText(html_content, 'html'))

            with smtplib.SMTP(smtp_server, smtp_port) as server:
                server.starttls()
                server.login(sender_email, sender_password)
                server.send_message(msg)
                
            print(f"✅ Real email successfully sent to {to_email} via SMTP")
        except Exception as e:
            print(f"❌ Failed to send SMTP email: {e}")

@auth_bp.route('/send-otp', methods=['POST'])
def send_otp():
    """Send a 6-digit OTP to an email address."""
    data = request.get_json(silent=True)
    email = str(data.get('email', '')).strip().lower()
    
    if not validate_email(email):
        return jsonify({'error': 'Invalid email format'}), 400
        
    if User.query.filter_by(email=email).first():
        return jsonify({'error': 'Email already registered', 'code': 'EMAIL_EXISTS'}), 409
        
    # Generate 6-digit OTP
    code = f"{random.randint(100000, 999999)}"
    
    otp = OTP(identifier=email, code=code, expires_in_minutes=5)
    db.session.add(otp)
    db.session.commit()
    
    # In a real app, send actual email here. For local deployment, just print it.
    print(f"\n==========================================")
    print(f"EMAIL SENT TO: {email}")
    print(f"VERIFICATION CODE: {code}")
    print(f"==========================================\n")
    
    # Send REAL email asynchronously using config.py credentials
    app = current_app._get_current_object()
    threading.Thread(target=send_otp_email_async, args=(app, email, code)).start()
    
    return jsonify({'message': 'OTP sent successfully'})

@auth_bp.route('/verify-otp', methods=['POST'])
def verify_otp():
    """Verify an OTP code for an email."""
    data = request.get_json(silent=True)
    email = str(data.get('email', '')).strip().lower()
    code = str(data.get('code', '')).strip()
    
    if not email or not code:
        return jsonify({'error': 'Email and code are required'}), 400
        
    otp = OTP.query.filter_by(identifier=email, code=code).order_by(OTP.id.desc()).first()
    
    if not otp:
        return jsonify({'error': 'Invalid verification code'}), 400
        
    if otp.is_expired:
        return jsonify({'error': 'Verification code has expired. Please request a new one.'}), 400
        
    otp.verified = True
    db.session.commit()
    
    return jsonify({'message': 'Email successfully verified'})


# ─── Login ────────────────────────────────────────────────────────────────────

@auth_bp.route('/login', methods=['POST'])
def login():
    """Login with email or phone + password.
    Applies constant-time response to resist timing attacks.
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Request body must be JSON', 'code': 'NO_DATA'}), 400

    identifier = str(data.get('identifier', '')).strip().lower()
    password   = str(data.get('password', ''))

    if not identifier:
        return jsonify({'error': 'Email or phone is required', 'code': 'MISSING_IDENTIFIER'}), 400
    if not password:
        return jsonify({'error': 'Password is required', 'code': 'MISSING_PASSWORD'}), 400

    # Look up by email OR phone
    user = User.query.filter(
        (User.email == identifier) | (User.phone == identifier)
    ).first()

    # Always call verify to prevent timing attacks (even for unknown user)
    _DUMMY_HASH = '$2b$12$eImiTXuWVxfM37uY4JANjOe5GuoFaGi6F2TY50i/.3Bi3DPpBzFZO'
    candidate_hash = user.password_hash if user and user.password_hash else _DUMMY_HASH
    password_ok = verify_password(password, candidate_hash)

    if not user:
        return jsonify({'error': 'Invalid credentials', 'code': 'INVALID_CREDENTIALS'}), 401

    if not user.password_hash:
        return jsonify({
            'error': 'This account uses Google Sign-In. Please log in with Google.',
            'code': 'GOOGLE_ONLY_ACCOUNT'
        }), 401

    if not password_ok:
        return jsonify({'error': 'Invalid credentials', 'code': 'INVALID_CREDENTIALS'}), 401

    token = generate_token(user.id)
    return jsonify({
        'message': 'Login successful',
        'token': token,
        'user': user.to_dict(include_private=True)
    })


# ─── Token Check ──────────────────────────────────────────────────────────────

@auth_bp.route('/check', methods=['GET'])
def check_token():
    """Lightweight token validity ping. Decodes JWT without a DB query.
    Returns 200 if valid, 401 with error code otherwise.
    """
    token = _extract_bearer_token()
    if not token:
        return jsonify({'valid': False, 'code': 'NO_TOKEN'}), 401

    user_id, error_code = decode_token(token)
    if error_code:
        message = 'Token has expired' if error_code == 'TOKEN_EXPIRED' else 'Invalid token'
        return jsonify({'valid': False, 'code': error_code, 'error': message}), 401

    return jsonify({'valid': True, 'userId': user_id})


# ─── Get Current User ─────────────────────────────────────────────────────────

@auth_bp.route('/me', methods=['GET'])
@auth_required
def get_current_user_route():
    """Return the currently authenticated user's profile."""
    user = get_current_user()
    return jsonify({'user': user.to_dict(include_private=True)})


# ─── Change Password ──────────────────────────────────────────────────────────

@auth_bp.route('/change-password', methods=['POST'])
@auth_required
def change_password():
    """Change password for an authenticated user.
    Requires the current password and a new password.
    """
    user = get_current_user()
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Request body must be JSON', 'code': 'NO_DATA'}), 400

    old_password = str(data.get('oldPassword', ''))
    new_password = str(data.get('newPassword', ''))

    if not old_password or not new_password:
        return jsonify({
            'error': 'Both oldPassword and newPassword are required',
            'code': 'MISSING_FIELDS'
        }), 400

    # Google-only accounts have no password
    if not user.password_hash:
        return jsonify({
            'error': 'Google-linked accounts cannot change password here',
            'code': 'GOOGLE_ONLY_ACCOUNT'
        }), 400

    if not verify_password(old_password, user.password_hash):
        return jsonify({'error': 'Current password is incorrect', 'code': 'WRONG_PASSWORD'}), 401

    # Validate new password strength
    valid, err = validate_password(new_password)
    if not valid:
        return jsonify({'error': err, 'code': 'WEAK_PASSWORD'}), 400

    if old_password == new_password:
        return jsonify({
            'error': 'New password must be different from the current password',
            'code': 'SAME_PASSWORD'
        }), 400

    user.password_hash = hash_password(new_password)
    db.session.commit()

    return jsonify({'message': 'Password changed successfully'})


# ─── Forgot Password ────────────────────────────────────────────────────────────

@auth_bp.route('/forgot-password-otp', methods=['POST'])
def forgot_password_otp():
    """Send an OTP specifically for resetting a password."""
    data = request.get_json(silent=True)
    if not data or not data.get('email'):
        return jsonify({'error': 'Email is required'}), 400
        
    email = str(data['email']).strip().lower()
    user = User.query.filter_by(email=email).first()
    if not user:
        # Don't reveal if user exists to prevent enumeration
        return jsonify({'message': 'If the email exists, an OTP has been sent.'})
        
    # Generate 6-digit OTP
    code = f"{random.randint(100000, 999999)}"
    
    otp_record = OTP(identifier=email, code=code, expires_in_minutes=10)
    db.session.add(otp_record)
    db.session.commit()
    
    # Send REAL email asynchronously using config.py credentials
    app = current_app._get_current_object()
    threading.Thread(target=send_otp_email_async, args=(app, email, code)).start()
    
    return jsonify({'message': 'If the email exists, an OTP has been sent.'})


@auth_bp.route('/reset-password', methods=['POST'])
def reset_password():
    """Verify OTP and update user's password."""
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Request body required'}), 400

    email = str(data.get('email', '')).strip().lower()
    code = str(data.get('code', '')).strip()
    new_password = str(data.get('newPassword', ''))
    
    if not email or not code or not new_password:
        return jsonify({'error': 'Email, code, and new password are required'}), 400
        
    # Validate new password strength
    valid, err = validate_password(new_password)
    if not valid:
        return jsonify({'error': err, 'code': 'WEAK_PASSWORD'}), 400
        
    otp = OTP.query.filter_by(identifier=email, code=code).order_by(OTP.id.desc()).first()
    if not otp:
        return jsonify({'error': 'Invalid verification code'}), 400
        
    if otp.is_expired:
        return jsonify({'error': 'Verification code has expired. Please request a new one.'}), 400
        
    user = User.query.filter_by(email=email).first()
    if not user:
        return jsonify({'error': 'User not found'}), 404
        
    user.password_hash = hash_password(new_password)
    otp.verified = True
    db.session.commit()
    
    return jsonify({'message': 'Password reset successfully. You can now login.'})


# ─── Google Sign-In ───────────────────────────────────────────────────────────

@auth_bp.route('/google', methods=['POST'])
def google_signin():
    """Authenticate via Google ID token (One Tap / Sign-In With Google)."""
    data = request.get_json(silent=True)
    if not data or not data.get('credential'):
        return jsonify({'error': 'Google credential required', 'code': 'NO_CREDENTIAL'}), 400

    credential = data['credential']
    if not isinstance(credential, str) or len(credential) > 5000:
        return jsonify({'error': 'Invalid Google credential format', 'code': 'INVALID_CREDENTIAL'}), 400

    try:
        from google.oauth2 import id_token
        from google.auth.transport import requests as google_requests

        client_id = current_app.config.get('GOOGLE_CLIENT_ID')
        idinfo = id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            client_id
        )

        google_id = idinfo.get('sub')
        email     = idinfo.get('email', '').strip().lower()
        name      = idinfo.get('name', '').strip()
        picture   = idinfo.get('picture', '')

        if not google_id:
            return jsonify({'error': 'Google token missing user ID', 'code': 'INVALID_TOKEN'}), 401
        if not email:
            return jsonify({'error': 'Google account has no email address', 'code': 'NO_EMAIL'}), 400

    except ValueError as e:
        return jsonify({'error': f'Invalid Google token: {str(e)}', 'code': 'INVALID_TOKEN'}), 401
    except Exception as e:
        return jsonify({'error': f'Google authentication failed: {str(e)}', 'code': 'GOOGLE_ERROR'}), 500

    # Find by Google ID first, then by email (account linking)
    user = User.query.filter_by(google_id=google_id).first()

    if not user:
        user = User.query.filter_by(email=email).first()
        if user:
            # Link Google ID to existing email account
            user.google_id = google_id
            if picture and not user.profile_picture:
                user.profile_picture = picture
            # Ensure email is marked as verified
            if not user.is_email_verified:
                user.is_email_verified = True
        else:
            # Brand-new user via Google
            user = User(
                name=name or email.split('@')[0],
                email=email,
                google_id=google_id,
                profile_picture=picture,
                is_verified=True,
                is_email_verified=True,
                credit_score=75  # Slightly lower starting score for new Google users
            )
            db.session.add(user)

    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({'error': 'Account conflict. Please try again.', 'code': 'CONFLICT'}), 409

    token = generate_token(user.id)
    return jsonify({
        'message': 'Google sign-in successful',
        'token': token,
        'user': user.to_dict(include_private=True)
    })
