"""
Authentication Utilities - JWT and password handling
Covers differentiated error codes, optional auth, and helper decorators.
"""
import jwt
import bcrypt
from datetime import datetime, timedelta, timezone
from functools import wraps
from flask import request, jsonify, current_app


# ─── Password Helpers ─────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    """Hash a password using bcrypt with cost factor 12."""
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a plain password against a bcrypt hash.
    Safe against timing attacks via bcrypt's constant-time comparison.
    """
    try:
        return bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8'))
    except Exception:
        return False


# ─── JWT Helpers ──────────────────────────────────────────────────────────────

def generate_token(user_id: int, expires_hours: int = 24) -> str:
    """Generate a signed JWT token for a user."""
    now = datetime.now(timezone.utc)
    payload = {
        'user_id': user_id,
        'iat': now,
        'exp': now + timedelta(hours=expires_hours),
    }
    return jwt.encode(
        payload,
        current_app.config['JWT_SECRET_KEY'],
        algorithm='HS256'
    )


def decode_token(token: str):
    """Decode a JWT token.
    Returns (user_id, error_code):
        - (int, None)  on success
        - (None, 'TOKEN_EXPIRED')   if expired
        - (None, 'INVALID_TOKEN')   for any other invalid token
    """
    try:
        payload = jwt.decode(
            token,
            current_app.config['JWT_SECRET_KEY'],
            algorithms=['HS256']
        )
        user_id = payload.get('user_id')
        if not user_id:
            return None, 'INVALID_TOKEN'
        return user_id, None
    except jwt.ExpiredSignatureError:
        return None, 'TOKEN_EXPIRED'
    except jwt.InvalidTokenError:
        return None, 'INVALID_TOKEN'


def _extract_bearer_token() -> str | None:
    """Extract the Bearer token from the Authorization header.
    Returns the raw token string, or None if absent / malformed.
    """
    auth_header = request.headers.get('Authorization', '')
    if not auth_header:
        return None
    parts = auth_header.split()
    if len(parts) != 2 or parts[0].lower() != 'bearer':
        return None
    return parts[1]


# ─── Decorators ───────────────────────────────────────────────────────────────

def auth_required(f):
    """Decorator: require a valid JWT. Attaches user to request.current_user.
    Returns 401 with a machine-readable 'code' field on failure.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        token = _extract_bearer_token()

        if not token:
            return jsonify({
                'error': 'Authentication required',
                'code': 'NO_TOKEN'
            }), 401

        user_id, error_code = decode_token(token)
        if error_code:
            message = 'Token has expired' if error_code == 'TOKEN_EXPIRED' else 'Invalid token'
            return jsonify({'error': message, 'code': error_code}), 401

        from models.user import User
        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'User account not found', 'code': 'USER_NOT_FOUND'}), 401

        request.current_user = user
        return f(*args, **kwargs)

    return decorated


def optional_auth(f):
    """Decorator: attempt to load user from JWT but do NOT fail if missing/invalid.
    Sets request.current_user to None for guests.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        request.current_user = None
        token = _extract_bearer_token()
        if token:
            user_id, error_code = decode_token(token)
            if not error_code and user_id:
                from models.user import User
                user = User.query.get(user_id)
                if user:
                    request.current_user = user
        return f(*args, **kwargs)

    return decorated


def get_current_user():
    """Get the currently authenticated user from the request context.
    Returns None if no user is set (e.g., optional_auth was used for a guest).
    """
    return getattr(request, 'current_user', None)
