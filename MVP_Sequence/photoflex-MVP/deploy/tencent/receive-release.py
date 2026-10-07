#!/usr/bin/python3
"""Forced SSH command for publishing PhotoFlex static files."""

import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile

BASE = Path("/srv/photoflex")
PRODUCTION_ENV = "photoflex-prod-d8g6nph8u08611400"


def parse_command(command):
    match = re.fullmatch(r"deploy ([0-9a-f]{40}) ([0-9]+-[0-9]+) ([0-9a-f]{64})", command)
    if not match:
        raise ValueError("Only the PhotoFlex deploy command is allowed")
    return match.groups()


def extract_static_files(package, destination):
    with tarfile.open(package, "r:gz") as archive:
        members = archive.getmembers()
        for member in members:
            path = PurePosixPath(member.name)
            if path.is_absolute() or ".." in path.parts or not (member.isfile() or member.isdir()):
                raise ValueError("Release must contain only static files within its directory")
        archive.extractall(destination, members=members, filter="data")
    for path in destination.rglob("*"):
        path.chmod(0o755 if path.is_dir() else 0o644)
    destination.chmod(0o755)


def switch_release(target):
    pending = BASE / f".current-{os.getpid()}"
    pending.symlink_to(target, target_is_directory=True)
    os.replace(pending, BASE / "current")


def check_release(commit, run):
    result = subprocess.check_output([
        "curl", "--fail", "--silent", "--show-error", "--max-time", "20",
        "--resolve", "photoflex.site:443:127.0.0.1", "https://photoflex.site/release.json",
    ])
    record = json.loads(result)
    if record.get("commit") != commit or record.get("run") != run:
        raise ValueError("Published release did not match the requested commit and run")


def receive_release(commit, run, expected_digest, stream):
    release = BASE / "releases" / f"github-{run}-{commit[:12]}"
    package = BASE / "incoming" / f"github-{run}-{commit[:12]}.tar.gz"
    if release.exists():
        raise ValueError("This release already exists; rerun the workflow for a new attempt")
    digest = hashlib.sha256()
    with package.open("xb") as output:
        while chunk := stream.read(1024 * 1024):
            output.write(chunk)
            digest.update(chunk)
    if digest.hexdigest() != expected_digest:
        raise ValueError("Release archive checksum did not match")

    staging = Path(tempfile.mkdtemp(prefix=".staging-", dir=BASE / "releases"))
    extract_static_files(package, staging)
    record = json.loads((staging / "release.json").read_text())
    if (record.get("commit"), record.get("run"), record.get("cloudbaseEnvId")) != (commit, run, PRODUCTION_ENV):
        raise ValueError("Release manifest did not match this production deployment")
    if not (staging / "index.html").is_file() or not (staging / "assets").is_dir():
        raise ValueError("Release is missing its entry page or assets")
    staging.rename(release)
    shutil.copytree(release / "assets", BASE / "shared" / "assets", dirs_exist_ok=True)

    previous = (BASE / "current").resolve(strict=True)
    switch_release(release)
    try:
        check_release(commit, run)
    except Exception:
        switch_release(previous)
        print(f"Health check failed; restored {previous.name}", file=sys.stderr)
        raise
    print(f"Published {commit} as {release.name}; previous release: {previous.name}")


def main():
    commit, run, digest = parse_command(os.environ.get("SSH_ORIGINAL_COMMAND", ""))
    os.umask(0o022)
    with (BASE / "incoming" / ".deploy.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        receive_release(commit, run, digest, sys.stdin.buffer)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"PhotoFlex deployment failed: {error}", file=sys.stderr)
        sys.exit(1)
