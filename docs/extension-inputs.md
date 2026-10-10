# Phase 2候補の追加入力

既存`cca.dev/v1alpha1`のContractは変更しない。以下は明示的な対応宣言のための別ファイルで、Contractのimport、汎用DSL、実行Rule、公開IRではない。元Contractを検証した後に読み込む。追加依存はない。

## 共通規約

YAMLは既存入力と同じ解析器を使う。単一文書、文字列キー、未知キー禁止、重複キー・alias・anchor・merge key・tag・directive禁止。型変換・未知項目の除去はしない。各配列は明示必須。IDは`[A-Za-z][A-Za-z0-9_-]*`。表示文字列はUnicodeを許可するが既存Contractと同じ制御文字・不正surrogateの制限に従う。意味に順序がない集合はIDで比較し、レポートはASCII ID順、UTF-8/LFと終端改行一つ。

FKの`columns`と`references.columns`だけは対応する位置が意味を持つ。複合FKをsnapshot inventoryとして検証する際にこの対応を保つ。unique対象列・enum値は集合。空のトップレベル配列を許可し、未マッピングのContract要素は警告にする。

## Ruleとテスト

例: [expenses/test-links.yaml](../contracts/expenses/test-links.yaml)。

| 項目 | 型・意味 |
| --- | --- |
| apiVersion | `cca.dev/test-links/v1alpha1` |
| tests | `{id, file, title}`の配列 |
| tests.id | manifest内で一意のテストID |
| tests.file | `--root`に対する相対ファイル名 |
| tests.title | runner結果のfullName。describe階層を含む完全なテスト名 |
| links | `{rule, tests}`の配列。ruleはContract Rule ID |
| links.tests | テストIDの非空集合 |

同じRuleの重複link、test IDやfile/titleの重複、link内の同じtest参照の重複を拒否する。正規化パスとtitleが同じテストを別IDとして宣言することも拒否する。一つのテストを複数Ruleへ対応付けることは許可する。kindは推測せず元Contractから表示する。

テストファイルは存在する通常ファイルで、realpathがroot内部に収まることを確認する。絶対パス・root外への相対パス・root外へ解決するsymlinkは拒否する。root自体はユーザーが明示する。TypeScript AST解析や本文検索でテスト名の存在を推定しない。

`--results`省略時は対応宣言とファイル存在だけを検証し、テスト名の存在と実行は未検証と表示する。任意の`--results FILE`にはVitest JSONを指定できる。`testResults[].name`と`assertionResults[].fullName/status`を読み、残りのrunner metadataは解釈しない。JSON形状と既知statusを検証し、manifestのrealpath＋完全titleが一件に一致することを要求する。statusは`passed`のみ合格。failed/pending/todo/skipped/disabledは不合格。テストをこのコマンドから実行しない。結果の鮮度やContract revisionとの一致は保証しない。

経費精算の例は既存の構造・描画テストとの対応である。自然言語Ruleを業務データに対して検証するテストではない。全Ruleがlinkedでも業務上の正しさや意味的なテスト網羅性を保証しない。

## 限定DB整合検査

例: [expenses/db-mapping.yaml](../contracts/expenses/db-mapping.yaml)。これは経費精算に対応する説明用のlogical snapshotであり、実DBの introspection 結果ではない。

| 項目 | 型・意味 |
| --- | --- |
| apiVersion | `cca.dev/db-mapping/v1alpha1` |
| tables | `{id, columns, primaryKey, uniqueKeys, foreignKeys}`の配列 |
| columns | `{id, type, nullable}`。typeはstring/integer/boolean/date/datetime。enumのみvaluesの非空集合を追加 |
| primaryKey | `{id, columns}`またはnull。列は非空・重複なし・NOT NULL |
| uniqueKeys | `{id, columns}`の配列。列は非空・重複なし |
| foreignKeys | `{id, columns, references:{table, columns}}`の配列 |
| entities | `{entity, table, fields:[{field, column}]}`の配列 |
| relationships | `{relationship, owner:from\|to, table, foreignKey}`の配列 |
| constraints | `{constraint, table, key}`の配列 |

Table/column/FK IDはそれぞれのスコープ内で一意。primaryKeyとuniqueKeysのID名前空間はTable内で共通。参照列は存在し、FKは同数の列を対応付け、両側の型とenum値集合が一致し、参照先は宣言された全unique/primary keyであることを要求する。部分uniqueや式indexは表現できない。

Entity→Tableは一対一の明示マッピング。field→columnもEntity内で重複禁止。フィールド型と列型は一致させる。state型はMachineが持つ状態集合と一致するenumへ対応付ける。enumも値集合を完全一致で比較する。requiredとNOT NULLの対応はこのマッピングで採用する規約であり、Contract自体の意味にJSON nullやDB物理型の意味を加えない。

Relationshipは方向を保ち、`owner`がFKを持つ端点を明示する。owner側から相手は最大一件、owner側minとFK列のNULL許可を一致させる。相手一件に対するowner最大件数が1なら単一FK列のuniqueが必要、manyならその列のuniqueによる制限は不一致。最大一件の検査に複合uniqueは使わない。逆側min=1は通常のFKでは保証できないためDB_UNVERIFIED警告。両端のEntity→TableとFKのowner/参照Tableも一致させる。

