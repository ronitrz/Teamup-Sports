"""
Authentication Routes - Register, Login, Google Sign-In
Traditional email/password authentication (no OTP)
"""
from flask import Blueprint, request, jsonify, current_app
from database import db
from models.user import User, OTP
from utils.auth import hash_password, verify_password, generate_token
from utils.validators import validate_email, validate_phone, validate_password, validate_name
from utils.email_service import send_otp_email
import random
from datetime import datetime, timedelta

auth_bp = Blueprint('auth', __name__)

# OTP persistence is now managed by the OTP database model

@auth_bp.route('/send-otp', methods=['POST'])
def send_otp():
    """Send OTP to email"""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    email = data.get('email', '').strip().lower()
    
    if not validate_email(email):
        return jsonify({'error': 'Invalid email format'}), 400
        
    if User.query.filter_by(email=email).first():
        return jsonify({'error': 'Email already registered'}), 409
        
    # Create OTP record in database
    otp_record = OTP(
        email=email,
        otp=str(random.randint(100000, 999999)),
        purpose='register',
        expires_at=datetime.utcnow() + timedelta(minutes=5)
    )
    db.session.add(otp_record)
    db.session.commit()
    
    otp = otp_record.otp
    
    # Print the OTP to the console for easy debugging/testing
    print(f"\n{'='*60}")
    print(f"🔐 OTP VERIFICATION CODE")
    print(f"{'='*60}")
    print(f"Email: {email}")
    print(f"OTP Code: {otp}")
    print(f"Expires: {(datetime.utcnow() + timedelta(minutes=5)).strftime('%H:%M:%S')}")
    print(f"{'='*60}\n")
    
    # Try to send email
    success, message = send_otp_email(email, otp, purpose='register')
    
    if success:
        return jsonify({
            'message': 'OTP sent successfully to your email',
            'note': 'Check your email inbox and spam folder'
        })
    else:
        print(f"❌ Email sending failed: {message}")
        return jsonify({
            'error': f'Failed to send verification email: {message}. Please check if the email address is correct or try again later.',
            'details': 'Self-help: Ensure the email is valid and your server has SMTP configured.'
        }), 500


@auth_bp.route('/verify-otp', methods=['POST'])
def verify_otp():
    """Verify OTP"""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
        
    email = data.get('email', '').strip().lower()
    otp = data.get('otp', '').strip()
    
    otp_record = OTP.query.filter_by(email=email, purpose='register').order_by(OTP.created_at.desc()).first()
    
    if not otp_record:
        return jsonify({'error': 'No OTP requested for this email'}), 400
        
    if otp_record.is_expired():
        return jsonify({'error': 'OTP expired'}), 400
        
    if otp_record.otp != otp:
        return jsonify({'error': 'Invalid OTP'}), 400
        
    # Mark as verified
    otp_record.is_verified = True
    db.session.commit()
    return jsonify({'message': 'Email verified successfully'})


@auth_bp.route('/register', methods=['POST'])
def register():
    """Register a new user"""
    data = request.get_json()
    
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    name = data.get('name', '').strip()
    email = data.get('email', '').strip().lower()
    phone = data.get('phone', '').strip()
    password = data.get('password', '')
    
    valid, error = validate_name(name)
    if not valid:
        return jsonify({'error': error}), 400
    
    if not validate_email(email):
        return jsonify({'error': 'Invalid email format'}), 400
    
    if not validate_phone(phone):
        return jsonify({'error': 'Invalid phone number (10 digits starting with 6-9)'}), 400
    
    valid, error = validate_password(password)
    if not valid:
        return jsonify({'error': error}), 400
    
    if User.query.filter_by(email=email).first():
        return jsonify({'error': 'Email already registered'}), 409
    
    if User.query.filter_by(phone=phone).first():
        return jsonify({'error': 'Phone number already registered'}), 409
        
    otp_record = OTP.query.filter_by(email=email, purpose='register', is_verified=True).order_by(OTP.created_at.desc()).first()
    if not otp_record:
        return jsonify({'error': 'Email must be verified first'}), 400
    
    user = User(
        name=name,
        email=email,
        phone=phone,
        password_hash=hash_password(password),
        country=data.get('country', 'India'),
        state=data.get('state', ''),
        city=data.get('city', ''),
        sports=','.join(data.get('sports', [])),
        credit_score=100,
        is_email_verified=True,
        is_verified=True
    )
    
    db.session.add(user)
    db.session.commit()
    
    token = generate_token(user.id)
    
    return jsonify({
        'message': 'Registration successful',
        'token': token,
        'user': user.to_dict(include_private=True)
    }), 201


