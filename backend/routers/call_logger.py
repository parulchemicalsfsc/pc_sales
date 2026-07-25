"""
call_logger.py — Beta: AI-assisted call logging.
Proxies audio chunks to Sarvam/Groq for transcription, and full transcripts
to Groq gpt-oss-120b for structured call-outcome analysis.

API keys (GROQ_API_KEY, SARVAM_API_KEY) are held server-side only.
All endpoints require authentication via x-user-email and x-user-role headers.

Feature flag: controlled on the frontend via FEATURE_FLAGS.CALL_LOGGER_BETA.
This router can be removed entirely (along with the main.py registration) to
fully disable the feature with no residual effect.
"""

import os
import json
import logging
from datetime import datetime
from typing import Optional

import httpx
from fastapi import APIRouter, Header, HTTPException, UploadFile, File, Form
from pydantic import BaseModel

router = APIRouter()
logger = logging.getLogger("call_logger")

# ── Config ────────────────────────────────────────────────────────────────────
GROQ_API_KEY     = os.getenv("GROQ_API_KEY", "")
SARVAM_API_KEY   = os.getenv("SARVAM_API_KEY", "")
DEFAULT_LANGUAGE = os.getenv("CALL_LOGGER_DEFAULT_LANGUAGE", "auto")  # auto | hi | gu

ALLOWED_ROLES    = {"telecaller", "sales_manager", "admin"}
MAX_AUDIO_BYTES  = 5 * 1024 * 1024  # 5 MB cap

DOMAIN_PROMPT_HI = "सभासद, मंत्री, वितरक, एफ.एस. कैल्सिवल, गांव, तालुका, जिला, दूध उत्पादन, पशुपालक, ऑर्डर, फॉलोबैक"
DOMAIN_PROMPT_GU = "સભાસદ, મંત્રી, વિतรक, એફ.એસ. કેલ્સિવલ, ગામ, તાલુકા, જિલ્લો, દૂ� ઉત્પादन, पशुपालक, ઓर्डर, फोलोबेक"


# ── System prompt ─────────────────────────────────────────────────────────────
def _build_system_prompt() -> str:
    today = datetime.now().strftime("%Y-%m-%d")
    return f"""You are extracting a structured call-outcome summary from a raw phone-call transcript between a telecaller and a dairy-farmer customer ("Sabhasad"). The transcript is primarily Hindi and/or Gujarati (Devanagari or Gujarati script, sometimes mixed mid-sentence, occasionally transliterated in Latin letters), with some English business terms. Treat script mixing and code-switching as normal.

Return ONLY a JSON object (no prose, no markdown fences) with exactly these keys:

{{
  "call_connected": true | false,
  "customer_reached": true | false | null,
  "interest": "interested" | "not_interested" | null,
  "introduced_product": true | false,
  "customer_details": string,
  "not_interested_reason": "Expensive" | "Decision Maker" | "Trust Issue" | "Not a Pashupalak" | "Invalid Number" | "Using Other Brand" | "Quality Concern" | "Other" | null,
  "reason_details": string,
  "quality_followup_date": "YYYY-MM-DD" | null,
  "not_reached_reason": "Busy" | "No Answer" | "Switched Off" | "Call Rejected" | null,
  "retry_or_close": "retry" | "close" | null,
  "callback_datetime": "YYYY-MM-DDTHH:MM" | null,
  "notes": string
}}

Rules:
- Infer conservatively. If the transcript doesn't clearly support a field, use null/false/"".
- Correct obvious mis-transcriptions of known terms (Sabhasad, Mantri, F.S. Calcival).
- notes/reason_details/customer_details must be in clear English (translate from Hindi/Gujarati). Keep proper nouns transliterated.
- Dates: resolve relative times ("tomorrow", "kal") relative to today: {today}.
- Output valid JSON only."""


# ── Helpers ────────────────────────────────────────────────────────────────────
def _require_role(role: Optional[str]):
    if not role or role.lower() not in ALLOWED_ROLES:
        raise HTTPException(status_code=403, detail="Only telecallers can use the call logger")


