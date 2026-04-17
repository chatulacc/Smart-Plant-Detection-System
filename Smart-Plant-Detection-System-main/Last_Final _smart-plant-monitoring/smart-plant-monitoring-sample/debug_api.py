import requests

try:
    print("Testing /ml-insights...")
    r1 = requests.get('http://127.0.0.1:5000/api/ml-insights')
    print(f"Status: {r1.status_code}")
    print(f"Response: {r1.text[:200]}")
    
    print("\nTesting /model-info...")
    r2 = requests.get('http://127.0.0.1:5000/api/model-info')
    print(f"Status: {r2.status_code}")
    print(f"Response: {r2.text[:200]}")
except Exception as e:
    print(f"Connection failed: {e}")
