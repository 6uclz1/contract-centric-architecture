# CCA PoC v0.1

単一のContract YAMLから入力構造・参照・限定的なモデル整合性を検証し、論理ER図、概念クラス図、状態図、仕様一覧を決定的に生成するPoC。

[実装契約](cca-poc-v0.1-revised-plan.md) / [入力対応表](docs/input-schema.md) / [業務背景](contracts/expenses/domain.md) / [生成一覧](docs/generated/expenses/catalog.md) / [評価手順](docs/evaluation/protocol.md) / [検証結果](docs/evaluation/results.md)

## セットアップ

Node.js **24.19.0**（LTS）とpnpm **11.25.0**を使用する。`.node-version`、`package.json`、CIで固定。Node 24のLTSサポート期間は[公式Release WG](https://github.com/nodejs/Release)を参照。

```sh
# Node 24.19.0を導入しPATHに置いた後
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
# テスト・描画に必要な固定Chromiumを導入
pnpm exec playwright install chromium
# Linuxの描画依存も導入する場合
# pnpm exec playwright install --with-deps chromium
```

YAML 2.8.1とZod 4.1.12は実行依存。TypeScript、Vitest、Mermaid 11.12.1、Playwright 1.56.1は開発依存。Mermaidのテキスト生成CLIはブラウザを起動しない。esbuildのビルドを`pnpm-workspace.yaml`で明示的に許可する。Chromium 141.0.7390.37 / Playwright build 1194を描画テストに使用。Mac ARM64で検証済み、CIの固定環境はUbuntu 24.04。

## CLI

```sh
pnpm cca validate --input contracts/expenses/contract.yaml
pnpm cca generate --input contracts/expenses/contract.yaml --out docs/generated/expenses
pnpm cca check --input contracts/expenses/contract.yaml --out docs/generated/expenses

pnpm cca validate --input contracts/expenses/contract.yaml --warnings-as-errors --format json
```

`--input`は常に必須、generate/checkは`--out`も必須。相対パスは実行時cwd基準。一ファイル入力のみ。`--format text|json`と`--warnings-as-errors`を全コマンドで利用可能。JSONは診断の配列（成功かつ診断なしなら`[]`）。各診断にcode/severity/message/elementId/path/line/columnを含み、該当しない値はnull。line/columnは1始まりでプロパティキー、配列なら該当要素を指す。

| 終了コード | 意味 |
| --- | --- |
| 0 | 成功（通常モードは警告可） |
| 1 | Contract不合格、または厳格モードの警告 |
| 2 | checkで内容変更・不足・余剰を検出 |
| 3 | 引数不正・I/O・生成内部エラー・出力保護違反 |

validateはファイルを作らない。generateは全検証と全生成の成功後に四ファイルをステージし更新する。checkはシステム一時領域で生成し、バイトを比較して片付ける。出力ディレクトリとその祖先・管理ファイルのsymlinkは拒否。macOSの`/tmp`や`/var`のようなsymlink祖先も拒否するため、出力はリポジトリ内か物理パスへ指定する。

出力先は生成専用で四ファイル以外を置かない。余分なファイルは一覧を報告し、削除しない。checkは生成物を修復しない。OS障害で更新が途中中断したらcheckで確認し、余分なファイルを別の場所に移してgenerateで復旧する。複数ファイルの高度なトランザクションや同時実行との競合防止は提供しない。

## 開発・検証

```sh
pnpm typecheck
pnpm test
pnpm validate
pnpm check
pnpm render
```

renderは`.artifacts/render/`へSVG/PNGを出力する。三図を開き、多重度の方向、役割線の分離、CommandとEntityの区別、initialと四遷移、pre/post、暗黙の終了ノードがないことを確認する。通常の変更後は必要に応じてgenerateし、checkする。CIはgenerateせずcheckし、更新忘れを検出する。

`tests/fixtures/expenses.yaml`は計画のYAMLそのもの。不正fixtureは各一つの欠陥を注入し、`expected-diagnostics.json`に期待コードとプロパティパスを固定。`tests/expected/`に手書きの意味的期待値と小図を置く。テストでは多重度四種類、pre/post、全要素、変更されるファイル集合、順序不変性、JSON/終了コード、出力保護、構文・描画を検証する。fixtureの意図的再作成には`pnpm exec tsx scripts/fixtures.ts`を利用できる。

## 内部構造

責務分割と依存方向は[ソース構成](docs/source-architecture.md)を参照。`contract/`が入力・検証・正規化、`features/`が差分・選択・テスト対応・DB比較、`presentation/`が図とレポート、`adapters/`がファイル・Vitest・PostgreSQLの取得、`application/`が実行の組み立てを担当する。`src/cli.ts`は引数・表示と具体adapterの接続を行う入口。外部I/Oはport経由で渡し、純粋な処理からadapterを参照しない。

`tests/architecture.test.ts`で依存方向・機能間依存・循環を、`tests/application.test.ts`でport越しの実行を検査する。新しい整合性検査はfeature、新しい図・レポートはpresentation、新しい証跡取得元はadapterへ配置する。

YAML解析・SourceMap → strict Zod schema → 参照・意味検証 → ASCII ID順の内部IR → 四Generator → CLI出力。検証済みIRに配列と種類別ID索引を持たせ、SourceMapと位置を生成物から分離する。ノードIDは種類・スコープ・元IDをUTF-8 hex符号化して作る。表示名からIDを作らず、図種別ごとに構文記号をエスケープする。

IRは内部専用。配列は集合として正規化、initialのみ明示値を使う。Rule本文変更はcatalogだけに現れる。状態遷移の正本はMachine、関連の正本はRelationship。物理キーや外部IDフィールドを推測しない。

## 評価と限界

M1〜M3の技術検証とM4の第三者比較を区別する。比較用の手書きMarkdownと三図、5問の採点基準、変更レビュー課題、CSV記録欄を用意した。第三者の有用性評価は未実施であり、CCA仮説の採択は保留。

成功したvalidateが保証するのは入力構造・参照・列挙したモデル整合性。Rule本文の意味、業務データ、アプリ実装、DB制約、通知配送や送金を保証しない。詳細は[結果記録](docs/evaluation/results.md)。

## Phase 2以降の技術拡張

Phase 2候補の四項目（Contract差分レビュー、Agent向け局所コンテキスト、Ruleとテストの対応、限定DB整合検査）を追加した。[範囲と選択規則](docs/phase2-plan.md)を参照。

```sh
# 旧版と新版をそれぞれ検証して比較。差分ありでも終了0。
pnpm cca review --before path/to/before.yaml --input contracts/expenses/contract.yaml
# 種類とIDで選択し、関連する仕様をMarkdownで表示。
pnpm cca context --input contracts/expenses/contract.yaml --kind command --id ApproveExpense
pnpm cca context --input contracts/expenses/contract.yaml --kind rule --id EXP-004 --format json
```

両コマンドは標準出力のみでファイルを作らない。`--out`は受理しない。JSONは`{diagnostics, report}`（reportはMarkdown、不合格ならnull）。既存三コマンドのJSON診断配列は変更しない。`--warnings-as-errors`で入力の警告を失敗にする。contextの対象不在は終了1。差分はプロパティ単位で表示し、変更される生成ファイルも示す。業務上の意味・互換性は判定しない。

contextはrootへの直接の逆参照と、それらの定義が持つ参照先の閉包を保持する。Machineは全遷移を保つため、単一Commandの指定でも他Commandが含まれる場合がある。未選択の関係・Ruleは全Contractで確認する。第三者評価の結論は引き続き保留。Ruleとテストの対応・DB整合検査の仕様は[追加入力仕様](docs/extension-inputs.md)を参照。

```sh
# 宣言されたRule/test対応とファイル存在を確認。
pnpm traceability
# 実際のVitest JSONを出力し、完全テスト名と実行結果まで照合。
pnpm test:report
pnpm traceability --results .artifacts/test-results.json
# 説明用DB schema snapshotと明示マッピングの整合性を確認。
pnpm db:check
```

直接CLIを使う場合:

```sh
pnpm cca test-links --input contracts/expenses/contract.yaml --links contracts/expenses/test-links.yaml --root . --results .artifacts/test-results.json --warnings-as-errors
pnpm cca db-check --input contracts/expenses/contract.yaml --db contracts/expenses/db-mapping.yaml --warnings-as-errors
```

両CLIも標準出力のみ、JSONは`{diagnostics, report}`。Rule未対応・DB未マッピング・FKで検証できない逆側minは警告、厳格モードでは失敗。test-linksは結果省略時にテスト名と実行を未検証と表示する。結果を指定してもRule本文の正しさや意味的なテスト網羅性は保証しない。DB入力はlogical snapshotで、実DBには接続しない。物理FKをContractのRelationshipから推測せず、sampleではPayment側がFKを持つことを明示する。CIはtest:report後にtraceabilityとdb:checkも実行する。

## コンテナのローカルDBで検証

Docker EngineとComposeを用意する。macOSでColimaを使う場合:

```sh
brew install colima docker docker-compose
# HomebrewのComposeをDocker CLI pluginとして認識させる。
mkdir -p ~/.docker/cli-plugins
ln -s /opt/homebrew/lib/docker/cli-plugins/docker-compose ~/.docker/cli-plugins/docker-compose
colima start --profile cca --cpu 2 --memory 2
```

既にCompose pluginがある環境ではsymlink作成は不要。Intel MacのHomebrewはpluginのパスを`brew --prefix`に合わせる。Docker Desktop/Linux Engineでも同じCompose設定を使用できる。

```sh
pnpm db:up       # PostgreSQL 17.11を起動してhealthyまで待つ
pnpm db:live     # 実DBカタログを読み取り、Contractと明示マッピングを比較
pnpm db:test     # 七つの物理制約動作確認。テストデータはすべてROLLBACK
pnpm test:db     # 実DBの六件の統合テスト。DDL変更もROLLBACK
pnpm db:down     # 停止。named volumeのデータは保持
```

`127.0.0.1:55432`、database/userは`cca`、ローカル開発用passwordは`cca_local_only`。ポート変更は`CCA_DB_PORT=別ポート pnpm db:up`。今回の端末はColimaの`colima-cca` contextを使用する。再起動後は`colima start --profile cca`でDocker Engineを起動する。

```sh
docker compose exec db psql -U cca -d cca
```

[compose.yaml](compose.yaml)と[手書き物理fixture](infra/postgres/init.sql)を使用する。初期SQLはvolumeが空の初回起動だけで実行され、既存データを変更するmigrationではない。fixtureを変更した場合も既存DBへ自動適用しない。停止ではvolumeを削除しない。fixtureから完全に作り直す場合だけ、データを消す`docker compose down --volumes`を明示実行してから再起動する。

db:liveはpublic schemaのカタログをread-only/repeatable-read transactionで取得し、PK・full unique・FK・NOT NULL・native enumをlogical snapshotへ変換する。説明用`db-mapping.yaml`のtablesは一切再利用せず、entities/relationships/constraintsの明示対応だけを使用する。実測snapshotは`.artifacts/db-live.yaml`へ保存する。型・状態集合・多重度の正本は既存Contract、物理fixtureは比較対象。

対応するPostgreSQLは17のみ。array/domain/非対応型、default/identity/generated、partial/expression/invalid/deferrable unique、非検証FK・cascade・CHECK・trigger・RLS・view・partition/inheritanceなどは`DB_LIVE_UNSUPPORTED`で拒否する。桁数・長さ・timezone・collationの意味や業務データのRule本文は評価しない。db:testはoptional approver、NOT NULL二件、enum、orphan FK、申請ごとの支払unique、receipt uniqueを実動作で確認し、失敗時も接続終了でtransactionを破棄する。業務アプリやRule評価器は追加しない。

通常の`pnpm test`はDocker不要で、DB統合テストを明示的にskipする。`pnpm test:db`はDBを必須とし、利用できなければ失敗する。CIはCompose DBを起動し同じ実測検証を行う。リモートCIの成功は未確認。
