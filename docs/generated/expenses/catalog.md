# 経費精算 (expenses)

API: cca.dev/v1alpha1



## Entities

### Expense: 経費申請



| Field | Type | Required | Description |
| --- | --- | --- | --- |
| amountJpy | integer | true | 申請額。単位は円 |
| id | string | true |  |
| status | state (ExpenseLifecycle) | true |  |

### Payment: 支払記録



| Field | Type | Required | Description |
| --- | --- | --- | --- |
| id | string | true |  |
| paidAt | datetime | true |  |
| receiptNumber | string | true |  |

### User: 利用者



| Field | Type | Required | Description |
| --- | --- | --- | --- |
| canApprove | boolean | true |  |
| id | string | true |  |
| name | string | true |  |

## Relationships

| ID / Name | From → To | Targets per source | Sources per target | Description |
| --- | --- | --- | --- | --- |
| ExpenseApplicant: 申請者 | Expense → User | 1..1 | 0..* |  |
| ExpenseApprover: 承認者 | Expense → User | 0..1 | 0..* |  |
| ExpensePayment: 支払記録 | Expense → Payment | 0..1 | 1..1 |  |

## State Machines

### ExpenseLifecycle

Entity / field: Expense.status

States: approved, draft, paid, rejected, submitted; initial: draft



| Transition | From → To | Command | Description |
| --- | --- | --- | --- |
| Approve | submitted → approved | ApproveExpense |  |
| RecordPaid | approved → paid | RecordPayment |  |
| Reject | submitted → rejected | RejectExpense |  |
| Submit | draft → submitted | SubmitExpense |  |

## Commands

### ApproveExpense: 承認する

Target: Expense



Preconditions: [EXP-001](#rule-4558502d303031), [EXP-002](#rule-4558502d303032)

Postconditions: [EXP-003](#rule-4558502d303033)

Effects (unordered notification intentions):

- ApprovalNotice (notification): 申請者に承認結果を通知する意図。配送の実装・保証は対象外

### RecordPayment: 完了済み支払を記録する

Target: Expense



Preconditions: —

Postconditions: [EXP-005](#rule-4558502d303035)

Effects (unordered notification intentions):

—

### RejectExpense: 却下する

Target: Expense



Preconditions: [EXP-002](#rule-4558502d303032)

Postconditions: —

Effects (unordered notification intentions):

—

### SubmitExpense: 申請する

Target: Expense



Preconditions: —

Postconditions: —

Effects (unordered notification intentions):

—

## Rules

<a id="rule-4558502d303031"></a>

### EXP-001 (precondition)

Scope: entity Expense

操作者は対象申請の申請者本人ではない

<a id="rule-4558502d303032"></a>

### EXP-002 (precondition)

Scope: entity Expense

操作者は承認権限を持つ。v0.1では承認と却下に共通して必要

<a id="rule-4558502d303033"></a>

### EXP-003 (postcondition)

Scope: entity Expense

成功後、対象申請の承認者として操作者が記録される

<a id="rule-4558502d303034"></a>

### EXP-004 (invariant)

Scope: relationship ExpensePayment

一申請の支払記録は最大一件。構造上の正本はExpensePaymentの多重度

<a id="rule-4558502d303035"></a>

### EXP-005 (postcondition)

Scope: entity Expense

成功後、対象申請に対応するPaymentが一件存在する

<a id="rule-4558502d303036"></a>

### EXP-006 (invariant)

Scope: entity Expense

statusがpaidである申請には、対応するPaymentが一件存在する

## Constraints

| ID | Kind | Entity | Fields | Description |
| --- | --- | --- | --- | --- |
| PaymentReceiptUnique | unique | Payment | receiptNumber |  |

## Drawing conventions and validation boundaries

ER uses dotted non-identifying connectors (`..`); line style is a drawing convention only and is not used to determine identifying relationships. No physical PK / FK / UK is claimed. ER field IDs reserved by Mermaid (PK/FK/UK, case-insensitive, including hyphen suffixes) and IDs beginning with cca_field_ use collision-free cca_field_ aliases; the attribute comment preserves the original ID.

Validated: input structure, references, and defined model consistency.

Not validated: meaning or satisfiability of Rule prose, real data, production implementation, DB constraints, and external effects.

Omissions: ER omits Commands, state sets/transitions, Rules, Effects, Constraints and descriptions. Class omits state sets/transitions, Rules, Effects, Constraints, required flags, enum values and descriptions. State omits fields, Relationships, invariant Rules, Effects, Constraints and Command names/descriptions. Catalog includes the complete structured specification.

## Warnings

None.
