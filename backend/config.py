"""
TeamUp Sports Backend Configuration
"""
import os
from datetime import timedelta

class Config:
    """Base configuration"""
    SECRET_KEY = os.environ.get('SECRET_KEY', 'teamup-secret-key-change-in-production')
    
    # Database - Using PostgreSQL
    # Fix for Supabase/Render which provide postgres:// instead of postgresql://
    _db_url = os.environ.get('DATABASE_URL') or \
        'postgresql://postgres:Rishi%402005@localhost:5432/TeamUP_Sports'
    
    # Ensure production URLs use sslmode=require
    if _db_url and 'localhost' not in _db_url and 'sslmode' not in _db_url:
        separator = '&' if '?' in _db_url else '?'
        _db_url += f'{separator}sslmode=require'
        
    # Force psycopg2 driver by using postgresql+psycopg2:// scheme
    _db_url_fixed = _db_url.replace('postgres://', 'postgresql://', 1) if _db_url.startswith('postgres://') else _db_url
    SQLALCHEMY_DATABASE_URI = _db_url_fixed.replace('postgresql://', 'postgresql+psycopg2://', 1) if _db_url_fixed.startswith('postgresql://') else _db_url_fixed
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
    MAIL_PASSWORD = os.environ.get('MAIL_PASSWORD', 'dwkiikbsphdvmxnu')
    MAIL_DEFAULT_SENDER = ('TeamUp Sports', 'teamupsports1845@gmail.com')
    
    # Google OAuth
    GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID', '386883098339-fdtebdvagjpavttg3lv2vhll7h6p7ok1.apps.googleusercontent.com')
    
    # CORS Settings — add FRONTEND_URL env var on Render to restrict in production
    _frontend_url = os.environ.get('FRONTEND_URL', '')
    CORS_ORIGINS = [
        'http://localhost:3000',
        'http://localhost:5500',
        'http://127.0.0.1:5500',
        'http://localhost:8080',
        'http://127.0.0.1:8080',
        'https://teamup-sports.netlify.app',
        'https://teamup-sports.netlify.app/',
        *([_frontend_url] if _frontend_url else [])
    ]
    # If no specific frontend URL and no specific origins, fallback to * is risky with credentials
    if not CORS_ORIGINS:
        CORS_ORIGINS = ['*']


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