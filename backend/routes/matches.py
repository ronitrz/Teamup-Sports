"""
Match Routes - Match CRUD and listing
"""
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
from database import db
from models.match import Match
from models.user import User
from models.request import JoinRequest, MatchHistory
from utils.auth import auth_required, get_current_user
from utils.validators import validate_match_data
from sqlalchemy import or_, and_
from datetime import timedelta

def check_time_overlap(user_id, target_time):
    """Check if the user has any matching commitments within ±2 hours of target_time"""
    # Normalise to naive UTC so comparison with DB naive-UTC datetimes works correctly
    if target_time.tzinfo is not None:
        target_time = target_time.astimezone(timezone.utc).replace(tzinfo=None)
    time_window_start = target_time - timedelta(hours=2)
    time_window_end = target_time + timedelta(hours=2)
    
    # Check 1: Matches they are captain of
    overlapping_captain = Match.query.filter(
        Match.captain_id == user_id,
        Match.status != 'cancelled',
        Match.status != 'completed',
        Match.date_time >= time_window_start,
        Match.date_time <= time_window_end
    ).first()
    
    if overlapping_captain:
        return True, "You are already organizing a match during this time."
        
    # Check 2: Matches they have joined or requested to join
    # Get all their active join requests
    active_requests = JoinRequest.query.filter(
        JoinRequest.user_id == user_id,
        JoinRequest.status.in_(['pending', 'approved'])
    ).all()
    
    # Check if any of those joined matches overlap
    match_ids = [req.match_id for req in active_requests]
    if match_ids:
        overlapping_joined = Match.query.filter(
            Match.id.in_(match_ids),
            Match.status != 'cancelled',
            Match.status != 'completed',
            Match.date_time >= time_window_start,
            Match.date_time <= time_window_end
        ).first()
        
        if overlapping_joined:
            return True, "You are already playing in or requested to join a match during this time."
            
    return False, None

matches_bp = Blueprint('matches', __name__)


@matches_bp.route('', methods=['GET'])
def list_matches():
    """List all matches with filters"""
    # Query parameters
    sport = request.args.get('sport', '')
    status = request.args.get('status', 'all')
    search = request.args.get('search', '')
    sort_by = request.args.get('sortBy', 'date')
    limit = request.args.get('limit', 50, type=int)
    
    # Location filter
    user_lat = request.args.get('lat', type=float)
    user_lng = request.args.get('lng', type=float)
    radius_km = request.args.get('radius', 4, type=float)
    
    # Base query
    query = Match.query
    
    # Apply filters
    if sport:
        query = query.filter_by(sport=sport)
    
    # NOTE: Do NOT filter by status at SQL level.
    # Status is updated dynamically by update_status() after fetching,
    # so we filter by status in Python below (lines 99-109).
    
    if search:
        search_term = f'%{search}%'
        query = query.filter(
            (Match.title.ilike(search_term)) |
            (Match.venue_name.ilike(search_term)) |
            (Match.venue_address.ilike(search_term))
        )
    
    # Get all matches first, then filter by location if needed
    matches = query.all()
    
    # Auto-update statuses (marks past matches as 'live' or 'completed')
    for match in matches:
        match.update_status()
    db.session.commit()
    
    # Filter by status for dashboard display
    if status == 'all':
        # Show open, full, and live matches (exclude completed and cancelled)
        matches = [m for m in matches if m.status in ('open', 'full', 'live')]
    elif status == 'upcoming':
        # Show only upcoming matches (open or full, not yet started)
        matches = [m for m in matches if m.status in ('open', 'full')]
    elif status == 'live':
        matches = [m for m in matches if m.status == 'live']
    elif status == 'completed':
        # Show completed matches only if they finished within the last 5 days
        cutoff_date = datetime.utcnow() - timedelta(days=5)
        matches = [
            m for m in matches 
            if m.status == 'completed' and 
            (m.date_time is None or (m.date_time + timedelta(hours=2)) >= cutoff_date)
        ]
    
    # Location filtering (Haversine formula in Python)
    if user_lat and user_lng:
        import math
        
        def haversine(lat1, lon1, lat2, lon2):
            R = 6371  # Earth's radius in km
            phi1 = math.radians(lat1)
            phi2 = math.radians(lat2)
            delta_phi = math.radians(lat2 - lat1)
            delta_lambda = math.radians(lon2 - lon1)
            
            a = math.sin(delta_phi/2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda/2)**2
            c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
            
            return R * c
        
        filtered_matches = []
        for match in matches:
            if match.latitude and match.longitude:
                distance = haversine(user_lat, user_lng, match.latitude, match.longitude)
                if distance <= radius_km:
                    match._distance = distance
                    filtered_matches.append(match)
            else:
                match._distance = None
                filtered_matches.append(match)  # Include matches without coordinates
        
        matches = filtered_matches
    
    # Sort
    if sort_by == 'date':
        matches.sort(key=lambda m: m.date_time or datetime.max)
    elif sort_by == 'spots':
        matches.sort(key=lambda m: m.get_spots_left())
    elif sort_by == 'price':
        matches.sort(key=lambda m: m.contribution or 0)
    elif sort_by == 'distance' and user_lat and user_lng:
        matches.sort(key=lambda m: getattr(m, '_distance', 999) or 999)
    
    # Limit results
    matches = matches[:limit]
    
    # Convert to dict with distance
    result = []
    for match in matches:
        data = match.to_dict()
        if hasattr(match, '_distance') and match._distance is not None:
            data['distance'] = round(match._distance, 2)
        result.append(data)
    
    return jsonify({
        'matches': result,
        'total': len(result)
    })


