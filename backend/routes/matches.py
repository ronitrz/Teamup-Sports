"""
Match Routes - Match CRUD, listing, filtering, and join requests
Edge cases covered:
  - Sport/skill_level/coordinate validation via allowlists
  - Credit score gate for match creation
  - Pagination and metadata on list endpoint
  - Timezone-aware overlap detection
  - Block updates/deletes on live/completed matches
  - Cascade-cancel join requests on match deletion
  - Prevent reducing total_players below current_players
"""
import math
from datetime import datetime, timezone, timedelta
from flask import Blueprint, request, jsonify
from sqlalchemy import func
from database import db
from models.match import Match
from models.user import User
from models.request import JoinRequest, MatchHistory
from utils.auth import auth_required, get_current_user
from utils.validators import (
    validate_match_data, validate_future_datetime,
    validate_coords, ALLOWED_SPORTS, ALLOWED_SKILL_LEVELS
)

matches_bp = Blueprint('matches', __name__)

# Minimum credit score required to create a match
MIN_CREDIT_SCORE_TO_CREATE = 30

# Maximum radius (km) clients can request
MAX_RADIUS_KM = 100


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return distance in km between two (lat, lng) points."""
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _to_utc_aware(dt: datetime) -> datetime:
    """Ensure a datetime is timezone-aware UTC."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def check_time_overlap(user_id: int, target_time: datetime):
    """Check if user has any match commitment within ±2 hours of target_time.
    Handles timezone-aware and naive datetimes correctly.
    Returns (has_overlap: bool, error_message: str | None).
    """
    target = _to_utc_aware(target_time)
    window_start = target - timedelta(hours=2)
    window_end   = target + timedelta(hours=2)

    # Naive-equivalent bounds for DB comparison (stored as naive UTC)
    ws_naive = window_start.replace(tzinfo=None)
    we_naive = window_end.replace(tzinfo=None)

    # 1. Matches user captains
    captain_overlap = Match.query.filter(
        Match.captain_id == user_id,
        Match.status.notin_(['cancelled', 'completed']),
        Match.date_time >= ws_naive,
        Match.date_time <= we_naive
    ).first()
    if captain_overlap:
        return True, 'You are already organizing a match within 2 hours of that time.'

    # 2. Matches user has joined (approved) or requested (pending)
    active_request_ids = [
        r.match_id for r in JoinRequest.query.filter(
            JoinRequest.user_id == user_id,
            JoinRequest.status.in_(['pending', 'approved'])
        ).all()
    ]

    if active_request_ids:
        joined_overlap = Match.query.filter(
            Match.id.in_(active_request_ids),
            Match.status.notin_(['cancelled', 'completed']),
            Match.date_time >= ws_naive,
            Match.date_time <= we_naive
        ).first()
        if joined_overlap:
            return True, 'You are already playing in or have requested a match within 2 hours of that time.'

    return False, None


# ─── List Matches ─────────────────────────────────────────────────────────────

