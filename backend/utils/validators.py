"""
Input Validators - Request validation utilities
"""
import re


def validate_email(email):
    """Validate email format"""
    if not email:
        return False
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return bool(re.match(pattern, email))


def validate_phone(phone):
    """Validate Indian phone number format"""
    if not phone:
        return False
    # Indian phone: 10 digits starting with 6-9
    pattern = r'^[6-9]\d{9}$'
    return bool(re.match(pattern, phone))


def validate_password(password):
    """Validate password strength"""
    if not password or len(password) < 6:
        return False, 'Password must be at least 6 characters'
    return True, None


def validate_name(name):
    """Validate name format"""
    if not name or len(name) < 2:
        return False, 'Name must be at least 2 characters'
    if len(name) > 100:
        return False, 'Name must be less than 100 characters'
    return True, None


def validate_match_data(data):
    """Validate match creation data"""
    errors = []
    
    if not data.get('sport'):
        errors.append('Sport is required')
    
    if not data.get('title'):
        errors.append('Title is required')
    
    if not data.get('venueName'):
        errors.append('Venue name is required')
    
    if not data.get('dateTime'):
        errors.append('Date and time is required')
    
    if not data.get('totalPlayers') or data.get('totalPlayers') < 2:
        errors.append('Total players must be at least 2')
    
    return len(errors) == 0, errors
