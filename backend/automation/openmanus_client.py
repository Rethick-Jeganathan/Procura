"""
OpenManus Client — Browser Automation via browser-use
Replaces the former HTTP-based stub with direct browser-use Agent integration.

Uses the browser-use library (pip install browser-use) which provides an
LLM-driven Playwright browser agent capable of navigating portals, filling
forms, uploading files, and capturing submission receipts.
"""
from __future__ import annotations

import asyncio
import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import structlog

from ..api_keys import get_api_key
from ..config import settings

logger = structlog.get_logger()

# Directory for storing screenshots / evidence captured during automation runs.
# Defaults to a persistent project-level directory; override via PROCURA_EVIDENCE_DIR.
_DEFAULT_EVIDENCE = Path(__file__).resolve().parent.parent.parent / "data" / "evidence"
EVIDENCE_DIR = Path(os.getenv("PROCURA_EVIDENCE_DIR", str(_DEFAULT_EVIDENCE)))
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)


def _build_llm():
    """
    Construct the LLM instance for the browser-use Agent.
    Uses the dynamically-resolved API keys from Settings (DB → env fallback).
    Provider priority: Anthropic → OpenAI → Google (first available key wins).
    """
    anthropic_key = get_api_key("ANTHROPIC_API_KEY")
    openai_key = get_api_key("OPENAI_API_KEY")
    google_key = get_api_key("GOOGLE_API_KEY")

    # Determine preferred provider from DB/env config
    provider = getattr(settings, "PROCURA_LLM_PROVIDER", "anthropic").lower()

    if provider == "anthropic" and anthropic_key:
        from browser_use.llm.anthropic.chat import ChatAnthropic

        return ChatAnthropic(
            model=getattr(settings, "LLM_MODEL", "claude-sonnet-4-20250514"),
            api_key=anthropic_key,
            max_tokens=8192,
        )

    if provider == "openai" and openai_key:
        from browser_use.llm.openai.chat import ChatOpenAI

        return ChatOpenAI(
            model="gpt-4o",
            api_key=openai_key,
            max_completion_tokens=8192,
        )

    # Fallback chain: try each provider in order
    if anthropic_key:
        from browser_use.llm.anthropic.chat import ChatAnthropic

        return ChatAnthropic(
            model="claude-sonnet-4-20250514",
            api_key=anthropic_key,
            max_tokens=8192,
        )

    if openai_key:
        from browser_use.llm.openai.chat import ChatOpenAI

        return ChatOpenAI(
            model="gpt-4o",
            api_key=openai_key,
            max_completion_tokens=8192,
        )

    raise RuntimeError(
        "No LLM API key configured. Add an Anthropic or OpenAI key via "
        "Settings → API Keys before running browser automation."
    )


def _build_browser_profile(headless: bool = True):
    """Build a BrowserProfile for the automation run."""
    from browser_use.browser.profile import BrowserProfile

    return BrowserProfile(
        headless=headless,
        disable_security=False,
        accept_downloads=True,
        # Record video evidence for audit trail
        record_video_dir=str(EVIDENCE_DIR / "videos"),
        # Generous page-load timings for government portals
        minimum_wait_page_load_time=1.0,
        wait_for_network_idle_page_load_time=3.0,
        wait_between_actions=0.5,
    )