@matches_bp.route('', methods=['GET'])
def list_matches():
    """List matches with sport/status/search/geo filtering, sorting, pagination."""

    # ── Query params ──
    sport  = request.args.get('sport', '').strip().lower()
    status = request.args.get('status', 'all').strip().lower()
    search = request.args.get('search', '').strip()
    sort_by = request.args.get('sortBy', 'date').strip().lower()
    date_filter = request.args.get('date', '').strip()

    # Pagination
    try:
        page     = max(1, int(request.args.get('page', 1)))
        per_page = min(100, max(1, int(request.args.get('per_page', 50))))
    except (ValueError, TypeError):
        return jsonify({'error': 'page and per_page must be integers', 'code': 'INVALID_PAGINATION'}), 400

    # Location filter
    user_lat = request.args.get('lat', type=float)
    user_lng = request.args.get('lng', type=float)

    try:
        radius_km = min(MAX_RADIUS_KM, max(0.1, float(request.args.get('radius', 4))))
    except (TypeError, ValueError):
        radius_km = 4.0

    # Validate lat/lng if provided
    if user_lat is not None or user_lng is not None:
        valid, err = validate_coords(user_lat, user_lng)
        if not valid:
            return jsonify({'error': err, 'code': 'INVALID_COORDS'}), 400

    # Validate sport filter
    if sport and sport not in ALLOWED_SPORTS:
        return jsonify({'error': f'Invalid sport filter', 'code': 'INVALID_SPORT'}), 400

    # Validate status filter
    allowed_statuses = {'all', 'open', 'full', 'live', 'completed', 'upcoming'}
    if status not in allowed_statuses:
        return jsonify({'error': f'Invalid status filter', 'code': 'INVALID_STATUS'}), 400

    # ── Build base query ──
    query = Match.query
    if sport:
        query = query.filter_by(sport=sport)

    if date_filter:
        try:
            target_date = datetime.strptime(date_filter, '%Y-%m-%d').date()
            # Filter matches where the date_time's date matches the target
            # Note: date_time is stored as naive UTC. If we want strict local timezone matching
            # we'd need database-level TZ casting, but for this app simple UTC date matching
            # or naive matching is acceptable.
            query = query.filter(func.date(Match.date_time) == target_date)
        except ValueError:
            return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD.', 'code': 'INVALID_DATE'}), 400

    if search:
        term = f'%{search}%'
        query = query.filter(
            Match.title.ilike(term) |
            Match.venue_name.ilike(term) |
            Match.venue_address.ilike(term)
        )

    matches = query.all()

    # ── Auto-update statuses ──
    for m in matches:
        m.update_status()
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()

    # ── Status filter (post-update) ──
    if status == 'all':
        matches = [m for m in matches if m.status in ('open', 'full', 'live')]
    elif status == 'upcoming':
        matches = [m for m in matches if m.status in ('open', 'full')]
    elif status == 'live':
        matches = [m for m in matches if m.status == 'live']
    elif status == 'completed':
        matches = [m for m in matches if m.status == 'completed']
    elif status in ('open', 'full'):
        matches = [m for m in matches if m.status == status]

    # ── Geo filter ──
    if user_lat is not None and user_lng is not None:
        filtered = []
        for m in matches:
            if m.latitude is not None and m.longitude is not None:
                dist = _haversine(user_lat, user_lng, m.latitude, m.longitude)
                if dist <= radius_km:
                    m._distance = round(dist, 2)
                    filtered.append(m)
            else:
                m._distance = None
                filtered.append(m)
        matches = filtered

    # ── Sort ──
    if sort_by == 'date':
        matches.sort(key=lambda m: _to_utc_aware(m.date_time) if m.date_time else datetime.max.replace(tzinfo=timezone.utc))
    elif sort_by == 'spots':
        matches.sort(key=lambda m: m.get_spots_left(), reverse=True)
    elif sort_by == 'price':
        matches.sort(key=lambda m: m.contribution or 0)
    elif sort_by == 'distance' and user_lat is not None:
        matches.sort(key=lambda m: getattr(m, '_distance', 999) or 999)

    # ── Pagination ──
    total = len(matches)
    paginated = matches[(page - 1) * per_page: page * per_page]

    # ── Serialize ──
    result = []
    for m in paginated:
        data = m.to_dict()
        dist = getattr(m, '_distance', None)
        if dist is not None:
            data['distance'] = dist
        result.append(data)

    return jsonify({
        'matches': result,
        'meta': {
            'total': total,
            'page': page,
            'perPage': per_page,
            'pages': (total + per_page - 1) // per_page if per_page else 1
        }
    })


# ─── Get Single Match ─────────────────────────────────────────────────────────

@matches_bp.route('/<int:match_id>', methods=['GET'])
def get_match(match_id):
    """Get full details of a match, including player list and join status."""
    if match_id <= 0:
        return jsonify({'error': 'Invalid match ID', 'code': 'INVALID_ID'}), 400

    match = Match.query.get(match_id)
    if not match:
        return jsonify({'error': 'Match not found', 'code': 'NOT_FOUND'}), 404

    match.update_status()
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()

    return jsonify({'match': match.to_dict(include_players=True)})


