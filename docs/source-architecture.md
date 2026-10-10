# ソース構成の検討

2026-10-10。構成計画と実装記録。段階1〜5の責務分割を実装済み。以下の現状評価は移行前を指す。入力言語・CLI・生成物の意味は維持する。

## 判断

現状は、処理パイプラインごとに関数を分けた構成であり、Clean Architectureの依存境界を明示した構成ではない。平たいディレクトリだけが問題ではなく、機能追加時に複数の責務が同じ関数へ集まることが問題になる。

このリポジトリでは、**Contractの処理基盤、機能ごとの処理、表示、外部I/O、実行の組み立て**を分ける構成を推奨する。単一パッケージと関数中心の実装を維持し、依存方向を決める。クラス階層、DIコンテナ、汎用プラグイン機構はこの分割に必要ない。

経費精算のEntityはツールが読み取る入力モデルであり、このツール自身の業務オブジェクトではない。ExpenseRepositoryや承認UseCaseを追加する設計にはしない。ツールの中核はContractの構造・参照・整合性である。

## 現状で良い点と集中している責務

調査時点の`src/`は20ファイル、1,769行。行数は規模の参考であり、分割の判断基準は責務と依存関係とする。

| 対象 | 現状 | 検討する分割 |
| --- | --- | --- |
| `generators/`、`normalize.ts` | 検証済みモデルからの生成・正規化を関数に分離している | この分離を維持する |
| `cli.ts`（143行） | 七コマンドの引数、入力読込、実行分岐、厳格警告、終了コード、標準出力を担当 | 引数・表示と、コマンド実行を分離する |
| `validate.ts`（298行） | 重複、参照、Machine、Rule、Constraintの検証とcompileを担当 | 検証の段階を保ちながら規則群とcompileを分離する |
| `parser.ts`（235行） | 汎用YAML/Zod入力、SourceMap、Contract固有のID紐付けを担当 | 入力共通処理、位置情報、Contract入力を分離する |
| `extensions/test-links.ts`（112行） | manifest、参照検証、実ファイル確認、Vitest JSON照合、Markdown生成を担当 | 純粋な照合と外部証跡取得・表示を分離する |
| `extensions/database.ts`（148行） | schema、snapshot整合性、Contractとの比較、Markdown生成を担当 | 入力定義、比較、表示を分離する |
| `scripts/local-db.ts` | Docker実行、SQL、Contract読込、snapshot取得、照合、保存を担当 | 開発用入口を残し、DB取得と比較の組み立てを分離する |

加えて、依存先に責務の混在がある。

- `ir.ts`は`schema.ts`のZod推論型からContract型を参照する。入力定義が型の正本であり、現在は純粋な処理でも型の配置が入力ライブラリに結び付いている。
- `validate.ts`と`extensions/common.ts`はSourceMapのためにYAML parserモジュールを参照する。意味検証が必要とするのは位置情報の検索である。
- `database.ts`が共通結果型`ExtensionResult`を`test-links.ts`から参照している。独立した機能間に型の依存がある。
- `context.ts`、`review.ts`、拡張機能が`generators/common.ts`のMarkdown関数を利用している。図専用処理と共通表示処理の置き場が曖昧になっている。
- `output.ts`は管理ファイル名を`generators/index.ts`から取得する。I/Oと生成の契約を明示すれば、生成器の実装に依存せず出力を扱える。

現状を「神クラスがある」とは評価しない。多くは関数であり、上記は今後、関数やモジュールの責務が集中しやすい箇所である。

## 実装後の配置

以下は実装後の主な配置。七CLIコマンドのうちgenerate/checkは共通のoutputs処理を使う。ローカル実DB照合はlive-databaseとして独立させた。

```text
src/
  cli.ts                         # 既存の実行入口。引数・表示・組み立てのみ
  cli/
    args.ts                      # コマンド別の型付き引数
    format.ts                    # text/jsonの互換性
  application/
    commands/                    # 七CLIコマンドとローカル実DB照合
    ports.ts                     # 必要なファイル読込・出力・証跡取得の関数型
    result.ts                    # コマンド結果・終了コードの扱い
  contract/
    model.ts                     # Contract/Field/内部IRの型の入口
    compile.ts                   # parse → validate → normalize
    input/
      schema.ts                  # Contract固有のZod schema
      parse.ts                   # Contractの読込とID・位置の紐付け
    validation/
      index.ts                   # 検証の順序・打切り・診断の確定
      context.ts                 # 解決用索引・診断収集
      identifiers.ts             # 名前空間内の重複
      relationships.ts           # Entity参照
      machines.ts                # field束縛・状態・遷移・到達可能性
      rules.ts                   # Command target、Rule種別・scope・未使用
      constraints.ts             # unique対象
    normalize.ts
  features/
    review/                      # プロパティ差分
    context/                     # 選択と参照先の閉包
    test-links/                  # manifest schema、Rule/test・証跡の照合
    database/                    # logical snapshot schema、明示マッピングとの比較
  presentation/
    diagrams/                    # ER/class/stateと図固有のescape
    catalog.ts
    reports/                     # review/context/test-links/databaseのMarkdown
    markdown.ts                  # Markdown escape・anchor
    outputs.ts                   # 検証済みIRから四ファイルを生成
  adapters/
    filesystem/                  # 出力保護・stage/check、root内のファイル確認
    vitest/                      # JSON入力からテスト実行証跡への変換
    postgres/                    # カタログ取得・logical snapshotへの変換
  support/
    input/                       # 共通のstrict YAML/Zod解析
    source-map.ts                # parserから独立した位置情報
    diagnostics.ts               # 安定コード・診断型・診断順序
    order.ts                     # ASCII順
    validation.ts                # 診断収集・重複・集合比較
    artifacts.ts                 # 管理ファイル名と出力型
    report.ts                    # 診断とレポートの共通結果型
scripts/
  local-db.ts                    # 開発用Docker操作とapplication呼出し
```