@matches_bp.route('/<int:match_id>', methods=['GET'])
def get_match(match_id):
    """Get match details by ID"""
    match = Match.query.get(match_id)
    
    if not match:
        return jsonify({'error': 'Match not found'}), 404
    
    # Update status based on time
    match.update_status()
    
    return jsonify({
        'match': match.to_dict(include_players=True)
    })


@matches_bp.route('', methods=['POST'])
@auth_required
def create_match():
    """Create a new match"""
    user = get_current_user()
    data = request.get_json()
    
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    # Validate data
    valid, errors = validate_match_data(data)
    if not valid:
        return jsonify({'error': 'Validation failed', 'errors': errors}), 400
    
    # Parse datetime — the frontend sends a local ISO string with explicit UTC offset
    # (e.g. "2026-03-25T10:00:00+05:30"). Convert to naive UTC before storing so that
    # all DB datetimes are consistently UTC-naive.
    try:
        date_time_raw = datetime.fromisoformat(data['dateTime'].replace('Z', '+00:00'))
        # Convert to UTC and strip tzinfo for naive storage
        if date_time_raw.tzinfo is not None:
            date_time = date_time_raw.astimezone(timezone.utc).replace(tzinfo=None)
        else:
            date_time = date_time_raw
    except (ValueError, KeyError):
        return jsonify({'error': 'Invalid date/time format'}), 400
        
    # Check for time overlap
    # Prevent creating matches if the user is 
    # already busy 2 hours before or after
    has_overlap, overlap_error = check_time_overlap(user.id, date_time)
    if has_overlap:
        return jsonify({'error': overlap_error}), 400
    
    # Create match
    match = Match(
        sport=data['sport'],
        title=data['title'],
        description=data.get('description', ''),
        venue_name=data['venueName'],
        venue_address=data.get('venueAddress', ''),
        city=data.get('city', ''),  # Optional city field
        latitude=data.get('latitude'),
        longitude=data.get('longitude'),
        date_time=date_time,
        total_players=data['totalPlayers'],
        contribution=data.get('contribution', 0),
        skill_level=data.get('skillLevel', 'all'),
        captain_id=user.id
    )
    
    db.session.add(match)
    db.session.commit()
    
    # Add captain to match history
    history = MatchHistory(
        user_id=user.id,
        match_id=match.id,
        role='Captain'
    )
    db.session.add(history)
    db.session.commit()
    
    return jsonify({
        'message': 'Match created successfully',
        'match': match.to_dict()
    }), 201


