# KizunaMap（キズナマップ）

**人物・大/小グループ・所属・役割（ロール）・スキル・関係性を管理し、ロール中心の相関図として可視化・共有する汎用ブラウザWebアプリケーション**

> **【重要：権利関係・非提携声明および免責事項 / Legal Notice & Disclaimer】**  
> 本プロジェクト「KizunaMap (`kizunamap`)」は、組織やプロジェクトの相関図を作成・管理するための**独立した汎用ブラウザ相関図オープンソースツール**であり、特定のスマートフォンゲーム（『スタンドマイヒーローズ』の「キズナマップ」、『18TRIP』の「きずなっぷ」等）や既存の第三者の商標・サービスとは**一切関係ありません（非公式・非提携）**。  
> また、本ソフトウェアは「現状有姿（AS-IS）」で提供され、本ソフトウェアの使用・改変・運用によって生じたいかなる損害についても作者は一切の責任を負いません。詳細は [DISCLAIMER.md](./DISCLAIMER.md) および [LICENSE](./LICENSE) をご確認ください。

---

## 1. 主な特徴とアーキテクチャ

1. **3つの相関図モードと直感的なキャンバス操作**
   - **初期画面（所属中心）**: 大グループの枠の中に小グループの枠と直下メンバーが入れ子で配置され、各名前の下に「そこでのロール」が表示されます。別グループへドラッグすると所属移動、`Ctrl+ドラッグ` で複数所属（コピー追加）が可能です（この画面では関係線は非表示）。
   - **人物図（人中心）**: 人名の右脇に所属グループとロールをずらっと表示し、人物間の関係線と内容ラベルを表示します（片方向は発信元の根本寄り、双方向は中央に配置）。
   - **グループ図（グループ中心）**: グループ枠内に所属メンバーとロールをずらっと表示し、グループ間の関係線と内容ラベルを表示します。
   - **ワンクリック＝フォーカス / ダブルクリック＝詳細・編集 / 結点ドラッグ付け替え**: 人・グループ・関係線すべて「ワンクリックでフォーカス（関連線の前面強調）」「ダブルクリック（ダブルタップ）で詳細・編集モーダル表示」に統一。関係線を選択して端点をカードの四方（上・右・下・左）へドラッグすると結合場所を自由に付け替えられます。
2. **4階層の権限モデルとメールアドレス秘匿**
   - **管理者（オーナー）**: 管理メニューの操作、編集者の任命・解除、全ユーザー（編集者・一般人・未連携）の削除、YAMLバックアップ退避・取込が可能。**メールアドレスは管理者以外には一切表示されません。**
   - **編集者**: Googleアカウント紐づけにより、グループ管理、「ロール・スキル・タグ管理」タブの閲覧・更新、一般人ユーザーの削除が可能（※管理者や他の編集者の人物カードは削除不可）。
   - **一般人（ログインあり）**: Googleアカウント紐づけにより、**自分自身の人物カードを1枚だけ追加（なりすまし・大量追加防止）** し、自分のプロフィール・所属・自分が関わる関係線の構築、および自分の人物カードの削除（退会）が可能。
   - **一般人（ログイン無し）**: 公開プロジェクトのURLを知っていれば閲覧のみ可能。
3. **本人プロフィールとアイコン画像の所有権保護**
   - 本人プロフィール（`/userProfiles/{uid}`）および本人アイコン（`/profileIcons/{uid}`）は、Firebase Authentication の `auth.uid` で所有者本人と一致する場合のみ変更可能。**プロジェクト管理者や編集者であっても他人の本人プロフィールは変更できません**。
   - 非公開プロフィールの人物は、相関図ではプロジェクト上の表示名と代替アイコンで表示され、本人以外にコメント・リンク・本人アイコンは公開されません。
   - Googleメールアドレスは公開プロジェクト文書や公開プロフィール文書に一切含めません。
