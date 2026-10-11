from pydantic_settings import BaseSettings, SettingsConfigDict

_DEVELOPMENT_JWT_SECRET = "development-only-secret-replace-before-production-32chars"
_INSECURE_JWT_SECRETS = frozenset({"change-me-in-production", _DEVELOPMENT_JWT_SECRET})


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://user:pass@localhost:5432/docvault"
    S3_ENDPOINT: str = "http://localhost:9000"
    S3_PUBLIC_ENDPOINT: str = "http://localhost:9000"
    S3_ACCESS_KEY: str = "minioadmin"
    S3_SECRET_KEY: str = "minioadmin"
    S3_BUCKET: str = "documents"
    GEMINI_API_KEY: str = ""
    GROQ_API_KEY: str = ""
    MISTRAL_API_KEY: str = ""
    OCR_BACKEND: str = "tesseract"
    AWS_REGION: str = "eu-west-1"
    JWT_SECRET: str = _DEVELOPMENT_JWT_SECRET
    JWT_EXPIRY_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRY_DAYS: int = 30
    REFRESH_TOKEN_EXPIRY_DAYS_SHORT: int = 1
    OLLAMA_URL: str = ""
    EMBEDDING_PROVIDER: str = "auto"  # auto | ollama | gemini — pin to keep vectors comparable
    LANGFUSE_PUBLIC_KEY: str = ""
    LANGFUSE_SECRET_KEY: str = ""
    LANGFUSE_HOST: str = "https://cloud.langfuse.com"
    COGNITO_DOMAIN: str = ""
    COGNITO_CLIENT_ID: str = ""
    COGNITO_REDIRECT_URI: str = "http://localhost:3000/auth/callback"
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:3000/api/v1/auth/oauth/google/callback"
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASS: str = ""
    SMTP_FROM: str = "noreply@docvault.app"
    RESEND_API_KEY: str = ""
    REDIS_URL: str = ""
    FRONTEND_URL: str = "http://localhost:3000"
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()
