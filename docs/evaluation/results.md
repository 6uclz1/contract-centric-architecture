# 検証・評価記録

実施日: 2026-10-10。実施者: Codex。環境: macOS ARM64 / Node 24.19.0 / pnpm 11.25.0 / Mermaid 11.12.1 / Playwright 1.56.1 / Chromium 141.0.7390.37。

## 実装と技術結果

M0〜M3の成果物を実装済み。基準YAML、入力対応表、手書き期待仕様、異常fixture、YAML/strict Zod/SourceMap、参照・意味検証、警告、正規化IR、四Generator、CLI、出力保護、README、AGENTS、CI定義を揃えた。

| 実行した検証 | 実測結果 |
| --- | --- |
| pnpm install --frozen-lockfile | 成功、lockfile更新なし |
| pnpm typecheck | 成功 |
| pnpm test | 4ファイル、100件すべて成功 |
| pnpm validate | 成功、基準モデル警告なし、warnings-as-errors有効 |
| pnpm check | 成功、四生成物のバイト一致 |
| pnpm render | 成功、ER/class/stateのSVG/PNG生成 |
| GitHub Actions | 定義済み、リモートCI実行は未実施 |

ローカルでCIと同じ検査順を実施した。CI上の成功とは主張しない。描画確認ファイルは`.artifacts/render/`（gitignore対象）にあり、READMEの手順で再生成できる。

## 三図の描画確認

固定Mermaidの構文検査に加え、生成した三PNGを目視確認した。

- ER: Expense/User/Payment、全9フィールドを表示。申請者と承認者の二線を区別できる。ExpensePaymentはPayment側0..1、Expense側1。物理PK/FK/UK表示なし。点線の意味を一覧で説明。
- Class: Entityと独立した四Commandのステレオタイプ、target線、全フィールドを表示。関連の役割名と両端多重度を確認。基準図で文字の重なりなし。
- State: ExpenseLifecycle区画内、draftが初期、明示された四遷移のみ。承認pre EXP-001/002、post EXP-003を表示。paid/rejectedの出辺・終了ノードなし。invariantを遷移条件に混ぜない。
- 読みやすさ: ER/classは基準モデルで判読可能。状態図は長いRule付きラベルが複数行に折り返され、IDが途中で折り返される場合もある。拡大表示とcatalog併用で確認できる。座標・配置の安定性や大規模モデルでの読みやすさは保証しない。
- 改行、引用符、括弧、HTML記号、日本語、予約語を含む表示名、および複数Machine・hyphen/underscore IDも描画テストに成功。HTML script挿入なし。

## 技術変更実験

tests/generation.test.tsとintegration/cli.test.tsで実行。計測は差分集合と挙動のassertionであり、人間の作業時間・生産性は測っていない。

| シナリオ | 観測結果 |
| --- | --- |
| rejected→submittedを既存Commandで追加 | state/catalogのみ変更 |
| 新Commandとprecondition、遷移追加 | class/state/catalogのみ変更 |
| 通常フィールド追加 | model/class/catalogのみ変更 |
| 多重度変更 | model/class/catalogのみ変更 |
| Rule本文のみ変更 | catalogのみ変更、check終了2 |
| Rule関連付け削除 | state/catalog変更、RULE_UNUSED警告 |
| 入力集合の順だけ反転 | IR・四出力完全一致 |
| 未定義Rule | REF_NOT_FOUND、generate終了1、既存成果物非変更 |
| Payment 0..many、EXP-004据え置き | 構造検証成功。意味的不整合の自動判定なし |
| 未到達状態追加 | STATE_UNREACHABLE、通常成功・厳格モード終了1 |
| 生成省略・不足・余剰・内容変更 | check終了2、検出のみで修復・削除なし |
| 出力symlink・祖先symlink・管理ファイルsymlink | 終了3、対象を更新しない |

期待されない生成ファイル変更は各変更シナリオで0。全変更生成ファイル数は上表の列挙数。Schema/Generator変更回数や初期構築費用、人間の更新時間は記録していない。開発中のテスト修正と人間比較実験の値を混同しない。

## コミット前レビューの回帰検証

