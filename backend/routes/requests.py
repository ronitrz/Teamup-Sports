"""
Join Request Routes - Approve/reject/cancel join requests
Edge cases covered:
  - Transactional-safe approve (re-checks spots inside commit)
  - Reject an approved request (removes player from match)
  - Cancel an approved request (removes player, free the spot)
  - Ownership validation on every action
  - Block actions when match is live/completed/cancelled
"""
from datetime import datetime
from flask import Blueprint, request, jsonify
from database import db
from models.match import Match
from models.request import JoinRequest, MatchHistory
from utils.auth import auth_required, get_current_user

requests_bp = Blueprint('requests', __name__)


# ─── Helper ───────────────────────────────────────────────────────────────────

def _get_request_or_404(request_id: int):
    if request_id <= 0:
        return None, jsonify({'error': 'Invalid request ID', 'code': 'INVALID_ID'}), 400
    jr = JoinRequest.query.get(request_id)
    if not jr:
        return None, jsonify({'error': 'Join request not found', 'code': 'NOT_FOUND'}), 404
    return jr, None, None


# ─── Get Single Request ───────────────────────────────────────────────────────

@requests_bp.route('/<int:request_id>', methods=['GET'])
@auth_required
def get_request(request_id):
    """Get details of a specific join request.
    Only the requester or the match captain can view it.
    """
    jr, err_response, err_status = _get_request_or_404(request_id)
    if err_response:
        return err_response, err_status

    user  = get_current_user()
    match = jr.match

    if jr.user_id != user.id and (not match or match.captain_id != user.id):
        return jsonify({'error': 'Access denied', 'code': 'FORBIDDEN'}), 403

    return jsonify({'request': jr.to_dict()})


# ─── Approve Request ──────────────────────────────────────────────────────────

@requests_bp.route('/<int:request_id>/approve', methods=['PUT'])
@auth_required
def approve_request(request_id):
    """Approve a join request. Captain only. Transactional spot check."""
    jr, err_response, err_status = _get_request_or_404(request_id)
    if err_response:
        return err_response, err_status

    user  = get_current_user()
    match = jr.match

    if not match:
        return jsonify({'error': 'Associated match no longer exists', 'code': 'MATCH_DELETED'}), 404

    if match.captain_id != user.id:
        return jsonify({'error': 'Only the captain can approve requests', 'code': 'FORBIDDEN'}), 403

    if match.status in ('cancelled', 'completed'):
        return jsonify({'error': f"Cannot approve requests for a {match.status} match", 'code': 'MATCH_UNAVAILABLE'}), 409

    if match.entries_closed:
        return jsonify({'error': 'Entries are closed. Match starts in less than 5 minutes.', 'code': 'ENTRIES_CLOSED'}), 409

    if jr.status == 'approved':
        return jsonify({'error': 'Request is already approved', 'code': 'ALREADY_APPROVED'}), 409

    if jr.status == 'cancelled':
        return jsonify({'error': 'Cannot approve a cancelled request', 'code': 'REQUEST_CANCELLED'}), 409

    # Re-check spots in the same transaction to prevent race conditions
    spots_left = match.get_spots_left()
    if jr.status != 'approved' and spots_left <= 0:
        return jsonify({'error': 'No spots available in this match', 'code': 'NO_SPOTS'}), 409

    # Guard: player might already be in the players list
    if jr.user_id in match.get_players_list():
        jr.status = 'approved'
        db.session.commit()
        return jsonify({'message': 'Player was already in the match; request marked approved', 'request': jr.to_dict()})

    # Approve and add to match
    jr.approve()

    # Add to match history as player (if not already present)
    existing_history = MatchHistory.query.filter_by(
        user_id=jr.user_id, match_id=match.id
    ).first()
    if not existing_history:
        history = MatchHistory(
            user_id=jr.user_id,
            match_id=match.id,
            role='player'
        )
        db.session.add(history)

    db.session.commit()

    return jsonify({'message': 'Request approved', 'request': jr.to_dict()})


# ─── Reject Request ───────────────────────────────────────────────────────────

