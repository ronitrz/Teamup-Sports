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
        """Approve this join request and add player to match"""
        self.status = 'approved'
        self.updated_at = datetime.utcnow()
        # Add player to match
        if self.match:
            self.match.add_player(self.user_id)
        db.session.commit()
    
    def reject(self):
        """Reject this join request"""
        self.status = 'rejected'
        self.updated_at = datetime.utcnow()
        db.session.commit()
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': self.id,
            'userId': self.user_id,
            'matchId': self.match_id,
            'message': self.message,
            'status': self.status,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
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
        """Convert to dictionary"""
        from models.match import Match
        match = Match.query.get(self.match_id)
        return {
            'id': self.id,
            'matchId': self.match_id,
            'role': self.role,
            'attended': self.attended,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'match': match.to_dict() if match else None
        }
    
    def __repr__(self):
        return f'<MatchHistory {self.user_id} - {self.match_id}>'

