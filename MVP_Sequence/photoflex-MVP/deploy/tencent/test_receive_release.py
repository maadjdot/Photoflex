import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("receiver", Path(__file__).with_name("receive-release.py"))
receiver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(receiver)
COMMIT = "a" * 40


def archive_bytes(run, *, env=receiver.PRODUCTION_ENV, extra=None):
    stream = io.BytesIO()
    files = {
        "index.html": b"<html>PhotoFlex</html>",
        "assets/new.js": b"console.log('PhotoFlex')",
        "release.json": json.dumps({"commit": COMMIT, "run": run, "cloudbaseEnvId": env}).encode(),
    }
    with tarfile.open(fileobj=stream, mode="w:gz") as archive:
        for name, data in files.items():
            member = tarfile.TarInfo(name)
            member.size = len(data)
            member.mode = 0o600
            archive.addfile(member, io.BytesIO(data))
        if extra:
            archive.addfile(extra)
    return stream.getvalue()


class ReceiveReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="photoflex-deploy-test-")
        self.base = Path(self.temp.name)
        self.base_patch = patch.object(receiver, "BASE", self.base)
        self.base_patch.start()
        for directory in ("releases/previous", "incoming", "shared/assets"):
            (self.base / directory).mkdir(parents=True)
        self.previous = self.base / "releases/previous"
        (self.base / "current").symlink_to(self.previous, target_is_directory=True)
        (self.base / "shared/assets/old.js").write_text("previous asset")

    def tearDown(self):
        self.base_patch.stop()
        self.temp.cleanup()

    def deploy(self, run="1-1", *, env=receiver.PRODUCTION_ENV, digest=None, extra=None):
        data = archive_bytes(run, env=env, extra=extra)
        receiver.receive_release(COMMIT, run, digest or hashlib.sha256(data).hexdigest(), io.BytesIO(data))

    def test_success_keeps_old_assets_and_serves_readable_files(self):
        with patch.object(receiver, "check_release") as check:
            self.deploy()
        check.assert_called_once_with(COMMIT, "1-1")
        live = (self.base / "current").resolve()
        self.assertEqual(live.name, f"github-1-1-{COMMIT[:12]}")
        self.assertEqual((live / "index.html").stat().st_mode & 0o777, 0o644)
        self.assertTrue((self.base / "shared/assets/old.js").exists())
        self.assertTrue((self.base / "shared/assets/new.js").exists())

    def test_failed_health_check_restores_previous_release(self):
        with patch.object(receiver, "check_release", side_effect=ValueError("failed")):
            with self.assertRaises(ValueError):
                self.deploy()
        self.assertEqual((self.base / "current").resolve(), self.previous)

    def test_bad_checksum_and_development_manifest_leave_current_unchanged(self):
        for run, kwargs in (("2-1", {"digest": "0" * 64}), ("3-1", {"env": "development"})):
            with self.assertRaises(ValueError):
                self.deploy(run, **kwargs)
            self.assertEqual((self.base / "current").resolve(), self.previous)

    def test_archive_cannot_write_outside_release_or_create_links(self):
        traversal = tarfile.TarInfo("../../outside")
        link = tarfile.TarInfo("assets/link")
        link.type = tarfile.SYMTYPE
        link.linkname = "/home/ubuntu/.ssh/authorized_keys"
        for number, member in enumerate((traversal, link), 4):
            with self.assertRaises(ValueError):
                self.deploy(f"{number}-1", extra=member)
            self.assertEqual((self.base / "current").resolve(), self.previous)
        self.assertFalse((self.base / "outside").exists())

    def test_forced_command_rejects_shell_and_sftp_requests(self):
        self.assertEqual(receiver.parse_command(f"deploy {COMMIT} 1-1 {'b' * 64}"), (COMMIT, "1-1", "b" * 64))
        for command in ("", "sh", "scp -t /home/ubuntu", "internal-sftp", f"deploy {COMMIT} 1-1 {'b' * 64}; sh"):
            with self.assertRaises(ValueError):
                receiver.parse_command(command)

    def test_health_check_rejects_a_different_live_commit(self):
        with patch.object(receiver.subprocess, "check_output", return_value=b'{"commit":"wrong","run":"1-1"}'):
            with self.assertRaises(ValueError):
                receiver.check_release(COMMIT, "1-1")


if __name__ == "__main__":
    unittest.main()
