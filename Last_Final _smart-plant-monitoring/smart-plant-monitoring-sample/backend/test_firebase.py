import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from firebase_config import initialize_firebase, get_db_ref

print("Testing Firebase connectivity...")

if initialize_firebase():
    print("✅ Firebase initialized successfully!")

    try:
        ref = get_db_ref()
        # Test write
        test_data = {"test": "connection", "timestamp": "2026-03-22T04:30:00.000000"}
        ref.push(test_data)
        print("✅ Successfully wrote test data to Firebase")

        # Test read
        data = ref.get()
        if data:
            print(f"✅ Successfully read data from Firebase: {len(data)} entries")
            print("Firebase is working correctly!")
        else:
            print("⚠️  No data found in Firebase (this is normal for a new database)")

    except Exception as e:
        print(f"❌ Error accessing Firebase: {str(e)}")
        print("Check your Firebase Realtime Database rules and service account permissions")
else:
    print("❌ Firebase initialization failed")
    print("Make sure serviceAccountKey.json is valid and the database URL is correct")