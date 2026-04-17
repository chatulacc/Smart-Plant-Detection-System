import firebase_admin
from firebase_admin import credentials, db
import os

# Path to your Firebase service account key
# You can get this from: Firebase Console > Project Settings > Service Accounts > Generate new private key
SERVICE_ACCOUNT_KEY = 'serviceAccountKey.json'

def initialize_firebase():
    if not firebase_admin._apps:
        if os.path.exists(SERVICE_ACCOUNT_KEY):
            try:
                cred = credentials.Certificate(SERVICE_ACCOUNT_KEY)
                firebase_admin.initialize_app(cred, {
                    'databaseURL': 'https://smart-plant-detection-system-default-rtdb.asia-southeast1.firebasedatabase.app'
                })
                print("Firebase initialized successfully.")
                return True
            except Exception as e:
                print(f"ERROR: Failed to initialize Firebase: {str(e)}")
                print(f"WARNING: {SERVICE_ACCOUNT_KEY} appears to be invalid. Backend will run in offline/mock mode.")
                return False
        else:
            print(f"WARNING: {SERVICE_ACCOUNT_KEY} not found. Backend will run in offline/mock mode.")
            return False
    return True

def get_db_ref():
    return db.reference('plant')
