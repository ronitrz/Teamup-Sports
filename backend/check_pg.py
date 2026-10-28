from app import create_app
from database import db
from models.match import Match

app = create_app()
with app.app_context():
    matches = Match.query.order_by(Match.id.desc()).limit(5).all()
    with open("out.txt", "w", encoding="utf-8") as f:
        for m in matches:
            f.write(f"ID: {m.id}, Title: {m.title}, DateTime: {m.date_time}, Status: {m.status}\n")