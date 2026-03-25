# enki-gate

Enki Gate は、非信頼または半信頼のクライアントと upstream LLM provider の間に置く、監査可能な AI access gateway です。

目的は単純です。provider の API key をクライアントに配らず、AI 利用の認証、権限、利用制御、監査を gateway 側に集約することです。OpenAI 互換 API は、その統制を既存ツールにそのまま差し込むための手段として位置づけます。

## 何を統治するのか

Enki Gate が扱うのは、単なる API 呼び出しではなく「AI を使う権利」です。

- 誰が使うのか
- 誰の credential に基づいて使うのか
- どの model をどこまで使えるのか
- どれだけ使い、いくら相当のコストが発生したのか

この境界をクライアントごとに分散させず、一箇所に集約して扱います。

## 基本原則

- provider API key は常にサーバ側だけに保持し、クライアントへ渡さない
- クライアントに渡すのは短命でスコープされた token のみとする
- すべての request は actor と credential owner を含めて監査可能である
- quota、rate limit、model 制御、routing は gateway 側で強制する

## 権限モデル

利用主体は個人です。個人は自分の provider credential を Enki Gate に登録し、その利用権を他の個人やメールドメイン単位で委譲できます。たとえば `yazawa@voice-research.com` は `hulk@voice-research.com` や `*@voice-research.com` に利用を許可できます。

ただし、委譲されるのは API key そのものではなく利用権です。利用者は自分で認証した上で、自分の credential を使うか、委譲された credential を使うかを選びます。Binder などのクライアントに渡るのは、その選択に基づいて Enki Gate が発行した短命 token だけです。

現在の想定では、gateway token の TTL は 1 時間です。委譲の取り消しは即時失効ではなく、この短い有効期限を前提に扱います。

## Credential の保管

provider credential は Firestore に保存しますが、平文では保持しません。

Firestore には ciphertext と metadata を保存し、復号鍵の管理は Cloud KMS で行います。利用時にのみ復号し、upstream provider への request に使った後は保持しません。

保存先の役割は大きく分けて以下のとおりです。

- Firestore: user、credential metadata、encrypted credential、grant、token issuance などの状態管理
- Cloud KMS: credential 復号のための鍵管理
- Cloud Logging: request、usage、cost、policy decision などの監査イベント

Firebase は有力候補ですが、secret の隔離、鍵管理、監査ログについては GCP の責務まで含めて設計します。

## UX の方向性

認証と利用開始は、初心者でも扱える device flow で成立する形を目指します。クライアントに秘密情報を持たせず、それでも既存ツールに接続できることを重視します。

## デプロイについて

現時点では Firebase を有力なデプロイ候補として検討します。ただし、これは固定要件ではありません。secret の隔離、policy の強制、監査ログ、運用の単純さを満たせないなら変更します。
