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
            ('revenue', 'Revenue', 'View revenue charts and analysis'),
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
            ('missing_budgets', 'Missing Budgets', 'View jobs with missing budget data'),
            ('payments', 'Payments', 'View AP invoices and payment status'),
            ('job_analytics', 'Job Analytics', 'View job performance metrics'),
                        ('receivables', 'Receivables/Payables', 'View AR/AP tracking'),
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
            pm_permissions = ['job_overview', 'job_budgets', 'job_actuals', 'over_under_billing', 'cost_codes', 'missing_budgets', 'payments', 'job_analytics']
            for page_key in pm_permissions:
                if page_key in perms:
                    cur.execute("""
                        INSERT INTO role_permissions (role_id, permission_id)
                        VALUES (%s, %s)
                        ON CONFLICT DO NOTHING
                    """, (roles['project_manager'], perms[page_key]))
        
        # Seed default users if they don't exist
        default_users = [
            ('rodney@ftgbuilders.com', 'Rodney', 'admin'),
            ('sergio@ftghbuilders.com', 'Sergio', 'admin'),
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
                ON CONFLICT (email) DO UPDATE SET role_id = COALESCE(users.role_id, EXCLUDED.role_id)
            """, (email, display_name, default_password_hash, role_id))
        
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

@app.route('/api/analyze-overview', methods=['POST', 'OPTIONS'])
@app.route('/api/analyze-revenue', methods=['POST', 'OPTIONS'])
@app.route('/api/analyze-account', methods=['POST', 'OPTIONS'])
@app.route('/api/analyze-balance-sheet', methods=['POST', 'OPTIONS'])
@app.route('/api/analyze-jobs', methods=['POST', 'OPTIONS'])
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
        if 'overview' in endpoint:
            title = "Executive Overview"
            focus = "P&L and balance sheet metrics"
        elif 'revenue' in endpoint:
            title = "Revenue Analysis"
            focus = "revenue trends and performance"
        elif 'account' in endpoint:
            title = "GL Account"
            focus = "account details and trends"
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
        print(f"AI Analysis error: {str(e)}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

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
        cur.execute("SELECT id, username FROM users WHERE role_id = %s", (role_id,))
        assigned_users = cur.fetchall()
        if len(assigned_users) > 0:
            # Get available roles for reassignment (exclude the role being deleted and admin)
            cur.execute("SELECT id, name FROM roles WHERE id != %s ORDER BY name", (role_id,))
            available_roles = cur.fetchall()
            cur.close()
            conn.close()
            return jsonify({
                'error': 'users_assigned',
                'users': [{'id': u['id'], 'username': u['username']} for u in assigned_users],
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
        cur.execute("SELECT id, username FROM users WHERE role_id = %s", (role_id,))
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
            'reassignedUsers': [u['username'] for u in reassigned_users]
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
    'Employee Fiduciary, LLC',
    'Bank of America',
    'Capital One',
    'CaliforniaChoice',
    'Kaiser Foundation Health Plan'
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
    """Get unique project manager values for filter dropdown"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    try:
        data = get_payments_data()
        payments = data['payments']
        
        # Get unique PM values
        pms = set()
        for p in payments:
            pm = p.get('project_manager', '')
            if pm:
                pms.add(pm)
        
        return jsonify(sorted(list(pms)))
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
    """Get AP aging report grouped by vendor with aging buckets"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    try:
        search = request.args.get('search', '').strip().lower()
        sort_column = request.args.get('sortColumn', 'total_due')
        sort_direction = request.args.get('sortDirection', 'desc')
        
        # Load invoices data
        invoices_path = os.path.join(os.path.dirname(__file__), 'data', 'ap_invoices.json')
        with open(invoices_path, 'r', encoding='utf-8-sig') as f:
            invoices_json = json.load(f)
        
        invoices = invoices_json.get('invoices', [])
        
        # Group by vendor and calculate aging buckets
        vendor_aging = {}
        
        for inv in invoices:
            remaining = float(inv.get('remaining_balance', 0) or 0)
            if remaining <= 0:
                continue  # Skip fully paid invoices
            
            vendor = (inv.get('vendor_name', '') or '').strip()
            if not vendor:
                vendor = 'Unknown Vendor'
            
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
            
            retainage = float(inv.get('retainage_amount', 0) or 0)
            # Amount due excluding retainage
            amount_ex_ret = remaining - retainage if retainage > 0 else remaining
            
            # Get days outstanding
            days = int(float(inv.get('days_outstanding', 0) or 0))
            
            # Add to appropriate bucket
            if days <= 30:
                vendor_aging[vendor]['current'] += amount_ex_ret
            elif days <= 60:
                vendor_aging[vendor]['days_31_60'] += amount_ex_ret
            elif days <= 90:
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
        
        # Sort
        reverse = sort_direction.lower() == 'desc'
        if sort_column in ['vendor_name']:
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

scheduler_thread = None

def start_scheduler():
    """Start the background scheduler thread"""
    global scheduler_thread
    if scheduler_thread is None or not scheduler_thread.is_alive():
        scheduler_thread = threading.Thread(target=run_scheduler, daemon=True)
        scheduler_thread.start()

start_scheduler()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
