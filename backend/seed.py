"""
Run once to create the default admin user.
Usage: python seed.py
"""
from app.database import SessionLocal, engine, Base
from app.models.user import User, UserRole
from app.models.scan import Scan  # must be imported so SQLAlchemy can resolve the relationship
from app.services.auth_service import hash_password

# Create tables if they don't exist yet
Base.metadata.create_all(bind=engine)

db = SessionLocal()

# Check if admin already exists
existing = db.query(User).filter(User.email == "admin@lm.gov.in").first()
if existing:
    print("Admin user already exists.")
else:
    admin = User(
        name="Admin",
        email="admin@lm.gov.in",
        hashed_password=hash_password("admin1234"),
        role=UserRole.Controller,
        district="Central",
        state="Delhi",
        is_active=True,
    )
    db.add(admin)
    db.commit()
    print("Admin user created successfully.")
    print("  Email:    admin@lm.gov.in")
    print("  Password: admin1234")

from app.services.seed_data import seed_rules

# Seed rules and categories
seed_rules(db)
print("Seeded commodity categories and versioned rules successfully.")

db.close()