@auth_bp.route('/login', methods=['POST'])
def login():
    """Login with email/phone and password"""
    data = request.get_json()
    
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    identifier = data.get('identifier', '').strip().lower()
    password = data.get('password', '')
    
    print(f"\n{'='*60}")
    print(f"🔐 LOGIN ATTEMPT")
    print(f"{'='*60}")
    print(f"Identifier: {identifier}")
    print(f"Password provided: {'Yes' if password else 'No'}")
    print(f"{'='*60}\n")
    
    if not identifier or not password:
        print(f"❌ Login failed: Missing identifier or password\n")
        return jsonify({'error': 'Email/phone and password required'}), 400
    
    user = User.query.filter(
        (User.email == identifier) | (User.phone == identifier)
    ).first()
    
    if not user:
        print(f"❌ Login failed: No user found with identifier '{identifier}'\n")
        return jsonify({'error': 'Invalid credentials'}), 401
    
    print(f"✓ User found: {user.email}")
    print(f"  Has password hash: {bool(user.password_hash)}")
    
    if not user.password_hash:
        print(f"❌ Login failed: Account uses Google Sign-In\n")
        return jsonify({'error': 'This account uses Google Sign-In. Please sign in with Google.'}), 401
    
    if not verify_password(password, user.password_hash):
        print(f"❌ Login failed: Invalid password\n")
        return jsonify({'error': 'Invalid credentials'}), 401
    
    token = generate_token(user.id)
    
    print(f"✅ Login successful for: {user.email}\n")
    
    return jsonify({
        'message': 'Login successful',
        'token': token,
        'user': user.to_dict(include_private=True)
    })


# ─── Auth Info ───

@auth_bp.route('/me', methods=['GET'])
def get_current_user():
    """Get current user from token"""
    auth_header = request.headers.get('Authorization')
    if not auth_header:
        return jsonify({'error': 'No token provided'}), 401
    
    parts = auth_header.split()
    if len(parts) != 2 or parts[0].lower() != 'bearer':
        return jsonify({'error': 'Invalid token format'}), 401
    
    from utils.auth import decode_token
    user_id = decode_token(parts[1])
    
    if not user_id:
        return jsonify({'error': 'Invalid token'}), 401
    
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    return jsonify({
        'user': user.to_dict(include_private=True)
    })


# ─── Google Sign-In ───

@auth_bp.route('/google', methods=['POST'])
def google_signin():
    """Authenticate via Google Sign-In"""
    data = request.get_json()
    
    if not data or not data.get('credential'):
        return jsonify({'error': 'Google credential required'}), 400
    
    credential = data['credential']
    
    try:
        from google.oauth2 import id_token
        from google.auth.transport import requests as google_requests
        
        client_id = current_app.config.get('GOOGLE_CLIENT_ID')
        idinfo = id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            client_id
        )
        
        google_id = idinfo['sub']
        email = idinfo.get('email', '')
        name = idinfo.get('name', '')
        picture = idinfo.get('picture', '')
        
        if not email:
            return jsonify({'error': 'Google account has no email'}), 400
        
    except ValueError as e:
        return jsonify({'error': f'Invalid Google token: {str(e)}'}), 401
    except Exception as e:
        return jsonify({'error': f'Google authentication failed: {str(e)}'}), 500
    
    user = User.query.filter_by(google_id=google_id).first()
    
    if not user:
        user = User.query.filter_by(email=email).first()
        if user:
            user.google_id = google_id
            if picture and not user.profile_picture:
                user.profile_picture = picture
        else:
            user = User(
                name=name,
                email=email,
                google_id=google_id,
                profile_picture=picture,
                is_verified=True,
                is_email_verified=True,
                credit_score=75
            )
            db.session.add(user)
    
    db.session.commit()
    
    token = generate_token(user.id)
    
    return jsonify({
        'message': 'Google sign-in successful',
        'token': token,
        'user': user.to_dict(include_private=True)
    })


