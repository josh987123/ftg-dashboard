import sys
import os

# Get absolute path to this file's directory
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(BASE_DIR, 'public')

# Add public directory to Python path
sys.path.insert(0, PUBLIC_DIR)

# Change working directory to public so static files work correctly
os.chdir(PUBLIC_DIR)

from server import app

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=5000)
