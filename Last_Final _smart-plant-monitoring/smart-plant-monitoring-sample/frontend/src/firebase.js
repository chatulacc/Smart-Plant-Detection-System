import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  // Add your apiKey, authDomain, etc., here if required by your security rules.
  // For public access, just the databaseURL is strictly necessary.
  databaseURL: "https://smart-plant-detection-system-default-rtdb.asia-southeast1.firebasedatabase.app"
};

const app = initializeApp(firebaseConfig);
export const database = getDatabase(app);
