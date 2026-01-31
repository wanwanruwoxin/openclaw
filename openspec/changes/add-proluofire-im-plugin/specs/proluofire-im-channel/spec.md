## ADDED Requirements

### Requirement: Plugin Registration
The plugin SHALL register itself with the OpenClaw plugin system and expose a ChannelPlugin implementation.

#### Scenario: Plugin loads successfully
- **WHEN** OpenClaw loads the proluofire-im plugin
- **THEN** the plugin registers with id "proluofire-im" and provides a valid ChannelPlugin interface

#### Scenario: Plugin metadata is accessible
- **WHEN** the system queries plugin metadata
- **THEN** the plugin returns id, name, description, and configSchema

### Requirement: Account Management
The plugin SHALL support multi-account configuration with a default account.

#### Scenario: Single account configuration
- **WHEN** user configures one proluofire-im account
- **THEN** the account is set as the default account with id "default"

#### Scenario: Multiple accounts configuration
- **WHEN** user configures multiple proluofire-im accounts with unique names
- **THEN** each account has a unique accountId and can be enabled/disabled independently

#### Scenario: Account resolution
- **WHEN** the system needs to resolve an account by accountId
- **THEN** the plugin returns the account configuration and connection details

### Requirement: Channel Lifecycle
The plugin SHALL manage channel connection lifecycle including start, stop, and health monitoring.

#### Scenario: Channel starts successfully
- **WHEN** the gateway starts a configured proluofire-im account
- **THEN** the plugin establishes connection to proluofire-im server and begins monitoring for messages

#### Scenario: Channel stops cleanly
- **WHEN** the gateway stops a running proluofire-im account
- **THEN** the plugin closes the connection and releases resources

#### Scenario: Channel handles connection errors
- **WHEN** the proluofire-im connection fails or disconnects
- **THEN** the plugin logs the error, updates runtime status, and attempts reconnection

### Requirement: Message Receiving
The plugin SHALL receive and process incoming messages from proluofire-im.

#### Scenario: Receive text message
- **WHEN** a text message arrives from proluofire-im
- **THEN** the plugin converts it to OpenClaw message format and routes it to the agent

#### Scenario: Receive message with media
- **WHEN** a message with media attachment arrives
- **THEN** the plugin downloads the media and includes it in the OpenClaw message

#### Scenario: Receive group message
- **WHEN** a message arrives in a proluofire-im group
- **THEN** the plugin includes group context and applies group policy rules

### Requirement: Message Sending
The plugin SHALL send messages from OpenClaw to proluofire-im targets.

#### Scenario: Send text message to user
- **WHEN** OpenClaw sends a text message to a proluofire-im user
- **THEN** the plugin delivers the message via proluofire-im API

#### Scenario: Send message with media
- **WHEN** OpenClaw sends a message with media attachment
- **THEN** the plugin uploads the media and sends the message with attachment reference

#### Scenario: Send message to group
- **WHEN** OpenClaw sends a message to a proluofire-im group
- **THEN** the plugin delivers the message to the specified group

### Requirement: Security Policies
The plugin SHALL enforce OpenClaw security policies for DMs and groups.

#### Scenario: DM with pairing policy
- **WHEN** DM policy is "pairing" and an unknown user sends a message
- **THEN** the plugin requires approval before processing the message

#### Scenario: DM with allowlist policy
- **WHEN** DM policy is "allowlist" and a user not in allowFrom sends a message
- **THEN** the plugin rejects the message

#### Scenario: Group with allowlist policy
- **WHEN** group policy is "allowlist" and a message arrives from unlisted group
- **THEN** the plugin rejects the message unless the group is in the groups config

### Requirement: Directory Operations
The plugin SHALL provide directory operations to list peers and groups.

#### Scenario: List configured peers
- **WHEN** user requests peer directory
- **THEN** the plugin returns users from allowFrom lists and group configurations

#### Scenario: List configured groups
- **WHEN** user requests group directory
- **THEN** the plugin returns groups from the groups configuration

### Requirement: Status and Probing
The plugin SHALL provide status information and health check probing.

#### Scenario: Report channel status
- **WHEN** user checks channel status
- **THEN** the plugin reports configured, enabled, running state, and connection details

#### Scenario: Probe connection health
- **WHEN** status check with --deep flag is run
- **THEN** the plugin attempts to connect to proluofire-im server and reports success/failure

#### Scenario: Report runtime errors
- **WHEN** the channel encounters an error
- **THEN** the plugin updates lastError in runtime status and includes it in status output
