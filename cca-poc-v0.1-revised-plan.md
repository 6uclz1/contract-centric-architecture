# CCA PoC v0.1 — 修正版実装計画

作成日：2026-10-10  
Status：実装引き渡し用。M0で本書の具体例をfixture化した後、M1以降へ進む。  
種別：Architecture Experiment / Technical RFC  
Stack：TypeScript / Node.js / pnpm / YAML / Zod / Mermaid / Vitest

## 1. 目的と位置付け

構造化Contractを正本として、業務モデルの構造検証と人間向け設計ビューの生成を行う小さなツールを実装する。

中心仮説は「Entity・Relationship・Command・State・Ruleの関連を一つの構造化モデルで管理し、図と仕様一覧を生成すれば、人間の設計理解と変更レビューを支援できる」である。

CCAは今回の仮称であり、Clean ArchitectureやDDDの代替を主張しない。Phase 1の成果物は、アプリケーション全体のアーキテクチャではなく、業務モデルの構造検証・設計ビュー生成ツールである。Schema-first / Model-Driven Engineeringに近い実験として扱う。

成功を二段階で判断する。

1. 技術成立性：参照検証・決定的生成・同期チェックが機能する。
2. 有用性：第三者の理解・業務上の誤り発見・変更レビューを支援する。

技術成立性だけで中心仮説を採択しない。Agent生産性、業務ロジックの正しさ、本番実装への制約の強制はPhase 1で実証しない。

## 2. 実装スコープ

### 実装するもの

- 経費精算の単一Contract YAML。
- YAML構文検証、Zodによる入力検証、参照・限定的な意味検証。
- 内部専用の型付きIR。
- 論理ER図、概念クラス図、状態遷移図。
- Rule・Effect・Constraintと適用先を確認できるcatalog.md。
- validate / generate / checkのCLI。
- 固定fixture、生成差分、Mermaid構文検証、代表図の描画確認。
- 手書きMarkdown＋Mermaidとの比較実験手順と記録用ファイル。

### 実装しないもの

- 業務アプリケーション、UI、実DB、送金処理。
- TypeScript / SQL / Migrationの生成やAST解析。
- 自然言語Ruleの評価、任意式、独自評価エンジン。
- Lean / TLA+による証明、仕様と実装の意味的一致判定。
- Contractのimport、継承、拡張プラグイン、公開IR形式。
- 階層・並列状態、タイマー、条件分岐の実行意味論。
- Relationshipと物理外部キー・unique indexとの対応検証。
- 部分図選択UI、クラウドサービス、モノレポのパッケージ分割。

## 3. 正本と生成パイプライン

| 情報 | 正本 |
|---|---|
| 業務背景、意図、設計判断、例外の説明 | domain.md |
| Entity / Relationship / Command / Rule等の定義 | contract.yaml |
| 機械処理用モデル | メモリ上の内部IR。手動編集・公開しない |
| 図と構造化仕様一覧 | IRからの生成物 |
| 将来の実装詳細 | TypeScript / SQL等。Phase 1では存在しない |

パイプライン：YAML文書解析 → 入力検証 → 参照解決・意味検証 → 正規化IR → 図・一覧の生成 → 出力。

すべてのGeneratorは検証済みIRだけを受け取る。Generatorごとの参照解決やYAML再解釈は禁止する。

内部IRを置く理由は、検証と正規化を一度で済ませ、複数の出力に同じ意味を渡すためである。公開フォーマットの互換性維持は行わない。

## 4. Contractの意味論

### 4.1 入力共通規約

- apiVersionはcca.dev/v1alpha1のみ受理する。ツールのv0.1と入力APIバージョンは別物。
- トップレベルはapiVersion / metadata / entities / relationships / stateMachines / commands / rules / constraints。
- 各トップレベル配列は必須。空配列は許可する。
- 未知キー、未知enum値、非対応apiVersionはエラー。暗黙の除去・型変換は行わない。
- YAMLは単一文書のみ。重複キー、alias、anchor、merge key、カスタムtagは非対応としてエラー。
- 各定義にidを持たせ、表示名はnameで分離する。説明はdescription。
- 定義IDはASCIIの[A-Za-z][A-Za-z0-9_-]*。同種定義内で一意。
- フィールドIDはEntity内、状態IDはState Machine内、Effect IDはCommand内で一意。Transition IDはContract内で一意。
- 参照は種類を区別して解決し、違う種類の同名IDに誤解決しない。
- 表示名・説明はUnicodeを許可。Mermaid構文として直接挿入しない。
- v0.1中の入力変更は意図的な破壊的変更として変更履歴に残す。自動Migrationは作らない。

