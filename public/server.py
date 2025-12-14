#!/usr/bin/env python3
import os
import json
import base64
import uuid
import hashlib
from datetime import datetime, timedelta
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from flask import Flask, send_from_directory, request, jsonify, Response
import requests
from anthropic import Anthropic
import psycopg2
from psycopg2.extras import RealDictCursor

app = Flask(__name__, static_folder=None)

# Database connection
DATABASE_URL = os.environ.get("DATABASE_URL")

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
            ("password_reset_expires", "TIMESTAMP")
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
        
        # Create audit_log table
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
        
        # Seed default roles
        default_roles = [
            ('admin', 'Full access to all features including user management'),
            ('manager', 'Access to all dashboard pages but not admin functions'),
            ('viewer', 'Limited access to specific pages based on permissions')
        ]
        for role_name, description in default_roles:
            cur.execute("""
                INSERT INTO roles (name, description)
                VALUES (%s, %s)
                ON CONFLICT (name) DO NOTHING
            """, (role_name, description))
        
        # Seed default permissions (one per dashboard page)
        default_permissions = [
            ('overview', 'Executive Overview', 'View executive summary and key metrics'),
            ('revenue', 'Revenue', 'View revenue charts and analysis'),
            ('account', 'Account Detail', 'View GL account details'),
            ('income_statement', 'Income Statement', 'View income statement'),
            ('balance_sheet', 'Balance Sheet', 'View balance sheet'),
            ('cash_flow', 'Cash Flow', 'View statement of cash flows'),
            ('over_under', 'Over/Under Bill', 'View billing variances'),
            ('receivables', 'Receivables/Payables', 'View AR/AP tracking'),
            ('job_analytics', 'Job Analytics', 'View job performance metrics'),
            ('cash_balances', 'Cash Balances', 'View cash position'),
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
        
        # Viewer role gets basic pages (overview, revenue, account, cash_balances)
        if 'viewer' in roles:
            viewer_pages = ['overview', 'revenue', 'account', 'cash_balances']
            for page_key in viewer_pages:
                if page_key in perms:
                    cur.execute("""
                        INSERT INTO role_permissions (role_id, permission_id)
                        VALUES (%s, %s)
                        ON CONFLICT DO NOTHING
                    """, (roles['viewer'], perms[page_key]))
        
        # Seed default users if they don't exist
        default_users = [
            ('rodney@ftgbuilders.com', 'Rodney', 'admin'),
            ('sergio@ftghbuilders.com', 'Sergio', 'admin'),
            ('joshl@ftgbuilders.com', 'Josh', 'manager'),
            ('greg@ftgbuilders.com', 'Greg', 'manager'),
            ('bailey@ftgbuilders.com', 'Bailey', 'viewer')
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

def log_audit(user_id, action, target_type=None, target_id=None, details=None):
    """Log an audit event"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO audit_log (user_id, action, target_type, target_id, details, ip_address)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (user_id, action, target_type, target_id, json.dumps(details) if details else None, get_client_ip()))
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Audit log error: {e}")

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
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT u.id, u.email, u.display_name, u.is_active, r.name as role_name
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
        
        # Find user by email with role info
        cur.execute("""
            SELECT u.id, u.email, u.display_name, u.password_hash, u.is_active, r.name as role_name
            FROM users u
            LEFT JOIN roles r ON u.role_id = r.id
            WHERE u.email = %s
        """, (email,))
        user = cur.fetchone()
        
        if not user:
            cur.close()
            conn.close()
            return jsonify({'error': 'Invalid email address'}), 401
        
        if not user['is_active']:
            cur.close()
            conn.close()
            return jsonify({'error': 'Account is disabled. Contact your administrator.'}), 401
        
        # Check password using bcrypt (with SHA-256 fallback for legacy)
        password_valid, needs_rehash = verify_password_with_rehash(password, user['password_hash'])
        if not password_valid:
            cur.close()
            conn.close()
            return jsonify({'error': 'Incorrect password'}), 401
        
        # Upgrade legacy SHA-256 hash to bcrypt if needed
        if needs_rehash:
            new_hash = hash_password(password)
            cur.execute("UPDATE users SET password_hash = %s WHERE id = %s", (new_hash, user['id']))
        
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
            'role': user['role_name'] or 'viewer',
            'permissions': permissions,
            'token': token
        })
        
    except Exception as e:
        print(f"Login error: {e}")
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
            cur.execute("DELETE FROM sessions WHERE token = %s", (token,))
            conn.commit()
            cur.close()
            conn.close()
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
                'role': user['role_name'] or 'viewer',
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
        
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT a.id, a.action, a.target_type, a.target_id, a.details, a.ip_address, a.created_at,
                   u.display_name as user_name, u.email as user_email
            FROM audit_log a
            LEFT JOIN users u ON a.user_id = u.id
            ORDER BY a.created_at DESC
            LIMIT %s OFFSET %s
        """, (limit, offset))
        logs = cur.fetchall()
        
        cur.execute("SELECT COUNT(*) as count FROM audit_log")
        total = cur.fetchone()['count']
        
        cur.close()
        conn.close()
        
        return jsonify({
            'success': True,
            'total': total,
            'logs': [{
                'id': log['id'],
                'action': log['action'],
                'targetType': log['target_type'],
                'targetId': log['target_id'],
                'details': log['details'],
                'ipAddress': log['ip_address'],
                'createdAt': log['created_at'].isoformat() if log['created_at'] else None,
                'userName': log['user_name'],
                'userEmail': log['user_email']
            } for log in logs]
        })
    except Exception as e:
        print(f"Get audit log error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/reset-password/<int:user_id>', methods=['POST', 'OPTIONS'])
@require_admin
def api_admin_reset_password(user_id):
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})
    
    try:
        data = request.get_json(force=True, silent=True)
        new_password = data.get('password', '') if data else ''
        
        if not new_password or len(new_password) < 6:
            return jsonify({'error': 'Password must be at least 6 characters'}), 400
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            UPDATE users SET password_hash = %s, updated_at = NOW()
            WHERE id = %s
        """, (hash_password(new_password), user_id))
        
        if cur.rowcount == 0:
            cur.close()
            conn.close()
            return jsonify({'error': 'User not found'}), 404
        
        # Invalidate all sessions for this user
        cur.execute("DELETE FROM sessions WHERE user_id = %s", (user_id,))
        
        conn.commit()
        cur.close()
        conn.close()
        
        log_audit(request.current_user['id'], 'admin_reset_password', 'user', user_id, None)
        
        return jsonify({'success': True, 'message': 'Password reset successfully'})
    except Exception as e:
        print(f"Admin reset password error: {e}")
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

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
