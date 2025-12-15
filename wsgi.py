import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'public'))
os.chdir(os.path.join(os.path.dirname(__file__), 'public'))

from server import app

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=5000)