### 4.2 Entityと型

Entityはid、name、fieldsを持つ。各フィールドはid、type、requiredを必須とし、descriptionは任意。

型は次に限定する。

| 型 | 宣言上の意味 |
|---|---|
| string | 文字列 |
| integer | 整数。金額はJPY単位の整数として本例で使用 |
| boolean | 真偽値 |
| date | 日付という概念型 |
| datetime | 日時という概念型 |
| enum | valuesに列挙した文字列集合 |
| state | 指定State Machineの状態集合を参照 |

enumだけがvaluesを、stateだけがmachineを持つ判別共用体にする。その他の型へのこれらの指定はエラー。配列・union・ネストしたobject・任意の型名は非対応。

required:falseは「値を持たない状態を許す」という概念上の意味に限定する。JSONのnullと欠落、DB NULLの違いは定義しない。レコード実体の型検証や整数範囲・日時形式の検証は実装しない。

Relationshipを正本として関連を宣言する。関連用のexpenseId / applicantIdなどを重複定義しない。Entity自身のidフィールドは例として持たせるが、これだけで物理PKが保証されるとは扱わない。

### 4.3 Relationshipと多重度

Relationshipはid、name、from、to、targetsPerSource、sourcesPerTargetを持つ。from / toはEntity ID。

- targetsPerSource：from一件に対するtoの件数。
- sourcesPerTarget：to一件に対するfromの件数。
- 件数表現はminが0または1、maxが1またはmany。対応する組は0..1 / 1..1 / 0..many / 1..manyのみ。
- 多重度はすべての有効な業務状態にわたって成立させたい静的な制約。
- 状態に依存する必須性は別Ruleとして記述し、静的多重度から推測しない。
- 関連の所有権、カスケード削除、物理FK、識別関係は定義しない。

Expense → PaymentではtargetsPerSource=0..1、sourcesPerTarget=1..1とする。最大一件はこのRelationshipが構造上の正本。Rule EXP-004はこの関連を参照する説明であり、独立したunique制約を追加しない。

### 4.4 State MachineとTransition

State Machineはid、entity、field、states、initial、transitionsを持つ。

- Entityごとに最大一つ。
- fieldは対象Entityのrequired:trueかつtype:stateのフィールドを指す。
- そのフィールドのmachine参照はState Machine自身と一致する。
- 状態集合はState Machineだけが所有する。state型のフィールドは集合を重複して持たない。
- 各Transitionはid、from、to、commandを持つ。遷移の正本はこの配列だけ。
- 同じmachine / from / commandの組が複数ある入力はエラー。guardによる分岐は扱わない。
- 同じCommandを異なるfromから使うことは許可する。
- self-transitionは許可する。省略された遷移を自動で追加しない。
- 終端は「出る遷移が定義されていない状態」として読めるが、final状態や完了処理の特別な意味は付与しない。
- 到達不能警告は、Ruleの成立可否を無視した有向グラフ上の到達可能性だけを扱う。

### 4.5 CommandとRule

Commandはid、name、target、preconditions、postconditions、effectsを持つ。targetは単一Entity ID。CommandにTransitionを重複記述しない。

状態遷移から参照されないCommandも有効。状態変更を伴わない操作を表現できる。複数Entityを更新するトランザクションや更新フィールド集合はv0.1で表現しない。

Ruleはid、kind、description、scopeを持つ。

- kindはprecondition / postcondition / invariant。
- scopeは{kind: entity|relationship, id: 対象ID}。
- precondition / postconditionはv0.1ではentity scopeだけを許可する。
- Commandのpreconditionsにはpreconditionのみ、postconditionsにはpostconditionのみ指定できる。
- 参照するRuleのscopeはCommand.targetと一致しなければならない。
- invariantはEntityまたはRelationshipに所属し、Command側から列挙しない。
- 未使用のpre/post Ruleは警告。invariantはscopeへの適用があるため未使用扱いしない。
- Rule内に構造化されたフィールド参照や実行式は持たせない。文章内のフィールド名は検証しない。

