print("=== STARTING APP.PY ===")
from flask import Flask
from flask_cors import CORS
from routes.sensor_routes import sensor_bp

app = Flask(__name__)
# Enable CORS for all routes and all origins more explicitly
CORS(app, resources={r"/*": {"origins": "*"}})

app.register_blueprint(sensor_bp, url_prefix='/api')

@app.route('/')
def home():
    print("=== HEALTH CHECK REQUESTED ===")
    return {'message': 'Backend running'}

if __name__ == '__main__':
    print("Starting Flask app...")
    app.run(debug=False, host='127.0.0.1', port=5000, use_reloader=False)


