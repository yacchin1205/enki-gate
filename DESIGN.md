# DESIGN

## Use Cases

### 1. A credential owner registers a provider credential

- Primary actor: Credential owner
- Involved systems: Enki Gate, upstream provider
- Goal: Register a personal provider API key in Enki Gate so it can be used without distributing the raw key to clients
- Diagram: `docs/diagrams/uc01-register-credential.puml`

![UC01](docs/diagrams/uc01-register-credential.png)

### 2. A credential owner delegates usage rights to another user or domain

- Primary actor: Credential owner
- Involved systems: Enki Gate
- Goal: Make the owner's credential available to another individual user or to an entire email domain
- Diagram: `docs/diagrams/uc02-grant-access.puml`

![UC02](docs/diagrams/uc02-grant-access.png)

### 3. A credential user starts using a credential through device flow

- Primary actor: Credential user
- Involved systems: Enki Gate, client application
- Goal: Use a user code shown by the client application, authenticate, choose a credential, and allow the client application to receive a gateway token
- Diagram: `docs/diagrams/uc03-issue-gateway-token.puml`

![UC03](docs/diagrams/uc03-issue-gateway-token.png)

### 4. A client application calls the gateway with an issued token

- Primary actor: Client application
- Involved systems: Enki Gate, upstream provider
- Goal: Use an OpenAI-compatible API through Enki Gate without holding the provider API key
- Diagram: `docs/diagrams/uc05-call-gateway-api.puml`

![UC04](docs/diagrams/uc05-call-gateway-api.png)

### 5. Enki Gate audits usage and policy decisions

- Primary actor: Enki Gate
- Involved systems: Cloud Logging
- Goal: Record who used which credential, from which client or session, and what usage and policy outcomes occurred
- Diagram: `docs/diagrams/uc05-audit-usage.puml`

![UC05](docs/diagrams/uc05-audit-usage.png)

### 6. A credential owner disables a credential or revokes a grant

- Primary actor: Credential owner
- Involved systems: Enki Gate
- Goal: Remove a credential itself, or a previously granted usage right, from future use
- Diagram: `docs/diagrams/uc06-revoke-credential-or-grant.puml`

![UC06](docs/diagrams/uc06-revoke-credential-or-grant.png)

## Firestore Collection Design

### `users/{uid}`

- Purpose: Normalized profile data for an individual user authenticated with Google
- Main fields: `email`, `domain`, `displayName`, `photoURL`, `createdAt`, `updatedAt`
- Client read: Only the user themselves
- Client write: Upsert by the user themselves only. `email` and `domain` must match the authenticated identity
- Server write: Allowed

### `credentials/{credentialId}`

- Purpose: Safe metadata for a credential. Never stores plaintext secrets
- Main fields: `ownerUid`, `ownerEmail`, `provider`, `label`, `status`, `allowedUserEmails`, `allowedDomains`, `createdAt`, `updatedAt`
- Client read: The owner, or a delegated user / domain
- Client write: Not allowed
- Server write: Allowed

### `credential_secrets/{credentialId}`

- Purpose: Encrypted provider secret material
- Main fields: `ownerUid`, `ciphertext`, `wrappedDek`, `kmsKeyName`, `createdAt`, `updatedAt`
- Client read: Not allowed
- Client write: Not allowed
- Server write: Allowed

### `credential_usages/{credentialId}`

- Purpose: Cached usage summary for the owner's own usage of a credential
- Main fields: `credentialId`, `ownerUid`, `lastAccessAt`, `usageSummary7d`, `usageUpdatedAt`
- Client read: Owner only
- Client write: Not allowed
- Server write: Allowed

### `grants/{grantId}`

- Purpose: Delegation state for a credential
- Main fields:
  - Identity: `credentialId`, `ownerUid`, `granteeType`, `granteeValue`
  - State: `status`, `createdAt`, `updatedAt`, `revokedAt`
  - Usage summary: `lastAccessAt`, `usageSummary7d`, `usageUpdatedAt`
- Client read: Owner only
- Client write: Not allowed
- Server write: Allowed

### `token_issuances/{issuanceId}`

- Purpose: Issuance record for a gateway token
- Main fields: `actorUid`, `actorEmail`, `credentialId`, `credentialOwnerUid`, `tokenHash`, `issuedAt`, `expiresAt`
- Client read: Not allowed
- Client write: Not allowed
- Server write: Allowed

### `device_flows/{userCode}`