Constraintは対応するEntityの全対象フィールドを列へ写像し、明示指定されたunique/primary keyの列集合と完全一致を要求する。subset/supersetを同値とはみなさない。FK用列はsnapshotに置き、Contract Entityへ関連IDフィールドを重複追加しない。

未マッピングのEntity/field/Relationship/Constraintとマッピング外のTableは警告。Entityが参照する追加の物理列・key・FKはinventoryの型/参照検査だけで、Contractへの一致は推測しない。型や参照が不正なinventoryから大量のmappingエラーを派生させない。

非対応: live DB、SQL/DDL解析、DB dialectごとの型・長さ・精度・collation、default、CHECK、部分/式index、generated column、cascade、trigger、migration、データ、複合FKによるRelationship・junction tableの多対多。こうした宣言を既知入力に未知キーとして追加すればSCHEMA_INVALID、既知複合FKをRelationshipへ対応付ければDB_MAPPING_INVALID。黙って検証済みにはしない。

## 診断と終了コード

| コード | 意味 |
| --- | --- |
| RULE_TEST_UNLINKED | Ruleに対応宣言なし（警告） |
| TEST_UNLINKED | testがどのRuleにも対応しない（警告） |
| TEST_FILE_INVALID | ファイル不在・非通常ファイル・root逸脱 |
| TEST_RESULT_MISSING | fullName/fileに一致する結果が0件または複数 |
| TEST_NOT_PASSED | supplied結果がpassed以外 |
| DB_SCHEMA_INVALID | snapshotの列・key・FK・enumの内部不整合 |
| DB_MAPPING_INVALID | mapping対象不在、endpoint不一致、非対応mapping |
| DB_TYPE_MISMATCH | 対応した型・enum/state値集合の不一致 |
| DB_NULLABILITY_MISMATCH | required/minとNULL許可の不一致 |
| DB_UNIQUE_MISSING | Constraintの対応unique key不在・列集合不一致 |
| DB_CARDINALITY_MISMATCH | FKと多重度上限の不一致 |
| DB_UNVERIFIED | 未マッピング・対応外Table・逆側min未検証（警告） |

既存のYAML_INVALID/SCHEMA_INVALID/VERSION_UNSUPPORTED/ID_DUPLICATE/REF_NOT_FOUND/FIELD_NOT_FOUND/IO_ERRORも使う。YAML診断は該当プロパティのファイル・行・列付き。Vitest JSON形状不正はresults fileを示し、行・列はnull。結果未一致などはmanifestの対象testを指す。

両CLIは既存のレポート系CLIと同じ`--format text|json`、`--warnings-as-errors`を持つ。JSONは`{diagnostics, report}`。不合格ではreportはnull。成功0、検証不合格・厳格警告1、引数/I/O不正3。`--out`は禁止、標準出力のみ。通常のvalidate/generate/checkはcompanionを暗黙に読まない。

## ローカルPostgreSQLのcatalog adapter

`pnpm db:up`でComposeのPostgreSQL 17.11を起動し、`pnpm db:live`でpublic schemaをカタログから取得できる。接続はCompose service内のpsqlを利用するため、ホストにPostgreSQL clientやNode DB driverは不要。read-only/repeatable-read transactionで一つのcatalog statementを実行する。DDL解析やContractからのSQL生成は行わない。

既存sample tablesは取得結果で全置換し、entities/relationships/constraintsの対応だけを再利用する。snapshotは`.artifacts/db-live.yaml`。列はpg_attribute/pg_type/pg_enum、indexはpg_index、FKはpg_constraintから読む。full valid/ready/immediate btree uniqueだけを採用し、INCLUDE列はunique対象列に含めない。検証済みNO ACTION/MATCH SIMPLEのpublic内FKだけを対応させる。FK列順は保持する。

logical型変換: text/varchar/bpchar→string、int2/int4/int8→integer、bool→boolean、date→date、timestamp/timestamptz→datetime、native enum→enumの値集合。長さ、整数範囲、timezone、collationの差はこの概念型の検査に含めない。対応するserver majorは17に固定する。

非対応型・domain/array、default/identity/generated、partial/expression/invalid/deferrable unique、非検証/deferrable FK、跨schema FK、cascade、CHECK/exclusion、user triggerや無効化trigger、RLS、view/partition/inheritanceなどはDB_LIVE_UNSUPPORTED（終了1）。live取得のI/O・Docker・SQLエラーは終了3。単純なpublicテーブル以外を黙って除外しない。非unique indexとpublic外のschemaは検査対象外とする。

`db:test`は七つの物理動作をtransaction内で検証し、SQLSTATEに加え対象column/constraint名を照合する。テストデータはROLLBACKする。`test:db`はcatalog比較、物理動作、三種の実DDL不整合、実partial index拒否を検証し、DDLはROLLBACKする。自然言語Ruleの成立、production DB、実データの全件検査とは扱わない。

catalog解釈の根拠はPostgreSQL公式の[pg_attribute](https://www.postgresql.org/docs/17/catalog-pg-attribute.html)、[pg_index](https://www.postgresql.org/docs/17/catalog-pg-index.html)、[pg_constraint](https://www.postgresql.org/docs/17/catalog-pg-constraint.html)、[pg_type](https://www.postgresql.org/docs/17/catalog-pg-type.html)。初回SQL/volume運用は[Postgres official image](https://hub.docker.com/_/postgres)の規約に従う。
