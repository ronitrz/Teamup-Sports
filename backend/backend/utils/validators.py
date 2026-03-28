"""
Input Validators - Request validation utilities
Covers all edge cases for every field in the application.
"""
import re
from datetime import datetime, timezone, timedelta

# ─── Allowlists ───────────────────────────────────────────────────────────────

ALLOWED_SPORTS = {
    'cricket', 'football', 'basketball', 'badminton',
    'tennis', 'volleyball', 'hockey', 'kabaddi'
}

ALLOWED_SKILL_LEVELS = {'beginner', 'intermediate', 'advanced', 'all'}

# Max number of days in the future a match can be scheduled
MAX_MATCH_DAYS_FUTURE = 365

# ─── User Field Validators ────────────────────────────────────────────────────

def validate_email(email: str) -> bool:
    """Validate email format."""
    if not email or not isinstance(email, str):
        return False
    email = email.strip()
    if len(email) > 254:     # RFC 5321 limit
        return False
    pattern = r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$'
    return bool(re.match(pattern, email))


def validate_phone(phone: str) -> bool:
    """Validate Indian phone number (10 digits, starts with 6-9).
    Strips country code prefixes (+91 / 91) before checking."""
    if not phone or not isinstance(phone, str):
        return False
    phone = phone.strip()
    # Remove optional country code
    phone = re.sub(r'^(\+91|91)', '', phone).strip()
    pattern = r'^[6-9]\d{9}$'
    return bool(re.match(pattern, phone))


def normalize_phone(phone: str) -> str:
    """Return a normalized 10-digit Indian phone number."""
    if not phone:
        return phone
    phone = phone.strip()
    phone = re.sub(r'^(\+91|91)', '', phone).strip()
    return phone


def validate_password(password: str):
    """Validate password strength.
    Rules: min 8 chars, at least one digit, at least one special character.
    Returns (bool, error_message_or_None).
    """
    if not password or not isinstance(password, str):
        return False, 'Password is required'
    if len(password) < 8:
        return False, 'Password must be at least 8 characters'
    if len(password) > 128:
        return False, 'Password must be at most 128 characters'
    if not re.search(r'\d', password):
        return False, 'Password must contain at least one digit'
    if not re.search(r'[!@#$%^&*(),.?":{}|<>_\-\[\]\\\/\']', password):
        return False, 'Password must contain at least one special character'
    return True, None


def validate_name(name: str):
    """Validate display name.
    Allows letters, spaces, hyphens, apostrophes. Block numeric-only strings.
    Returns (bool, error_message_or_None).
    """
    if not name or not isinstance(name, str):
        return False, 'Name is required'
    name = name.strip()
    if len(name) < 2:
        return False, 'Name must be at least 2 characters'
    if len(name) > 100:
        return False, 'Name must be at most 100 characters'
    if re.match(r'^[\d\s]+$', name):
        return False, 'Name cannot be purely numeric'
    if not re.match(r"^[a-zA-Z\u00C0-\u024F\s'\-\.]+$", name):
        return False, 'Name contains invalid characters'
    return True, None


def validate_sport(sport: str):
    """Validate sport against the allowed whitelist.
    Returns (bool, error_message_or_None).
    """
    if not sport or not isinstance(sport, str):
        return False, 'Sport is required'
    if sport.strip().lower() not in ALLOWED_SPORTS:
        return False, f"Invalid sport. Allowed: {', '.join(sorted(ALLOWED_SPORTS))}"
    return True, None


def validate_skill_level(level: str):
    """Validate skill level. Returns (bool, error_message_or_None)."""
    if not level:
        return True, None  # Optional field, defaults to 'all'
    if level.strip().lower() not in ALLOWED_SKILL_LEVELS:
        return False, f"Invalid skill level. Allowed: {', '.join(sorted(ALLOWED_SKILL_LEVELS))}"
    return True, None


def validate_coords(lat, lng):
    """Validate latitude/longitude ranges.
    Returns (bool, error_message_or_None).
    """
    if lat is None and lng is None:
        return True, None  # Both absent is OK (optional)
    if lat is None or lng is None:
        return False, 'Both latitude and longitude must be provided together'
    try:
        lat = float(lat)
        lng = float(lng)
    except (TypeError, ValueError):
        return False, 'Latitude and longitude must be numbers'
    if not (-90 <= lat <= 90):
        return False, 'Latitude must be between -90 and 90'
    if not (-180 <= lng <= 180):
        return False, 'Longitude must be between -180 and 180'
    return True, None


