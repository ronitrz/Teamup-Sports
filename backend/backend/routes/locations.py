"""
Location Routes - Country/State/City dropdown data via CountriesNow API
Edge cases covered:
  - Input sanitization to prevent SSRF-style injection
  - Cache size cap to prevent memory exhaustion
  - Built-in Indian states fallback when API is unavailable
  - Cache-Control response headers
  - Proper error responses for missing required params
"""
import re
import requests as http_requests
from flask import Blueprint, request, jsonify, Response

locations_bp = Blueprint('locations', __name__)

# ─── In-memory cache ──────────────────────────────────────────────────────────
_cache: dict = {}
_MAX_CACHE_ENTRIES = 500   # Prevent unbounded memory growth

# ─── Fallback data ────────────────────────────────────────────────────────────
_INDIA_STATES = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
    'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
    'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
    'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
    'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
    'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry'
]

# ─── Helper ───────────────────────────────────────────────────────────────────

def _sanitize_location_input(value: str, max_len: int = 100) -> str | None:
    """Sanitize a location string to prevent injection.
    Only allows letters, spaces, hyphens, apostrophes, and parentheses.
    Returns the sanitized string, or None if the input is invalid/empty.
    """
    if not value or not isinstance(value, str):
        return None
    value = value.strip()[:max_len]
    if not value:
        return None
    # Allow unicode letters for international names
    if not re.match(r"^[\w\s'\-\(\)\.]+$", value, re.UNICODE):
        return None
    return value


def _cache_set(key: str, value):
    """Store in cache, evicting oldest entry if at capacity."""
    if len(_cache) >= _MAX_CACHE_ENTRIES:
        try:
            oldest_key = next(iter(_cache))
            del _cache[oldest_key]
        except StopIteration:
            pass
    _cache[key] = value


def _json_cached(data, max_age: int = 3600):
    """Return a JSON response with a Cache-Control header."""
    resp = jsonify(data)
    resp.headers['Cache-Control'] = f'public, max-age={max_age}'
    return resp


# ─── Countries ────────────────────────────────────────────────────────────────

@locations_bp.route('/countries', methods=['GET'])
def get_countries():
    """Get a sorted list of all country names."""
    if 'countries' in _cache:
        return _json_cached({'countries': _cache['countries']})

    try:
        resp = http_requests.get(
            'https://countriesnow.space/api/v0.1/countries',
            timeout=8
        )
        resp.raise_for_status()
        data = resp.json()

        if data.get('error') or not data.get('data'):
            raise ValueError('Empty or error response from API')

        countries = sorted(set(item['country'] for item in data['data'] if item.get('country')))
        _cache_set('countries', countries)
        return _json_cached({'countries': countries})

    except Exception:
        # Fallback: just 'India' is guaranteed
        return _json_cached({'countries': ['India']})


# ─── States ───────────────────────────────────────────────────────────────────

@locations_bp.route('/states', methods=['GET'])
def get_states():
    """Get a sorted list of states/provinces for a country."""
    country_raw = request.args.get('country', '')
    country = _sanitize_location_input(country_raw)

    if not country:
        return jsonify({'error': 'country parameter is required and must be a valid name', 'code': 'MISSING_COUNTRY'}), 400

    cache_key = f'states_{country.lower()}'
    if cache_key in _cache:
        return _json_cached({'states': _cache[cache_key]})

    try:
        resp = http_requests.post(
            'https://countriesnow.space/api/v0.1/countries/states',
            json={'country': country},
            timeout=8
        )
        resp.raise_for_status()
        data = resp.json()

        if data.get('error') or not data.get('data'):
            raise ValueError('Empty or error response from API')

        states = sorted(s['name'] for s in data['data'].get('states', []) if s.get('name'))
        _cache_set(cache_key, states)
        return _json_cached({'states': states})

    except Exception:
        # Fallback for India
        if country.lower() == 'india':
            return _json_cached({'states': _INDIA_STATES})
        return _json_cached({'states': []})


# ─── Cities ───────────────────────────────────────────────────────────────────

@locations_bp.route('/cities', methods=['GET'])
def get_cities():
    """Get a sorted list of cities for a state within a country."""
    country_raw = request.args.get('country', '')
    state_raw   = request.args.get('state', '')

    country = _sanitize_location_input(country_raw)
    state   = _sanitize_location_input(state_raw)

    if not country:
        return jsonify({'error': 'country parameter is required and must be a valid name', 'code': 'MISSING_COUNTRY'}), 400
    if not state:
        return jsonify({'error': 'state parameter is required and must be a valid name', 'code': 'MISSING_STATE'}), 400

    cache_key = f'cities_{country.lower()}_{state.lower()}'
    if cache_key in _cache:
        return _json_cached({'cities': _cache[cache_key]})

    try:
        resp = http_requests.post(
            'https://countriesnow.space/api/v0.1/countries/state/cities',
            json={'country': country, 'state': state},
            timeout=8
        )
        resp.raise_for_status()
        data = resp.json()

        if data.get('error') or not data.get('data'):
            raise ValueError('Empty or error response from API')

        cities = sorted(c for c in data['data'] if c)
        _cache_set(cache_key, cities)
        return _json_cached({'cities': cities})

    except Exception:
        return _json_cached({'cities': []})
