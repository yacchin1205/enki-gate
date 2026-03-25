# DESIGN

## ユースケース

### 1. Credential owner が provider credential を登録する

- 主アクター: Credential owner
- 関与するもの: Enki Gate、upstream provider
- 目的: 個人の provider API key を Enki Gate に登録し、クライアントへ生の key を配らずに利用できるようにする
- 図: `docs/diagrams/uc01-register-credential.puml`

![UC01](docs/diagrams/uc01-register-credential.png)

### 2. Credential owner が他の個人またはドメインに利用権を委譲する

- 主アクター: Credential owner
- 関与するもの: Enki Gate
- 目的: owner の credential を、他の個人ユーザーまたはメールドメイン全体に対して利用可能にする
- 図: `docs/diagrams/uc02-grant-access.puml`

![UC02](docs/diagrams/uc02-grant-access.png)

### 3. Credential user が device flow で利用開始する

- 主アクター: Credential user
- 関与するもの: Enki Gate、Client application
- 目的: client application に表示された user code を使って認証し、利用する credential を選び、client application が gateway token を受け取れる状態にする
- 図: `docs/diagrams/uc03-issue-gateway-token.puml`

![UC03](docs/diagrams/uc03-issue-gateway-token.png)

### 4. Client application が発行済み token を使って gateway を呼び出す

- 主アクター: Client application
- 関与するもの: Enki Gate、upstream provider
- 目的: provider API key を持たずに、Enki Gate 経由で OpenAI 互換 API を利用する
- 図: `docs/diagrams/uc05-call-gateway-api.puml`

![UC04](docs/diagrams/uc05-call-gateway-api.png)

### 5. Enki Gate が利用と policy decision を監査する

- 主アクター: Enki Gate
- 関与するもの: Cloud Logging
- 目的: 誰がどの credential を使い、どの client / session から利用し、どのような usage と policy outcome になったかを記録する
- 図: `docs/diagrams/uc05-audit-usage.puml`

![UC05](docs/diagrams/uc05-audit-usage.png)

### 6. Credential owner が credential または grant を取り消す

- 主アクター: Credential owner
- 関与するもの: Enki Gate
- 目的: credential 自体、または委譲済みの利用権を将来の利用から外す
- 図: `docs/diagrams/uc06-revoke-credential-or-grant.puml`

![UC06](docs/diagrams/uc06-revoke-credential-or-grant.png)

## Firestore コレクション設計

### `users/{uid}`

- 用途: Google ログインした個人ユーザーの正規化された情報
- 主なフィールド: `email`, `domain`, `displayName`, `photoURL`, `createdAt`, `updatedAt`
- クライアント read: 本人のみ可
- クライアント write: 本人の upsert のみ可。`email` と `domain` は認証情報と一致している必要がある
- サーバ write: 可

### `credentials/{credentialId}`

- 用途: credential の安全な metadata。平文 secret は持たない
- 主なフィールド: `ownerUid`, `ownerEmail`, `provider`, `label`, `status`, `allowedUserEmails`, `allowedDomains`, `createdAt`, `updatedAt`
- クライアント read: owner、または委譲された user / domain のみ可
- クライアント write: 不可
- サーバ write: 可

### `credential_secrets/{credentialId}`

- 用途: provider credential の暗号化済み secret
- 主なフィールド: `ownerUid`, `ciphertext`, `wrappedDek`, `kmsKeyName`, `createdAt`, `updatedAt`
- クライアント read: 不可
- クライアント write: 不可
- サーバ write: 可

### `grants/{grantId}`

- 用途: credential の委譲状態
- 主なフィールド: `credentialId`, `ownerUid`, `granteeType`, `granteeValue`, `createdAt`
- クライアント read: owner のみ可
- クライアント write: 不可
- サーバ write: 可

### `token_issuances/{issuanceId}`

- 用途: gateway token の発行記録
- 主なフィールド: `actorUid`, `actorEmail`, `credentialId`, `credentialOwnerUid`, `tokenHash`, `issuedAt`, `expiresAt`
- クライアント read: 不可
- クライアント write: 不可
- サーバ write: 可

### `device_flows/{userCode}`

- 用途: device flow の進行状態
- 主なフィールド: `userCode`, `status`, `credentialId`, `actorUid`, `actorEmail`, `tokenHash`, `createdAt`, `expiresAt`, `authorizedAt`
- クライアント read: 不可
- クライアント write: 不可
- サーバ write: 可

## Firestore 設計上の要点

