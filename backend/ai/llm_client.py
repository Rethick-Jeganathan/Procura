"""
LLM Client
Provider-swappable LLM client supporting Anthropic, OpenAI, and Google.
Resolves API keys dynamically from the Settings UI (DB) with env-var fallback.
"""
import hashlib
import json
import os
from typing import Optional, Dict, Any
import structlog

from ..config import settings
from ..api_keys import get_api_key

logger = structlog.get_logger()


def _resolve_general_setting(key: str, fallback: Any) -> Any:
    """Try to read a general setting from the DB, fall back to config."""
    try:
        from ..database import get_supabase_client
        client = get_supabase_client()
        row = client.table("system_settings").select("value").eq("key", key).execute()
        if row.data:
            return row.data[0]["value"]
    except Exception:
        pass
    return fallback


class LLMClient:
    """Multi-provider LLM client with automatic fallback"""

    def __init__(self, provider: Optional[str] = None):
        resolved_provider = _resolve_general_setting("llm_provider", settings.PROCURA_LLM_PROVIDER)
        self.provider = provider or resolved_provider
        self.model = _resolve_general_setting("llm_model", settings.LLM_MODEL)
        self.temperature = float(_resolve_general_setting("llm_temperature", settings.LLM_TEMPERATURE))
        self.max_tokens = int(_resolve_general_setting("llm_max_tokens", settings.LLM_MAX_TOKENS))
        self._client = None
        self._google_sdk: Optional[str] = None
        self._init_client()

    def _init_client(self):
        """Initialize the appropriate LLM client using dynamic API keys."""
        if self.provider == "anthropic":
            try:
                import anthropic
                api_key = get_api_key("ANTHROPIC_API_KEY")
                if not api_key:
                    logger.warning("Anthropic API key not configured")
                    return
                self._client = anthropic.Anthropic(api_key=api_key)
            except ImportError:
                logger.warning("Anthropic package not installed")

        elif self.provider == "openai":
            try:
                import openai
                api_key = get_api_key("OPENAI_API_KEY")
                if not api_key:
                    logger.warning("OpenAI API key not configured")
                    return
                self._client = openai.OpenAI(api_key=api_key)
            except ImportError:
                logger.warning("OpenAI package not installed")

        elif self.provider == "google":
            try:
                api_key = get_api_key("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
                if not api_key:
                    logger.warning("Google/Gemini API key not configured")
                    return

                try:
                    from google import genai
                    self._client = genai.Client(api_key=api_key)
                    self._google_sdk = "google-genai"
                    logger.info("Gemini client initialized", model=self.model, sdk=self._google_sdk)
                except ImportError:
                    import google.generativeai as genai  # type: ignore
                    genai.configure(api_key=api_key)
                    self._client = genai.GenerativeModel(self.model)
                    self._google_sdk = "google-generativeai"
                    logger.info("Gemini client initialized", model=self.model, sdk=self._google_sdk)
            except Exception as e:
                logger.warning("Gemini initialization failed", error=str(e))

    def _get_prompt_hash(self, prompt: str) -> str:
        """Generate hash for caching"""
        return hashlib.sha256(prompt.encode()).hexdigest()

    async def complete(self, prompt: str, max_tokens: int = None) -> str:
        """Generate completion from the LLM"""
        max_tokens = max_tokens or self.max_tokens

        try:
            if self.provider == "anthropic" and self._client:
                response = self._client.messages.create(
                    model=self.model,
                    max_tokens=max_tokens,
                    messages=[{"role": "user", "content": prompt}]
                )
                return response.content[0].text

            elif self.provider == "openai" and self._client:
                response = self._client.chat.completions.create(
                    model=self.model if "gpt" in self.model else "gpt-4-turbo-preview",
                    max_tokens=max_tokens,
                    messages=[{"role": "user", "content": prompt}]
                )
                return response.choices[0].message.content

            elif self.provider == "google" and self._client:
                if self._google_sdk == "google-genai":
                    from google.genai import types

                    response = self._client.models.generate_content(
                        model=self.model,
                        contents=prompt,
                        config=types.GenerateContentConfig(
                            maxOutputTokens=max_tokens,
                            temperature=self.temperature,
                        ),
                    )
                    return response.text or ""

                if self._google_sdk == "google-generativeai":
                    response = self._client.generate_content(
                        prompt,
                        generation_config={
                            "max_output_tokens": max_tokens,
                            "temperature": self.temperature,
                        },
                    )
                    return getattr(response, "text", None) or ""

                raise ValueError("Google client not initialized")

            else:
                raise ValueError(f"LLM provider '{self.provider}' not configured")

        except Exception as e:
            logger.error("LLM completion failed", provider=self.provider, error=str(e))
            raise

    async def analyze_json(self, prompt: str, schema: Optional[Dict] = None) -> Dict[str, Any]:
        """Generate structured JSON response"""
        full_prompt = prompt
        if schema:
            full_prompt += f"\n\nRespond with valid JSON matching this schema:\n{json.dumps(schema, indent=2)}"
        else:
            full_prompt += "\n\nRespond with valid JSON only."

        response = await self.complete(full_prompt)

        # Extract JSON from response
        try:
            if "```json" in response:
                response = response.split("```json")[1].split("```")[0]
            elif "```" in response:
                response = response.split("```")[1].split("```")[0]

            return json.loads(response.strip())
        except json.JSONDecodeError as e:
            logger.error("Failed to parse LLM JSON response", error=str(e))
            raise ValueError("LLM did not return valid JSON")


# Lazy singleton - creates a fresh client each time to pick up config changes
def get_llm_client(provider: Optional[str] = None) -> LLMClient:
    """Get an LLM client with the latest settings."""
    return LLMClient(provider=provider)
