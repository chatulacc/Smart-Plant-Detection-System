import requests
import time
import random
import json

# Configuration
API_URL = "http://127.0.0.1:5000/api/sensor-data"
SEND_INTERVAL = 5 # seconds

def generate_sensor_data():
    """Generates realistic mockup data for 5 sensors."""
    return {
        "air_temperature": round(random.uniform(20.0, 35.0), 2),
        "air_humidity": round(random.uniform(40.0, 80.0), 2),
        "soil_moisture": round(random.uniform(200, 800), 2), # Typical analog values
        "soil_temperature": round(random.uniform(15.0, 25.0), 2),
        "ldr_light": round(random.uniform(0, 1023), 2) # Typical 10-bit resolution
    }

def simulate():
    print(f"Starting Smart Plant Hardware Simulator...")
    print(f"Targeting: {API_URL}")
    print("Press Ctrl+C to stop.\n")
    
    while True:
        data = generate_sensor_data()
        try:
            response = requests.post(API_URL, json=data)
            if response.status_code == 200:
                print(f"[SUCCESS] Sent data: {data}")
            else:
                print(f"[FAILED] HTTP {response.status_code}: {response.text}")
        except Exception as e:
            print(f"[ERROR] Could not connect to backend: {e}")
        
        time.sleep(SEND_INTERVAL)

if __name__ == "__main__":
    simulate()
