# Phase 2以降の実装範囲

2026-10-10。ユーザー指定によりv0.1計画の15章にある四候補すべてを扱う。既存Contractを変更せず、追加の対応宣言は専用ファイルに分ける。第三者評価によるGo判断は保留のまま、ユーザーの実装依頼による技術拡張として実施する。有用性の成功は主張しない。

## Phase 2: Contract差分レビュー

`cca review --before FILE --input FILE`。旧・新とも既存パイプラインで検証し、ASCII ID順の正規化モデルを比較する。メタデータ、Entity/field、Relationshipの方向・多重度、Machine/state/transition、Command/pre/post/effect、Rule/scope/本文、Constraintを対象とする。ID変更は削除と追加。IDを持つ配列はIDで対応付け、集合の入力順だけの変更は差分にしない。

Markdownにプロパティ単位の変更前後、既存四Generatorを実際に比較した変更ファイル名、双方の警告を出す。本文中の矛盾、破壊的変更判定、移行の安全性は推論しない。JSONは`{diagnostics, report}`で、reportはMarkdown文字列。IRを公開しない。

## Phase 3: Agent向け局所コンテキスト

`cca context --input FILE --kind KIND --id ID`。kindはentity/relationship/machine/command/rule/constraint。種類別索引で解決し、存在しない対象はREF_NOT_FOUND。

選択規則:

1. rootそのもの。
2. rootがEntityなら直接関係するRelationship、Machine、Command、Constraint、invariant。Relationshipならscopeのinvariant。Commandならそれを参照するMachine。Ruleならそれを適用するCommand。
3. 選択した定義の参照先を閉包まで追加する。Relationshipの両端Entity、Commandのtargetとpre/post Rule、MachineのEntityと全TransitionのCommand、Ruleのscope、ConstraintのEntity、Entityのstateフィールドが参照するMachineを含める。

定義は省略・書換えせず全体を保持し、近隣要素からの逆参照はさらに展開しない。Machine全体の保持で他Commandが入る場合がある。rootが中心的なEntityならモデル全体が選択される場合もある。全文保証やトークン上限は設けない。

既存catalog生成器からMarkdownを出す。これは閲覧補助であり、再入力できるContractや公開IRではない。警告は元Contract全体のものと明示する。未選択の関係やinvariantが存在し得るため、実装判断時には全Contractも確認する。

## CLI共通

入力は明示必須、出力ファイルは作らず標準出力へレポートを返す。`--out`は禁止。`--warnings-as-errors`と`--format text|json`に対応する。reviewは差分ありでも成功0（checkの同期差分終了2とは用途が異なる）。検証不合格・厳格警告・context対象不在は1、引数やI/O不正は3。既存validate/generate/checkのJSON配列形式、管理対象四ファイル、入力APIと意味は変更しない。

## Ruleとテストの対応

`cca test-links --input FILE --links FILE --root DIR [--results FILE]`。専用manifestでRule IDとテストIDを結び付け、参照、重複、ファイル存在とroot内への解決を検証する。未対応Rule・未使用testは警告。任意のVitest JSONを指定すればfile/fullName/statusを照合する。宣言だけの場合はテスト名と実行が未検証であることを示す。sampleは構造・描画テストへの対応であり、自然言語Ruleの評価を追加しない。

## 限定DB整合検査

`cca db-check --input FILE --db FILE`。専用logical schema snapshotとEntity/field/Relationship/Constraintの明示マッピングを検証する。型・enum/state集合・NULL許可・unique・FK参照・FK所有側と多重度を比較する。逆側min、未マッピング要素は警告。経費精算のsnapshotは説明用で、実DBの状態とは主張しない。

両方の入力仕様、非対応範囲、診断コードは[extension-inputs.md](extension-inputs.md)に固定した。既存の入力APIに変更はなく、入力schema snapshotは公開IRではない。

## 検証と未実施事項

CIにVitest JSONの生成、Rule/test照合と厳格DB検査を追加。通常のvalidate/generate/checkの契約は維持する。ローカルPostgreSQLのCompose起動・catalog adapter・物理制約確認も追加（README参照）。第三者有用性評価、性能測定、リモートCIは未実施。自然言語Rule評価、業務アプリ、汎用DSL、形式証明は対象外。