# ─── Create Match ─────────────────────────────────────────────────────────────

@matches_bp.route('', methods=['POST'])
@auth_required
def create_match():
    """Create a new match. Requires authentication and a minimum credit score."""
    user = get_current_user()
    data = request.get_json(silent=True)

    if not data:
        return jsonify({'error': 'Request body must be JSON', 'code': 'NO_DATA'}), 400

    # Credit score gate
    if user.credit_score < MIN_CREDIT_SCORE_TO_CREATE:
        return jsonify({
            'error': f'Your credit score ({user.credit_score}) is too low to create a match. Minimum required: {MIN_CREDIT_SCORE_TO_CREATE}',
            'code': 'LOW_CREDIT_SCORE'
        }), 403

    # Validate all match fields
    valid, errors = validate_match_data(data)
    if not valid:
        return jsonify({'error': 'Validation failed', 'errors': errors}), 400

    # Parse and validate dateTime
    date_time, dt_err = validate_future_datetime(data.get('dateTime'))
    if dt_err:
        return jsonify({'error': dt_err, 'code': 'INVALID_DATETIME'}), 400

    # Check for schedule conflict
    has_overlap, overlap_msg = check_time_overlap(user.id, date_time)
    if has_overlap:
        return jsonify({'error': overlap_msg, 'code': 'SCHEDULE_CONFLICT'}), 409

    # Normalize sport / skill level
    sport       = data['sport'].strip().lower()
    skill_level = (data.get('skillLevel', 'all') or 'all').strip().lower()

    total_players = int(data['totalPlayers'])

    match = Match(
        sport=sport,
        title=data['title'].strip(),
        description=(data.get('description') or '').strip(),
        venue_name=data['venueName'].strip(),
        venue_address=(data.get('venueAddress') or '').strip(),
        latitude=data.get('latitude'),
        longitude=data.get('longitude'),
        # Store as naive UTC so DB comparisons work consistently
        date_time=date_time.replace(tzinfo=None),
        total_players=total_players,
        current_players=1,  # Captain counts as 1
        players=str(user.id),
        contribution=float(data.get('contribution') or 0),
        skill_level=skill_level,
        captain_id=user.id,
        status='open'
    )

    db.session.add(match)
    db.session.flush()  # Get match.id before commit

    # Record in match history as Captain
    history = MatchHistory(
        user_id=user.id,
        match_id=match.id,
        role='captain'
    )
    db.session.add(history)
    db.session.commit()

    return jsonify({
        'message': 'Match created successfully',
        'match': match.to_dict()
    }), 201


# ─── Update Match ─────────────────────────────────────────────────────────────

