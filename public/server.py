#!/usr/bin/env python3
import os
import json
import base64
import uuid
import hashlib
import threading
import time
from datetime import datetime, timedelta
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from flask import Flask, send_from_directory, request, jsonify, Response
import requests
from anthropic import Anthropic
import psycopg2
from psycopg2.extras import RealDictCursor
import pyotp
import qrcode
import io
import secrets
from cryptography.fernet import Fernet
from metrics_etl import metrics_cache, init_metrics

app = Flask(__name__, static_folder=None)

SCHEDULER_INTERVAL = 60

# Database connection
DATABASE_URL = os.environ.get("DATABASE_URL")

# Encryption key for TOTP secrets - derived from a secret or generated
def get_encryption_key():
    """Get or generate encryption key for TOTP secrets"""
    key_env = os.environ.get('TOTP_ENCRYPTION_KEY')
    if key_env:
        return key_env.encode()
    # Derive a key from DATABASE_URL if no explicit key (for backwards compatibility)
    # In production, set TOTP_ENCRYPTION_KEY as a proper Fernet key
    if DATABASE_URL:
        key_material = hashlib.sha256(DATABASE_URL.encode()).digest()
        return base64.urlsafe_b64encode(key_material)
    return Fernet.generate_key()

ENCRYPTION_KEY = get_encryption_key()
_fernet = Fernet(ENCRYPTION_KEY)

def encrypt_totp_secret(secret):
    """Encrypt TOTP secret for database storage"""
    if not secret:
        return None
    return _fernet.encrypt(secret.encode()).decode()

def decrypt_totp_secret(encrypted_secret):
    """Decrypt TOTP secret from database"""
    if not encrypted_secret:
        return None
    try:
        return _fernet.decrypt(encrypted_secret.encode()).decode()
    except Exception:
        # Fallback for unencrypted secrets (migration period)
        if len(encrypted_secret) == 32 and encrypted_secret.isalnum():
            return encrypted_secret
        return None

def get_db_connection():
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)

def hash_password(password):
    """Hash password using bcrypt for secure storage"""
    import bcrypt
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password, password_hash):
    """Verify password against bcrypt hash, with fallback for SHA-256"""
    import bcrypt
    try:
        # Try bcrypt first
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except (ValueError, AttributeError):
        # Fallback to SHA-256 for legacy hashes
        legacy_hash = hashlib.sha256(password.encode()).hexdigest()
        return password_hash == legacy_hash

def verify_password_with_rehash(password, password_hash):
    """Verify password and indicate if rehash is needed for legacy hashes"""
    import bcrypt
    try:
        # Try bcrypt first
        if bcrypt.checkpw(password.encode(), password_hash.encode()):
            return True, False  # Valid, no rehash needed
        return False, False  # Invalid
    except (ValueError, AttributeError):
        # Fallback to SHA-256 for legacy hashes
        legacy_hash = hashlib.sha256(password.encode()).hexdigest()
        if password_hash == legacy_hash:
            return True, True  # Valid, needs rehash to bcrypt
        return False, False  # Invalid