- Purpose: Progress state for a device flow
- Main fields: `userCode`, `status`, `credentialId`, `actorUid`, `actorEmail`, `tokenHash`, `createdAt`, `expiresAt`, `authorizedAt`
- Client read: Not allowed
- Client write: Not allowed
- Server write: Allowed

## Firestore Design Notes

- `credentials` and `credential_secrets` are separate. The UI may read `credentials`, but `credential_secrets` is always server-only.
- `credential_usages` stores the owner's own usage history. `credentials` may be readable by delegated users, so owner-only usage must not live there.
- `grants` are the source of truth for delegation state and the storage location for shared-usage summaries.
- `credentials.allowedUserEmails` and `credentials.allowedDomains` are derived data used to keep UI queries and Security Rules simple.
- Grant creation and revocation are performed by the API, which updates both `grants` and `credentials.allowed*` together.
- Grant revocation is modeled as a logical state transition rather than physical deletion, so usage and audit references remain available.
- `credentials.allowed*` reflects active grants only. Revoked grants are excluded.
- Grant identity is uniquely determined by `(credentialId, granteeType, granteeValue)`. `grantId` is treated as a stable identifier derived from that tuple.
- Re-sharing to the same target does not create a new grant. It reactivates the existing grant from `revoked` back to `active`.
- On re-share, `createdAt` is preserved. The latest state change is reflected in `updatedAt`, and the owner's revocation time is preserved in `revokedAt`.
- `lastAccessAt` and `usageSummary7d` represent shared usage for a grant. They remain after revocation so historical usage can still be inspected alongside audit logs.
- The owner's own usage is stored in `credential_usages/{credentialId}` and treated as owner-only information that is not visible to shared users.
- Device flow state lives in `device_flows/{userCode}`. The browser identifies the target flow using `userCode`.
- `deviceCode` is stored as a field inside `device_flows` and is used by the client for polling.
- `userCode` is the human-facing confirmation code used to identify the target device flow and reduce accidental authorization.
- The primary audit trail lives in Cloud Logging, not Firestore.
- Audit logs must contain at least `actorUid`, `actorEmail`, `credentialId`, `credentialOwnerUid`, `eventType`, `result`, and `timestamp`.

## Grant State Model

### What a Grant Means

- A grant represents the relationship "this credential may be used by this target"
- Revoking sharing does not remove the grant's history or usage summary
- Re-sharing is treated as reactivation of the same relationship, not as creation of a different grant

### Grant States

- `active`
  - A currently valid share
  - Reflected in `credentials.allowedUserEmails` or `credentials.allowedDomains`
  - Eligible for device flow authorization
- `revoked`
  - A share that the owner has stopped for future use
  - Not reflected in `credentials.allowed*`
  - Not eligible for device flow authorization
  - The grant record remains for usage summaries and audit references

### Grant Timestamps

- `createdAt`
  - The time this sharing relationship was first created
  - Not updated on re-share
- `updatedAt`
  - The last time grant state or non-summary management information changed
  - Updated on revoke and re-share
- `revokedAt`
  - The time the owner stopped the share
  - Meaningful only when `status = revoked`
  - Cleared on re-share
- `lastAccessAt`
  - The time of the most recent successful usage through that grant
  - Preserved even after revocation

### Re-sharing a Grant

- Re-sharing to the same `credentialId`, `granteeType`, and `granteeValue` reactivates the existing grant
- No new grant record or new `grantId` is created
- Re-sharing sets `status = active`, updates `updatedAt`, and clears `revokedAt`
- `createdAt`, `lastAccessAt`, and `usageSummary7d` are preserved

### Grants and Usage

- Shared usage for a grant is summarized in `lastAccessAt`, `usageSummary7d`, and `usageUpdatedAt`
- Physical deletion would lose grant-linked statistics, so revoke does not delete the grant
- Whether a grant was actually used, and when it was stopped, must be determined by looking at both the grant record and the audit log

## Security Rules Strategy

### `users`

- Only the user themselves may read
- Only the user themselves may create or update
- `email` and `domain` must match `request.auth`

### `credentials`

- The owner may read
- A user may read if their email is included in `allowedUserEmails`
- A user may read if their domain is included in `allowedDomains`
- Client writes are not allowed

### `credential_secrets`

- Client reads and writes are always denied

### `credential_usages`

- Only the owner may read
- Client writes are not allowed

### `grants`

- Only the owner may read
- Client writes are not allowed

### `token_issuances`

- Client reads and writes are always denied

### `device_flows`

