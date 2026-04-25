#!/usr/bin/env python3
"""
Water Pump Control ML Model
Complete pipeline: Load → Explore → Train → Evaluate → Deploy
"""

import os
from pathlib import Path
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    confusion_matrix, classification_report, roc_auc_score, roc_curve
)
import joblib
import warnings
warnings.filterwarnings('ignore')

# Base directory — always the folder containing this script
BASE_DIR = Path(__file__).parent

# ============================================================================
# STEP 1: LOAD & EXPLORE DATA
# ============================================================================
print("="*70)
print("STEP 1: LOADING & EXPLORING DATA")
print("="*70)

# Load the CSV file
df = pd.read_csv(BASE_DIR / 'Soil Moisture, Air Temperature and humidity, and Water Motor onoff Monitor data.AmritpalKaur.csv')

print(f"✓ Data loaded: {df.shape[0]} rows, {df.shape[1]} columns")
print(f"\nColumn names:\n{df.columns.tolist()}")
print(f"\nFirst 5 rows:\n{df.head()}")
print(f"\nData types:\n{df.dtypes}")
print(f"\nMissing values:\n{df.isnull().sum()}")
print(f"\nBasic statistics:\n{df.describe()}")

# Check class distribution
print(f"\nPump ON/OFF Distribution:")
print(df['Pump Data'].value_counts())
print(f"Percentage: \n{df['Pump Data'].value_counts(normalize=True) * 100}")

# ============================================================================
# STEP 2: PREPARE DATA FOR TRAINING
# ============================================================================
print("\n" + "="*70)
print("STEP 2: DATA PREPARATION")
print("="*70)

# Separate features (X) and target (y)
X = df[['Soil Moisture', 'Temperature', 'Air Humidity']]
y = df['Pump Data']

print(f"✓ Features (X) shape: {X.shape}")
print(f"✓ Target (y) shape: {y.shape}")

# Split into training (70%), validation (15%), and test (15%)
X_train, X_temp, y_train, y_temp = train_test_split(X, y, test_size=0.3, random_state=42, stratify=y)
X_val, X_test, y_val, y_test = train_test_split(X_temp, y_temp, test_size=0.5, random_state=42, stratify=y_temp)

print(f"✓ Training set: {X_train.shape[0]} samples")
print(f"✓ Validation set: {X_val.shape[0]} samples")
print(f"✓ Test set: {X_test.shape[0]} samples")

# Standardize the features (important!)
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_val_scaled = scaler.transform(X_val)
X_test_scaled = scaler.transform(X_test)

print(f"✓ Features standardized (mean=0, std=1)")

# Save the scaler for later use
joblib.dump(scaler, BASE_DIR / 'scaler.pkl')
print(f"✓ Scaler saved to '{BASE_DIR / 'scaler.pkl'}'") 

# ============================================================================
# STEP 3: TRAIN MODELS
# ============================================================================
print("\n" + "="*70)
print("STEP 3: TRAINING MODELS")
print("="*70)

# Model 1: Logistic Regression (simple, fast, interpretable)
print("\n[1] Logistic Regression...")
lr_model = LogisticRegression(random_state=42, max_iter=1000)
lr_model.fit(X_train_scaled, y_train)
lr_pred_train = lr_model.predict(X_train_scaled)
lr_pred_val = lr_model.predict(X_val_scaled)
print(f"✓ Training accuracy: {accuracy_score(y_train, lr_pred_train):.4f}")
print(f"✓ Validation accuracy: {accuracy_score(y_val, lr_pred_val):.4f}")

# Model 2: Random Forest (more powerful, captures non-linearity)
print("\n[2] Random Forest...")
rf_model = RandomForestClassifier(n_estimators=100, random_state=42, max_depth=10)
rf_model.fit(X_train_scaled, y_train)
rf_pred_train = rf_model.predict(X_train_scaled)
rf_pred_val = rf_model.predict(X_val_scaled)
print(f"✓ Training accuracy: {accuracy_score(y_train, rf_pred_train):.4f}")
print(f"✓ Validation accuracy: {accuracy_score(y_val, rf_pred_val):.4f}")

# Choose the best model
if accuracy_score(y_val, rf_pred_val) >= accuracy_score(y_val, lr_pred_val):
    best_model = rf_model
    model_name = "Random Forest"
    best_pred_val = rf_pred_val