`contract/model.ts`は内部の型の入口であり、公開IRを作るものではない。初期移行ではZod推論型をtype-onlyで再exportしてよい。手書きContract型とschemaの二重管理は避ける。型の完全なライブラリ独立性が必要になった場合に、別の設計判断として扱う。

`support/artifacts.ts`が管理対象四ファイル名と出力型を所有し、presentationとfilesystem adapterの双方から参照する。生成器の実装をI/Oがimportする必要はない。

`support/`に入れるのは複数機能で実際に共通する小さな基盤だけとする。DB固有の照合や描画規約を移す場所にはしない。診断コードの一覧は安定した一つの場所に残す。

## 依存方向

`A → B`はAがBをimportすることを表す。実行時importとtype-only importを両方確認する。ただし上記のZod推論型の内部参照は初期移行の明示的な例外とする。

| モジュール | 許可する主な依存 | 禁止する依存 |
| --- | --- | --- |
| `support` | 必要な入力ライブラリと基盤内モジュール | Contract固有処理、feature、presentation、外部I/O |
| `contract` | support、Contract入力schema | feature、presentation、application、fs、DB接続 |
| `features` | contractの型・索引・多重度表現、support、自身の入力schema | 他feature、presentation、application、外部I/O |
| `presentation` | contract、featureの読取結果の型、support | application、adapter、外部I/O |
| `application` | contract、feature、presentation、自身のport | 具体adapter、CLI、Docker実行 |
| `adapters` | portの型、contract/featureの型、support、外部ライブラリ | コマンド実行、CLI表示 |
| `cli.ts`・開発用入口 | application、adapter、CLI処理 | 意味検証やDB比較の実装を内包すること |

共通入力解析はYAML/Zodを使う。これは純粋な入力変換であり、ファイル読込とは分ける。今回の目的は外部I/Oと責務の分離であり、ライブラリの使用をすべてinterfaceで覆うことではない。

CLIで具体adapterを組み立て、applicationの関数へ渡す。`application/ports.ts`に`Ports`と実DB用の`LiveDatabasePorts`を定義する。portは実際の外部境界に限定する。例えばファイル内容の取得、生成物の書込・比較、テストファイルの確認、DB catalogの取得である。純粋関数であるvalidateやnormalizeにはinterfaceを追加しない。

Generatorの入力は引き続き検証済みIRだけに限定する。各Generatorやfeatureに独自のYAML再解釈・参照解決を持たせない。

## 肥大化を避ける具体策

1. **CLIはコマンドを解釈して実行するだけにする。** コマンド別の引数を判別共用体で表し、各application関数へ渡す。新機能はそのコマンドとfeatureを追加する。巨大な共通serviceに処理を追加しない。
2. **検証は規則群ごとに分け、順序は一か所で管理する。** 現状の定義ID重複による早期打切りを維持する。各規則群は共有の検証contextを受け取る純粋関数とし、SourceMap上の入力順と正規化後の順序を混同しない。Rule参照重複など、現在後段で検出するものを機械的に前段へ移すと診断集合が変わるため注意する。
3. **取得、判定、表示を分ける。** test-linksはadapterが解決済みファイル・実行証跡を返し、featureがRule/test対応を判定する。databaseはadapterがlogical snapshotを返し、featureがContractと比較する。レポートは判定結果から生成する。
4. **レポート用結果は内部データにする。** reviewは差分一覧、contextは選択集合などを返す。公開形式や新たなJSON APIにしない。既存のCLIレポート形式を維持する。
5. **contextの選択結果を完全な検証済みIRと区別する。** 現状は配列を絞ったIRに元の全索引を残す。閲覧用途の選択集合をcatalogへ渡す設計にし、その値が独立した有効Contractであるという誤解を防ぐ。全Contractの警告を表示する既存規則は維持する。
6. **共通型は機能から独立させる。** `ExtensionResult`相当は用途に合う共通結果型へ移し、databaseからtest-linksへの依存を取り除く。具体的なDB比較結果やテスト証跡は各featureが所有する。
7. **依存境界を継続確認する。** 移行時にimportを確認する小さなarchitecture testを追加し、上記の禁止依存とfeature間の横断importを検出する。相対import、type-only import、再exportを対象にする。既存TypeScriptのASTを利用でき、新しい依存の追加は必須ではない。