- `credentials` と `credential_secrets` は分ける。UI が参照する可能性があるのは `credentials` だけで、`credential_secrets` は常にサーバ専用にする
- `grants` は委譲の正規データとして持つ
- `credentials.allowedUserEmails` と `credentials.allowedDomains` は、UI の直接クエリと Security Rules を単純に保つための派生データとして持つ
- grant の作成と取り消しは API が行い、そのたびに `grants` と `credentials.allowed*` を一緒に更新する
- device flow の状態は `device_flows/{userCode}` に持ち、browser 側は `userCode` で認可対象を特定する
- `deviceCode` は `device_flows` のフィールドとして保持し、client 側の polling で照合する
- `userCode` は、人間が認可対象の device flow を特定し、誤認可を避けるための確認コードとして使う
- audit log の本流は Firestore ではなく Cloud Logging に出す
- 監査ログには少なくとも `actorUid`, `actorEmail`, `credentialId`, `credentialOwnerUid`, `eventType`, `result`, `timestamp` を含める

## Security Rules の方針

### `users`

- 本人だけが read できる
- 本人だけが create / update できる
- `email` と `domain` は `request.auth` と一致しなければならない

### `credentials`

- owner は read 可
- `allowedUserEmails` に自分の email が含まれる場合は read 可
- `allowedDomains` に自分の domain が含まれる場合は read 可
- クライアント write は不可

### `credential_secrets`

- クライアントからの read / write は常に不可

### `grants`

- owner だけが read 可
- クライアント write は不可

### `token_issuances`

- クライアントからの read / write は常に不可

### `device_flows`

- クライアントからの read / write は常に不可

## 画面設計

### 画面一覧

#### 1. サインイン画面

- 目的: Google ログインを開始する
- 主な要素: サービス説明、`Sign in with Google`
- 遷移先: 利用開始画面、またはログイン前に要求されていた画面

#### 2. ホーム画面

- 目的: Enki Gate の主要機能への入口をまとめる
- 主な要素: Credential 管理、利用開始への導線
- 遷移先: 各管理画面

#### 3. Credential 一覧画面

- 目的: 自分が登録した provider credential を確認する
- 主な要素: credential 一覧、`新規登録`、`詳細`、`無効化`
- 遷移先: Credential 登録画面、Credential 詳細画面

#### 4. Credential 登録画面

- 目的: provider credential を登録する
- 主な要素: provider 選択、API key 入力、ラベル、`登録`
- 遷移先: Credential 一覧画面

#### 5. Credential 詳細画面

- 目的: credential の詳細と委譲状態を確認する
- 主な要素: credential 情報、既存 grant 一覧、`委譲追加`、`取り消し`、`無効化`
- 遷移先: Grant 作成画面

#### 6. Grant 作成画面

- 目的: 個人またはドメインに対して利用権を委譲する
- 主な要素: 委譲先入力、`作成`
- 遷移先: Credential 詳細画面

#### 7. Device flow 認可画面

- 目的: user code を入力し、利用する credential を選んで device flow を完了する
- 主な要素: user code 入力、利用可能 credential 一覧、`この credential を使う`
- 遷移先: 完了画面

#### 8. Device flow 完了画面

- 目的: client application 側で利用開始できる状態になったことをユーザーに伝える
- 主な要素: 完了メッセージ
- 遷移先: なし

### 主要遷移

#### 通常操作

- サインイン画面 -> ホーム画面
- ホーム画面 -> Credential 一覧画面

#### Credential 管理

- Credential 一覧画面 -> Credential 登録画面
- Credential 一覧画面 -> Credential 詳細画面
- Credential 登録画面 -> Credential 一覧画面
- Credential 詳細画面 -> Grant 作成画面
- Grant 作成画面 -> Credential 詳細画面

#### Device flow

- Client application -> user code 表示
- user code 表示 -> サインイン画面
- サインイン画面 -> Device flow 認可画面
- Device flow 認可画面 -> Device flow 完了画面

### 画面設計上の前提

- token をユーザーに手でコピーさせない
- 利用開始は device flow で完結させる
- 一覧取得は可能な限り Firestore 直読みを前提にする
- 状態変更は監査のため API 経由に寄せる

## 外部インターフェース設計

### 設計方針

- 一覧取得のような状態参照は、可能な限り Firestore 直読みで行う
- 状態変更、token 発行、provider 通信、監査を伴う処理は API 経由で行う
- 管理 API は Firebase Authentication による認証済みユーザーを前提とする
- 利用開始は device flow で行う

### Browser Flow

#### `GET /device`

