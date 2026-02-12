"""
Script to reset admin user password securely.
Usage:
    python reset_admin_password.py

Environment variables (optional):
    ADMIN_EMAIL - Admin user email
    ADMIN_UID - Admin user UUID
    ADMIN_PASSWORD - New password to set
"""
import os
import sys
from getpass import getpass
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

# Supabase connection
url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not url or not key:
    print("Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    sys.exit(1)

supabase: Client = create_client(url, key)

# Get credentials from environment or prompt user
admin_email = os.environ.get("ADMIN_EMAIL")
if not admin_email:
    admin_email = input("Admin email: ").strip()
    if not admin_email:
        print("Error: Admin email is required")
        sys.exit(1)

admin_uid = os.environ.get("ADMIN_UID")
if not admin_uid:
    admin_uid = input("Admin UUID: ").strip()
    if not admin_uid:
        print("Error: Admin UUID is required")
        sys.exit(1)

new_password = os.environ.get("ADMIN_PASSWORD")
if not new_password:
    new_password = getpass("New password: ")
    confirm_password = getpass("Confirm password: ")

    if new_password != confirm_password:
        print("Error: Passwords do not match")
        sys.exit(1)

    if len(new_password) < 12:
        print("Error: Password must be at least 12 characters")
        sys.exit(1)

# Validate inputs
if "@" not in admin_email:
    print("Error: Invalid email format")
    sys.exit(1)

if len(admin_uid) < 32:
    print("Error: Invalid UUID format")
    sys.exit(1)

# Confirm action
print(f"\n⚠️  You are about to reset the password for: {admin_email}")
print(f"   UUID: {admin_uid}")
confirmation = input("\nContinue? (yes/no): ").strip().lower()

if confirmation != "yes":
    print("Operation cancelled")
    sys.exit(0)

try:
    # Update password using admin API
    response = supabase.auth.admin.update_user_by_id(
        uid=admin_uid,
        attributes={"password": new_password}
    )

    print(f"\n✅ Password reset successful for {admin_email}")
    print("   You can now login with the new password")

except Exception as e:
    print(f"❌ Error resetting password: {e}")
    sys.exit(1)
