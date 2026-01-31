## Context

OpenClaw uses a plugin-based architecture for messaging channels, where each channel (Telegram, Discord, Matrix, etc.) is implemented as a separate plugin that registers with the core system. The proluofire-im plugin will follow this same pattern, implementing the `ChannelPlugin` interface from `openclaw/plugin-sdk`.

**Current State:**
- OpenClaw has 20+ channel plugins in `extensions/`
- Each plugin exports a default object with `id`, `name`, `description`, `configSchema`, and `register()` function
- The `register()` function receives an `OpenClawPluginApi` and calls `api.registerChannel()` with a `ChannelPlugin` implementation
- Channel plugins handle: authentication, message routing, media handling, directory operations, and gateway lifecycle

**Constraints:**
- Must follow existing plugin patterns for consistency
- Runtime dependencies must be in plugin's `dependencies` (not root `package.json`)
- Must support multi-account configuration (though single account is typical)
- Must integrate with existing security policies (pairing, allowlists, group policies)

**Stakeholders:**
- Users who want to use OpenClaw with proluofire-im
- Plugin maintainers who need to understand the implementation pattern

## Goals / Non-Goals

**Goals:**
- Create a fully functional proluofire-im channel plugin following OpenClaw patterns
- Support bidirectional messaging (send/receive text and media)
- Integrate with OpenClaw's security model (DM policies, group policies)
- Provide configuration schema for connection settings
- Support channel status probing and health checks
- Enable directory operations (list peers/groups)

**Non-Goals:**
- Advanced proluofire-im features not needed for basic messaging (e.g., voice/video calls, screen sharing)
- Migration from other channels to proluofire-im
- Custom UI beyond standard channel selection
- Backwards compatibility (this is a new plugin)

## Decisions

### 1. Plugin Structure: Follow Matrix Plugin Pattern
**Decision:** Structure the plugin similar to the Matrix plugin with separate modules for channel registration, protocol handling, media, and configuration.

**Rationale:**
- Matrix plugin is well-structured and handles similar complexity
- Separation of concerns makes code maintainable
- Follows established OpenClaw patterns

**Alternatives Considered:**
- Monolithic single-file plugin: Rejected due to complexity and maintainability
- Custom structure: Rejected to maintain consistency with other plugins

**Structure:**
```
extensions/proluofire-im/
├── index.ts              # Plugin entry point
├── package.json          # Plugin metadata and dependencies
├── src/
│   ├── channel.ts        # ChannelPlugin implementation
│   ├── config-schema.ts  # Zod schema for configuration
│   ├── client.ts         # proluofire-im client wrapper
│   ├── monitor.ts        # Message monitoring/receiving
│   ├── send.ts           # Message sending
│   ├── media.ts          # Media upload/download
│   ├── probe.ts          # Health check implementation
│   ├── accounts.ts       # Account resolution
│   ├── types.ts          # TypeScript types
│   └── runtime.ts        # Runtime state management
```

### 2. Protocol Integration: SDK-Based Approach
**Decision:** Use the official proluofire-im SDK/client library for protocol communication.

**Rationale:**
- Avoids reimplementing protocol details
- Gets updates and bug fixes from upstream
- Reduces maintenance burden

**Alternatives Considered:**
- Direct HTTP/WebSocket implementation: Rejected due to complexity and maintenance overhead
- Fork and modify existing SDK: Rejected unless necessary for compatibility

**Requirements:**
- proluofire-im SDK must be added to plugin's `dependencies`
- Must handle SDK initialization, authentication, and lifecycle
- Must wrap SDK errors in OpenClaw error types

### 3. Configuration: Multi-Account Support with Single Default
**Decision:** Support multi-account configuration following the standard pattern, but optimize for single-account usage.

**Rationale:**
- Consistency with other channel plugins
- Allows power users to connect multiple proluofire-im accounts
- Most users will use single account (default)

