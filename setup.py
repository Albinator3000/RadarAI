"""Setup script for RadarAI"""

from setuptools import setup, find_packages

setup(
    name="radarai",
    version="0.1.0",
    packages=find_packages(),
    python_requires=">=3.9",
    install_requires=[
        "httpx>=0.27.0",
        "tenacity>=8.2.3",
        "beautifulsoup4>=4.12.3",
        "trafilatura>=1.8.0",
        "pymupdf>=1.24.0",
        "pdfplumber>=0.11.0",
        "redis>=5.0.1",
        "redisvl>=0.2.0",
        "pandas>=2.2.0",
        "numpy>=1.26.4",
        "pydantic>=2.6.1",
        "pydantic-settings>=2.1.0",
        "voyageai>=0.2.3",
        "tiktoken>=0.6.0",
        "python-dotenv>=1.0.1",
        "loguru>=0.7.2",
        "pyyaml",
    ],
    entry_points={
        "console_scripts": [
            "radarai-build=scripts.build_data_package:main",
            "radarai-load=scripts.load_to_redis:main",
        ],
    },
)
