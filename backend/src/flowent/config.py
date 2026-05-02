from pydantic_settings import BaseSettings, SettingsConfigDict


class Config(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    APP_NAME: str = "Flowent"
    DEBUG: bool = False
    SESSION_SECRET: str = ""
    SESSION_COOKIE_NAME: str = "flowent_admin_session"
    SESSION_MAX_AGE_SECONDS: int = 604800

    LOG_LEVEL: str = "INFO"
    LOG_DIR: str = "logs"
