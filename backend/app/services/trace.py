"""
Trace Service - Executes bamctl trace-management commands.
Handles: download binary, login, create/get/list/delete trace jobs.
"""
import asyncio
import json
import os
import tempfile
import logging
from pathlib import Path
from typing import Optional
from datetime import datetime

logger = logging.getLogger(__name__)

BIN_DIR = Path(__file__).parent.parent.parent.parent / "bin"
BIN_DIR.mkdir(parents=True, exist_ok=True)

BAMCTL_PATH = str(BIN_DIR / "bamctl")
DATA_DIR = Path(__file__).parent.parent.parent.parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)


class TraceService:
    def __init__(self):
        self._logged_in = False
        self._session_home: Optional[str] = None

    def load_from_config(self, cfg: dict):
        """Load trace settings from config.json."""
        tc = cfg.get("trace_traffic", {})
        self._bam_fqdn = tc.get("bam_fqdn", "")
        self._bam_iam_url = tc.get("bam_iam_url", "")
        self._bam_username = tc.get("bam_username", "")

    @property
    def bamctl_exists(self) -> bool:
        return Path(BAMCTL_PATH).exists() and os.access(BAMCTL_PATH, os.X_OK)

    async def download_bamctl(self, oam_domain: str, bam_fqdn: str = None) -> dict:
        """Download bamctl binary from the OAM site."""
        fqdn = bam_fqdn or f"eric-bss-bam-cli.{oam_domain}"
        url = f"https://{fqdn}/images/linux/bamctl"
        logger.info(f"Downloading bamctl from {url}")

        process = await asyncio.create_subprocess_exec(
            "curl", "-k", "-o", BAMCTL_PATH, url,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await process.communicate()

        if process.returncode == 0:
            os.chmod(BAMCTL_PATH, 0o750)
            return {"status": "success", "path": BAMCTL_PATH, "size": Path(BAMCTL_PATH).stat().st_size}
        return {"status": "failed", "error": stderr.decode()[:500]}

    async def login(self, username: str, password: str, iam_url: str) -> dict:
        """Login bamctl with credentials."""
        if not self.bamctl_exists:
            return {"status": "failed", "error": "bamctl not found. Download it first."}

        # Write password to temp file
        pass_file = tempfile.NamedTemporaryFile(mode="w", suffix=".pass", delete=False)
        pass_file.write(password)
        pass_file.close()

        # Create session home dir
        session_dir = DATA_DIR / "bamctl_session"
        session_dir.mkdir(parents=True, exist_ok=True)
        self._session_home = str(session_dir)

        try:
            env = os.environ.copy()
            env["HOME"] = self._session_home

            process = await asyncio.create_subprocess_exec(
                BAMCTL_PATH, "login", "-u", username, "-p", pass_file.name, "-t", iam_url,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
            )
            # Send multiple "yes" to accept any cert trust prompts
            stdout, stderr = await process.communicate(input=b"yes\nyes\nyes\n")
            
            out_text = stdout.decode("utf-8", errors="replace")
            err_text = stderr.decode("utf-8", errors="replace")
            
            # Login is successful if return code is 0, or if output contains success indicators
            if process.returncode == 0 or "logged in" in out_text.lower() or "token" in out_text.lower():
                self._logged_in = True
                return {"status": "success", "message": "Login successful", "stdout": out_text[:200]}
            
            # Return detailed error for debugging
            return {
                "status": "failed", 
                "error": err_text[:300] or out_text[:300],
                "returncode": process.returncode,
                "stdout": out_text[:500],
                "stderr": err_text[:500],
            }
        finally:
            Path(pass_file.name).unlink(missing_ok=True)

    async def _exec_bamctl(self, args: list, stdin_data: bytes = None) -> dict:
        """Execute a bamctl command."""
        if not self.bamctl_exists:
            return {"status": "failed", "error": "bamctl not found"}
        if not self._logged_in:
            return {"status": "failed", "error": "Not logged in. Call login first."}

        env = os.environ.copy()
        if self._session_home:
            env["HOME"] = self._session_home

        full_cmd = [BAMCTL_PATH] + args
        logger.info(f"Executing: {' '.join(full_cmd)}")

        process = await asyncio.create_subprocess_exec(
            *full_cmd,
            stdin=asyncio.subprocess.PIPE if stdin_data else None,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )

        if stdin_data:
            stdout, stderr = await process.communicate(input=stdin_data)
        else:
            stdout, stderr = await process.communicate()

        out = stdout.decode("utf-8", errors="replace")
        err = stderr.decode("utf-8", errors="replace")

        result = {
            "status": "success" if process.returncode == 0 else "failed",
            "returncode": process.returncode,
            "stdout": out,
            "stderr": err,
        }

        # Try parsing JSON output
        try:
            result["data"] = json.loads(out)
        except (json.JSONDecodeError, ValueError):
            pass

        return result

    # === Trace Management Commands ===

    async def create_trace_job(self, criteria_type: str, criteria_value: str,
                               interface: str = "CHA-ALL", trace_level: int = 1,
                               description: str = "") -> dict:
        """Create a trace job."""
        payload = {
            "coverageType": "GLOBAL",
            "criteriaType": criteria_type,
            "criteriaValue": criteria_value,
            "interface": interface,
            "traceJobDescription": description or f"Trace for {criteria_type}={criteria_value}",
            "traceLevel": trace_level,
        }
        return await self._exec_bamctl(
            ["trace-management", "create-trace-job"],
            stdin_data=json.dumps(payload).encode()
        )

    async def get_trace_job(self, trace_id: str) -> dict:
        """Get trace job details/results."""
        return await self._exec_bamctl(["trace-management", "get-trace-job", "--id", trace_id])

    async def list_trace_jobs(self) -> dict:
        """List all active trace jobs."""
        return await self._exec_bamctl(["trace-management", "list-trace-jobs"])

    async def delete_trace_job(self, trace_id: str) -> dict:
        """Delete/stop a trace job."""
        return await self._exec_bamctl(["trace-management", "delete-trace-job", "--id", trace_id])

    async def get_trace_result(self, trace_id: str) -> dict:
        """Get trace results (collected data)."""
        # Try get-trace-result first, fall back to get-trace-job
        result = await self._exec_bamctl(["trace-management", "get-trace-result", "--id", trace_id])
        if result["status"] == "failed" and "unknown command" in result.get("stderr", ""):
            result = await self._exec_bamctl(["trace-management", "get-trace-job", "--id", trace_id])
        return result


# Singleton
trace_service = TraceService()