@matches_bp.route('/<int:match_id>', methods=['PUT'])
@auth_required
def update_match(match_id):
    """Update a match. Captain only. Blocked on live/completed matches."""
    user  = get_current_user()
    match = Match.query.get(match_id)

    if not match:
        return jsonify({'error': 'Match not found', 'code': 'NOT_FOUND'}), 404
    if match.captain_id != user.id:
        return jsonify({'error': 'Only the captain can update this match', 'code': 'FORBIDDEN'}), 403
    if match.status in ('live', 'completed', 'cancelled'):
        return jsonify({
            'error': f"Cannot update a match that is '{match.status}'",
            'code': 'MATCH_NOT_EDITABLE'
        }), 409

    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Request body must be JSON', 'code': 'NO_DATA'}), 400

    # Prevent updating protected fields
    PROTECTED = {'captain_id', 'id', 'created_at', 'current_players', 'players'}
    for field in PROTECTED:
        if field in data:
            return jsonify({'error': f"Field '{field}' cannot be updated", 'code': 'FORBIDDEN_FIELD'}), 403

    # Title
    if 'title' in data:
        title = str(data['title']).strip()
        if not title or len(title) < 3 or len(title) > 200:
            return jsonify({'error': 'Title must be 3–200 characters', 'code': 'INVALID_TITLE'}), 400
        match.title = title

    # Description
    if 'description' in data:
        desc = str(data.get('description') or '').strip()
        if len(desc) > 1000:
            return jsonify({'error': 'Description must be at most 1000 characters', 'code': 'INVALID_DESC'}), 400
        match.description = desc

    # Venue
    if 'venueName' in data:
        v = str(data['venueName']).strip()
        if not v or len(v) > 200:
            return jsonify({'error': 'Venue name must be 1–200 characters', 'code': 'INVALID_VENUE'}), 400
        match.venue_name = v

    if 'venueAddress' in data:
        match.venue_address = str(data.get('venueAddress') or '').strip()[:300]

    # Coordinates
    if 'latitude' in data or 'longitude' in data:
        lat = data.get('latitude', match.latitude)
        lng = data.get('longitude', match.longitude)
        valid, err = validate_coords(lat, lng)
        if not valid:
            return jsonify({'error': err, 'code': 'INVALID_COORDS'}), 400
        match.latitude  = lat
        match.longitude = lng

    # DateTime
    if 'dateTime' in data:
        new_dt, dt_err = validate_future_datetime(data['dateTime'])
        if dt_err:
            return jsonify({'error': dt_err, 'code': 'INVALID_DATETIME'}), 400
        match.date_time = new_dt.replace(tzinfo=None)

    # Total players — cannot reduce below current count
    if 'totalPlayers' in data:
        try:
            tp = int(data['totalPlayers'])
        except (TypeError, ValueError):
            return jsonify({'error': 'totalPlayers must be an integer', 'code': 'INVALID_PLAYERS'}), 400
        if tp < 2 or tp > 50:
            return jsonify({'error': 'totalPlayers must be 2–50', 'code': 'INVALID_PLAYERS'}), 400
        if tp < match.current_players:
            return jsonify({
                'error': f'Cannot reduce total players below current count ({match.current_players})',
                'code': 'PLAYERS_BELOW_CURRENT'
            }), 409
        match.total_players = tp

    # Contribution
    if 'contribution' in data:
        try:
            cv = float(data['contribution'])
            if cv < 0 or cv > 50000:
                raise ValueError
        except (TypeError, ValueError):
            return jsonify({'error': 'contribution must be 0–50000', 'code': 'INVALID_CONTRIBUTION'}), 400
        match.contribution = cv

    # Skill level
    if 'skillLevel' in data:
        sl = str(data['skillLevel']).strip().lower()
        if sl not in ALLOWED_SKILL_LEVELS:
            return jsonify({'error': f'Invalid skillLevel. Allowed: {sorted(ALLOWED_SKILL_LEVELS)}', 'code': 'INVALID_SKILL'}), 400
        match.skill_level = sl

    # Status (only allow specific manual transitions)
    if 'status' in data:
        new_status = str(data['status']).strip().lower()
        allowed_transitions = {'open', 'cancelled'}
        if new_status not in allowed_transitions:
            return jsonify({
                'error': f"Can only manually set status to: {sorted(allowed_transitions)}",
                'code': 'INVALID_STATUS_TRANSITION'
            }), 400
        match.status = new_status

    db.session.commit()
    return jsonify({'message': 'Match updated', 'match': match.to_dict()})


# ─── Delete Match ─────────────────────────────────────────────────────────────

@matches_bp.route('/<int:match_id>', methods=['DELETE'])
@auth_required
def delete_match(match_id):
    """Delete a match. Captain only. Blocked on live matches."""
    user  = get_current_user()
    match = Match.query.get(match_id)

    if not match:
        return jsonify({'error': 'Match not found', 'code': 'NOT_FOUND'}), 404
    if match.captain_id != user.id:
        return jsonify({'error': 'Only the captain can delete this match', 'code': 'FORBIDDEN'}), 403
    if match.status == 'live':
        return jsonify({'error': 'Cannot delete a live match', 'code': 'MATCH_IS_LIVE'}), 409

    # Cancel all pending/approved join requests before deletion
    for jr in match.join_requests.all():
        jr.status = 'cancelled'
    db.session.flush()

    db.session.delete(match)
    db.session.commit()

    return jsonify({'message': 'Match deleted successfully'})


