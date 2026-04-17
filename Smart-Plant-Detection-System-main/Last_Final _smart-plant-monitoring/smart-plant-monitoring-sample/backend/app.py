from flask import Flask
from flask_cors import CORS
from routes.sensor_routes import sensor_bp
from routes.analytics_routes import analytics_bp

app = Flask(__name__)
# Enable CORS for all routes
CORS(app)

# Register blueprints
app.register_blueprint(sensor_bp, url_prefix='/api')
app.register_blueprint(analytics_bp, url_prefix='/api')

@app.route('/')
def home():
    return {'status': 'success', 'message': 'Smart Plant Backend is Running'}

if __name__ == '__main__':
    print("=== Smart Plant Backend Initializing ===")
    app.run(debug=True, host='127.0.0.1', port=5000)


