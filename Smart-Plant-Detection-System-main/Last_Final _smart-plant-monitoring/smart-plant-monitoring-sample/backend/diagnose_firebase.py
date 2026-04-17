import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from firebase_config import initialize_firebase, get_db_ref

initialize_firebase()
ref = get_db_ref()
data = ref.get()

if data is None:
    print("=== NO DATA FOUND under 'plant' node ===")
else:
    print("=== RAW DATA FROM FIREBASE (plant node) ===")
    print(json.dumps(data, indent=2, default=str))
    print(f"\n=== Total keys at top level: {len(data) if isinstance(data, dict) else 'N/A (not a dict)'} ===")
    if isinstance(data, dict):
        first_key = list(data.keys())[0]
        print(f"\n=== First entry (key: {first_key}) ===")
        print(json.dumps(data[first_key], indent=2, default=str))
