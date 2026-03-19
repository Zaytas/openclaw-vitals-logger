# Vitals Logger Plugin for OpenClaw

Automatically detects physical activities mentioned in chat messages and logs them to a JSON file. Works as an OpenClaw plugin using the `before_prompt_build` hook.

## How It Works

**Presets** — Single-word triggers (e.g., "walk") instantly log a pre-configured default activity. No ambiguity, no delay.

**Detection** — Longer messages pass through a scored keyword pre-gate. If the score exceeds the threshold, the plugin instructs the agent to extract activity details in a structured format, then captures and logs the result on the next turn.

**Dedup** — Before logging, activities are checked against recent entries to prevent duplicates. If a potential duplicate is found, the user is asked to confirm.

## Installation

```
cd ~/.openclaw/plugins
git clone https://github.com/Zaytas/openclaw-vitals-logger.git vitals-logger
```

Add to your `openclaw.json`:

```json
{
  "plugins": [
    {
      "name": "vitals-logger",
      "path": "~/.openclaw/plugins/vitals-logger",
      "enabled": true,
      "config": {
        "channels": ["signal"],
        "dataFile": "~/.openclaw/workspace/data/vitals.json",
        "timezone": "America/Denver",
        "presets": {
          "walk": {
            "type": "walking",
            "duration": 20,
            "distance": 1,
            "distanceUnit": "miles",
            "description": "Daily walk",
            "people": []
          }
        }
      }
    }
  ]
}
```

Restart the gateway after adding the plugin.

## Configuration

See `openclaw.plugin.json` for the full schema. Key options:

- **channels** — Which channels to monitor (default: `["signal"]`)
- **dataFile** — Path to the vitals JSON file
- **timezone** — IANA timezone for date resolution
- **presets** — Map of trigger words to default activities
- **preGate** — Scoring thresholds and keyword lists
- **dedup** — Duplicate detection settings
- **rateLimiting** — Per-channel cooldown after detection
- **debug** — Logging flags for troubleshooting

## Data Format

Activities are stored as:

```json
{
  "activities": [
    {
      "id": "act-abc123-xyz",
      "date": "2026-03-19",
      "time": null,
      "type": "walking",
      "duration": 20,
      "distance": 1,
      "distanceUnit": "miles",
      "description": "Daily walk",
      "people": [],
      "source": "signal",
      "stravaUrl": null,
      "stravaData": null
    }
  ],
  "weightLog": [],
  "goals": []
}
```

## License

MIT