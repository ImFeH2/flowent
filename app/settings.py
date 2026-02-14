from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    APP_NAME: str = "Synode"
    DEBUG: bool = False

    LOG_LEVEL: str = "INFO"
    LOG_DIR: str = "logs"