preconditionは操作前、postconditionは成功後に成立させたい性質、invariantは対象の有効な状態に常に成立させたい性質を意味する。これらは宣言であり、ツールが業務データに対して評価するものではない。

### 4.6 Constraint

Constraintはv0.1ではuniqueのみ。id、kind:unique、entity、fieldsを持つ。

- fieldsは対象Entityに存在するrequired:trueの通常フィールドの非空集合。
- state型へのuniqueは非対応。フィールド重複はエラー。
- Constraintの型・参照の正しさだけを検証する。
- 実データの重複、DB indexの存在、Relationshipとの矛盾は検証しない。
- 同じ制約をRuleとConstraintで重複宣言することを要求しない。

### 4.7 Effect

Commandに内包し、id、kind:notification、descriptionだけを持つ。成功に伴って通知したいという意図の宣言である。

実行順序、送信先アドレス、配送保証、リトライ、失敗時の状態、外部呼出し、outboxは定義しない。effects配列の順番に実行上の意味はない。

## 5. 正常Contractの基準fixture

以下をcontracts/expenses/contract.yamlとして採用する。これは入力仕様の具体的な基準であり、実装者が別の構文に置き換えない。

```yaml
apiVersion: cca.dev/v1alpha1
metadata:
  id: expenses
  name: 経費精算
entities:
  - id: User
    name: 利用者
    fields:
      - { id: id, type: string, required: true }
      - { id: name, type: string, required: true }
      - { id: canApprove, type: boolean, required: true }
  - id: Expense
    name: 経費申請
    fields:
      - { id: id, type: string, required: true }
      - { id: amountJpy, type: integer, required: true, description: 申請額。単位は円 }
      - { id: status, type: state, machine: ExpenseLifecycle, required: true }
  - id: Payment
    name: 支払記録
    fields:
      - { id: id, type: string, required: true }
      - { id: receiptNumber, type: string, required: true }
      - { id: paidAt, type: datetime, required: true }
relationships:
  - id: ExpenseApplicant
    name: 申請者
    from: Expense
    to: User
    targetsPerSource: { min: 1, max: 1 }
    sourcesPerTarget: { min: 0, max: many }
  - id: ExpenseApprover
    name: 承認者
    from: Expense
    to: User
    targetsPerSource: { min: 0, max: 1 }
    sourcesPerTarget: { min: 0, max: many }
  - id: ExpensePayment
    name: 支払記録
    from: Expense
    to: Payment
    targetsPerSource: { min: 0, max: 1 }
    sourcesPerTarget: { min: 1, max: 1 }
stateMachines:
  - id: ExpenseLifecycle
    entity: Expense
    field: status
    states: [draft, submitted, approved, rejected, paid]
    initial: draft
    transitions:
      - { id: Submit, from: draft, to: submitted, command: SubmitExpense }
      - { id: Approve, from: submitted, to: approved, command: ApproveExpense }
      - { id: Reject, from: submitted, to: rejected, command: RejectExpense }
      - { id: RecordPaid, from: approved, to: paid, command: RecordPayment }
commands:
  - id: SubmitExpense
    name: 申請する
    target: Expense
    preconditions: []
    postconditions: []
    effects: []
  - id: ApproveExpense
    name: 承認する
    target: Expense
    preconditions: [EXP-001, EXP-002]
    postconditions: [EXP-003]
    effects:
      - id: ApprovalNotice
        kind: notification
        description: 申請者に承認結果を通知する意図。配送の実装・保証は対象外
  - id: RejectExpense
    name: 却下する
    target: Expense
    preconditions: [EXP-002]
    postconditions: []
    effects: []
  - id: RecordPayment
    name: 完了済み支払を記録する
    target: Expense
    preconditions: []
    postconditions: [EXP-005]
    effects: []
rules:
  - id: EXP-001
    kind: precondition
    scope: { kind: entity, id: Expense }
    description: 操作者は対象申請の申請者本人ではない
  - id: EXP-002
    kind: precondition
    scope: { kind: entity, id: Expense }
    description: 操作者は承認権限を持つ。v0.1では承認と却下に共通して必要
  - id: EXP-003
    kind: postcondition
    scope: { kind: entity, id: Expense }
    description: 成功後、対象申請の承認者として操作者が記録される
  - id: EXP-004
    kind: invariant
    scope: { kind: relationship, id: ExpensePayment }
    description: 一申請の支払記録は最大一件。構造上の正本はExpensePaymentの多重度
  - id: EXP-005
    kind: postcondition
    scope: { kind: entity, id: Expense }
    description: 成功後、対象申請に対応するPaymentが一件存在する
  - id: EXP-006
    kind: invariant
    scope: { kind: entity, id: Expense }
    description: statusがpaidである申請には、対応するPaymentが一件存在する
constraints:
  - id: PaymentReceiptUnique
    kind: unique
    entity: Payment
    fields: [receiptNumber]
```

