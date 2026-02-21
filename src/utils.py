"""Utility functions for RadarAI"""

import hashlib
import json
import socket
import sys
from datetime import datetime
from pathlib import Path
from typing import List

from loguru import logger

from src.models import Manifest, PackageMetadata, DocumentMetadata
from src.config import settings


def sha256_file(path: Path) -> str:
    """
    Compute SHA-256 hash of a file

    Args:
        path: Path to file

    Returns:
        Hex-encoded SHA-256 hash
    """
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def create_manifest(
    files: List[DocumentMetadata],
    output_path: Path,
    git_commit: str = None
) -> Manifest:
    """
    Create and save a manifest file

    Args:
        files: List of DocumentMetadata objects
        output_path: Path to save manifest.json
        git_commit: Optional git commit hash

    Returns:
        Manifest object
    """
    # Create package metadata
    package = PackageMetadata(
        as_of=settings.as_of_date,
        since=settings.since_date,
        peer_set="fashion_global_8",
        build_version=settings.build_version,
        build_host=socket.gethostname(),
        python_version=f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        git_commit=git_commit,
        license_notes=(
            "Primary source documents (SEC EDGAR, company IR) are publicly available. "
            "Third-party analyst estimates and transcripts may have licensing restrictions. "
            "Check redistributable flag for each file."
        )
    )

    # Create manifest
    manifest = Manifest(package=package, files=files)

    # Save to JSON
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w") as f:
        json.dump(
            manifest.model_dump(mode="json"),
            f,
            indent=2,
            default=str
        )

    logger.info(f"Created manifest with {len(files)} files at {output_path}")
    return manifest


def create_checksums_file(manifest: Manifest, output_path: Path):
    """
    Create a checksums.sha256 file from manifest

    Args:
        manifest: Manifest object
        output_path: Path to save checksums.sha256
    """
    lines = []
    for file_meta in manifest.files:
        # Format: <hash>  <filename>
        lines.append(f"{file_meta.sha256}  {file_meta.file_id}")

    content = "\n".join(lines) + "\n"
    output_path.write_text(content, encoding="utf-8")

    logger.info(f"Created checksums file with {len(lines)} entries at {output_path}")


def create_readme(
    manifest: Manifest,
    output_path: Path
):
    """
    Create a README.md for the data package

    Args:
        manifest: Manifest object
        output_path: Path to save README.md
    """
    readme_content = f"""# RadarAI Fashion Demo Data Package

**Build Date:** {manifest.package.as_of}
**Data Window:** {manifest.package.since} to {manifest.package.as_of}
**Peer Set:** {manifest.package.peer_set}
**Build Version:** {manifest.package.build_version}

## Overview

This data package contains financial filings, earnings materials, and sustainability reports for 8 fashion companies:
- Nike (NKE)
- Lululemon (LULU)
- Under Armour (UAA)
- VF Corporation (VFC)
- Ralph Lauren (RL)
- Inditex (ITX.MC)
- H&M (HMB.ST)
- adidas (ADS.DE)

## Package Contents

**Total Files:** {len(manifest.files)}

### File Types

"""

    # Count by doc type
    doc_type_counts = {}
    for file_meta in manifest.files:
        doc_type = file_meta.doc_type
        doc_type_counts[doc_type] = doc_type_counts.get(doc_type, 0) + 1

    for doc_type, count in sorted(doc_type_counts.items()):
        readme_content += f"- **{doc_type}:** {count} files\n"

    readme_content += f"""

### Source Types

"""

    # Count by source type
    source_type_counts = {}
    for file_meta in manifest.files:
        source_type = file_meta.source_type
        source_type_counts[source_type] = source_type_counts.get(source_type, 0) + 1

    for source_type, count in sorted(source_type_counts.items()):
        readme_content += f"- **{source_type}:** {count} files\n"

    readme_content += """

## Data Sources

### US Companies (SEC EDGAR)
- Nike, Lululemon, Under Armour, VF Corporation, Ralph Lauren
- Source: https://www.sec.gov/edgar/

### International Companies (Company IR Sites)
- Inditex (Spain), H&M (Sweden), adidas (Germany)
- Source: Company investor relations portals

## File Structure

```
companies/
  {company_id}/
    source/
      sec_edgar/    # US filings
      ir/           # Company IR documents
    extracted/
      text/         # Full text extracts
      sections/     # Section-level extracts
      tables/       # Extracted tables as CSV
```

## Integrity Verification

Verify file integrity using the checksums.sha256 file:

```bash
sha256sum -c checksums.sha256
```

## Licensing and Redistribution

See `manifest.json` for per-file redistribution rights. Primary source documents (SEC filings, company IR) are generally redistributable. Third-party content may have restrictions.

## Build Information

- **Host:** {manifest.package.build_host}
- **Python:** {manifest.package.python_version}
- **Git Commit:** {manifest.package.git_commit or "N/A"}

## Usage

This data package is designed for use with the RadarAI scoring system. See the main project documentation for usage instructions.

---

Generated by RadarAI v{manifest.package.build_version}
"""

    output_path.write_text(readme_content, encoding="utf-8")
    logger.info(f"Created README at {output_path}")


def get_git_commit() -> str:
    """
    Get current git commit hash

    Returns:
        Commit hash or None
    """
    try:
        import subprocess
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            cwd=settings.project_root
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except Exception as e:
        logger.warning(f"Could not get git commit: {e}")

    return None