- 用途: user code の入力画面を表示する
- 認証: 不要
- 主な処理:
  - 未認証ならサインイン画面へ進める
  - 認証済みなら device flow 認可画面を表示する
  - user code に対応する認可対象を人間が確認できるようにする

#### `POST /device`

- 用途: ユーザーが user code と credential 選択により device flow を完了する
- 認証: 必須
- フォーム入力:
  - `user_code`
  - `credential_id`
- 主な処理:
  - `user_code` に対応する device flow を検証する
  - actor がその credential を利用可能であることを確認する
  - device flow を authorized 状態にする
  - 監査イベントを出す
  - 完了画面を表示する

### Device Flow API

#### `POST /api/device-flows`

- 用途: client application が device flow を開始する
- 認証: 不要
- 主な処理:
  - `device_flows/{userCode}` を作成する
  - `device_code`, `user_code`, `verification_uri`, `expires_in` を返す
- 仕様:
  - `expires_in` は 600 秒
  - `interval` は 5 秒
- レスポンス:
  - `device_code`
  - `user_code`
  - `verification_uri`
  - `expires_in`
  - `interval`

#### `POST /api/device-flows/{deviceCode}:poll`

- 用途: client application が device flow の完了を待つ
- 認証: 不要
- 主な処理:
  - `deviceCode` に対応する device flow の状態を確認する
  - authorized なら 1 時間有効な gateway token を発行する
  - `token_issuances/{issuanceId}` を記録する
  - `device_flows/{userCode}` を completed に更新する
  - 監査イベントを出す
- レスポンス:
  - pending か completed か
  - completed の場合は `access_token`, `token_type`, `expires_in`
- 仕様:
  - pending の間は token を返さない
  - expired の場合は失敗を返す
  - completed になった device flow では再発行しない

### Credential 管理 API

#### `POST /api/credentials`

- 用途: provider credential を登録する
- 認証: 必須
- リクエスト:
  - `provider`
  - `label`
  - `apiKey`
- 主な処理:
  - upstream provider で API key を検証する
  - API key を暗号化する
  - `credentials/{credentialId}` と `credential_secrets/{credentialId}` を作成する
  - 監査イベントを出す
- レスポンス:
  - `credentialId`
  - `provider`
  - `label`
  - `status`

#### `POST /api/credentials/{credentialId}:disable`

- 用途: credential を論理削除する
- 認証: 必須
- 主な処理:
  - owner であることを確認する
  - `credentials/{credentialId}` を無効化する
  - 監査イベントを出す
- レスポンス:
  - 更新後の credential

### Grant 管理 API

#### `POST /api/credentials/{credentialId}/grants`

- 用途: credential の利用権を委譲する
- 認証: 必須
- リクエスト:
  - `granteeType`
  - `granteeValue`
- 主な処理:
  - owner であることを確認する
  - `grants/{grantId}` を作成する
  - `credentials.allowedUserEmails` または `credentials.allowedDomains` を更新する
  - 監査イベントを出す
- レスポンス:
  - `grantId`
  - `credentialId`
  - `granteeType`
  - `granteeValue`

#### `POST /api/grants/{grantId}:revoke`

- 用途: 委譲済み grant を取り消す
- 認証: 必須
- 主な処理:
  - owner であることを確認する
  - `grants/{grantId}` を削除する
  - `credentials.allowedUserEmails` または `credentials.allowedDomains` を更新する
  - 監査イベントを出す
- レスポンス:
  - `grantId`
  - `status`

### OpenAI 互換 API

#### `POST /v1/chat/completions`

- 用途: OpenAI 互換の chat completions を受ける
- 認証: gateway token 必須
- 主な処理:
  - gateway token を検証する
  - `token_issuances` から actor、credential owner、credential を解決する
  - policy を評価する
  - provider credential を復号する
  - upstream provider に中継する
  - usage、cost、policy decision を監査ログへ出す

#### `POST /v1/responses`

- 用途: OpenAI 互換の responses API を受ける
- 認証: gateway token 必須
- 主な処理:
  - `POST /v1/chat/completions` と同様

### Management API と Firestore 直読みの境界

- Firestore 直読み:
  - `users`
  - owner 自身の `grants`
  - owner または委譲先として参照可能な `credentials`
- Management API 経由:
  - credential 登録、無効化
  - grant 作成、取り消し
- Browser Flow:
  - device flow 完了
- Device Flow API:
  - device flow 開始
  - polling と gateway token 発行
- OpenAI 互換 API:
  - OpenAI 互換 API 呼び出し
