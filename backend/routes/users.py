"""
User Routes - User profile management
"""
import base64
import os
from flask import Blueprint, request, jsonify, current_app
from database import db
from models.user import User
from models.request import MatchHistory
from utils.auth import auth_required, get_current_user

users_bp = Blueprint('users', __name__)


@users_bp.route('/me', methods=['GET'])
@auth_required
def get_profile():
    """Get current user profile"""
    user = get_current_user()
    return jsonify({
        'user': user.to_dict(include_private=True)
    })


@users_bp.route('/me', methods=['PUT'])
@auth_required
def update_profile():
    """Update current user profile"""
    user = get_current_user()
    data = request.get_json()
    
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    # Update allowed fields
    if 'name' in data:
        user.name = data['name'].strip()
    
    if 'location' in data:
        user.location = data['location'].strip()
    
    if 'sports' in data:
        user.sports = ','.join(data['sports']) if isinstance(data['sports'], list) else data['sports']
    
    db.session.commit()
    
    return jsonify({
        'message': 'Profile updated',
        'user': user.to_dict(include_private=True)
    })


@users_bp.route('/me/picture', methods=['POST'])
@auth_required
def upload_profile_picture():
    """Upload profile picture"""
    user = get_current_user()
    
    # Handle base64 image data
    data = request.get_json()
    if data and data.get('image'):
        # Base64 encoded image
        user.profile_picture = data['image']
        db.session.commit()
        
        return jsonify({
            'message': 'Profile picture updated',
            'profilePicture': user.profile_picture
        })
    
    # Handle file upload
    if 'file' not in request.files:
        return jsonify({'error': 'No image provided'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    # Validate file extension
    allowed_ext = current_app.config.get('ALLOWED_EXTENSIONS', {'png', 'jpg', 'jpeg', 'gif'})
    ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
    
    if ext not in allowed_ext:
        return jsonify({'error': f'Invalid file type. Allowed: {", ".join(allowed_ext)}'}), 400
    
    # Read and encode as base64
    image_data = base64.b64encode(file.read()).decode('utf-8')
    mime_type = file.content_type or f'image/{ext}'
    user.profile_picture = f'data:{mime_type};base64,{image_data}'
    
    db.session.commit()
    
    return jsonify({
        'message': 'Profile picture updated',
        'profilePicture': user.profile_picture
    })


@users_bp.route('/me/history', methods=['GET'])
@auth_required
def get_match_history():
    """Get current user's match history"""
    user = get_current_user()
    
    filter_type = request.args.get('filter', 'all')  # all, attended, missed
    
    history = user.match_history.order_by(MatchHistory.created_at.desc())
    
    if filter_type == 'attended':
        history = history.filter_by(attended=True)
    elif filter_type == 'missed':
        history = history.filter_by(attended=False)
    
    return jsonify({
        'history': [h.to_dict() for h in history.all()]
    })


@users_bp.route('/<int:user_id>', methods=['GET'])
def get_user(user_id):
    """Get user by ID (public profile)"""
    user = User.query.get(user_id)
    
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    return jsonify({
        'user': user.to_dict(include_private=False)
    })


@users_bp.route('/me/stats', methods=['GET'])
@auth_required
def get_user_stats():
    """Get detailed user statistics"""
    user = get_current_user()
    
    stats = user.get_stats()
    
    # Calculate additional stats
    history = user.match_history.all()
    
    # Sports breakdown
    sports_count = {}
    for h in history:
        sport = h.match.sport if h.match else 'unknown'
        sports_count[sport] = sports_count.get(sport, 0) + 1
    
    # Attendance rate
    total = stats['matchesPlayed']
    attended = stats['matchesAttended']
    attendance_rate = (attended / total * 100) if total > 0 else 0
    
    return jsonify({
        'stats': stats,
        'creditScore': user.credit_score,
        'attendanceRate': round(attendance_rate, 1),
        'sportBreakdown': sports_count
    })
