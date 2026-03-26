# enki-gate

Enki Gate is an auditable AI access gateway that sits between untrusted or semi-trusted clients and upstream LLM providers.

The goal is simple: do not distribute provider API keys to clients. Instead, centralize authentication, authorization, usage control, and auditing for AI access on the gateway side. The OpenAI-compatible API exists as a way to apply that control layer to existing tools without forcing them to adopt a custom protocol.

## What Enki Gate Governs

Enki Gate is not just governing API calls. It is governing the right to use AI.

- Who is allowed to use it
- Which credential they are using
- Which models they may use and under what limits
- How much they used and what cost was incurred

Rather than scattering those decisions across clients, Enki Gate keeps them in one place.

## Core Principles

- Provider API keys are stored only on the server side and are never sent to clients.
- Clients receive only short-lived, scoped gateway tokens.
- Every request is auditable, including both the actor and the credential owner.
- Quotas, rate limits, model control, and routing are enforced by the gateway.

## Permission Model

The primary subject is an individual user. A user can register their own provider credential in Enki Gate and delegate the right to use it to other individuals or to an email domain. For example, `yazawa@voice-research.com` can allow `hulk@voice-research.com` or `*@voice-research.com` to use that credential.

What is delegated is not the API key itself. What is delegated is the right to use it. Users authenticate as themselves and then choose whether to use their own credential or one that has been delegated to them. Clients such as Binder receive only a short-lived token issued by Enki Gate for that choice.

At the moment, gateway tokens are assumed to have a TTL of one hour. Revoking delegated access is therefore modeled as taking effect against current state and future use, rather than as immediate permanent invalidation of all previously issued tokens.

## Credential Storage

Provider credentials are stored in Firestore, but never in plaintext.

Firestore stores ciphertext and metadata, while Cloud KMS manages the decryption keys. Credentials are decrypted only at use time and are not retained after the upstream provider request has been sent.

The main storage responsibilities are split as follows:

- Firestore: user records, credential metadata, encrypted credentials, grants, token issuance records, and usage caches
- Cloud KMS: key management for credential decryption
- Cloud Logging: audit events for requests, usage, cost, and policy decisions

Firebase is currently a strong deployment candidate, but secret isolation, key management, and audit logging are designed with the surrounding GCP responsibilities in mind.

## UX Direction

The intended onboarding flow is device-flow-based, so that even non-expert users can complete authorization without exposing secrets to the client. The emphasis is on making existing tools work without making the client trusted.

## Deployment

Firebase is the current leading deployment option, but it is not a fixed requirement. If it cannot satisfy secret isolation, policy enforcement, audit logging, or operational simplicity, it should be replaced.