# ─── Forgot Password Flow ───

@auth_bp.route('/forgot-password', methods=['POST'])
def forgot_password():
    """Send password reset OTP to email"""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    email = data.get('email', '').strip().lower()
    
    if not validate_email(email):
        return jsonify({'error': 'Invalid email format'}), 400
    
    # Check if user exists
    user = User.query.filter_by(email=email).first()
    if not user:
        return jsonify({'error': 'No account found with this email'}), 404
    
    if user.google_id and not user.password_hash:
        return jsonify({'error': 'This account uses Google Sign-In. Please sign in with Google.'}), 400
    
    # Create Reset OTP record in database
    otp_record = OTP(
        email=email,
        otp=str(random.randint(100000, 999999)),
        purpose='reset',
        expires_at=datetime.utcnow() + timedelta(minutes=5)
    )
    db.session.add(otp_record)
    db.session.commit()
    
    otp = otp_record.otp
    
    # Print OTP to console
    print(f"\n{'='*60}")
    print(f"🔐 PASSWORD RESET OTP")
    print(f"{'='*60}")
    print(f"Email: {email}")
    print(f"OTP Code: {otp}")
    print(f"Expires: {(datetime.utcnow() + timedelta(minutes=5)).strftime('%H:%M:%S')}")
    print(f"{'='*60}\n")
    
    # Send email
    success, message = send_otp_email(email, otp, purpose='reset')
    
    if success:
        return jsonify({
            'message': 'Password reset code sent to your email',
            'note': 'Check your email inbox and spam folder'
        })
    else:
        print(f"❌ Email sending failed: {message}")
        return jsonify({
            'error': f'Failed to send password reset email: {message}. Please try again later.'
        }), 500


@auth_bp.route('/verify-reset-otp', methods=['POST'])
def verify_reset_otp():
    """Verify password reset OTP"""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    email = data.get('email', '').strip().lower()
    otp = data.get('otp', '').strip()
    
    otp_record = OTP.query.filter_by(email=email, purpose='reset').order_by(OTP.created_at.desc()).first()
    
    if not otp_record:
        return jsonify({'error': 'No reset request found for this email'}), 400
    
    if otp_record.is_expired():
        db.session.delete(otp_record)
        db.session.commit()
        return jsonify({'error': 'OTP expired. Please request a new one'}), 400
    
    if otp_record.otp != otp:
        return jsonify({'error': 'Invalid OTP'}), 400
    
    # Mark as verified
    otp_record.is_verified = True
    db.session.commit()
    return jsonify({'message': 'OTP verified successfully'})


@auth_bp.route('/reset-password', methods=['POST'])
def reset_password():
    """Reset password after OTP verification"""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    email = data.get('email', '').strip().lower()
    new_password = data.get('password', '')
    
    otp_record = OTP.query.filter_by(email=email, purpose='reset', is_verified=True).order_by(OTP.created_at.desc()).first()
    
    if not otp_record:
        return jsonify({'error': 'No reset request found or OTP not verified. Please start over'}), 400
    
    if otp_record.is_expired():
        db.session.delete(otp_record)
        db.session.commit()
        return jsonify({'error': 'Reset session expired. Please start over'}), 400
    
    # Validate password
    valid, error = validate_password(new_password)
    if not valid:
        return jsonify({'error': error}), 400
    
    # Find user and update password
    user = User.query.filter_by(email=email).first()
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    user.password_hash = hash_password(new_password)
    db.session.commit()
    
    # Clear reset data
    db.session.delete(otp_record)
    db.session.commit()
    
    print(f"\n✅ Password reset successful for: {email}\n")
    
    return jsonify({'message': 'Password reset successful. You can now login with your new password'})