**Configuration Schema:**
```typescript
{
  channels: {
    proluofireIm: {
      enabled: boolean,
      name?: string,
      serverUrl: string,      // proluofire-im server URL
      apiKey?: string,        // API key or token
      username?: string,      // Username for auth
      password?: string,      // Password for auth
      dm?: {
        policy: "pairing" | "allowlist" | "open",
        allowFrom: string[]
      },
      groupPolicy?: "allowlist" | "open",
      groups?: Record<string, { users: string[] }>,
      mediaMaxMb?: number
    }
  }
}
```

### 4. Media Handling: Stream-Based with Size Limits
**Decision:** Use streaming for media uploads/downloads with configurable size limits.

**Rationale:**
- Prevents memory issues with large files
- Allows progress tracking
- Consistent with other channel plugins

**Implementation:**
- Default limit: 50MB (configurable via `mediaMaxMb`)
- Support common formats: images, videos, audio, documents
- Use temporary files for processing when needed

### 5. Security: Leverage Existing Policy Framework
**Decision:** Integrate with OpenClaw's existing DM and group policies rather than implementing custom security.

**Rationale:**
- Consistent security model across all channels
- Users already understand the policy system
- Reduces implementation complexity

**Policies:**
- DM policy: `pairing` (default), `allowlist`, or `open`
- Group policy: `allowlist` (default) or `open`
- Pairing flow: User sends message → approval required → added to allowlist

## Risks / Trade-offs

### Risk: proluofire-im SDK Compatibility
**Risk:** The proluofire-im SDK may have breaking changes or compatibility issues.

**Mitigation:**
- Pin SDK version in `package.json`
- Add integration tests for critical SDK operations
- Document SDK version requirements in plugin docs

### Risk: Protocol-Specific Features
**Risk:** proluofire-im may have unique features that don't map cleanly to OpenClaw's channel abstraction.

**Mitigation:**
- Start with core messaging features (text, media)
- Document unsupported features in plugin docs
- Consider custom tool actions for proluofire-im-specific operations

### Risk: Authentication Complexity
**Risk:** proluofire-im authentication may be more complex than token-based auth.

**Mitigation:**
- Support multiple auth methods (API key, username/password)
- Provide clear error messages for auth failures
- Document authentication setup in detail

### Trade-off: Feature Completeness vs. Simplicity
**Trade-off:** Supporting all proluofire-im features would increase complexity significantly.

**Decision:** Start with core messaging features, add advanced features based on user demand.

## Migration Plan

**Initial Deployment:**
1. Merge plugin code to `extensions/proluofire-im/`
2. Add plugin to workspace packages (auto-discovered)
3. Add documentation at `docs/channels/proluofire-im.md`
4. Update channel selection UI to include proluofire-im
5. Add to `.github/labeler.yml` for PR labeling

**Installation:**
- Users install via: `openclaw plugins install @openclaw/proluofire-im`
- Or use local development: `openclaw plugins install --local extensions/proluofire-im`

**Configuration:**
- Users configure via: `openclaw channels setup proluofire-im --server-url <url> --api-key <key>`
- Or manually edit config file

**Rollback:**
- Users can uninstall: `openclaw plugins uninstall @openclaw/proluofire-im`
- No data migration needed (new plugin)

**Testing:**
- Unit tests for core functions (send, receive, media)
- Integration tests with mock proluofire-im server
- Manual testing with real proluofire-im instance

## Open Questions

1. **Authentication Method:** What authentication method does proluofire-im use? (API key, OAuth, username/password, other?)
   - **Action:** Review proluofire-im documentation and SDK examples

2. **Message Format:** What is the message format for proluofire-im? (JSON, protobuf, custom?)
   - **Action:** Examine SDK message types and serialization

3. **Real-time Updates:** Does proluofire-im use WebSocket, polling, or webhooks for real-time messages?
   - **Action:** Check SDK event handling and connection management

4. **Group/Channel Concepts:** How does proluofire-im model groups/channels/rooms?
   - **Action:** Map proluofire-im concepts to OpenClaw's peer/group directory model

5. **Media Storage:** Does proluofire-im have built-in media storage or require external hosting?
   - **Action:** Review SDK media upload/download APIs
