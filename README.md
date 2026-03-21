# Vitals Logger Plugin for OpenClaw

Automatically detects physical activities mentioned in chat messages and logs them to a JSON file. Works as an OpenClaw plugin using the `before_prompt_build` hook.

## How It Works (v2)

v2 is a complete rewrite. The plugin now owns both extraction and persistence — no more relying on the agent to parse activity data.

**The v1 problem:** v1 used a fragile two-turn cycle: detect activity → inject an instruction asking the agent to extract details → parse the agent's structured response on the next turn. This was unreliable — the agent could rephrase, skip fields, or fail to respond in the expected format, causing silent data loss.

**The v2 approach:** The plugin extracts activity data directly from the user's message using regex patterns, writes to `vitals.json` immediately, then injects a system context message telling the agent what was logged. Acknowledgment always follows persistence, never the reverse.

### Pipeline

1. **Channel filter** — Only processes messages from configured channels
2. **Subagent skip** — Ignores subagent sessions
3. **Idempotency** — TTL cache prevents double-processing on prompt rebuilds
4. **Preset check** — Single-word triggers (e.g., "walk") instantly log a pre-configured activity
5. **Pre-gate scoring** — Keywords are scored; past-tense verbs score higher. Messages below the threshold are ignored.
6. **Rate limiting** — Per-channel cooldown after positive detection
7. **Regex extraction** — Activity type, distance, duration, people, time, and date are extracted from the message
8. **Activity defaults** — Missing fields are filled from per-activity-type defaults (if configured)
9. **Dedup check** — Compares against recent entries to prevent duplicates
10. **Persist** — Writes to `vitals.json`
11. **Agent notification** — Injects system context so the agent can acknowledge what was logged

### Graceful Failure

If the pre-gate detects activity but regex can't extract enough details, the plugin injects a system message asking the agent to clarify with the user — rather than silently dropping the activity.

## Extraction Patterns

The regex extractor recognizes:

| Field | Examples |
|-------|---------|
| **Activity type** | walk, walked, walking, bike, biked, cycling, run, ran, running, hike, hiked, swim, swam, jog, jogged, ruck, rucked, yoga, pickleball, weights, peloton |
| **Distance** | "2 miles", "5km", "3.5 mi" |
| **Duration** | "30 minutes", "1 hour", "45 min", "half an hour" |
| **People** | "with Buster", "with Sarah and Mike" |
| **Time** | "at 3pm", "this morning", "this evening", "tonight" |
| **Date** | Defaults to today; "yesterday" resolves to yesterday |

Examples:
- `"Walked 2 miles with Buster this morning"` → walking, 2 miles, with Buster, morning
- `"Biked 30 minutes yesterday"` → cycling, 30min, yesterday's date
- `"Just got back from a 5k run"` → running, 5 km

## Activity Defaults

Configure per-activity-type default values that fill in when the user's message is sparse. Useful for routine activities where details are predictable.

```json
{
  "activityDefaults": {
    "walking": {
      "distance": 1,
      "distanceUnit": "miles",
      "people": ["Buster"]
    },
    "cycling": {
      "distance": 10,
      "distanceUnit": "miles"
    }
  }
}
```

**How defaults are applied:**
- Only fill in fields that weren't explicitly extracted from the message
- Explicit values always win — "walked 3 miles" uses 3, not the default 1
- **People are replaced, not merged** — if the user says "walked with Sarah", that overrides the default people entirely. If no people are mentioned, defaults apply.

With the config above, a bare `"went for a walk"` would log: walking, 1 mile, with Buster.

## Presets

Single-word triggers for quick logging. When a message matches a preset trigger, it bypasses pre-gate and extraction entirely.

```json
{
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
```

## Installation

```bash
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
        "activityDefaults": {
          "walking": {
            "distance": 1,
            "distanceUnit": "miles",
            "people": ["Buster"]
          }
        },
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

Restart the gateway after adding or updating the plugin.

## Configuration

See `openclaw.plugin.json` for the full schema. Key options:

| Option | Description |
|--------|-------------|
| **channels** | Which channels to monitor (default: `["signal"]`) |
| **dataFile** | Path to the vitals JSON file |
| **timezone** | IANA timezone for date resolution |
| **activityDefaults** | Per-activity-type default values for missing fields |
| **presets** | Map of trigger words to pre-configured activities |
| **preGate** | Scoring thresholds and keyword lists |
| **dedup** | Duplicate detection window and tolerance settings |
| **rateLimiting** | Per-channel cooldown after detection |
| **confirmation** | Whether to inject agent acknowledgment messages |
| **debug** | Logging flags (`logDetections`, `logExtractions`, `logSkips`) |

## Data Format

Activities are stored as:

```json
{
  "activities": [
    {
      "id": "act-2026-03-19-walking-a1b2c3",
      "date": "2026-03-19",
      "time": "morning",
      "type": "walking",
      "duration": null,
      "distance": 1,
      "distanceUnit": "miles",
      "description": "walking, 1 miles, with Buster",
      "people": ["Buster"],
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
