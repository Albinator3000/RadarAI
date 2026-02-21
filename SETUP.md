# RadarAI Setup Guide

## Prerequisites Checklist

- [x] Python 3.13.7 installed
- [ ] Redis installed and running
- [ ] OpenAI API key configured
- [ ] Python dependencies installed

## Step 1: Install Redis

### Option A: Install via Homebrew (Recommended for macOS)

```bash
brew install redis
```

### Option B: Use Redis Cloud (No local install needed)

Sign up at https://redis.com/try-free/ and get your connection URL.

Update `.env` with:
```
REDIS_URL=redis://default:your-password@your-redis-host:port
```

## Step 2: Start Redis (if using local Redis)

```bash
# Start Redis server
redis-server

# Or start as background service
brew services start redis

# Test connection
redis-cli ping
# Should respond with "PONG"
```

## Step 3: Configure OpenAI API Key

1. Get your API key from https://platform.openai.com/api-keys
2. Edit `.env` file and replace `your_openai_api_key_here` with your actual key:

```bash
nano .env
# or
open .env
```

Update the line:
```
OPENAI_API_KEY=sk-your-actual-key-here
```

## Step 4: Install Python Dependencies

```bash
# Create virtual environment (recommended)
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

## Step 5: Verify Setup

```bash
# Test Redis connection
python3 -c "import redis; r = redis.from_url('redis://localhost:6379'); print('✓ Redis OK' if r.ping() else '✗ Redis failed')"

# Test OpenAI connection (requires API key in .env)
python3 -c "from src.config import settings; print('✓ Config loaded' if settings.openai_api_key != 'your_openai_api_key_here' else '✗ Update .env with OpenAI key')"
```

## Quick Start After Setup

### Test with Single Company (Nike)

```bash
# Build data package for Nike only (~5-10 minutes)
python3 scripts/build_data_package.py --companies nike --log-level INFO

# Load into RedisVL
python3 scripts/load_to_redis.py \
  --manifest-path output/fashion_demo_package_2026-02-21/manifest.json
```

### Full Build (All 8 Companies)

```bash
# Build complete data package (~30-90 minutes)
python3 scripts/build_data_package.py --log-level INFO

# Load into RedisVL
python3 scripts/load_to_redis.py \
  --manifest-path output/fashion_demo_package_2026-02-21/manifest.json
```

## Troubleshooting

### Redis Connection Failed

- Ensure Redis is running: `redis-cli ping`
- Check Redis URL in `.env` matches your setup
- If using Redis Cloud, verify credentials

### OpenAI API Errors

- Verify API key in `.env` is correct
- Check you have credits: https://platform.openai.com/usage
- Rate limits: Default model (text-embedding-ada-002) has high limits

### SEC EDGAR 403 Errors

- Ensure `USER_AGENT` in `.env` includes a valid contact email
- Respect rate limits (default: 2 req/sec)
- SEC requires a descriptive User-Agent header

### PDF Extraction Failures

- Install system dependencies for camelot:
  ```bash
  brew install ghostscript tcl-tk
  ```

### Memory Issues

- Process one company at a time with `--companies` flag
- Increase Docker memory if using containerized Redis
- Monitor with: `redis-cli info memory`

## Cost Estimates

### OpenAI Embeddings

- Model: text-embedding-ada-002
- Cost: $0.0001 per 1K tokens
- Expected usage: ~5,000-10,000 chunks × ~500 tokens/chunk = ~2.5M-5M tokens
- **Estimated cost: $0.25 - $0.50** for full dataset

### Data Transfer

- Download size: ~160 MB - 1.2 GB
- All sources are free (SEC EDGAR, company IR sites)

## Next Steps

Once setup is complete, proceed to PROJECT_README.md for usage instructions.
