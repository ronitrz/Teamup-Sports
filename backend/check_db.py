import sqlite3

conn = sqlite3.connect('instance/teamup.db')
c = conn.cursor()
c.execute("SELECT id, title, date_time, status, created_at FROM matches ORDER BY id DESC LIMIT 5")
for row in c.fetchall():
    print(row)
conn.close()
