"""
Match Model - Database model for matches
"""
from datetime import datetime, timedelta
from database import db
import math


class Match(db.Model):
    """Match model for storing match data"""
    __tablename__ = 'matches'
    
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    sport = db.Column(db.String(50), nullable=False)
    description = db.Column(db.Text)
    
    # Venue information
    venue_name = db.Column(db.String(200), nullable=False)
    venue_address = db.Column(db.String(300))
    city = db.Column(db.String(100))
    latitude = db.Column(db.Float)
    longitude = db.Column(db.Float)
    
    # Date and time as single DateTime field
    date_time = db.Column(db.DateTime, nullable=False)
    
    # Player counts
    total_players = db.Column(db.Integer, nullable=False)
    current_players = db.Column(db.Integer, default=1)  # Captain counts as 1
    
    captain_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    
    players = db.Column(db.Text)  # Comma-separated user IDs
    
    skill_level = db.Column(db.String(20), default='all')  # beginner, intermediate, advanced, all
    contribution = db.Column(db.Float, default=0)  # Fee per player
    
    status = db.Column(db.String(20), default='open')  # open, full, live, cancelled, completed
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    join_requests = db.relationship('JoinRequest', backref='match', lazy='dynamic', cascade='all, delete-orphan')
    
    def get_players_list(self):
        """Get list of player IDs"""
        if not self.players:
            return [self.captain_id]  # Captain is always in
        player_ids = [int(x) for x in self.players.split(',') if x]
        if self.captain_id not in player_ids:
            player_ids.insert(0, self.captain_id)
        return player_ids
    
    def add_player(self, user_id):
        """Add a player to the match"""
        players = self.get_players_list()
        if user_id not in players:
            players.append(user_id)
            self.players = ','.join(map(str, players))
            self.current_players = len(players)
            if self.current_players >= self.total_players:
                self.status = 'full'
            db.session.commit()
            return True
        return False
    
    def remove_player(self, user_id):
        """Remove a player from the match"""
        players = self.get_players_list()
        if user_id in players and user_id != self.captain_id:
            players.remove(user_id)
            self.players = ','.join(map(str, players)) if players else None
            self.current_players = len(players)
            if self.current_players < self.total_players:
                self.status = 'open'
            db.session.commit()
            return True
        return False
    
    def get_spots_left(self):
        """Get number of spots left"""
        return max(0, self.total_players - self.current_players)
    
    # Alias for backwards compatibility
    def spots_left(self):
        return self.get_spots_left()
    
    @property
    def entries_closed(self):
        """Check if entries are closed (5 minutes before match start)"""
        if not self.date_time:
            return False
        now = datetime.utcnow()
        cutoff = self.date_time - timedelta(minutes=5)
        return now >= cutoff
    
    def update_status(self):
        """Update match status based on time and player count"""
        now = datetime.utcnow()
        
        if self.status == 'cancelled':
            return  # Don't change cancelled matches
        
        if self.date_time:
            match_end = self.date_time + timedelta(hours=2)
            
            if now >= match_end:
                self.status = 'completed'
            elif now >= self.date_time:
                self.status = 'live'
            elif self.current_players >= self.total_players:
                self.status = 'full'
            else:
                self.status = 'open'
        else:
            if self.current_players >= self.total_players:
                self.status = 'full'
            else:
                self.status = 'open'
        
        db.session.commit()
    
    def distance_from(self, lat, lng):
        """Calculate distance from given coordinates (Haversine formula)"""
        if not self.latitude or not self.longitude or not lat or not lng:
            return None
        
        R = 6371  # Earth's radius in km
        
        lat1 = math.radians(lat)
        lat2 = math.radians(self.latitude)
        dlat = math.radians(self.latitude - lat)
        dlng = math.radians(self.longitude - lng)
        
        a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng/2)**2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
        
        return round(R * c, 2)
    
    def to_dict(self, user_lat=None, user_lng=None, include_players=False):
        """Convert match to dictionary"""
        from models.user import User
        
        data = {
            'id': self.id,
            'title': self.title,
            'sport': self.sport,
            'description': self.description,
            'dateTime': self.date_time.isoformat() + 'Z' if self.date_time else None,
            'venueName': self.venue_name,
            'venueAddress': self.venue_address,
            'city': self.city,
            'location': {
                'name': self.venue_name,
                'address': self.venue_address,
                'city': self.city,
                'lat': self.latitude,
                'lng': self.longitude
            },
            'totalPlayers': self.total_players,
            'currentPlayers': self.current_players,
            'spotsLeft': self.get_spots_left(),
            'captainId': self.captain_id,
            'skillLevel': self.skill_level,
            'contribution': self.contribution,
            'status': self.status,
            'entriesClosed': self.entries_closed,
            'createdAt': self.created_at.isoformat() + 'Z' if self.created_at else None
        }
        
        # Include captain info
        captain = User.query.get(self.captain_id)
        if captain:
            data['captain'] = {
                'id': captain.id,
                'name': captain.name,
                'creditScore': captain.credit_score,
                'profilePicture': captain.profile_picture
            }
        
        # Include full player details if requested
        if include_players:
            player_ids = self.get_players_list()
            players = []
            for pid in player_ids:
                player = User.query.get(pid)
                if player:
                    players.append({
                        'id': player.id,
                        'name': player.name,
                        'creditScore': player.credit_score,
                        'profilePicture': player.profile_picture
                    })
            data['players'] = players
        else:
            data['playerIds'] = self.get_players_list()
        
        if user_lat and user_lng:
            data['distance'] = self.distance_from(user_lat, user_lng)
        
        return data
    
    def __repr__(self):
        return f'<Match {self.title}>'