domain.mdに次の仮定を記す。

- RecordPaymentは外部で完了した支払を記録する操作。送金開始ではない。
- 却下後の再申請は基準モデルにはない。変更実験で追加する。
- EXP-003は成功後の条件。以後すべての状態で承認者が残ることまで、このRule単独では表現しない。
- User.canApproveは権限概念の説明用。操作者との照合を評価するエンジンはない。
- amountJpyの正値チェックなど、経費精算の現実的な全ルールを網羅しない。
- 支払記録と状態更新の原子性は実装していない。EXP-005/006は要求の宣言だけ。

## 6. 内部IRと検証

IRは型付き配列とID索引から構成し、表示順はASCII IDのバイト順で正規化する。localeに依存したソートを使わない。

entities、fields、relationships、machines、states、transitions、commands、rules、constraints、effects、Rule参照、unique対象フィールド、enum値はいずれもv0.1では集合として扱い、入力順の意味を持たせない。初期状態はinitialの明示値で決める。

出典は正規化モデルの値から分離したSourceMapに保持する。種類＋ID＋プロパティパスから、ファイル・行・列へ引けるようにする。行番号、絶対パス、時刻、ランダム値を生成物に埋め込まない。

### 必須エラー

| コード | 内容 |
|---|---|
| YAML_INVALID | 構文不正、重複キー、非対応YAML構文 |
| SCHEMA_INVALID | 未知キー、型不正、非対応型・多重度等 |
| VERSION_UNSUPPORTED | 非対応apiVersion |
| ID_DUPLICATE | 規定の名前空間内のID重複 |
| REF_NOT_FOUND | Entity / Relationship / Machine / Command / Rule参照が未定義 |
| FIELD_NOT_FOUND | machine.fieldまたはconstraint.fieldsの参照先不在 |
| STATE_INVALID | initial / from / toの状態不在、状態の重複 |
| MACHINE_BINDING_INVALID | stateフィールドとMachineの相互参照不一致、複数Machine等 |
| TRANSITION_AMBIGUOUS | 同じmachine / from / commandの重複 |
| COMMAND_TARGET_MISMATCH | TransitionのCommand.targetとMachine.entityが不一致 |
| RULE_KIND_MISMATCH | pre/postの参照種別違い |
| RULE_SCOPE_MISMATCH | CommandとRuleの適用Entity違い |
| CONSTRAINT_INVALID | 非対応unique対象、重複フィールド等 |

警告はSTATE_UNREACHABLEとRULE_UNUSEDを実装する。段階ごとに検証し、構文・スキーマ不正から派生する大量の参照エラーを出さない。診断の順序も安定化する。

文中の業務知識、Ruleの論理矛盾、条件の成立可能性、RelationとConstraintの横断推論、DBでの強制は検証しない。

## 7. 生成物と期待仕様

出力ディレクトリはdocs/generated/expenses/。管理対象はmodel.mmd / class.mmd / state.mmd / catalog.mdの四ファイル。

### 7.1 論理ER図：model.mmd

- 三Entityと全フィールドを表示する。
- 三RelationshipをIDまたはID付き名称で区別する。申請者と承認者を一つの線にまとめない。
- Expense → Paymentは、Expense一件につきPayment 0..1、Payment一件につきExpense 1を表示する。
- state型は属性型としてstateと表示し、状態の列挙は状態図・一覧へ委ねる。
- physical PK / FK / UKのマークは付けない。unique Constraintは一覧に出す。
- Mermaidの線種が表す識別関係は本モデルでは評価しない。採用線種と「識別関係の判定には使わない」という描画規約を一覧に明記する。

