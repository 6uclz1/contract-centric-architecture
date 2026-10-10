-- Hand-written physical fixture, not generated business logic.
-- State Machine in contract.yaml remains authoritative; db:live detects drift.
CREATE TYPE expense_status AS ENUM ('draft', 'submitted', 'approved', 'rejected', 'paid');
CREATE TABLE users (
  id text CONSTRAINT users_pk PRIMARY KEY,
  name text NOT NULL,
  can_approve boolean NOT NULL
);
CREATE TABLE expenses (
  id text CONSTRAINT expenses_pk PRIMARY KEY,
  amount_jpy integer NOT NULL,
  status expense_status NOT NULL,
  applicant_id text NOT NULL,
  approver_id text,
  CONSTRAINT applicant_fk FOREIGN KEY (applicant_id) REFERENCES users(id),
  CONSTRAINT approver_fk FOREIGN KEY (approver_id) REFERENCES users(id)
);
CREATE TABLE payments (
  id text CONSTRAINT payments_pk PRIMARY KEY,
  receipt_number text NOT NULL,
  paid_at timestamp with time zone NOT NULL,
  expense_id text NOT NULL,
  CONSTRAINT receipt_unique UNIQUE (receipt_number),
  CONSTRAINT expense_unique UNIQUE (expense_id),
  CONSTRAINT expense_fk FOREIGN KEY (expense_id) REFERENCES expenses(id)
);