else:
    best_model = lr_model
    model_name = "Logistic Regression"
    best_pred_val = lr_pred_val

print(f"\n✓ Best model selected: {model_name}")

# ============================================================================
# STEP 4: EVALUATE ON TEST SET
# ============================================================================
print("\n" + "="*70)
print("STEP 4: FINAL EVALUATION ON TEST SET")
print("="*70)

y_pred_test = best_model.predict(X_test_scaled)
y_pred_proba = best_model.predict_proba(X_test_scaled)[:, 1]

print(f"\n📊 PERFORMANCE METRICS:")
print(f"  Accuracy:  {accuracy_score(y_test, y_pred_test):.4f}")
print(f"  Precision: {precision_score(y_test, y_pred_test):.4f}")
print(f"  Recall:    {recall_score(y_test, y_pred_test):.4f}")
print(f"  F1-Score:  {f1_score(y_test, y_pred_test):.4f}")
print(f"  ROC-AUC:   {roc_auc_score(y_test, y_pred_proba):.4f}")

print(f"\n📋 CLASSIFICATION REPORT:")
print(classification_report(y_test, y_pred_test, target_names=['Pump OFF', 'Pump ON']))

print(f"\n🔄 CONFUSION MATRIX:")
cm = confusion_matrix(y_test, y_pred_test)
print(cm)
print(f"  True Negatives (TN):  {cm[0,0]} (correctly OFF)")
print(f"  False Positives (FP): {cm[0,1]} (incorrectly ON)")
print(f"  False Negatives (FN): {cm[1,0]} (incorrectly OFF)")
print(f"  True Positives (TP):  {cm[1,1]} (correctly ON)")

# ============================================================================
# STEP 5: VISUALIZE RESULTS
# ============================================================================
print("\n" + "="*70)
print("STEP 5: GENERATING VISUALIZATIONS")
print("="*70)

fig, axes = plt.subplots(2, 2, figsize=(14, 10))
fig.suptitle('Water Pump ML Model - Performance Analysis', fontsize=16, fontweight='bold')

# Plot 1: Confusion Matrix
sns.heatmap(cm, annot=True, fmt='d', cmap='Blues', ax=axes[0,0], cbar=False)
axes[0,0].set_title('Confusion Matrix')
axes[0,0].set_ylabel('Actual')
axes[0,0].set_xlabel('Predicted')
axes[0,0].set_xticklabels(['OFF', 'ON'])
axes[0,0].set_yticklabels(['OFF', 'ON'])

# Plot 2: ROC Curve
fpr, tpr, _ = roc_curve(y_test, y_pred_proba)
auc = roc_auc_score(y_test, y_pred_proba)
axes[0,1].plot(fpr, tpr, linewidth=2, label=f'ROC (AUC={auc:.3f})')
axes[0,1].plot([0, 1], [0, 1], 'k--', alpha=0.3)
axes[0,1].set_xlabel('False Positive Rate')
axes[0,1].set_ylabel('True Positive Rate')
axes[0,1].set_title('ROC Curve')
axes[0,1].legend()
axes[0,1].grid(alpha=0.3)

# Plot 3: Feature Importance (for Random Forest)
if model_name == "Random Forest":
    feature_importance = best_model.feature_importances_
    features = ['Soil Moisture', 'Temperature', 'Air Humidity']
    axes[1,0].barh(features, feature_importance, color=['#1f77b4', '#ff7f0e', '#2ca02c'])
    axes[1,0].set_xlabel('Importance')
    axes[1,0].set_title('Feature Importance (Random Forest)')
else:
    coefficients = best_model.coef_[0]
    features = ['Soil Moisture', 'Temperature', 'Air Humidity']
    colors = ['#1f77b4' if c > 0 else '#d62728' for c in coefficients]
    axes[1,0].barh(features, np.abs(coefficients), color=colors)
    axes[1,0].set_xlabel('|Coefficient|')
    axes[1,0].set_title('Feature Coefficients (Logistic Regression)')

