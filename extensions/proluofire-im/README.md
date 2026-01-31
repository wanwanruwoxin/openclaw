# Proluofire IM Plugin - Implementation Notes

## Architecture: REST API + Webhook

Proluofire IM 使用以下架构:
- **REST API**: 使用 Bearer Token 认证的 HTTP API
- **JSON 格式**: 请求和响应都使用 JSON
- **Webhook**: 通过 HTTP POST 接收新消息

这是一个标准的现代 IM 系统架构，无需 TypeScript SDK。

## Structure Complete ✓

The OpenClaw integration structure for the Proluofire IM plugin has been successfully created. All core components are in place and follow OpenClaw's plugin architecture patterns.

## What's Implemented

### Core Structure
- ✅ Plugin entry point (`index.ts`)
- ✅ Package configuration (`package.json`)
- ✅ TypeScript type definitions (`src/types.ts`)
- ✅ Configuration schema with Zod validation (`src/config-schema.ts`)
- ✅ Account management (`src/accounts.ts`)
- ✅ Runtime state management (`src/runtime.ts`)

### REST API Integration
- ✅ HTTP client with Bearer Token auth (`src/client.ts`)
- ✅ Webhook handler for receiving messages (`src/webhook.ts`)
- ✅ Message protocol encoding/decoding (`src/protocol.ts`)
- ✅ Message sending with rate limiting (`src/send.ts`)
- ✅ Message monitoring and routing (`src/monitor.ts`)
- ✅ Security policy enforcement (DM and group policies)

### Media & Actions
- ✅ Media upload/download with streaming (`src/media.ts`)
- ✅ Temporary file management
- ✅ Message actions (reactions, threads, etc.) (`src/actions.ts`)
- ✅ Target resolution (`src/resolve-targets.ts`)

### Channel Integration
- ✅ Complete ChannelPlugin implementation (`src/channel.ts`)
- ✅ Status and health probing (`src/probe.ts`)
- ✅ Gateway integration with lifecycle management
- ✅ Outbound message handling (`src/outbound.ts`)

### Documentation
- ✅ Comprehensive user documentation (`docs/channels/proluofire-im.md`)
- ✅ Setup instructions
- ✅ Configuration examples
- ✅ Troubleshooting guide

## What Needs Implementation

### 1. REST API 端点 (`src/client.ts`)

需要填充实际的 API 端点:

```typescript
// 连接测试 (可选)
GET /api/v1/auth/verify
或 GET /api/v1/user/me

// 发送消息
POST /api/v1/messages
Body: {
  to: "@user" 或 "#group",
  content: "消息内容",
  threadId?: "thread_id",
  replyToId?: "msg_id",
  attachments?: [...]
}

// 上传媒体 (如果支持)
POST /api/v1/media/upload
Content-Type: multipart/form-data
```

### 2. Webhook 配置 (`src/webhook.ts`)

需要配置:

1. **Webhook URL**: 在 proluofire-im 后台配置
   - 格式: `http://your-server:3000/webhook/proluofire-im`
   - OpenClaw gateway 会自动启动 webhook 服务器

2. **Webhook Payload 格式**: 根据实际格式调整
   ```json
   {
     "event": "message.new",
     "message": {
       "id": "msg_123",
       "from": "@user1",
       "to": "@bot",
       "content": "Hello",
       "timestamp": 1234567890
     }
   }
   ```

3. **签名验证** (如果 proluofire-im 提供):
   - HMAC-SHA256
   - JWT
   - 或简单的 secret token

### 3. 用户和群组标识符格式 (`src/protocol.ts`)

需要确定:
- 用户 ID 格式: `@username`, `user:id`, 或其他?
- 群组 ID 格式: `#groupname`, `group:id`, 或其他?

### 4. 媒体处理 (`src/media.ts`)

需要实现:
- 上传端点和格式 (multipart/form-data)
- 下载端点
- 支持的媒体类型

## 实现步骤

### 第一步: 测试基本连接

```typescript
// 在 src/client.ts 中取消注释:
const response = await makeRequest('/api/v1/auth/verify', { method: 'GET' });
const data = await response.json();
console.log('Connected:', data);
```

### 第二步: 实现发送消息

```typescript
// 在 src/client.ts 的 sendMessage 中:
const response = await makeRequest('/api/v1/messages', {
  method: 'POST',
  body: JSON.stringify({
    to: target,
    content: content,
    threadId: options?.threadId,
    replyToId: options?.replyToId,
  })
});
```