# ─── Match Validators ─────────────────────────────────────────────────────────

def validate_future_datetime(dt_string: str, max_days: int = MAX_MATCH_DAYS_FUTURE):
    """Parse and validate that a datetime string is in the future,
    and not more than max_days from now.
    Returns (datetime_obj_or_None, error_message_or_None).
    """
    if not dt_string:
        return None, 'Date and time is required'
    try:
        dt = datetime.fromisoformat(dt_string.replace('Z', '+00:00'))
        # Make timezone-aware if naive
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
    except (ValueError, AttributeError):
        return None, 'Invalid date/time format. Use ISO 8601 (e.g. 2026-06-01T14:00:00Z)'

    now = datetime.now(timezone.utc)
    if dt <= now:
        return None, 'Match date and time must be in the future'
    if dt > now + timedelta(days=max_days):
        return None, f'Match cannot be scheduled more than {max_days} days in the future'
    return dt, None


def validate_match_data(data: dict):
    """Validate all fields for match creation / update.
    Returns (bool, list_of_errors).
    """
    errors = []

    # Sport
    valid, err = validate_sport(data.get('sport', ''))
    if not valid:
        errors.append(err)

    # Title
    title = data.get('title', '')
    if not title or not title.strip():
        errors.append('Title is required')
    elif len(title.strip()) < 3:
        errors.append('Title must be at least 3 characters')
    elif len(title) > 200:
        errors.append('Title must be at most 200 characters')

    # Description (optional)
    desc = data.get('description', '')
    if desc and len(desc) > 1000:
        errors.append('Description must be at most 1000 characters')

    # Venue name
    venue = data.get('venueName', '')
    if not venue or not venue.strip():
        errors.append('Venue name is required')
    elif len(venue) > 200:
        errors.append('Venue name must be at most 200 characters')

    # Venue address (optional)
    venue_addr = data.get('venueAddress', '')
    if venue_addr and len(venue_addr) > 300:
        errors.append('Venue address must be at most 300 characters')

    # DateTime
    _, dt_err = validate_future_datetime(data.get('dateTime'))
    if dt_err:
        errors.append(dt_err)

    # Total players
    total_players = data.get('totalPlayers')
    if total_players is None:
        errors.append('Total players is required')
    else:
        try:
            tp = int(total_players)
            if tp < 2:
                errors.append('Total players must be at least 2')
            elif tp > 50:
                errors.append('Total players cannot exceed 50')
        except (TypeError, ValueError):
            errors.append('Total players must be a valid integer')

    # Contribution (optional, default 0)
    contribution = data.get('contribution')
    if contribution is not None:
        try:
            cv = float(contribution)
            if cv < 0:
                errors.append('Contribution cannot be negative')
            elif cv > 50000:
                errors.append('Contribution cannot exceed ₹50,000')
        except (TypeError, ValueError):
            errors.append('Contribution must be a valid number')

    # Skill level (optional)
    valid, err = validate_skill_level(data.get('skillLevel', 'all'))
    if not valid:
        errors.append(err)

    # Coordinates (optional but must be valid if provided)
    valid, err = validate_coords(data.get('latitude'), data.get('longitude'))
    if not valid:
        errors.append(err)

    return len(errors) == 0, errors


def validate_profile_update(data: dict):
    """Validate fields for profile update.
    Returns (bool, list_of_errors).
    """
    errors = []

    if 'name' in data:
        valid, err = validate_name(data['name'])
        if not valid:
            errors.append(err)

    if 'sports' in data:
        sports = data['sports']
        if not isinstance(sports, list):
            errors.append('Sports must be a list')
        else:
            for s in sports:
                if not isinstance(s, str) or s.strip().lower() not in ALLOWED_SPORTS:
                    errors.append(f"Invalid sport '{s}'. Allowed: {', '.join(sorted(ALLOWED_SPORTS))}")
                    break

    return len(errors) == 0, errors
