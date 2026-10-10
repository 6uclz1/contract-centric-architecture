# Changelog

## 0.1.0 — 2026-10-10

修正版計画の入力API `cca.dev/v1alpha1`を実装。入力仕様の意味を変更していない。

集合のRule参照重複はID_DUPLICATEとして拒否する。YAML directivesと明示標準tagも非対応YAMLとして拒否する。表示不能文字はSCHEMA_INVALID。これらは入力共通規約を具体化する実装判断。

空Contractではclass/stateにdirection宣言だけを出し、モデル要素や暗黙の遷移を追加しない。Mermaid 11.12.1の構文を満たすための描画上の処置。

コミット前レビューの修正: MermaidのER属性予約語（PK/FK/UK、大小文字違いとハイフン接尾辞を含む）を、衝突しない`cca_field_`別名へ変換し、コメント欄に元のIDを表示する。同じ接頭辞を持つ入力IDも変換する。入力言語のID制限は変更しない。enumの一覧表示は値ごとのJSON文字列形式へ変更し、カンマ・引用符・バックスラッシュ・改行を含む値の境界を保持する。enumの意味が変わった際にcheckで差分を検出できるようにした。
