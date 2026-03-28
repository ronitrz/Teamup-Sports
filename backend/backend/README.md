# TeamUp Sports - Python Backend

A Flask-based REST API for the TeamUp Sports platform.

## Setup

### 1. Create Virtual Environment
```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate

# Linux/Mac
source venv/bin/activate
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Run the Server
```bash
python app.py
```

The API will be available at `http://localhost:5000`

## API Endpoints

### Health Check
- `GET /api/health` - Check if API is running

### Authentication
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Login (returns JWT)
- `POST /api/auth/send-otp` - Send OTP
- `POST /api/auth/verify-otp` - Verify OTP
- `GET /api/auth/me` - Get current user

### Users
- `GET /api/users/me` - Get profile
- `PUT /api/users/me` - Update profile
- `POST /api/users/me/picture` - Upload picture
- `GET /api/users/me/history` - Match history
- `GET /api/users/<id>` - Public profile

### Matches
- `GET /api/matches` - List matches (with filters)
- `POST /api/matches` - Create match
- `GET /api/matches/<id>` - Match details
- `PUT /api/matches/<id>` - Update match
- `DELETE /api/matches/<id>` - Delete match
- `POST /api/matches/<id>/join` - Request to join
- `GET /api/matches/<id>/requests` - View requests

### Join Requests
- `GET /api/requests/my` - My requests
- `PUT /api/requests/<id>/approve` - Approve
- `PUT /api/requests/<id>/reject` - Reject
- `DELETE /api/requests/<id>/cancel` - Cancel

## Demo OTP
Use code `123456` for OTP verification.

## Database
SQLite database is created automatically as `teamup.db`.
