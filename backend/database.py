"""
TeamUp Sports - Database Module
Separate db instance to avoid circular imports
"""
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()
