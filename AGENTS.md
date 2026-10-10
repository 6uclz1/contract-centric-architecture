# Implementation rules

- Astraを使用する場合は、サブエージェントの利用は禁止。
- `cca-poc-v0.1-revised-plan.md`と`contracts/expenses/contract.yaml`を実装契約として扱う。
- 自然言語Ruleの評価、業務アプリ、公開IR、汎用DSLを追加しない。
- 状態遷移と状態集合の正本はState Machine。
- Relationshipの方向と多重度を勝手に反転しない。
- `docs/generated/`を手で直さず、生成器またはContractを修正してgenerateする。
- 診断コードを安定させ、未対応項目を黙って捨てない。
- 入力言語の意味を変える場合は理由と影響をCHANGELOG.mdに記録する。
- 変更後は`pnpm typecheck`、関連テスト、`pnpm validate`、`pnpm check`を実行する。
- Contractの意味に影響しないリファクタリングではContract更新不要。
- 第三者評価・性能値・CI結果は実測したものだけを報告する。

# Source boundaries

- `docs/source-architecture.md`の責務分割と依存方向を守る。
- Contract基盤・featureに外部I/Oや表示処理を追加しない。feature同士をimportしない。
- 外部I/Oはapplicationのportを介し、入口で具体adapterを接続する。
- `pnpm test`に含まれるarchitecture testでimport・再export・type-only依存と循環を確認する。
