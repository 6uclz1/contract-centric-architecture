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
