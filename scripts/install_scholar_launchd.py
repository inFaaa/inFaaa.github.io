#!/usr/bin/env python3
"""Install trusted local updater copies and a daily per-user Mac LaunchAgent."""

from pathlib import Path
import plistlib
import shutil
import subprocess
import sys


LABEL = "io.github.infaaa.scholar-updater"
STATE = Path.home() / "Library/Application Support/JinfaScholarUpdater"
PLIST = Path.home() / "Library/LaunchAgents" / (LABEL + ".plist")
SOURCE = Path(__file__).resolve().parent


def main():
    if sys.platform != "darwin":
        raise SystemExit("This installer requires macOS.")
    marker = STATE / ".managed-scholar-updater"
    if STATE.is_symlink() or (STATE.exists() and (
        not marker.is_file() or marker.read_text().strip() != LABEL
    )):
        raise SystemExit("Refusing to overwrite an unrecognized updater directory.")
    if PLIST.exists():
        with PLIST.open("rb") as stream:
            existing = plistlib.load(stream)
        if existing.get("Label") != LABEL:
            raise SystemExit("An unrelated LaunchAgent already uses this path.")

    STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
    marker.write_text(LABEL + "\n")
    (STATE / "logs").mkdir(exist_ok=True)
    for name in ("run_scholar_daily.sh", "update_scholar.py"):
        destination = STATE / name
        if destination.is_symlink():
            raise SystemExit("Refusing to overwrite a symlink: " + str(destination))
        shutil.copy2(SOURCE / name, destination)
        destination.chmod(0o700)

    definition = {
        "Label": LABEL,
        "ProgramArguments": ["/bin/bash", str(STATE / "run_scholar_daily.sh")],
        "WorkingDirectory": str(STATE),
        "StartCalendarInterval": {"Hour": 8, "Minute": 23},
        "RunAtLoad": True,
        "ProcessType": "Background",
        "StandardOutPath": str(STATE / "logs/stdout.log"),
        "StandardErrorPath": str(STATE / "logs/stderr.log"),
    }
    PLIST.parent.mkdir(parents=True, exist_ok=True)
    with PLIST.open("wb") as stream:
        plistlib.dump(definition, stream)
    PLIST.chmod(0o644)
    subprocess.run(["/usr/bin/plutil", "-lint", str(PLIST)], check=True)
    print("Installed local updater: " + str(STATE))
    print("LaunchAgent: " + str(PLIST))
    print("Schedule: 08:23 in this Mac's local time zone, plus login/load.")
    print("Activate: launchctl bootstrap gui/$(id -u) " + repr(str(PLIST)))


if __name__ == "__main__":
    main()