### 7.2 概念クラス図：class.mmd

- Entityを<<Entity>>、Commandを<<Command>>相当の区別で表示する。
- Entityの全フィールドと型を表示する。
- Commandからtarget Entityへ参照線を引く。
- Relationshipは多重度と役割名付きで表示する。
- CommandをEntityの実装メソッドとして表示しない。
- Rule本文・Effect・Constraintは図に詰め込まず一覧に出す。

### 7.3 状態遷移図：state.mmd

- Machineごとに区画を分ける。基準fixtureでは一Machine。
- draftを初期状態として表示する。
- draft→submitted、submitted→approved、submitted→rejected、approved→paidの四遷移を表示する。
- 各線にTransition ID、Command ID、pre/postを区別したRule IDを表示する。
- 承認線にはpre: EXP-001, EXP-002とpost: EXP-003を表示する。
- paidとrejectedから暗黙の遷移や終了ノードを追加しない。
- invariantを遷移条件として表示しない。

### 7.4 仕様一覧：catalog.md

モデル名、全Entity・フィールド、全Relationshipと多重度、Machine・状態・遷移、Commandと適用Rule、Rule全文とscope、Effect、Constraintを生成する。構造化情報の確認に必要な項目は一覧で網羅する。

Ruleには安定したアンカーを設け、Command一覧から通常のMarkdownリンクで参照する。MermaidのclickやHTMLリンクには依存しない。各図の冒頭コメントにも一覧の相対パスを記す。

末尾に次を表示する。

- 検証済み範囲：入力構造、参照、定義済みのモデル整合性。
- 未検証範囲：Rule本文の意味・成立、実データ、本番実装、DB制約、外部作用。
- 出力ごとに省略している情報。
- 現在の警告一覧。位置ではなく要素IDを使い、入力並べ替えで変わらないようにする。

Rule本文だけの変更ではcatalog.mdだけが変化することを必須とする。入力全体のハッシュを各図に埋め込んで不要な差分を増やさない。

### 7.5 決定性と描画安全性

- Node IDは種類＋スコープ＋元IDから衝突しない方式で生成する。配列番号や表示名に依存しない。
- Relationship / TransitionにはIR上の安定IDを持たせる。Mermaid構文がEdge IDを持たない場合は、コメントと安定した宣言順で追跡する。
- 改行・引用符・括弧・HTML記号・Mermaid予約語・日本語を含む表示名のfixtureを用意する。
- Diagram種別ごとのエスケープ関数を使用し、Mermaidの固定バージョンで構文確認する。
- 表示上安全に変換できない文字は位置付きエラーにする。黙って消さない。
- UTF-8 / LF / 終端改行一つを固定する。
- 図の座標やレイアウト安定性は保証しない。保証するのは生成テキストの決定性。

## 8. CLI契約

```sh
pnpm cca validate --input contracts/expenses/contract.yaml
pnpm cca generate --input contracts/expenses/contract.yaml --out docs/generated/expenses
pnpm cca check --input contracts/expenses/contract.yaml --out docs/generated/expenses
```

- inputは一ファイル。ディレクトリ探索、glob、複数Context一括処理は対象外。
- inputとoutは明示必須。相対パスは実行時cwd基準。
- validateは出力ファイルを作らない。
- generateは全検証・全生成が成功してから管理対象四ファイルを更新する。生成途中の失敗では既存成果物を変更しない。
- 出力先は生成専用ディレクトリ。予期しないファイルがあれば勝手に削除せず、エラーで一覧を示す。symlinkを介した出力は拒否する。
- checkは一時領域で再生成し、バイト内容と管理対象ファイルの有無を比較する。生成物の不足・変更・余分なファイルを検出し、作業ツリーは変更しない。
- OS障害等による複数ファイル更新途中の中断は、次回checkで検知しgenerateで復旧する。高度なトランザクション機構は作らない。
- 全コマンドに--warnings-as-errorsと--format text|jsonを用意する。デフォルトはtext。
- JSON診断はcode / severity / message / elementId / path / line / columnを持つ。要素特定前のエラーでは該当項目をnullにする。line / columnは1始まり。