# Plot 4: Metrics Comparison
metrics = ['Accuracy', 'Precision', 'Recall', 'F1-Score']
values = [
    accuracy_score(y_test, y_pred_test),
    precision_score(y_test, y_pred_test),
    recall_score(y_test, y_pred_test),
    f1_score(y_test, y_pred_test)
]
axes[1,1].bar(metrics, values, color=['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728'])
axes[1,1].set_ylim([0, 1])
axes[1,1].set_ylabel('Score')
axes[1,1].set_title('Performance Metrics Summary')
axes[1,1].axhline(y=0.5, color='k', linestyle='--', alpha=0.3)
for i, v in enumerate(values):
    axes[1,1].text(i, v + 0.02, f'{v:.3f}', ha='center', fontweight='bold')

plt.tight_layout()
plt.savefig(BASE_DIR / 'model_performance.png', dpi=300, bbox_inches='tight')
print(f"✓ Visualization saved to '{BASE_DIR / 'model_performance.png'}'") 
plt.close()

# ============================================================================
# STEP 6: SAVE THE MODEL
# ============================================================================
print("\n" + "="*70)
print("STEP 6: SAVING MODEL FOR DEPLOYMENT")
print("="*70)

model_filename = BASE_DIR / 'water_pump_model.pkl'
joblib.dump(best_model, model_filename)
print(f"✓ Model saved to '{model_filename}'")

# ============================================================================
# STEP 7: TEST PREDICTIONS ON NEW DATA
# ============================================================================
print("\n" + "="*70)
print("STEP 7: MAKING PREDICTIONS ON NEW DATA")
print("="*70)

# Example predictions
print("\nExample predictions:")
example_data = [
    {'Soil Moisture': 400, 'Temperature': 30, 'Air Humidity': 70},
    {'Soil Moisture': 500, 'Temperature': 25, 'Air Humidity': 60},
    {'Soil Moisture': 800, 'Temperature': 35, 'Air Humidity': 45},
    {'Soil Moisture': 300, 'Temperature': 28, 'Air Humidity': 75},
]

for i, example in enumerate(example_data, 1):
    X_example = np.array([[example['Soil Moisture'], example['Temperature'], example['Air Humidity']]])
    X_example_scaled = scaler.transform(X_example)
    prediction = best_model.predict(X_example_scaled)[0]
    probability = best_model.predict_proba(X_example_scaled)[0]
    
    status = "💧 ON (Water pump activates)" if prediction == 1 else "🔴 OFF (Water pump stays off)"
    print(f"\n[{i}] Soil: {example['Soil Moisture']}, Temp: {example['Temperature']}, Humidity: {example['Air Humidity']}")
    print(f"    → {status}")
    print(f"    → Confidence: {max(probability)*100:.2f}%")

# ============================================================================
# STEP 8: CREATE DEPLOYMENT FUNCTION
# ============================================================================
print("\n" + "="*70)
print("STEP 8: DEPLOYMENT FUNCTION")
print("="*70)

def predict_pump_status(soil_moisture, temperature, humidity):
    """
    Predict whether the water pump should be ON or OFF
    
    Args:
        soil_moisture (float): Soil moisture reading (0-1000)
        temperature (float): Air temperature in Celsius
        humidity (float): Air humidity percentage (0-100)
    
    Returns:
        dict: {'prediction': 0 or 1, 'confidence': float, 'status': str}
    """
    # Load model and scaler
    _base = Path(__file__).parent
    model = joblib.load(_base / 'water_pump_model.pkl')
    scaler = joblib.load(_base / 'scaler.pkl')
    
    # Prepare input
    X = np.array([[soil_moisture, temperature, humidity]])
    X_scaled = scaler.transform(X)
    
    # Make prediction
    prediction = model.predict(X_scaled)[0]
    probability = max(model.predict_proba(X_scaled)[0])
    status = "Pump ON" if prediction == 1 else "Pump OFF"
    
    return {
        'prediction': int(prediction),
        'confidence': float(probability),
        'status': status
    }

print("\n✓ Deployment function created!")
print("\nUsage example:")
print(">>> result = predict_pump_status(soil_moisture=450, temperature=28, humidity=65)")
print(">>> print(result)")

# Test the function
result = predict_pump_status(450, 28, 65)
print(f"\n{result}")

print("\n" + "="*70)
print("✅ TRAINING COMPLETE!")
print("="*70)
print(f"\n📁 Files saved:")
print(f"   • water_pump_model.pkl - Trained model")
print(f"   • scaler.pkl - Feature scaler")
print(f"   • model_performance.png - Visualization")
