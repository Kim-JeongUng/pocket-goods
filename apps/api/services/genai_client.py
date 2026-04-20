import json
import logging
import os
import tempfile
from pathlib import Path

from fastapi import HTTPException
from google import genai

logger = logging.getLogger(__name__)

DEFAULT_GCP_LOCATION = "global"
GOOGLE_CREDENTIALS_PATH_ENV = "GOOGLE_APPLICATION_CREDENTIALS"
GOOGLE_CREDENTIALS_JSON_ENV = "GOOGLE_CREDENTIALS"


def _materialize_google_credentials(log_tag: str) -> None:
    """Allow env-var GOOGLE_CREDENTIALS JSON to work as ADC.

    Google client libraries discover service-account files through
    GOOGLE_APPLICATION_CREDENTIALS. Serverless hosts are easier to manage with a
    single JSON environment variable, so write that value to a temporary file.
    """
    if os.getenv(GOOGLE_CREDENTIALS_PATH_ENV):
        return

    credentials_json = os.getenv(GOOGLE_CREDENTIALS_JSON_ENV)
    if not credentials_json:
        return

    credentials_path = Path(tempfile.gettempdir()) / "pocket-goods-gcp-sa-key.json"
    try:
        parsed_credentials = json.loads(credentials_json)
        if not isinstance(parsed_credentials, dict):
            raise ValueError("GOOGLE_CREDENTIALS must be a service-account JSON object.")
        if parsed_credentials.get("type") != "service_account":
            raise ValueError("GOOGLE_CREDENTIALS.type must be 'service_account'.")
        if not parsed_credentials.get("client_email") or not parsed_credentials.get("private_key"):
            raise ValueError("GOOGLE_CREDENTIALS must include client_email and private_key.")
        credentials_path.write_text(
            json.dumps(parsed_credentials),
            encoding="utf-8",
        )
    except json.JSONDecodeError as exc:
        logger.error("[%s] GOOGLE_CREDENTIALS is not valid JSON.", log_tag)
        raise HTTPException(
            status_code=500,
            detail=(
                "GOOGLE_CREDENTIALS가 올바른 JSON이 아닙니다. "
                "배포 환경변수에는 서비스 계정 JSON 전체를 한 줄 JSON 또는 유효한 멀티라인 값으로 넣어주세요."
            ),
        ) from exc
    except ValueError as exc:
        logger.error("[%s] invalid GOOGLE_CREDENTIALS: %s", log_tag, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    os.environ[GOOGLE_CREDENTIALS_PATH_ENV] = str(credentials_path)
    logger.info("[%s] Google ADC credentials materialized from GOOGLE_CREDENTIALS", log_tag)


def get_genai_client(log_tag: str) -> genai.Client:
    gcp_project = os.getenv("GCP_PROJECT_ID") or os.getenv("GOOGLE_CLOUD_PROJECT")
    gcp_location = (
        os.getenv("GCP_LOCATION")
        or os.getenv("GOOGLE_CLOUD_LOCATION")
        or DEFAULT_GCP_LOCATION
    )
    gemini_key = os.getenv("GEMINI_API_KEY")

    if gcp_project:
        _materialize_google_credentials(log_tag)
        # Keep SDK env-based routing in sync with the explicit Client arguments.
        # This prevents accidental fallback to the Gemini Developer API
        # (generativelanguage.googleapis.com) when both auth styles exist.
        os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "true"
        os.environ["GOOGLE_CLOUD_PROJECT"] = gcp_project
        os.environ["GOOGLE_CLOUD_LOCATION"] = gcp_location
        client = genai.Client(
            vertexai=True,
            project=gcp_project,
            location=gcp_location,
        )
        logger.info(
            "[%s] Vertex AI 사용 (project=%s, location=%s)",
            log_tag,
            gcp_project,
            gcp_location,
        )
        return client

    if gemini_key:
        client = genai.Client(api_key=gemini_key)
        logger.info("[%s] Gemini API 키 사용", log_tag)
        return client

    raise HTTPException(
        status_code=500,
        detail=(
            "GCP_PROJECT_ID/GOOGLE_CLOUD_PROJECT 또는 GEMINI_API_KEY가 설정되지 않았습니다. "
            "Vertex AI를 사용할 경우 GCP_PROJECT_ID, GCP_LOCATION, GOOGLE_CREDENTIALS를 설정해주세요."
        ),
    )
