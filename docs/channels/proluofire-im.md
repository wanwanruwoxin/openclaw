# Proluofire IM

Connect OpenClaw to your Proluofire IM server for AI-powered messaging.

## Overview

The Proluofire IM plugin enables OpenClaw to send and receive messages through your custom Proluofire IM system. This plugin provides:

- **Bidirectional messaging**: Send and receive text messages
- **Text-only for now**: Media and threads are not supported yet
- **Security policies**: Control who can message your AI with DM and group policies
- **Multi-account support**: Connect multiple Proluofire IM accounts

## Installation

Install the Proluofire IM plugin:

```bash
openclaw plugins install @openclaw/proluofire-im
```

Or for local development:

```bash
openclaw plugins install --local extensions/proluofire-im
```

## Authentication Methods

Proluofire IM supports two authentication methods:

### API Key Authentication

Use an API key for authentication:

```bash
openclaw channels setup proluofire-im \
  --server-url https://your-proluofire-server.com \
  --api-key YOUR_API_KEY
```

### Username/Password Authentication

Use username and password credentials:

```bash
openclaw channels setup proluofire-im \
  --server-url https://your-proluofire-server.com \
  --username your_username \
  --password your_password
```

## Configuration

### Basic Configuration

The minimal configuration requires a server URL and authentication:

```yaml
channels:
  proluofire-im:
    enabled: true
    serverUrl: https://your-proluofire-server.com
    wsUrl: wss://your-proluofire-server.com/ws
    apiKey: YOUR_API_KEY  # or username/password
```

### Complete Configuration

Full configuration with all options:

```yaml
channels:
  proluofire-im:
    enabled: true
    name: "My Proluofire Account"
    serverUrl: https://your-proluofire-server.com
    wsUrl: wss://your-proluofire-server.com/ws
    apiKey: YOUR_API_KEY

    # DM (Direct Message) Policy
    dm:
      policy: pairing  # pairing | allowlist | open
      allowFrom:
        - @user1
        - @user2

    # Group Policy
    groupPolicy: allowlist  # allowlist | open
    groups:
      "#general":
        users:
          - @user1
          - @user2
      "#team":
        users:
          - "*"  # Allow all users in this group

    # Group allowlist (users who can trigger from any allowed group)
    groupAllowFrom:
      - @admin
      - @moderator

```

### Multi-Account Configuration

Connect multiple Proluofire IM accounts:

```yaml
channels:
  proluofire-im:
    accounts:
      personal:
        enabled: true
        name: "Personal Account"
        serverUrl: https://personal.proluofire.com
        apiKey: PERSONAL_API_KEY
        dm:
          policy: pairing
          allowFrom: []

      work:
        enabled: true
        name: "Work Account"
        serverUrl: https://work.proluofire.com
        username: work_user
        password: work_pass
        dm:
          policy: allowlist
          allowFrom:
            - @colleague1
            - @colleague2
```

## Security Policies

### DM Policies

Control who can send direct messages to your AI:

#### Pairing (Recommended)

Users must be approved before they can message:

```yaml
dm:
  policy: pairing
  allowFrom: []  # Approved users added here after pairing
```

When a new user messages, you'll receive a pairing request. Approve with:

```bash
openclaw channels allow proluofire-im @username
```

#### Allowlist

Only pre-approved users can message:

```yaml
dm:
  policy: allowlist
  allowFrom:
    - @user1
    - @user2
```

#### Open

Anyone can send direct messages (use with caution):

```yaml
dm:
  policy: open
```

### Group Policies

Control which groups the AI responds in:

#### Allowlist (Recommended)

Only respond in configured groups:

```yaml
groupPolicy: allowlist
groups:
  "#team-channel":
    users:
      - @teammate1
      - @teammate2
  "#public-channel":
    users:
      - "*"  # Any user in this group
```

#### Open

Respond in any group (requires mention):

```yaml
groupPolicy: open
```

## Usage Examples

### Sending Messages

Send a message to a user:

```bash
openclaw message send --channel proluofire-im --target 42 --message "Hello from OpenClaw!"
```

Send another message to a room:

```bash
openclaw message send --channel proluofire-im --target 99 --message "Hello everyone!"
```

### Media Support

Media sending is not supported yet. Only text messages are delivered.

### Managing Allowlists

Add a user to the DM allowlist:

```bash
openclaw channels allow proluofire-im @username
```

Remove a user from the allowlist:

```bash
openclaw channels deny proluofire-im @username
```

List allowed users:

```bash
openclaw channels list-allowed proluofire-im
```

### Channel Status

Check channel status:

```bash
openclaw channels status proluofire-im
```

Check with health probe:

```bash
openclaw channels status proluofire-im --deep
```

## Target Formats

Proluofire IM supports these target formats:

- **Rooms**: `42` or `#42`

You can optionally prefix with `proluofire-im:` for clarity:

```bash
openclaw message send --channel proluofire-im --target proluofire-im:group:42 --message "Hello!"
```

## Troubleshooting

### Connection Issues

**Problem**: Cannot connect to Proluofire IM server

**Solutions**:
1. Verify server URL is correct and accessible
2. Check authentication credentials (API key or username/password)
3. Ensure firewall allows outbound connections
4. Test connection with `openclaw channels status proluofire-im --deep`

### Authentication Errors

**Problem**: Authentication failed

**Solutions**:
1. Verify API key is valid and not expired
2. Check username/password are correct
3. Ensure account has necessary permissions
4. Regenerate API key if needed

### Messages Not Sending

**Problem**: Messages fail to send

**Solutions**:
1. Check target format is correct (`42` or `#42`)
2. Verify room ID exists in Proluofire IM
3. Check rate limits haven't been exceeded
4. Review error messages in logs

### Messages Not Received

**Problem**: Not receiving incoming messages

**Solutions**:
1. Verify gateway is running: `openclaw gateway status`
2. Check DM/group policies allow the sender
3. Ensure account is enabled: `openclaw channels status proluofire-im`
4. Review gateway logs for errors

### Media Upload Failures

Media uploads are not supported yet.

## Implementation Notes

**Important**: This plugin provides the OpenClaw integration structure for Proluofire IM. The protocol-specific implementation (marked with `TODO` comments in the code) needs to be completed based on your Proluofire IM system's actual API and protocol.

Key areas requiring implementation:
- Client SDK integration (`src/client.ts`)
- Message encoding/decoding (`src/protocol.ts`)
- Media upload/download (`src/media.ts`)
- Event handling and monitoring (`src/monitor.ts`)

Refer to the source code comments for detailed implementation guidance.

## Support

For issues or questions:
- Check the [OpenClaw documentation](https://docs.openclaw.ai)
- Review the [plugin source code](https://github.com/openclaw/openclaw/tree/main/extensions/proluofire-im)
- Open an issue on [GitHub](https://github.com/openclaw/openclaw/issues)
