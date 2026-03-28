"""
User Routes - User profile management
Covers all edge cases: image MIME validation, pagination, sports whitelist,
safe stat computation, and dedicated endpoints.
"""
import base64
import re
from flask import Blueprint, request, jsonify, current_app
from database import db
from models.user import User
from models.request import MatchHistory
from utils.auth import auth_required, get_current_user
from utils.validators import validate_name, ALLOWED_SPORTS, validate_profile_update

users_bp = Blueprint('users', __name__)

# Supported MIME types for profile pictures
ALLOWED_IMAGE_MIME = {'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'}


# ─── Helper ───────────────────────────────────────────────────────────────────

def _validate_base64_image(img_data: str):
    """Validate a base64 image string.
    Returns (is_valid, error_message_or_None, mime_type_or_None).
    """
    if not isinstance(img_data, str):
        return False, 'Image must be a string', None

    # Accept both raw base64 and data URIs (data:image/png;base64,...)
    if img_data.startswith('data:'):
        match = re.match(r'^data:(image/[a-zA-Z+]+);base64,(.+)$', img_data)
        if not match:
            return False, 'Invalid data URI format for image', None
        mime_type = match.group(1).lower()
        b64_payload = match.group(2)
    else:
        mime_type = None
        b64_payload = img_data

    if mime_type and mime_type not in ALLOWED_IMAGE_MIME:
        return False, f'Unsupported image type: {mime_type}. Allowed: jpeg, png, gif, webp', None

    # Guard against oversized payloads (base64 is ~4/3 of binary size)
    max_b64_len = int(2 * 1024 * 1024 * (4 / 3)) + 1024  # ~2 MB of binary
    if len(b64_payload) > max_b64_len:
        return False, 'Image too large. Maximum is 2 MB', None

    # Validate that it's actually valid base64
    try:
        base64.b64decode(b64_payload, validate=True)
    except Exception:
        return False, 'Image data is not valid base64', None

    return True, None, mime_type


# ─── My Profile ───────────────────────────────────────────────────────────────

@users_bp.route('/me', methods=['GET'])
@auth_required
def get_profile():
    """Get the currently authenticated user's full profile."""
    user = get_current_user()
    return jsonify({'user': user.to_dict(include_private=True)})


@users_bp.route('/me', methods=['PUT'])
@auth_required
def update_profile():
    """Update the current user's profile (name, sports, location, etc)."""
    user = get_current_user()
    data = request.get_json(silent=True)

    if not data:
        return jsonify({'error': 'Request body must be JSON', 'code': 'NO_DATA'}), 400

    # Guard against injecting protected fields
    FORBIDDEN_FIELDS = {'id', 'email', 'password_hash', 'google_id', 'credit_score',
                        'is_verified', 'is_email_verified', 'is_phone_verified', 'joined_date'}
    for field in FORBIDDEN_FIELDS:
        if field in data:
            return jsonify({
                'error': f"Field '{field}' cannot be updated via this endpoint",
                'code': 'FORBIDDEN_FIELD'
            }), 403

    # Validate submitted fields
    valid, errors = validate_profile_update(data)
    if not valid:
        return jsonify({'error': 'Validation failed', 'errors': errors}), 400

    # Apply allowed updates
    if 'name' in data:
        user.name = data['name'].strip()

    if 'country' in data and isinstance(data['country'], str):
        user.country = data['country'].strip()[:100]

    if 'state' in data and isinstance(data['state'], str):
        user.state = data['state'].strip()[:100]

    if 'city' in data and isinstance(data['city'], str):
        user.city = data['city'].strip()[:100]

    if 'sports' in data:
        sports = data['sports']
        if isinstance(sports, list):
            # Only keep valid, whitelisted sports
            clean = [s.strip().lower() for s in sports if isinstance(s, str) and s.strip().lower() in ALLOWED_SPORTS]
            user.sports = ','.join(clean)
        elif isinstance(sports, str):
            # Handle comma-separated string input
            clean = [s.strip().lower() for s in sports.split(',') if s.strip().lower() in ALLOWED_SPORTS]
            user.sports = ','.join(clean)

    db.session.commit()

    return jsonify({
        'message': 'Profile updated successfully',
        'user': user.to_dict(include_private=True)
    })