- ER予約語PK/FK/UK、大小文字違い、ハイフン接尾辞、別名接頭辞を持つIDについて13ケースの描画テストが成功。元IDは属性コメントで保持する。元IDと別名の衝突防止も個別検証。
- enumのカンマ・引用符・バックスラッシュ・改行・空文字の境界を検証。`["a, b", "c"]`から`["a", "b, c"]`への変更をcatalog差分としてcheckが終了2で検出し、再生成後は成功する。単なる並べ替えは差分なし。
- 修正前に追加した14件の回帰テストはすべて失敗、修正後に追加確認を含めて全100件成功。

## 人間による有用性評価

**有用性評価未実施**。第三者参加者0名。回答、時間、誤認、発見率、中央値、性能値は未計測。

[protocol.md](protocol.md)、同じ業務情報を持つ[手書きベースライン](baseline/model.md)と三図、[observations.csv](observations.csv)の記録欄を用意済み。第三者評価のデータ欄は空のままにする。

| 判断対象 | 状態 |
| --- | --- |
| ローカル技術成立（M1〜M3の検証条件） | 成功・技術Go |
| 人間の理解・業務誤り発見・変更レビュー支援 | 未評価 |
| CCA中心仮説の採択 | 保留 |
| Phase 2の有用性に基づくGo判断 | 保留 |

技術成立を有用性実証へ読み替えない。比較実験の後に継続・再設計・優位性未確認を判断する。

## 保証しないこと

自然言語Ruleの意味・成立可能性・矛盾、実データ、アプリケーション・DBの強制、送金・通知配送、支払記録と状態更新の原子性、Agent生産性、形式証明、仕様と実装の意味的一致。出力のテキスト決定性は検証済みだが、Mermaid座標・配置の決定性は保証しない。

## 第三者実施後の追記欄

- 参加者数・経験・条件順序: 未記録
- 条件A/Bの得点・回答時間・重大な誤認: 未記録
- 業務誤り発見率・誤検出率・レビュー中央値: 未記録
- 更新時間・手作業・更新漏れ・YAML閲覧回数: 未記録
- 初期構築費用と通常変更費用: 未記録
- Generator/Schema変更回数・理由: 未記録
- 事前基準との比較、結論、制約: 未記録

## Phase 2・3の技術拡張の検証

2026-10-10、同じローカル環境で実施。対象範囲は[phase2-plan.md](../phase2-plan.md)。Contract差分レビューと局所コンテキストのCLI、型付き内部処理、README、変更履歴を追加した。既存Contractの入力意味は変更していない。

- `pnpm typecheck`: 成功。
- `pnpm test`: 5ファイル・109件成功。新規9件は、入力集合の順序不変、プロパティ差分と生成ファイルの影響、Relationship多重度の方向、field/transition/effect変更、contextの種類別解決・参照閉包・無関係な逆参照の除外、Markdownエスケープ、CLI引数・双方の入力検証・厳格警告・ファイル非作成、JSON形式を検証。
- 既存のMermaid構文・描画テスト23件も成功。
- `pnpm validate`: 基準Contractが厳格モードで成功。
- `pnpm check`: 既存四生成物のバイト一致。
- `git diff --check`: 成功。

局所コンテキストがAgentの生産性を上げること、差分レポートが人間のレビュー時間を短縮することは測定していない。第三者有用性評価とリモートCIは引き続き未実施。Ruleとテストの対応、DB整合検査は未実装候補。

## Phase 2候補すべてへの拡張

2026-10-10。ユーザーの範囲指定により、上記二項目に加えてRuleとテストの対応、限定DB整合検査も実装した。先の「未実装候補」の記載は初回拡張時点の状態であり、この節で更新する。

実装成果物: strictな専用manifest/snapshot schema、既存YAML解析器とSourceMapの共通化、対応参照・重複検証、root内の通常テストファイル検証、任意のVitest JSONによるfile/fullName/status照合、DB field型/enum/state/NULL許可、Constraintのunique列集合、FK参照・所有端点・多重度の照合。未マッピング項目とFKで保証できない逆側minを警告する。経費精算のsample二ファイル、追加入力仕様、CLI/README/CHANGELOG、CI手順を追加した。

