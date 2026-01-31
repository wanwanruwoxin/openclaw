## ADDED Requirements

### Requirement: Client Initialization
The plugin SHALL initialize and manage the proluofire-im client connection.

#### Scenario: Initialize client with API key
- **WHEN** configuration provides serverUrl and apiKey
- **THEN** the plugin creates a proluofire-im client authenticated with the API key

#### Scenario: Initialize client with username/password
- **WHEN** configuration provides serverUrl, username, and password
- **THEN** the plugin creates a proluofire-im client and authenticates with credentials

#### Scenario: Client initialization fails
- **WHEN** client initialization fails due to invalid credentials or network error
- **THEN** the plugin throws an error with descriptive message

### Requirement: Message Encoding
The plugin SHALL encode OpenClaw messages to proluofire-im protocol format.

#### Scenario: Encode text message
- **WHEN** OpenClaw sends a text message
- **THEN** the plugin converts it to proluofire-im message format with proper encoding

#### Scenario: Encode message with markdown
- **WHEN** OpenClaw sends a message with markdown formatting
- **THEN** the plugin converts markdown to proluofire-im's supported format or plain text

#### Scenario: Encode message with mentions
- **WHEN** OpenClaw message includes user mentions
- **THEN** the plugin converts mentions to proluofire-im mention format

### Requirement: Message Decoding
The plugin SHALL decode proluofire-im messages to OpenClaw format.

#### Scenario: Decode text message
- **WHEN** proluofire-im sends a text message
- **THEN** the plugin converts it to OpenClaw message format with sender, content, and timestamp

#### Scenario: Decode message with formatting
- **WHEN** proluofire-im message includes formatting
- **THEN** the plugin preserves formatting in OpenClaw message format

#### Scenario: Decode message with metadata
- **WHEN** proluofire-im message includes metadata (reply-to, thread, reactions)
- **THEN** the plugin extracts and includes metadata in OpenClaw message context

### Requirement: Event Handling
The plugin SHALL handle proluofire-im events and convert them to OpenClaw events.

#### Scenario: Handle new message event
- **WHEN** proluofire-im emits a new message event
- **THEN** the plugin processes the event and triggers OpenClaw message handling

#### Scenario: Handle typing indicator event
- **WHEN** proluofire-im emits a typing indicator event
- **THEN** the plugin processes the event if typing indicators are supported

#### Scenario: Handle connection status event
- **WHEN** proluofire-im emits connection status change event
- **THEN** the plugin updates runtime status accordingly

### Requirement: Target Resolution
The plugin SHALL resolve OpenClaw message targets to proluofire-im identifiers.

#### Scenario: Resolve user target
- **WHEN** OpenClaw targets a user by identifier
- **THEN** the plugin resolves it to proluofire-im user ID format

#### Scenario: Resolve group target
- **WHEN** OpenClaw targets a group by identifier
- **THEN** the plugin resolves it to proluofire-im group/channel ID format

#### Scenario: Invalid target format
- **WHEN** target identifier is invalid or malformed
- **THEN** the plugin returns an error with helpful message

### Requirement: Error Handling
The plugin SHALL handle protocol errors and convert them to OpenClaw error types.

#### Scenario: Handle authentication error
- **WHEN** proluofire-im returns authentication error
- **THEN** the plugin wraps it in OpenClaw error with clear message

#### Scenario: Handle rate limit error
- **WHEN** proluofire-im returns rate limit error
- **THEN** the plugin implements backoff and retry logic

#### Scenario: Handle network error
- **WHEN** network connection fails
- **THEN** the plugin logs error and attempts reconnection with exponential backoff
