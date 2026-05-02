import os
import tempfile

if not os.environ.get("FLOWENT_APP_DATA_DIR"):
    _APP_DATA_DIR = tempfile.TemporaryDirectory(prefix="flowent-pytest-")
    os.environ["FLOWENT_APP_DATA_DIR"] = _APP_DATA_DIR.name
