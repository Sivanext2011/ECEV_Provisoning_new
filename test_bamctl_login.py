#!/usr/bin/env python3.11
import asyncio, os, tempfile, json
from pathlib import Path

BAMCTL = os.path.expanduser("~/ECEV_Provisoning_new/bin/bamctl")
DATA_DIR = Path(os.path.expanduser("~/ECEV_Provisoning_new/data/bamctl_session"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

async def test_login():
    username = "superuser"
    password = "Superuser@12345"
    iam_url = "https://eric-sec-access-mgmt.ecevns-oam-haber031.ews.gic.ericsson.se"
    
    # Write password to temp file
    pf = tempfile.NamedTemporaryFile(mode="w", suffix=".pass", delete=False)
    pf.write(password)
    pf.close()
    
    env = os.environ.copy()
    env["HOME"] = str(DATA_DIR)
    
    cmd = [BAMCTL, "login", "-u", username, "-p", pf.name, "-t", iam_url]
    print(f"Running: {' '.join(cmd)}")
    print(f"HOME={DATA_DIR}")
    
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=env,
    )
    
    # Send yes multiple times for cert trust
    stdout, stderr = await proc.communicate(input=b"yes\nyes\nyes\n")
    
    print(f"\nReturn code: {proc.returncode}")
    print(f"\nSTDOUT ({len(stdout)} bytes):")
    print(stdout.decode("utf-8", errors="replace")[:1000])
    print(f"\nSTDERR ({len(stderr)} bytes):")
    print(stderr.decode("utf-8", errors="replace")[:1000])
    
    Path(pf.name).unlink(missing_ok=True)

asyncio.run(test_login())