# ─── Sports ───────────────────────────────────────────────────────────────────

@users_bp.route('/me/sports', methods=['PUT'])
@auth_required
def update_sports():
    """Dedicated endpoint to update a user's sports preferences.
    Validates each sport against the whitelist.
    """
    user = get_current_user()
    data = request.get_json(silent=True)

    if not data or 'sports' not in data:
        return jsonify({'error': "'sports' field is required", 'code': 'MISSING_SPORTS'}), 400

    sports_raw = data['sports']
    if not isinstance(sports_raw, list):
        return jsonify({'error': "'sports' must be an array", 'code': 'INVALID_TYPE'}), 400

    invalid = [s for s in sports_raw if not isinstance(s, str) or s.strip().lower() not in ALLOWED_SPORTS]
    if invalid:
        return jsonify({
            'error': f"Invalid sport(s): {invalid}. Allowed: {sorted(ALLOWED_SPORTS)}",
            'code': 'INVALID_SPORT'
        }), 400

    clean = [s.strip().lower() for s in sports_raw]
    user.sports = ','.join(dict.fromkeys(clean))  # Deduplicate, preserve order
    db.session.commit()

    return jsonify({
        'message': 'Sports updated',
        'sports': user.sports.split(',') if user.sports else []
    })


# ─── Profile Picture ──────────────────────────────────────────────────────────

@users_bp.route('/me/picture', methods=['POST'])
@auth_required
def upload_profile_picture():
    """Upload or update a profile picture.
    Accepts either a base64 data URI in JSON body, or a multipart file upload.
    """
    user = get_current_user()

    # ── JSON / base64 upload ──
    data = request.get_json(silent=True)
    if data and 'image' in data:
        img_data = data['image']

        is_valid, err, mime_type = _validate_base64_image(img_data)
        if not is_valid:
            return jsonify({'error': err, 'code': 'INVALID_IMAGE'}), 400

        # Store as-is (data URI) so the frontend can use it directly in <img src>
        user.profile_picture = img_data
        db.session.commit()
        return jsonify({
            'message': 'Profile picture updated',
            'profilePicture': user.profile_picture
        })

    # ── Multipart file upload ──
    if 'file' in request.files:
        file = request.files['file']
        if not file or file.filename == '':
            return jsonify({'error': 'No file selected', 'code': 'NO_FILE'}), 400

        allowed_ext = current_app.config.get('ALLOWED_EXTENSIONS', {'png', 'jpg', 'jpeg', 'gif', 'webp'})
        if '.' not in file.filename:
            return jsonify({'error': 'File has no extension', 'code': 'NO_EXTENSION'}), 400

        ext = file.filename.rsplit('.', 1)[-1].lower()
        if ext not in allowed_ext:
            return jsonify({
                'error': f'Invalid file type. Allowed: {", ".join(sorted(allowed_ext))}',
                'code': 'INVALID_FILE_TYPE'
            }), 400

        # Read and size-check
        file_bytes = file.read(2 * 1024 * 1024 + 1)  # Read at most 2MB + 1 byte
        if len(file_bytes) > 2 * 1024 * 1024:
            return jsonify({'error': 'Image too large. Maximum is 2 MB', 'code': 'FILE_TOO_LARGE'}), 413

        mime_type = file.content_type or f'image/{ext}'
        if mime_type not in ALLOWED_IMAGE_MIME:
            return jsonify({'error': f'Unsupported MIME type: {mime_type}', 'code': 'INVALID_MIME'}), 400

        encoded = base64.b64encode(file_bytes).decode('utf-8')
        user.profile_picture = f'data:{mime_type};base64,{encoded}'
        db.session.commit()

        return jsonify({
            'message': 'Profile picture updated',
            'profilePicture': user.profile_picture
        })

    return jsonify({'error': 'No image provided', 'code': 'NO_IMAGE'}), 400


