## 1. Project Setup

- [x] 1.1 Create extensions/proluofire-im directory structure
- [x] 1.2 Create package.json with plugin metadata and openclaw channel config
- [x] 1.3 Add proluofire-im SDK dependency to package.json
- [x] 1.4 Create index.ts plugin entry point with register function
- [x] 1.5 Create src/ directory with initial file structure
- [x] 1.6 Add TypeScript types file (src/types.ts) for core interfaces

## 2. Configuration Schema

- [x] 2.1 Create src/config-schema.ts with Zod schema for proluofire-im config
- [x] 2.2 Add serverUrl validation (URL format, HTTP/HTTPS)
- [x] 2.3 Add authentication fields validation (apiKey, username, password)
- [x] 2.4 Add DM policy schema (policy, allowFrom)
- [x] 2.5 Add group policy schema (groupPolicy, groups)
- [x] 2.6 Add media configuration schema (mediaMaxMb with default 50)
- [x] 2.7 Add multi-account configuration support

## 3. Account Management

- [x] 3.1 Create src/accounts.ts with account resolution functions
- [x] 3.2 Implement listProluofireImAccountIds function
- [x] 3.3 Implement resolveDefaultProluofireImAccountId function
- [x] 3.4 Implement resolveProluofireImAccount function
- [x] 3.5 Add account configuration validation logic

## 4. Protocol Client

- [x] 4.1 Create src/client.ts with proluofire-im SDK wrapper
- [x] 4.2 Implement client initialization with API key authentication
- [x] 4.3 Implement client initialization with username/password authentication
- [x] 4.4 Add connection lifecycle management (connect, disconnect, reconnect)
- [x] 4.5 Add error handling and retry logic with exponential backoff
- [x] 4.6 Create src/runtime.ts for runtime state management

## 5. Message Protocol

- [x] 5.1 Implement message encoding (OpenClaw to proluofire-im format)
- [x] 5.2 Implement message decoding (proluofire-im to OpenClaw format)
- [x] 5.3 Add markdown/formatting conversion
- [x] 5.4 Add mention handling and conversion
- [x] 5.5 Add metadata extraction (reply-to, thread, reactions)
- [x] 5.6 Implement target resolution (user and group identifiers)

## 6. Message Sending

- [x] 6.1 Create src/send.ts with message sending functions
- [x] 6.2 Implement sendMessageProluofireIm for text messages
- [x] 6.3 Add support for sending to users (DMs)
- [x] 6.4 Add support for sending to groups
- [x] 6.5 Add error handling for send failures
- [x] 6.6 Add rate limiting and retry logic

## 7. Message Receiving

- [x] 7.1 Create src/monitor.ts for message monitoring
- [x] 7.2 Implement event listener for incoming messages
- [x] 7.3 Add message routing to OpenClaw agent
- [x] 7.4 Implement DM policy enforcement (pairing, allowlist, open)
- [x] 7.5 Implement group policy enforcement
- [x] 7.6 Add typing indicator handling (if supported)
- [x] 7.7 Add connection status event handling

## 8. Media Handling

- [x] 8.1 Create src/media.ts for media operations
- [x] 8.2 Implement media upload with streaming for large files
- [x] 8.3 Implement media download with streaming
- [x] 8.4 Add media type detection and validation
- [x] 8.5 Add size limit enforcement (mediaMaxMb)
- [x] 8.6 Implement temporary file management and cleanup
- [x] 8.7 Add format conversion support (if needed)
- [x] 8.8 Add metadata preservation (dimensions, duration, MIME type)

## 9. Channel Plugin Implementation

- [x] 9.1 Create src/channel.ts with ChannelPlugin implementation
- [x] 9.2 Implement plugin metadata (id, label, docsPath, etc.)
- [x] 9.3 Implement config section (listAccountIds, resolveAccount, etc.)
- [x] 9.4 Implement security section (resolveDmPolicy, collectWarnings)
- [x] 9.5 Implement messaging section (normalizeTarget, targetResolver)
- [x] 9.6 Implement directory section (listPeers, listGroups)
- [x] 9.7 Implement setup section (validateInput, applyAccountConfig)
- [x] 9.8 Implement pairing section (normalizeAllowEntry, notifyApproval)

## 10. Status and Probing

- [x] 10.1 Create src/probe.ts for health check implementation
- [x] 10.2 Implement probeProluofireIm function to test connection
- [x] 10.3 Implement status section in channel plugin
- [x] 10.4 Add runtime status tracking (running, lastStartAt, lastError)
- [x] 10.5 Add collectStatusIssues function
- [x] 10.6 Add buildChannelSummary function
- [x] 10.7 Add buildAccountSnapshot function

## 11. Gateway Integration

- [x] 11.1 Implement gateway.startAccount function
- [x] 11.2 Add connection establishment and monitoring loop
- [x] 11.3 Add graceful shutdown handling
- [x] 11.4 Add error recovery and reconnection logic
- [x] 11.5 Integrate with OpenClaw message routing

## 12. Outbound Actions

- [x] 12.1 Create src/outbound.ts for outbound message handling
- [x] 12.2 Implement message formatting for outbound messages
- [x] 12.3 Add media attachment handling for outbound messages
- [x] 12.4 Add thread/reply context handling

## 13. Tool Actions

- [x] 13.1 Create src/actions.ts for message actions
- [x] 13.2 Implement reaction actions (if supported)
- [x] 13.3 Implement thread actions (if supported)
- [x] 13.4 Add any proluofire-im-specific actions

## 14. Target Resolution

- [x] 14.1 Create src/resolve-targets.ts for target resolution
- [x] 14.2 Implement resolveProluofireImTargets function
- [x] 14.3 Add user target resolution logic
- [x] 14.4 Add group target resolution logic
- [x] 14.5 Add validation and error handling

## 15. Documentation

- [x] 15.1 Create docs/channels/proluofire-im.md with setup instructions
- [x] 15.2 Document authentication methods (API key, username/password)
- [x] 15.3 Document configuration options
- [x] 15.4 Add examples for common use cases
- [x] 15.5 Document security policies and allowlists
- [x] 15.6 Add troubleshooting section
- [x] 15.7 Update channel quick reference docs if needed

## 16. Testing

- [x] 16.1 Create unit tests for config schema validation
- [x] 16.2 Create unit tests for message encoding/decoding
- [x] 16.3 Create unit tests for target resolution
- [x] 16.4 Create unit tests for media handling
- [x] 16.5 Create integration tests with mock proluofire-im server
- [x] 16.6 Add test coverage for error scenarios
- [x] 16.7 Test multi-account configuration

## 17. Integration and Polish

- [x] 17.1 Test plugin installation (npm and local)
- [x] 17.2 Test channel setup via CLI
- [x] 17.3 Test message sending and receiving end-to-end
- [x] 17.4 Test media upload and download
- [x] 17.5 Test security policies (pairing, allowlists)
- [x] 17.6 Verify channel appears in status output
- [x] 17.7 Verify channel appears in UI selection
- [x] 17.8 Add plugin to .github/labeler.yml for PR labeling
- [x] 17.9 Run full test suite and fix any issues
- [x] 17.10 Update CHANGELOG.md with new plugin
