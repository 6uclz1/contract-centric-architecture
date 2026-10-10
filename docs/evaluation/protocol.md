# 比較実験プロトコル（実施前に固定）

対象は設計理解と変更レビューの支援。技術成立と人間にとっての有用性を分けて判断する。

## 条件・閲覧入口

A: [手書きMarkdown](baseline/model.md)と手書きMermaid三図（同ディレクトリ）。Rule・Effect・Constraintを含む同じ構造化情報を持つ。
B: `contracts/expenses/contract.yaml`、`docs/generated/expenses/`の三図とcatalog。理解課題は図とcatalogを入口とし、YAML閲覧回数を記録する。
両条件に同じ`contracts/expenses/domain.md`を提供する。

同じMermaid 11.12.1とChromium 141（Playwright 1.56.1）で閲覧する。見やすさのための拡大縮小は両条件とも許可。ER点線は識別関係判定に使わず、物理PK/FK/UKを表示しない。クラス図のCommandは独立概念、状態図はMachine区画・明示initialのみ。終端ノードや暗黙遷移を付加しない。表示名の改行は図中で空白、一覧で改行とする。

第三者目安4名、参加者の匿名ID・経験・実数を記録する。2名はA→B、2名はB→A。タイムアウトは課題ごと10分。採点基準と正答は回答後まで見せない。同じ問題の答えを覚える影響を避けるため、変更課題では同等難度の別変更を割り当て、条件と変更の対応を交差する。理解課題には順序による学習が残るため結果の限界として記録する。

## 理解課題（各1点、5点満点）

| 問題 | 採点基準 |
| --- | --- |
| 承認可能な操作者は誰か | 承認権限を持ち、申請者本人でない |
| 却下後に再申請できるか | 基準モデルに遷移はない |
| paidでPaymentなしは要求に適合するか | EXP-006違反。ただしツールが実データを検出するわけではない |
| 一申請にPaymentを二件持てるか | 宣言上不可。DB強制は未確認 |
| validate成功が保証すること | 入力構造・参照・定義済み整合性のみ。Ruleの正しさ・実装適合は含まない |

各回答について得点・時間・根拠場所・YAML閲覧回数・重大な誤認を記録。実装や配送・DB保証があると思った回答を重大な誤認に分類する。

## 変更レビュー課題

1. Rule適用先削除: ApproveExpenseからEXP-001を外す（対になる変更はRejectExpenseからEXP-002を外す）。業務上の意味の変化、未使用Rule警告、波及先を説明する。警告は業務違反の自動判定ではない。
2. 本文との不整合: ExpensePaymentのtargetsPerSource.maxをmanyにし、EXP-004の最大一件という本文を残す。構造検証は成功する。対になる変更は静的targetsPerSource.minを1にしてdraftでも支払記録必須にし、RecordPaymentの背景を残す。不整合を人間が発見する課題。
3. 通常変更: rejected→submittedを既存SubmitExpenseで追加（対になる変更はrejected→draftを新Commandで追加し、条件を一つ付ける）。更新開始から図・一覧の更新完了までを測る。異なる変更の難度の差も記録し、単純に時間比較しない。

無害な通常フィールド説明変更を対照として混ぜ、誤検出も記録する。参加者には各変更の差分と背景を示す。正答は非公開の採点欄として運営者が保持する。AはMarkdownと手書き図を更新、BはYAML変更とgenerateを実行する。ツール構築時間と通常変更時間を分ける。

## 指標・記録

[observations.csv](observations.csv)に各試行を記録。理解得点、回答時間、重大な誤認、誤り発見/誤検出、レビュー時間、更新時間、手作業回数、更新漏れ、YAML閲覧回数、無関係な生成物変更数/全変更数、Generator/Schema変更回数・理由を残す。初期構築費用は別記する。回答者・値は実測のみ。

## 技術変更実験

`pnpm test`で以下を個別assertionとして実施する。期待対象外のファイル変更は0を要求する。

| 変更 | 期待差分 |
| --- | --- |
| rejected→submitted | state/catalog |
| 新Command+pre+遷移 | class/state/catalog |
| 通常フィールド追加 | model/class/catalog |
| 多重度変更 | model/class/catalog |
| Rule本文 | catalog |
| Rule関連付け削除 | state/catalog、必要ならRULE_UNUSED |
| 全集合並べ替え | 差分なし |
| 未定義Rule | REF_NOT_FOUND、既存出力保持 |
| Payment 0..manyで本文据え置き | validate成功、人間レビュー対象 |
| 未到達状態 | STATE_UNREACHABLE、厳格モード失敗 |
| 生成省略/欠落/余剰 | check終了2、非変更 |

手書き期待参照は`tests/expected/`。実装出力から正解を採取しない。多重度表は0..1、1..1、0..many、1..manyの左右記号とclassの数字を検証する。CIではgenerateの前処理を行わずcheckする。

## 事前判断基準

- 技術Go: M1〜M3の必須検証が成功。
- 継続候補: Bの理解得点・業務誤り発見率がA以上、重大な誤認増なし、レビュー時間中央値20%以上短縮または発見率20ポイント以上改善。
- 再設計: 誤認増、理解低下、単純変更でGenerator修正が反復、YAML精読が常態化。
- 優位性未確認: 技術Goだが有用性基準未達。図生成ツールとして残せるが仮説実証と呼ばない。
- 未評価: 参加者不足・比較未実施。有用性成功やPhase 2への根拠を主張しない。

統計的優位性の証明ではない。Phase 2は結果を見て選び、自動的に形式証明や汎用言語化へ進めない。