def init_database():
    """Initialize database tables and seed default users, roles, and permissions"""
    if not DATABASE_URL:
        print("No DATABASE_URL found, skipping database initialization")
        return
    
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Create roles table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS roles (
                id SERIAL PRIMARY KEY,
                name VARCHAR(50) UNIQUE NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Create permissions table (page-level access)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS permissions (
                id SERIAL PRIMARY KEY,
                page_key VARCHAR(50) UNIQUE NOT NULL,
                page_name VARCHAR(100) NOT NULL,
                description TEXT
            )
        """)
        
        # Create role_permissions junction table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS role_permissions (
                role_id INTEGER REFERENCES roles(id) ON DELETE CASCADE,
                permission_id INTEGER REFERENCES permissions(id) ON DELETE CASCADE,
                PRIMARY KEY (role_id, permission_id)
            )
        """)
        
        # Create users table with role and status fields
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                display_name VARCHAR(100) NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                role_id INTEGER REFERENCES roles(id),
                is_active BOOLEAN DEFAULT TRUE,
                last_login TIMESTAMP,
                created_by INTEGER REFERENCES users(id),
                password_reset_token VARCHAR(255),
                password_reset_expires TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Add new columns to users if they don't exist (for existing installations)
        new_columns = [
            ("role_id", "INTEGER REFERENCES roles(id)"),
            ("is_active", "BOOLEAN DEFAULT TRUE"),
            ("last_login", "TIMESTAMP"),
            ("created_by", "INTEGER REFERENCES users(id)"),
            ("password_reset_token", "VARCHAR(255)"),
            ("password_reset_expires", "TIMESTAMP"),
            ("two_factor_enabled", "BOOLEAN DEFAULT FALSE"),
            ("two_factor_secret", "TEXT"),
            ("two_factor_confirmed_at", "TIMESTAMP")
        ]
        for col_name, col_def in new_columns:
            try:
                cur.execute(f"ALTER TABLE users ADD COLUMN IF NOT EXISTS {col_name} {col_def}")
            except:
                pass
        
        # Create sessions table with IP tracking
        cur.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                token VARCHAR(255) UNIQUE NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                ip_address VARCHAR(45),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Add ip_address column if it doesn't exist
        try:
            cur.execute("ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45)")
        except:
            pass
        
        # Create audit_log table with enhanced structure
        cur.execute("""
            CREATE TABLE IF NOT EXISTS audit_log (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                action VARCHAR(100) NOT NULL,
                target_type VARCHAR(50),
                target_id INTEGER,
                details JSONB,
                ip_address VARCHAR(45),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Add enhanced audit log columns for structured logging
        enhanced_audit_columns = [
            ("category", "VARCHAR(50) DEFAULT 'general'"),
            ("severity", "VARCHAR(20) DEFAULT 'info'"),
            ("user_agent", "TEXT"),
            ("session_id", "VARCHAR(255)"),
            ("result", "VARCHAR(20) DEFAULT 'success'")
        ]
        for col_name, col_def in enhanced_audit_columns:
            try:
                cur.execute(f"ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS {col_name} {col_def}")
            except:
                pass
        
        # Create scheduled_reports table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS scheduled_reports (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                report_type VARCHAR(50) NOT NULL,
                report_name VARCHAR(100) NOT NULL,
                view_config JSONB NOT NULL,
                recipients TEXT[] NOT NULL,
                frequency VARCHAR(20) NOT NULL,
                day_of_week INTEGER,
                day_of_month INTEGER,
                send_time TIME DEFAULT '08:00',
                is_active BOOLEAN DEFAULT TRUE,
                last_sent_at TIMESTAMP,
                next_send_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Create backup_codes table for 2FA recovery
        cur.execute("""
            CREATE TABLE IF NOT EXISTS backup_codes (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                code_hash VARCHAR(255) NOT NULL,
                used BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Create password_reset_tokens table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                token_hash VARCHAR(255) NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                used BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Seed default roles
        default_roles = [
            ('admin', 'Full access to all features including user management'),
            ('manager', 'Access to all dashboard pages but not admin functions'),
            ('project_manager', 'Access to job reports and payments')
        ]
        for role_name, description in default_roles:
            cur.execute("""
                INSERT INTO roles (name, description)
                VALUES (%s, %s)
                ON CONFLICT (name) DO NOTHING
            """, (role_name, description))
        
        # Seed default permissions (one per dashboard page)
        default_permissions = [
            ('overview', 'Financial Overview', 'View executive summary and key metrics'),
            ('account', 'Account Detail', 'View GL account details'),
            ('income_statement', 'Income Statement', 'View income statement'),
            ('balance_sheet', 'Balance Sheet', 'View balance sheet'),
            ('cash_flow', 'Cash Flow', 'View statement of cash flows'),
            ('cash_balances', 'Cash Balances', 'View cash position'),
            ('job_overview', 'Job Overview', 'View job summary metrics and charts'),
            ('job_budgets', 'Budgets', 'View job budget tracking'),
            ('job_actuals', 'Actuals', 'View job actuals and earned revenue'),
            ('over_under_billing', 'Over/Under Billing', 'View job billing status analysis'),
            ('cost_codes', 'Cost Codes', 'View cost code analysis and breakdowns'),
            ('pm_report', 'PM Report', 'View project manager performance reports'),
            ('ai_insights', 'AI Insights', 'Run comprehensive AI business analysis'),
            ('payments', 'Payments', 'View AP invoices and payment status'),
            ('ap_aging', 'AP Aging', 'View accounts payable aging report'),
            ('ar_aging', 'AR Aging', 'View accounts receivable aging report'),
            ('admin', 'Admin', 'Access user management and settings')
        ]
        for page_key, page_name, description in default_permissions:
            cur.execute("""
                INSERT INTO permissions (page_key, page_name, description)
                VALUES (%s, %s, %s)
                ON CONFLICT (page_key) DO NOTHING
            """, (page_key, page_name, description))
        
        # Get role IDs
        cur.execute("SELECT id, name FROM roles")
        roles = {row['name']: row['id'] for row in cur.fetchall()}
        
        # Get permission IDs
        cur.execute("SELECT id, page_key FROM permissions")
        perms = {row['page_key']: row['id'] for row in cur.fetchall()}
        
        # Admin role gets all permissions
        if 'admin' in roles:
            for perm_id in perms.values():
                cur.execute("""
                    INSERT INTO role_permissions (role_id, permission_id)
                    VALUES (%s, %s)
                    ON CONFLICT DO NOTHING
                """, (roles['admin'], perm_id))
        
        # Manager role gets all except admin
        if 'manager' in roles:
            for page_key, perm_id in perms.items():
                if page_key != 'admin':
                    cur.execute("""
                        INSERT INTO role_permissions (role_id, permission_id)
                        VALUES (%s, %s)
                        ON CONFLICT DO NOTHING
                    """, (roles['manager'], perm_id))
        
        # Project Manager role gets job reports and payments
        if 'project_manager' in roles:
            pm_permissions = ['job_overview', 'job_budgets', 'job_actuals', 'over_under_billing', 'cost_codes', 'missing_budgets', 'pm_report', 'payments', 'job_analytics']
            for page_key in pm_permissions:
                if page_key in perms:
                    cur.execute("""
                        INSERT INTO role_permissions (role_id, permission_id)
                        VALUES (%s, %s)
                        ON CONFLICT DO NOTHING
                    """, (roles['project_manager'], perms[page_key]))
        
        # Only seed default users on first-time initialization (when no users exist)
        cur.execute("SELECT COUNT(*) as count FROM users")
        user_count = cur.fetchone()['count']
        
        if user_count == 0:
            print("No users found - seeding default users...")
            default_users = [
                ('rodney@ftgbuilders.com', 'Rodney', 'admin'),
                ('joshl@ftgbuilders.com', 'Josh', 'manager'),
                ('greg@ftgbuilders.com', 'Greg', 'manager'),
                ('bailey@ftgbuilders.com', 'Bailey', 'manager')
            ]
            
            default_password_hash = hash_password('Ftgb2025$')
            
            for email, display_name, role_name in default_users:
                role_id = roles.get(role_name)
                cur.execute("""
                    INSERT INTO users (email, display_name, password_hash, role_id, is_active)
                    VALUES (%s, %s, %s, %s, TRUE)
                    ON CONFLICT (email) DO NOTHING
                """, (email, display_name, default_password_hash, role_id))
        else:
            print(f"Found {user_count} existing users - skipping default user seeding")
        
        conn.commit()
        cur.close()
        conn.close()
        print("Database initialized successfully with roles and permissions")
    except Exception as e:
        print(f"Database initialization error: {e}")
        import traceback
        traceback.print_exc()

# Initialize database on startup
init_database()

# Initialize metrics cache on startup
init_metrics()

# Using Anthropic Claude for AI analysis
# The newest Anthropic model is "claude-sonnet-4-20250514"
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")

def get_anthropic_client():
    if not ANTHROPIC_API_KEY:
        raise Exception("Anthropic API key not configured. Please add ANTHROPIC_API_KEY to your secrets.")
    return Anthropic(api_key=ANTHROPIC_API_KEY)

def get_connector_access_token(connector_name):
    """Get access token for a Replit connector (gmail, google-sheet, etc.)"""
    hostname = os.environ.get('REPLIT_CONNECTORS_HOSTNAME')
    repl_identity = os.environ.get('REPL_IDENTITY')
    web_repl_renewal = os.environ.get('WEB_REPL_RENEWAL')
    
    if repl_identity:
        x_replit_token = f'repl {repl_identity}'
    elif web_repl_renewal:
        x_replit_token = f'depl {web_repl_renewal}'
    else:
        raise Exception(f'{connector_name} authentication token not available.')
    
    if not hostname:
        raise Exception('Replit connectors not available. Please try again.')
    
    response = requests.get(
        f'https://{hostname}/api/v2/connection?include_secrets=true&connector_names={connector_name}',
        headers={
            'Accept': 'application/json',
            'X_REPLIT_TOKEN': x_replit_token
        }
    )
    
    if response.status_code != 200:
        raise Exception(f'Failed to get {connector_name} credentials: {response.status_code}')
    
    data = response.json()
    items = data.get('items', [])
    
    if not items:
        raise Exception(f'{connector_name} not connected. Please connect in the Connections panel.')
    
    connection_settings = items[0]
    
    access_token = (
        connection_settings.get('settings', {}).get('access_token') or
        connection_settings.get('settings', {}).get('oauth', {}).get('credentials', {}).get('access_token')
    )
    
    if not access_token:
        raise Exception(f'{connector_name} access token not found. Please reconnect.')
    
    return access_token

def get_gmail_access_token():
    return get_connector_access_token('google-mail')

def get_sheets_access_token_via_service_account():
    """Get access token using Google Service Account credentials (for production)"""
    from google.oauth2 import service_account
    from google.auth.transport.requests import Request
    
    service_account_email = os.environ.get('GOOGLE_SERVICE_ACCOUNT_EMAIL')
    private_key = os.environ.get('GOOGLE_PRIVATE_KEY')
    
    if not service_account_email or not private_key:
        raise Exception('Google Service Account credentials not configured.')
    
    private_key = private_key.replace('\\n', '\n')
    
    credentials_info = {
        "type": "service_account",
        "client_email": service_account_email,
        "private_key": private_key,
        "token_uri": "https://oauth2.googleapis.com/token"
    }
    
    credentials = service_account.Credentials.from_service_account_info(
        credentials_info,
        scopes=['https://www.googleapis.com/auth/spreadsheets.readonly']
    )
    
    credentials.refresh(Request())
    return credentials.token

def get_sheets_access_token():
    """Get Google Sheets access token - tries Replit connector first, falls back to service account"""
    try:
        return get_connector_access_token('google-sheet')
    except Exception as connector_error:
        print(f"Replit connector failed: {connector_error}, trying service account...")
        try:
            return get_sheets_access_token_via_service_account()
        except Exception as sa_error:
            print(f"Service account also failed: {sa_error}")
            raise Exception(f"Could not get Google Sheets access. Connector: {connector_error}. Service Account: {sa_error}")

def send_gmail(to_email, subject, html_content):
    access_token = get_gmail_access_token()
    
    message = MIMEMultipart('alternative')
    message['to'] = to_email
    message['subject'] = subject
    
    html_part = MIMEText(html_content, 'html')
    message.attach(html_part)
    
    raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode('utf-8')
    
    response = requests.post(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        headers={
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        },
        json={'raw': raw_message}
    )
    
    if response.status_code != 200:
        raise Exception(f'Failed to send email: {response.text}')
    
    return response.json()

@app.before_request
def log_request():
    print(f"Incoming request: {request.method} {request.path}")
    if request.method == 'OPTIONS':
        response = Response()
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
        return response

@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    return response

@app.route('/api/send-email', methods=['POST', 'OPTIONS'])
@app.route('/__api__/send-email', methods=['POST', 'OPTIONS'])
@app.route('/send-email.json', methods=['POST', 'OPTIONS'])
def api_send_email():
    print(f"API send-email called with method: {request.method}")
    
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    try:
        data = request.get_json(force=True, silent=True)
        print(f"Received data: {data is not None}")
        
        if not data:
            return jsonify({'error': 'Invalid JSON data'}), 400
        
        to_email = data.get('to')
        subject = data.get('subject')
        html_content = data.get('html')
        
        if not all([to_email, subject, html_content]):
            return jsonify({'error': 'Missing required fields: to, subject, html'}), 400
        
        result = send_gmail(to_email, subject, html_content)
        return jsonify({'success': True, 'messageId': result.get('id')})
    except Exception as e:
        import traceback
        print(f"Email error: {str(e)}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/analyze-income-statement', methods=['POST', 'OPTIONS'])
def api_analyze_income_statement():
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            return jsonify({'error': 'Invalid JSON data'}), 400
        
        statement_data = data.get('statementData')
        period_info = data.get('periodInfo', '')
        
        if not statement_data:
            return jsonify({'error': 'Missing statement data'}), 400
        
        client = get_anthropic_client()
        
        system_prompt = """You are a CFO analyzing a construction company's Income Statement.

You must respond with ONLY a valid JSON object containing exactly these 4 arrays:
{
  "key_observations": ["observation 1", "observation 2", "observation 3"],
  "positive_indicators": ["indicator 1", "indicator 2", "indicator 3"],
  "areas_of_concern": ["concern 1", "concern 2", "concern 3"],
  "recommendations": ["recommendation 1", "recommendation 2", "recommendation 3"]
}

STRICT RULES:
- Return ONLY the JSON object, no other text before or after
- Each array must have exactly 3-4 items
- Each item is one concise sentence with specific dollar amounts
- Round all dollar amounts to whole numbers (no decimals) - use $3.8M not $3.84M
- DO NOT add any other fields or sections"""

        user_prompt = f"""Analyze this Income Statement for FTG Builders:

Period: {period_info}

{statement_data}"""

        # Using Claude Sonnet 4 - the latest model
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2048,
            system=system_prompt,
            messages=[
                {"role": "user", "content": user_prompt}
            ]
        )
        
        import json
        
        # Extract text from the response content block
        content_block = response.content[0]
        raw_content = getattr(content_block, 'text', '') or ""
        
        # Parse the JSON response
        result = json.loads(raw_content)
        
        # Build markdown output with EXACTLY 4 sections, max 4 bullets each
        analysis = "## Key Observations\n"
        for item in result.get("key_observations", [])[:4]:
            analysis += f"- {item}\n"
        analysis += "\n## Positive Indicators\n"
        for item in result.get("positive_indicators", [])[:4]:
            analysis += f"- {item}\n"
        analysis += "\n## Areas of Concern\n"
        for item in result.get("areas_of_concern", [])[:4]:
            analysis += f"- {item}\n"
        analysis += "\n## Recommendations\n"
        for item in result.get("recommendations", [])[:4]:
            analysis += f"- {item}\n"
        
        return jsonify({'success': True, 'analysis': analysis})
        
    except Exception as e:
        import traceback
        print(f"AI Analysis error: {str(e)}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/analyze-cash-flow', methods=['POST', 'OPTIONS'])
def api_analyze_cash_flow():
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            return jsonify({'error': 'Invalid JSON data'}), 400
        
        statement_data = data.get('statementData')
        period_info = data.get('periodInfo', '')
        
        if not statement_data:
            return jsonify({'error': 'Missing statement data'}), 400
        
        client = get_anthropic_client()
        
        system_prompt = """You are a CFO analyzing a construction company's Statement of Cash Flows.

You must respond with ONLY a valid JSON object containing exactly these 4 arrays:
{
  "key_observations": ["observation 1", "observation 2", "observation 3"],
  "positive_indicators": ["indicator 1", "indicator 2", "indicator 3"],
  "areas_of_concern": ["concern 1", "concern 2", "concern 3"],
  "recommendations": ["recommendation 1", "recommendation 2", "recommendation 3"]
}

STRICT RULES:
- Return ONLY the JSON object, no other text before or after
- Each array must have exactly 3-4 items
- Each item is one concise sentence with specific dollar amounts
- Round all dollar amounts to whole numbers - use $3.8M not $3.84M, use $150K not $150,234
- Focus on cash flow dynamics: operating cash generation, investment decisions, financing activities
- DO NOT add any other fields or sections"""

        user_prompt = f"""Analyze this Statement of Cash Flows for FTG Builders:

Period: {period_info}

{statement_data}"""

        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2048,
            system=system_prompt,
            messages=[
                {"role": "user", "content": user_prompt}
            ]
        )
        
        import json
        
        content_block = response.content[0]
        raw_content = getattr(content_block, 'text', '') or ""
        
        result = json.loads(raw_content)
        
        analysis = "## Key Observations\n"
        for item in result.get("key_observations", [])[:4]:
            analysis += f"- {item}\n"
        analysis += "\n## Positive Indicators\n"
        for item in result.get("positive_indicators", [])[:4]:
            analysis += f"- {item}\n"
        analysis += "\n## Areas of Concern\n"
        for item in result.get("areas_of_concern", [])[:4]:
            analysis += f"- {item}\n"
        analysis += "\n## Recommendations\n"
        for item in result.get("recommendations", [])[:4]:
            analysis += f"- {item}\n"
        
        return jsonify({'success': True, 'analysis': analysis})
        
    except Exception as e:
        import traceback
        print(f"Cash Flow AI Analysis error: {str(e)}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/email-cash-report', methods=['POST', 'OPTIONS'])
def api_email_cash_report():
    """Send Cash Report as HTML email with content embedded in body"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            return jsonify({'error': 'Invalid JSON data'}), 400
        
        to_email = data.get('to')
        report_data = data.get('reportData')
        ai_analysis = data.get('aiAnalysis', '')
        
        if not to_email:
            return jsonify({'error': 'Recipient email is required'}), 400
        
        if not report_data:
            return jsonify({'error': 'Report data is required'}), 400
        
        # Generate HTML email content
        html_content = generate_cash_report_html_email(report_data, ai_analysis)
        
        # Generate subject line with today's date in MM/DD/YY format
        from datetime import datetime
        today = datetime.now().strftime('%m/%d/%y')
        subject = f"FTG Builders Weekly Cash Report: {today}"
        
        # Send via Gmail API
        result = send_gmail(to_email, subject, html_content)
        
        return jsonify({'success': True, 'messageId': result.get('id')})
        
    except Exception as e:
        import traceback
        print(f"Cash Report email error: {str(e)}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

def generate_cash_report_html_email(report_data, ai_analysis=''):
    """Generate HTML email content for Cash Report with embedded styling"""
    import re
    from datetime import datetime
    
    summary = report_data.get('summary', {})
    safety = report_data.get('safetyCheck', {})
    deposits = report_data.get('topDeposits', [])
    withdrawals = report_data.get('topWithdrawals', [])
    daily_balances = report_data.get('dailyBalances', [])
    
    # Format AI analysis - replace "safety check" with "Cash Safety Buffer"
    formatted_analysis = ai_analysis.replace('Safety check', 'Cash Safety Buffer').replace('safety check', 'Cash safety buffer')
    if formatted_analysis:
        formatted_analysis = re.sub(
            r'\b(increased|received|deposits?|paid us)\s+(\$[\d,\.]+[KMB]?)',
            r'\1 <span style="color:#16a34a;font-weight:700;">\2</span>',
            formatted_analysis, flags=re.IGNORECASE
        )
        formatted_analysis = re.sub(
            r'\b(decreased|paid out|withdrawals?)\s+(\$[\d,\\.]+[KMB]?)',
            r'\1 <span style="color:#dc2626;font-weight:700;">\2</span>',
            formatted_analysis, flags=re.IGNORECASE
        )
    
    # Determine net change color and sign using numeric value when available
    net_change_raw = summary.get('netChange', '--')
    net_change_numeric = summary.get('netChangeNumeric', None)
    
    # Handle net change formatting with proper sign and color
    if net_change_numeric is not None and net_change_numeric != 0:
        # Non-zero numeric value - use sign and color
        sign = '+' if net_change_numeric > 0 else '-'
        net_change_color = '#16a34a' if net_change_numeric > 0 else '#dc2626'
        abs_val = abs(net_change_numeric)
        # Format with full precision like dashboard
        net_change_raw = sign + '${:,.0f}'.format(abs_val)
    elif net_change_numeric == 0:
        # Zero - neutral display, no sign
        net_change_color = '#1e293b'
        net_change_raw = '$0'
    elif net_change_raw and net_change_raw != '--':
        # Fallback to string parsing if no numeric value provided
        if net_change_raw.startswith('-'):
            net_change_color = '#dc2626'
        elif net_change_raw.startswith('+'):
            net_change_color = '#16a34a'
        else:
            # Parse the string to determine if positive (no sign means positive)
            net_change_color = '#16a34a'
            if not net_change_raw.startswith('$'):
                net_change_raw = '+' + net_change_raw
            else:
                net_change_raw = '+' + net_change_raw
    else:
        net_change_color = '#1e293b'
    
    # Build deposits table rows
    deposits_rows = ''
    for d in deposits[:5]:
        deposits_rows += '<tr style="border-bottom:1px solid #e2e8f0;">'
        deposits_rows += '<td style="padding:12px 8px;font-size:14px;color:#64748b;">' + d.get("date", "") + '</td>'
        desc = d.get("description", "")[:40]
        deposits_rows += '<td style="padding:12px 8px;font-size:14px;color:#1e293b;">' + desc + '</td>'
        deposits_rows += '<td style="padding:12px 8px;font-size:14px;color:#16a34a;font-weight:600;text-align:right;">' + d.get("amount", "") + '</td>'
        deposits_rows += '</tr>'
        if d.get('attribution'):
            deposits_rows += '<tr style="background:#f8fafc;"><td colspan="3" style="padding:4px 8px 12px 24px;font-size:12px;color:#3b82f6;">\u25cf ' + d.get("attribution", "") + '</td></tr>'
    
    # Build withdrawals table rows
    withdrawals_rows = ''
    for w in withdrawals[:5]:
        withdrawals_rows += '<tr style="border-bottom:1px solid #e2e8f0;">'
        withdrawals_rows += '<td style="padding:12px 8px;font-size:14px;color:#64748b;">' + w.get("date", "") + '</td>'
        desc = w.get("description", "")[:40]
        withdrawals_rows += '<td style="padding:12px 8px;font-size:14px;color:#1e293b;">' + desc + '</td>'
        withdrawals_rows += '<td style="padding:12px 8px;font-size:14px;color:#dc2626;font-weight:600;text-align:right;">' + w.get("amount", "") + '</td>'
        withdrawals_rows += '</tr>'
        if w.get('attribution'):
            withdrawals_rows += '<tr style="background:#f8fafc;"><td colspan="3" style="padding:4px 8px 12px 24px;font-size:12px;color:#3b82f6;">\u25cf ' + w.get("attribution", "") + '</td></tr>'
    
    # Build weekly balances vertical bar chart
    daily_chart_html = ''
    if daily_balances and len(daily_balances) > 0:
        balances = [b.get('balance', 0) for b in daily_balances]
        max_balance = max(balances) if balances else 1
        min_balance = min(balances) if balances else 0
        
        # Calculate Y-axis range to show differences (don't start at zero)
        range_buffer = (max_balance - min_balance) * 0.15
        y_min = min_balance - range_buffer
        y_max = max_balance + range_buffer
        y_range = y_max - y_min if y_max > y_min else 1
        
        chart_height = 150
        bar_color = '#3b82f6'
        
        # Build vertical bars using flexbox
        bars_html = ''
        for db in daily_balances:
            bal = db.get('balance', 0)
            bar_height_pct = max(5, ((bal - y_min) / y_range) * 100)
            bar_px = int((bar_height_pct / 100) * chart_height)
            
            bars_html += '<td style="vertical-align:bottom;text-align:center;padding:0 2px;">'
            bars_html += '<div style="font-size:9px;color:#64748b;margin-bottom:4px;">' + db.get('formatted', '') + '</div>'
            bars_html += '<div style="background:linear-gradient(180deg,' + bar_color + ',#1d4ed8);width:100%;height:' + str(bar_px) + 'px;border-radius:4px 4px 0 0;min-width:35px;"></div>'
            bars_html += '</td>'
        
        # Build date labels row
        dates_html = ''
        for db in daily_balances:
            dates_html += '<td style="text-align:center;padding:6px 2px 0;font-size:10px;color:#64748b;">' + db.get('date', '') + '</td>'
        
        daily_chart_html = '<div style="background:white;padding:24px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">'
        daily_chart_html += '<div style="font-size:14px;font-weight:600;color:#1e293b;margin-bottom:16px;">Weekly Cash Balance</div>'
        daily_chart_html += '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">'
        daily_chart_html += '<tr style="height:' + str(chart_height + 20) + 'px;">' + bars_html + '</tr>'
        daily_chart_html += '<tr>' + dates_html + '</tr>'
        daily_chart_html += '</table></div>'
    
    # AI summary section
    ai_section = ''
    if formatted_analysis:
        # Split into first sentence (paragraph) and remaining sentences (bullet points)
        sentences = re.split(r'(?<=[.!?])\s+', formatted_analysis.strip())
        first_sentence = sentences[0] if sentences else ''
        remaining_sentences = sentences[1:] if len(sentences) > 1 else []
        
        ai_section = '<div style="background:#f0f9ff;border:1px solid #bae6fd;padding:20px 24px;">'
        ai_section += '<div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;margin-bottom:8px;">AI Summary</div>'
        ai_section += '<p style="margin:0 0 12px 0;font-size:15px;line-height:1.6;color:#1e293b;">' + first_sentence + '</p>'
        
        if remaining_sentences:
            ai_section += '<ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.7;color:#1e293b;">'
            for sentence in remaining_sentences:
                if sentence.strip():
                    ai_section += '<li style="margin-bottom:6px;">' + sentence.strip() + '</li>'
            ai_section += '</ul>'
        
        ai_section += '</div>'
    
    deposits_content = deposits_rows if deposits_rows else '<tr><td colspan="3" style="padding:16px;text-align:center;color:#64748b;">No deposits</td></tr>'
    withdrawals_content = withdrawals_rows if withdrawals_rows else '<tr><td colspan="3" style="padding:16px;text-align:center;color:#64748b;">No withdrawals</td></tr>'
    
    # Safety total with color
    safety_total = safety.get('total', '--')
    safety_color = '#16a34a' if safety_total and not safety_total.startswith('-') else '#dc2626'
    
    period_label = summary.get('periodLabel', 'Weekly Cash Report')
    report_date = datetime.now().strftime('%B %d, %Y')
    current_balance = summary.get('currentBalance', '--')
    deposits_val = summary.get('deposits', '--')
    withdrawals_val = summary.get('withdrawals', '--')
    safety_cash = safety.get('cash', '--')
    safety_ar = safety.get('ar', '--')
    safety_ap = safety.get('ap', '--')
    safety_oub = safety.get('oub', '--')
    safety_opexp = safety.get('opExp', '--')
    gen_date = datetime.now().strftime('%B %d, %Y at %I:%M %p')
    
    html = '''<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;">
    <div style="max-width:700px;margin:0 auto;padding:24px;">
        <div style="background:linear-gradient(135deg,#1e40af,#3b82f6);border-radius:12px 12px 0 0;padding:24px;text-align:center;">
            <h1 style="margin:0;color:white;font-size:24px;font-weight:700;">FTG Builders Cash Report</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">''' + period_label + '''</p>
            <p style="margin:4px 0 0;color:rgba(255,255,255,0.7);font-size:13px;">''' + report_date + '''</p>
        </div>
        ''' + ai_section + '''
        ''' + daily_chart_html + '''
        <div style="background:white;padding:24px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                <tr>
                    <td width="25%" style="text-align:center;padding:16px;border-right:1px solid #e2e8f0;">
                        <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;margin-bottom:8px;">Current Balance</div>
                        <div style="font-size:24px;font-weight:700;color:#1e293b;">''' + current_balance + '''</div>
                    </td>
                    <td width="25%" style="text-align:center;padding:16px;border-right:1px solid #e2e8f0;">
                        <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;margin-bottom:8px;">Deposits</div>
                        <div style="font-size:24px;font-weight:700;color:#16a34a;">''' + deposits_val + '''</div>
                    </td>
                    <td width="25%" style="text-align:center;padding:16px;border-right:1px solid #e2e8f0;">
                        <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;margin-bottom:8px;">Withdrawals</div>
                        <div style="font-size:24px;font-weight:700;color:#dc2626;">''' + withdrawals_val + '''</div>
                    </td>
                    <td width="25%" style="text-align:center;padding:16px;">
                        <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;margin-bottom:8px;">Net Change</div>
                        <div style="font-size:24px;font-weight:700;color:''' + net_change_color + ''';">''' + net_change_raw + '''</div>
                    </td>
                </tr>
            </table>
        </div>
        <div style="background:#f8fafc;padding:20px 24px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
            <div style="font-size:13px;font-weight:600;color:#1e293b;margin-bottom:16px;">Cash Safety Buffer</div>
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                <tr>
                    <td style="text-align:center;padding:8px;"><div style="font-size:10px;color:#64748b;">CASH</div><div style="font-size:14px;font-weight:700;">''' + safety_cash + '''</div></td>
                    <td style="text-align:center;padding:8px;font-size:16px;color:#64748b;">+</td>
                    <td style="text-align:center;padding:8px;"><div style="font-size:10px;color:#64748b;">AR</div><div style="font-size:14px;font-weight:700;color:#16a34a;">''' + safety_ar + '''</div></td>
                    <td style="text-align:center;padding:8px;font-size:16px;color:#64748b;">-</td>
                    <td style="text-align:center;padding:8px;"><div style="font-size:10px;color:#64748b;">AP</div><div style="font-size:14px;font-weight:700;color:#dc2626;">''' + safety_ap + '''</div></td>
                    <td style="text-align:center;padding:8px;font-size:16px;color:#64748b;">-</td>
                    <td style="text-align:center;padding:8px;"><div style="font-size:10px;color:#64748b;">Over/Under Bill</div><div style="font-size:14px;font-weight:700;">''' + safety_oub + '''</div></td>
                    <td style="text-align:center;padding:8px;font-size:16px;color:#64748b;">-</td>
                    <td style="text-align:center;padding:8px;"><div style="font-size:10px;color:#64748b;">RESERVE</div><div style="font-size:14px;font-weight:700;color:#dc2626;">''' + safety_opexp + '''</div></td>
                    <td style="text-align:center;padding:8px;font-size:16px;color:#64748b;">=</td>
                    <td style="text-align:center;padding:12px;background:linear-gradient(135deg,rgba(59,130,246,0.1),rgba(16,185,129,0.1));border-radius:8px;"><div style="font-size:10px;color:#64748b;">BUFFER</div><div style="font-size:16px;font-weight:700;color:''' + safety_color + ''';">''' + safety_total + '''</div></td>
                </tr>
            </table>
        </div>
        <div style="background:white;padding:24px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
            <div style="font-size:14px;font-weight:600;color:#1e293b;margin-bottom:12px;">Top 5 Deposits</div>
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                <tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0;">
                    <th style="padding:10px 8px;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;text-align:left;">Date</th>
                    <th style="padding:10px 8px;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;text-align:left;">Description</th>
                    <th style="padding:10px 8px;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;text-align:right;">Amount</th>
                </tr>
                ''' + deposits_content + '''
            </table>
        </div>
        <div style="background:white;padding:24px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;border-radius:0 0 12px 12px;">
            <div style="font-size:14px;font-weight:600;color:#1e293b;margin-bottom:12px;">Top 5 Withdrawals</div>
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                <tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0;">
                    <th style="padding:10px 8px;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;text-align:left;">Date</th>
                    <th style="padding:10px 8px;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;text-align:left;">Description</th>
                    <th style="padding:10px 8px;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;text-align:right;">Amount</th>
                </tr>
                ''' + withdrawals_content + '''
            </table>
        </div>
        <div style="text-align:center;padding:24px;color:#64748b;font-size:12px;">
            <p style="margin:0 0 8px 0;">Generated by FTG Dashboard on ''' + gen_date + '''</p>
            <p style="margin:0;"><a href="https://ftg-dashboard.replit.app/" style="color:#3b82f6;text-decoration:none;">Visit FTG Dashboard for additional detail</a></p>
        </div>
    </div>
</body>
</html>'''
    
    return html




@app.route('/api/analyze-cash-report', methods=['POST', 'OPTIONS'])
def api_analyze_cash_report():
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            return jsonify({'error': 'Invalid JSON data'}), 400
        
        statement_data = data.get('statementData')
        if not statement_data:
            return jsonify({'error': 'Missing statement data'}), 400
        
        client = get_anthropic_client()
        
        # Build context from the cash report data
        summary = statement_data.get('summary', {})
        safety = statement_data.get('safetyCheck', {})
        deposits = statement_data.get('topDeposits', [])
        withdrawals = statement_data.get('topWithdrawals', [])
        
        # Format deposits for the prompt
        deposits_text = ""
        for d in deposits:
            attr = f" - {d['attribution']}" if d.get('attribution') else ""
            deposits_text += f"  {d['date']}: {d['amount']} - {d['description']}{attr}\n"
        
        # Format withdrawals for the prompt
        withdrawals_text = ""
        for w in withdrawals:
            attr = f" - {w['attribution']}" if w.get('attribution') else ""
            withdrawals_text += f"  {w['date']}: {w['amount']} - {w['description']}{attr}\n"
        
        system_prompt = """You are a CFO analyzing a construction company's weekly cash position.

Write a 3-4 sentence summary in plain text (no bullet points, no markdown headers). Structure your response as follows:

1. First sentence: Overall cash balance summary including the change amount, current balance, deposits received, and withdrawals paid out.
2. Second sentence: Comment on the cash balance safety check status.
3. Third sentence: Summarize top deposits, aggregating by customer when the same customer has multiple deposits (e.g., "Sutter paid us $111K across two checks").
4. Fourth sentence: Summarize top withdrawals, mentioning key vendors and whether they're job-related or overhead (like payroll/benefits).

Use exact dollar amounts rounded to nearest thousand (e.g., $243K, $12.5M). Be specific about customer/vendor names.

EXAMPLE FORMAT:
"Cash decreased $243K this week to $12,450,823. Received $312K in deposits, paid out $628K. Safety check remains healthy at $5.7M. The largest deposits came from Mee Memorial ($97K for job 3780), followed by Sutter ($111K across two payments), Dignity ($50K), and El Camino ($29K). Major withdrawals included payroll processing through Employee Fiduciary ($166K), Choice Admin benefits ($50K), and subcontractor payments to Walters & Wolf ($93K across jobs 1805, 4531, 4164)."

Return ONLY the summary paragraph, no other text."""

        user_prompt = f"""Analyze this cash report data:

SUMMARY ({summary.get('periodLabel', 'this week')}):
- Current Balance: {summary.get('currentBalance', '--')}
- Deposits: {summary.get('deposits', '--')}
- Withdrawals: {summary.get('withdrawals', '--')}
- Net Change: {summary.get('netChange', '--')}

SAFETY CHECK:
- Cash Balance: {safety.get('cash', '--')}
- Receivables (AR): {safety.get('ar', '--')}
- Payables (AP): {safety.get('ap', '--')}
- Net Over/Under Bill: {safety.get('oub', '--')}
- Operating Reserve (3-mo SG&A): {safety.get('opExp', '--')}
- Safety Check Total: {safety.get('total', '--')}

TOP DEPOSITS:
{deposits_text if deposits_text else '  No deposits data available'}

TOP WITHDRAWALS:
{withdrawals_text if withdrawals_text else '  No withdrawals data available'}

Write a 3-4 sentence summary paragraph following the format specified."""
        
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=500,
            messages=[
                {"role": "user", "content": system_prompt + "\n\n" + user_prompt}
            ]
        )
        
        analysis = response.content[0].text.strip()
        return jsonify({'success': True, 'analysis': analysis})
        
    except Exception as e:
        import traceback
        print(f"Cash Report AI Analysis error: {str(e)}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/analyze-overview', methods=['POST', 'OPTIONS'])
@app.route('/api/analyze-revenue', methods=['POST', 'OPTIONS'])
@app.route('/api/analyze-account', methods=['POST', 'OPTIONS'])
@app.route('/api/analyze-balance-sheet', methods=['POST', 'OPTIONS'])
@app.route('/api/analyze-jobs', methods=['POST', 'OPTIONS'])
@app.route('/api/analyze-pm-report', methods=['POST', 'OPTIONS'])
@app.route('/api/analyze-ai-insights', methods=['POST', 'OPTIONS'])
def api_analyze_financial_data():
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            return jsonify({'error': 'Invalid JSON data'}), 400
        
        statement_data = data.get('statementData') or data.get('chartData')
        period_info = data.get('periodInfo', '')
        
        if not statement_data:
            return jsonify({'error': 'Missing data'}), 400
        
        client = get_anthropic_client()
        
        endpoint = request.path
        if 'ai-insights' in endpoint:
            title = "Comprehensive Business Analysis"
            focus = """strategic business intelligence including:
- Job portfolio health: margin performance, workload distribution across PMs, and completion status
- Cash position: AR collection efficiency, AP management, and working capital
- PM performance: compare margins and workload balance, identify top performers and those needing support
- Risk factors: concentration risk, underperforming segments, and collection concerns
- Actionable next steps with specific dollar impact where possible"""
        elif 'overview' in endpoint:
            title = "Executive Overview"
            focus = "P&L and balance sheet metrics"
        elif 'revenue' in endpoint:
            title = "Revenue Analysis"
            focus = "revenue trends and performance"
        elif 'account' in endpoint:
            title = "GL Account"
            focus = "account details and trends"
        elif 'pm-report' in endpoint:
            title = "PM Report"
            focus = "project manager performance, job portfolio, over/under billing, missing budgets, and client relationships"
        elif 'jobs' in endpoint:
            title = "Job Overview"
            focus = "job performance, contract values, billing status, and profit margins by project manager and client"
        else:
            title = "Balance Sheet"
            focus = "asset, liability, and equity positions"
        
        system_prompt = f"""You are a CFO analyzing a construction company's {title}.

You must respond with ONLY a valid JSON object containing exactly these 4 arrays:
{{
  "key_observations": ["observation 1", "observation 2", "observation 3"],
  "positive_indicators": ["indicator 1", "indicator 2", "indicator 3"],
  "areas_of_concern": ["concern 1", "concern 2", "concern 3"],
  "recommendations": ["recommendation 1", "recommendation 2", "recommendation 3"]
}}

STRICT RULES:
- Return ONLY the JSON object, no other text before or after
- Each array must have exactly 3-4 items
- Each item is one concise sentence with specific dollar amounts
- Round all dollar amounts to whole numbers - use $3.8M not $3.84M, use $150K not $150,234
- Focus on {focus}
- DO NOT add any other fields or sections"""

        user_prompt = f"""Analyze this {title} for FTG Builders:

Period: {period_info}

{statement_data}"""

        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2048,
            system=system_prompt,
            messages=[
                {"role": "user", "content": user_prompt}
            ]
        )
        
        import json
        
        # Handle potential empty or malformed response
        if not response.content or len(response.content) == 0:
            print(f"AI Analysis error: Empty response from API")
            return jsonify({'error': 'AI returned empty response. Please try again.'}), 500
        
        content_block = response.content[0]
        raw_content = getattr(content_block, 'text', '') or ""
        
        if not raw_content or not raw_content.strip():
            print(f"AI Analysis error: Empty text content from API")
            return jsonify({'error': 'AI returned empty analysis. Please try again.'}), 500
        
        # Clean up potential markdown code blocks
        cleaned_content = raw_content.strip()
        if cleaned_content.startswith('```json'):
            cleaned_content = cleaned_content[7:]
        if cleaned_content.startswith('```'):
            cleaned_content = cleaned_content[3:]
        if cleaned_content.endswith('```'):
            cleaned_content = cleaned_content[:-3]
        cleaned_content = cleaned_content.strip()
        
        try:
            result = json.loads(cleaned_content)
        except json.JSONDecodeError as je:
            print(f"JSON decode error: {str(je)}")
            print(f"Raw content received: {raw_content[:500]}...")
            return jsonify({'error': f'Failed to parse AI response. Please try again.'}), 500
        
        analysis = "## Key Observations\n"
        for item in result.get("key_observations", [])[:4]:
            analysis += f"- {item}\n"
        analysis += "\n## Positive Indicators\n"
        for item in result.get("positive_indicators", [])[:4]:
            analysis += f"- {item}\n"
        analysis += "\n## Areas of Concern\n"
        for item in result.get("areas_of_concern", [])[:4]:
            analysis += f"- {item}\n"
        analysis += "\n## Recommendations\n"
        for item in result.get("recommendations", [])[:4]:
            analysis += f"- {item}\n"
        
        return jsonify({'success': True, 'analysis': analysis})
        
    except Exception as e:
        import traceback
        print(f"AI Analysis error: {str(e)}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/pm-list', methods=['GET', 'OPTIONS'])
def api_pm_list():
    """Lightweight endpoint to get PM names quickly for the PM Report dropdown"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    try:
        import os
        import json
        
        jobs_path = os.path.join(os.path.dirname(__file__), 'data', 'financials_jobs.json')
        
        if not os.path.exists(jobs_path):
            return jsonify({'success': False, 'pms': [], 'error': 'Jobs data not found'}), 404
        
        with open(jobs_path, 'r', encoding='utf-8-sig') as f:
            data = json.load(f)
        
        jobs = data.get('job_budgets', [])
        generated_at = data.get('generated_at', '')
        
        # Extract unique PM names from active jobs only (job_status = 'A')
        pms = set()
        for job in jobs:
            if job.get('job_status', '') == 'A':
                pm = job.get('project_manager_name', '')
                if pm and pm.strip():
                    pms.add(pm.strip())
        
        sorted_pms = sorted(list(pms))
        
        return jsonify({
            'success': True,
            'pms': sorted_pms,
            'count': len(sorted_pms),
            'generated_at': generated_at
        })
        
    except Exception as e:
        print(f"[PM-LIST] Error: {e}")
        return jsonify({'success': False, 'pms': [], 'error': str(e)}), 500

@app.route('/api/ai-analysis', methods=['POST', 'OPTIONS'])
def api_ai_analysis():
    """Generic AI analysis endpoint for comprehensive insights"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    try:
        data = request.get_json()
        if not data:
            print("AI Analysis error: No JSON data received")
            return jsonify({'error': 'No data received', 'success': False}), 400
            
        prompt = data.get('prompt', '')
        section = data.get('section', 'general')
        max_tokens = data.get('max_tokens', 2048)
        
        print(f"AI Analysis request: section={section}, prompt_length={len(prompt)}, max_tokens={max_tokens}")
        
        if not prompt:
            return jsonify({'error': 'No prompt provided'}), 400
        
        # Truncate prompt if too long (keep under 100k chars to be safe)
        if len(prompt) > 100000:
            prompt = prompt[:100000] + "\n\n[Data truncated for length]"
            print(f"Prompt truncated to 100k chars")
        
        client = get_anthropic_client()
        
        if section == 'comprehensive_insights':
            system_prompt = """You are a senior financial analyst for a construction company. Provide comprehensive business insights.

IMPORTANT: Disregard Josh Angelo's numbers from your analysis and commentary. Do not include any data or mention of Josh Angelo in your response.

Structure your response with these clear sections using markdown headers:
## Executive Summary
Brief 2-3 sentence overview of overall business health.

## Financial Health
Key observations about revenue, expenses, and profitability.

## Job Performance
Analysis of project portfolio, margins, and billing status.

## Cash Flow & Receivables/Payables
AR/AP aging analysis and cash position insights.

## PM Performance
Project manager rankings and performance observations (excluding Josh Angelo).

## Strategic Recommendations
3-5 actionable recommendations for improvement.

Keep each section concise (2-4 bullet points). Use specific dollar amounts rounded to thousands (e.g., $1.2M, $450K)."""
        elif section == 'pm_report':
            system_prompt = """You are a project management analyst for a construction company. Analyze the PM's performance data and provide insights on:
- Overall performance metrics
- Areas of concern (under-billing, missing budgets)
- Recommendations for improvement

IMPORTANT: Disregard Josh Angelo's numbers from your analysis and commentary. Do not include any data or mention of Josh Angelo in your response.

Keep response concise with bullet points."""
        else:
            system_prompt = """You are a financial analyst for a construction company. Provide clear, actionable insights based on the data provided. Use bullet points and be concise.

IMPORTANT: Disregard Josh Angelo's numbers from your analysis and commentary. Do not include any data or mention of Josh Angelo in your response."""
        
        print(f"Calling Anthropic API...")
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=min(max_tokens, 4000),
            system=system_prompt,
            messages=[
                {"role": "user", "content": prompt}
            ]
        )
        
        content_block = response.content[0]
        analysis = getattr(content_block, 'text', '') or ""
        print(f"AI Analysis completed: response_length={len(analysis)}")
        
        return jsonify({'success': True, 'analysis': analysis})
        
    except Exception as e:
        import traceback
        error_msg = str(e)
        print(f"AI Analysis error: {error_msg}")
        traceback.print_exc()
        return jsonify({'error': error_msg, 'success': False}), 500

@app.route('/api/sheets/<spreadsheet_id>', methods=['GET', 'OPTIONS'])
@app.route('/api/sheets/<spreadsheet_id>/<sheet_name>', methods=['GET', 'OPTIONS'])
def api_get_sheet_data(spreadsheet_id, sheet_name=None):
    """Fetch data from a Google Sheet"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    try:
        access_token = get_sheets_access_token()
        
        # Default to first sheet if no name specified
        range_param = sheet_name if sheet_name else 'Sheet1'
        
        # Fetch sheet data using Google Sheets API
        response = requests.get(
            f'https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}/values/{range_param}',
            headers={
                'Authorization': f'Bearer {access_token}',
                'Accept': 'application/json'
            }
        )
        
        if response.status_code != 200:
            error_data = response.json()
            error_msg = error_data.get('error', {}).get('message', 'Unknown error')
            return jsonify({'error': f'Failed to fetch sheet: {error_msg}'}), response.status_code
        
        data = response.json()
        values = data.get('values', [])
        
        # Convert to structured format with headers
        if len(values) > 0:
            headers = values[0]
            rows = []
            for row in values[1:]:
                row_dict = {}
                for i, header in enumerate(headers):
                    row_dict[header] = row[i] if i < len(row) else ''
                rows.append(row_dict)
            
            return jsonify({
                'success': True,
                'headers': headers,
                'rows': rows,
                'raw_values': values
            })
        else:
            return jsonify({
                'success': True,
                'headers': [],
                'rows': [],
                'raw_values': []
            })
        
    except Exception as e:
        import traceback
        print(f"Google Sheets error: {str(e)}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# Cache for cash data (5 minute TTL)
cash_data_cache = {
    'data': None,
    'timestamp': None
}
CASH_CACHE_TTL = 300  # 5 minutes

@app.route('/api/cash-data', methods=['GET', 'OPTIONS'])
def api_get_cash_data():
    """Fetch accounts and transactions from Google Sheet with caching"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    try:
        # Check cache first
        now = datetime.now()
        if (cash_data_cache['data'] and cash_data_cache['timestamp'] and 
            (now - cash_data_cache['timestamp']).total_seconds() < CASH_CACHE_TTL):
            print("Returning cached cash data")
            return jsonify(cash_data_cache['data'])
        
        print("Fetching fresh cash data from Google Sheets...")
        try:
            access_token = get_sheets_access_token()
        except Exception as token_error:
            print(f"Token error: {str(token_error)}")
            return jsonify({'error': f'Google Sheets authentication failed: {str(token_error)}'}), 500
        spreadsheet_id = '1Nkcn2Obvipqn30b-QEfKud0d8G9WTuWicUX07b76wXY'
        
        # Fetch Accounts sheet (columns A=name, B=balance, D=last update)
        accounts_resp = requests.get(
            f'https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}/values/Accounts',
            headers={'Authorization': f'Bearer {access_token}', 'Accept': 'application/json'}
        )
        
        if accounts_resp.status_code != 200:
            return jsonify({'error': 'Failed to fetch Accounts sheet'}), accounts_resp.status_code
        
        accounts_data = accounts_resp.json().get('values', [])
        
        # Fetch Transactions sheet (columns A=date, B=account, C=amount)
        txn_resp = requests.get(
            f'https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}/values/Transactions',
            headers={'Authorization': f'Bearer {access_token}', 'Accept': 'application/json'}
        )
        
        if txn_resp.status_code != 200:
            return jsonify({'error': 'Failed to fetch Transactions sheet'}), txn_resp.status_code
        
        txn_data = txn_resp.json().get('values', [])
        
        # Parse accounts (skip header row)
        accounts = []
        if len(accounts_data) > 1:
            for row in accounts_data[1:]:
                if len(row) >= 2:
                    name = row[0] if len(row) > 0 else ''
                    balance_str = row[1] if len(row) > 1 else '0'
                    last_update = row[3] if len(row) > 3 else ''
                    
                    # Parse balance (remove $ and commas)
                    balance = 0
                    try:
                        balance = float(balance_str.replace('$', '').replace(',', ''))
                    except:
                        pass
                    
                    if name:
                        accounts.append({
                            'name': name,
                            'balance': balance,
                            'lastUpdate': last_update
                        })
        
        # Parse transactions (skip header row)
        # Log header row to see available columns
        if len(txn_data) > 0:
            print(f"Transaction sheet headers: {txn_data[0]}")
            if len(txn_data) > 1:
                print(f"Sample transaction row: {txn_data[1]}")
        
        transactions = []
        if len(txn_data) > 1:
            for row in txn_data[1:]:
                if len(row) >= 3:
                    date_str = row[0] if len(row) > 0 else ''
                    account = row[1] if len(row) > 1 else ''
                    amount_str = row[2] if len(row) > 2 else '0'
                    description = row[3] if len(row) > 3 else ''
                    payee = row[4] if len(row) > 4 else ''
                    category = row[5] if len(row) > 5 else ''
                    
                    amount = 0
                    try:
                        amount = float(amount_str.replace('$', '').replace(',', ''))
                    except:
                        pass
                    
                    if date_str and account:
                        transactions.append({
                            'date': date_str,
                            'account': account,
                            'amount': amount,
                            'description': description,
                            'payee': payee,
                            'category': category
                        })
        
        # Store in cache
        result = {
            'success': True,
            'accounts': accounts,
            'transactions': transactions
        }
        cash_data_cache['data'] = result
        cash_data_cache['timestamp'] = datetime.now()
        print(f"Cached cash data: {len(accounts)} accounts, {len(transactions)} transactions")
        
        return jsonify(result)
        
    except Exception as e:
        import traceback
        print(f"Cash data error: {str(e)}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/sheets-info/<spreadsheet_id>', methods=['GET', 'OPTIONS'])
def api_get_sheet_info(spreadsheet_id):
    """Get metadata about a spreadsheet (sheet names, etc.)"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    try:
        access_token = get_sheets_access_token()
        
        response = requests.get(
            f'https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}?fields=properties.title,sheets.properties',
            headers={
                'Authorization': f'Bearer {access_token}',
                'Accept': 'application/json'
            }
        )
        
        if response.status_code != 200:
            error_data = response.json()
            error_msg = error_data.get('error', {}).get('message', 'Unknown error')
            return jsonify({'error': f'Failed to get sheet info: {error_msg}'}), response.status_code
        
        data = response.json()
        
        spreadsheet_title = data.get('properties', {}).get('title', 'Unknown')
        sheets = []
        for sheet in data.get('sheets', []):
            props = sheet.get('properties', {})
            sheets.append({
                'title': props.get('title'),
                'sheetId': props.get('sheetId'),
                'index': props.get('index')
            })
        
        return jsonify({
            'success': True,
            'title': spreadsheet_title,
            'sheets': sheets
        })
        
    except Exception as e:
        import traceback
        print(f"Google Sheets info error: {str(e)}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

def get_client_ip():
    """Get client IP address from request"""
    if request.headers.get('X-Forwarded-For'):
        return request.headers.get('X-Forwarded-For').split(',')[0].strip()
    return request.remote_addr or 'unknown'

AUDIT_CATEGORIES = {
    'login': 'authentication',
    'logout': 'authentication',
    'login_failed': 'authentication',
    'login_2fa': 'authentication',
    '2fa_enabled': 'security',
    '2fa_disabled': 'security',
    'password_changed': 'security',
    'password_reset_requested': 'security',
    'password_reset_completed': 'security',
    'admin_password_reset': 'security',
    'create_user': 'user_management',
    'update_user': 'user_management',
    'disable_user': 'user_management',
    'permanent_delete_user': 'user_management',
    'create_role': 'role_management',
    'update_role': 'role_management',
    'delete_role': 'role_management',
    'update_role_permissions': 'role_management',
    'reassign_users_and_delete_role': 'role_management',
    'export_report': 'data_access',
    'view_report': 'data_access',
    'email_report': 'data_access',
    'schedule_report': 'data_access',
    'api_access': 'data_access'
}

AUDIT_SEVERITY = {
    'login_failed': 'warning',
    '2fa_disabled': 'warning',
    'password_reset_requested': 'warning',
    'admin_password_reset': 'warning',
    'disable_user': 'warning',
    'permanent_delete_user': 'critical',
    'delete_role': 'warning'
}

def log_audit(user_id, action, target_type=None, target_id=None, details=None, result='success'):
    """Log a structured audit event with category, severity, and metadata"""
    try:
        category = AUDIT_CATEGORIES.get(action, 'general')
        severity = AUDIT_SEVERITY.get(action, 'info')
        if result == 'failure':
            severity = 'warning'
        
        # Safely access request context (may not be available in background tasks)
        ip_address = None
        user_agent = None
        session_token = None
        try:
            from flask import has_request_context
            if has_request_context():
                ip_address = get_client_ip()
                user_agent = request.headers.get('User-Agent', '')[:500]
                auth_header = request.headers.get('Authorization', '')
                if auth_header.startswith('Bearer '):
                    session_token = auth_header[7:][:20] + '...'
        except:
            pass
        
        log_msg = f"[AUDIT] {severity.upper()} | {category} | {action}"
        if user_id:
            log_msg += f" | user_id={user_id}"
        if target_type:
            log_msg += f" | {target_type}={target_id}"
        if result != 'success':
            log_msg += f" | result={result}"
        print(log_msg)
        
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO audit_log (user_id, action, target_type, target_id, details, ip_address, category, severity, user_agent, session_id, result)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            user_id, action, target_type, target_id,
            json.dumps(details) if details else None,
            ip_address, category, severity, user_agent, session_token, result
        ))
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"[AUDIT] Error logging event: {e}")
        import traceback
        traceback.print_exc()

def get_user_permissions(user_id):
    """Get list of page_keys the user has access to"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT p.page_key FROM permissions p
            JOIN role_permissions rp ON p.id = rp.permission_id
            JOIN users u ON u.role_id = rp.role_id
            WHERE u.id = %s
        """, (user_id,))
        perms = [row['page_key'] for row in cur.fetchall()]
        cur.close()
        conn.close()
        return perms
    except:
        return []

def verify_session(token):
    """Verify session token and return user info or None"""
    if not token:
        return None
    # Don't accept 2FA challenge tokens as valid sessions
    if token.startswith('2fa_'):
        return None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT u.id, u.email, u.display_name, u.is_active, u.two_factor_enabled, r.name as role_name
            FROM sessions s
            JOIN users u ON s.user_id = u.id
            LEFT JOIN roles r ON u.role_id = r.id
            WHERE s.token = %s AND s.expires_at > NOW()
        """, (token,))
        user = cur.fetchone()
        cur.close()
        conn.close()
        if user and user['is_active']:
            return user
        return None
    except:
        return None

def require_auth(f):
    """Decorator to require authentication"""
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        user = verify_session(token)
        if not user:
            return jsonify({'error': 'Authentication required'}), 401
        request.current_user = user
        return f(*args, **kwargs)
    return decorated

def require_admin(f):
    """Decorator to require admin role"""
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        user = verify_session(token)
        if not user:
            return jsonify({'error': 'Authentication required'}), 401
        if user['role_name'] != 'admin':
            return jsonify({'error': 'Admin access required'}), 403
        request.current_user = user
        return f(*args, **kwargs)
    return decorated

@app.route('/api/login', methods=['POST', 'OPTIONS'])
def api_login():
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            return jsonify({'error': 'Invalid JSON data'}), 400
        
        email = data.get('email', '').lower().strip()
        password = data.get('password', '')
        
        if not email or not password:
            return jsonify({'error': 'Email and password are required'}), 400
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Find user by email with role info and 2FA status
        cur.execute("""
            SELECT u.id, u.email, u.display_name, u.password_hash, u.is_active, 
                   u.two_factor_enabled, u.two_factor_secret, r.name as role_name
            FROM users u
            LEFT JOIN roles r ON u.role_id = r.id
            WHERE u.email = %s
        """, (email,))
        user = cur.fetchone()
        
        if not user:
            cur.close()
            conn.close()
            log_audit(None, 'login_failed', 'user', None, {'email': email, 'reason': 'invalid_email'}, result='failure')
            return jsonify({'error': 'Invalid email address'}), 401
        
        if not user['is_active']:
            cur.close()
            conn.close()
            log_audit(user['id'], 'login_failed', 'user', user['id'], {'email': email, 'reason': 'account_disabled'}, result='failure')
            return jsonify({'error': 'Account is disabled. Contact your administrator.'}), 401
        
        # Check password using bcrypt (with SHA-256 fallback for legacy)
        password_valid, needs_rehash = verify_password_with_rehash(password, user['password_hash'])
        if not password_valid:
            cur.close()
            conn.close()
            log_audit(user['id'], 'login_failed', 'user', user['id'], {'email': email, 'reason': 'invalid_password'}, result='failure')
            return jsonify({'error': 'Incorrect password'}), 401
        
        # Upgrade legacy SHA-256 hash to bcrypt if needed
        if needs_rehash:
            new_hash = hash_password(password)
            cur.execute("UPDATE users SET password_hash = %s WHERE id = %s", (new_hash, user['id']))
            conn.commit()
        
        # Check if 2FA is enabled
        if user.get('two_factor_enabled'):
            # Generate a temporary 2FA challenge token
            twofa_token = str(uuid.uuid4())
            # Store in sessions with a short expiry (10 minutes) and special marker
            expires_at = datetime.now() + timedelta(minutes=10)
            client_ip = get_client_ip()
            cur.execute("""
                INSERT INTO sessions (user_id, token, expires_at, ip_address)
                VALUES (%s, %s, %s, %s)
            """, (user['id'], f"2fa_{twofa_token}", expires_at, client_ip))
            conn.commit()
            cur.close()
            conn.close()
            
            return jsonify({
                'success': True,
                'requires_2fa': True,
                'twofa_token': twofa_token,
                'email': user['email']
            })
        
        # Create session token with IP
        token = str(uuid.uuid4())
        expires_at = datetime.now() + timedelta(days=30)
        client_ip = get_client_ip()
        
        cur.execute("""
            INSERT INTO sessions (user_id, token, expires_at, ip_address)
            VALUES (%s, %s, %s, %s)
        """, (user['id'], token, expires_at, client_ip))
        
        # Update last_login
        cur.execute("UPDATE users SET last_login = NOW() WHERE id = %s", (user['id'],))
        
        conn.commit()
        cur.close()
        conn.close()
        
        # Get user permissions
        permissions = get_user_permissions(user['id'])
        
        # Log successful login
        log_audit(user['id'], 'login', 'user', user['id'], {'email': email})
        
        return jsonify({
            'success': True,
            'displayName': user['display_name'],
            'email': user['email'],
            'role': user['role_name'] or 'none',
            'permissions': permissions,
            'token': token
        })
        
    except Exception as e:
        print(f"Login error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/login/2fa', methods=['POST', 'OPTIONS'])
def api_login_2fa():
    """Complete 2FA authentication step"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            return jsonify({'error': 'Invalid JSON data'}), 400
        
        twofa_token = data.get('twofa_token', '')
        code = data.get('code', '').strip()
        
        if not twofa_token or not code:
            return jsonify({'error': 'Token and code are required'}), 400
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Find the 2FA challenge session
        cur.execute("""
            SELECT s.id, s.user_id, u.email, u.display_name, u.two_factor_secret, r.name as role_name
            FROM sessions s
            JOIN users u ON s.user_id = u.id
            LEFT JOIN roles r ON u.role_id = r.id
            WHERE s.token = %s AND s.expires_at > NOW()
        """, (f"2fa_{twofa_token}",))
        session = cur.fetchone()
        
        if not session:
            cur.close()
            conn.close()
            return jsonify({'error': '2FA session expired. Please log in again.'}), 401
        
        # Verify the TOTP code (decrypt first)
        decrypted_secret = decrypt_totp_secret(session['two_factor_secret'])
        if not decrypted_secret:
            cur.close()
            conn.close()
            return jsonify({'error': '2FA configuration error. Please re-enable 2FA.'}), 500
        totp = pyotp.TOTP(decrypted_secret)
        is_valid = totp.verify(code, valid_window=1)
        
        if not is_valid:
            cur.close()
            conn.close()
            log_audit(session['user_id'], 'login_failed', 'user', session['user_id'], {'email': session['email'], 'reason': 'invalid_2fa_code'}, result='failure')
            return jsonify({'error': 'Invalid verification code'}), 401
        
        # Delete the 2FA challenge session
        cur.execute("DELETE FROM sessions WHERE id = %s", (session['id'],))
        
        # Create a full session
        token = str(uuid.uuid4())
        expires_at = datetime.now() + timedelta(days=30)
        client_ip = get_client_ip()
        
        cur.execute("""
            INSERT INTO sessions (user_id, token, expires_at, ip_address)
            VALUES (%s, %s, %s, %s)
        """, (session['user_id'], token, expires_at, client_ip))
        
        # Update last_login
        cur.execute("UPDATE users SET last_login = NOW() WHERE id = %s", (session['user_id'],))
        
        conn.commit()
        cur.close()
        conn.close()
        
        # Get user permissions
        permissions = get_user_permissions(session['user_id'])
        
        # Log successful login
        log_audit(session['user_id'], 'login_2fa', 'user', session['user_id'], {'email': session['email']})
        
        return jsonify({
            'success': True,
            'displayName': session['display_name'],
            'email': session['email'],
            'role': session['role_name'] or 'none',
            'permissions': permissions,
            'token': token
        })
        
    except Exception as e:
        print(f"2FA login error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/2fa/setup', methods=['POST', 'OPTIONS'])
@require_auth
def api_2fa_setup():
    """Generate 2FA secret and QR code for setup"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    try:
        user = request.current_user
        
        # Check if 2FA is already enabled
        if user.get('two_factor_enabled'):
            return jsonify({'error': '2FA is already enabled'}), 400
        
        # Generate a new secret
        secret = pyotp.random_base32()
        
        # Encrypt and store the secret (not confirmed yet)
        encrypted_secret = encrypt_totp_secret(secret)
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            UPDATE users SET two_factor_secret = %s WHERE id = %s
        """, (encrypted_secret, user['id']))
        conn.commit()
        cur.close()
        conn.close()
        
        # Generate QR code
        totp = pyotp.TOTP(secret)
        provisioning_uri = totp.provisioning_uri(
            name=user['email'],
            issuer_name='FTG Dashboard'
        )
        
        # Create QR code image
        qr = qrcode.QRCode(version=1, box_size=10, border=5)
        qr.add_data(provisioning_uri)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        
        # Convert to base64
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        qr_base64 = base64.b64encode(buffer.getvalue()).decode()
        
        return jsonify({
            'success': True,
            'secret': secret,
            'qr_code': f'data:image/png;base64,{qr_base64}',
            'provisioning_uri': provisioning_uri
        })
        
    except Exception as e:
        print(f"2FA setup error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/2fa/confirm', methods=['POST', 'OPTIONS'])
@require_auth
def api_2fa_confirm():
    """Confirm 2FA setup with a verification code"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            return jsonify({'error': 'Invalid JSON data'}), 400
        
        code = data.get('code', '').strip()
        if not code:
            return jsonify({'error': 'Verification code is required'}), 400
        
        user = request.current_user
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Get the pending secret
        cur.execute("SELECT two_factor_secret FROM users WHERE id = %s", (user['id'],))
        row = cur.fetchone()
        
        if not row or not row['two_factor_secret']:
            cur.close()
            conn.close()
            return jsonify({'error': 'No 2FA setup in progress'}), 400
        
        # Decrypt and verify the code
        decrypted_secret = decrypt_totp_secret(row['two_factor_secret'])
        if not decrypted_secret:
            cur.close()
            conn.close()
            return jsonify({'error': '2FA configuration error'}), 500
        totp = pyotp.TOTP(decrypted_secret)
        if not totp.verify(code, valid_window=1):
            cur.close()
            conn.close()
            return jsonify({'error': 'Invalid verification code'}), 400
        
        # Enable 2FA
        cur.execute("""
            UPDATE users SET two_factor_enabled = TRUE, two_factor_confirmed_at = NOW()
            WHERE id = %s
        """, (user['id'],))
        
        conn.commit()
        cur.close()
        conn.close()
        
        # Log the action
        log_audit(user['id'], '2fa_enabled', 'user', user['id'], {})
        
        return jsonify({
            'success': True,
            'message': '2FA enabled successfully'
        })
        
    except Exception as e:
        print(f"2FA confirm error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/2fa/disable', methods=['POST', 'OPTIONS'])
@require_auth
def api_2fa_disable():
    """Disable 2FA for the current user"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            return jsonify({'error': 'Invalid JSON data'}), 400
        
        password = data.get('password', '')
        if not password:
            return jsonify({'error': 'Password is required to disable 2FA'}), 400
        
        user = request.current_user
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Get current password hash
        cur.execute("SELECT password_hash FROM users WHERE id = %s", (user['id'],))
        row = cur.fetchone()
        
        if not row:
            cur.close()
            conn.close()
            return jsonify({'error': 'User not found'}), 404
        
        if not verify_password(password, row['password_hash']):
            cur.close()
            conn.close()
            return jsonify({'error': 'Incorrect password'}), 401
        
        # Disable 2FA
        cur.execute("""
            UPDATE users SET 
                two_factor_enabled = FALSE, 
                two_factor_secret = NULL,
                two_factor_confirmed_at = NULL
            WHERE id = %s
        """, (user['id'],))
        
        conn.commit()
        cur.close()
        conn.close()
        
        # Log the action
        log_audit(user['id'], '2fa_disabled', 'user', user['id'], {})
        
        return jsonify({
            'success': True,
            'message': '2FA disabled successfully'
        })
        
    except Exception as e:
        print(f"2FA disable error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/2fa/status', methods=['GET', 'OPTIONS'])
@require_auth
def api_2fa_status():
    """Get 2FA status for the current user"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    try:
        user = request.current_user
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT two_factor_enabled, two_factor_confirmed_at
            FROM users WHERE id = %s
        """, (user['id'],))
        row = cur.fetchone()
        
        cur.close()
        conn.close()
        
        if not row:
            return jsonify({'error': 'User not found'}), 404
        
        return jsonify({
            'success': True,
            'enabled': row['two_factor_enabled'] or False,
            'confirmed_at': row['two_factor_confirmed_at'].isoformat() if row['two_factor_confirmed_at'] else None
        })
        
    except Exception as e:
        print(f"2FA status error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/change-password', methods=['POST', 'OPTIONS'])
def api_change_password():
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            return jsonify({'error': 'Invalid JSON data'}), 400
        
        token = data.get('token')
        current_password = data.get('currentPassword')
        new_password = data.get('newPassword')
        
        if not all([token, current_password, new_password]):
            return jsonify({'error': 'All fields are required'}), 400
        
        if len(new_password) < 6:
            return jsonify({'error': 'New password must be at least 6 characters'}), 400
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Find session and user
        cur.execute("""
            SELECT s.user_id, u.password_hash, u.email
            FROM sessions s
            JOIN users u ON s.user_id = u.id
            WHERE s.token = %s AND s.expires_at > NOW()
        """, (token,))
        session = cur.fetchone()
        
        if not session:
            cur.close()
            conn.close()
            return jsonify({'error': 'Invalid or expired session. Please log in again.'}), 401
        
        # Verify current password
        if not verify_password(current_password, session['password_hash']):
            cur.close()
            conn.close()
            return jsonify({'error': 'Current password is incorrect'}), 401
        
        # Update password
        new_hash = hash_password(new_password)
        cur.execute("""
            UPDATE users SET password_hash = %s, updated_at = NOW()
            WHERE id = %s
        """, (new_hash, session['user_id']))
        
        # Invalidate old sessions and create new one
        cur.execute("DELETE FROM sessions WHERE user_id = %s", (session['user_id'],))
        
        new_token = str(uuid.uuid4())
        expires_at = datetime.now() + timedelta(days=30)
        cur.execute("""
            INSERT INTO sessions (user_id, token, expires_at)
            VALUES (%s, %s, %s)
        """, (session['user_id'], new_token, expires_at))
        
        conn.commit()
        cur.close()
        conn.close()
        
        return jsonify({
            'success': True,
            'message': 'Password changed successfully',
            'token': new_token
        })
        
    except Exception as e:
        print(f"Change password error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/logout', methods=['POST', 'OPTIONS'])
def api_logout():
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    try:
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        if token:
            conn = get_db_connection()
            cur = conn.cursor()
            # Get user_id before deleting session for audit log
            cur.execute("SELECT user_id FROM sessions WHERE token = %s", (token,))
            session = cur.fetchone()
            user_id = session['user_id'] if session else None
            
            cur.execute("DELETE FROM sessions WHERE token = %s", (token,))
            conn.commit()
            cur.close()
            conn.close()
            
            if user_id:
                log_audit(user_id, 'logout', 'user', user_id)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/verify-session', methods=['GET', 'OPTIONS'])
def api_verify_session():
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    user = verify_session(token)
    if user:
        permissions = get_user_permissions(user['id'])
        return jsonify({
            'success': True,
            'user': {
                'id': user['id'],
                'email': user['email'],
                'displayName': user['display_name'],
                'role': user['role_name'] or 'none',
                'permissions': permissions
            }
        })
    return jsonify({'error': 'Invalid or expired session'}), 401

@app.route('/api/admin/users', methods=['GET', 'OPTIONS'])
@require_admin
def api_get_users():
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT u.id, u.email, u.display_name, u.is_active, u.last_login, u.created_at,
                   r.id as role_id, r.name as role_name,
                   creator.display_name as created_by_name
            FROM users u
            LEFT JOIN roles r ON u.role_id = r.id
            LEFT JOIN users creator ON u.created_by = creator.id
            ORDER BY u.display_name
        """)
        users = cur.fetchall()
        cur.close()
        conn.close()
        
        return jsonify({
            'success': True,
            'users': [{
                'id': u['id'],
                'email': u['email'],
                'displayName': u['display_name'],
                'isActive': u['is_active'],
                'lastLogin': u['last_login'].isoformat() if u['last_login'] else None,
                'createdAt': u['created_at'].isoformat() if u['created_at'] else None,
                'roleId': u['role_id'],
                'roleName': u['role_name'],
                'createdBy': u['created_by_name']
            } for u in users]
        })
    except Exception as e:
        print(f"Get users error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/users', methods=['POST'])
@require_admin
def api_create_user():
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            return jsonify({'error': 'Invalid JSON data'}), 400
        
        email = data.get('email', '').lower().strip()
        display_name = data.get('displayName', '').strip()
        role_id = data.get('roleId')
        password = data.get('password', '')
        
        if not email or not display_name:
            return jsonify({'error': 'Email and display name are required'}), 400
        
        if not password or len(password) < 6:
            return jsonify({'error': 'Password must be at least 6 characters'}), 400
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Check if email already exists
        cur.execute("SELECT id FROM users WHERE email = %s", (email,))
        if cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({'error': 'Email already exists'}), 400
        
        password_hash = hash_password(password)
        admin_id = request.current_user['id']
        
        cur.execute("""
            INSERT INTO users (email, display_name, password_hash, role_id, is_active, created_by)
            VALUES (%s, %s, %s, %s, TRUE, %s)
            RETURNING id
        """, (email, display_name, password_hash, role_id, admin_id))
        
        new_user_id = cur.fetchone()['id']
        conn.commit()
        cur.close()
        conn.close()
        
        log_audit(admin_id, 'create_user', 'user', new_user_id, {'email': email, 'displayName': display_name})
        
        return jsonify({'success': True, 'userId': new_user_id})
    except Exception as e:
        print(f"Create user error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/users/<int:user_id>', methods=['PUT', 'OPTIONS'])
@require_admin
def api_update_user(user_id):
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            return jsonify({'error': 'Invalid JSON data'}), 400
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        updates = []
        params = []
        
        if 'displayName' in data:
            updates.append("display_name = %s")
            params.append(data['displayName'])
        
        if 'email' in data:
            updates.append("email = %s")
            params.append(data['email'].lower().strip())
        
        if 'roleId' in data:
            updates.append("role_id = %s")
            params.append(data['roleId'])
        
        if 'isActive' in data:
            updates.append("is_active = %s")
            params.append(data['isActive'])
        
        if 'password' in data and data['password']:
            if len(data['password']) < 6:
                cur.close()
                conn.close()
                return jsonify({'error': 'Password must be at least 6 characters'}), 400
            updates.append("password_hash = %s")
            params.append(hash_password(data['password']))
        
        if not updates:
            cur.close()
            conn.close()
            return jsonify({'error': 'No fields to update'}), 400
        
        updates.append("updated_at = NOW()")
        params.append(user_id)
        
        cur.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = %s", params)
        
        if cur.rowcount == 0:
            cur.close()
            conn.close()
            return jsonify({'error': 'User not found'}), 404
        
        conn.commit()
        cur.close()
        conn.close()
        
        log_audit(request.current_user['id'], 'update_user', 'user', user_id, data)
        
        return jsonify({'success': True})
    except Exception as e:
        print(f"Update user error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/users/<int:user_id>', methods=['DELETE'])
@require_admin
def api_delete_user(user_id):
    try:
        admin_id = request.current_user['id']
        
        if user_id == admin_id:
            return jsonify({'error': 'Cannot delete your own account'}), 400
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Soft delete - just disable the account
        cur.execute("UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE id = %s", (user_id,))
        
        if cur.rowcount == 0:
            cur.close()
            conn.close()
            return jsonify({'error': 'User not found'}), 404
        
        # Delete all sessions for this user
        cur.execute("DELETE FROM sessions WHERE user_id = %s", (user_id,))
        
        conn.commit()
        cur.close()
        conn.close()
        
        log_audit(admin_id, 'disable_user', 'user', user_id, None)
        
        return jsonify({'success': True})
    except Exception as e:
        print(f"Delete user error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/users/<int:user_id>/permanent', methods=['DELETE'])
@require_admin
def api_permanent_delete_user(user_id):
    """Permanently delete a user and all their data"""
    try:
        admin_id = request.current_user['id']
        
        if user_id == admin_id:
            return jsonify({'error': 'Cannot delete your own account'}), 400
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Get user info for audit log
        cur.execute("SELECT email, display_name FROM users WHERE id = %s", (user_id,))
        user = cur.fetchone()
        
        if not user:
            cur.close()
            conn.close()
            return jsonify({'error': 'User not found'}), 404
        
        user_email = user['email']
        user_name = user['display_name']
        
        # Delete related records first (foreign key constraints)
        cur.execute("DELETE FROM sessions WHERE user_id = %s", (user_id,))
        
        # Try to delete from tables that may not exist in older installations
        try:
            cur.execute("DELETE FROM backup_codes WHERE user_id = %s", (user_id,))
        except Exception:
            pass
        
        try:
            cur.execute("DELETE FROM password_reset_tokens WHERE user_id = %s", (user_id,))
        except Exception:
            pass
        
        # Delete scheduled reports for this user
        cur.execute("DELETE FROM scheduled_reports WHERE user_id = %s", (user_id,))
        
        # Update audit logs to remove user reference (keep for history)
        cur.execute("UPDATE audit_log SET user_id = NULL WHERE user_id = %s", (user_id,))
        
        # Update users created by this user
        cur.execute("UPDATE users SET created_by = NULL WHERE created_by = %s", (user_id,))
        
        # Finally delete the user
        cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
        
        conn.commit()
        cur.close()
        conn.close()
        
        log_audit(admin_id, 'permanent_delete_user', 'user', None, {'deleted_email': user_email, 'deleted_name': user_name})
        
        return jsonify({'success': True})
    except Exception as e:
        print(f"Permanent delete user error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/users/<int:user_id>/reset-password', methods=['POST', 'OPTIONS'])
@require_admin
def api_admin_reset_password(user_id):
    """Admin can reset a user's password"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    try:
        admin_id = request.current_user['id']
        data = request.get_json(force=True, silent=True) or {}
        
        # Generate a temporary password or use provided one
        new_password = data.get('new_password') or secrets.token_urlsafe(12)
        send_email = data.get('send_email', False)
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Get user email
        cur.execute("SELECT email, display_name FROM users WHERE id = %s", (user_id,))
        user = cur.fetchone()
        
        if not user:
            cur.close()
            conn.close()
            return jsonify({'error': 'User not found'}), 404
        
        # Update password
        new_hash = hash_password(new_password)
        cur.execute("""
            UPDATE users SET password_hash = %s, updated_at = NOW() WHERE id = %s
        """, (new_hash, user_id))
        
        # Invalidate all sessions for this user
        cur.execute("DELETE FROM sessions WHERE user_id = %s", (user_id,))
        
        conn.commit()
        cur.close()
        conn.close()
        
        # Log the action
        log_audit(admin_id, 'admin_password_reset', 'user', user_id, {'email': user['email']})
        
        # Optionally send email with new password
        if send_email:
            try:
                html_content = f"""
                <html>
                <body style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2>Password Reset - FTG Dashboard</h2>
                    <p>Hello {user['display_name']},</p>
                    <p>Your password has been reset by an administrator.</p>
                    <p>Your new temporary password is: <strong>{new_password}</strong></p>
                    <p>Please log in and change your password immediately.</p>
                    <br>
                    <p>If you did not expect this, please contact your administrator.</p>
                </body>
                </html>
                """
                send_gmail(user['email'], 'Password Reset - FTG Dashboard', html_content)
            except Exception as e:
                print(f"Failed to send password reset email: {e}")
        
        return jsonify({
            'success': True,
            'temporary_password': new_password if not send_email else None,
            'message': 'Password reset successfully' + (' and email sent' if send_email else '')
        })
        
    except Exception as e:
        print(f"Admin reset password error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/request-password-reset', methods=['POST', 'OPTIONS'])
def api_request_password_reset():
    """Request a password reset email"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            return jsonify({'error': 'Invalid JSON data'}), 400
        
        email = data.get('email', '').lower().strip()
        
        if not email:
            return jsonify({'error': 'Email is required'}), 400
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Find user by email
        cur.execute("SELECT id, email, display_name FROM users WHERE email = %s AND is_active = TRUE", (email,))
        user = cur.fetchone()
        
        # Always return success to prevent email enumeration
        if not user:
            cur.close()
            conn.close()
            return jsonify({
                'success': True,
                'message': 'If this email is registered, you will receive a password reset link.'
            })
        
        # Generate reset token
        reset_token = secrets.token_urlsafe(32)
        reset_token_hash = hashlib.sha256(reset_token.encode()).hexdigest()
        expires_at = datetime.now() + timedelta(hours=1)
        
        # Store hashed token
        cur.execute("""
            UPDATE users SET 
                password_reset_token = %s,
                password_reset_expires = %s
            WHERE id = %s
        """, (reset_token_hash, expires_at, user['id']))
        
        conn.commit()
        cur.close()
        conn.close()
        
        # Send email with reset link
        try:
            # Get the base URL from environment or request
            base_url = os.environ.get('REPLIT_DEV_DOMAIN', request.host_url.rstrip('/'))
            if not base_url.startswith('http'):
                base_url = f'https://{base_url}'
            reset_link = f"{base_url}/?reset_token={reset_token}"
            
            html_content = f"""
            <html>
            <body style="font-family: Arial, sans-serif; padding: 20px;">
                <h2>Password Reset Request - FTG Dashboard</h2>
                <p>Hello {user['display_name']},</p>
                <p>You have requested to reset your password. Click the link below to proceed:</p>
                <p><a href="{reset_link}" style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Reset Password</a></p>
                <p>This link will expire in 1 hour.</p>
                <p>If you did not request this, please ignore this email.</p>
            </body>
            </html>
            """
            send_gmail(user['email'], 'Password Reset Request - FTG Dashboard', html_content)
            
            log_audit(user['id'], 'password_reset_requested', 'user', user['id'], {'email': email})
        except Exception as e:
            print(f"Failed to send password reset email: {e}")
            import traceback
            traceback.print_exc()
            # Don't reveal the error to the user
        
        return jsonify({
            'success': True,
            'message': 'If this email is registered, you will receive a password reset link.'
        })
        
    except Exception as e:
        print(f"Request password reset error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/complete-password-reset', methods=['POST', 'OPTIONS'])
def api_complete_password_reset():
    """Complete password reset with token"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            return jsonify({'error': 'Invalid JSON data'}), 400
        
        reset_token = data.get('reset_token', '')
        new_password = data.get('new_password', '')
        
        if not reset_token or not new_password:
            return jsonify({'error': 'Token and new password are required'}), 400
        
        if len(new_password) < 6:
            return jsonify({'error': 'Password must be at least 6 characters'}), 400
        
        # Hash the token to compare with stored hash
        token_hash = hashlib.sha256(reset_token.encode()).hexdigest()
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Find user with valid token
        cur.execute("""
            SELECT id, email FROM users 
            WHERE password_reset_token = %s 
            AND password_reset_expires > NOW()
            AND is_active = TRUE
        """, (token_hash,))
        user = cur.fetchone()
        
        if not user:
            cur.close()
            conn.close()
            return jsonify({'error': 'Invalid or expired reset token'}), 400
        
        # Update password and clear reset token
        new_hash = hash_password(new_password)
        cur.execute("""
            UPDATE users SET 
                password_hash = %s,
                password_reset_token = NULL,
                password_reset_expires = NULL,
                updated_at = NOW()
            WHERE id = %s
        """, (new_hash, user['id']))
        
        # Invalidate all existing sessions
        cur.execute("DELETE FROM sessions WHERE user_id = %s", (user['id'],))
        
        conn.commit()
        cur.close()
        conn.close()
        
        log_audit(user['id'], 'password_reset_completed', 'user', user['id'], {'email': user['email']})
        
        return jsonify({
            'success': True,
            'message': 'Password has been reset successfully. Please log in with your new password.'
        })
        
    except Exception as e:
        print(f"Complete password reset error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/roles', methods=['GET', 'OPTIONS'])
@require_admin
def api_get_roles():
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT id, name, description FROM roles ORDER BY id")
        roles = cur.fetchall()
        cur.close()
        conn.close()
        
        return jsonify({
            'success': True,
            'roles': [{
                'id': r['id'],
                'name': r['name'],
                'description': r['description']
            } for r in roles]
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/roles', methods=['POST'])
@require_admin
def api_create_role():
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            return jsonify({'error': 'Invalid JSON data'}), 400
        
        name = data.get('name', '').strip()
        description = data.get('description', '').strip()
        permissions = data.get('permissions', [])
        
        if not name:
            return jsonify({'error': 'Role name is required'}), 400
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Check for duplicate name
        cur.execute("SELECT id FROM roles WHERE LOWER(name) = LOWER(%s)", (name,))
        if cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({'error': 'A role with this name already exists'}), 400
        
        # Create the role
        cur.execute("""
            INSERT INTO roles (name, description, created_at)
            VALUES (%s, %s, NOW())
            RETURNING id
        """, (name, description))
        role_id = cur.fetchone()['id']
        
        # Add permissions
        for page_key in permissions:
            cur.execute("""
                INSERT INTO role_permissions (role_id, permission_id)
                SELECT %s, id FROM permissions WHERE page_key = %s
            """, (role_id, page_key))
        
        conn.commit()
        cur.close()
        conn.close()
        
        log_audit(request.current_user['id'], 'create_role', 'role', role_id, {'name': name, 'permissions': permissions})
        
        return jsonify({'success': True, 'roleId': role_id})
    except Exception as e:
        print(f"Create role error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/roles/<int:role_id>', methods=['PUT'])
@require_admin
def api_update_role(role_id):
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            return jsonify({'error': 'Invalid JSON data'}), 400
        
        name = data.get('name', '').strip()
        description = data.get('description', '').strip()
        permissions = data.get('permissions', [])
        
        if not name:
            return jsonify({'error': 'Role name is required'}), 400
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Check if role exists
        cur.execute("SELECT id, name FROM roles WHERE id = %s", (role_id,))
        role = cur.fetchone()
        if not role:
            cur.close()
            conn.close()
            return jsonify({'error': 'Role not found'}), 404
        
        # Check for duplicate name (excluding current role)
        cur.execute("SELECT id FROM roles WHERE LOWER(name) = LOWER(%s) AND id != %s", (name, role_id))
        if cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({'error': 'A role with this name already exists'}), 400
        
        # Update role details
        cur.execute("""
            UPDATE roles SET name = %s, description = %s WHERE id = %s
        """, (name, description, role_id))
        
        # Update permissions
        cur.execute("DELETE FROM role_permissions WHERE role_id = %s", (role_id,))
        for page_key in permissions:
            cur.execute("""
                INSERT INTO role_permissions (role_id, permission_id)
                SELECT %s, id FROM permissions WHERE page_key = %s
            """, (role_id, page_key))
        
        conn.commit()
        cur.close()
        conn.close()
        
        log_audit(request.current_user['id'], 'update_role', 'role', role_id, {'name': name, 'permissions': permissions})
        
        return jsonify({'success': True})
    except Exception as e:
        print(f"Update role error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/roles/<int:role_id>', methods=['DELETE'])
@require_admin
def api_delete_role(role_id):
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Check if role exists
        cur.execute("SELECT id, name FROM roles WHERE id = %s", (role_id,))
        role = cur.fetchone()
        if not role:
            cur.close()
            conn.close()
            return jsonify({'error': 'Role not found'}), 404
        
        # Prevent deleting admin role
        if role['name'].lower() == 'admin':
            cur.close()
            conn.close()
            return jsonify({'error': 'Cannot delete the admin role'}), 400
        
        # Check if any users are assigned to this role
        cur.execute("SELECT id, display_name FROM users WHERE role_id = %s", (role_id,))
        assigned_users = cur.fetchall()
        if len(assigned_users) > 0:
            # Get available roles for reassignment (exclude the role being deleted and admin)
            cur.execute("SELECT id, name FROM roles WHERE id != %s ORDER BY name", (role_id,))
            available_roles = cur.fetchall()
            cur.close()
            conn.close()
            return jsonify({
                'error': 'users_assigned',
                'users': [{'id': u['id'], 'username': u['display_name']} for u in assigned_users],
                'availableRoles': [{'id': r['id'], 'name': r['name']} for r in available_roles]
            }), 400
        
        # Delete role permissions first
        cur.execute("DELETE FROM role_permissions WHERE role_id = %s", (role_id,))
        
        # Delete the role
        cur.execute("DELETE FROM roles WHERE id = %s", (role_id,))
        
        conn.commit()
        cur.close()
        conn.close()
        
        log_audit(request.current_user['id'], 'delete_role', 'role', role_id, {'name': role['name']})
        
        return jsonify({'success': True})
    except Exception as e:
        print(f"Delete role error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/roles/<int:role_id>/reassign-and-delete', methods=['POST', 'OPTIONS'])
@require_admin
def api_reassign_and_delete_role(role_id):
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    try:
        data = request.get_json()
        new_role_id = data.get('newRoleId')
        
        if not new_role_id:
            return jsonify({'error': 'New role ID is required'}), 400
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Check if role to delete exists
        cur.execute("SELECT id, name FROM roles WHERE id = %s", (role_id,))
        role = cur.fetchone()
        if not role:
            cur.close()
            conn.close()
            return jsonify({'error': 'Role not found'}), 404
        
        # Prevent deleting admin role
        if role['name'].lower() == 'admin':
            cur.close()
            conn.close()
            return jsonify({'error': 'Cannot delete the admin role'}), 400
        
        # Check if new role exists
        cur.execute("SELECT id, name FROM roles WHERE id = %s", (new_role_id,))
        new_role = cur.fetchone()
        if not new_role:
            cur.close()
            conn.close()
            return jsonify({'error': 'New role not found'}), 404
        
        # Get users being reassigned for audit log
        cur.execute("SELECT id, display_name FROM users WHERE role_id = %s", (role_id,))
        reassigned_users = cur.fetchall()
        
        # Reassign all users to the new role
        cur.execute("UPDATE users SET role_id = %s WHERE role_id = %s", (new_role_id, role_id))
        
        # Delete role permissions
        cur.execute("DELETE FROM role_permissions WHERE role_id = %s", (role_id,))
        
        # Delete the role
        cur.execute("DELETE FROM roles WHERE id = %s", (role_id,))
        
        conn.commit()
        cur.close()
        conn.close()
        
        # Log the reassignment and deletion
        log_audit(request.current_user['id'], 'reassign_users_and_delete_role', 'role', role_id, {
            'deletedRole': role['name'],
            'newRole': new_role['name'],
            'reassignedUsers': [u['display_name'] for u in reassigned_users]
        })
        
        return jsonify({'success': True, 'reassignedCount': len(reassigned_users)})
    except Exception as e:
        print(f"Reassign and delete role error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/permissions', methods=['GET', 'OPTIONS'])
@require_admin
def api_get_permissions():
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT id, page_key, page_name, description FROM permissions ORDER BY id")
        permissions = cur.fetchall()
        cur.close()
        conn.close()
        
        return jsonify({
            'success': True,
            'permissions': [{
                'id': p['id'],
                'pageKey': p['page_key'],
                'pageName': p['page_name'],
                'description': p['description']
            } for p in permissions]
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/roles/<int:role_id>/permissions', methods=['GET', 'OPTIONS'])
@require_admin
def api_get_role_permissions(role_id):
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT p.page_key FROM permissions p
            JOIN role_permissions rp ON p.id = rp.permission_id
            WHERE rp.role_id = %s
        """, (role_id,))
        perms = [row['page_key'] for row in cur.fetchall()]
        cur.close()
        conn.close()
        
        return jsonify({'success': True, 'permissions': perms})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/roles/<int:role_id>/permissions', methods=['PUT'])
@require_admin
def api_update_role_permissions(role_id):
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            return jsonify({'error': 'Invalid JSON data'}), 400
        
        page_keys = data.get('permissions', [])
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Delete existing permissions for this role
        cur.execute("DELETE FROM role_permissions WHERE role_id = %s", (role_id,))
        
        # Add new permissions
        for page_key in page_keys:
            cur.execute("""
                INSERT INTO role_permissions (role_id, permission_id)
                SELECT %s, id FROM permissions WHERE page_key = %s
            """, (role_id, page_key))
        
        conn.commit()
        cur.close()
        conn.close()
        
        log_audit(request.current_user['id'], 'update_role_permissions', 'role', role_id, {'permissions': page_keys})
        
        return jsonify({'success': True})
    except Exception as e:
        print(f"Update role permissions error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/audit-log', methods=['GET', 'OPTIONS'])
@require_admin
def api_get_audit_log():
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    try:
        limit = request.args.get('limit', 100, type=int)
        offset = request.args.get('offset', 0, type=int)
        category = request.args.get('category')
        severity = request.args.get('severity')
        action = request.args.get('action')
        user_id = request.args.get('user_id', type=int)
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        search = request.args.get('search', '').strip()
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        where_clauses = []
        params = []
        
        if category:
            where_clauses.append("a.category = %s")
            params.append(category)
        if severity:
            where_clauses.append("a.severity = %s")
            params.append(severity)
        if action:
            where_clauses.append("a.action = %s")
            params.append(action)
        if user_id:
            where_clauses.append("a.user_id = %s")
            params.append(user_id)
        if start_date:
            where_clauses.append("a.created_at >= %s")
            params.append(start_date)
        if end_date:
            where_clauses.append("a.created_at <= %s")
            params.append(end_date + ' 23:59:59')
        if search:
            where_clauses.append("(a.action ILIKE %s OR u.display_name ILIKE %s OR u.email ILIKE %s OR a.ip_address ILIKE %s)")
            search_param = f"%{search}%"
            params.extend([search_param, search_param, search_param, search_param])
        
        where_sql = ""
        if where_clauses:
            where_sql = "WHERE " + " AND ".join(where_clauses)
        
        query = f"""
            SELECT a.id, a.action, a.target_type, a.target_id, a.details, a.ip_address, a.created_at,
                   u.display_name as user_name, u.email as user_email,
                   COALESCE(a.category, 'general') as category,
                   COALESCE(a.severity, 'info') as severity,
                   COALESCE(a.result, 'success') as result
            FROM audit_log a
            LEFT JOIN users u ON a.user_id = u.id
            {where_sql}
            ORDER BY a.created_at DESC
            LIMIT %s OFFSET %s
        """
        params.extend([limit, offset])
        cur.execute(query, params)
        logs = cur.fetchall()
        
        count_query = f"SELECT COUNT(*) as count FROM audit_log a LEFT JOIN users u ON a.user_id = u.id {where_sql}"
        cur.execute(count_query, params[:-2] if params else [])
        total = cur.fetchone()['count']
        
        cur.execute("""
            SELECT DISTINCT category FROM audit_log WHERE category IS NOT NULL ORDER BY category
        """)
        categories = [r['category'] for r in cur.fetchall()]
        
        cur.execute("""
            SELECT DISTINCT action FROM audit_log ORDER BY action
        """)
        actions = [r['action'] for r in cur.fetchall()]
        
        cur.close()
        conn.close()
        
        return jsonify({
            'success': True,
            'total': total,
            'filters': {
                'categories': categories,
                'actions': actions,
                'severities': ['info', 'warning', 'critical']
            },
            'logs': [{
                'id': log['id'],
                'action': log['action'],
                'targetType': log['target_type'],
                'targetId': log['target_id'],
                'details': log['details'],
                'ipAddress': log['ip_address'],
                'createdAt': log['created_at'].isoformat() if log['created_at'] else None,
                'userName': log['user_name'],
                'userEmail': log['user_email'],
                'category': log['category'],
                'severity': log['severity'],
                'result': log['result']
            } for log in logs]
        })
    except Exception as e:
        print(f"Get audit log error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# ============== SCHEDULED REPORTS API ==============

def calculate_next_send(frequency, day_of_week, day_of_month, send_time):
    """Calculate the next scheduled send time based on frequency"""
    from datetime import date, time
    now = datetime.now()
    send_hour, send_minute = send_time.hour, send_time.minute
    
    if frequency == 'daily':
        next_send = now.replace(hour=send_hour, minute=send_minute, second=0, microsecond=0)
        if next_send <= now:
            next_send += timedelta(days=1)
    elif frequency == 'weekly':
        days_ahead = day_of_week - now.weekday()
        if days_ahead < 0 or (days_ahead == 0 and now.hour >= send_hour):
            days_ahead += 7
        next_send = now.replace(hour=send_hour, minute=send_minute, second=0, microsecond=0) + timedelta(days=days_ahead)
    elif frequency == 'monthly':
        next_send = now.replace(day=min(day_of_month, 28), hour=send_hour, minute=send_minute, second=0, microsecond=0)
        if next_send <= now:
            if now.month == 12:
                next_send = next_send.replace(year=now.year + 1, month=1)
            else:
                next_send = next_send.replace(month=now.month + 1)
    else:
        next_send = now + timedelta(days=1)
    
    return next_send

@app.route('/api/scheduled-reports', methods=['GET', 'OPTIONS'])
def api_get_scheduled_reports():
    """Get all scheduled reports for the current user"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    if not token:
        return jsonify({'error': 'Authentication required'}), 401
    
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT user_id FROM sessions 
            WHERE token = %s AND expires_at > NOW()
        """, (token,))
        session = cur.fetchone()
        
        if not session:
            cur.close()
            conn.close()
            return jsonify({'error': 'Invalid session'}), 401
        
        user_id = session['user_id']
        
        cur.execute("""
            SELECT id, report_type, report_name, view_config, recipients, 
                   frequency, day_of_week, day_of_month, send_time, 
                   is_active, last_sent_at, next_send_at, created_at
            FROM scheduled_reports
            WHERE user_id = %s
            ORDER BY created_at DESC
        """, (user_id,))
        
        reports = cur.fetchall()
        cur.close()
        conn.close()
        
        return jsonify({
            'success': True,
            'reports': [{
                'id': r['id'],
                'reportType': r['report_type'],
                'reportName': r['report_name'],
                'viewConfig': r['view_config'],
                'recipients': r['recipients'],
                'frequency': r['frequency'],
                'dayOfWeek': r['day_of_week'],
                'dayOfMonth': r['day_of_month'],
                'sendTime': r['send_time'].strftime('%H:%M') if r['send_time'] else '08:00',
                'isActive': r['is_active'],
                'lastSentAt': r['last_sent_at'].isoformat() if r['last_sent_at'] else None,
                'nextSendAt': r['next_send_at'].isoformat() if r['next_send_at'] else None,
                'createdAt': r['created_at'].isoformat() if r['created_at'] else None
            } for r in reports]
        })
    except Exception as e:
        print(f"Get scheduled reports error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/scheduled-reports', methods=['POST'])
def api_create_scheduled_report():
    """Create a new scheduled report"""
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    if not token:
        return jsonify({'error': 'Authentication required'}), 401
    
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            return jsonify({'error': 'Invalid JSON data'}), 400
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT user_id FROM sessions 
            WHERE token = %s AND expires_at > NOW()
        """, (token,))
        session = cur.fetchone()
        
        if not session:
            cur.close()
            conn.close()
            return jsonify({'error': 'Invalid session'}), 401
        
        user_id = session['user_id']
        
        report_type = data.get('reportType')
        report_name = data.get('reportName')
        view_config = data.get('viewConfig', {})
        recipients = data.get('recipients', [])
        frequency = data.get('frequency', 'weekly')
        day_of_week = data.get('dayOfWeek', 1)
        day_of_month = data.get('dayOfMonth', 1)
        send_time_str = data.get('sendTime', '08:00')
        
        if not report_type or not report_name or not recipients:
            cur.close()
            conn.close()
            return jsonify({'error': 'Missing required fields: reportType, reportName, recipients'}), 400
        
        from datetime import time
        hour, minute = map(int, send_time_str.split(':'))
        send_time = time(hour, minute)
        
        next_send = calculate_next_send(frequency, day_of_week, day_of_month, send_time)
        
        cur.execute("""
            INSERT INTO scheduled_reports 
            (user_id, report_type, report_name, view_config, recipients, 
             frequency, day_of_week, day_of_month, send_time, next_send_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
        """, (user_id, report_type, report_name, json.dumps(view_config), 
              recipients, frequency, day_of_week, day_of_month, send_time, next_send))
        
        new_id = cur.fetchone()['id']
        conn.commit()
        cur.close()
        conn.close()
        
        return jsonify({
            'success': True,
            'id': new_id,
            'nextSendAt': next_send.isoformat()
        })
    except Exception as e:
        print(f"Create scheduled report error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/scheduled-reports/<int:report_id>', methods=['PUT', 'OPTIONS'])
def api_update_scheduled_report(report_id):
    """Update a scheduled report"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    if not token:
        return jsonify({'error': 'Authentication required'}), 401
    
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            return jsonify({'error': 'Invalid JSON data'}), 400
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT user_id FROM sessions 
            WHERE token = %s AND expires_at > NOW()
        """, (token,))
        session = cur.fetchone()
        
        if not session:
            cur.close()
            conn.close()
            return jsonify({'error': 'Invalid session'}), 401
        
        user_id = session['user_id']
        
        cur.execute("""
            SELECT id FROM scheduled_reports WHERE id = %s AND user_id = %s
        """, (report_id, user_id))
        
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({'error': 'Report not found'}), 404
        
        report_name = data.get('reportName')
        view_config = data.get('viewConfig')
        recipients = data.get('recipients')
        frequency = data.get('frequency')
        day_of_week = data.get('dayOfWeek')
        day_of_month = data.get('dayOfMonth')
        send_time_str = data.get('sendTime')
        is_active = data.get('isActive')
        
        updates = []
        params = []
        
        if report_name is not None:
            updates.append("report_name = %s")
            params.append(report_name)
        if view_config is not None:
            updates.append("view_config = %s")
            params.append(json.dumps(view_config))
        if recipients is not None:
            updates.append("recipients = %s")
            params.append(recipients)
        if frequency is not None:
            updates.append("frequency = %s")
            params.append(frequency)
        if day_of_week is not None:
            updates.append("day_of_week = %s")
            params.append(day_of_week)
        if day_of_month is not None:
            updates.append("day_of_month = %s")
            params.append(day_of_month)
        if send_time_str is not None:
            from datetime import time
            hour, minute = map(int, send_time_str.split(':'))
            updates.append("send_time = %s")
            params.append(time(hour, minute))
        if is_active is not None:
            updates.append("is_active = %s")
            params.append(is_active)
        
        if updates:
            updates.append("updated_at = NOW()")
            query = f"UPDATE scheduled_reports SET {', '.join(updates)} WHERE id = %s"
            params.append(report_id)
            cur.execute(query, params)
            
            if frequency or day_of_week or day_of_month or send_time_str:
                cur.execute("SELECT frequency, day_of_week, day_of_month, send_time FROM scheduled_reports WHERE id = %s", (report_id,))
                row = cur.fetchone()
                from datetime import time
                next_send = calculate_next_send(row['frequency'], row['day_of_week'], row['day_of_month'], row['send_time'])
                cur.execute("UPDATE scheduled_reports SET next_send_at = %s WHERE id = %s", (next_send, report_id))
        
        conn.commit()
        cur.close()
        conn.close()
        
        return jsonify({'success': True})
    except Exception as e:
        print(f"Update scheduled report error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/scheduled-reports/<int:report_id>', methods=['DELETE'])
def api_delete_scheduled_report(report_id):
    """Delete a scheduled report"""
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    if not token:
        return jsonify({'error': 'Authentication required'}), 401
    
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT user_id FROM sessions 
            WHERE token = %s AND expires_at > NOW()
        """, (token,))
        session = cur.fetchone()
        
        if not session:
            cur.close()
            conn.close()
            return jsonify({'error': 'Invalid session'}), 401
        
        user_id = session['user_id']
        
        cur.execute("""
            DELETE FROM scheduled_reports WHERE id = %s AND user_id = %s
        """, (report_id, user_id))
        
        if cur.rowcount == 0:
            cur.close()
            conn.close()
            return jsonify({'error': 'Report not found'}), 404
        
        conn.commit()
        cur.close()
        conn.close()
        
        return jsonify({'success': True})
    except Exception as e:
        print(f"Delete scheduled report error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/process-scheduled-reports', methods=['POST', 'OPTIONS'])
def api_process_scheduled_reports():
    """Process and send due scheduled reports (called by cron/scheduler)"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT sr.*, u.email as user_email, u.display_name as user_name
            FROM scheduled_reports sr
            JOIN users u ON sr.user_id = u.id
            WHERE sr.is_active = TRUE 
              AND sr.next_send_at <= NOW()
        """)
        
        due_reports = cur.fetchall()
        sent_count = 0
        errors = []
        
        for report in due_reports:
            try:
                subject = f"FTG Dashboard: {report['report_name']}"
                
                html_content = f"""
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #1e3a5f;">Scheduled Report: {report['report_name']}</h2>
                    <p>This is your scheduled {report['frequency']} report from FTG Dashboard.</p>
                    <p><strong>Report Type:</strong> {report['report_type'].replace('_', ' ').title()}</p>
                    <p><strong>Configuration:</strong></p>
                    <pre style="background: #f5f5f5; padding: 10px; border-radius: 4px;">{json.dumps(report['view_config'], indent=2)}</pre>
                    <p style="margin-top: 20px;">
                        <a href="https://ftg-dashboard.replit.app" style="background: #3b82f6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">
                            View Full Report
                        </a>
                    </p>
                    <p style="color: #666; font-size: 12px; margin-top: 30px;">
                        This automated report was scheduled by {report['user_name']} ({report['user_email']}).
                    </p>
                </div>
                """
                
                for recipient in report['recipients']:
                    try:
                        send_gmail(recipient, subject, html_content)
                    except Exception as email_err:
                        errors.append(f"Failed to send to {recipient}: {str(email_err)}")
                
                from datetime import time
                next_send = calculate_next_send(
                    report['frequency'], 
                    report['day_of_week'], 
                    report['day_of_month'], 
                    report['send_time']
                )
                
                cur.execute("""
                    UPDATE scheduled_reports 
                    SET last_sent_at = NOW(), next_send_at = %s
                    WHERE id = %s
                """, (next_send, report['id']))
                
                sent_count += 1
                
            except Exception as report_err:
                errors.append(f"Report {report['id']}: {str(report_err)}")
        
        conn.commit()
        cur.close()
        conn.close()
        
        return jsonify({
            'success': True,
            'processed': len(due_reports),
            'sent': sent_count,
            'errors': errors
        })
    except Exception as e:
        print(f"Process scheduled reports error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/')
def serve_index():
    response = send_from_directory('.', 'index.html')
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    return response

@app.route('/<path:path>')
def serve_static(path):
    # Don't serve static files for API routes
    if path.startswith('api/') or path == 'send-email.json' or path.startswith('__api__'):
        return jsonify({'error': 'API endpoint not found'}), 404
    # Don't try to serve .py files
    if path.endswith('.py'):
        return jsonify({'error': 'Not found'}), 404
    try:
        response = send_from_directory('.', path)
        
        # Optimized cache control for different file types
        # Static assets that rarely change get long cache (1 year with versioning)
        # Dynamic content gets no-cache
        if path.endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg', '.woff', '.woff2', '.ttf')):
            # Images and fonts - cache for 1 year (versioned via query string or path)
            response.headers['Cache-Control'] = 'public, max-age=31536000, immutable'
        elif path.startswith('data/') and path.endswith('.json'):
            # Data files - cache for 5 minutes (frequently accessed, rarely changed)
            response.headers['Cache-Control'] = 'public, max-age=300'
        elif path.endswith('.css') or path.endswith('.js'):
            # CSS/JS with version query strings - cache for 1 day
            response.headers['Cache-Control'] = 'public, max-age=86400'
        else:
            # All other files - no cache
            response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        
        return response
    except Exception as e:
        # Only fallback to index.html for non-API, non-data paths
        if not path.startswith('data/') and not path.endswith('.json'):
            response = send_from_directory('.', 'index.html')
            response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
            return response
        return jsonify({'error': 'File not found'}), 404

def run_scheduler():
    """Background thread that processes scheduled reports"""
    print(f"[{datetime.now().isoformat()}] Starting scheduled reports processor...")
    time.sleep(15)
    
    while True:
        if not DATABASE_URL:
            time.sleep(SCHEDULER_INTERVAL)
            continue
        
        conn = None
        cur = None
        try:
            conn = get_db_connection()
            cur = conn.cursor()
            
            cur.execute("""
                SELECT sr.*, u.email as user_email, u.display_name as user_name
                FROM scheduled_reports sr
                JOIN users u ON sr.user_id = u.id
                WHERE sr.is_active = TRUE 
                  AND sr.next_send_at <= NOW()
            """)
            
            due_reports = cur.fetchall()
            
        except Exception as e:
            print(f"[{datetime.now().isoformat()}] Scheduler DB query error: {str(e)}")
            due_reports = []
        finally:
            if cur:
                try:
                    cur.close()
                except:
                    pass
            if conn:
                try:
                    conn.close()
                except:
                    pass
        
        for report in due_reports:
            report_conn = None
            report_cur = None
            try:
                subject = f"FTG Dashboard: {report['report_name']}"
                html_content = generate_report_email(report)
                
                email_success = False
                for recipient in report['recipients']:
                    try:
                        send_gmail(recipient, subject, html_content)
                        print(f"[{datetime.now().isoformat()}] Sent report '{report['report_name']}' to {recipient}")
                        email_success = True
                    except Exception as email_err:
                        print(f"[{datetime.now().isoformat()}] Failed to send to {recipient}: {str(email_err)}")
                
                if email_success:
                    try:
                        next_send = calculate_next_send(
                            report['frequency'], 
                            report['day_of_week'], 
                            report['day_of_month'], 
                            report['send_time']
                        )
                        
                        report_conn = get_db_connection()
                        report_cur = report_conn.cursor()
                        report_cur.execute("""
                            UPDATE scheduled_reports 
                            SET last_sent_at = NOW(), next_send_at = %s
                            WHERE id = %s
                        """, (next_send, report['id']))
                        report_conn.commit()
                    except Exception as db_err:
                        print(f"[{datetime.now().isoformat()}] Failed to update report {report['id']}: {str(db_err)}")
                    finally:
                        if report_cur:
                            try:
                                report_cur.close()
                            except:
                                pass
                        if report_conn:
                            try:
                                report_conn.close()
                            except:
                                pass
                    
            except Exception as report_err:
                print(f"[{datetime.now().isoformat()}] Report {report['id']} error: {str(report_err)}")
        
        time.sleep(SCHEDULER_INTERVAL)

def generate_report_email(report):
    """Generate HTML email content for a scheduled report"""
    report_type = report['report_type']
    view_config = report['view_config'] or {}
    
    type_labels = {
        'executive_overview': 'Executive Overview',
        'revenue': 'Revenue Analysis',
        'account_detail': 'Account Detail',
        'income_statement': 'Income Statement',
        'balance_sheet': 'Balance Sheet',
        'cash_flow': 'Statement of Cash Flows',
        'cash_balances': 'Cash Balances'
    }
    
    report_label = type_labels.get(report_type, report_type.replace('_', ' ').title())
    
    config_summary = []
    if 'viewType' in view_config:
        config_summary.append(f"View: {view_config['viewType'].title()}")
    if 'year' in view_config:
        config_summary.append(f"Year: {view_config['year']}")
    if 'periodType' in view_config:
        config_summary.append(f"Period: {view_config['periodType'].title()}")
    if 'compareMode' in view_config:
        config_summary.append(f"Compare: {view_config['compareMode'].title()}")
    
    config_text = " | ".join(config_summary) if config_summary else "Default settings"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; background-color: #f5f7fa;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f7fa; padding: 40px 20px;">
            <tr>
                <td align="center">
                    <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                        <!-- Header -->
                        <tr>
                            <td style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); padding: 30px; border-radius: 8px 8px 0 0;">
                                <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">FTG Dashboard</h1>
                                <p style="margin: 10px 0 0 0; color: #a3c5e8; font-size: 14px;">Scheduled Report</p>
                            </td>
                        </tr>
                        
                        <!-- Content -->
                        <tr>
                            <td style="padding: 40px 30px;">
                                <h2 style="margin: 0 0 20px 0; color: #1e3a5f; font-size: 20px; font-weight: 600;">
                                    {report['report_name']}
                                </h2>
                                
                                <div style="background-color: #f8fafc; border-radius: 6px; padding: 20px; margin-bottom: 25px;">
                                    <table width="100%" cellpadding="0" cellspacing="0">
                                        <tr>
                                            <td style="padding: 8px 0; color: #64748b; font-size: 13px; width: 120px;">Report Type:</td>
                                            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 500;">{report_label}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Configuration:</td>
                                            <td style="padding: 8px 0; color: #1e293b; font-size: 13px;">{config_text}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Frequency:</td>
                                            <td style="padding: 8px 0; color: #1e293b; font-size: 13px;">{report['frequency'].title()}</td>
                                        </tr>
                                    </table>
                                </div>
                                
                                <p style="margin: 0 0 25px 0; color: #475569; font-size: 14px; line-height: 1.6;">
                                    Click the button below to view the full report with live data in the FTG Dashboard.
                                </p>
                                
                                <table cellpadding="0" cellspacing="0">
                                    <tr>
                                        <td style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); border-radius: 6px;">
                                            <a href="https://ftg-dashboard.replit.app" style="display: inline-block; padding: 14px 28px; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600;">
                                                View Full Report
                                            </a>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                        
                        <!-- Footer -->
                        <tr>
                            <td style="background-color: #f8fafc; padding: 25px 30px; border-radius: 0 0 8px 8px; border-top: 1px solid #e2e8f0;">
                                <p style="margin: 0; color: #94a3b8; font-size: 12px; line-height: 1.5;">
                                    This automated report was scheduled by {report['user_name']} ({report['user_email']}).
                                    <br>
                                    To manage your scheduled reports, log in to the FTG Dashboard.
                                </p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """
    
    return html_content

# ============== PAYMENTS API (Optimized) ==============

PAYMENTS_EXCLUDED_VENDORS = {
    'Bridge Bank',
    'Payroll4Construction',
    'MISCELLANEOUS VENDOR',
    'Miscellaneous Vendor',
    'Department of the Treasury',
    'Franchise Tax Board',
    'Charles Schwab',
    'Construction Strategies, LLC',
    'Construction Strategies',
    'Construction Strategies LLC',
    'Employee Fiduciary, LLC',
    'Bank of America',
    'Capital One',
    'CaliforniaChoice',
    'Kaiser Foundation Health Plan',
    'CoPower One',
    'Travel costs',
    'Meals and Entertainment',
    'DoorDash Food Delivery',
    'Costco Wholesale',
    'Gas/other vehicle expense'
}

_payments_cache = None
_payments_cache_lock = threading.Lock()

def get_payments_data():
    """Load and cache AP invoices data - only loads once"""
    global _payments_cache
    
    if _payments_cache is not None:
        return _payments_cache
    
    with _payments_cache_lock:
        if _payments_cache is not None:
            return _payments_cache
        
        try:
            # Load AP invoices data
            invoices_path = os.path.join(os.path.dirname(__file__), 'data', 'ap_invoices.json')
            
            with open(invoices_path, 'r', encoding='utf-8-sig') as f:
                invoices_json = json.load(f)
            
            # Process invoices - convert dates and calculate fields
            invoices = []
            total_invoice_amount = 0
            total_retention = 0
            total_paid = 0
            total_remaining = 0
            unique_vendors = set()
            
            for inv in invoices_json.get('invoices', []):
                vendor = inv.get('vendor_name', '')
                if vendor in PAYMENTS_EXCLUDED_VENDORS:
                    continue
                
                try:
                    excel_date = float(inv.get('invoice_date', 0))
                    if excel_date > 0:
                        date_obj = datetime.fromtimestamp((excel_date - 25569) * 86400)
                        date_str = date_obj.strftime('%b %d, %Y')
                    else:
                        date_obj = None
                        date_str = '-'
                except:
                    date_obj = None
                    date_str = '-'
                
                try:
                    invoice_amount = float(inv.get('invoice_amount', 0) or 0)
                except:
                    invoice_amount = 0
                
                try:
                    retention = float(inv.get('retainage_amount', 0) or 0)
                except:
                    retention = 0
                
                try:
                    paid_to_date = float(inv.get('amount_paid_to_date', 0) or 0)
                except:
                    paid_to_date = 0
                
                try:
                    remaining = float(inv.get('remaining_balance', 0) or 0)
                except:
                    remaining = 0
                
                non_retention = invoice_amount - retention
                
                if vendor:
                    unique_vendors.add(vendor)
                
                total_invoice_amount += invoice_amount
                total_retention += retention
                total_paid += paid_to_date
                total_remaining += remaining
                
                invoices.append({
                    'vendor': vendor,
                    'invoice_no': inv.get('invoice_no', '').strip(),
                    'invoice_date': date_str,
                    'invoice_date_sort': date_obj.timestamp() if date_obj else 0,
                    'job_no': inv.get('job_no', ''),
                    'job_description': inv.get('job_description', ''),
                    'project_manager': inv.get('project_manager_name', ''),
                    'non_retention': non_retention,
                    'retention': retention,
                    'invoice_amount': invoice_amount,
                    'paid_to_date': paid_to_date,
                    'remaining_balance': remaining,
                    'status': inv.get('payment_status', '')
                })
            
            _payments_cache = {
                'payments': invoices,
                'metrics': {
                    'totalCount': len(invoices),
                    'totalInvoiceAmount': total_invoice_amount,
                    'totalRetention': total_retention,
                    'totalPaid': total_paid,
                    'totalRemaining': total_remaining,
                    'uniqueVendors': len(unique_vendors)
                }
            }
            
            print(f"[PAYMENTS] Loaded and cached {len(invoices)} AP invoice records")
            return _payments_cache
            
        except Exception as e:
            print(f"[PAYMENTS] Error loading data: {e}")
            import traceback
            traceback.print_exc()
            return {'payments': [], 'metrics': {'totalCount': 0, 'totalInvoiceAmount': 0, 'totalRetention': 0, 'totalPaid': 0, 'totalRemaining': 0, 'uniqueVendors': 0}}

PAYMENTS_VALID_COLUMNS = {'vendor', 'invoice_no', 'invoice_date', 'job_no', 'job_description', 'project_manager', 'non_retention', 'retention', 'invoice_amount', 'paid_to_date', 'remaining_balance', 'status'}

@app.route('/api/payments', methods=['GET', 'OPTIONS'])
def api_get_payments():
    """Get paginated, filtered, sorted payments data"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    try:
        data = get_payments_data()
        payments = list(data['payments'])  # Copy to avoid mutating cache
        
        # Get query params
        page = request.args.get('page', 1, type=int)
        page_size = min(request.args.get('pageSize', 25, type=int), 250)  # Cap at 250
        sort_column = request.args.get('sortColumn', 'invoice_date')
        sort_direction = request.args.get('sortDirection', 'desc')
        
        # Individual filter parameters
        job_filter = request.args.get('job', '').lower().strip()
        vendor_filter = request.args.get('vendor', '').lower().strip()
        invoice_filter = request.args.get('invoice', '').lower().strip()
        pm_filter = request.args.get('pm', '').strip()
        
        # Validate sort column
        if sort_column not in PAYMENTS_VALID_COLUMNS:
            sort_column = 'invoice_date'
        
        # Get column filters (JSON encoded)
        filters_json = request.args.get('filters', '{}')
        try:
            column_filters = json.loads(filters_json)
        except:
            column_filters = {}
        
        # Apply individual search filters
        if job_filter:
            payments = [p for p in payments if job_filter in str(p.get('job_no', '')).lower()]
        if vendor_filter:
            payments = [p for p in payments if vendor_filter in str(p.get('vendor', '')).lower()]
        if invoice_filter:
            payments = [p for p in payments if invoice_filter in str(p.get('invoice_no', '')).lower()]
        if pm_filter:
            payments = [p for p in payments if p.get('project_manager', '') == pm_filter]
        
        # Apply column filters (validate column names)
        for col, values in column_filters.items():
            if col not in PAYMENTS_VALID_COLUMNS:
                continue
            if values and isinstance(values, list) and len(values) > 0:
                # Limit filter values to prevent abuse
                values = values[:1000]
                value_set = set(str(v).lower() for v in values)
                payments = [p for p in payments if str(p.get(col, '')).lower() in value_set]
        
        # Sort using proper numeric/date keys
        sort_key_map = {
            'invoice_date': 'invoice_date_sort',
            'invoice_amount': 'invoice_amount'
        }
        sort_key = sort_key_map.get(sort_column, sort_column)
        reverse = sort_direction == 'desc'
        
        try:
            payments = sorted(payments, key=lambda x: (x.get(sort_key) is None or x.get(sort_key) == '', x.get(sort_key, '')), reverse=reverse)
        except Exception as sort_err:
            print(f"[PAYMENTS] Sort error: {sort_err}")
        
        # Calculate totals for all filtered data
        totals = {
            'non_retention': sum(p.get('non_retention', 0) for p in payments),
            'retention': sum(p.get('retention', 0) for p in payments),
            'invoice_amount': sum(p.get('invoice_amount', 0) for p in payments),
            'paid_to_date': sum(p.get('paid_to_date', 0) for p in payments),
            'remaining_balance': sum(p.get('remaining_balance', 0) for p in payments)
        }
        
        # Paginate
        total = len(payments)
        start_idx = max(0, (page - 1) * page_size)
        end_idx = start_idx + page_size
        page_data = payments[start_idx:end_idx]
        
        return jsonify({
            'success': True,
            'payments': page_data,
            'total': total,
            'totals': totals,
            'page': page,
            'pageSize': page_size,
            'totalPages': max(1, (total + page_size - 1) // page_size)
        })
        
    except Exception as e:
        print(f"[PAYMENTS] API error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e), 'payments': [], 'total': 0, 'page': 1, 'pageSize': 25, 'totalPages': 1}), 500

@app.route('/api/payments/metrics', methods=['GET', 'OPTIONS'])
def api_get_payments_metrics():
    """Get payments summary metrics (cached, very fast)"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    try:
        data = get_payments_data()
        return jsonify({
            'success': True,
            'metrics': data['metrics']
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/payments/pms', methods=['GET', 'OPTIONS'])
def api_get_payments_pms():
    """Get unique project manager values for filter dropdown - only PMs with active jobs"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    try:
        # Get PMs with active jobs from job budgets data
        jobs_path = os.path.join(os.path.dirname(__file__), 'data', 'financials_jobs.json')
        active_pms = set()
        
        if os.path.exists(jobs_path):
            with open(jobs_path, 'r', encoding='utf-8-sig') as f:
                jobs_data = json.load(f)
            for job in jobs_data.get('job_budgets', []):
                if job.get('job_status', '') == 'A':
                    pm = job.get('project_manager_name', '')
                    if pm and pm.strip():
                        active_pms.add(pm.strip())
        
        return jsonify(sorted(list(active_pms)))
    except Exception as e:
        print(f"[PAYMENTS] PMs error: {e}")
        return jsonify([]), 500

@app.route('/api/payments/filter-values', methods=['GET', 'OPTIONS'])
def api_get_payments_filter_values():
    """Get unique values for filter dropdowns"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    try:
        column = request.args.get('column', '')
        if not column:
            return jsonify({'success': False, 'error': 'column parameter required', 'values': []}), 400
        
        # Validate column name
        if column not in PAYMENTS_VALID_COLUMNS:
            return jsonify({'success': False, 'error': 'invalid column', 'values': []}), 400
        
        data = get_payments_data()
        payments = data['payments']
        
        # Get unique values for the column
        values = set()
        for p in payments:
            val = p.get(column, '')
            if val:
                values.add(str(val))
        
        # Sort and limit
        sorted_values = sorted(list(values))[:500]
        
        return jsonify({
            'success': True,
            'values': sorted_values,
            'total': len(values),
            'truncated': len(values) > 500
        })
        
    except Exception as e:
        print(f"[PAYMENTS] Filter values error: {e}")
        return jsonify({'success': False, 'error': str(e), 'values': []}), 500

@app.route('/api/payments/years', methods=['GET', 'OPTIONS'])
def api_get_payments_years():
    """Get available years from AP invoices data (for Top 10 Vendors chart)"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    try:
        # Load AP invoices data (same source as top vendors chart)
        invoices_path = os.path.join(os.path.dirname(__file__), 'data', 'ap_invoices.json')
        with open(invoices_path, 'r', encoding='utf-8-sig') as f:
            invoices_json = json.load(f)
        
        invoices = invoices_json.get('invoices', [])
        
        # Extract unique years from invoice_date (Excel serial dates)
        years = set()
        for inv in invoices:
            date_val = inv.get('invoice_date', '')
            if date_val:
                try:
                    # Convert Excel serial date to year
                    excel_date = float(date_val)
                    if excel_date > 0:
                        from datetime import datetime, timedelta
                        base_date = datetime(1899, 12, 30)
                        actual_date = base_date + timedelta(days=excel_date)
                        year = actual_date.year
                        if 2000 <= year <= 2100:
                            years.add(year)
                except (ValueError, TypeError):
                    pass
        
        # Return sorted years
        sorted_years = sorted(list(years)) if years else [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]
        
        return jsonify({
            'success': True,
            'years': sorted_years
        })
        
    except Exception as e:
        print(f"[PAYMENTS] Years error: {e}")
        return jsonify({'success': False, 'years': [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]}), 500

@app.route('/api/payments/top-vendors', methods=['GET', 'OPTIONS'])
def api_get_top_vendors():
    """Get top 10 vendors by spend within a year range"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    try:
        start_year = int(request.args.get('startYear', 2020))
        end_year = int(request.args.get('endYear', 2025))
        
        # Load raw invoices data directly for accurate date parsing
        invoices_path = os.path.join(os.path.dirname(__file__), 'data', 'ap_invoices.json')
        with open(invoices_path, 'r', encoding='utf-8-sig') as f:
            invoices_json = json.load(f)
        
        invoices = invoices_json.get('invoices', [])
        
        # Use the same exclusion list as the payments table
        excluded_vendors = PAYMENTS_EXCLUDED_VENDORS
        
        # Filter by year range and aggregate by vendor
        vendor_totals = {}
        for inv in invoices:
            date_val = inv.get('invoice_date', '')
            if date_val:
                try:
                    # Convert Excel serial date to year
                    excel_date = float(date_val)
                    if excel_date > 0:
                        date_obj = datetime.fromtimestamp((excel_date - 25569) * 86400)
                        year = date_obj.year
                        if start_year <= year <= end_year:
                            vendor = (inv.get('vendor_name', '') or '').strip()
                            amount = float(inv.get('invoice_amount', 0) or 0)
                            # Skip empty, dash-only, or excluded vendors
                            if vendor and vendor not in excluded_vendors and vendor not in ('-', '--', '---', 'Unknown'):
                                vendor_totals[vendor] = vendor_totals.get(vendor, 0) + amount
                except (ValueError, TypeError):
                    pass
        
        # Sort by total and get top 10
        sorted_vendors = sorted(vendor_totals.items(), key=lambda x: x[1], reverse=True)[:10]
        
        return jsonify({
            'success': True,
            'vendors': [{'vendor': v[0], 'total': v[1]} for v in sorted_vendors],
            'startYear': start_year,
            'endYear': end_year
        })
        
    except Exception as e:
        print(f"[PAYMENTS] Top vendors error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'vendors': [], 'error': str(e)}), 500

@app.route('/api/ap-aging', methods=['GET', 'OPTIONS'])
def api_get_ap_aging():
    """Get AP aging report grouped by vendor with aging buckets - uses metrics cache"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    try:
        search = request.args.get('search', '').strip().lower()
        job_search = request.args.get('job', '').strip().lower()
        pm_filter = request.args.get('pm', '').strip()
        sort_column = request.args.get('sortColumn', 'total_due')
        sort_direction = request.args.get('sortDirection', 'desc')
        
        # Use pre-computed AP metrics from cache
        ap_invoices = metrics_cache.ap
        
        # Use same exclusion list as payments
        excluded_vendors = PAYMENTS_EXCLUDED_VENDORS
        
        # Group by vendor and calculate aging buckets
        vendor_aging = {}
        
        for inv in ap_invoices:
            # Filter by PM if provided
            if pm_filter:
                inv_pm = (inv.get('project_manager', '') or '').strip()
                if inv_pm != pm_filter:
                    continue
            
            # Filter by job number if provided
            if job_search:
                if job_search not in str(inv.get('job_no', '')).lower():
                    continue
            
            vendor = (inv.get('vendor_name', '') or '').strip()
            if not vendor:
                vendor = 'Unknown Vendor'
            
            # Skip excluded vendors
            if vendor in excluded_vendors:
                continue
            
            if vendor not in vendor_aging:
                vendor_aging[vendor] = {
                    'vendor_name': vendor,
                    'total_due': 0,
                    'current': 0,
                    'days_31_60': 0,
                    'days_61_90': 0,
                    'days_90_plus': 0,
                    'retainage': 0
                }
            
            # Use pre-computed values from metrics cache
            remaining = inv.get('remaining_balance', 0)
            retainage = inv.get('retainage', 0)
            aging_bucket = inv.get('aging_bucket', 'current')
            
            # Amount due excluding retainage
            amount_ex_ret = remaining - retainage if retainage > 0 else remaining
            
            # Add to appropriate bucket
            if aging_bucket == 'current':
                vendor_aging[vendor]['current'] += amount_ex_ret
            elif aging_bucket == 'days_31_60':
                vendor_aging[vendor]['days_31_60'] += amount_ex_ret
            elif aging_bucket == 'days_61_90':
                vendor_aging[vendor]['days_61_90'] += amount_ex_ret
            else:
                vendor_aging[vendor]['days_90_plus'] += amount_ex_ret
            
            vendor_aging[vendor]['total_due'] += amount_ex_ret
            vendor_aging[vendor]['retainage'] += retainage
        
        # Convert to list
        vendors_list = list(vendor_aging.values())
        
        # Apply search filter
        if search:
            vendors_list = [v for v in vendors_list if search in v['vendor_name'].lower()]
        
        # Sort - default is multi-column: 90+ desc, then 61-90 desc, then 31-60 desc, then 0-30 desc
        reverse = sort_direction.lower() == 'desc'
        if sort_column == 'days_90_plus':
            vendors_list.sort(key=lambda x: (
                x.get('days_90_plus', 0),
                x.get('days_61_90', 0),
                x.get('days_31_60', 0),
                x.get('current', 0)
            ), reverse=reverse)
        elif sort_column in ['vendor_name']:
            vendors_list.sort(key=lambda x: x.get(sort_column, '').lower(), reverse=reverse)
        else:
            vendors_list.sort(key=lambda x: x.get(sort_column, 0), reverse=reverse)
        
        # Calculate totals
        totals = {
            'total_due': sum(v['total_due'] for v in vendors_list),
            'current': sum(v['current'] for v in vendors_list),
            'days_31_60': sum(v['days_31_60'] for v in vendors_list),
            'days_61_90': sum(v['days_61_90'] for v in vendors_list),
            'days_90_plus': sum(v['days_90_plus'] for v in vendors_list),
            'retainage': sum(v['retainage'] for v in vendors_list)
        }
        
        return jsonify({
            'success': True,
            'vendors': vendors_list,
            'totals': totals,
            'count': len(vendors_list)
        })
        
    except Exception as e:
        print(f"[AP-AGING] Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'vendors': [], 'totals': {}, 'error': str(e)}), 500

@app.route('/api/ap-aging/vendor', methods=['GET', 'OPTIONS'])
def api_get_vendor_invoices():
    """Get all invoices for a specific vendor for AP aging detail view"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    try:
        vendor_name = request.args.get('vendor', '').strip()
        if not vendor_name:
            return jsonify({'success': False, 'error': 'Vendor name required'}), 400
        
        # Load invoices data
        invoices_path = os.path.join(os.path.dirname(__file__), 'data', 'ap_invoices.json')
        with open(invoices_path, 'r', encoding='utf-8-sig') as f:
            invoices_json = json.load(f)
        
        invoices = invoices_json.get('invoices', [])
        
        # Load financials_jobs for job descriptions and PM names
        jobs_path = os.path.join(os.path.dirname(__file__), 'data', 'financials_jobs.json')
        job_info = {}
        try:
            with open(jobs_path, 'r', encoding='utf-8-sig') as f:
                jobs_json = json.load(f)
            for job in jobs_json.get('job_budgets', []):
                job_num = str(job.get('job_no', '')).strip()
                if job_num:
                    job_info[job_num] = {
                        'description': job.get('job_description', ''),
                        'pm': job.get('project_manager_name', '')
                    }
        except Exception as e:
            print(f"[AP-AGING] Could not load jobs data: {e}")
        
        # Filter invoices for this vendor with remaining balance
        vendor_invoices = []
        totals = {
            'invoice_amount': 0,
            'amount_paid': 0,
            'amount_due': 0,
            'retainage': 0,
            'count': 0
        }
        
        for inv in invoices:
            inv_vendor = (inv.get('vendor_name', '') or '').strip()
            if inv_vendor.lower() != vendor_name.lower():
                continue
            
            remaining = float(inv.get('remaining_balance', 0) or 0)
            if remaining <= 0:
                continue
            
            invoice_amount = float(inv.get('invoice_amount', 0) or 0)
            retainage = float(inv.get('retainage_amount', 0) or 0)
            amount_paid = invoice_amount - remaining
            
            # Collectible amount excludes retainage
            collectible = max(0, remaining - retainage)
            
            # Get job info from AP invoice and cross-reference with jobs data
            job_num = str(inv.get('job_no', '') or '').strip()
            job_desc = (inv.get('job_description', '') or '').strip()
            pm_name = (inv.get('project_manager_name', '') or '').strip()
            
            # If job_desc or pm_name not in invoice, try to get from jobs data
            if job_num and job_num in job_info:
                if not job_desc:
                    job_desc = job_info[job_num].get('description', '')
                if not pm_name:
                    pm_name = job_info[job_num].get('pm', '')
            
            # Parse invoice date and calculate days outstanding dynamically
            invoice_date_str = ''
            days_outstanding = 0
            date_val = inv.get('invoice_date')
            if date_val:
                try:
                    excel_date = float(date_val)
                    if excel_date > 0:
                        date_obj = datetime.fromtimestamp((excel_date - 25569) * 86400)
                        invoice_date_str = date_obj.strftime('%m/%d/%Y')
                        days_outstanding = (datetime.now() - date_obj).days
                        if days_outstanding < 0:
                            days_outstanding = 0
                except (ValueError, TypeError):
                    invoice_date_str = str(date_val)
            
            # Determine aging bucket based on days outstanding
            aging_bucket = 'current'
            if days_outstanding > 90:
                aging_bucket = 'days_90_plus'
            elif days_outstanding > 60:
                aging_bucket = 'days_61_90'
            elif days_outstanding > 30:
                aging_bucket = 'days_31_60'
            
            vendor_invoices.append({
                'invoice_number': inv.get('invoice_number', ''),
                'invoice_date': invoice_date_str,
                'job_number': job_num,
                'job_description': job_desc,
                'project_manager': pm_name,
                'collectible': collectible,
                'retainage': retainage,
                'aging_bucket': aging_bucket,
                'days_outstanding': days_outstanding
            })
            
            totals['invoice_amount'] += invoice_amount
            totals['amount_paid'] += amount_paid
            totals['amount_due'] += (remaining - retainage)
            totals['retainage'] += retainage
            totals['count'] += 1
        
        # Sort by days outstanding descending
        vendor_invoices.sort(key=lambda x: x['days_outstanding'], reverse=True)
        
        return jsonify({
            'success': True,
            'vendor': vendor_name,
            'invoices': vendor_invoices,
            'totals': totals
        })
        
    except Exception as e:
        print(f"[AP-AGING] Vendor detail error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'invoices': [], 'error': str(e)}), 500

# ============== AR/AP SUMMARY FOR OVERVIEW ==============

@app.route('/api/ar-ap-summary', methods=['GET', 'OPTIONS'])
def api_get_ar_ap_summary():
    """Get AR and AP totals excluding retainage for overview charts"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    try:
        # Load AR invoices
        ar_invoices_path = os.path.join(os.path.dirname(__file__), 'data', 'ar_invoices.json')
        with open(ar_invoices_path, 'r', encoding='utf-8-sig') as f:
            ar_json = json.load(f)
        
        ar_invoices = ar_json.get('invoices', [])
        
        # Calculate AR totals excluding retainage
        ar_totals = {'current': 0, 'days_31_60': 0, 'days_61_90': 0, 'days_90_plus': 0, 'total': 0, 'retainage': 0}
        
        for inv in ar_invoices:
            calc_due = float(inv.get('calculated_amount_due', 0) or 0)
            if calc_due <= 0:
                continue
            
            retainage = float(inv.get('retainage_amount', 0) or 0)
            collectible = max(0, calc_due - retainage)
            
            ar_totals['retainage'] += retainage
            
            # Calculate days past due from due_date
            due_date_val = inv.get('due_date')
            days_past_due = 0
            if due_date_val:
                try:
                    excel_date = float(due_date_val)
                    if excel_date > 0:
                        due_date_obj = datetime.fromtimestamp((excel_date - 25569) * 86400)
                        days_past_due = (datetime.now() - due_date_obj).days
                        if days_past_due < 0:
                            days_past_due = 0
                except (ValueError, TypeError):
                    pass
            
            # Assign to aging bucket
            if days_past_due > 90:
                ar_totals['days_90_plus'] += collectible
            elif days_past_due > 60:
                ar_totals['days_61_90'] += collectible
            elif days_past_due > 30:
                ar_totals['days_31_60'] += collectible
            else:
                ar_totals['current'] += collectible
        
        ar_totals['total'] = ar_totals['current'] + ar_totals['days_31_60'] + ar_totals['days_61_90'] + ar_totals['days_90_plus']
        
        # Load AP invoices
        ap_invoices_path = os.path.join(os.path.dirname(__file__), 'data', 'ap_invoices.json')
        with open(ap_invoices_path, 'r', encoding='utf-8-sig') as f:
            ap_json = json.load(f)
        
        ap_invoices = ap_json.get('invoices', [])
        
        # Calculate AP totals excluding retainage
        ap_totals = {'current': 0, 'days_31_60': 0, 'days_61_90': 0, 'days_90_plus': 0, 'total': 0, 'retainage': 0}
        
        for inv in ap_invoices:
            remaining = float(inv.get('remaining_balance', 0) or 0)
            if remaining <= 0:
                continue
            
            retainage = float(inv.get('retainage_amount', 0) or 0)
            collectible = max(0, remaining - retainage)
            
            ap_totals['retainage'] += retainage
            
            # Calculate days outstanding from invoice_date
            date_val = inv.get('invoice_date')
            days_outstanding = 0
            if date_val:
                try:
                    excel_date = float(date_val)
                    if excel_date > 0:
                        date_obj = datetime.fromtimestamp((excel_date - 25569) * 86400)
                        days_outstanding = (datetime.now() - date_obj).days
                        if days_outstanding < 0:
                            days_outstanding = 0
                except (ValueError, TypeError):
                    pass
            
            # Assign to aging bucket
            if days_outstanding > 90:
                ap_totals['days_90_plus'] += collectible
            elif days_outstanding > 60:
                ap_totals['days_61_90'] += collectible
            elif days_outstanding > 30:
                ap_totals['days_31_60'] += collectible
            else:
                ap_totals['current'] += collectible
        
        ap_totals['total'] = ap_totals['current'] + ap_totals['days_31_60'] + ap_totals['days_61_90'] + ap_totals['days_90_plus']
        
        # Calculate ratio
        ratio = ar_totals['total'] / ap_totals['total'] if ap_totals['total'] > 0 else 0
        
        return jsonify({
            'success': True,
            'ar': ar_totals,
            'ap': ap_totals,
            'ratio': round(ratio, 2)
        })
        
    except Exception as e:
        print(f"[AR-AP-SUMMARY] Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

# ============== CANONICAL METRICS API ==============
# These endpoints serve pre-computed metrics from the metrics_etl module
# Providing a single source of truth for both pages and NLQ queries

@app.route('/api/metrics/refresh', methods=['POST'])
def api_refresh_metrics():
    """Manually refresh the metrics cache"""
    try:
        init_metrics()
        return jsonify({
            'success': True,
            'message': 'Metrics refreshed successfully',
            'last_refresh': metrics_cache.last_refresh.isoformat() if metrics_cache.last_refresh else None,
            'counts': {
                'jobs': len(metrics_cache.jobs),
                'ar': len(metrics_cache.ar),
                'ap': len(metrics_cache.ap),
                'pm': len(metrics_cache.pm)
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/metrics/jobs', methods=['GET'])
def api_metrics_jobs():
    """Get pre-computed job metrics"""
    try:
        pm = request.args.get('pm', '').strip()
        status = request.args.get('status', '').strip()
        customer = request.args.get('customer', '').strip()
        has_budget = request.args.get('has_budget', '').strip()
        sort_by = request.args.get('sort_by', 'contract')
        limit = int(request.args.get('limit', 100))
        exclude_josh = request.args.get('exclude_josh', 'true').lower() == 'true'
        
        has_budget_filter = None
        if has_budget == 'true':
            has_budget_filter = True
        elif has_budget == 'false':
            has_budget_filter = False
        
        jobs = metrics_cache.filter_jobs(
            exclude_josh=exclude_josh,
            pm=pm if pm else None,
            status=status if status else None,
            customer=customer if customer else None,
            has_budget=has_budget_filter
        )
        
        if sort_by == 'contract':
            jobs = sorted(jobs, key=lambda x: x['contract'], reverse=True)
        elif sort_by == 'backlog':
            jobs = sorted(jobs, key=lambda x: x['backlog'], reverse=True)
        elif sort_by == 'margin':
            jobs = sorted(jobs, key=lambda x: x['margin'], reverse=True)
        
        return jsonify({
            'success': True,
            'jobs': jobs[:limit],
            'total_count': len(jobs),
            'summary': metrics_cache.get_jobs_summary(active_only=(status == 'A'))
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/metrics/ar', methods=['GET'])
def api_metrics_ar():
    """Get pre-computed AR metrics"""
    try:
        customer = request.args.get('customer', '').strip()
        pm = request.args.get('pm', '').strip()
        
        invoices = metrics_cache.filter_ar(
            customer=customer if customer else None,
            pm=pm if pm else None
        )
        
        return jsonify({
            'success': True,
            'invoices': invoices,
            'by_customer': metrics_cache.ar_by_customer,
            'summary': metrics_cache.get_ar_summary()
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/metrics/ap', methods=['GET'])
def api_metrics_ap():
    """Get pre-computed AP metrics"""
    try:
        vendor = request.args.get('vendor', '').strip()
        pm = request.args.get('pm', '').strip()
        
        invoices = metrics_cache.filter_ap(
            vendor=vendor if vendor else None,
            pm=pm if pm else None
        )
        
        return jsonify({
            'success': True,
            'invoices': invoices,
            'by_vendor': metrics_cache.ap_by_vendor,
            'summary': metrics_cache.get_ap_summary()
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/metrics/pm', methods=['GET'])
def api_metrics_pm():
    """Get pre-computed PM metrics"""
    try:
        pm = request.args.get('pm', '').strip()
        
        pm_data = metrics_cache.pm
        if pm:
            pm_data = [p for p in pm_data if pm.lower() in p['project_manager'].lower()]
        
        return jsonify({
            'success': True,
            'pm_metrics': pm_data
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/metrics/summary', methods=['GET'])
def api_metrics_summary():
    """Get all summary metrics at once"""
    try:
        return jsonify({
            'success': True,
            'jobs': metrics_cache.get_jobs_summary(active_only=True),
            'ar': metrics_cache.get_ar_summary(),
            'ap': metrics_cache.get_ap_summary(),
            'last_refresh': metrics_cache.last_refresh.isoformat() if metrics_cache.last_refresh else None
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# ============== AR AGING API ==============

@app.route('/api/ar-aging', methods=['GET', 'OPTIONS'])
def api_get_ar_aging():
    """Get AR aging report grouped by customer with aging buckets - uses metrics cache"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    try:
        search = request.args.get('search', '').strip().lower()
        sort_column = request.args.get('sortColumn', 'total_due')
        sort_direction = request.args.get('sortDirection', 'desc')
        pm_filter = request.args.get('pm', '').strip()
        customer_filter = request.args.get('customer', '').strip()
        
        # Use pre-computed AR metrics from cache
        ar_invoices = metrics_cache.ar
        
        # Group by customer and calculate aging buckets
        customer_aging = {}
        
        for inv in ar_invoices:
            # Filter by PM if specified
            if pm_filter:
                inv_pm = (inv.get('project_manager', '') or '').strip()
                if inv_pm.lower() != pm_filter.lower():
                    continue
            
            customer = (inv.get('customer_name', '') or '').strip()
            if not customer:
                customer = 'Unknown Customer'
            
            # Filter by customer if specified
            if customer_filter:
                if customer.lower() != customer_filter.lower():
                    continue
            
            if customer not in customer_aging:
                customer_aging[customer] = {
                    'customer_name': customer,
                    'total_due': 0,
                    'current': 0,
                    'days_31_60': 0,
                    'days_61_90': 0,
                    'days_90_plus': 0,
                    'retainage': 0
                }
            
            # Use pre-computed values from metrics cache
            collectible = inv.get('collectible', 0)
            retainage = inv.get('retainage', 0)
            aging_bucket = inv.get('aging_bucket', 'current')
            
            # Add collectible amount to appropriate aging bucket
            if aging_bucket == 'current':
                customer_aging[customer]['current'] += collectible
            elif aging_bucket == 'days_31_60':
                customer_aging[customer]['days_31_60'] += collectible
            elif aging_bucket == 'days_61_90':
                customer_aging[customer]['days_61_90'] += collectible
            else:
                customer_aging[customer]['days_90_plus'] += collectible
            
            customer_aging[customer]['total_due'] += collectible
            customer_aging[customer]['retainage'] += retainage
        
        # Convert to list
        customers_list = list(customer_aging.values())
        
        # Apply search filter
        if search:
            customers_list = [c for c in customers_list if search in c['customer_name'].lower()]
        
        # Sort - default is multi-column: 90+ desc, 61-90 desc, 31-60 desc, 0-30 desc, retainage desc
        reverse = sort_direction.lower() == 'desc'
        if sort_column == 'days_90_plus' or sort_column == 'total_due':
            customers_list.sort(key=lambda x: (
                x.get('days_90_plus', 0),
                x.get('days_61_90', 0),
                x.get('days_31_60', 0),
                x.get('current', 0),
                x.get('retainage', 0)
            ), reverse=True)
        elif sort_column in ['customer_name']:
            customers_list.sort(key=lambda x: x.get(sort_column, '').lower(), reverse=reverse)
        else:
            customers_list.sort(key=lambda x: x.get(sort_column, 0), reverse=reverse)
        
        # Calculate totals
        totals = {
            'total_due': sum(c['total_due'] for c in customers_list),
            'current': sum(c['current'] for c in customers_list),
            'days_31_60': sum(c['days_31_60'] for c in customers_list),
            'days_61_90': sum(c['days_61_90'] for c in customers_list),
            'days_90_plus': sum(c['days_90_plus'] for c in customers_list),
            'retainage': sum(c['retainage'] for c in customers_list)
        }
        
        return jsonify({
            'success': True,
            'customers': customers_list,
            'totals': totals,
            'count': len(customers_list)
        })
        
    except Exception as e:
        print(f"[AR-AGING] Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'customers': [], 'totals': {}, 'error': str(e)}), 500

@app.route('/api/ar-aging/filters', methods=['GET', 'OPTIONS'])
def api_get_ar_aging_filters():
    """Get distinct customers and PMs for filter dropdowns - only PMs with active jobs"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    try:
        # Get PMs with active jobs from job budgets data
        jobs_path = os.path.join(os.path.dirname(__file__), 'data', 'financials_jobs.json')
        active_pms = set()
        
        if os.path.exists(jobs_path):
            with open(jobs_path, 'r', encoding='utf-8-sig') as f:
                jobs_data = json.load(f)
            for job in jobs_data.get('job_budgets', []):
                if job.get('job_status', '') == 'A':
                    pm = job.get('project_manager_name', '')
                    if pm and pm.strip():
                        active_pms.add(pm.strip())
        
        # Get unique customers from AR invoices with amount due
        invoices_path = os.path.join(os.path.dirname(__file__), 'data', 'ar_invoices.json')
        with open(invoices_path, 'r', encoding='utf-8-sig') as f:
            invoices_json = json.load(f)
        
        invoices = invoices_json.get('invoices', [])
        
        customers = set()
        
        for inv in invoices:
            calc_due = float(inv.get('calculated_amount_due', 0) or 0)
            if calc_due <= 0:
                continue
            
            customer = (inv.get('customer_name', '') or '').strip()
            if customer:
                customers.add(customer)
        
        return jsonify({
            'success': True,
            'customers': sorted(list(customers)),
            'pms': sorted(list(active_pms))
        })
        
    except Exception as e:
        print(f"[AR-AGING-FILTERS] Error: {e}")
        return jsonify({'success': False, 'customers': [], 'pms': [], 'error': str(e)}), 500

@app.route('/api/ar-aging/customer', methods=['GET', 'OPTIONS'])
def api_get_customer_invoices():
    """Get all invoices for a specific customer for AR aging detail view"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    try:
        customer_name = request.args.get('customer', '').strip()
        if not customer_name:
            return jsonify({'success': False, 'error': 'Customer name required'}), 400
        
        # Load AR invoices data
        invoices_path = os.path.join(os.path.dirname(__file__), 'data', 'ar_invoices.json')
        with open(invoices_path, 'r', encoding='utf-8-sig') as f:
            invoices_json = json.load(f)
        
        invoices = invoices_json.get('invoices', [])
        
        # Filter invoices for this customer with amount due
        customer_invoices = []
        totals = {
            'invoice_amount': 0,
            'amount_paid': 0,
            'amount_due': 0,
            'retainage': 0,
            'count': 0
        }
        
        for inv in invoices:
            inv_customer = (inv.get('customer_name', '') or '').strip()
            if inv_customer.lower() != customer_name.lower():
                continue
            
            # Use calculated_amount_due as the actual outstanding balance
            calc_due = float(inv.get('calculated_amount_due', 0) or 0)
            if calc_due <= 0:
                continue
            
            invoice_amount = float(inv.get('invoice_amount', 0) or 0)
            retainage = float(inv.get('retainage_amount', 0) or 0)
            total_cash = float(inv.get('total_cash_applied', 0) or 0)
            total_adj = float(inv.get('total_adjustments_applied', 0) or 0)
            total_applied = total_cash + total_adj
            
            # Collectible amount excludes retainage
            collectible = max(0, calc_due - retainage)
            
            # Parse invoice date and calculate days outstanding dynamically
            invoice_date_str = ''
            days_outstanding = 0
            invoice_date_val = inv.get('invoice_date')
            if invoice_date_val:
                try:
                    excel_date = float(invoice_date_val)
                    if excel_date > 0:
                        invoice_date_obj = datetime.fromtimestamp((excel_date - 25569) * 86400)
                        invoice_date_str = invoice_date_obj.strftime('%m/%d/%Y')
                        days_outstanding = (datetime.now() - invoice_date_obj).days
                        if days_outstanding < 0:
                            days_outstanding = 0
                except (ValueError, TypeError):
                    invoice_date_str = str(invoice_date_val)
            
            # Determine aging bucket based on days since invoice date
            aging_bucket = 'current'
            if days_outstanding > 90:
                aging_bucket = 'days_90_plus'
            elif days_outstanding > 60:
                aging_bucket = 'days_61_90'
            elif days_outstanding > 30:
                aging_bucket = 'days_31_60'
            
            customer_invoices.append({
                'invoice_number': inv.get('invoice_no', ''),
                'invoice_date': invoice_date_str,
                'job_number': inv.get('job_no', ''),
                'job_description': inv.get('job_description', ''),
                'project_manager': inv.get('project_manager_name', ''),
                'collectible': collectible,
                'retainage': retainage,
                'aging_bucket': aging_bucket,
                'days_outstanding': days_outstanding
            })
            
            totals['invoice_amount'] += invoice_amount
            totals['amount_paid'] += total_applied
            totals['amount_due'] += calc_due
            totals['retainage'] += retainage
            totals['count'] += 1
        
        # Sort by days outstanding descending
        customer_invoices.sort(key=lambda x: x['days_outstanding'], reverse=True)
        
        return jsonify({
            'success': True,
            'customer': customer_name,
            'invoices': customer_invoices,
            'totals': totals
        })
        
    except Exception as e:
        print(f"[AR-AGING] Customer detail error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'invoices': [], 'error': str(e)}), 500

# =============================================================================
# NATURAL LANGUAGE QUERY ENDPOINT FOR AI INSIGHTS
# =============================================================================

# Comprehensive semantic data catalog for flexible NLQ
NLQ_SEMANTIC_CATALOG = """
=== FTG BUILDERS FINANCIAL DATA CATALOG ===

ENTITY: Job
  Source: job_budgets (4259 records)
  Fields:
    - job_no (string): Unique job identifier
    - job_description (string): Project name/description
    - project_manager_name (string): PM responsible for job
    - customer_name (string): Client name
    - job_status (string): A=Active, C=Closed, I=Inactive, O=Overhead
    - original_contract (number): Initial contract value
    - revised_contract (number): Current contract value after change orders
    - original_cost (number): Initial budget cost
    - revised_cost (number): Current budget cost (aka budget_cost)
  Computed (matches Job Overview/Actuals page):
    - actual_cost: Sum of Value from job_actuals where Job_No matches
    - billed: From job_billed_revenue.Billed_Revenue
    - has_budget (boolean): True if revised_cost > 0 (CRITICAL for completion calc)
    - percent_complete: actual_cost / budget_cost * 100 (0% when no budget!)
    - earned_revenue: (actual_cost / budget_cost) * contract (only if has_budget)
    - backlog: contract - earned_revenue (remaining work value)
    - estimated_profit: contract - budget_cost
    - margin (profit_margin): (contract - budget_cost) / contract * 100
    - over_under_billing: billed - earned_revenue (positive=overbilled)
  IMPORTANT: Jobs WITHOUT budgets (has_budget=false) show 0% completion but may have actual_cost!
  When asked about completion, check has_budget and report actual_cost for jobs missing budgets.
  IMPORTANT: For "current" backlog or completion questions, use job_status='A' (active jobs only).
  Completed jobs may show negative backlog (earned > contract) which distorts totals.
  Relationships:
    - Links to AR invoices via job_no
    - Links to AP invoices via job_no
    - Links to job_actuals via Job_No (note capital letters)
    - Links to job_billed_revenue via Job_No

ENTITY: JobActual (cost detail)
  Source: job_actuals (19349 records)
  Fields:
    - Job_No (string): Links to job_budgets.job_no
    - Job_Description (string)
    - Project_Manager (string)
    - Cost_Code_No (string): Cost category code
    - Cost_Code_Description (string): Cost category name
    - Value (number): Actual cost amount

ENTITY: ARInvoice (accounts receivable)
  Source: ar_invoices (324 records)
  Fields:
    - customer_name (string): Client name
    - invoice_no (string): Invoice identifier
    - invoice_amount (number): Original invoice total
    - calculated_amount_due (number): Current balance (total owed including retainage)
    - retainage_amount (number): Held retainage (cannot be collected until job complete)
    - amount_paid_to_date (number)
    - days_outstanding (number): Age in days from invoice date
    - aging_bucket (string): current (0-30)/31-60/61-90/90+
    - project_manager_name (string)
    - job_no (string): Links to jobs
    - job_description (string)
  Computed (matches AR Aging page):
    - collectible: calculated_amount_due - retainage_amount (what can be collected now)
    - total_due: calculated_amount_due (collectible + retainage)
  Aging buckets use COLLECTIBLE amounts, retainage tracked separately
  Note: Only invoices with calculated_amount_due > 0 are included (fully paid excluded)

ENTITY: APInvoice (accounts payable)
  Source: ap_invoices (55391 records)
  Fields:
    - vendor_name (string): Supplier/vendor name
    - invoice_no (string)
    - invoice_date (string)
    - invoice_amount (number): Original amount
    - remaining_balance (number): Amount still owed
    - retainage_amount (number)
    - amount_paid_to_date (number)
    - days_outstanding (number)
    - aging_bucket (string)
    - payment_status (string)
    - job_no (string): Links to jobs
    - job_description (string)
    - project_manager_name (string)

ENTITY: GLAccount (general ledger)
  Source: gl_history_all (179 accounts)
  Fields:
    - Account_Num (number): 4-digit account code
    - Account_Description (string): Account name
    - Monthly columns: "2020-01" through "2025-12" (actual amounts)
  Income Statement Structure (from account_groups.json):
    - Revenue: 4000 (Contract Revenue) + 4090 (Over/Under Billing)
    - Direct Expenses: 5000-5025 (Direct Labor) + 5200 (Materials) + 5300 (Subcontracts) + 5410 (Rented Equipment) + 5500 (Other Direct)
    - Indirect Expenses: 6010-6065 (Indirect Labor) + 6xxx (Other Indirect)
    - Total Cost of Sales: Direct Expenses + Indirect Expenses
    - Gross Profit: Revenue - Total Cost of Sales
    - Operating Expenses: 7000-7599 (Salaries & Benefits, Admin, Facility, etc.)
    - Operating Income: Gross Profit - Operating Expenses
  Key Account Ranges for NLQ:
    - [4000, 5000]: Revenue accounts only
    - [5000, 6000]: Direct costs
    - [6000, 7000]: Indirect costs
    - [7000, 8000]: Operating/SG&A expenses

ENTITY: CashAccount
  Source: Google Sheets API (/api/cash-data)
  Fields:
    - name (string): Account name (contains 1883, 2469, or 7554 for FTG Builders)
    - balance (number): Current balance
    - last_update (string): Last sync date

ENTITY: CashTransaction
  Source: Google Sheets API transactions array
  Fields:
    - date (string): YYYY-MM-DD format
    - account (string): Account name
    - amount (number): Positive=deposit, negative=withdrawal
    - description (string): Transaction description
    - payee (string): Payee name if available
    - category (string): Transaction category

=== QUERY TARGET SELECTION GUIDE ===

pm_summary: ALWAYS use for PM metrics queries (margin, profit, jobs, contract, performance)
  - "What is [PM name]'s margin/profit?" -> pm_summary with filters.pm="[PM name]"
  - "Which PM has the lowest margin?" -> pm_summary with aggregation=margin_analysis or bottom
  - "Top PMs by contract value" -> pm_summary with aggregation=top
  - "[PM name]'s active/closed projects" -> pm_summary with filters.pm="[PM name]" (includes active_jobs count)
  CRITICAL: pm_summary has pre-computed profit/margin from ALL jobs with proper closed vs active logic:
    - Closed jobs: profit = billed - actual_cost, margin = profit/billed
    - Active jobs: profit = contract - budget_cost, margin = profit/contract
  Fields available: pm, jobs, active_jobs, closed_jobs, jobs_with_budget, jobs_valid_for_profit, contract, budget_cost, actual_cost, billed, earned_revenue, backlog, profit, margin, avg_completion
  Status-specific fields: active_profit, active_margin, active_valid_for_profit, closed_profit, closed_margin, closed_valid_for_profit
  Use these for questions like "what is [PM]'s active project margin vs closed project margin"
  
pm_comparison: Use ONLY when comparing 2+ specific named PMs side by side
  - "Compare Rodney and Pedro metrics" -> pm_comparison with filters.pm="Rodney,Pedro"

jobs: Use for INDIVIDUAL job-level queries or listing specific jobs. NOT for PM aggregate metrics.
  - "List jobs for [PM name]" -> jobs with filters.pm="[PM name]" (returns individual jobs)
  - "What are [PM name]'s lowest margin jobs?" -> jobs with filters.pm and aggregation=bottom
  DO NOT use jobs target for questions about PM total/overall/average margin - use pm_summary instead.
  WARNING: jobs with aggregation=by_pm uses INCORRECT margin calculation. Always use pm_summary for PM metrics.

cost_codes: Use for cost code analysis across jobs
customers: Use for customer-level aggregations combining jobs and AR data

=== COMMON ANALYSIS PATTERNS ===

PM Performance: Use target=pm_summary, aggregation=top/bottom/margin_analysis
Customer Analysis: Use target=customers or jobs with aggregation=by_customer
Vendor Analysis: Use target=ap with aggregation=by_vendor
Job Health: Use target=jobs with status filter and percent_complete/margin fields
Aging Analysis: Use target=ar or ap with aggregation=aging
Time Trends: Use target=gl with aggregation=by_year or by_month
Cash Flow: Use target=cash with aggregation=transactions and date_range filter

=== EXCLUSIONS ===
Always exclude "Josh Angelo" from all PM analysis.
FTG Builders cash accounts contain "1883", "2469", or "7554" in name.
"""

def load_nlq_data():
    """Load all data sources for NLQ queries"""
    data = {}
    data_dir = os.path.join(os.path.dirname(__file__), 'data')
    
    try:
        with open(os.path.join(data_dir, 'financials_jobs.json'), 'r', encoding='utf-8-sig') as f:
            data['jobs'] = json.load(f)
    except Exception as e:
        print(f"[NLQ] Jobs data load error: {e}")
        data['jobs'] = {}
    
    try:
        with open(os.path.join(data_dir, 'ar_invoices.json'), 'r', encoding='utf-8-sig') as f:
            data['ar'] = json.load(f)
    except Exception as e:
        print(f"[NLQ] AR data load error: {e}")
        data['ar'] = {}
    
    try:
        with open(os.path.join(data_dir, 'ap_invoices.json'), 'r', encoding='utf-8-sig') as f:
            data['ap'] = json.load(f)
    except Exception as e:
        print(f"[NLQ] AP data load error: {e}")
        data['ap'] = {}
    
    try:
        with open(os.path.join(data_dir, 'financials_gl.json'), 'r', encoding='utf-8-sig') as f:
            data['gl'] = json.load(f)
    except Exception as e:
        print(f"[NLQ] GL data load error: {e}")
        data['gl'] = {}
    
    return data

def execute_nlq_query(query_plan, data):
    """Execute a structured query plan against the data.
    
    Uses the pre-computed metrics from metrics_cache for jobs, AR, and AP
    to ensure consistency with page-level calculations.
    """
    results = {}
    
    try:
        target = query_plan.get('target_data', '')
        filters = query_plan.get('filters', {})
        aggregation = query_plan.get('aggregation', 'list')
        fields = query_plan.get('fields', [])
        # Default limit: 50 for listing queries (enough for meaningful analysis)
        # Aggregate queries (sum, average, count) don't use limit - they use full dataset
        limit = query_plan.get('limit', 50)
        
        # PM name matching helper
        def pm_matches(pm_name, filter_pm):
            if not filter_pm:
                return True
            pm_lower = (pm_name or '').lower()
            filter_lower = filter_pm.lower()
            return filter_lower in pm_lower or pm_lower.startswith(filter_lower)
        
        # JOBS queries - use pre-computed metrics from cache
        if target == 'jobs':
            # Get pre-computed job metrics from cache
            all_jobs = metrics_cache.jobs
            
            # Apply filters
            filtered = []
            for job in all_jobs:
                pm = job.get('project_manager', '')
                # Exclude Josh Angelo
                if 'josh angelo' in pm.lower():
                    continue
                
                job_no = str(job.get('job_no', ''))
                
                # Apply filters
                if filters.get('job_no') and str(filters['job_no']) != job_no:
                    continue
                if filters.get('pm') and not pm_matches(pm, filters['pm']):
                    continue
                if filters.get('status') and job.get('job_status') != filters['status']:
                    continue
                if filters.get('customer'):
                    cust = (job.get('customer_name') or '').lower()
                    if filters['customer'].lower() not in cust:
                        continue
                
                # Map metrics cache field names to NLQ expected field names
                job_data = {
                    'job_no': job_no,
                    'description': job.get('job_description', ''),
                    'pm': pm,
                    'customer': job.get('customer_name', ''),
                    'status': job.get('job_status', ''),
                    'contract': job.get('contract', 0),
                    'budget_cost': job.get('budget_cost', 0),
                    'actual_cost': job.get('actual_cost', 0),
                    'billed': job.get('billed', 0),
                    'has_budget': job.get('has_budget', False),
                    'percent_complete': job.get('percent_complete', 0),
                    'earned_revenue': job.get('earned_revenue', 0),
                    'backlog': job.get('backlog', 0),
                    'profit': job.get('profit', 0),
                    'margin': job.get('margin', 0),
                    'over_under_billing': job.get('over_under_billing', 0),
                    'valid_for_profit': job.get('valid_for_profit', False),
                    'profit_basis': job.get('profit_basis', '')
                }
                
                filtered.append(job_data)
            
            # Field name aliases (map schema names to internal names)
            field_aliases = {
                'revised_contract': 'contract',
                'revised_cost': 'budget_cost',
                'project_manager_name': 'pm',
                'job_description': 'description',
                'customer_name': 'customer',
                'job_status': 'status'
            }
            
            # Aggregations
            if aggregation == 'count':
                results = {'count': len(filtered)}
            elif aggregation == 'sum':
                field = fields[0] if fields else 'contract'
                field = field_aliases.get(field, field)  # Apply alias
                
                # For metrics that require budgets, only sum jobs with budgets
                jobs_with_budget = [j for j in filtered if j['has_budget']]
                jobs_without_budget = [j for j in filtered if not j['has_budget']]
                
                # Backlog and earned_revenue only make sense for jobs with budgets
                if field in ['backlog', 'earned_revenue', 'percent_complete']:
                    total = sum(j.get(field, 0) for j in jobs_with_budget)
                    results = {
                        'total': round(total, 2), 
                        'field': field, 
                        'jobs_counted': len(jobs_with_budget),
                        'jobs_with_budget': len(jobs_with_budget),
                        'jobs_without_budget': len(jobs_without_budget),
                        'note': f'Only jobs with budgets included. {len(jobs_without_budget)} jobs have no budget set.'
                    }
                else:
                    results = {'total': sum(j.get(field, 0) for j in filtered), 'field': field, 'count': len(filtered)}
            elif aggregation == 'average':
                field = fields[0] if fields else 'margin'
                field = field_aliases.get(field, field)  # Apply alias
                
                # For completion and margin, only average jobs with budgets
                jobs_with_budget = [j for j in filtered if j['has_budget']]
                jobs_without_budget = [j for j in filtered if not j['has_budget']]
                
                if field in ['percent_complete', 'margin', 'earned_revenue', 'backlog']:
                    values = [j.get(field, 0) for j in jobs_with_budget]
                    avg = sum(values) / len(values) if values else 0
                    results = {
                        'average': round(avg, 1), 
                        'field': field, 
                        'jobs_counted': len(jobs_with_budget),
                        'jobs_with_budget': len(jobs_with_budget),
                        'jobs_without_budget': len(jobs_without_budget),
                        'note': f'Average is calculated only for jobs with budgets. {len(jobs_without_budget)} jobs excluded (no budget).'
                    }
                else:
                    values = [j.get(field, 0) for j in filtered]
                    results = {'average': round(sum(values) / len(values) if values else 0, 1), 'field': field, 'count': len(filtered)}
            elif aggregation == 'top':
                # Use sort_by from query plan, fallback to contract
                sort_field = query_plan.get('sort_by') or 'contract'
                sort_field = field_aliases.get(sort_field, sort_field)  # Apply alias
                filtered.sort(key=lambda x: x.get(sort_field, 0), reverse=True)
                # Include aggregate totals from FULL dataset
                valid_for_profit = [j for j in filtered if j.get('valid_for_profit', False)]
                results = {
                    'items': filtered[:limit], 
                    'sort_by': sort_field,
                    'total_count': len(filtered),
                    'total_contract': sum(j['contract'] for j in filtered),
                    'total_profit': round(sum(j['profit'] for j in valid_for_profit), 2),
                    'avg_margin': round(sum(j['margin'] for j in valid_for_profit) / len(valid_for_profit), 2) if valid_for_profit else 0,
                    'note': f'Showing top {min(limit or 50, len(filtered))} of {len(filtered)} jobs. Totals from ALL {len(filtered)} jobs.'
                }
            elif aggregation == 'closest_to_completion':
                # Filter for jobs with budgets and sort by percent_complete descending
                with_budgets = [j for j in filtered if j['budget_cost'] > 0 and j['percent_complete'] > 0 and j['percent_complete'] < 100]
                with_budgets.sort(key=lambda x: x['percent_complete'], reverse=True)
                results = {'items': with_budgets[:limit or 10], 'total_with_budgets': len(with_budgets)}
            elif aggregation == 'by_pm':
                # Group jobs by PM with comprehensive metrics
                by_pm = {}
                for j in filtered:
                    pm = j['pm']
                    if pm not in by_pm:
                        by_pm[pm] = {
                            'pm': pm, 'job_count': 0, 'active_jobs': 0, 'jobs_with_budget': 0,
                            'contract': 0, 'budget_cost': 0, 'actual_cost': 0, 'billed': 0,
                            'earned_revenue': 0, 'backlog': 0
                        }
                    by_pm[pm]['job_count'] += 1
                    if j['status'] == 'A':
                        by_pm[pm]['active_jobs'] += 1
                    if j['has_budget']:
                        by_pm[pm]['jobs_with_budget'] += 1
                    by_pm[pm]['contract'] += j['contract']
                    by_pm[pm]['budget_cost'] += j['budget_cost']
                    by_pm[pm]['actual_cost'] += j['actual_cost']
                    by_pm[pm]['billed'] += j['billed']
                    by_pm[pm]['earned_revenue'] += j['earned_revenue']
                    by_pm[pm]['backlog'] += j['backlog']
                
                for pm_data in by_pm.values():
                    # Calculate overall margin for PM
                    if pm_data['contract'] > 0:
                        pm_data['margin'] = round((pm_data['contract'] - pm_data['budget_cost']) / pm_data['contract'] * 100, 1)
                    else:
                        pm_data['margin'] = 0
                    # Over/under billing
                    pm_data['over_under_billing'] = round(pm_data['billed'] - pm_data['earned_revenue'], 2)
                    # Weighted avg completion (only for jobs with budgets)
                    if pm_data['budget_cost'] > 0:
                        pm_data['avg_completion'] = round(pm_data['actual_cost'] / pm_data['budget_cost'] * 100, 1)
                    else:
                        pm_data['avg_completion'] = 0
                
                # Use sort_by from query plan
                sort_field = query_plan.get('sort_by') or 'contract'
                sort_field = field_aliases.get(sort_field, sort_field)
                sorted_pms = sorted(by_pm.values(), key=lambda x: x.get(sort_field, 0), reverse=True)
                results = {'items': sorted_pms[:limit or 20], 'total_pms': len(by_pm)}
            elif aggregation == 'by_customer':
                # Group jobs by customer
                by_cust = {}
                for j in filtered:
                    cust = j['customer']
                    if cust not in by_cust:
                        by_cust[cust] = {'customer': cust, 'job_count': 0, 'contract': 0}
                    by_cust[cust]['job_count'] += 1
                    by_cust[cust]['contract'] += j['contract']
                
                sorted_custs = sorted(by_cust.values(), key=lambda x: x['contract'], reverse=True)
                results = {'items': sorted_custs[:limit or 20], 'total_customers': len(by_cust)}
            elif aggregation == 'bottom':
                # Lowest ranked by field - use sort_by from query plan
                sort_field = query_plan.get('sort_by') or 'margin'
                sort_field = field_aliases.get(sort_field, sort_field)
                filtered.sort(key=lambda x: x.get(sort_field, 0), reverse=False)
                # Include aggregate totals from FULL dataset
                valid_for_profit = [j for j in filtered if j.get('valid_for_profit', False)]
                results = {
                    'items': filtered[:limit], 
                    'sort_by': sort_field,
                    'total_count': len(filtered),
                    'total_contract': sum(j['contract'] for j in filtered),
                    'total_profit': round(sum(j['profit'] for j in valid_for_profit), 2),
                    'avg_margin': round(sum(j['margin'] for j in valid_for_profit) / len(valid_for_profit), 2) if valid_for_profit else 0,
                    'note': f'Showing bottom {min(limit or 50, len(filtered))} of {len(filtered)} jobs. Totals from ALL {len(filtered)} jobs.'
                }
            else:
                # Default list with summary stats about budget coverage
                jobs_with_budget = [j for j in filtered if j['has_budget']]
                jobs_without_budget = [j for j in filtered if not j['has_budget']]
                
                # Sort by contract value descending to show most significant jobs first
                sort_field = query_plan.get('sort_by') or 'contract'
                sort_field = field_aliases.get(sort_field, sort_field)
                filtered.sort(key=lambda x: x.get(sort_field, 0), reverse=True)
                
                # Calculate aggregates from FULL filtered dataset before limiting
                valid_for_profit = [j for j in filtered if j.get('valid_for_profit', False)]
                total_profit = sum(j['profit'] for j in valid_for_profit)
                avg_margin = sum(j['margin'] for j in valid_for_profit) / len(valid_for_profit) if valid_for_profit else 0
                
                results = {
                    'items': filtered[:limit or 20],
                    'total_count': len(filtered),
                    'jobs_with_budget': len(jobs_with_budget),
                    'jobs_without_budget': len(jobs_without_budget),
                    'jobs_valid_for_profit': len(valid_for_profit),
                    'total_actual_cost': sum(j['actual_cost'] for j in filtered),
                    'total_contract': sum(j['contract'] for j in filtered),
                    'total_billed': sum(j['billed'] for j in filtered),
                    'total_profit': round(total_profit, 2),
                    'avg_margin': round(avg_margin, 2),
                    'avg_completion_with_budget': round(sum(j['percent_complete'] for j in jobs_with_budget) / len(jobs_with_budget), 1) if jobs_with_budget else 0,
                    'note': f'Showing top {min(limit or 20, len(filtered))} of {len(filtered)} jobs. Totals calculated from ALL {len(filtered)} matching jobs.'
                }
        
        # AR queries - use pre-computed metrics from cache
        elif target == 'ar':
            # Get pre-computed AR metrics from cache
            all_ar = metrics_cache.ar
            filtered = []
            
            for inv in all_ar:
                pm = inv.get('project_manager', '')
                # Note: AR Aging page does NOT exclude Josh Angelo - only PM analysis does
                # But for NLQ queries involving PM metrics, we exclude Josh Angelo
                if filters.get('pm'):
                    if 'josh angelo' in pm.lower():
                        continue
                    if not pm_matches(pm, filters['pm']):
                        continue
                
                if filters.get('customer'):
                    cust = (inv.get('customer_name') or '').lower()
                    if filters['customer'].lower() not in cust:
                        continue
                if filters.get('min_days'):
                    if inv.get('days_outstanding', 0) < filters['min_days']:
                        continue
                if filters.get('max_days'):
                    if inv.get('days_outstanding', 0) > filters['max_days']:
                        continue
                
                filtered.append({
                    'customer': inv.get('customer_name', ''),
                    'invoice_no': inv.get('invoice_no', ''),
                    'calc_due': inv.get('calculated_amount_due', 0),
                    'collectible': inv.get('collectible', 0),
                    'retainage': inv.get('retainage', 0),
                    'days_outstanding': inv.get('days_outstanding', 0),
                    'job_no': inv.get('job_no', ''),
                    'pm': pm
                })
            
            if aggregation == 'sum':
                # Total AR matches AR Aging page: collectible + retainage = calc_due
                total_collectible = sum(i['collectible'] for i in filtered)
                total_retainage = sum(i['retainage'] for i in filtered)
                total_due = total_collectible + total_retainage
                
                # Weighted avg days outstanding (weighted by collectible amount)
                weighted_days = sum(i['collectible'] * i['days_outstanding'] for i in filtered)
                avg_days_outstanding = weighted_days / total_collectible if total_collectible > 0 else 0
                
                # Concentration: top 5 customers as % of total
                by_cust = {}
                for inv in filtered:
                    c = inv['customer']
                    by_cust[c] = by_cust.get(c, 0) + inv['collectible']
                sorted_custs = sorted(by_cust.items(), key=lambda x: -x[1])[:5]
                top5_total = sum(amt for _, amt in sorted_custs)
                top5_concentration = (top5_total / total_collectible * 100) if total_collectible > 0 else 0
                
                results = {
                    'total_due': total_due,
                    'collectible': total_collectible,
                    'retainage': total_retainage,
                    'invoice_count': len(filtered),
                    'avg_days_outstanding': round(avg_days_outstanding, 1),
                    'top5_concentration_pct': round(top5_concentration, 1),
                    'top5_customers': [{'customer': c, 'amount': a} for c, a in sorted_custs]
                }
            elif aggregation == 'by_customer':
                by_cust = {}
                for inv in filtered:
                    c = inv['customer']
                    by_cust[c] = by_cust.get(c, 0) + inv['collectible']
                sorted_custs = sorted(by_cust.items(), key=lambda x: x[1], reverse=True)
                # Calculate totals from FULL dataset before limiting
                total_collectible = sum(amt for _, amt in sorted_custs)
                results = {
                    'items': [{'customer': c, 'amount': a} for c, a in sorted_custs[:limit]],
                    'total_customers': len(sorted_custs),
                    'total_collectible': round(total_collectible, 2),
                    'note': f'Showing top {min(limit or 50, len(sorted_custs))} of {len(sorted_custs)} customers. Total from ALL customers.'
                }
            elif aggregation == 'aging':
                # Matches AR Aging page: aging buckets for collectible, retainage tracked separately
                buckets = {'current': 0, 'days_31_60': 0, 'days_61_90': 0, 'days_90_plus': 0, 'retainage': 0}
                for inv in filtered:
                    d = inv['days_outstanding']
                    if d <= 30:
                        buckets['current'] += inv['collectible']
                    elif d <= 60:
                        buckets['days_31_60'] += inv['collectible']
                    elif d <= 90:
                        buckets['days_61_90'] += inv['collectible']
                    else:
                        buckets['days_90_plus'] += inv['collectible']
                    buckets['retainage'] += inv['retainage']
                buckets['total_collectible'] = buckets['current'] + buckets['days_31_60'] + buckets['days_61_90'] + buckets['days_90_plus']
                buckets['total_due'] = buckets['total_collectible'] + buckets['retainage']
                results = buckets
            elif aggregation == 'by_pm':
                # Group AR by PM (excludes Josh Angelo for PM analysis)
                by_pm = {}
                for inv in filtered:
                    pm = inv['pm']
                    if 'josh angelo' in pm.lower():
                        continue
                    if pm not in by_pm:
                        by_pm[pm] = {'pm': pm, 'collectible': 0, 'retainage': 0, 'invoice_count': 0}
                    by_pm[pm]['collectible'] += inv['collectible']
                    by_pm[pm]['retainage'] += inv['retainage']
                    by_pm[pm]['invoice_count'] += 1
                sorted_pms = sorted(by_pm.values(), key=lambda x: x['collectible'], reverse=True)
                results = {'items': sorted_pms[:limit or 20], 'total_pms': len(by_pm)}
            elif aggregation == 'by_job':
                by_job = {}
                for inv in filtered:
                    j = inv['job_no']
                    if j not in by_job:
                        by_job[j] = {'job_no': j, 'collectible': 0, 'retainage': 0, 'invoice_count': 0, 'customer': inv['customer'], 'pm': inv['pm']}
                    by_job[j]['collectible'] += inv['collectible']
                    by_job[j]['retainage'] += inv['retainage']
                    by_job[j]['invoice_count'] += 1
                sorted_jobs = sorted(by_job.values(), key=lambda x: x['collectible'], reverse=True)[:limit or 10]
                total_collectible = sum(i['collectible'] for i in filtered)
                results = {'total_ar': total_collectible, 'items': sorted_jobs}
            else:
                # Calculate aggregates from FULL filtered dataset before limiting
                total_collectible = sum(i['collectible'] for i in filtered)
                total_retainage = sum(i['retainage'] for i in filtered)
                total_due = sum(i['calc_due'] for i in filtered)
                weighted_days = sum(i['collectible'] * i['days_outstanding'] for i in filtered)
                avg_days = weighted_days / total_collectible if total_collectible > 0 else 0
                
                filtered.sort(key=lambda x: x['collectible'], reverse=True)
                results = {
                    'items': filtered[:limit], 
                    'total_count': len(filtered),
                    'total_collectible': round(total_collectible, 2),
                    'total_retainage': round(total_retainage, 2),
                    'total_due': round(total_due, 2),
                    'avg_days_outstanding': round(avg_days, 1),
                    'note': f'Showing top {min(limit or 50, len(filtered))} of {len(filtered)} invoices. Totals calculated from ALL {len(filtered)} invoices.'
                }
        
        # AP queries - use pre-computed metrics from cache
        elif target == 'ap':
            # Get pre-computed AP metrics from cache
            all_ap = metrics_cache.ap
            filtered = []
            
            for inv in all_ap:
                vendor_name = inv.get('vendor_name', '')
                
                if filters.get('vendor'):
                    if filters['vendor'].lower() not in vendor_name.lower():
                        continue
                if filters.get('min_days'):
                    if inv.get('days_outstanding', 0) < filters['min_days']:
                        continue
                
                filtered.append({
                    'vendor': vendor_name,
                    'invoice_no': inv.get('invoice_no', ''),
                    'amount': inv.get('remaining_balance', 0),
                    'days_outstanding': inv.get('days_outstanding', 0),
                    'job_no': inv.get('job_no', ''),
                    'description': ''
                })
            
            if aggregation == 'sum':
                total_ap = sum(i['amount'] for i in filtered)
                
                # Weighted avg days outstanding
                weighted_days = sum(i['amount'] * i['days_outstanding'] for i in filtered)
                avg_days_outstanding = weighted_days / total_ap if total_ap > 0 else 0
                
                # Concentration: top 5 vendors as % of total
                by_vendor = {}
                for inv in filtered:
                    v = inv['vendor']
                    by_vendor[v] = by_vendor.get(v, 0) + inv['amount']
                sorted_vendors = sorted(by_vendor.items(), key=lambda x: -x[1])[:5]
                top5_total = sum(amt for _, amt in sorted_vendors)
                top5_concentration = (top5_total / total_ap * 100) if total_ap > 0 else 0
                
                results = {
                    'total': total_ap,
                    'invoice_count': len(filtered),
                    'avg_days_outstanding': round(avg_days_outstanding, 1),
                    'top5_concentration_pct': round(top5_concentration, 1),
                    'top5_vendors': [{'vendor': v, 'amount': a} for v, a in sorted_vendors]
                }
            elif aggregation == 'by_vendor':
                by_vendor = {}
                for inv in filtered:
                    v = inv['vendor']
                    by_vendor[v] = by_vendor.get(v, 0) + inv['amount']
                sorted_vendors = sorted(by_vendor.items(), key=lambda x: x[1], reverse=True)
                # Calculate totals from FULL dataset before limiting
                total_amount = sum(amt for _, amt in sorted_vendors)
                results = {
                    'items': [{'vendor': v, 'amount': a} for v, a in sorted_vendors[:limit]],
                    'total_vendors': len(sorted_vendors),
                    'total_amount': round(total_amount, 2),
                    'note': f'Showing top {min(limit or 50, len(sorted_vendors))} of {len(sorted_vendors)} vendors. Total from ALL vendors.'
                }
            elif aggregation == 'aging':
                buckets = {'current': 0, 'days_31_60': 0, 'days_61_90': 0, 'days_90_plus': 0}
                for inv in filtered:
                    d = inv['days_outstanding']
                    if d <= 30:
                        buckets['current'] += inv['amount']
                    elif d <= 60:
                        buckets['days_31_60'] += inv['amount']
                    elif d <= 90:
                        buckets['days_61_90'] += inv['amount']
                    else:
                        buckets['days_90_plus'] += inv['amount']
                results = buckets
            else:
                # Calculate aggregates from FULL filtered dataset before limiting
                total_amount = sum(i['amount'] for i in filtered)
                total_retainage = sum(i.get('retainage', 0) for i in filtered)
                weighted_days = sum(i['amount'] * i['days_outstanding'] for i in filtered)
                avg_days = weighted_days / total_amount if total_amount > 0 else 0
                
                filtered.sort(key=lambda x: x['amount'], reverse=True)
                results = {
                    'items': filtered[:limit], 
                    'total_count': len(filtered),
                    'total_amount': round(total_amount, 2),
                    'total_retainage': round(total_retainage, 2),
                    'avg_days_outstanding': round(avg_days, 1),
                    'note': f'Showing top {min(limit or 50, len(filtered))} of {len(filtered)} invoices. Totals calculated from ALL {len(filtered)} invoices.'
                }
        
        # GL queries
        elif target == 'gl':
            gl_all = data.get('gl', {}).get('gl_history_all', [])
            year = filters.get('year')
            account_range = filters.get('account_range', [4000, 5000])  # Default revenue
            
            # Support multi-year queries
            if year is None:
                # Get all available years from column names
                years = list(range(2020, 2026))  # 2020-2025
            else:
                years = [year]
            
            # Generate all month columns for requested years
            all_months = []
            for y in years:
                for m in range(1, 13):
                    all_months.append(f"{y}-{str(m).zfill(2)}")
            
            filtered = []
            for entry in gl_all:
                acct = int(entry.get('Account_Num') or 0)
                if acct < account_range[0] or acct >= account_range[1]:
                    continue
                
                total = sum(float(entry.get(m) or 0) for m in all_months)
                if total == 0:
                    continue
                
                filtered.append({
                    'account': acct,
                    'description': entry.get('Account_Description') or entry.get('Description', ''),
                    'total': abs(total),
                    'monthly': {m: float(entry.get(m) or 0) for m in all_months}
                })
            
            if aggregation == 'sum':
                results = {'total': sum(e['total'] for e in filtered), 'years': years}
            elif aggregation == 'by_month':
                monthly_totals = {}
                for m in all_months:
                    monthly_totals[m] = sum(abs(float(e['monthly'].get(m, 0))) for e in filtered)
                results = {'monthly': monthly_totals, 'years': years}
            elif aggregation == 'by_year':
                # Aggregate by year for multi-year comparisons
                yearly_totals = {}
                for y in years:
                    year_months = [f"{y}-{str(m).zfill(2)}" for m in range(1, 13)]
                    yearly_totals[y] = sum(abs(float(e['monthly'].get(m, 0))) for e in filtered for m in year_months)
                results = {'yearly': yearly_totals, 'years': years}
            else:
                filtered.sort(key=lambda x: x['total'], reverse=True)
                results = {'items': filtered[:limit], 'total': sum(e['total'] for e in filtered), 'years': years}
        
        # PM summary queries - use pre-computed metrics from cache
        elif target == 'pm_summary':
            # Get pre-computed PM metrics from cache (properly handles closed vs active profit/margin)
            all_pm = metrics_cache.pm
            
            pm_list = []
            for pm_data in all_pm:
                pm_name = pm_data.get('project_manager', '')
                # Josh Angelo already excluded by metrics cache
                
                pm_list.append({
                    'pm': pm_name,
                    'jobs': pm_data.get('total_jobs', 0),
                    'active_jobs': pm_data.get('active_jobs', 0),
                    'closed_jobs': pm_data.get('closed_jobs', 0),
                    'jobs_with_budget': pm_data.get('jobs_with_budget', 0),
                    'jobs_valid_for_profit': pm_data.get('jobs_valid_for_profit', 0),
                    'contract': pm_data.get('total_contract', 0),
                    'budget_cost': pm_data.get('total_budget', 0),
                    'actual_cost': pm_data.get('total_actual', 0),
                    'billed': pm_data.get('total_billed', 0),
                    'earned_revenue': pm_data.get('total_earned_revenue', 0),
                    'backlog': pm_data.get('total_backlog', 0),
                    'profit': pm_data.get('total_profit', 0),
                    'margin': pm_data.get('avg_margin', 0),
                    'avg_completion': pm_data.get('avg_completion', 0),
                    'active_profit': pm_data.get('active_profit', 0),
                    'active_margin': pm_data.get('active_avg_margin', 0),
                    'active_valid_for_profit': pm_data.get('active_valid_for_profit', 0),
                    'closed_profit': pm_data.get('closed_profit', 0),
                    'closed_margin': pm_data.get('closed_avg_margin', 0),
                    'closed_valid_for_profit': pm_data.get('closed_valid_for_profit', 0)
                })
            
            if filters.get('pm'):
                pm_list = [p for p in pm_list if pm_matches(p['pm'], filters['pm'])]
            
            # Support sort_order from query plan
            sort_order = query_plan.get('sort_order', 'desc')
            sort_by_field = query_plan.get('sort_by') or (fields[0] if fields else 'active_jobs')
            
            # Handle margin_analysis and bottom aggregations for lowest values
            if aggregation in ('margin_analysis', 'bottom'):
                pm_list.sort(key=lambda x: x.get('margin', 0), reverse=False)  # Ascending for lowest
            else:
                pm_list.sort(key=lambda x: x.get(sort_by_field, 0), reverse=(sort_order == 'desc'))
            
            # Calculate grand totals from FULL dataset before limiting
            grand_total_profit = sum(p.get('profit', 0) for p in pm_list)
            grand_total_contract = sum(p.get('contract', 0) for p in pm_list)
            grand_total_jobs = sum(p.get('jobs', 0) for p in pm_list)
            grand_avg_margin = sum(p.get('margin', 0) for p in pm_list) / len(pm_list) if pm_list else 0
            
            results = {
                'items': pm_list[:limit], 
                'total_pms': len(pm_list),
                'grand_total_profit': round(grand_total_profit, 2),
                'grand_total_contract': round(grand_total_contract, 2),
                'grand_total_jobs': grand_total_jobs,
                'grand_avg_margin': round(grand_avg_margin, 2),
                'note': f'Showing {min(limit or 50, len(pm_list))} of {len(pm_list)} PMs. Grand totals from ALL {len(pm_list)} PMs.'
            }
        
        # PM comparison (side-by-side) - use pre-computed metrics from cache
        elif target == 'pm_comparison':
            pm_filter = filters.get('pm', '')
            pm_names = [p.strip() for p in str(pm_filter).split(',') if p.strip()]
            
            if len(pm_names) < 2:
                results = {'error': 'pm_comparison requires at least 2 PM names separated by commas'}
            else:
                # Use pre-computed PM metrics from cache
                all_pm = metrics_cache.pm
                ar_invoices = metrics_cache.ar
                
                # Build AR by PM for comparison
                ar_by_pm = {}
                for inv in ar_invoices:
                    pm = inv.get('project_manager', '')
                    ar_by_pm[pm] = ar_by_pm.get(pm, 0) + inv.get('collectible', 0)
                
                comparison = {}
                for pm_name in pm_names:
                    pm_lower = pm_name.lower()
                    
                    # Find matching PM in cache
                    matched_pm = None
                    for pm_data in all_pm:
                        if pm_lower in pm_data.get('project_manager', '').lower():
                            matched_pm = pm_data
                            break
                    
                    if matched_pm:
                        stats = {
                            'active_jobs': matched_pm.get('active_jobs', 0),
                            'total_jobs': matched_pm.get('total_jobs', 0),
                            'contract': matched_pm.get('total_contract', 0),
                            'budget_cost': matched_pm.get('total_budget', 0),
                            'actual_cost': matched_pm.get('total_actual', 0),
                            'billed': matched_pm.get('total_billed', 0),
                            'ar_balance': ar_by_pm.get(matched_pm.get('project_manager', ''), 0),
                            'profit': matched_pm.get('total_profit', 0),
                            'margin': matched_pm.get('avg_margin', 0)
                        }
                    else:
                        stats = {'active_jobs': 0, 'total_jobs': 0, 'contract': 0, 'budget_cost': 0, 'actual_cost': 0, 'billed': 0, 'ar_balance': 0, 'profit': 0, 'margin': 0}
                    
                    comparison[pm_name] = stats
                
                results = {'comparison': comparison, 'pm_names': pm_names}
        
        # Cash queries (from Google Sheets)
        elif target == 'cash':
            try:
                # Fetch cash data from internal API endpoint
                import requests
                cash_response = requests.get('http://127.0.0.1:5000/api/cash-data', timeout=30)
                if cash_response.status_code == 200:
                    cash_data = cash_response.json()
                    accounts = cash_data.get('accounts', [])
                    transactions = cash_data.get('transactions', [])
                    
                    # Filter for FTG Builders accounts (contain 1883, 2469, or 7554)
                    ftg_accounts = [a for a in accounts if any(x in str(a.get('name', '')) for x in ['1883', '2469', '7554'])]
                    
                    if aggregation == 'balance':
                        total_balance = sum(float(a.get('balance', 0) or 0) for a in ftg_accounts)
                        results = {
                            'total_balance': total_balance,
                            'accounts': [{'name': a.get('name', ''), 'balance': float(a.get('balance', 0) or 0)} for a in ftg_accounts]
                        }
                    elif aggregation == 'transactions':
                        from datetime import datetime, timedelta
                        
                        # Parse date_range filter
                        date_range = filters.get('date_range', 'last 30 days')
                        today = datetime.now().date()
                        
                        # Try to extract number of days from the date_range string
                        import re
                        days_match = re.search(r'(\d+)\s*day', str(date_range).lower())
                        weeks_match = re.search(r'(\d+)\s*week', str(date_range).lower())
                        
                        if days_match:
                            start_date = today - timedelta(days=int(days_match.group(1)))
                        elif weeks_match:
                            start_date = today - timedelta(days=int(weeks_match.group(1)) * 7)
                        elif 'month' in str(date_range).lower():
                            start_date = today - timedelta(days=30)
                        elif 'week' in str(date_range).lower():
                            start_date = today - timedelta(days=7)
                        else:
                            start_date = today - timedelta(days=30)  # Default to 30 days
                        
                        # Filter transactions by date and FTG accounts
                        ftg_account_names = [a.get('name', '') for a in ftg_accounts]
                        filtered_txns = []
                        for t in transactions:
                            txn_date_str = t.get('date', '')
                            txn_account = t.get('account', '')
                            if any(x in txn_account for x in ['1883', '2469', '7554']):
                                try:
                                    txn_date = datetime.strptime(txn_date_str, '%Y-%m-%d').date()
                                    if txn_date >= start_date:
                                        filtered_txns.append(t)
                                except:
                                    pass
                        
                        # Separate deposits and withdrawals
                        deposits = [t for t in filtered_txns if float(t.get('amount', 0) or 0) > 0]
                        withdrawals = [t for t in filtered_txns if float(t.get('amount', 0) or 0) < 0]
                        
                        results = {
                            'date_range': f'{start_date} to {today}',
                            'deposit_count': len(deposits),
                            'withdrawal_count': len(withdrawals),
                            'deposit_total': sum(float(t.get('amount', 0) or 0) for t in deposits),
                            'withdrawal_total': abs(sum(float(t.get('amount', 0) or 0) for t in withdrawals)),
                            'net_change': sum(float(t.get('amount', 0) or 0) for t in filtered_txns),
                            'top_deposits': sorted(deposits, key=lambda x: float(x.get('amount', 0) or 0), reverse=True)[:5],
                            'top_withdrawals': sorted(withdrawals, key=lambda x: float(x.get('amount', 0) or 0))[:5]
                        }
                    else:
                        total_balance = sum(float(a.get('balance', 0) or 0) for a in ftg_accounts)
                        results = {
                            'total_balance': total_balance,
                            'account_count': len(ftg_accounts),
                            'accounts': [{'name': a.get('name', ''), 'balance': float(a.get('balance', 0) or 0)} for a in ftg_accounts]
                        }
                else:
                    results = {'error': 'Unable to fetch cash data from Google Sheets'}
            except Exception as cash_err:
                print(f"[NLQ] Cash data error: {cash_err}")
                results = {'error': f'Cash data unavailable: {str(cash_err)}'}
        
        # Job detail queries (combines budget + vendor spend)
        elif target == 'job_detail':
            job_no = str(filters.get('job_no', '')).strip()
            if not job_no:
                results = {'error': 'job_no filter required for job_detail queries'}
            else:
                # Get job budget info
                budgets = data.get('jobs', {}).get('job_budgets', [])
                job_budget = None
                for j in budgets:
                    if str(j.get('job_no', '')) == job_no:
                        job_budget = j
                        break
                
                # Get job actuals
                actuals = data.get('jobs', {}).get('job_actuals', [])
                job_actual_cost = sum(float(a.get('Value') or a.get('actual_cost') or 0) 
                                     for a in actuals if str(a.get('Job_No') or a.get('job_no', '')) == job_no)
                
                # Get AP vendor spend for this job
                ap_invoices = data.get('ap', {}).get('invoices', [])
                job_ap = [inv for inv in ap_invoices if str(inv.get('job_no', '')) == job_no]
                
                vendor_spend = {}
                for inv in job_ap:
                    vendor = inv.get('vendor_name', 'Unknown')
                    amount = float(inv.get('invoice_amount', 0) or 0)
                    vendor_spend[vendor] = vendor_spend.get(vendor, 0) + amount
                
                top_vendors = sorted(vendor_spend.items(), key=lambda x: x[1], reverse=True)[:limit or 10]
                
                results = {
                    'job_no': job_no,
                    'job_description': job_budget.get('job_description', 'Unknown') if job_budget else 'Job not found',
                    'project_manager': job_budget.get('project_manager_name', '') if job_budget else '',
                    'customer': job_budget.get('customer_name', '') if job_budget else '',
                    'status': job_budget.get('job_status', '') if job_budget else '',
                    'revised_contract': float(job_budget.get('revised_contract', 0) or 0) if job_budget else 0,
                    'revised_cost_budget': float(job_budget.get('revised_cost', 0) or 0) if job_budget else 0,
                    'actual_cost': job_actual_cost,
                    'total_ap_spend': sum(vendor_spend.values()),
                    'ap_invoice_count': len(job_ap),
                    'top_vendors': [{'vendor': v, 'spend': s} for v, s in top_vendors]
                }
        
        # Cost codes analysis
        elif target == 'cost_codes':
            actuals = data.get('jobs', {}).get('job_actuals', [])
            budgets = data.get('jobs', {}).get('job_budgets', [])
            
            # Build PM lookup from budgets
            pm_by_job = {}
            for b in budgets:
                pm_by_job[str(b.get('job_no', ''))] = b.get('project_manager_name', '')
            
            # Filter actuals
            filtered = []
            for a in actuals:
                job_no = str(a.get('Job_No') or a.get('job_no', ''))
                pm = pm_by_job.get(job_no, a.get('Project_Manager', ''))
                
                if 'josh angelo' in pm.lower():
                    continue
                if filters.get('pm') and not pm_matches(pm, filters['pm']):
                    continue
                if filters.get('job_no') and str(filters['job_no']) != job_no:
                    continue
                if filters.get('cost_code') and str(filters['cost_code']) != str(a.get('Cost_Code_No', '')):
                    continue
                
                filtered.append({
                    'job_no': job_no,
                    'cost_code': a.get('Cost_Code_No', ''),
                    'cost_code_desc': a.get('Cost_Code_Description', ''),
                    'value': float(a.get('Value') or 0),
                    'pm': pm
                })
            
            # Aggregate by cost code
            if aggregation == 'by_cost_code':
                by_cc = {}
                for item in filtered:
                    cc = item['cost_code']
                    if cc not in by_cc:
                        by_cc[cc] = {'cost_code': cc, 'description': item['cost_code_desc'], 'total': 0, 'job_count': 0}
                    by_cc[cc]['total'] += item['value']
                    by_cc[cc]['job_count'] += 1
                sorted_cc = sorted(by_cc.values(), key=lambda x: x['total'], reverse=True)
                # Calculate grand total from FULL dataset before limiting
                grand_total = sum(cc['total'] for cc in sorted_cc)
                results = {
                    'items': sorted_cc[:limit or 20], 
                    'total_cost_codes': len(by_cc),
                    'grand_total': round(grand_total, 2),
                    'note': f'Showing top {min(limit or 20, len(sorted_cc))} of {len(sorted_cc)} cost codes. Grand total from ALL cost codes.'
                }
            else:
                total = sum(item['value'] for item in filtered)
                results = {'total_cost': total, 'record_count': len(filtered)}
        
        # Customer analysis (across jobs and AR)
        elif target == 'customers':
            budgets = data.get('jobs', {}).get('job_budgets', [])
            ar_invoices = data.get('ar', {}).get('invoices', [])
            
            customer_data = {}
            
            # Aggregate from jobs
            for job in budgets:
                customer = job.get('customer_name', '')
                if not customer:
                    continue
                pm = job.get('project_manager_name', '')
                if 'josh angelo' in pm.lower():
                    continue
                if filters.get('pm') and not pm_matches(pm, filters['pm']):
                    continue
                if filters.get('status') and job.get('job_status') != filters['status']:
                    continue
                
                if customer not in customer_data:
                    customer_data[customer] = {'customer': customer, 'job_count': 0, 'active_jobs': 0, 'contract': 0, 'ar_balance': 0, 'ar_retainage': 0, 'invoice_count': 0}
                
                customer_data[customer]['job_count'] += 1
                if job.get('job_status') == 'A':
                    customer_data[customer]['active_jobs'] += 1
                customer_data[customer]['contract'] += float(job.get('revised_contract') or 0)
            
            # Add AR balances (includes customers not in jobs if they have AR)
            for inv in ar_invoices:
                customer = inv.get('customer_name', '')
                if not customer:
                    continue
                    
                calc_due = float(inv.get('calculated_amount_due', 0) or 0)
                retainage = float(inv.get('retainage_amount', 0) or 0)
                collectible = max(0, calc_due - retainage)
                
                if customer not in customer_data:
                    customer_data[customer] = {'customer': customer, 'job_count': 0, 'active_jobs': 0, 'contract': 0, 'ar_balance': 0, 'ar_retainage': 0, 'invoice_count': 0}
                
                customer_data[customer]['ar_balance'] += collectible
                customer_data[customer]['ar_retainage'] += retainage
                customer_data[customer]['invoice_count'] += 1
            
            # Sort by requested field or default to contract
            sort_field = query_plan.get('sort_by', 'contract')
            sort_order = query_plan.get('sort_order', 'desc')
            sorted_customers = sorted(customer_data.values(), key=lambda x: x.get(sort_field, 0), reverse=(sort_order == 'desc'))
            
            # Calculate grand totals from FULL dataset before limiting
            grand_total_contract = sum(c.get('contract', 0) for c in sorted_customers)
            grand_total_ar = sum(c.get('ar_balance', 0) for c in sorted_customers)
            grand_total_jobs = sum(c.get('job_count', 0) for c in sorted_customers)
            
            results = {
                'items': sorted_customers[:limit or 20], 
                'total_customers': len(customer_data),
                'grand_total_contract': round(grand_total_contract, 2),
                'grand_total_ar': round(grand_total_ar, 2),
                'grand_total_jobs': grand_total_jobs,
                'note': f'Showing top {min(limit or 20, len(sorted_customers))} of {len(sorted_customers)} customers. Totals from ALL customers.'
            }
        
        else:
            results = {'error': f'Unknown target: {target}'}
        
    except Exception as e:
        print(f"[NLQ] Query execution error: {e}")
        import traceback
        traceback.print_exc()
        results = {'error': str(e)}
    
    return results


@app.route('/api/nlq', methods=['POST', 'OPTIONS'])
def api_natural_language_query():
    """Natural language query endpoint for AI Insights"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    try:
        req_data = request.get_json()
        if not req_data:
            return jsonify({'error': 'No data received', 'success': False}), 400
        
        question = req_data.get('question', '').strip()
        if not question:
            return jsonify({'error': 'No question provided', 'success': False}), 400
        
        print(f"[NLQ] Question received: {question}")
        
        # Step 1: Load all data
        data = load_nlq_data()
        
        # Step 2: Use Claude to interpret the question and create a query plan
        client = get_anthropic_client()
        
        intent_prompt = f"""You are a financial data analyst for a construction company. Use the semantic data catalog below to answer ANY question about the business data.

{NLQ_SEMANTIC_CATALOG}

User Question: "{question}"

Create a query plan to answer this question. You can query ANY combination of data based on the catalog above.

Respond with ONLY a valid JSON object:
{{
  "target_data": "jobs|ar|ap|gl|pm_summary|cash|job_detail|pm_comparison|cost_codes|customers|multi_source",
  "filters": {{
    "pm": "PM name or null",
    "status": "A|C|I|O or null",
    "customer": "customer name or null",
    "vendor": "vendor name or null",
    "job_no": "job number or null",
    "year": year number or null for all years,
    "min_days": minimum days or null,
    "max_days": maximum days or null,
    "min_amount": minimum amount threshold or null,
    "max_amount": maximum amount threshold or null,
    "account_range": [start, end] or null,
    "date_range": "last N days|last N weeks|last N months" or null,
    "cost_code": "cost code number or null"
  }},
  "aggregation": "count|sum|average|top|bottom|list|by_customer|by_vendor|by_job|by_pm|by_cost_code|aging|by_month|by_year|balance|transactions|closest_to_completion|margin_analysis|comparison",
  "sort_by": "field to sort by or null",
  "sort_order": "desc|asc",
  "fields": ["specific fields needed"],
  "limit": number or null,
  "include_details": true/false for detailed breakdowns,
  "explanation": "What data will be retrieved and how"
}}

The system can handle:
- Filtering by any field (amount thresholds, date ranges, specific values)
- Grouping/aggregating by any dimension (PM, customer, vendor, job, cost code, time period)
- Cross-source queries (e.g., job info + AR + AP combined)
- Comparisons between entities (PMs, customers, time periods)
- Trend analysis over time
- Top/bottom rankings with any criteria

Respond with ONLY the JSON object, no markdown."""
        
        intent_response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1000,
            messages=[{"role": "user", "content": intent_prompt}]
        )
        
        intent_text = intent_response.content[0].text.strip()
        print(f"[NLQ] Intent response: {intent_text}")
        
        # Parse the query plan
        try:
            # Clean up response if it has markdown
            if intent_text.startswith('```'):
                intent_text = intent_text.split('```')[1]
                if intent_text.startswith('json'):
                    intent_text = intent_text[4:]
            intent_text = intent_text.strip()
            query_plan = json.loads(intent_text)
        except json.JSONDecodeError as e:
            print(f"[NLQ] JSON parse error: {e}, text: {intent_text}")
            return jsonify({
                'success': False,
                'error': 'Could not parse query intent',
                'answer': "I'm sorry, I couldn't understand that question. Could you try rephrasing it?"
            })
        
        # Step 3: Execute the query
        query_results = execute_nlq_query(query_plan, data)
        print(f"[NLQ] Query results: {json.dumps(query_results)[:500]}")
        
        # Step 4: Generate natural language answer
        # Limit results size to prevent prompt overflow (max ~50KB of JSON)
        results_json = json.dumps(query_results, indent=2)
        if len(results_json) > 50000:
            # Truncate large result sets for the answer prompt
            if 'items' in query_results and isinstance(query_results['items'], list):
                truncated = {**query_results, 'items': query_results['items'][:20], 'truncated_from': len(query_results['items'])}
                results_json = json.dumps(truncated, indent=2)
            else:
                results_json = results_json[:50000] + "... [truncated for brevity]"
        
        answer_prompt = f"""Based on the following query results, provide a clear, conversational answer to the user's question.

User Question: "{question}"

Query Explanation: {query_plan.get('explanation', '')}

Query Results:
{results_json}

IMPORTANT: 
- When totals are provided (total_profit, total_contract, total_count, avg_margin, etc.), ALWAYS use these pre-computed values - they are calculated from ALL matching data.
- Do NOT try to sum up the 'items' array - items are only a sample of the top results for display.
- The 'total_count' shows how many records the totals are based on.
- Format currency as $X.XM or $XXK. Keep the response concise but accurate.
- If the results show items, mention a few top ones as examples, but cite the aggregate totals for overall metrics.
- Never mention Josh Angelo in your response."""

        answer_response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=500,
            messages=[{"role": "user", "content": answer_prompt}]
        )
        
        answer = answer_response.content[0].text.strip()
        print(f"[NLQ] Answer: {answer}")
        
        return jsonify({
            'success': True,
            'answer': answer,
            'query_plan': query_plan,
            'raw_results': query_results
        })
        
    except Exception as e:
        print(f"[NLQ] Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e),
            'answer': f"Sorry, I encountered an error processing your question. Please try again."
        }), 500
# Email scheduling feature disabled - scheduler removed from UI
# scheduler_thread = None
#
# def start_scheduler():
#     """Start the background scheduler thread"""
#     global scheduler_thread
#     if scheduler_thread is None or not scheduler_thread.is_alive():
#         scheduler_thread = threading.Thread(target=run_scheduler, daemon=True)
#         scheduler_thread.start()
#
# start_scheduler()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
