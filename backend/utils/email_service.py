"""
Email Service - Send verification emails via Gmail SMTP
"""
import smtplib
import uuid
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta
from flask import current_app


def generate_verification_token():
    """Generate a secure URL-safe verification token"""
    return str(uuid.uuid4())


def send_verification_email(to_email, token, purpose='register'):
    """Send verification link email via Gmail SMTP"""
    try:
        smtp_server = current_app.config['MAIL_SERVER']
        smtp_port = current_app.config['MAIL_PORT']
        username = current_app.config['MAIL_USERNAME']
        password = current_app.config['MAIL_PASSWORD']
        sender_name, sender_email = current_app.config['MAIL_DEFAULT_SENDER']
        backend_url = current_app.config.get('BACKEND_URL', 'http://127.0.0.1:5000')

        verify_link = f"{backend_url}/api/auth/verify-email/{token}"

        msg = MIMEMultipart('alternative')
        msg['Subject'] = '✉️ Verify your email — TeamUp Sports'
        msg['From'] = f'{sender_name} <{sender_email}>'
        msg['To'] = to_email

        purpose_text = {
            'register': 'complete your registration',
            'login': 'log in to your account',
            'reset': 'reset your password'
        }.get(purpose, 'verify your account')

        text = f"""
Hello!

Click this link to {purpose_text} on TeamUp Sports:

{verify_link}

This link expires in 15 minutes.

If you didn't request this, please ignore this email.

- TeamUp Sports Team
        """

        html = f"""
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0a0a0f; color: #ffffff; }}
        .container {{ max-width: 500px; margin: 0 auto; padding: 40px 20px; }}
        .header {{ text-align: center; margin-bottom: 30px; }}
        .logo {{ font-size: 24px; font-weight: bold; color: #8b5cf6; }}
        .btn-box {{ text-align: center; margin: 30px 0; }}
        .verify-btn {{ display: inline-block; background: linear-gradient(135deg, #8b5cf6 0%, #22d3ee 100%); color: white; text-decoration: none; padding: 16px 48px; border-radius: 12px; font-size: 18px; font-weight: bold; }}
        .message {{ color: #a1a1aa; line-height: 1.6; }}
        .link {{ color: #8b5cf6; word-break: break-all; }}
        .expiry {{ color: #fbbf24; font-size: 14px; margin-top: 20px; text-align: center; }}
        .footer {{ text-align: center; color: #71717a; font-size: 12px; margin-top: 40px; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">⚽ TeamUp Sports</div>
        </div>

        <p class="message">Hello! Click the button below to {purpose_text}:</p>

        <div class="btn-box">
            <a href="{verify_link}" class="verify-btn">✅ Verify My Email</a>
        </div>

        <p class="expiry">⏰ This link expires in 15 minutes</p>

        <p class="message" style="font-size: 0.85em;">Or copy this link:<br><a href="{verify_link}" class="link">{verify_link}</a></p>

        <p class="message">If you didn't request this, you can safely ignore this email.</p>

        <div class="footer">
            <p>&copy; 2024 TeamUp Sports. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
        """

        msg.attach(MIMEText(text, 'plain'))
        msg.attach(MIMEText(html, 'html'))

        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(username, password)
            server.send_message(msg)

        return True, 'Verification email sent'

    except smtplib.SMTPAuthenticationError:
        return False, 'Email authentication failed. Check credentials.'
    except smtplib.SMTPException as e:
        return False, f'Failed to send email: {str(e)}'
    except Exception as e:
        return False, f'Error: {str(e)}'