def _validate_ai_fields(fields: dict) -> dict:
    """Clamp all enum fields to allowed values — treat AI output as untrusted input."""
    valid_not_interested = {
        "Expensive", "Decision Maker", "Trust Issue", "Not a Pashupalak",
        "Invalid Number", "Using Other Brand", "Quality Concern", "Other", None
    }
    valid_not_reached = {"Busy", "No Answer", "Switched Off", "Call Rejected", None}
    valid_interest    = {"interested", "not_interested", None}
    valid_retry       = {"retry", "close", None}

    return {
        "call_connected":        bool(fields.get("call_connected", False)),
        "customer_reached":      fields.get("customer_reached"),
        "interest":              fields.get("interest") if fields.get("interest") in valid_interest else None,
        "introduced_product":    bool(fields.get("introduced_product", False)),
        "customer_details":      str(fields.get("customer_details") or ""),
        "not_interested_reason": fields.get("not_interested_reason") if fields.get("not_interested_reason") in valid_not_interested else None,
        "reason_details":        str(fields.get("reason_details") or ""),
        "quality_followup_date": fields.get("quality_followup_date"),
        "not_reached_reason":    fields.get("not_reached_reason") if fields.get("not_reached_reason") in valid_not_reached else None,
        "retry_or_close":        fields.get("retry_or_close") if fields.get("retry_or_close") in valid_retry else None,
        "callback_datetime":     fields.get("callback_datetime"),
        "notes":                 str(fields.get("notes") or ""),
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/transcribe-chunk")
async def transcribe_chunk(
    file: UploadFile = File(...),
    language: str = Form(default="auto"),
    provider: str = Form(default="sarvam"),
    user_email: str = Header(..., alias="x-user-email"),
    user_role: Optional[str] = Header(None, alias="x-user-role"),
):
    """Receive a ~20s audio chunk, proxy to Sarvam or Groq Whisper, return transcript."""
    _require_role(user_role)

    audio_data = await file.read()
    if len(audio_data) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Audio chunk too large (max 5 MB)")
    if len(audio_data) < 500:
        return {"transcript": ""}

    logger.info(f"[CALL-LOGGER] transcribe: user={user_email}, provider={provider}, lang={language}, size={len(audio_data)}B")

    try:
        if provider == "sarvam":
            text = await _transcribe_sarvam(audio_data, file.filename or "chunk.webm", language)
        else:
            text = await _transcribe_groq(audio_data, file.filename or "chunk.webm", language)
        return {"transcript": text}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[CALL-LOGGER] transcription error: {e}")
        raise HTTPException(status_code=502, detail=f"Transcription failed: {str(e)}")


async def _transcribe_sarvam(audio_data: bytes, filename: str, language: str) -> str:
    if not SARVAM_API_KEY:
        raise HTTPException(status_code=503, detail="Sarvam API key not configured on server. Set SARVAM_API_KEY env var.")
    lang_code = "hi-IN" if language == "hi" else "gu-IN" if language == "gu" else "unknown"
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            "https://api.sarvam.ai/speech-to-text",
            headers={"api-subscription-key": SARVAM_API_KEY},
            files={"file": (filename, audio_data, "audio/webm")},
            data={"model": "saaras:v3", "mode": "transcribe", "language_code": lang_code},
        )
    if not resp.is_success:
        raise Exception(f"Sarvam {resp.status_code}: {resp.text[:200]}")
    return (resp.json().get("transcript") or "").strip()


async def _transcribe_groq(audio_data: bytes, filename: str, language: str) -> str:
    if not GROQ_API_KEY:
        raise HTTPException(status_code=503, detail="Groq API key not configured on server. Set GROQ_API_KEY env var.")
    form_data = {"model": "whisper-large-v3", "response_format": "json", "temperature": "0"}
    if language == "hi":
        form_data["language"] = "hi"
        form_data["prompt"]   = DOMAIN_PROMPT_HI
    elif language == "gu":
        form_data["language"] = "gu"
        form_data["prompt"]   = DOMAIN_PROMPT_GU
    else:
        form_data["prompt"] = f"{DOMAIN_PROMPT_HI} | {DOMAIN_PROMPT_GU}"

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            "https://api.groq.com/openai/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
            files={"file": (filename, audio_data, "audio/webm")},
            data=form_data,
        )
    if not resp.is_success:
        raise Exception(f"Groq Whisper {resp.status_code}: {resp.text[:200]}")
    return (resp.json().get("text") or "").strip()


class AnalyzeRequest(BaseModel):
    transcript: str


@router.post("/analyze")
async def analyze_transcript(
    body: AnalyzeRequest,
    user_email: str = Header(..., alias="x-user-email"),
    user_role: Optional[str] = Header(None, alias="x-user-role"),
):
    """Send full transcript to Groq gpt-oss-120b, return validated structured call-outcome fields."""
    _require_role(user_role)

    if not GROQ_API_KEY:
        raise HTTPException(status_code=503, detail="Groq API key not configured on server. Set GROQ_API_KEY env var.")
    if not body.transcript.strip():
        raise HTTPException(status_code=400, detail="Transcript is empty")

    logger.info(f"[CALL-LOGGER] analyze: user={user_email}, len={len(body.transcript)}")

    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            resp = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
                json={
                    "model": "openai/gpt-oss-120b",
                    "response_format": {"type": "json_object"},
                    "temperature": 0.1,
                    "messages": [
                        {"role": "system", "content": _build_system_prompt()},
                        {"role": "user",   "content": f'Transcript:\n"""{body.transcript}"""'},
                    ],
                },
            )
        if not resp.is_success:
            raise Exception(f"Groq chat {resp.status_code}: {resp.text[:200]}")

        content = resp.json()["choices"][0]["message"]["content"]
        raw     = json.loads(content)
        return _validate_ai_fields(raw)

    except json.JSONDecodeError as e:
        logger.error(f"[CALL-LOGGER] AI returned invalid JSON: {e}")
        raise HTTPException(status_code=502, detail="AI returned invalid JSON — analysis failed")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[CALL-LOGGER] analyze error: {e}")
        raise HTTPException(status_code=502, detail=f"Analysis failed: {str(e)}")
