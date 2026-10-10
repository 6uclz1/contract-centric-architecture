# Changelog

## Unreleased — 2026-10-10

Phase 2候補すべて（Contract差分レビュー、局所コンテキスト、Ruleとテスト対応、限定DB整合検査）を追加。`review`は検証済み旧・新Contractからプロパティ差分・生成物への影響をMarkdownで返す。`context`は種類別IDによる仕様抽出を行う。入力API・意味論・管理対象四ファイル・既存CLIのJSON診断配列は変更しない。新CLIのJSONは診断とMarkdownレポートのみで、公開IRを追加しない。

Markdownエスケープを一回の変換にし、縦棒用の文字参照の`#`を再エスケープして表示が壊れる問題を修正。Contractの意味には影響しない。実装範囲と未評価事項はdocs/phase2-plan.mdに記録。

Rule/testは`cca.dev/test-links/v1alpha1`の別manifestと、任意のVitest JSONのfile/fullName/statusで照合する。DBは`cca.dev/db-mapping/v1alpha1`のlogical snapshotと明示マッピングで型・NULL許可・unique・FK・多重度を検査する。これらは既存Contractを改変せず、物理実装の情報やテスト対応を推測しないための追加入力。requiredとNOT NULLの対応はDBマッピングの規約であり、Contract言語の意味変更ではない。未対応項目は警告またはエラー。専用診断、sample、仕様、テスト、CIの照合手順を追加した。自然言語Rule評価、SQL/TypeScript AST解析、live DB接続は追加していない。

ローカル実DB検証を追加。ComposeのPostgreSQL 17.11、手書きの物理fixture、read-only catalog adapter、起動/停止/live比較/物理制約確認のscriptsとopt-in DB統合テスト、CI手順を追加。実測catalogでsample tablesを完全置換し、明示マッピングだけを再利用する。非対応の物理定義はDB_LIVE_UNSUPPORTEDで拒否する。Contract入力の意味は変更せず、SQL生成やRule評価を追加しない。

## 0.1.0 — 2026-10-10

修正版計画の入力API `cca.dev/v1alpha1`を実装。入力仕様の意味を変更していない。

集合のRule参照重複はID_DUPLICATEとして拒否する。YAML directivesと明示標準tagも非対応YAMLとして拒否する。表示不能文字はSCHEMA_INVALID。これらは入力共通規約を具体化する実装判断。

空Contractではclass/stateにdirection宣言だけを出し、モデル要素や暗黙の遷移を追加しない。Mermaid 11.12.1の構文を満たすための描画上の処置。

コミット前レビューの修正: MermaidのER属性予約語（PK/FK/UK、大小文字違いとハイフン接尾辞を含む）を、衝突しない`cca_field_`別名へ変換し、コメント欄に元のIDを表示する。同じ接頭辞を持つ入力IDも変換する。入力言語のID制限は変更しない。enumの一覧表示は値ごとのJSON文字列形式へ変更し、カンマ・引用符・バックスラッシュ・改行を含む値の境界を保持する。enumの意味が変わった際にcheckで差分を検出できるようにした。
