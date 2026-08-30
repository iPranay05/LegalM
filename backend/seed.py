"""
Seed script for Legal Metrology Compliance System.
Seeds:
  1. Core Commodity Categories (General, Food, Edible Oil, Medical Device)
  2. Complete versioned rules & standard-size worked-example rules
  3. Demo users for all roles (Controller, Inspector, Analyst, ManufacturerSelfCheck)
  4. Demo manufacturers and products across all four categories

Usage:
  docker compose run --rm backend python seed.py
"""
import sys
from app.database import SessionLocal
from app.models.user import User, UserRole
from app.models.scan import Scan
from app.models.manufacturer import Manufacturer
from app.models.product import Product
from app.services.auth_service import hash_password
from app.services.seed_data import seed_categories, seed_rules


def run_seed():
    print("Connecting to the initialized database...")
    db = SessionLocal()

    try:
        # 1. Seed Categories & Rules
        print("\n[1/4] Seeding Commodity Categories & Versioned Rules...")
        categories = seed_categories(db)
        rules = seed_rules(db)
        print(f"  ✓ Seeded {len(categories)} categories and {len(rules)} rules.")

        # 2. Seed Demo Users for all roles
        print("\n[2/4] Seeding Demo Users for all system roles...")
        users_to_seed = [
            {
                "email": "admin@lm.gov.in",
                "name": "Legal Metrology Admin",
                "role": UserRole.Controller,
                "password": "admin1234",
                "state": "Delhi",
                "district": "Central",
            },
            {
                "email": "controller@lm.gov.in",
                "name": "Rajesh Sharma (Controller)",
                "role": UserRole.Controller,
                "password": "controller1234",
                "state": "Maharashtra",
                "district": "Mumbai City",
            },
            {
                "email": "inspector@lm.gov.in",
                "name": "Vikram Singh (Inspector)",
                "role": UserRole.Inspector,
                "password": "inspector1234",
                "state": "Maharashtra",
                "district": "Mumbai Suburban",
            },
            {
                "email": "analyst@lm.gov.in",
                "name": "Priya Nair (Analyst)",
                "role": UserRole.Analyst,
                "password": "analyst1234",
                "state": "Delhi",
                "district": "New Delhi",
            },
            {
                "email": "manufacturer@tata.com",
                "name": "Tata Consumer QA Team",
                "role": UserRole.ManufacturerSelfCheck,
                "password": "mfr1234",
                "state": "Maharashtra",
                "district": "Mumbai City",
            },
        ]

        for udata in users_to_seed:
            existing = db.query(User).filter(User.email == udata["email"]).first()
            if not existing:
                user = User(
                    email=udata["email"],
                    name=udata["name"],
                    hashed_password=hash_password(udata["password"]),
                    role=udata["role"],
                    state=udata["state"],
                    district=udata["district"],
                    is_active=True,
                )
                db.add(user)
                db.flush()
                print(f"  ✓ Created user: {udata['email']} ({udata['role'].value}) [Password: {udata['password']}]")
            else:
                existing.role = udata["role"]
                existing.hashed_password = hash_password(udata["password"])
                print(f"  • User {udata['email']} already exists (updated password/role).")

        # 3. Seed Demo Manufacturers
        print("\n[3/4] Seeding Demo Manufacturers...")
        manufacturers_data = [
            {
                "name": "Tata Consumer Products Limited",
                "address": "1, Bishop Lefroy Road, Kolkata, West Bengal 700020",
                "contact_email": "manufacturer@tata.com",
                "contact_phone": "1800-108-4488",
                "registration_number": "LM/MFR/WB/2021/00842",
                "state": "West Bengal",
                "city": "Kolkata",
            },
            {
                "name": "Adani Wilmar Limited",
                "address": "Fortune House, Near Navrangpura Railway Crossing, Ahmedabad, Gujarat 380009",
                "contact_email": "compliance@adaniwilmar.in",
                "contact_phone": "1800-233-9999",
                "registration_number": "LM/MFR/GJ/2020/01294",
                "state": "Gujarat",
                "city": "Ahmedabad",
            },
            {
                "name": "Reckitt Benckiser (India) Pvt Ltd",
                "address": "DLF Cyber City, Tower C, DLF Phase 2, Gurugram, Haryana 122002",
                "contact_email": "india.compliance@reckitt.com",
                "contact_phone": "1800-102-2786",
                "registration_number": "LM/MFR/HR/2019/00311",
                "state": "Haryana",
                "city": "Gurugram",
            },
            {
                "name": "Roche Diagnostics India Pvt Ltd",
                "address": "Silver Metropolis, Western Express Highway, Goregaon East, Mumbai 400063",
                "contact_email": "regulatory.india@roche.com",
                "contact_phone": "1800-120-7624",
                "registration_number": "LM/MFR/MH/2021/04521",
                "state": "Maharashtra",
                "city": "Mumbai",
            },
        ]

        mfr_map = {}
        for mdata in manufacturers_data:
            mfr = db.query(Manufacturer).filter(Manufacturer.name == mdata["name"]).first()
            if not mfr:
                mfr = Manufacturer(**mdata)
                db.add(mfr)
                db.flush()
                print(f"  ✓ Created manufacturer: {mdata['name']}")
            else:
                for k, v in mdata.items():
                    setattr(mfr, k, v)
            mfr_map[mdata["name"]] = mfr

        # 4. Seed Demo Products across all 4 categories
        print("\n[4/4] Seeding Demo Products across categories...")
        products_data = [
            {
                "name": "Tata Salt Vacuum Evaporated Iodised Salt",
                "brand_name": "Tata Salt",
                "category": "food",
                "commodity_category_id": categories["Food"].id,
                "manufacturer_id": mfr_map["Tata Consumer Products Limited"].id,
                "is_compliant": True,
                "last_compliance_score": 100.0,
            },
            {
                "name": "Fortune Sunlite Refined Sunflower Oil",
                "brand_name": "Fortune",
                "category": "edible_oil",
                "commodity_category_id": categories["Edible Oil"].id,
                "manufacturer_id": mfr_map["Adani Wilmar Limited"].id,
                "is_compliant": True,
                "last_compliance_score": 95.0,
            },
            {
                "name": "Dettol Antiseptic Disinfectant Liquid",
                "brand_name": "Dettol",
                "category": "general",
                "commodity_category_id": categories["General"].id,
                "manufacturer_id": mfr_map["Reckitt Benckiser (India) Pvt Ltd"].id,
                "is_compliant": True,
                "last_compliance_score": 90.0,
            },
            {
                "name": "Accu-Chek Active Blood Glucose Test Strips",
                "brand_name": "Accu-Chek",
                "category": "medical_device",
                "commodity_category_id": categories["Medical Device"].id,
                "manufacturer_id": mfr_map["Roche Diagnostics India Pvt Ltd"].id,
                "is_compliant": True,
                "last_compliance_score": 100.0,
            },
        ]

        for pdata in products_data:
            prod = db.query(Product).filter(Product.name == pdata["name"]).first()
            if not prod:
                prod = Product(**pdata)
                db.add(prod)
                print(f"  ✓ Created product: {pdata['name']} [{pdata['category']}]")
            else:
                for k, v in pdata.items():
                    setattr(prod, k, v)

        db.commit()
        print("\n✅ Seed completed successfully! Database is ready for full system demo.")

    except Exception as e:
        db.rollback()
        print(f"\n❌ Error during seeding: {e}", file=sys.stderr)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    run_seed()
