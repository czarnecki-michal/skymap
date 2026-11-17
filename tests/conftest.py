import pytest


@pytest.fixture(autouse=True)
def _auto_enable_custom_integrations(request):
    """Enable custom integrations when the HA pytest plugin is installed."""
    try:
        request.getfixturevalue("enable_custom_integrations")
    except pytest.FixtureLookupError:
        pass
    yield
