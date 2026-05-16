"""
OTP Model - Database model for One Time Passwords
"""
from datetime import datetime, timedelta, timezone
from database import db


class OTP(db.Model):
    """Stores verification codes for email/phone verification."""
    __tablename__ = 'otps'
    
    id = db.Column(db.Integer, primary_key=True)
    identifier = db.Column(db.String(120), nullable=False) # Email or Phone
    code = db.Column(db.String(10), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    expires_at = db.Column(db.DateTime, nullable=False)
    verified = db.Column(db.Boolean, default=False)
    
    def __init__(self, identifier, code, expires_in_minutes=5):
        self.identifier = identifier
        self.code = code
        self.expires_at = datetime.utcnow() + timedelta(minutes=expires_in_minutes)

    @property
    def is_expired(self):
        return datetime.utcnow() > self.expires_at

    def __repr__(self):
        return f'<OTP {self.identifier}>'