- Client reads and writes are always denied

## Screen Design

### Screen List

#### 1. Sign-in Screen

- Purpose: Start Google sign-in
- Main elements: Service description, `Sign in with Google`
- Transitions: Usage start screen, or whichever screen required authentication

#### 2. Home Screen

- Purpose: Provide entry points to the main Enki Gate functions
- Main elements: Navigation to credential management
- Transitions: Individual management screens

#### 3. Credential List Screen

- Purpose: Show the provider credentials registered by the current user
- Main elements: Status-aware credential list, `New`, `Details`, and either `Disable` or `Re-enable` depending on state
- Transitions: Credential registration screen, credential detail screen

#### 4. Credential Registration Screen

- Purpose: Register a provider credential
- Main elements: Provider selection, API key input, label, `Register`
- Transitions: Credential list screen

#### 5. Credential Detail Screen

- Purpose: Show credential details, the owner's own usage, sharing state, sharing history, and per-grant usage, and allow share management
- Main elements:
  - Credential information
  - The owner's own usage summary
  - `Disable` or `Re-enable` depending on credential state
  - State-aware grant list
  - Per-grant usage summary
  - `Add delegation`
  - `Revoke` or `Re-share` depending on grant state
- Transitions: Grant creation screen

#### 6. Grant Creation Screen

- Purpose: Delegate usage rights to an individual or a domain
- Main elements: Grantee input, `Create`
- Transitions: Credential detail screen

#### 7. Device Flow Authorization Screen

- Purpose: Enter the user code, choose a credential, and complete device flow authorization
- Main elements: User code input, available credential list, `Use this credential`
- Transitions: Completion screen

#### 8. Device Flow Completion Screen

- Purpose: Tell the user that the client application can now start using the service
- Main elements: Completion message
- Transitions: None

### Main Transitions

#### Normal Flow

- Sign-in screen -> home screen
- Home screen -> credential list screen

#### Credential Management

- Credential list screen -> credential registration screen
- Credential list screen -> credential detail screen
- Credential registration screen -> credential list screen
- Credential detail screen -> grant creation screen
- Grant creation screen -> credential detail screen

#### Device Flow

- Client application -> user code display
- User code display -> sign-in screen
- Sign-in screen -> device flow authorization screen
- Device flow authorization screen -> device flow completion screen

### Screen-Level Assumptions

- Users must not be asked to copy tokens manually
- Usage onboarding should complete entirely through device flow
- List retrieval should use direct Firestore reads where possible
- State-changing operations should prefer APIs for auditability
- The grant list on the credential detail screen shows both active and revoked grants and treats current sharing state and sharing history as the same resource
- The credential detail screen shows the owner's own usage separately from shared-user usage
- The grant list must show at least the share target, state, usage summary, and key timestamps, and revocation must not erase usage or audit references

## External Interface Design

### Design Principles

- Stateful reads such as list retrieval should use direct Firestore reads where possible
- State changes, token issuance, provider communication, and auditing should go through APIs
- Management APIs assume a user authenticated with Firebase Authentication
- Usage onboarding is handled through device flow

### Browser Flow

#### `GET /device`

- Purpose: Show the user-code input screen
- Authentication: Not required
- Main behavior:
  - If unauthenticated, proceed to the sign-in screen
  - If authenticated, show the device flow authorization screen
  - Allow a human to confirm which authorization target matches the user code
- Query parameters:
  - Accept optional `client_name`
  - `client_name` is display-only helper text shown in the UI and must not be used for target identification or security decisions
  - `user_code` is not accepted as a query parameter. Flow targeting continues to depend on the user entering `user_code` manually

### Device Flow API

#### `POST /api/device-flows`

- Purpose: Let a client application start device flow
- Authentication: Not required
- Main behavior:
  - Create `device_flows/{userCode}`
  - Return `device_code`, `user_code`, `verification_uri`, and `expires_in`
- Client implementation note:
  - The browser URL opened by the client may append `client_name` to `verification_uri`
  - Example: `https://.../device?client_name=My%20Tool`
  - `client_name` is display text only and must not be used as an authorization or token-issuance input
- Specification:
  - `expires_in` is 600 seconds
  - `interval` is 5 seconds
- Response:
  - `device_code`
  - `user_code`
  - `verification_uri`
  - `expires_in`
  - `interval`

#### `POST /api/device-flows/{deviceCode}/poll`