class OpenManusClient:
    """
    Browser automation client powered by browser-use.

    Provides high-level methods for submitting proposals to government
    portals (SAM.gov, eBuy, etc.) using an LLM-driven browser agent.
    """

    def __init__(self, headless: bool = True):
        self.headless = headless
        self.timeout = getattr(settings, "OPENMANUS_TIMEOUT_SECONDS", 300)
        self._llm = None
        self._browser_profile = None

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()

    async def close(self):
        """Cleanup resources (browser-use handles its own cleanup per run)."""
        pass

    def _get_llm(self):
        if self._llm is None:
            self._llm = _build_llm()
        return self._llm

    def _get_browser_profile(self):
        if self._browser_profile is None:
            self._browser_profile = _build_browser_profile(self.headless)
        return self._browser_profile

    async def health_check(self) -> bool:
        """Verify that browser automation prerequisites are available."""
        try:
            # Check that an LLM key is configured
            _build_llm()
            # Check that playwright browsers are installed
            from playwright.async_api import async_playwright

            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                await browser.close()
            return True
        except Exception as e:
            logger.warning("OpenManus health check failed", error=str(e)[:200])
            return False

    def _build_task_prompt(
        self,
        goal: str,
        portal_url: str,
        credentials: Optional[Dict[str, str]],
        form_data: Dict[str, Any],
        files: List[Dict[str, str]],
        dry_run: bool = False,
    ) -> str:
        """
        Compose a detailed natural-language task prompt for the browser agent.
        The agent will use this to navigate the portal and fill forms.
        """
        parts = [
            f"GOAL: {goal}",
            f"\nPORTAL URL: {portal_url}",
        ]

        if credentials:
            parts.append("\nLOGIN CREDENTIALS:")
            parts.append(f"  Username: {credentials.get('username', 'N/A')}")
            parts.append(f"  Password: {credentials.get('password', 'N/A')}")
            parts.append("  Log into the portal first using these credentials.")

        if form_data:
            parts.append("\nFORM FIELDS TO FILL:")
            for field, value in form_data.items():
                if value is not None:
                    parts.append(f"  {field}: {value}")

        if files:
            parts.append("\nFILES TO UPLOAD:")
            for f in files:
                parts.append(f"  - {f.get('name', 'file')} → {f.get('path', 'N/A')}")

        if dry_run:
            parts.append(
                "\nIMPORTANT: This is a DRY RUN. Complete all steps EXCEPT the "
                "final submit/confirmation button. Stop just before submission."
            )
        else:
            parts.append(
                "\nINSTRUCTIONS: Complete the full submission. After clicking submit, "
                "wait for the confirmation page and capture the receipt/confirmation number."
            )

        parts.append(
            "\nAFTER COMPLETION: Report back with:"
            "\n  1. Whether submission was successful"
            "\n  2. Any receipt ID or confirmation number shown"
            "\n  3. Any error messages encountered"
        )

        return "\n".join(parts)

    async def execute_task(self, task: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute a browser automation task using the browser-use Agent.

        Task structure:
        {
            "goal": "Navigate to portal, fill form, upload files, submit",
            "portal_url": "https://sam.gov",
            "credentials": {"username": "...", "password": "..."},
            "form_data": {"field_name": "value", ...},
            "files": [{"name": "proposal.pdf", "path": "/path/to/file"}, ...],
            "dry_run": False,
            "capture_screenshots": True,
        }
        """
        from browser_use import Agent

        run_id = str(uuid.uuid4())[:8]
        screenshot_dir = EVIDENCE_DIR / f"run_{run_id}"
        screenshot_dir.mkdir(parents=True, exist_ok=True)

        prompt = self._build_task_prompt(
            goal=task.get("goal", "Submit proposal"),
            portal_url=task["portal_url"],
            credentials=task.get("credentials"),
            form_data=task.get("form_data", {}),
            files=task.get("files", []),
            dry_run=task.get("dry_run", False),
        )

        # Pass sensitive credentials so the agent doesn't leak them in logs
        sensitive_data = {}
        creds = task.get("credentials")
        if creds:
            if creds.get("username"):
                sensitive_data["portal_username"] = creds["username"]
            if creds.get("password"):
                sensitive_data["portal_password"] = creds["password"]

        # File paths for upload actions
        file_paths = [f["path"] for f in task.get("files", []) if f.get("path")]

        llm = self._get_llm()
        profile = self._get_browser_profile()

        agent = Agent(
            task=prompt,
            llm=llm,
            browser_profile=profile,
            sensitive_data=sensitive_data if sensitive_data else None,
            available_file_paths=file_paths if file_paths else None,
            use_vision=True,
            max_failures=3,
            max_actions_per_step=5,
            generate_gif=str(screenshot_dir / "replay.gif"),
            save_conversation_path=str(screenshot_dir / "conversation.json"),
        )

        logger.info(
            "Starting browser automation",
            run_id=run_id,
            portal=task.get("portal_url"),
            dry_run=task.get("dry_run", False),
        )

        try:
            # Run with timeout
            max_steps = 50
            result = await asyncio.wait_for(
                agent.run(max_steps=max_steps),
                timeout=self.timeout,
            )

            # Extract results
            is_done = result.is_done()
            is_successful = result.is_successful()
            final_text = result.final_result() or ""
            errors = [e for e in result.errors() if e]
            screenshot_paths = [s for s in result.screenshot_paths() if s]
            step_names = result.action_names()
            duration = result.total_duration_seconds()

            # Parse receipt/confirmation from final text
            receipt_id = None
            confirmation_number = None
            for line in final_text.split("\n"):
                lower = line.lower()
                if "receipt" in lower and ":" in line:
                    receipt_id = line.split(":", 1)[1].strip()
                elif "confirmation" in lower and ":" in line:
                    confirmation_number = line.split(":", 1)[1].strip()

            logger.info(
                "Browser automation completed",
                run_id=run_id,
                success=is_successful,
                steps=len(result),
                duration_s=round(duration, 1),
            )

            return {
                "status": "completed" if is_successful else "failed",
                "success": bool(is_successful),
                "receipt_id": receipt_id,
                "confirmation_number": confirmation_number,
                "screenshots": screenshot_paths,
                "steps": step_names,
                "steps_completed": step_names,
                "final_result": final_text,
                "errors": errors,
                "error": errors[0] if errors else None,
                "duration_seconds": round(duration, 1),
                "evidence_dir": str(screenshot_dir),
            }

        except asyncio.TimeoutError:
            logger.error("Browser automation timed out", run_id=run_id, timeout=self.timeout)
            return {
                "status": "timeout",
                "success": False,
                "error": f"Automation timed out after {self.timeout}s",
                "receipt_id": None,
                "confirmation_number": None,
                "screenshots": [],
                "steps": [],
                "steps_completed": [],
                "evidence_dir": str(screenshot_dir),
            }
        except Exception as e:
            logger.error("Browser automation error", run_id=run_id, error=str(e))
            return {
                "status": "error",
                "success": False,
                "error": str(e),
                "receipt_id": None,
                "confirmation_number": None,
                "screenshots": [],
                "steps": [],
                "steps_completed": [],
                "evidence_dir": str(screenshot_dir),
            }

    async def submit_proposal(
        self,
        portal_url: str,
        credentials: Dict[str, str],
        form_data: Dict[str, Any],
        files: List[Dict[str, str]],
        dry_run: bool = False,
    ) -> Dict[str, Any]:
        """
        Submit a proposal to a government portal.

        Returns:
        {
            "success": bool,
            "receipt_id": str or None,
            "confirmation_number": str or None,
            "screenshots": [str, ...],
            "steps_completed": ["login", "form_fill", "upload", "submit"],
            "error": str or None
        }
        """
        task = {
            "goal": f"Submit proposal to {portal_url}",
            "portal_url": portal_url,
            "credentials": credentials,
            "form_data": form_data,
            "files": files,
            "dry_run": dry_run,
            "capture_screenshots": True,
            "capture_receipt": True,
        }

        result = await self.execute_task(task)

        return {
            "success": result.get("success", False),
            "receipt_id": result.get("receipt_id"),
            "confirmation_number": result.get("confirmation_number"),
            "screenshots": result.get("screenshots", []),
            "steps_completed": result.get("steps_completed", []),
            "error": result.get("error"),
            "evidence_dir": result.get("evidence_dir"),
        }

    async def get_task_status(self, task_id: str) -> Dict[str, Any]:
        """
        Check status of a running task.
        With direct browser-use integration, tasks run to completion in
        execute_task(). This method is retained for API compatibility.
        """
        return {
            "task_id": task_id,
            "status": "unknown",
            "message": "Direct integration runs tasks synchronously. "
                       "Check submission_runs table for results.",
        }
