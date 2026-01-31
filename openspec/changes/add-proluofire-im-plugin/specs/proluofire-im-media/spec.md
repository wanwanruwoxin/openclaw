## ADDED Requirements

### Requirement: Media Upload
The plugin SHALL upload media attachments to proluofire-im.

#### Scenario: Upload image file
- **WHEN** OpenClaw sends a message with image attachment
- **THEN** the plugin uploads the image to proluofire-im and includes reference in message

#### Scenario: Upload video file
- **WHEN** OpenClaw sends a message with video attachment
- **THEN** the plugin uploads the video to proluofire-im and includes reference in message

#### Scenario: Upload document file
- **WHEN** OpenClaw sends a message with document attachment
- **THEN** the plugin uploads the document to proluofire-im and includes reference in message

#### Scenario: Upload exceeds size limit
- **WHEN** media file exceeds configured mediaMaxMb limit
- **THEN** the plugin rejects the upload with size limit error

### Requirement: Media Download
The plugin SHALL download media attachments from proluofire-im.

#### Scenario: Download image attachment
- **WHEN** proluofire-im message includes image attachment
- **THEN** the plugin downloads the image and includes it in OpenClaw message

#### Scenario: Download video attachment
- **WHEN** proluofire-im message includes video attachment
- **THEN** the plugin downloads the video and includes it in OpenClaw message

#### Scenario: Download fails
- **WHEN** media download fails due to network or permission error
- **THEN** the plugin logs error and includes placeholder in message

### Requirement: Media Format Handling
The plugin SHALL handle media format conversion when necessary.

#### Scenario: Supported format passthrough
- **WHEN** media is in a format supported by both OpenClaw and proluofire-im
- **THEN** the plugin passes the media without conversion

#### Scenario: Format conversion needed
- **WHEN** media format is not supported by proluofire-im
- **THEN** the plugin converts to supported format or returns error

#### Scenario: Preserve metadata
- **WHEN** media includes metadata (dimensions, duration, MIME type)
- **THEN** the plugin preserves metadata through upload/download

### Requirement: Streaming Support
The plugin SHALL use streaming for large media files to avoid memory issues.

#### Scenario: Stream large upload
- **WHEN** uploading media file larger than 10MB
- **THEN** the plugin uses streaming upload to avoid loading entire file in memory

#### Scenario: Stream large download
- **WHEN** downloading media file larger than 10MB
- **THEN** the plugin uses streaming download to avoid loading entire file in memory

### Requirement: Temporary File Management
The plugin SHALL manage temporary files for media processing.

#### Scenario: Create temporary file for processing
- **WHEN** media requires processing before upload
- **THEN** the plugin creates temporary file in system temp directory

#### Scenario: Clean up temporary files
- **WHEN** media upload/download completes or fails
- **THEN** the plugin deletes temporary files to prevent disk space leaks

### Requirement: Media Type Detection
The plugin SHALL detect and validate media types.

#### Scenario: Detect MIME type from file
- **WHEN** media file is provided without explicit MIME type
- **THEN** the plugin detects MIME type from file content or extension

#### Scenario: Validate supported media types
- **WHEN** media type is not supported by proluofire-im
- **THEN** the plugin rejects the upload with unsupported type error

#### Scenario: Handle unknown media types
- **WHEN** media type cannot be determined
- **THEN** the plugin uses generic application/octet-stream type
