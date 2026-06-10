"""
config.py – Central configuration loaded from environment / .env file.
All Azure credentials and app settings live here.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field
from pathlib import Path

# Project root
BASE_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = BASE_DIR / ".env"

print("CONFIG ENV PATH:", ENV_FILE)
print("ENV EXISTS:", ENV_FILE.exists())


class Settings(BaseSettings):
    # ── Azure AI Foundry (OpenAI-compatible endpoint) ──────────────────────
    azure_openai_endpoint: str = Field(default="", alias="AZURE_OPENAI_ENDPOINT")
    azure_openai_api_key: str = Field(default="", alias="AZURE_OPENAI_API_KEY")
    azure_openai_api_version: str = Field(default="2024-12-01-preview", alias="AZURE_OPENAI_API_VERSION")
    azure_openai_deployment: str = Field(default="gpt-4o", alias="AZURE_OPENAI_DEPLOYMENT")
    azure_openai_embed_deployment: str = Field(default="text-embedding-3-small", alias="AZURE_OPENAI_EMBED_DEPLOYMENT")

    # ── Azure Document Intelligence ────────────────────────────────────────
    azure_docintel_endpoint: str = Field(default="", alias="AZURE_DOCINTEL_ENDPOINT")
    azure_docintel_api_key: str = Field(default="", alias="AZURE_DOCINTEL_API_KEY")

    # ── App settings ───────────────────────────────────────────────────────
    app_host: str = Field(default="0.0.0.0", alias="APP_HOST")
    app_port: int = Field(default=8000, alias="APP_PORT")
    upload_dir: Path = Field(default=Path("uploads"), alias="UPLOAD_DIR")
    db_dir: Path = Field(default=Path("db"), alias="DB_DIR")
    max_upload_mb: int = Field(default=50, alias="MAX_UPLOAD_MB")

    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        extra="ignore"
    )

    @property
    def azure_configured(self) -> bool:
        return bool(
            self.azure_openai_endpoint
            and self.azure_openai_api_key
        )

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024


settings = Settings()


# Ensure local directories exist
settings.upload_dir.mkdir(parents=True, exist_ok=True)
settings.db_dir.mkdir(parents=True, exist_ok=True)