# 権利関係・非提携声明および免責事項 / Legal Notice, Non-Affiliation & Disclaimer

---

## 🇯🇵 日本語 (Japanese)

### 1. 既存の名称・商標との混同防止に関する声明（非提携ステートメント）
本プロジェクト「**KizunaMap (kizunamap)**」は、組織・プロジェクトにおける人物、グループ、所属、役割（ロール）、スキル、および関係性を整理・可視化するための**汎用的なブラウザ相関図作成オープンソースツール**です。

「KizunaMap（キズナマップ）」という名称は、「絆（Kizuna：人と人とのつながり）」と「図（Map）」を組み合わせた一般的な造語として採用したものであり、以下の製品・サービス・機能をはじめとする**特定のスマートフォンゲーム、アニメ、エンターテインメント作品、または第三者の既存の商標・サービスとは一切関係ありません（非公式・非提携）**。

- スマートフォン向けゲーム『スタンドマイヒーローズ（スタマイ）』（株式会社coly）内の機能「キズナマップ」
- スマートフォン向けゲーム『18TRIP（エイトリ）』（株式会社リベル・エンタテインメント／株式会社ポニーキャニオン）内の機能「きずなっぷ」
- その他、「キズナ」「きずな」「マップ」等の名称を含む一切の他社ゲーム、アプリケーション、および関連サービス

本ソフトウェアおよび本リポジトリは、上記のいかなる企業・権利元からも承認、後援、または提携を受けたものではありません。また、本リポジトリには第三者のゲームアセット、ロゴ、キャラクター、固有表現などの著作物は一切含まれていません。文脈中に言及される第三者の製品名・サービス名は、混同防止の説明目的でのみ記載されており、各々の権利者に帰属します。

### 2. 免責事項（Disclaimer）
1. **現状有姿（AS-IS）での提供**  
   本ソフトウェアおよび関連ドキュメントは「現状のまま（AS-IS）」で提供され、明示であるか黙示であるかを問わず、商品性、特定目的への適合性、正確性、信頼性、および第三者の権利の非侵害についての保証を含め、いかなる保証も行われません。
2. **損害に対する責任の制限**  
   作者または著作権者は、契約行為、不法行為、またはそれ以外であるかを問わず、本ソフトウェアまたは本ソフトウェアの使用・複製・改変・フォーク・公開・運用に関連して生じたいかなる請求、損害、その他の責任（データの消失、機密情報の漏洩、業務の中断、クラウドサービス［Firebase等］の利用料金の発生・無料枠超過、第三者との紛争を含みますがこれらに限定されません）についても、一切の責任を負いません。
3. **利用者によるデータ管理の責任**  
   本ツールを用いて作成・公開・共有される相関図データや個人情報の取り扱い、およびデプロイ先環境（Firebaseプロジェクト等）のセキュリティ設定・課金管理については、本ツールを利用・運用するユーザー自身の責任において行われるものとします。

---

## 🇺🇸 English

### 1. Statement of Non-Affiliation & Trademark Clarification
**KizunaMap (`kizunamap`)** is an independent, general-purpose, open-source web application designed for creating and managing organizational and interpersonal correlation diagrams (people, groups, memberships, roles, skills, and relationships) in the browser.

The name "KizunaMap" is a generic combination of the Japanese word *"Kizuna"* (meaning bond or connection) and *"Map"*. **This project is NOT affiliated with, endorsed by, sponsored by, or in any way officially connected with any existing video games, mobile applications, entertainment franchises, or third-party trademarks**, including but not limited to:

- The "Kizuna Map" (キズナマップ) feature in the mobile game *Stand My Heroes* (スタンドマイヒーローズ) by coly Inc.
- The "Kizunap" (きずなっぷ) feature in the mobile game *18TRIP* (エイトリ) by Liber Entertainment Inc. / Pony Canyon Inc.
- Any other third-party games, services, or products bearing similar names.

No proprietary assets, logos, character data, or copyrighted materials from any third-party games or services are used or distributed in this repository. Any third-party product or company names mentioned herein are used strictly for identification and disambiguation purposes and are the property of their respective owners.

### 2. Disclaimer of Warranty and Limitation of Liability
1. **Provided "AS IS"**  
   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, ACCURACY, AND NONINFRINGEMENT.
2. **No Liability for Damages**  
   IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT, OR OTHERWISE, ARISING FROM, OUT OF, OR IN CONNECTION WITH THE SOFTWARE OR THE USE, FORKING, MODIFICATION, DEPLOYMENT, OR OTHER DEALINGS IN THE SOFTWARE (INCLUDING, WITHOUT LIMITATION, DATA LOSS, PRIVACY/SECURITY BREACHES, BUSINESS INTERRUPTION, CLOUD SERVICE BILLING/QUOTA OVERAGES SUCH AS FIREBASE, OR DISPUTES WITH THIRD PARTIES).
3. **User Responsibility**  
   Users who deploy, fork, or operate this software are solely responsible for managing their own cloud infrastructure (e.g., Firebase projects, security rules, and billing settings) and for ensuring that any personal or organizational data entered into the tool complies with applicable privacy and data protection laws.

---

## 3. 使用しているサードパーティ製ライブラリとライセンス一覧 / Third-Party Open Source Licenses

本ソフトウェアは以下のオープンソースソフトウェア（OSS）を利用しています。各ライブラリの著作権者に感謝いたします。

| Package | License | Repository / Copyright |
| :--- | :--- | :--- |
| `react`, `react-dom` | MIT | Copyright (c) Meta Platforms, Inc. and affiliates. |
| `@xyflow/react` | MIT | Copyright (c) webkid GmbH |
| `dagre` | MIT | Copyright (c) Chris Pettitt |
| `firebase` | Apache-2.0 | Copyright Google LLC |
| `lucide-react` | ISC | Copyright (c) Cole Bemis & Lucide Contributors |
| `html-to-image` | MIT | Copyright (c) Bubkoo |
| `yaml` | ISC | Copyright Eemeli Aro <eemeli@gmail.com> |
| `clsx` | MIT | Copyright (c) Luke Edwards |
| `tailwind-merge` | MIT | Copyright (c) Dany Castillo |
| `tailwindcss`, `@tailwindcss/vite` | MIT | Copyright (c) Tailwind Labs, Inc. |
| `vite`, `@vitejs/plugin-react` | MIT | Copyright (c) Evan You & Vite Contributors |
| `typescript` | Apache-2.0 | Copyright Microsoft Corporation |
| `vitest`, `jsdom` | MIT | Copyright (c) Anthony Fu & Contributors |
| `@testing-library/react`, `@testing-library/jest-dom` | MIT | Copyright (c) Kent C. Dodds & Contributors |
| `@firebase/rules-unit-testing`, `firebase-tools` | Apache-2.0 / MIT | Copyright Google LLC |
