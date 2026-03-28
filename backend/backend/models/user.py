"""
User Model - Database model for users
"""
from datetime import datetime
from database import db


class User(db.Model):
    """User model for storing user data"""
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    phone = db.Column(db.String(15), unique=True, nullable=True)
    password_hash = db.Column(db.String(255), nullable=True)
    google_id = db.Column(db.String(255), unique=True, nullable=True)
    
    country = db.Column(db.String(100), default='India')
    state = db.Column(db.String(100))
    city = db.Column(db.String(100))
    profile_picture = db.Column(db.Text)  # Base64 or file path
    credit_score = db.Column(db.Integer, default=100)
    
    sports = db.Column(db.Text)  # Comma-separated sports
    
    is_verified = db.Column(db.Boolean, default=False)
    is_email_verified = db.Column(db.Boolean, default=False)
    is_phone_verified = db.Column(db.Boolean, default=False)
    
    joined_date = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    created_matches = db.relationship('Match', backref='captain', lazy='dynamic', foreign_keys='Match.captain_id')
    join_requests = db.relationship('JoinRequest', backref='user', lazy='dynamic')
    match_history = db.relationship('MatchHistory', backref='user', lazy='dynamic')
    
    def to_dict(self, include_private=False):
        """Convert user to dictionary"""
        data = {
            'id': self.id,
            'name': self.name,
            'country': self.country,
            'state': self.state,
            'city': self.city,
            'location': ', '.join(filter(None, [self.city, self.state])) or self.country or '',
            'profilePicture': self.profile_picture,
            'creditScore': self.credit_score,
            'sports': self.sports.split(',') if self.sports else [],
            'joinedDate': self.joined_date.isoformat() if self.joined_date else None,
            'isVerified': self.is_verified,
            'stats': self.get_stats()
        }
        
        if include_private:
            data['email'] = self.email
            data['phone'] = self.phone
            data['isEmailVerified'] = self.is_email_verified
            data['isPhoneVerified'] = self.is_phone_verified
        
        return data
    
    def get_stats(self):
        """Get user statistics"""
        history = self.match_history.all()
        matches_played = len(history)
        matches_attended = len([h for h in history if h.attended])
        no_shows = matches_played - matches_attended
        matches_created = self.created_matches.count()
        
        return {
            'matchesPlayed': matches_played,
            'matchesAttended': matches_attended,
            'noShows': no_shows,
            'matchesCreated': matches_created
        }
    
    def update_credit_score(self):
        """Calculate and update credit score based on attendance"""
        history = self.match_history.all()
        if not history:
            self.credit_score = 100
            return
        
        attended = len([h for h in history if h.attended])
        total = len(history)
        no_shows = total - attended
        
        if total > 0:
            # Score formula: base 100 + (+1 per attended) - (-5 per no show)
            new_score = 100 + attended - (no_shows * 5)
            # Ensure it doesn't go below 0
            self.credit_score = max(0, new_score)
        
        db.session.commit()
    
    def __repr__(self):
        return f'<User {self.name}>'



