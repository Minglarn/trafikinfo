
from database import SessionLocal, Settings
from cryptography.hazmat.primitives import serialization
import sys

db = SessionLocal()
priv = db.query(Settings).filter(Settings.key == "vapid_private_key").first()
pub = db.query(Settings).filter(Settings.key == "vapid_public_key").first()

print("--- VAPID DEBUG START ---")
if not priv:
    print("Private Key: MISSING")
else:
    print(f"Private Key Length: {len(priv.value)}")
    print(f"Private Key Start: {priv.value[:30]}...")
    try:
        serialization.load_pem_private_key(priv.value.encode('utf-8'), password=None)
        print("Private Key Validation: OK (Loadable via cryptography)")
    except Exception as e:
        print(f"Private Key Validation: FAILED - {e}")

if not pub:
    print("Public Key: MISSING")
else:
    print(f"Public Key: {pub.value}")

print("--- VAPID DEBUG END ---")
db.close()
