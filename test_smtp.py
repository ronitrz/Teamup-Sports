import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

def test_smtp():
    sender_email = 'teamupsports1845@gmail.com'
    sender_password = 'dwkiikbsphdvmxnu'
    smtp_server = 'smtp.gmail.com'
    smtp_port = 587
    to_email = 'hchamant6969@gmail.com'

    try:
        msg = MIMEMultipart('alternative')
        msg['Subject'] = 'SMTP Test'
        msg['From'] = f"TeamUP Sports <{sender_email}>"
        msg['To'] = to_email

        msg.attach(MIMEText("This is a test message.", 'html'))

        print(f"Connecting to {smtp_server}:{smtp_port}...")
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.set_debuglevel(1)
            server.starttls()
            print("Logging in...")
            server.login(sender_email, sender_password)
            print("Sending message...")
            server.send_message(msg)
            
        print(f"✅ Real email successfully sent to {to_email} via SMTP")
    except Exception as e:
        print(f"❌ Failed to send SMTP email: {e}")

if __name__ == "__main__":
    test_smtp()
