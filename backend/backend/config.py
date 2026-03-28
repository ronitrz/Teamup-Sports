"""
TeamUp Sports Backend Configuration
"""
import os
from datetime import timedelta

class Config:
    """Base configuration"""
    SECRET_KEY = os.environ.get('SECRET_KEY', 'teamup-secret-key-change-in-production')
    
    # Switch to PostgreSQL instead of SQLite
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or \
        'postgresql://postgres:Ronit%402005@localhost:5433/teamup_sports'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # JWT Settings
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'jwt-secret-key-change-in-production')
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=24)
    
    # Upload Settings
    UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB max (base64 images are ~33% larger)
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
    
    # Email Verification Settings
    VERIFICATION_EXPIRY_MINUTES = 15
    BACKEND_URL = os.environ.get('BACKEND_URL', 'http://localhost:5000')
    
    # Email SMTP Settings (Gmail)
    MAIL_SERVER = 'smtp.gmail.com'
    MAIL_PORT = 587
    MAIL_USE_TLS = True
    MAIL_USERNAME = os.environ.get('MAIL_USERNAME', 'teamupsports1845@gmail.com')
    MAIL_PASSWORD = os.environ.get('MAIL_PASSWORD', 'gyazjrcmjdoxojil')
    MAIL_DEFAULT_SENDER = ('TeamUp Sports', 'teamupsports1845@gmail.com')
    
    # Google OAuth
    GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID', '386883098339-fdtebdvagjpavttg3lv2vhll7h6p7ok1.apps.googleusercontent.com')
    
    # CORS Settings
    CORS_ORIGINS = ['http://localhost:5500', 'http://127.0.0.1:5500', '*']


class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True


class ProductionConfig(Config):
    """Production configuration"""
    DEBUG = False


# Config mapping
config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}