4. **Cloud Storage・Cloud Functions 不使用（Firebase Spark 無料プラン完結）**
   - アイコン画像はブラウザ内でデコード・正方形切り抜きプレビュー調整のうえ、**128×128px WebP（透過対応、原則20KB以下・最大30KB）** に圧縮し、基本情報文書から分離した専用コレクション（`profileIcons` / `projectIcons`）に保存します（`dataUrl` フィールドはインデックス対象から除外設定済み）。
5. **管理者専用のローカルYAMLバックアップ退避・取込機能**
   - プロジェクト管理者（オーナー）のみ、プロジェクトのグループ階層・人物・所属ロール・関係線・図の座標・グループ画像を `.yaml` ファイルとしてローカルへ退避（エクスポート）および取込（インポート）できます（他人の本人プロフィールは保護され書き換えません）。
6. **管理者用のマルチユーザー作成・ワンクリック切り替え（検証機能）**
   - 管理者が1人で「管理者」「編集者」「一般人（ログインあり・公開/非公開/新規追加）」「一般人（ログイン無し・閲覧のみ）」をすべて検証できるよう、画面上部のスイッチャーおよび管理メニューからテスト用ユーザーを複数作成・切り替えできます。

---

## 2. ローカル起動とテスト手順

### 2-1. 必要環境
- Node.js 20 以上（動作確認済み: Node.js v22.17.0）

### 2-2. インストールと開発サーバー起動（ローカルデモモード）
```bash
npm install
npm run dev
```
- `.env.local` を設定しない状態では、自動的に **ローカルデモモード** で起動します。
- 初期デモデータとして、**大グループ3個、小グループ5個、人物7人（複数所属・所属別ロール・公開プロフィール・非公開プロフィール・招待承認待ち・未連携人物）** がロードされます。
- 別タブ・別ウィンドウ間でも `localStorage` と `BroadcastChannel` によりリアルタイム反映および再読み込み後の保持を確認できます。

### 2-3. テストの実行
```bash
# ドメインロジック・権限境界・画像検証・YAML退避取込・UI結合テスト
npm test

# プロダクションビルド検証
npm run build

# Firebase Emulator を使った Firestore セキュリティルール検証（Java 11+ が必要）
npm run test:rules
```

---

## 3. GitHub（`https://github.com/nagaikiman`）でのソースコード管理・連携手順

プロジェクトには秘密情報（`.env.local` 等）を除外する `.gitignore` を設定し、ローカル Git リポジトリを初期化済みです。以下の手順であなたの GitHub アカウント（`nagaikiman`）にプッシュできます。

