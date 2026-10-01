from pathlib import Path

import pytest

from controller.offensive_executor import OffensiveToolBlocked, run_in_disposable_workspace
from controller.offensive_registry import get_tool, list_tools


def test_registry_contains_real_source_inventory():
    tools = list_tools()
    ids = {tool["id"] for tool in tools}
    assert {"keylogger", "os_destroyer", "disk_fill", "encryption", "platform_probe"} <= ids
    assert get_tool("os_destroyer").execution == "blocked"


def test_bounded_disk_adapter_is_disposable(tmp_path: Path):
    result = run_in_disposable_workspace("disk_fill", "test-run", tmp_path)
    assert result["bounded"] is True
    assert result["bytes_written"] > 0
    assert result["workspace_removed_on_exit"] is True
    assert not list(tmp_path.glob("m1-offensive-*"))


def test_blocked_source_never_executes(tmp_path: Path):
    with pytest.raises(OffensiveToolBlocked):
        run_in_disposable_workspace("os_destroyer", "blocked-run", tmp_path)