| ローカルで実行した検証 | 実測結果 |
| --- | --- |
| pnpm typecheck | 成功 |
| pnpm test:report | 6ファイル・170件成功、Vitest JSON出力 |
| pnpm validate | 基準Contractが厳格モードで成功 |
| pnpm check | 四生成物のバイト一致 |
| pnpm traceability --results .artifacts/test-results.json | 成功、宣言された2テストのfile/titleとpassed結果を照合 |
| pnpm db:check | 説明用snapshot/mappingが厳格モードで成功 |
| git diff --check | 成功 |

新規のextensions.test.tsは61件。FKのownerをfrom/toと明示する両方向で、owner側min 0/1、逆側min 0/1・max 1/manyを組み合わせて検証。欠落unique、複合uniqueで単列uniqueを代用しないこと、未マッピング、逆側最低参加数の警告、Rule/state参照、schema不正からの派生診断抑制、非対応partial index・複合Relationship FK、結果の不在/重複/不合格、root逸脱・symlink・同一testの別名、ソース位置、JSONとファイル非作成も検証した。

sample test-linksは構造・描画テストへの対応であり、6 Ruleの自然言語要件を業務データに対して評価したとは主張しない。DB snapshotは説明用の宣言であり実DBは存在せず、SQL物理型やFK/uniqueの本番での強制は確認していない。Vitest結果の鮮度をCLIが保証するものではない。第三者有用性評価、性能測定、リモートCI実行は引き続き未実施。

## コンテナのローカル実DB検証

2026-10-10、ユーザーのローカルDB検証依頼に対応。従来の説明用snapshotに加え、実際にPostgreSQLコンテナを起動して検証した。先の「実DBは存在せず」の記載はsnapshot段階の状態であり、この節で更新する。

実測環境: macOS ARM64、Colima 0.10.3 / Lima 2.2.1、Docker CLI 29.9.0、Compose 5.6.0。Colimaの専用profile `cca`とDocker context `colima-cca`を作成し起動。PostgreSQL **17.11 (Debian 17.11-1.pgdg12+2)** / aarch64、image `postgres:17.11-bookworm`、取得image digest `sha256:3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826`。サービス`cca-poc-local-db-1`がhealthy、ホスト公開は`127.0.0.1:55432`。

| 実行したローカル検証 | 実測結果 |
| --- | --- |
| pnpm db:up | 成功、実コンテナがhealthy |
| pnpm typecheck | 成功 |
| pnpm test:report | 185件成功、DB専用6件は明示skip |
| pnpm test:db | 実DB専用6件成功 |
| pnpm validate / pnpm check | 成功、既存Contractと四生成物は一致 |
| pnpm db:live | read-only実カタログとContract/mappingの比較成功 |
| pnpm db:test | 七つの物理制約動作確認成功、probeデータ全ROLLBACK |
| pnpm traceability --results .artifacts/test-results.json | 成功 |
| git diff --check | 成功 |

実カタログから3テーブル・12列（Contractの9列とFK用3列）、PK3件、full unique2件、FK3件、enum5状態を取得し、`.artifacts/db-live.yaml`を出力した。説明用snapshotのtablesは全置換し、明示マッピングだけを使用した。

物理動作の七項目: approver=NULLを許可、amount_jpy=NULL拒否、未定義state拒否、orphan Payment FK拒否、expense_id=NULL拒否、同一Expenseへの二件目Payment拒否、receiptNumber重複拒否。対象SQLSTATEとcolumn/constraint名も照合する。全probeは一transactionでROLLBACKし、probe Userが0件であることを確認した。

実DDL変更をtransaction内で行い、expense_unique削除はDB_CARDINALITY_MISMATCH、receipt_unique削除はDB_UNIQUE_MISSING、expense_id NOT NULL解除はDB_NULLABILITY_MISMATCHで検出。実partial unique indexはDB_LIVE_UNSUPPORTEDで拒否。各変更をROLLBACKした後に通常のlive比較が再び成功することを確認した。

CIにも起動・live検査・物理probe・統合テスト・停止を追加したが、リモートCIは未実行。第三者有用性評価と性能測定は未実施。実DB検証はこの手書きfixtureと対応範囲に限り、自然言語Ruleや業務アプリの適合、production DBの状態を保証しない。ローカルDBは引き渡し時に起動中、named volumeを保持している。