@matches_bp.route('/<int:match_id>', methods=['PUT'])
@auth_required
def update_match(match_id):
    """Update a match (captain only)"""
    user = get_current_user()
    match = Match.query.get(match_id)
    
    if not match:
        return jsonify({'error': 'Match not found'}), 404
    
    if match.captain_id != user.id:
        return jsonify({'error': 'Only the captain can update this match'}), 403
    
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    # Update allowed fields
    if 'title' in data:
        match.title = data['title']
    if 'description' in data:
        match.description = data['description']
    if 'venueName' in data:
        match.venue_name = data['venueName']
    if 'venueAddress' in data:
        match.venue_address = data['venueAddress']
    if 'latitude' in data:
        match.latitude = data['latitude']
    if 'longitude' in data:
        match.longitude = data['longitude']
    if 'contribution' in data:
        match.contribution = data['contribution']
    if 'status' in data:
        match.status = data['status']
    
    db.session.commit()
    
    return jsonify({
        'message': 'Match updated',
        'match': match.to_dict()
    })


@matches_bp.route('/<int:match_id>', methods=['DELETE'])
@auth_required
def delete_match(match_id):
    """Delete a match (captain only)"""
    user = get_current_user()
    match = Match.query.get(match_id)
    
    if not match:
        return jsonify({'error': 'Match not found'}), 404
    
    if match.captain_id != user.id:
        return jsonify({'error': 'Only the captain can delete this match'}), 403
    
    db.session.delete(match)
    db.session.commit()
    
    return jsonify({
        'message': 'Match deleted'
    })


@matches_bp.route('/<int:match_id>/join', methods=['POST'])
@auth_required
def join_match(match_id):
    """Request to join a match"""
    user = get_current_user()
    match = Match.query.get(match_id)
    
    if not match:
        return jsonify({'error': 'Match not found'}), 404
    
    # Check if entries are closed (5 minutes before match start)
    if match.entries_closed:
        return jsonify({'error': 'Entries are closed. Match starts in less than 5 minutes.'}), 400
    
    # Check if user is the captain
    if match.captain_id == user.id:
        return jsonify({'error': 'You are already the captain of this match'}), 400
    
    # Check if already requested
    existing = JoinRequest.query.filter_by(match_id=match_id, user_id=user.id).first()
    if existing:
        return jsonify({
            'error': f'You already have a {existing.status} request for this match',
            'status': existing.status
        }), 400
        
    # Check for time overlap
    # Prevent joining matches if the user is 
    # already busy 2 hours before or after
    has_overlap, overlap_error = check_time_overlap(user.id, match.date_time)
    if has_overlap:
        return jsonify({'error': overlap_error}), 400
    
    # Check spots availability
    if match.get_spots_left() <= 0:
        # Still allow joining waitlist
        pass
    
    data = request.get_json() or {}
    
    # Create join request
    join_request = JoinRequest(
        match_id=match_id,
        user_id=user.id,
        message=data.get('message', '')
    )
    
    db.session.add(join_request)
    db.session.commit()
    
    return jsonify({
        'message': 'Join request sent',
        'request': join_request.to_dict()
    }), 201


@matches_bp.route('/<int:match_id>/requests', methods=['GET'])
@auth_required
def get_match_requests(match_id):
    """Get pending join requests for a match (captain only)"""
    user = get_current_user()
    match = Match.query.get(match_id)
    
    if not match:
        return jsonify({'error': 'Match not found'}), 404
    
    if match.captain_id != user.id:
        return jsonify({'error': 'Only the captain can view requests'}), 403
    
    status = request.args.get('status', 'pending')
    
    requests = match.join_requests
    if status != 'all':
        requests = requests.filter_by(status=status)
    
    return jsonify({
        'requests': [r.to_dict() for r in requests.all()]
    })
