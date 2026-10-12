from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext

from app.db.base import Base
from app.db.session import engine


def test_migrations_produce_exactly_the_model_schema():
    """The test schema is built by `alembic upgrade head`; if a model changed
    without a migration, this reports the drift."""
    with engine.connect() as connection:
        diff = compare_metadata(MigrationContext.configure(connection), Base.metadata)
    assert diff == []
