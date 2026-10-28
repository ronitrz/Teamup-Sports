"""
Join Request Routes - Approve/reject join requests
"""
from datetime import datetime
from flask import Blueprint, request, jsonify
from database import db
from models.match import Match
from models.request import JoinRequest, MatchHistory
from utils.auth import auth_required, get_current_user

requests_bp = Blueprint('requests', __name__)


@requests_bp.route('/<int:request_id>', methods=['GET'])
@auth_required
def get_request(request_id):
    """Get join request details"""
    user = get_current_user()
    join_request = JoinRequest.query.get(request_id)
    
    if not join_request:
        return jsonify({'error': 'Request not found'}), 404
    
    # Only captain or the requester can view
    match = join_request.match
    if join_request.user_id != user.id and match.captain_id != user.id:
        return jsonify({'error': 'Access denied'}), 403
    
    return jsonify({
        'request': join_request.to_dict()
    })


@requests_bp.route('/<int:request_id>/approve', methods=['PUT'])
@auth_required
def approve_request(request_id):
    """Approve a join request (captain only)"""
    user = get_current_user()
    join_request = JoinRequest.query.get(request_id)
    
    if not join_request:
        return jsonify({'error': 'Request not found'}), 404
    
    match = join_request.match
    
    # Only captain can approve
    if match.captain_id != user.id:
        return jsonify({'error': 'Only the captain can approve requests'}), 403
    
    if join_request.status != 'pending':
        return jsonify({'error': f'Request already {join_request.status}'}), 400
    
    # Check if entries are closed (5 minutes before match start)
    if match.entries_closed:
        return jsonify({'error': 'Entries are closed. Match starts in less than 5 minutes.'}), 400
    
    # Check if spots available
    if match.get_spots_left() <= 0:
        return jsonify({'error': 'No spots available'}), 400
    
    # Approve request
    join_request.approve()
    
    # Add to match history
    history = MatchHistory(
        user_id=join_request.user_id,
        match_id=match.id,
        role='Player'
    )
    db.session.add(history)
    db.session.commit()
    
    return jsonify({
        'message': 'Request approved',
        'request': join_request.to_dict()
    })


@requests_bp.route('/<int:request_id>/reject', methods=['PUT'])
@auth_required
def reject_request(request_id):
    """Reject a join request (captain only)"""
    user = get_current_user()
    join_request = JoinRequest.query.get(request_id)
    
    if not join_request:
        return jsonify({'error': 'Request not found'}), 404
    
    match = join_request.match
    
    # Only captain can reject
    if match.captain_id != user.id:
        return jsonify({'error': 'Only the captain can reject requests'}), 403
    
    if join_request.status != 'pending':
        return jsonify({'error': f'Request already {join_request.status}'}), 400
    
    # Reject request
    join_request.reject()
    
    return jsonify({
        'message': 'Request rejected',
        'request': join_request.to_dict()
    })


@requests_bp.route('/my', methods=['GET'])
@auth_required
def get_my_requests():
    """Get current user's join requests"""
    user = get_current_user()
    
    status = request.args.get('status', 'all')
    
    requests_query = JoinRequest.query.filter_by(user_id=user.id)
    
    if status != 'all':
        requests_query = requests_query.filter_by(status=status)
    
    requests = requests_query.order_by(JoinRequest.created_at.desc()).all()
    
    return jsonify({
        'requests': [r.to_dict() for r in requests]
    })


@requests_bp.route('/<int:request_id>/cancel', methods=['DELETE'])
@auth_required
def cancel_request(request_id):
    """Cancel a pending join request (by requester)"""
    user = get_current_user()
    join_request = JoinRequest.query.get(request_id)
    
    if not join_request:
        return jsonify({'error': 'Request not found'}), 404
    
    # Only requester can cancel
    if join_request.user_id != user.id:
        return jsonify({'error': 'Access denied'}), 403
    
    if join_request.status != 'pending':
        return jsonify({'error': 'Can only cancel pending requests'}), 400
    
    db.session.delete(join_request)
    db.session.commit()
    
    return jsonify({
        'message': 'Request cancelled'
    })