- Purpose: Let a client application wait for device flow completion
- Authentication: Not required
- Main behavior:
  - Check the state of the device flow identified by `deviceCode`
  - If authorized, issue a gateway token valid for one hour
  - Record `token_issuances/{issuanceId}`
  - Update `device_flows/{userCode}` to `completed`
  - Emit an audit event
- Response:
  - `pending` or `completed`
  - If completed, `access_token`, `token_type`, and `expires_in`
- Specification:
  - Do not return a token while the flow is still pending
  - Return failure if the flow is expired
  - Do not reissue tokens for a completed device flow

#### `POST /api/device-authorizations`

- Purpose: Let an authenticated browser user complete device flow by providing a user code and choosing a credential
- Authentication: Required
- Request:
  - `user_code`
  - `credential_id`
- Main behavior:
  - Validate the device flow identified by `user_code`
  - Verify that the actor is allowed to use the selected credential
  - Move the device flow into the `authorized` state
  - Emit an audit event
- Response:
  - `userCode`
  - `credentialId`
  - `status`

### Credential Management API

#### `POST /api/credentials`

- Purpose: Register a provider credential
- Authentication: Required
- Request:
  - `provider`
  - `label`
  - `apiKey`
- Main behavior:
  - Validate the API key with the upstream provider
  - Encrypt the API key
  - Create `credentials/{credentialId}` and `credential_secrets/{credentialId}`
  - Emit an audit event
- Response:
  - `credentialId`
  - `provider`
  - `label`
  - `status`

#### `POST /api/credentials/{credentialId}/disable`

- Purpose: Logically disable a credential
- Authentication: Required
- Main behavior:
  - Verify that the caller is the owner
  - Disable `credentials/{credentialId}`
  - Emit an audit event
- Response:
  - The updated credential

#### `POST /api/credentials/{credentialId}/enable`

- Purpose: Re-enable a credential in `disabled` state
- Authentication: Required
- Main behavior:
  - Verify that the caller is the owner
  - Return `credentials/{credentialId}` to `active`
  - Clear `disabledAt`
  - Emit an audit event
- Response:
  - The updated credential

### Grant Management API

#### `POST /api/credentials/{credentialId}/grants`

- Purpose: Delegate usage rights for a credential
- Authentication: Required
- Request:
  - `granteeType`
  - `granteeValue`
- Main behavior:
  - Verify that the caller is the owner
  - Resolve `grantId` from `(credentialId, granteeType, granteeValue)`
  - Create `grants/{grantId}` if it does not exist
  - If the grant already exists and is `revoked`, return it to `active`
  - Reflect the grantee in `credentials.allowedUserEmails` or `credentials.allowedDomains`
  - Emit an audit event
- Response:
  - `grantId`
  - `credentialId`
  - `granteeType`
  - `granteeValue`

#### `POST /api/grants/{grantId}/revoke`

- Purpose: Revoke a delegated grant
- Authentication: Required
- Main behavior:
  - Verify that the caller is the owner
  - Update `grants/{grantId}` to `revoked`
  - Record `updatedAt` and `revokedAt`
  - Remove the target from `credentials.allowedUserEmails` or `credentials.allowedDomains`
  - Keep the grant's usage summary and audit-reference data
  - Emit an audit event
- Response:
  - `grantId`
  - `status`

### OpenAI-Compatible API

#### `POST /v1/chat/completions`

- Purpose: Accept OpenAI-compatible chat completions requests
- Authentication: Gateway token required
- Main behavior:
  - Validate the gateway token
  - Resolve the actor, credential owner, and credential from `token_issuances`
  - Evaluate policy
  - Decrypt the provider credential
  - Forward the request to the upstream provider
  - Emit usage, cost, and policy-decision audit logs

#### `POST /v1/responses`

- Purpose: Accept OpenAI-compatible responses API requests
- Authentication: Gateway token required
- Main behavior:
  - Same as `POST /v1/chat/completions`

### Hosting and Functions Routing

- `/api/**` is routed to the Management API and Device Flow API
- `/v1/**` is routed to the OpenAI-compatible API
- Everything else returns Hosting's SPA `index.html`
- UI path `/device` and API path `/api/device-authorizations` are separated

### Boundary Between Management API and Direct Firestore Reads

- Direct Firestore reads:
  - `users`
  - The owner's own `grants`
  - `credentials` readable either as owner or delegated user
- Through the Management API:
  - Credential registration, disable, and re-enable
  - Grant creation and revoke
- Through the Device Flow API:
  - Device flow start
  - Device flow authorization
  - Polling and gateway token issuance
