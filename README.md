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

YAML解析・SourceMap → strict Zod schema → 参照・意味検証 → ASCII ID順の内部IR → 四Generator → CLI出力。検証済みIRに配列と種類別ID索引を持たせ、SourceMapと位置を生成物から分離する。ノードIDは種類・スコープ・元IDをUTF-8 hex符号化して作る。表示名からIDを作らず、図種別ごとに構文記号をエスケープする。

IRは内部専用。配列は集合として正規化、initialのみ明示値を使う。Rule本文変更はcatalogだけに現れる。状態遷移の正本はMachine、関連の正本はRelationship。物理キーや外部IDフィールドを推測しない。

## 評価と限界

M1〜M3の技術検証とM4の第三者比較を区別する。比較用の手書きMarkdownと三図、5問の採点基準、変更レビュー課題、CSV記録欄を用意した。第三者の有用性評価は未実施であり、CCA仮説の採択は保留。

成功したvalidateが保証するのは入力構造・参照・列挙したモデル整合性。Rule本文の意味、業務データ、アプリ実装、DB制約、通知配送や送金を保証しない。詳細は[結果記録](docs/evaluation/results.md)。
