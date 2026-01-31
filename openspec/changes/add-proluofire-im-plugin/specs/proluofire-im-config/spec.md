## ADDED Requirements

### Requirement: Configuration Schema Definition
The plugin SHALL define a Zod schema for proluofire-im configuration.

#### Scenario: Schema includes required fields
- **WHEN** configuration schema is defined
- **THEN** it includes required fields: enabled, serverUrl

#### Scenario: Schema includes optional fields
- **WHEN** configuration schema is defined
- **THEN** it includes optional fields: name, apiKey, username, password, dm, groupPolicy, groups, mediaMaxMb

#### Scenario: Schema validates field types
- **WHEN** configuration is validated against schema
- **THEN** the schema enforces correct types for all fields

### Requirement: Server URL Validation
The plugin SHALL validate proluofire-im server URL format.

#### Scenario: Valid HTTPS URL
- **WHEN** serverUrl is a valid HTTPS URL
- **THEN** the configuration validates successfully

#### Scenario: Valid HTTP URL for development
- **WHEN** serverUrl is a valid HTTP URL
- **THEN** the configuration validates successfully with warning

#### Scenario: Invalid URL format
- **WHEN** serverUrl is not a valid URL
- **THEN** the configuration validation fails with descriptive error

### Requirement: Authentication Configuration Validation
The plugin SHALL validate authentication configuration completeness.

#### Scenario: API key authentication
- **WHEN** apiKey is provided
- **THEN** the configuration is valid for API key authentication

#### Scenario: Username/password authentication
- **WHEN** both username and password are provided
- **THEN** the configuration is valid for credential authentication

#### Scenario: Missing authentication
- **WHEN** neither apiKey nor username/password are provided
- **THEN** the configuration validation fails with authentication required error

#### Scenario: Incomplete credentials
- **WHEN** username is provided without password or vice versa
- **THEN** the configuration validation fails with incomplete credentials error

### Requirement: DM Policy Configuration
The plugin SHALL validate DM policy configuration.

#### Scenario: Valid DM policy values
- **WHEN** dm.policy is set to "pairing", "allowlist", or "open"
- **THEN** the configuration validates successfully

#### Scenario: Invalid DM policy value
- **WHEN** dm.policy is set to an invalid value
- **THEN** the configuration validation fails with invalid policy error

#### Scenario: AllowFrom list validation
- **WHEN** dm.allowFrom is provided
- **THEN** the schema validates it is an array of strings

### Requirement: Group Policy Configuration
The plugin SHALL validate group policy configuration.

#### Scenario: Valid group policy values
- **WHEN** groupPolicy is set to "allowlist" or "open"
- **THEN** the configuration validates successfully

#### Scenario: Groups configuration structure
- **WHEN** groups configuration is provided
- **THEN** the schema validates it is a record of group IDs to group config objects

#### Scenario: Group users list validation
- **WHEN** group configuration includes users list
- **THEN** the schema validates it is an array of user identifiers

### Requirement: Media Configuration Validation
The plugin SHALL validate media-related configuration.

#### Scenario: Valid media size limit
- **WHEN** mediaMaxMb is set to a positive number
- **THEN** the configuration validates successfully

#### Scenario: Invalid media size limit
- **WHEN** mediaMaxMb is set to zero or negative number
- **THEN** the configuration validation fails with invalid size error

#### Scenario: Default media size limit
- **WHEN** mediaMaxMb is not provided
- **THEN** the plugin uses default value of 50MB

### Requirement: Multi-Account Configuration
The plugin SHALL support multi-account configuration structure.

#### Scenario: Single account at top level
- **WHEN** configuration is provided at channels.proluofireIm level
- **THEN** it is treated as the default account

#### Scenario: Multiple accounts in accounts object
- **WHEN** configuration includes channels.proluofireIm.accounts with named accounts
- **THEN** each account is validated independently

#### Scenario: Account name uniqueness
- **WHEN** multiple accounts have the same name
- **THEN** the configuration validation fails with duplicate name error
