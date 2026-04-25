
def calibrate(val):
    return round((val / 4095.0) * 1023.0, 2)

# Test cases
test_values = [0, 4095, 2048, 1024, 3072]
for v in test_values:
    print(f"Original: {v} -> Calibrated: {calibrate(v)}")

# Verify 30% threshold mapping
print(f"30% of 4095 is {0.3 * 4095} -> Calibrated: {calibrate(0.3 * 4095)}")
print(f"30% of 1023 is {0.3 * 1023}")
