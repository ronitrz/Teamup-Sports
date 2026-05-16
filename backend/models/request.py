"""
Request Model - Join requests and match history
"""
from datetime import datetime
from database import db


class JoinRequest(db.Model):
    """Join request for matches"""
    __tablename__ = 'join_requests'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    match_id = db.Column(db.Integer, db.ForeignKey('matches.id'), nullable=False)
    
    message = db.Column(db.Text)  # Optional message to captain
    status = db.Column(db.String(20), default='pending')  # pending, approved, rejected
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def approve(self):
        """Mark this join request as approved and add the player to the match.
        The caller is responsible for calling db.session.commit().
        """
        self.status = 'approved'
        self.updated_at = datetime.utcnow()
        if self.match:
            self.match.add_player(self.user_id)
    
    def reject(self):
        """Mark this join request as rejected.
        The caller is responsible for calling db.session.commit().
        """
        self.status = 'rejected'
        self.updated_at = datetime.utcnow()
    
    def to_dict(self):
        """Convert to dictionary.
        All datetimes carry a 'Z' suffix so JavaScript parses them as UTC.
        """
        def _utc_iso(dt):
            return dt.strftime('%Y-%m-%dT%H:%M:%S') + 'Z' if dt else None

        return {
            'id': self.id,
            'userId': self.user_id,
            'matchId': self.match_id,
            'message': self.message,
            'status': self.status,
            'createdAt': _utc_iso(self.created_at),
            'user': self.user.to_dict() if self.user else None,
            'match': self.match.to_dict() if self.match else None
        }
    
    def __repr__(self):
        return f'<JoinRequest {self.user_id} -> {self.match_id}>'


class MatchHistory(db.Model):
    """Track user's match participation history"""
    __tablename__ = 'match_history'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    match_id = db.Column(db.Integer, db.ForeignKey('matches.id'), nullable=False)
    
    role = db.Column(db.String(20), default='player')  # captain, player
    attended = db.Column(db.Boolean, default=True)
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        """Convert to dictionary.
        All datetimes carry a 'Z' suffix so JavaScript parses them as UTC.
        """
        from models.match import Match
        match = Match.query.get(self.match_id)

        def _utc_iso(dt):
            return dt.strftime('%Y-%m-%dT%H:%M:%S') + 'Z' if dt else None

        return {
            'id': self.id,
            'matchId': self.match_id,
            'role': self.role,
            'attended': self.attended,
            'createdAt': _utc_iso(self.created_at),
            'match': match.to_dict() if match else None
        }
    
    def __repr__(self):
        return f'<MatchHistory {self.user_id} - {self.match_id}>'

