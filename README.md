# Vitals Logger Plugin

## Overview
The Vitals Logger plugin for OpenClaw automatically detects and logs physical activities referenced in chat messages to a JSON file. It is designed to work seamlessly with OpenClaw, processing input from various configured channels.

## Features
- Detects activities like cycling, running, swimming, yoga, and more
- Logs detected data to a configurable JSON file
- Prevents duplicate entries with customizable deduplication rules
- Supports pre-processing gates, custom activity types, and time zones

## Setup

### Prerequisites
- Node.js (v18 or higher)
- npm
- OpenClaw installation

### Installation
```bash
# Clone the repository
cd ~/.openclaw/plugins

git clone https://github.com/YOUR-PLUGIN-REPO/vitals-logger.git && cd vitals-logger/repo
npm install
```

### Registration
Add the following snippet to your OpenClaw configuration file (e.g., `openclaw.json`):
```json
{
  "plugins": [
    {
      "name": "vitals-logger",
      "path": "~/.openclaw/plugins/vitals-logger/repo",
      "enabled": true,
      "config": {
        "channels": ["signal"],
        "activityTypes": ["running", "cycling"],
        "dataFile": "~/.openclaw/workspace/data/vitals.json"
      }
    }
  ]
}
```

### Configuration
Refer to `openclaw.plugin.json` for a full list of configurable options. Below is a quick reference table:
| Option             | Type     | Default                                       | Description                         |
|--------------------|----------|-----------------------------------------------|-------------------------------------|
| `enabled`          | boolean  | true                                          | Enable or disable the plugin        |
| `channels`         | string[] | ["signal"]                                   | Channels to monitor                 |
| `dataFile`         | string   | "~/.openclaw/workspace/data/vitals.json"     | Path to vitals JSON file            |
| `timezone`         | string   | "UTC"                                        | Timezone for handling timestamps    |
| ...                | ...      | ...                                           | See `openclaw.plugin.json`          |

### License
MIT

