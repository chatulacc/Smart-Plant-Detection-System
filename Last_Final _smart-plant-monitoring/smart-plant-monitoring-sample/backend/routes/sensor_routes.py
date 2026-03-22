from flask import Blueprint, request, jsonify
from datetime import datetime, timedelta
from firebase_config import initialize_firebase, get_db_ref
import requests

sensor_bp = Blueprint('sensor_bp', __name__)

# Initialize Firebase
firebase_ready = initialize_firebase()

# In-memory storage for sensor data when Firebase is unavailable
sensor_data_store = []

@sensor_bp.route('/sensor-data', methods=['POST'])
def post_data():
    print("Received POST data:", request.json)
    data = request.json
    data['timestamp'] = datetime.utcnow().isoformat()
    
    global sensor_data_store
    
    # Always try Firebase first if it was initialized
    if firebase_ready:
        try:
            db_ref = get_db_ref()
            db_ref.push(data)
            print("Successfully stored data in Firebase")
            return jsonify({'message': 'stored in Firebase'})
        except Exception as e:
            print(f"Firebase error in POST: {str(e)}")
            print("Falling back to memory storage")
            sensor_data_store.append(data)
            sensor_data_store = sensor_data_store[-100:]
            return jsonify({'message': 'stored in memory (Firebase failed)'})
    else:
        # Firebase not initialized, use memory storage
        print("Firebase not available, storing in memory")
        sensor_data_store.append(data)
        sensor_data_store = sensor_data_store[-100:]
        print("Successfully stored data in memory")
        return jsonify({'message': 'stored in memory'})

@sensor_bp.route('/sensor-data', methods=['GET'])
def get_data():
    print("=== GET REQUEST RECEIVED ===")
    
    global sensor_data_store
    
    # Try Firebase REST API first (works even with auth issues if rules allow public read)
    try:
        firebase_url = "https://smart-plant-detection-system-default-rtdb.asia-southeast1.firebasedatabase.app/plant.json"
        print(f"Attempting Firebase REST API call to: {firebase_url}")
        response = requests.get(firebase_url, timeout=10)
        print(f"Firebase REST API response status: {response.status_code}")
        
        if response.status_code == 200:
            firebase_data = response.json()
            print(f"Firebase REST API returned data: {len(firebase_data) if firebase_data else 0} entries")
            if firebase_data and isinstance(firebase_data, dict):
                # Convert Firebase data structure to our format
                result = []
                for key, value in firebase_data.items():
                    if isinstance(value, dict):
                        entry = {
                            'air_temperature': value.get('temperature'),
                            'air_humidity': value.get('humidity'),
                            'soil_moisture': value.get('soil'),
                            'ldr_light': value.get('ldr'),
                            'timestamp': value.get('timestamp', '')
                        }
                        result.append(entry)
                
                # Sort by timestamp and get last 20 entries
                result.sort(key=lambda x: x.get('timestamp', 0), reverse=True)
                result = result[:20]
                
                print(f"Successfully retrieved {len(result)} entries from Firebase REST API")
                return jsonify(result)
    except Exception as e:
        print(f"Firebase REST API failed: {str(e)}")
    
    # Fallback to Firebase SDK if REST API fails
    try:
        db_ref = get_db_ref()
        data_snapshot = db_ref.get()

        if not data_snapshot:
            print("No data found in Firebase")
            return jsonify([])

        # The 'plant' node is a single flat object with live sensor values
        # e.g. {"temperature": 31.7, "humidity": 64.2, "soil": 3029, "ldr": 0}
        # Map field names to match what the frontend expects
        if isinstance(data_snapshot, dict):
            # Check if it's a single live reading (flat fields like temperature, humidity)
            if 'temperature' in data_snapshot or 'humidity' in data_snapshot:
                mapped = {
                    'air_temperature': data_snapshot.get('temperature'),
                    'air_humidity':    data_snapshot.get('humidity'),
                    'soil_moisture':   data_snapshot.get('soil'),
                    'ldr_light':       data_snapshot.get('ldr'),
                    'soil_temperature': data_snapshot.get('soil_temperature'),
                    'timestamp':       data_snapshot.get('timestamp', datetime.utcnow().isoformat())
                }
                result = [mapped]
            else:
                # It's a dict of entries keyed by push ID
                result = []
                for key, value in data_snapshot.items():
                    if isinstance(value, dict):
                        # Map field names if needed
                        entry = {
                            'air_temperature': value.get('air_temperature') or value.get('temperature'),
                            'air_humidity':    value.get('air_humidity') or value.get('humidity'),
                            'soil_moisture':   value.get('soil_moisture') or value.get('soil'),
                            'ldr_light':       value.get('ldr_light') or value.get('ldr'),
                            'soil_temperature': value.get('soil_temperature'),
                            'timestamp':       value.get('timestamp', '')
                        }
                        result.append(entry)
                result = result[-20:]  # Last 20 entries
        else:
            result = []

        print(f"Successfully retrieved {len(result)} entries from Firebase")
        return jsonify(result)
    except Exception as e:
        print(f"Firebase error: {str(e)}")
        print("Falling back to memory data")
        if sensor_data_store:
            result = sensor_data_store[-20:]
            return jsonify(result)
        else:
            # Return mock data as last resort
            mock_data = [
                {
                    'air_temperature': 25.5,
                    'air_humidity': 60.2,
                    'soil_moisture': 45.8,
                    'ldr_light': 1200,
                    'timestamp': datetime.utcnow().isoformat()
                },
                {
                    'air_temperature': 26.1,
                    'air_humidity': 58.7,
                    'soil_moisture': 42.3,
                    'ldr_light': 1150,
                    'timestamp': (datetime.utcnow().replace(second=0, microsecond=0) - timedelta(minutes=5)).isoformat()
                },
                {
                    'air_temperature': 24.8,
                    'air_humidity': 62.1,
                    'soil_moisture': 48.9,
                    'ldr_light': 1300,
                    'timestamp': (datetime.utcnow().replace(second=0, microsecond=0) - timedelta(minutes=10)).isoformat()
                }
            ]
            return jsonify(mock_data)

