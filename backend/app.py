"""
TeamUp Sports - Flask Backend Entry Point
"""
import os

# Load .env FIRST before any other imports so DATABASE_URL etc. are in os.environ
# when config.py evaluates class-level os.environ.get() calls
from dotenv import load_dotenv
load_dotenv()

from flask import Flask, jsonify
from flask_cors import CORS

from database import db
from config import config


def create_app(config_name='default'):
    """Application factory"""
    app = Flask(__name__)
    # Force reload
    
    # Load config
    app.config.from_object(config[config_name])
    
    # Initialize extensions
    db.init_app(app)
    CORS(app, origins=app.config['CORS_ORIGINS'], supports_credentials=True)
    
    # Initialize SocketIO for live streaming
    from socketio_server import init_socketio
    socketio = init_socketio(app)
    app.socketio = socketio
    
    # Create upload folder
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    
    # Register blueprints
    from routes.auth import auth_bp
    from routes.users import users_bp
    from routes.matches import matches_bp
    from routes.requests import requests_bp
    from routes.locations import locations_bp
    from routes.livestream import livestream_bp
    
    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(users_bp, url_prefix='/api/users')
    app.register_blueprint(matches_bp, url_prefix='/api/matches')
    app.register_blueprint(requests_bp, url_prefix='/api/requests')
    app.register_blueprint(locations_bp, url_prefix='/api/locations')
    app.register_blueprint(livestream_bp, url_prefix='/api/livestream')
    
    # Health check endpoint
    @app.route('/')
    @app.route('/api/health')
    def health_check():
        return {'status': 'healthy', 'message': 'TeamUp Sports API - SYNCED V5'}
        
    @app.route('/api/db_test')
    def db_test():
        return {'uri': app.config.get('SQLALCHEMY_DATABASE_URI')}

    # Error handler for request too large
    @app.errorhandler(413)
    def request_entity_too_large(error):
        return jsonify({'error': 'File too large. Maximum size is 16MB.'}), 413

    # General error handler for production debugging
    from werkzeug.exceptions import HTTPException
    @app.errorhandler(Exception)
    def handle_exception(e):
        # Pass through HTTP errors (like 404) so they return their intended status code
        if isinstance(e, HTTPException):
            return e

        app.logger.error(f"Unhandled Exception: {str(e)}")
        # In production, don't leak details, but return a clearer message if it's a DB issue
        if "psycopg2" in str(e) or "SQLAlchemy" in str(e):
            return jsonify({'error': 'Database connection error. Please check backend logs.'}), 500
        return jsonify({'error': 'An internal server error occurred.'}), 500

    # Platform stats endpoint
    @app.route('/api/stats')
    def platform_stats():
        from models.user import User
        from models.match import Match
        from datetime import datetime, timedelta
        from sqlalchemy import func

        total_users = User.query.count()
        total_matches = Match.query.count()

        # Today's matches
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        today_end = today_start + timedelta(days=1)
        today_matches = Match.query.filter(
            Match.date_time >= today_start,
            Match.date_time < today_end
        ).count()

        # Unique sports
        unique_sports = db.session.query(func.count(func.distinct(Match.sport))).scalar() or 0

        return {
            'totalUsers': total_users,
            'totalMatches': total_matches,
            'todayMatches': today_matches,
            'uniqueSports': unique_sports
        }
    
    # Create database tables
    with app.app_context():
        # Import models to register them
        from models.user import User
        from models.match import Match
        from models.request import JoinRequest, MatchHistory
        from models.livestream import LiveStream
        try:
            db.create_all()
            app.logger.info('Database tables created/verified successfully.')
        except Exception as e:
            app.logger.warning(f'Could not create DB tables (DB may be unreachable): {e}')
    
    return app


# Run the app
if __name__ == '__main__':
    app = create_app(os.environ.get('FLASK_ENV', 'development'))
    # Disable .env loading to avoid encoding issues
    app.config['ENV'] = 'development'
    # Use SocketIO's run method instead of app.run for WebSocket support
    app.socketio.run(app, host='0.0.0.0', port=5000, debug=True, allow_unsafe_werkzeug=True, load_dotenv=False)
