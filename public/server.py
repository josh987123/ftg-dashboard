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
    """Simple SHA-256 hash for password storage"""
    return hashlib.sha256(password.encode()).hexdigest()

def init_database():
    """Initialize database tables and seed default users"""
    if not DATABASE_URL:
        print("No DATABASE_URL found, skipping database initialization")
        return
    
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Create users table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                display_name VARCHAR(100) NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Create sessions table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                token VARCHAR(255) UNIQUE NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Seed default users if they don't exist
        default_users = [
            ('rodney@ftgbuilders.com', 'Rodney'),
            ('sergio@ftghbuilders.com', 'Sergio'),
            ('joshl@ftgbuilders.com', 'Josh'),
            ('greg@ftgbuilders.com', 'Greg'),
            ('bailey@ftgbuilders.com', 'Bailey')
        ]
        
        default_password_hash = hash_password('Ftgb2025$')
        
        for email, display_name in default_users:
            cur.execute("""
                INSERT INTO users (email, display_name, password_hash)
                VALUES (%s, %s, %s)
                ON CONFLICT (email) DO NOTHING
            """, (email, display_name, default_password_hash))
        
        conn.commit()
        cur.close()
        conn.close()
        print("Database initialized successfully")
    except Exception as e:
        print(f"Database initialization error: {e}")

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

def get_sheets_access_token():
    return get_connector_access_token('google-sheet')

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
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return response

@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
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
        
        # Find user by email
        cur.execute("SELECT id, email, display_name, password_hash FROM users WHERE email = %s", (email,))
        user = cur.fetchone()
        
        if not user:
            cur.close()
            conn.close()
            return jsonify({'error': 'Invalid email address'}), 401
        
        # Check password
        if user['password_hash'] != hash_password(password):
            cur.close()
            conn.close()
            return jsonify({'error': 'Incorrect password'}), 401
        
        # Create session token
        token = str(uuid.uuid4())
        expires_at = datetime.now() + timedelta(days=30)
        
        cur.execute("""
            INSERT INTO sessions (user_id, token, expires_at)
            VALUES (%s, %s, %s)
        """, (user['id'], token, expires_at))
        
        conn.commit()
        cur.close()
        conn.close()
        
        return jsonify({
            'success': True,
            'displayName': user['display_name'],
            'email': user['email'],
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
        if session['password_hash'] != hash_password(current_password):
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