| 終了コード | 意味 |
|---|---|
| 0 | 成功。通常設定では警告があっても成功 |
| 1 | Contract検証不合格、または警告をエラー扱いした結果 |
| 2 | checkの差分検出 |
| 3 | CLI引数不正、I/O、生成・描画検証の内部エラー |

## 9. リポジトリ構成と技術方針

```text
contracts/expenses/contract.yaml
contracts/expenses/domain.md
src/cli.ts                         # 引数・表示・具体adapterの接続
src/cli/{args,format}.ts
src/application/{execute,request,result,ports,load}.ts
src/application/commands/          # 七CLIコマンドとローカル実DB照合
src/contract/{model,compile,normalize,multiplicity}.ts
src/contract/input/{schema,parse}.ts
src/contract/validation/           # 規則群と検証順序
src/features/{review,context,test-links,database}/
src/presentation/diagrams/
src/presentation/reports/
src/presentation/{catalog,outputs,markdown,model-format}.ts
src/adapters/{filesystem,vitest,postgres}/
src/support/                      # 入力共通・位置情報・診断・出力契約
tests/fixtures/
tests/expected/
tests/integration/
docs/generated/expenses/
docs/evaluation/protocol.md
docs/evaluation/baseline/
docs/evaluation/results.md
.github/workflows/validate.yml
AGENTS.md
README.md
package.json
pnpm-lock.yaml
```

単一パッケージを維持する。内部モジュールの責務と依存方向は[ソース構成](docs/source-architecture.md)に従い、公開npmパッケージへの分割は行わない。外部I/Oはapplicationのportを入口で具体adapterに接続し、Contract基盤と各featureはadapterを参照しない。依存境界はarchitecture testで検査する。この構成変更は入力API・意味論・実装スコープを変更しない。

Node.jsは実装時点で公式にサポートされたLTSを選び、CIとREADMEで固定する。pnpmと依存バージョンも固定しlockfileをコミットする。Zodのメジャーバージョンに応じたstrictな入力検証を使用する。

Mermaid本体・描画用ツールはテスト用依存に限定できるならそうする。通常の図テキスト生成はブラウザを要求しない。描画確認の環境はREADMEに記す。

JSON SchemaとZodの二重手書き管理はしない。XStateの実行モデルは採用しない。新しい依存は具体的な用途がある場合だけ追加する。

## 10. 実装マイルストーン

### M0：仕様とfixtureの固定

- 本書のYAMLを正常fixtureとして配置する。
- 4章の意味論を入力スキーマの対応表にする。
- 7章をもとに三図と一覧の小さな期待出力を手書きする。
- 多重度の四種類について方向を確認できるテスト表を作る。
- 11章の不正入力と期待診断を用意する。
- 図の描画規約と評価質問をprotocol.mdに固定する。

完了条件：入力項目と意味が一対一で説明でき、基準fixtureに未定義参照や二重正本がない。M0は実装作業の一部であり、通常は追加承認待ちで停止しない。本書の意味論を変える必要が生じた場合だけ、変更案と理由を明示する。

### M1：解析・検証・IR

- パッケージ初期化、YAML解析、Zod schema、SourceMap。
- 参照解決、意味検証、警告、正規化IR。
- 純粋関数として検証・正規化を実装する。

完了条件：基準fixtureが警告なしで通り、定義済みの不正入力が期待コードと位置で失敗する。入力の集合順を変えても正規化モデルは同一。

### M2：図と一覧の生成

- 四Generator、ID生成とエスケープの共通処理。
- 手書きの期待出力との比較、構文検証、代表図の描画確認。
- Rule本文変更がcatalogだけに反映されるテスト。

完了条件：三図の意味と多重度が期待と一致し、Rule・Effect等が一覧から欠落しない。構文テストだけで完了扱いにしない。

### M3：CLI・同期・CI

- CLI、終了コード、JSON診断、出力の保護。
- checkの内容・不足・余剰ファイル検出。
- README、AGENTS.md、GitHub Actions。

CI順序：frozen lockfileで依存導入 → 型検査 → unit/integration/構文テスト → validate --warnings-as-errors → check。

