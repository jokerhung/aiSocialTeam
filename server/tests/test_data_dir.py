from pathlib import Path

from botteam.store import data_dir


def test_the_data_folder_comes_from_the_setting_and_expands_the_home_folder(monkeypatch, tmp_path):
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("USERPROFILE", str(tmp_path))
    monkeypatch.setenv("BOTTEAM_DATA_DIR", "~/.botsocial")
    assert data_dir() == tmp_path / ".botsocial"
    assert (tmp_path / ".botsocial").is_dir()


def test_variables_in_the_setting_are_expanded(monkeypatch, tmp_path):
    monkeypatch.setenv("SOCIAL_ROOT", str(tmp_path))
    monkeypatch.setenv("BOTTEAM_DATA_DIR", "$SOCIAL_ROOT/data")
    assert data_dir() == Path(tmp_path) / "data"


def test_without_the_setting_it_is_botsocial_in_the_home_folder(monkeypatch, tmp_path):
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("USERPROFILE", str(tmp_path))
    monkeypatch.delenv("BOTTEAM_DATA_DIR", raising=False)
    assert data_dir() == tmp_path / ".botsocial"
