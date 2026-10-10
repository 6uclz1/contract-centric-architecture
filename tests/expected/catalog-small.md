# Handwritten expected assertions

Expense.amountJpy is a required integer. Expense.status is required state of ExpenseLifecycle.
ExpensePayment permits zero or one Payment per Expense, exactly one Expense per Payment.
ApproveExpense targets Expense, with pre EXP-001/EXP-002 and post EXP-003.
ApprovalNotice is a notification intention, not an implemented delivery guarantee.
EXP-004 is an invariant scoped to relationship ExpensePayment; EXP-006 applies to entity Expense.
PaymentReceiptUnique applies to required ordinary Payment.receiptNumber.
No physical keys, data checks or Rule evaluation are claimed.