CI内でgenerateしてからcheckを行わない。更新忘れが隠れるためである。必要な描画確認は一つの固定環境で行う。

完了条件：Contractだけ変更したケースと生成物欠落ケースでCIが失敗し、更新済み成果物では成功する。別の開発者がREADMEだけで再現できる。

### M4：比較実験と判断

- 手書きベースラインと同じ情報量で変更実験を実施。
- 技術的な変更検証と、第三者による理解・誤り発見を分けて記録。
- 結果を成功・不成立・未評価に分類し、Phase 2の判断を残す。

第三者が参加できない場合、Codexはprotocolと記録用ファイルまで完成させる。回答者や実測結果を捏造せず「有用性評価未実施」として引き渡す。技術成立を有用性実証に読み替えない。

## 11. テストと変更シナリオ

### 構造検証のfixture

重複ID、未定義Entity、未定義Rule、未定義Command、未定義Machine、存在しないfield、存在しないinitial/from/to、不正多重度、不正型、未知キー、重複YAMLキー、非対応version、Machineとfieldの不一致、同一from/commandの分岐、Command target不一致、Rule kind/scope不一致、uniqueの不正対象をそれぞれ独立に検証する。

エラー位置は入力の該当プロパティを指すことを確認する。正常fixtureのコピーに一つの欠陥を注入し、別の欠陥で偶然失敗するテストにしない。

### 変更シナリオと期待差分

| シナリオ | 期待結果 |
|---|---|
| rejected→submittedを既存SubmitExpenseで追加 | stateとcatalogのみ変更 |
| 新Commandとpreconditionを追加し既存状態間の遷移に関連付け | class/state/catalog変更、ER不変 |
| Entityに通常フィールドを追加 | ER/class/catalog変更、state不変 |
| Relationship多重度を変更 | ER/class/catalog変更、state不変 |
| 未定義Ruleを参照 | REF_NOT_FOUND。生成物は更新されない |
| Contract変更後に生成を省略 | checkが差分で失敗 |
| Rule本文のみ変更 | catalogのみ変更。checkは不一致を検出 |
| RuleのCommand関連付けを削除 | 図・一覧の差分を生成。警告が出る場合はそれも記録。業務違反の自動判定とは扱わない |
| 配列順だけを変更 | 四生成物が完全一致 |
| Paymentを0..manyにし、EXP-004本文は最大一件のまま | 構造検証は通る。人間が意味的不整合を発見する課題 |
| 未到達状態を追加 | STATE_UNREACHABLE。厳格モードで失敗 |
| 生成物を削除・余分なファイルを追加 | checkが不足・余剰を報告。削除や修復はしない |

Snapshotは補助として使う。多重度の向き、Ruleのpre/post分類、要素欠落、変更されるファイル集合は個別の意味あるassertionで確認する。実装出力をそのまま正解として取り込むだけのテストにしない。

## 12. 人間による評価プロトコル

### 比較条件

A：Markdown＋手書きMermaid三図。Rule/Effect等の一覧を含める。  
B：Contract YAML＋生成Mermaid三図＋生成catalog。

両条件は同一の業務情報、同じ閲覧ツール、同じ設問数にする。Bの設計理解課題は図＋catalogを入口にし、YAMLを開いた回数も記録する。情報量の差で優位性を作らない。

目安は第三者4名。人数を確保できなければ実数を記録し、結論を限定する。条件を見る順序を入れ替え、同じ問題の答えを覚える効果を抑えるため、同等難度の別変更を使用する。タイムアウトは各課題10分。

### 基準設問と採点

各問1点、全5点。回答時間と根拠を読んだ場所も記録する。

1. 承認可能な操作者は誰か。正答：承認権限を持ち、申請者本人ではない操作者。
2. 却下後に再申請できるか。正答：基準モデルに遷移はない。
3. paidでPaymentなしの状態は要求に適合するか。正答：EXP-006に違反。ただしツールが実データに対して検出するわけではない。
4. 一申請にPaymentを二件持たせられるか。正答：宣言上は不可。DBでの強制は未確認。
5. validate成功が保証することは何か。正答：構造・参照・列挙された整合性のみ。Ruleの正しさや実装の適合は含まない。