1. ブラウザで [GitHub (https://github.com/new)](https://github.com/new) を開きます。
2. **Repository name** に `kizunamap` と入力し、**Private**（または Public）を選択して **Create repository** をクリックします（※`Add a README file` や `Add .gitignore` のチェックは**外した状態**で作成してください）。
3. ターミナル（PowerShell）で `c:\antigravity\kizunamap` フォルダを開き、最新の変更をコミットして GitHub へプッシュします：
   ```powershell
   cd c:\antigravity\kizunamap
   git add -A
   git commit -m "Update diagram modes, 4-side edge handles, and 4-tier permissions"
   git remote add origin https://github.com/nagaikiman/kizunamap.git
   git branch -M main
   git push -u origin main
   ```
   ※既に `origin` を登録済みの場合は `git remote add origin ...` の行はスキップして `git push -u origin main` を実行してください。  
   ※初回プッシュ時に Git Credential Manager の「Sign in with your browser」ウィンドウが表示されたら、ブラウザで承認すると連携が完了します。

---

## 4. 【重要】あなたが操作する必要のある Firebase・Google 側の設定手順（Spark無料プラン）

> **注意**: 以下の設定は Google / Firebase コンソール上でのオーナー操作が必要です。**請求先アカウントの登録や Blaze（従量課金）プランへのアップグレードは行わず、Spark（無料）プランのまま進めてください。**

### 手順1: Sparkプランでの Firebase プロジェクト作成
1. [Firebase コンソール](https://console.firebase.google.com/) にアクセスし、「プロジェクトを作成」をクリックします。
2. プロジェクト名（例: `kizunamap-prod`）を入力し、Google アナリティクスは任意（不要ならOFF）で作成します。
3. 左下のプラン表示が **Spark プラン（無料 $0/月）** であることを確認します。

### 手順2: Googleログイン（Firebase Authentication）と承認済みドメイン設定
1. Firebase コンソール左メニュー「構築」→「**Authentication**」→「始める」をクリックします。
2. 「Sign-in method」タブで「**Google**」を選択し、「有効にする」をONにします。プロジェクトのサポートメールを選択して「保存」します。
3. 「Settings（設定）」タブ →「**承認済みドメイン**」を開き、`localhost` および Firebase Hosting のドメイン（`<project-id>.web.app` / `<project-id>.firebaseapp.com`）が含まれていることを確認します（独自ドメインを使う場合のみここに追加します）。

### 手順3: Cloud Firestore の作成とルール・インデックスの反映
1. 左メニュー「構築」→「**Firestore Database**」→「データベースの作成」をクリックします。
2. ロケーション（例: `asia-northeast1 (東京)`）を選択し、「本番環境モードで開始」で作成します。
3. ローカルで Firebase CLI にログインし、本リポジトリのセキュリティルールとインデックスをデプロイします：
   ```bash
   npx firebase login
   npx firebase use <あなたのFirebaseプロジェクトID>
   npx firebase deploy --only firestore:rules,firestore:indexes
   ```

### 手順4: 運営アカウント（プロジェクト作成権限）の初期登録
仕様「プロジェクト作成は、Firebaseコンソールであらかじめ登録した運営アカウントのみ可能」に基づき、Firestore コンソールから以下の1ドキュメントを手動作成してください（クライアントからの書き換えはルールで禁止されています）：
- **コレクションID**: `systemConfig`
- **ドキュメントID**: `operators`
- **フィールド**:
  - `allowedUids` (array): あなたの Firebase Authentication の UID（文字列）を追加
  - `allowedEmails` (array): あなたの Google メールアドレス（文字列、例 `"yourname@gmail.com"`）を追加

### 手順5: 環境変数ファイル `.env.local` の作成と Firebase Hosting 公開
1. Firebase コンソールの「プロジェクトの設定（歯車アイコン）」→「マイアプリ」→「ウェブ（`</>`）」でアプリを登録（Firebase Hosting もチェック可）し、表示された設定値をコピーします。
2. プロジェクトルートの `.env.example` を `.env.local` にコピーして値を記入します：
   ```env
   VITE_FIREBASE_API_KEY=AIzaSy...
   VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project-id
   VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
   VITE_FIREBASE_APP_ID=1:1234567890:web:abcdef
   VITE_USE_FIREBASE_EMULATOR=false
   ```
3. ビルドして Firebase Hosting にデプロイします：
   ```bash
   npm run build
   npx firebase deploy --only hosting
   ```

---

## 5. アプリ内の運用操作ガイド

### 5-1. 編集者の追加・削除（管理者のみ）
1. 画面左下の歯車アイコンまたは上部「YAML退避・取込」横の設定から「**2. 編集者メンバー管理（ACL）**」タブを開きます。
2. 許可したい編集者の Google メールアドレスを入力して「編集者として許可」をクリックします。
3. 「権限を取り消す」をクリックすると即座に `active: false` となり、以降の書き込みが Firestore ルールで拒否されます。

### 5-2. 人物と本人アカウントの安全なひも付け
1. 管理者が人物詳細モーダル下部の「人物とGoogleアカウントの安全なひも付け管理」で、対象者の Google メールアドレスを入力し「**ひも付け招待を作成**」をクリックします（※この時点ではまだひも付けられません）。
2. 対象者がその Google アカウントでログインすると、画面上部に「**【本人確認・ひも付け招待】**」バナーが表示されます。
3. 本人が対象人物とプロジェクト名を確認し、「**本人として承認してひも付ける**」をクリックすると、本人 UID とのひも付けが確定します。
4. ひも付け解除は本人またはプロジェクト管理者がいつでも実行でき、解除しても本人プロフィール自体は変更・削除されません。

### 5-3. 本人プロフィールの編集・公開
1. ひも付け済みの本人がログインすると、自分の人物モーダル右上またはヘッダーに「**プロフィール編集（本人専用）**」ボタンが表示されます（管理者であっても他人の人物には表示されず、直接リクエストも拒否されます）。
2. プロフィール表示名、128×128px WebP アイコン、コメント（最大400文字）、URLリンク（最大2個）を設定し、「**本人プロフィールを公開する**」をONにすると公開されます。

### 5-4. YAMLバックアップのローカル退避・取込（管理者のみ）
1. ヘッダーの「**YAML退避・取込**」ボタンを開きます。
2. 「YAMLファイルをローカルへ退避（ダウンロード）」で `.yaml` ファイルを保存できます。
3. 「YAMLファイルを選択して取込（復元）」でローカルの `.yaml` ファイルからプロジェクトデータを復元できます。

---

## 6. Firebase 無料枠（Sparkプラン）の公式条件とデータ量・通信量の概算

### 6-1. 公式情報の確認日と参照先
- **確認日**: 2026年10月27日
- **公式参照先**:
  - [Firebase Pricing (Spark Plan / No-cost tier)](https://firebase.google.com/pricing)
  - [Cloud Firestore Quotas and Limits](https://firebase.google.com/docs/firestore/quotas)
  - [Firebase Hosting Quotas](https://firebase.google.com/docs/hosting/usage-quotas-pricing)
  - [Firebase Authentication Limits](https://firebase.google.com/docs/auth/limits)

### 6-2. Sparkプラン（無料枠）の主な上限
| サービス | 項目 | 無料枠（Sparkプラン）上限 | 上限到達時の挙動 |
| :--- | :--- | :--- | :--- |
| **Cloud Firestore** | 保存データ容量 | **1 GiB** | 超過時は書き込み停止（課金は発生しない） |
| **Cloud Firestore** | ドキュメント読み取り | **50,000 回 / 日** | 当日のリセットまで一時停止 |
| **Cloud Firestore** | ドキュメント書き込み | **20,000 回 / 日** | 当日のリセットまで一時停止 |
| **Cloud Firestore** | ドキュメント削除 | **20,000 回 / 日** | 当日のリセットまで一時停止 |
| **Cloud Firestore** | ネットワーク下り転送量 | **10 GiB / 月** | 当月リセットまで一時停止 |
| **Firebase Hosting** | ストレージ容量 | **10 GB** | デプロイ制限 |
| **Firebase Hosting** | データ転送量（帯域幅） | **360 MB / 日**（約10.8 GB/月） | 当日のリセットまで一時停止 |
| **Authentication** | Googleログイン等（MAU） | **50,000 MAU / 月** | 無料枠内 |

### 6-3. 想定規模における保存量・読み取り・書き込み・配信量の概算
※以下は想定規模（編集者：1日数人、閲覧者：1日50人程度、大グループ10個、小グループ100個、人物100人、アイコン画像計120枚）における**概算値**であり、利用状況により変動します。

1. **Firestore 保存データ量の概算**
   - テキスト文書（プロジェクト・グループ110件・人物100件・所属200件・関係100件・図5件）：約 `500 KB`
   - アイコン画像文書（128×128 WebP 平均 18KB → Base64換算 約 25KB × 120件）：約 `3.0 MB`
   - **合計保存量**: **約 3.5 MB / 1プロジェクト**（無料枠 1 GiB の **約 0.35%**。数十プロジェクト作成しても十分な余裕があります）
2. **1日あたりのドキュメント読み取り回数・転送量の概算**
   - 公開閲覧者1人が初期表示で読み込む文書数（プロジェクト1 + 図1 + グループ + 人物 + 所属 + 関係 + 公開アイコン）：約 `150〜250 reads`（2回目以降はアイコンのメモリキャッシュ再利用および開いていない図の非監視により大幅に削減）
   - 閲覧者 50人/日 × 平均 200 reads ＝ **約 10,000 reads / 日**（無料枠 50,000 reads/日 の **約 20%**）
   - 本人プロフィール本文は詳細モーダルを開いた時のみオンデマンド取得するため、一覧表示時の無駄な読み取りは発生しません。
3. **1日あたりのドキュメント書き込み回数の概算**
   - ノード座標はドラッグ中ではなく**ドラッグ終了時のみ**該当図ドキュメントを更新し、テキスト入力もデバウンス保存を行うため、編集者5人が1日各100回操作しても **約 500 writes / 日**（無料枠 20,000 writes/日 の **約 2.5%**）に収まります。
4. **Firebase Hosting 配信量の概算**
   - 初回JS/CSSバンドル（gzip圧縮後 約 190 KB）× 50人/日 ＝ **約 9.5 MB / 日**（無料枠 360 MB/日 の **約 2.6%**）。

### 6-4. 無料枠と利用状況の確認方法
- Firebase コンソールの左メニュー「**利用状況と請求**（Usage and billing）」から、Firestore の日次読み取り/書き込み回数・保存容量、および Hosting の転送量をグラフでいつでも確認できます。

---

## 7. ローカルデモモードと本番（Firebase接続時）の違い

| 項目 | ローカルデモモード（`.env.local` 未設定時） | 本番モード（`.env.local` 設定＋Firebaseデプロイ時） |
| :--- | :--- | :--- |
| **データ保存先** | ブラウザの `localStorage`（別タブへは `BroadcastChannel` で即時反映） | Cloud Firestore（`firestore.rules` によりサーバー側で権限・型・サイズ検証） |
| **認証とユーザー切替** | ヘッダーの「テストユーザー切替」および「＋作成」で任意のUID・メールをシミュレーション | Firebase Authentication（Googleログイン）＋管理者用テストサンドボックスユーザー |
| **初期データ** | 大グループ3・小グループ5・人物7・複数所属・招待承認待ちを含むデモデータを自動生成 | Firestore 上のプロジェクトデータを読み込み |

---

## 8. 権利関係・非提携声明・免責事項・ライセンス (Legal Notice, Disclaimer & License)

### 8-1. 既存の名称・商標との混同防止に関する声明 (Statement of Non-Affiliation)
- **日本語**: 本プロジェクト「KizunaMap (`kizunamap`)」は汎用的なブラウザ相関図作成ツールであり、特定のスマートフォンゲーム（『スタンドマイヒーローズ（スタマイ）』のキズナマップ、『18TRIP（エイトリ）』のきずなっぷ等）や第三者の既存の商標・サービスとは一切関係ありません。また、第三者のゲーム素材・ロゴ・キャラクター等は一切含まれていません。
- **English**: **KizunaMap (`kizunamap`)** is an independent, general-purpose browser correlation diagram tool. It is NOT affiliated with, endorsed by, or connected with any mobile games or third-party trademarks (such as "Kizuna Map" in *Stand My Heroes* or "Kizunap" in *18TRIP*).

### 8-2. 免責事項 (Disclaimer)
- **日本語**: 本ソフトウェアは「現状のまま（AS-IS）」で提供され、本ソフトウェアの使用・複製・改変・フォーク・運用によって生じたいかなる損害（データ消失、情報漏洩、クラウド利用料金の発生等を含む）についても、作者は一切の責任を負いません。全文は [DISCLAIMER.md](./DISCLAIMER.md) を参照してください。
- **English**: THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY ARISING FROM THE USE OF THIS SOFTWARE. See [DISCLAIMER.md](./DISCLAIMER.md) for full details.

### 8-3. ライセンス (License)
本プロジェクトは **[MIT License](./LICENSE)** の下で公開されています。使用しているサードパーティ製ライブラリのライセンス一覧については [DISCLAIMER.md](./DISCLAIMER.md) をご覧ください。