新しい図はpresentation、新しい整合性検査はfeature、新しい証跡の取得元はadapterへ追加する、という置き場が明確になる。機能ごとにschema・判定・結果を近くへ配置し、全機能分の巨大なvalidators/renderersディレクトリへ集約しない。

## 段階的な移行

| 段階 | 作業 | 完了の判断 |
| --- | --- | --- |
| 1 | SourceMap、表示共通処理、結果型を独立させ、上記の責務単位へ移動する | import更新後もCLI・診断・生成物が同じ |
| 2 | CLI引数・表示とapplicationのコマンド実行を分離する | 七コマンドの引数、text/json、警告扱い、終了コードを維持 |
| 3 | validationを規則群へ分割する | 同一入力から同じ診断コード・位置・順序・警告を返す |
| 4 | test-linksとDBの取得・判定・表示を分離する | root/symlink確認、Vitest照合、DB非対応診断、多重度を維持 |
| 5 | import境界のチェックと構成説明を定着させる | 新機能の追加時に禁止依存を検出できる |

各段階を小さな変更として完了させ、ファイル移動と判定ロジックの変更を一度に行わない。旧パスの互換shimは必要な移行期間に限定する。単一パッケージ内のimportはtests/scriptsも更新する。

`cca-poc-v0.1-revised-plan.md`の9章の配置例とは変わるため、実装時には同章の構成説明とREADMEを同期する。既存の意味論・実装スコープは維持する。Contractを更新する必要はない。

各段階で`pnpm typecheck`、関連テスト、`pnpm validate`、`pnpm check`を実行する。全体移行の完了時は通常の全テストに加え、利用可能な実DB環境で`pnpm db:live`と`pnpm test:db`を実行する。実DBを確認できなければ、その部分は未確認と明記する。

CLIのJSON形、診断のコード・位置・順序、集合の正規化、管理対象四ファイルのバイト内容を互換性の確認対象とする。出力途中失敗の保護とcheckの非更新性も維持する。生成物は手で編集しない。

## 実装と確認

段階1〜5を実施した。CLIは既存の`src/cli.ts`を入口として保持し、引数解析と出力形式を`cli/`、コマンド実行を`application/`に配置した。旧ソースパスの互換shimは残さず、tests/scriptsのimportを更新した。

検証規則の順序と打切りは`contract/validation/index.ts`に集約した。各規則群は位置情報と解決用索引を持つ検証contextを利用する。

reviewは内部のプロパティ差分、contextは選択集合を返す。生成物への影響計算とレポートの組み立てはapplication、Markdownはpresentationが担当する。contextのcatalog表示には部分IRや全索引を渡さず、閲覧用の`renderCatalog`を使う。四生成物のGeneratorは検証済みIRだけを受け取る。

test-linksは宣言検証と証跡照合をfeature、root内ファイル確認とVitest JSON取得・変換をadapter、順序制御をapplication、レポートをpresentationが担当する。databaseもschema、純粋な比較、レポートを分離し、ローカルDBのDocker/SQL実行はadapter、snapshotの完全置換と照合はapplicationへ移した。

`tests/architecture.test.ts`は全srcとローカルDB入口の依存方向、feature間の横断依存、外部I/O、循環を検査する。TypeScript ASTで静的import、type-only import、再export、import型、動的import、requireを読む。禁止例・許可例もテストし、文字列以外の動的依存は拒否する。CIが実行する通常のテストに含まれる。

`tests/application.test.ts`はportを差し替え、検証失敗・厳格警告時のI/O打切り、四生成物が完成してからの書込、checkの非更新性、証跡の照合、閲覧選択と全体警告の分離、実DBによるsample inventoryの完全置換、非対応catalogの保存前拒否を確認する。

2026-10-10のローカル確認結果（Node.js 24.19.0）:

| 確認 | 結果 |
| --- | --- |
| `pnpm typecheck`、`pnpm validate`、`pnpm check` | 成功。生成物は既存の四ファイルとバイト一致 |
| `pnpm test:report` | 210テスト成功、実DB用6テストは通常実行ではskip |
| `pnpm traceability --results .artifacts/test-results.json`、`pnpm db:check` | 成功 |
| `pnpm db:live`、`pnpm db:test` | 実DB照合と七つの物理制約probe成功 |
| `pnpm test:db` | 実DBの6統合テスト成功。DDL変更・データprobeはROLLBACK |
| 移行前ソースとの比較 | 659入力の診断・IRと有効入力の生成物、336コンテキスト、16レビュー、52CLI実行が一致 |

比較には既存fixture、欠陥注入の全組合せ、正常な変更例を使い、診断メッセージ・位置・順序とレポート本文も比較した。比較用ソースとスクリプト・結果はローカルの`.artifacts/architecture/`に保存した。Contractと`docs/generated/`の変更はない。リモートCI・第三者評価・性能測定は今回実施していない。

これにより、コードを精読しなくても「入力言語」「モデル整合性」「レポート」「外部証跡」の変更先を構成から判別できる。振る舞いの正しさは構成図だけでは保証できないため、実装契約・入力仕様・既存テストを引き続き判断の根拠にする。