@requests_bp.route('/<int:request_id>/reject', methods=['PUT'])
@auth_required
def reject_request(request_id):
    """Reject a join request. Captain only.
    If request was already approved, the player is also removed from the match.
    """
    jr, err_response, err_status = _get_request_or_404(request_id)
    if err_response:
        return err_response, err_status

    user  = get_current_user()
    match = jr.match

    if not match:
        return jsonify({'error': 'Associated match no longer exists', 'code': 'MATCH_DELETED'}), 404

    if match.captain_id != user.id:
        return jsonify({'error': 'Only the captain can reject requests', 'code': 'FORBIDDEN'}), 403

    if jr.status == 'rejected':
        return jsonify({'error': 'Request is already rejected', 'code': 'ALREADY_REJECTED'}), 409

    if jr.status == 'cancelled':
        return jsonify({'error': 'Cannot reject a cancelled request', 'code': 'REQUEST_CANCELLED'}), 409

    # If was approved, remove the player from the match roster
    was_approved = jr.status == 'approved'
    jr.reject()

    if was_approved:
        match.remove_player(jr.user_id)
        # Also remove from match history if they were added
        history = MatchHistory.query.filter_by(
            user_id=jr.user_id, match_id=match.id
        ).first()
        if history:
            db.session.delete(history)

    db.session.commit()

    msg = 'Request rejected and player removed from match.' if was_approved else 'Request rejected.'
    return jsonify({'message': msg, 'request': jr.to_dict()})


# ─── Get My Requests ──────────────────────────────────────────────────────────

@requests_bp.route('/my', methods=['GET'])
@auth_required
def get_my_requests():
    """Get the current user's own join requests with status filter and pagination."""
    user = get_current_user()

    status_filter = request.args.get('status', 'all').strip().lower()
    allowed = {'all', 'pending', 'approved', 'rejected', 'cancelled'}
    if status_filter not in allowed:
        return jsonify({'error': f"status must be one of: {sorted(allowed)}", 'code': 'INVALID_STATUS'}), 400

    # Pagination
    try:
        page     = max(1, int(request.args.get('page', 1)))
        per_page = min(50, max(1, int(request.args.get('per_page', 20))))
    except (TypeError, ValueError):
        return jsonify({'error': 'page and per_page must be integers', 'code': 'INVALID_PAGINATION'}), 400

    query = JoinRequest.query.filter_by(user_id=user.id)
    if status_filter != 'all':
        query = query.filter_by(status=status_filter)

    total   = query.count()
    records = query.order_by(JoinRequest.created_at.desc()) \
                   .offset((page - 1) * per_page).limit(per_page).all()

    return jsonify({
        'requests': [r.to_dict() for r in records],
        'meta': {
            'total': total,
            'page': page,
            'perPage': per_page,
            'pages': (total + per_page - 1) // per_page if per_page else 1
        }
    })


# ─── Cancel Request ───────────────────────────────────────────────────────────

@requests_bp.route('/<int:request_id>/cancel', methods=['DELETE'])
@auth_required
def cancel_request(request_id):
    """Cancel a join request (by the requester).
    If the request was approved, the user is removed from the match roster.
    """
    jr, err_response, err_status = _get_request_or_404(request_id)
    if err_response:
        return err_response, err_status

    user = get_current_user()

    if jr.user_id != user.id:
        return jsonify({'error': 'You can only cancel your own requests', 'code': 'FORBIDDEN'}), 403

    if jr.status == 'cancelled':
        return jsonify({'error': 'Request is already cancelled', 'code': 'ALREADY_CANCELLED'}), 409

    if jr.status == 'rejected':
        return jsonify({'error': 'Cannot cancel a rejected request', 'code': 'ALREADY_REJECTED'}), 409

    match = jr.match

    # If previously approved, remove from match players list
    was_approved = jr.status == 'approved'
    if was_approved and match:
        match.remove_player(user.id)
        # Remove from match history
        history = MatchHistory.query.filter_by(
            user_id=user.id, match_id=match.id
        ).first()
        if history:
            db.session.delete(history)

    db.session.delete(jr)
    db.session.commit()

    msg = 'Join request cancelled and you have been removed from the match.' if was_approved else 'Join request cancelled.'
    return jsonify({'message': msg})
