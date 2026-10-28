"""
Live Stream Model
"""
from database import db
from datetime import datetime

class LiveStream(db.Model):
    __tablename__ = 'livestreams'
    
    id = db.Column(db.Integer, primary_key=True)
    match_id = db.Column(db.Integer, db.ForeignKey('matches.id'), nullable=False)
    broadcaster_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    stream_key = db.Column(db.String(100), unique=True, nullable=False)
    camera_label = db.Column(db.String(100), default='Camera 1')
    is_active = db.Column(db.Boolean, default=True)
    viewer_count = db.Column(db.Integer, default=0)
    started_at = db.Column(db.DateTime, default=datetime.utcnow)
    ended_at = db.Column(db.DateTime, nullable=True)
    
    # Relationships
    match = db.relationship('Match', backref='livestreams')
    broadcaster = db.relationship('User', backref='broadcasts')
    
    def to_dict(self):
        return {
            'id': self.id,
            'match_id': self.match_id,
            'broadcaster_id': self.broadcaster_id,
            'broadcaster_name': self.broadcaster.name if self.broadcaster else 'Unknown',
            'stream_key': self.stream_key,
            'camera_label': self.camera_label,
            'is_active': self.is_active,
            'viewer_count': self.viewer_count,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'ended_at': self.ended_at.isoformat() if self.ended_at else None
        }
