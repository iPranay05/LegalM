# Import all models here so SQLAlchemy registers them before create_all()
from app.models.commodity_category import CommodityCategory  # noqa
from app.models.user import User  # noqa
from app.models.scan import Scan, ManualFinding  # noqa
from app.models.manufacturer import Manufacturer  # noqa
from app.models.product import Product  # noqa
from app.models.rules import Rule, RelaxationOrder, ComplianceCheck  # noqa
from app.models.report import Report  # noqa
from app.models.ecommerce import EcommerceCheck  # noqa