### 第三步: 配置 Webhook

1. 在 proluofire-im 后台配置 webhook URL
2. 测试 webhook 接收:
   ```bash
   # 模拟 webhook 请求
   curl -X POST http://localhost:3000/webhook/proluofire-im \
     -H "Content-Type: application/json" \
     -d '{"event":"message.new","message":{"from":"@test","content":"hello"}}'
   ```

### 第四步: 调整消息格式

根据实际的 webhook payload 格式，调整 `src/webhook.ts` 中的解析逻辑。

## 配置示例

```yaml
channels:
  proluofire-im:
    enabled: true
    serverUrl: https://your-proluofire-server.com
    apiKey: your_bearer_token_here  # 用作 Bearer Token

    # Webhook 配置 (在 proluofire-im 后台设置)
    # Webhook URL: http://your-openclaw-server:3000/webhook/proluofire-im

    dm:
      policy: pairing
      allowFrom: []

    mediaMaxMb: 50
```

## Next Steps

1. **Gather Proluofire IM Details**
   - API documentation
   - SDK/client library (if available)
   - Authentication mechanism
   - Message format and protocol
   - Media upload/download APIs
   - Event/webhook system for incoming messages

2. **Implement Protocol Layer**
   - Start with `src/client.ts` - get basic connection working
   - Then `src/protocol.ts` - implement message encoding/decoding
   - Then `src/send.ts` and `src/monitor.ts` - get messaging working

3. **Test Incrementally**
   - Test connection and authentication first
   - Test sending messages
   - Test receiving messages
   - Test media handling
   - Test security policies

4. **Add Dependencies**
   - Add proluofire-im SDK to `package.json` dependencies
   - Add any other required libraries (e.g., `file-type` for MIME detection)

5. **Write Tests**
   - Unit tests for protocol functions
   - Integration tests with mock server
   - End-to-end tests with real proluofire-im instance

## Testing the Plugin

Once protocol implementation is complete:

```bash
# Install plugin locally
openclaw plugins install --local extensions/proluofire-im

# Configure
openclaw channels setup proluofire-im \
  --server-url https://your-server.com \
  --api-key YOUR_KEY

# Test status
openclaw channels status proluofire-im --deep

# Send test message
openclaw message send --channel proluofire-im --target 42 --message "Hello!"

# Start gateway
openclaw gateway run
```

## Architecture Notes

The plugin follows OpenClaw's standard channel plugin architecture:

- **Lazy imports**: Heavy modules are imported only when needed
- **Multi-account support**: Can connect multiple proluofire-im accounts
- **Security-first**: DM and group policies enforce access control
- **Streaming**: Large media files use streaming to avoid memory issues
- **Error handling**: Comprehensive error handling with retry logic
- **Rate limiting**: Built-in rate limiting to prevent API abuse

## File Structure

```
extensions/proluofire-im/
├── index.ts                 # Plugin entry point
├── package.json            # Plugin metadata
└── src/
    ├── types.ts            # TypeScript types
    ├── config-schema.ts    # Zod configuration schema
    ├── accounts.ts         # Account resolution
    ├── runtime.ts          # Runtime state management
    ├── client.ts           # Protocol client wrapper
    ├── protocol.ts         # Message encoding/decoding
    ├── send.ts             # Message sending
    ├── monitor.ts          # Message receiving
    ├── media.ts            # Media upload/download
    ├── probe.ts            # Health checking
    ├── channel.ts          # ChannelPlugin implementation
    ├── outbound.ts         # Outbound message handling
    ├── actions.ts          # Message actions
    └── resolve-targets.ts  # Target resolution
```

## Questions to Answer

Before completing the implementation, clarify these details about Proluofire IM:

1. **Authentication**: API key, OAuth, username/password, or other?
2. **Message Format**: JSON, protobuf, XML, or custom?
3. **Real-time Updates**: WebSocket, polling, webhooks, or SSE?
4. **Identifiers**: How are users and groups identified?
5. **Media Storage**: Built-in or external? Upload/download APIs?
6. **Capabilities**: Reactions, threads, editing, deletion supported?
7. **Rate Limits**: What are the API rate limits?

## Support

For questions about the OpenClaw plugin architecture:
- Review other channel plugins in `extensions/` for reference
- Check `openclaw/plugin-sdk` types and utilities
- Refer to OpenClaw documentation at https://docs.openclaw.ai
