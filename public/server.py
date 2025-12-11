#!/usr/bin/env python3
import os
import json
import base64
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from flask import Flask, send_from_directory, request, jsonify, Response
import requests
from openai import OpenAI

app = Flask(__name__, static_folder=None)

# the newest OpenAI model is "gpt-5" which was released August 7, 2025.
# do not change this unless explicitly requested by the user
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")

def get_openai_client():
    if not OPENAI_API_KEY:
        raise Exception("OpenAI API key not configured. Please add OPENAI_API_KEY to your secrets.")
    return OpenAI(api_key=OPENAI_API_KEY)

def get_gmail_access_token():
    hostname = os.environ.get('REPLIT_CONNECTORS_HOSTNAME')
    repl_identity = os.environ.get('REPL_IDENTITY')
    web_repl_renewal = os.environ.get('WEB_REPL_RENEWAL')
    
    print(f"Checking Gmail connection - hostname: {hostname is not None}, repl_identity: {repl_identity is not None}, web_repl_renewal: {web_repl_renewal is not None}")
    
    if repl_identity:
        x_replit_token = f'repl {repl_identity}'
    elif web_repl_renewal:
        x_replit_token = f'depl {web_repl_renewal}'
    else:
        raise Exception('Gmail authentication token not available. Please ensure the Gmail connection is set up.')
    
    if not hostname:
        raise Exception('Replit connectors not available. Please try again.')
    
    response = requests.get(
        f'https://{hostname}/api/v2/connection?include_secrets=true&connector_names=google-mail',
        headers={
            'Accept': 'application/json',
            'X_REPLIT_TOKEN': x_replit_token
        }
    )
    
    print(f"Connector response status: {response.status_code}")
    
    if response.status_code != 200:
        raise Exception(f'Failed to get Gmail credentials: {response.status_code}')
    
    data = response.json()
    items = data.get('items', [])
    
    if not items:
        raise Exception('Gmail not connected. Please connect your Gmail account in the Connections panel.')
    
    connection_settings = items[0]
    
    access_token = (
        connection_settings.get('settings', {}).get('access_token') or
        connection_settings.get('settings', {}).get('oauth', {}).get('credentials', {}).get('access_token')
    )
    
    if not access_token:
        raise Exception('Gmail access token not found. Please reconnect your Gmail account.')
    
    return access_token

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
        
        client = get_openai_client()
        
        system_prompt = """You are a CFO analyzing a construction company's Income Statement.

STRICT OUTPUT RULES:
- Return EXACTLY 4 arrays: key_observations, positive_indicators, areas_of_concern, recommendations
- Each array must have EXACTLY 3-4 items
- Each item is one concise sentence with specific dollar amounts
- Round all dollar amounts to whole numbers (no decimals) - use $3.8M not $3.84M
- DO NOT add any other fields or sections
- DO NOT include profitability analysis, revenue trends, cost structure, or any other categories"""

        user_prompt = f"""Analyze this Income Statement for FTG Builders:

Period: {period_info}

{statement_data}"""

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            max_tokens=2048,
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "income_statement_analysis",
                    "strict": True,
                    "schema": {
                        "type": "object",
                        "properties": {
                            "key_observations": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "3-4 key observations about the financial data"
                            },
                            "positive_indicators": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "3-4 positive financial indicators"
                            },
                            "areas_of_concern": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "3-4 areas requiring attention"
                            },
                            "recommendations": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "3-4 actionable recommendations"
                            }
                        },
                        "required": ["key_observations", "positive_indicators", "areas_of_concern", "recommendations"],
                        "additionalProperties": False
                    }
                }
            }
        )
        
        import json
        
        raw_content = response.choices[0].message.content or ""
        
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
