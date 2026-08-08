#!/usr/bin/env python3.11
"""Test different approaches to bamctl login with cert trust."""
import asyncio, os, tempfile
from pathlib import Path

BAMCTL = os.path.expanduser("~/ECEV_Provisoning_new/bin/bamctl")
HOME_DIR = os.path.expanduser("~/ECEV_Provisoning_new/data/bamctl_session")
Path(HOME_DIR).mkdir(parents=True, exist_ok=True)

USERNAME = "superuser"
PASSWORD = "Superuser@12345"
IAM_URL = "https://eric-sec-access-mgmt.ecevns-oam-haber031.ews.gic.ericsson.se"

async def try_login():
    pf = tempfile.NamedTemporaryFile(mode="w", suffix=".pass", delete=False)
    pf.write(PASSWORD)
    pf.close()
    
    env = os.environ.copy()
    env["HOME"] = HOME_DIR
    
    # Approach: use bash -c with echo yes piped
    shell_cmd = f'echo "yes" | {BAMCTL} login -u {USERNAME} -p {pf.name} -t {IAM_URL}'
    print(f"Approach: bash -c with pipe")
    print(f"Command: {shell_cmd}")
    
    proc = await asyncio.create_subprocess_shell(
        shell_cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=env,
    )
    stdout, stderr = await proc.communicate()
    print(f"Return code: {proc.returncode}")
    print(f"STDOUT: {stdout.decode()[:500]}")
    print(f"STDERR: {stderr.decode()[:500]}")
    
    # Check if token was created
    token_path = Path(HOME_DIR) / ".bamctl" / "token"
    print(f"\nToken exists: {token_path.exists()}")
    if token_path.exists():
        print(f"Token size: {token_path.stat().st_size}")
    
    Path(pf.name).unlink(missing_ok=True)

asyncio.run(try_login())