def send_otp_email(to_email, otp_code, purpose='register'):
    """Send OTP code email via Gmail SMTP"""
    try:
        smtp_server = current_app.config['MAIL_SERVER']
        smtp_port = current_app.config['MAIL_PORT']
        username = current_app.config['MAIL_USERNAME']
        password = current_app.config['MAIL_PASSWORD']
        sender_name, sender_email = current_app.config['MAIL_DEFAULT_SENDER']

        print(f"\n📧 Attempting to send email...")
        print(f"   SMTP Server: {smtp_server}:{smtp_port}")
        print(f"   From: {sender_email}")
        print(f"   To: {to_email}")
        print(f"   Username: {username}")
        print(f"   Password: {'*' * len(password) if password else 'NOT SET'}")

        purpose_text = {
            'register': 'complete your registration',
            'login': 'log in to your account',
            'reset': 'reset your password'
        }.get(purpose, 'verify your account')

        msg = MIMEMultipart('alternative')
        msg['Subject'] = f'🔐 Your OTP Code: {otp_code} — TeamUp Sports'
        msg['From'] = f'{sender_name} <{sender_email}>'
        msg['To'] = to_email

        text = f"""
Hello!

Your OTP code to {purpose_text} on TeamUp Sports is:

{otp_code}

This code expires in 5 minutes. Do not share it with anyone.

If you didn't request this, please ignore this email.

- TeamUp Sports Team
        """

        # Create styled digit boxes for the OTP
        otp_digits_html = ''.join([
            f'<span style="display:inline-block;width:48px;height:56px;line-height:56px;'
            f'text-align:center;font-size:28px;font-weight:bold;color:#fff;'
            f'background:rgba(139,92,246,0.2);border:2px solid rgba(139,92,246,0.5);'
            f'border-radius:12px;margin:0 4px;">{d}</span>'
            for d in otp_code
        ])

        html = f"""
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0a0a0f; color: #ffffff; }}
        .container {{ max-width: 500px; margin: 0 auto; padding: 40px 20px; }}
        .header {{ text-align: center; margin-bottom: 30px; }}
        .logo {{ font-size: 24px; font-weight: bold; color: #8b5cf6; }}
        .otp-box {{ text-align: center; margin: 30px 0; padding: 30px; background: rgba(26,26,37,0.9); border-radius: 16px; border: 1px solid rgba(139,92,246,0.3); }}
        .otp-label {{ color: #a1a1aa; font-size: 14px; margin-bottom: 16px; }}
        .message {{ color: #a1a1aa; line-height: 1.6; }}
        .expiry {{ color: #fbbf24; font-size: 14px; margin-top: 20px; text-align: center; }}
        .footer {{ text-align: center; color: #71717a; font-size: 12px; margin-top: 40px; }}
        .warning {{ color: #ef4444; font-size: 13px; text-align: center; margin-top: 15px; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">⚽ TeamUp Sports</div>
        </div>

        <p class="message">Hello! Use the code below to {purpose_text}:</p>

        <div class="otp-box">
            <div class="otp-label">Your verification code</div>
            {otp_digits_html}
        </div>

        <p class="expiry">⏰ This code expires in 5 minutes</p>
        <p class="warning">⚠️ Never share this code with anyone</p>

        <p class="message">If you didn't request this, you can safely ignore this email.</p>

        <div class="footer">
            <p>&copy; 2024 TeamUp Sports. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
        """

        msg.attach(MIMEText(text, 'plain'))
        msg.attach(MIMEText(html, 'html'))

        print(f"   Connecting to SMTP server...")
        with smtplib.SMTP(smtp_server, smtp_port, timeout=10) as server:
            print(f"   Starting TLS...")
            server.starttls()
            print(f"   Logging in...")
            server.login(username, password)
            print(f"   Sending message...")
            server.send_message(msg)
            print(f"✅ Email sent successfully to {to_email}\n")

        return True, 'OTP sent successfully'

    except smtplib.SMTPAuthenticationError as e:
        error_msg = f'Email authentication failed: {str(e)}'
        print(f"❌ {error_msg}\n")
        return False, error_msg
    except smtplib.SMTPException as e:
        error_msg = f'SMTP error: {str(e)}'
        print(f"❌ {error_msg}\n")
        return False, error_msg
    except Exception as e:
        error_msg = f'Unexpected error: {str(e)}'
        print(f"❌ {error_msg}\n")
        return False, error_msg


    return True, 'OTP sent successfully'