@users_bp.route('/me/picture', methods=['DELETE'])
@auth_required
def delete_profile_picture():
    """Remove the user's profile picture, resetting it to null."""
    user = get_current_user()
    user.profile_picture = None
    db.session.commit()
    return jsonify({'message': 'Profile picture removed'})


# ─── Match History ────────────────────────────────────────────────────────────

@users_bp.route('/me/history', methods=['GET'])
@auth_required
def get_match_history():
    """Get the current user's match history with filtering and pagination."""
    user = get_current_user()

    filter_type = request.args.get('filter', 'all')
    if filter_type not in ('all', 'attended', 'missed'):
        return jsonify({'error': "filter must be 'all', 'attended', or 'missed'", 'code': 'INVALID_FILTER'}), 400

    # Pagination
    try:
        page     = max(1, int(request.args.get('page', 1)))
        per_page = min(50, max(1, int(request.args.get('per_page', 20))))
    except (TypeError, ValueError):
        return jsonify({'error': 'page and per_page must be integers', 'code': 'INVALID_PAGINATION'}), 400

    query = user.match_history.order_by(MatchHistory.created_at.desc())

    if filter_type == 'attended':
        query = query.filter_by(attended=True)
    elif filter_type == 'missed':
        query = query.filter_by(attended=False)

    total   = query.count()
    records = query.offset((page - 1) * per_page).limit(per_page).all()

    # Safely convert — guard against deleted matches
    history = []
    for h in records:
        try:
            history.append(h.to_dict())
        except Exception:
            pass  # Skip entries with orphaned/deleted match references

    return jsonify({
        'history': history,
        'meta': {
            'total': total,
            'page': page,
            'perPage': per_page,
            'pages': (total + per_page - 1) // per_page if per_page else 1
        }
    })


# ─── Stats ────────────────────────────────────────────────────────────────────

@users_bp.route('/me/stats', methods=['GET'])
@auth_required
def get_user_stats():
    """Get detailed statistics for the current user."""
    user = get_current_user()

    history = user.match_history.all()
    stats   = user.get_stats()

    total    = stats['matchesPlayed']
    attended = stats['matchesAttended']
    attendance_rate = round((attended / total * 100), 1) if total > 0 else 0.0

    # Sports breakdown — guard against deleted match references
    sports_count = {}
    for h in history:
        try:
            sport = h.match.sport if h.match else 'unknown'
        except Exception:
            sport = 'unknown'
        sports_count[sport] = sports_count.get(sport, 0) + 1

    return jsonify({
        'stats': stats,
        'creditScore': user.credit_score,
        'attendanceRate': attendance_rate,
        'sportBreakdown': sports_count
    })


# ─── Public Profile ───────────────────────────────────────────────────────────

@users_bp.route('/<int:user_id>', methods=['GET'])
def get_user(user_id):
    """Get a user's public profile by ID."""
    if user_id <= 0:
        return jsonify({'error': 'Invalid user ID', 'code': 'INVALID_ID'}), 400

    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found', 'code': 'NOT_FOUND'}), 404

    return jsonify({'user': user.to_dict(include_private=False)})


@users_bp.route('/<int:user_id>/matches', methods=['GET'])
def get_user_matches(user_id):
    """Get open matches created by a specific user (for public profile view)."""
    if user_id <= 0:
        return jsonify({'error': 'Invalid user ID', 'code': 'INVALID_ID'}), 400

    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found', 'code': 'NOT_FOUND'}), 404

    from models.match import Match
    matches = Match.query.filter_by(captain_id=user_id).filter(
        Match.status.in_(['open', 'full', 'live'])
    ).order_by(Match.date_time.asc()).limit(20).all()

    return jsonify({
        'matches': [m.to_dict() for m in matches]
    })
