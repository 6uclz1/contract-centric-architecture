# 入力項目と意味の対応表

仕様の正本は[実装計画](../cca-poc-v0.1-revised-plan.md)。すべてのobjectはstrictで、変換・未知キーの除去をしない。各トップレベル配列は必須、空配列は有効。

| 項目 | 必須項目 / 任意項目 | 意味・検証 |
| --- | --- | --- |
| apiVersion | cca.dev/v1alpha1 | 他の文字列はVERSION_UNSUPPORTED、型・欠落はSCHEMA_INVALID |
| metadata | id, name / description | ASCII IDとUnicode表示名、背景はdomain.md |
| Entity | id, name, fields / description | 同種ID一意、field IDはEntity内一意 |
| Field | id, type, required / description | string/integer/boolean/date/datetime、レコード実体は検証しない |
| enum Field | 上記 + values | 非空・重複なしの文字列集合。他の型にvalues不可 |
| state Field | 上記 + machine | required:true、Machine.entity/fieldと相互参照。他の型にmachine不可 |
| Relationship | id, name, from, to, targetsPerSource, sourcesPerTarget / description | Entity参照、静的多重度。所有権・物理FKは扱わない |
| Cardinality | min, max | min:0/1, max:1/many。from一件→toはtargetsPerSource、to一件→fromはsourcesPerTarget |
| State Machine | id, entity, field, states, initial, transitions / description | Entityにつき最大一つ、状態集合の唯一の正本 |
| Transition | id, from, to, command / description | IDはContract全体で一意。状態参照、Command.target一致。同一machine/from/commandの分岐不可 |
| Command | id, name, target, preconditions, postconditions, effects / description | 単一Entity対象、遷移なしCommandも有効 |
| Rule | id, kind, description, scope | precondition/postcondition/invariant。pre/postはentity scopeのみ |
| Scope | kind, id | entity/relationship別に参照を解決。Commandで利用するRuleはtarget一致 |
| Effect | id, kind, description | notificationのみ、IDはCommand内一意、通知意図のみ |
| Constraint | id, kind, entity, fields / description | uniqueのみ、非空・重複なし、requiredな通常フィールドのみ |

IDは`[A-Za-z][A-Za-z0-9_-]*`。State IDはMachine内で一意（STATE_INVALID）。enum値、unique fields、Rule参照、Effectsを含む配列は順序を持たない集合として正規化する。同じCommandのRule参照の重複はID_DUPLICATE。任意descriptionは意味の追加ではなく一覧の説明に使う。

YAMLは単一文書、文字列キーのみ。重複キー、anchor、alias、merge、明示tag、directiveをYAML_INVALIDで拒否する。診断は1始まりのプロパティキー位置（配列要素では値の位置）。SourceMapは入力パス索引と種類・スコープ付きID索引を保持し、IRや出力から分離する。

表示用文字列の改行は図では空白へ変換し、一覧では改行を保持する。図の構文記号はMermaidエンティティへ変換する。可視化できない制御文字・未対サロゲートは位置付きSCHEMA_INVALID。IDのハイフン等はノードIDのUTF-8 hex符号化で構文から隔離する。

型・構文段階で不合格の場合は参照段階へ進まない。ID重複時も解決を中断する。Rule本文、論理矛盾、DB index、業務データは評価しない。警告はSTATE_UNREACHABLE（条件を無視したグラフ到達性）とRULE_UNUSED（未使用pre/post）。

ER属性名ではMermaidがPK/FK/UK（大小文字違い・ハイフン接尾辞を含む）を予約するため、`cca_field_`＋元IDのUTF-8 hexの別名を使い、属性コメントに元のIDを表示する。実IDとの衝突防止のため`cca_field_`で始まる入力IDも同じ方式で変換する。enum値はcatalogでJSON文字列として引用・エスケープし、値内のカンマや改行と集合の区切りを区別する。
