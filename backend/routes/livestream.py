"""
Live Stream Routes
"""
from flask import Blueprint, request, jsonify
from database import db
from models.livestream import LiveStream
from models.match import Match
from models.user import User
from utils.auth import decode_token
import secrets
from datetime import datetime

livestream_bp = Blueprint('livestream', __name__)

def get_current_user_id():
    """Extract user ID from Authorization header"""
    auth_header = request.headers.get('Authorization')
    if not auth_header:
        return None
    
    parts = auth_header.split()
    if len(parts) != 2 or parts[0].lower() != 'bearer':
        return None
    
    return decode_token(parts[1])


@livestream_bp.route('/start', methods=['POST'])
def start_stream():
    """Start a live stream for a match"""
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Authentication required'}), 401
    
    data = request.get_json()
    match_id = data.get('match_id')
    camera_label = data.get('camera_label', 'Camera 1')
    
    if not match_id:
        return jsonify({'error': 'Match ID required'}), 400
    
    # Verify match exists
    match = Match.query.get(match_id)
    if not match:
        return jsonify({'error': 'Match not found'}), 404
    
    # Check if user is part of the match (captain or joined player)
    user = User.query.get(user_id)
    if match.captain_id != user_id:
        # Check if user has joined the match
        from models.request import JoinRequest
        join_request = JoinRequest.query.filter_by(
            match_id=match_id,
            user_id=user_id,
            status='approved'
        ).first()
        
        if not join_request:
            return jsonify({'error': 'Only match participants can start a live stream'}), 403
    
    # Generate unique stream key
    stream_key = secrets.token_urlsafe(32)
    
    # Create live stream
    livestream = LiveStream(
        match_id=match_id,
        broadcaster_id=user_id,
        stream_key=stream_key,
        camera_label=camera_label,
        is_active=True
    )
    
    db.session.add(livestream)
    db.session.commit()
    
    print(f"\n🎥 Live stream started: {camera_label} for match {match_id} by user {user_id}\n")
    
    return jsonify({
        'message': 'Live stream started',
        'stream': livestream.to_dict()
    }), 201


@livestream_bp.route('/stop/<int:stream_id>', methods=['POST'])
def stop_stream(stream_id):
    """Stop a live stream"""
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Authentication required'}), 401
    
    livestream = LiveStream.query.get(stream_id)
    if not livestream:
        return jsonify({'error': 'Stream not found'}), 404
    
    # Only broadcaster can stop their stream
    if livestream.broadcaster_id != user_id:
        return jsonify({'error': 'Only the broadcaster can stop this stream'}), 403
    
    livestream.is_active = False
    livestream.ended_at = datetime.utcnow()
    db.session.commit()
    
    print(f"\n🛑 Live stream stopped: {stream_id}\n")
    
    return jsonify({'message': 'Live stream stopped'})


@livestream_bp.route('/match/<int:match_id>', methods=['GET'])
def get_match_streams(match_id):
    """Get all active streams for a match"""
    streams = LiveStream.query.filter_by(
        match_id=match_id,
        is_active=True
    ).all()
    
    return jsonify({
        'streams': [s.to_dict() for s in streams]
    })


@livestream_bp.route('/active', methods=['GET'])
def get_active_streams():
    """Get all active live streams with optional city filter"""
    city = request.args.get('city')
    
    query = db.session.query(LiveStream).join(Match).filter(
        LiveStream.is_active == True
    )
    
    if city:
        query = query.filter(Match.city.ilike(f'%{city}%'))
    
    streams = query.all()
    
    result = []
    for stream in streams:
        stream_dict = stream.to_dict()
        stream_dict['match'] = {
            'id': stream.match.id,
            'title': stream.match.title,
            'sport': stream.match.sport,
            'city': stream.match.city,
            'location_name': stream.match.venue_name,
            'date_time': stream.match.date_time.isoformat() + 'Z' if stream.match.date_time else None
        }
        result.append(stream_dict)
    
    return jsonify({'streams': result})


@livestream_bp.route('/cities', methods=['GET'])
def get_streaming_cities():
    """Get list of cities with active streams"""
    cities = db.session.query(Match.city).join(LiveStream).filter(
        LiveStream.is_active == True,
        Match.city.isnot(None)
    ).distinct().all()
    
    return jsonify({
        'cities': [c[0] for c in cities if c[0]]
    })


@livestream_bp.route('/<int:stream_id>/viewers', methods=['POST'])
def update_viewer_count(stream_id):
    """Update viewer count for a stream"""
    data = request.get_json()
    action = data.get('action')  # 'join' or 'leave'
    
    livestream = LiveStream.query.get(stream_id)
    if not livestream:
        return jsonify({'error': 'Stream not found'}), 404
    
    if action == 'join':
        livestream.viewer_count += 1
    elif action == 'leave':
        livestream.viewer_count = max(0, livestream.viewer_count - 1)
    
    db.session.commit()
    
    return jsonify({
        'viewer_count': livestream.viewer_count
    })