# ─── Join Match ───────────────────────────────────────────────────────────────

@matches_bp.route('/<int:match_id>/join', methods=['POST'])
@auth_required
def join_match(match_id):
    """Send a join request for a match."""
    user  = get_current_user()
    match = Match.query.get(match_id)

    if not match:
        return jsonify({'error': 'Match not found', 'code': 'NOT_FOUND'}), 404

    if match.status in ('cancelled', 'completed'):
        return jsonify({'error': f'Cannot join a {match.status} match', 'code': 'MATCH_UNAVAILABLE'}), 409

    if match.entries_closed:
        return jsonify({
            'error': 'Entries are closed. Match starts in less than 5 minutes.',
            'code': 'ENTRIES_CLOSED'
        }), 409

    if match.captain_id == user.id:
        return jsonify({'error': 'You are already the captain of this match', 'code': 'ALREADY_CAPTAIN'}), 400

    # Already in the players list (approved before)
    if user.id in match.get_players_list():
        return jsonify({'error': 'You are already in this match', 'code': 'ALREADY_IN_MATCH'}), 409

    # Already has a request
    existing = JoinRequest.query.filter_by(match_id=match_id, user_id=user.id).first()
    if existing:
        if existing.status == 'pending':
            return jsonify({'error': 'You already have a pending request for this match', 'code': 'REQUEST_PENDING'}), 409
        if existing.status == 'approved':
            return jsonify({'error': 'You are already approved for this match', 'code': 'ALREADY_APPROVED'}), 409
        # If rejected, allow re-requesting
        if existing.status == 'rejected':
            existing.status = 'pending'
            existing.message = str(request.get_json(silent=True) or {}).get('message', '') if request.get_json(silent=True) else ''
            db.session.commit()
            return jsonify({'message': 'Join request re-submitted', 'request': existing.to_dict()}), 200

    # Schedule conflict check
    has_overlap, overlap_msg = check_time_overlap(user.id, match.date_time)
    if has_overlap:
        return jsonify({'error': overlap_msg, 'code': 'SCHEDULE_CONFLICT'}), 409

    data = request.get_json(silent=True) or {}
    message = str(data.get('message', '') or '')[:500]  # Cap message length

    join_request = JoinRequest(
        match_id=match_id,
        user_id=user.id,
        message=message
    )
    db.session.add(join_request)
    db.session.commit()

    return jsonify({
        'message': 'Join request sent! Waiting for captain approval.',
        'request': join_request.to_dict()
    }), 201


# ─── Get Match Join Requests ──────────────────────────────────────────────────

@matches_bp.route('/<int:match_id>/requests', methods=['GET'])
@auth_required
def get_match_requests(match_id):
    """Get join requests for a match. Captain only."""
    user  = get_current_user()
    match = Match.query.get(match_id)

    if not match:
        return jsonify({'error': 'Match not found', 'code': 'NOT_FOUND'}), 404
    if match.captain_id != user.id:
        return jsonify({'error': 'Only the captain can view join requests', 'code': 'FORBIDDEN'}), 403

    status_filter = request.args.get('status', 'pending').strip().lower()
    allowed_status_filters = {'pending', 'approved', 'rejected', 'all'}
    if status_filter not in allowed_status_filters:
        return jsonify({'error': f'Invalid status filter. Use: {sorted(allowed_status_filters)}', 'code': 'INVALID_STATUS'}), 400

    query = match.join_requests
    if status_filter != 'all':
        query = query.filter_by(status=status_filter)

    requests_list = query.order_by(JoinRequest.created_at.asc()).all()

    pending_count  = match.join_requests.filter_by(status='pending').count()
    approved_count = match.join_requests.filter_by(status='approved').count()

    return jsonify({
        'requests': [r.to_dict() for r in requests_list],
        'summary': {
            'pending': pending_count,
            'approved': approved_count,
            'spotsLeft': match.get_spots_left()
        }
    })
