# 経費精算 — 手書きベースライン

API対応: cca.dev/v1alpha1 / モデルID: expenses。背景は[domain.md](../../../contracts/expenses/domain.md)。図は[ER](model.mmd)、[概念クラス](class.mmd)、[状態](state.mmd)。構造情報は本書で網羅する。

## Entity・フィールド

| Entity | Field | Type | Required | 説明 |
| --- | --- | --- | --- | --- |
| User（利用者） | id | string | true | |
| User | name | string | true | |
| User | canApprove | boolean | true | |
| Expense（経費申請） | id | string | true | |
| Expense | amountJpy | integer | true | 申請額。単位は円 |
| Expense | status | state (ExpenseLifecycle) | true | |
| Payment（支払記録） | id | string | true | |
| Payment | receiptNumber | string | true | |
| Payment | paidAt | datetime | true | |

## Relationship

| ID・名称 | from → to | targetsPerSource | sourcesPerTarget |
| --- | --- | --- | --- |
| ExpenseApplicant・申請者 | Expense → User | 1..1 | 0..many |
| ExpenseApprover・承認者 | Expense → User | 0..1 | 0..many |
| ExpensePayment・支払記録 | Expense → Payment | 0..1 | 1..1 |

多重度はすべての有効な業務状態で成立させたい静的制約。状態依存の必須性はRuleで表す。

## Machine

ExpenseLifecycleはExpense.statusに結び付く。状態集合はdraft / submitted / approved / rejected / paid、初期状態draft。

| Transition | from → to | Command |
| --- | --- | --- |
| Submit | draft → submitted | SubmitExpense |
| Approve | submitted → approved | ApproveExpense |
| Reject | submitted → rejected | RejectExpense |
| RecordPaid | approved → paid | RecordPayment |

paidとrejectedから出る遷移はない。終端の特別な意味、guard分岐、暗黙遷移は定義しない。

## Command

全CommandのtargetはExpense。Ruleリンクはpre/postを区別する。

| ID・名称 | preconditions | postconditions | effects |
| --- | --- | --- | --- |
| SubmitExpense・申請する | なし | なし | なし |
| ApproveExpense・承認する | [EXP-001](#exp-001), [EXP-002](#exp-002) | [EXP-003](#exp-003) | ApprovalNotice |
| RejectExpense・却下する | [EXP-002](#exp-002) | なし | なし |
| RecordPayment・完了済み支払を記録する | なし | [EXP-005](#exp-005) | なし |

ApprovalNotice（notification、ApproveExpense内）: 申請者に承認結果を通知する意図。配送の実装・保証は対象外

Effectsの順序は実行順序ではない。宛先・配送保証・リトライ・失敗時状態・outboxは定義しない。

## Rule

### EXP-001

kind: precondition / scope: entity Expense

操作者は対象申請の申請者本人ではない

### EXP-002

kind: precondition / scope: entity Expense

操作者は承認権限を持つ。v0.1では承認と却下に共通して必要

### EXP-003

kind: postcondition / scope: entity Expense

成功後、対象申請の承認者として操作者が記録される

### EXP-004

kind: invariant / scope: relationship ExpensePayment

一申請の支払記録は最大一件。構造上の正本はExpensePaymentの多重度

### EXP-005

kind: postcondition / scope: entity Expense

成功後、対象申請に対応するPaymentが一件存在する

### EXP-006

kind: invariant / scope: entity Expense

statusがpaidである申請には、対応するPaymentが一件存在する

preは操作前、postは成功後、invariantは対象の有効な状態に常に成立させたい性質。文章は宣言であり、業務データへの評価エンジンはない。

## Constraint

PaymentReceiptUnique: kind unique / entity Payment / fields [receiptNumber]。required:trueの通常フィールドの一意性宣言。実データ重複、DB index、Relationshipとの横断推論は検証しない。

## 描画規約・保証範囲

ER点線は識別関係の判定に使わない。物理PK/FK/UKを付けない。概念クラス図のCommandは実装メソッドではない。

validateの確認範囲は入力構造、参照、定義済みモデル整合性。Rule本文の意味・成立、実データ、本番実装、DB制約、外部作用を確認しない。

ERはCommand/Rule/Effect/Constraint/状態集合と遷移を省略。クラス図はRule/Effect/Constraint/状態集合と遷移・requiredを省略。状態図はフィールド/関連/invariant/Effect/Constraintを省略。本一覧で確認する。基準モデルの警告はなし。