変更レビュー課題には、Rule適用先の削除と「Payment多重度だけ増やして本文を残す」変更を含める。後者は構造検証が成功する業務上の不整合として重要。

### 記録する指標

- 理解課題の得点、時間、重大な誤認の件数。
- 埋め込んだ業務誤りの発見率、誤検出率、時間。
- 変更開始から図・一覧更新までの時間、手作業回数、更新漏れ。
- 無関係な生成ファイル変更数 / 全変更生成ファイル数。
- SchemaやGenerator自体を変更した回数と理由。
- 初期構築費用と通常変更費用を分けて記録。

### 判断基準

以下は統計的な優位性の証明ではなく、このPoCを継続するための事前基準である。

- 技術Go：M1〜M3の必須条件をすべて満たす。
- 有用性の継続候補：Bの理解得点・業務誤り発見率がA以上、保証範囲の重大な誤認が増えず、レビュー時間の中央値が20%以上短縮する、または業務誤り発見率が20ポイント以上改善する。
- 再設計：Bで重大な誤認が増える、理解得点が低下する、対象内の単純変更でGenerator変更が繰り返し必要になる、一覧を読めずYAMLの精読が常態化する。
- 優位性未確認：技術Goだが有用性基準を満たさない。図生成ツールとして残す選択肢はあるが、CCA仮説の実証とは呼ばない。
- 未評価：参加者不足または比較未実施。Phase 2への根拠として成功を主張しない。

## 13. AGENTS.mdに含める実装ルール

- 本書と基準fixtureを実装契約として扱う。
- 自然言語Ruleの評価、業務アプリ、公開IR、汎用DSLを追加しない。
- 状態遷移の正本はMachine、状態集合の正本もMachine。
- Relationshipの方向と多重度を勝手に反転しない。
- generated配下を手で直さず、生成器またはContractを修正する。
- 診断コードを安定させ、未対応項目を黙って捨てない。
- 入力言語の意味を変える場合は理由と影響を記録する。
- 変更後は型検査・関連テスト・validate・checkを実行する。
- すべての実装変更にContract更新を要求しない。Contractの意味に影響しないリファクタリングは許可する。
- 第三者評価・性能値・CI結果は実測したものだけを報告する。

## 14. 設計判断記録

| 判断 | 採用内容 | 再検討の条件 |
|---|---|---|
| 単一パッケージ | 開発・検証を簡素化 | 独立配布の需要が具体化 |
| YAML＋Zod | 入力は宣言的、検証はTS | 他言語からの入力schema利用が必要 |
| 内部IR | 複数Generatorの共通基盤 | 外部利用者が現れる |
| Ruleは非実行 | 誤った保証とDSL肥大化を防ぐ | 実行可能な限定ルールの具体要件がある |
| 三図＋catalog | 元の理解目的と情報欠落対策 | 評価で特定の図が使われない |
| 静的多重度 | 状態依存条件と分離 | 状態依存制約の検証要件がある |
| RecordPayment | 外部送金の非同期性を除外 | 実アプリ・送金統合を扱う |
| 物理DB整合検査なし | Phase 1を構造検証に限定 | DB schemaが存在する |
| XState等を不採用 | 実行意味論が不要 | シミュレーション・実行が目的になる |

## 15. 引き渡しと完了条件

本書をCodexへ渡し、M0→M1→M2→M3の順で実装してよい。M0でのfixture化は通常の実装工程として進める。新しい業務仕様を発明しないと進めない矛盾があれば、その箇所と最小修正案を報告する。

引き渡し時は、動くCLI、ソース、正常・異常fixture、四生成物、README、AGENTS.md、CI定義、比較実験手順・記録用ファイルを揃える。基準モデルの図について多重度・遷移・Rule種類・読みやすさを確認した結果を記載する。

完了報告には「実装したこと」「実行した検証」「未実施の評価」「保証しないこと」を区別して記す。M4の人間評価が未実施でも実装成果物は引き渡せるが、CCAの有用性についての結論は保留する。

Phase 2の候補は、結果を見て選ぶ。優先候補はRuleとテストの対応、限定的なDB整合検査、Contract差分レビュー、Agentへの局所的なコンテキスト供給。形式証明や汎用言語化を自動的な次段階にはしない。
