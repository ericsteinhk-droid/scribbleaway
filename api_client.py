"""
api_client.py — Thin Anthropic SDK wrapper for NMS/DDN translation.

One call per segment. System prompt (which includes the full lexicon) is
sent with cache_control=ephemeral so repeated calls within a batch hit the
prompt cache and cut token costs significantly.

Raises:
  ApiAuthError      — bad key or quota exhausted
  ApiRateLimitError — transient; caller should surface to user
  ApiError          — other unrecoverable API errors
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field

import anthropic


class ApiAuthError(Exception):
    pass


class ApiRateLimitError(Exception):
    pass


class ApiError(Exception):
    pass


@dataclass
class TranslationResponse:
    translated: str
    flags: list[str] = field(default_factory=list)
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0


class ApiClient:
    def __init__(self, api_key: str, model: str):
        self.model = model
        self._client = anthropic.Anthropic(api_key=api_key)
        self._total_input = 0
        self._total_output = 0
        self._total_cache_read = 0

    def translate(self, system_prompt: str, user_message: str) -> TranslationResponse:
        """
        Single translation call. System prompt is marked for caching — the
        lexicon block is large enough (>1024 tokens) to benefit.
        """
        last_exc = None
        for attempt in range(4):
            try:
                resp = self._client.messages.create(
                    model=self.model,
                    max_tokens=4096,
                    system=[
                        {
                            "type": "text",
                            "text": system_prompt,
                            "cache_control": {"type": "ephemeral"},
                        }
                    ],
                    messages=[{"role": "user", "content": user_message}],
                )
                text = resp.content[0].text if resp.content else ""
                usage = resp.usage
                cr = getattr(usage, "cache_read_input_tokens", 0) or 0
                self._total_input += usage.input_tokens
                self._total_output += usage.output_tokens
                self._total_cache_read += cr
                return TranslationResponse(
                    translated=text.strip(),
                    input_tokens=usage.input_tokens,
                    output_tokens=usage.output_tokens,
                    cache_read_tokens=cr,
                )
            except anthropic.AuthenticationError as e:
                raise ApiAuthError(str(e)) from e
            except anthropic.PermissionDeniedError as e:
                raise ApiAuthError(str(e)) from e
            except anthropic.RateLimitError as e:
                last_exc = e
                wait = 2 ** attempt
                time.sleep(wait)
            except anthropic.APIStatusError as e:
                if e.status_code >= 500:
                    last_exc = e
                    time.sleep(2 ** attempt)
                else:
                    raise ApiError(str(e)) from e
            except Exception as e:
                raise ApiError(str(e)) from e

        raise ApiRateLimitError(f"Rate limit / server error after 4 attempts: {last_exc}")

    def usage_summary(self) -> str:
        return (
            f"API usage — input: {self._total_input} tokens, "
            f"output: {self._total_output} tokens, "
            f"cache hits: {self._total_cache_read} tokens"
        )
