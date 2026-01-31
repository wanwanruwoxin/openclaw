## Why

OpenClaw currently supports multiple messaging channels (Telegram, Discord, Slack, Matrix, etc.) but lacks integration with proluofire-im, a custom IM system. Adding proluofire-im as a channel plugin will enable users to interact with OpenClaw through their proluofire-im client, expanding the platform's reach to custom enterprise messaging systems.

## What Changes

- Create new channel plugin `@openclaw/proluofire-im` under `extensions/proluofire-im/`
- Implement proluofire-im protocol integration for bidirectional messaging
- Add channel registration and configuration schema
- Implement message routing, formatting, and delivery for proluofire-im
- Add proluofire-im to channel selection UI and documentation
- Support standard OpenClaw features: text messages, media attachments, reactions, and typing indicators (where applicable)

## Capabilities

### New Capabilities
- `proluofire-im-channel`: Core channel plugin implementation including connection management, authentication, and message lifecycle
- `proluofire-im-protocol`: Protocol-specific message encoding/decoding, event handling, and API client integration
- `proluofire-im-media`: Media attachment handling (upload, download, format conversion) for proluofire-im
- `proluofire-im-config`: Configuration schema and validation for proluofire-im connection settings

### Modified Capabilities
<!-- No existing capabilities are being modified - this is a new plugin addition -->

## Impact

**Affected Code:**
- New extension directory: `extensions/proluofire-im/`
- Plugin registry: Will auto-discover the new plugin via workspace package
- Channel routing: Existing routing infrastructure will handle proluofire-im messages
- Documentation: New channel docs at `docs/channels/proluofire-im.md`

**Dependencies:**
- proluofire-im SDK/client library (to be added to plugin `package.json`)
- Standard OpenClaw plugin SDK (`openclaw/plugin-sdk`)

**Systems:**
- Gateway: Will route messages to/from proluofire-im
- CLI: `openclaw channels status` will include proluofire-im
- UI: Channel selection in macOS app, web UI, and mobile apps
