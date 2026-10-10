BEGIN;
SET LOCAL statement_timeout = '15s';
DO $probe$
DECLARE
  prefix text := '_cca_probe_' || gen_random_uuid()::text;
  violated text;
BEGIN
  INSERT INTO users VALUES (prefix || '_user', 'DB probe', false);
  -- Optional approver is genuinely nullable; this successful insert is probe 1.
  INSERT INTO expenses VALUES (prefix || '_expense', 100, 'draft', prefix || '_user', NULL);
  INSERT INTO expenses VALUES (prefix || '_other', 100, 'draft', prefix || '_user', NULL);
  INSERT INTO payments VALUES (prefix || '_payment', prefix || '_receipt', now(), prefix || '_expense');
  BEGIN
    INSERT INTO expenses VALUES (prefix || '_null', NULL, 'draft', prefix || '_user', NULL);
    RAISE EXCEPTION 'NOT NULL amount_jpy was not enforced';
  EXCEPTION WHEN not_null_violation THEN
    GET STACKED DIAGNOSTICS violated = COLUMN_NAME;
    IF violated <> 'amount_jpy' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO expenses VALUES (prefix || '_enum', 100, 'invalid'::expense_status, prefix || '_user', NULL);
    RAISE EXCEPTION 'enum state set was not enforced';
  EXCEPTION WHEN invalid_text_representation THEN NULL; END;
  BEGIN
    INSERT INTO payments VALUES (prefix || '_orphan', prefix || '_orphan_receipt', now(), prefix || '_missing');
    RAISE EXCEPTION 'expense_fk was not enforced';
  EXCEPTION WHEN foreign_key_violation THEN
    GET STACKED DIAGNOSTICS violated = CONSTRAINT_NAME;
    IF violated <> 'expense_fk' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO payments VALUES (prefix || '_null_fk', prefix || '_null_receipt', now(), NULL);
    RAISE EXCEPTION 'NOT NULL expense_id was not enforced';
  EXCEPTION WHEN not_null_violation THEN
    GET STACKED DIAGNOSTICS violated = COLUMN_NAME;
    IF violated <> 'expense_id' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO payments VALUES (prefix || '_duplicate_expense', prefix || '_new_receipt', now(), prefix || '_expense');
    RAISE EXCEPTION 'expense_unique was not enforced';
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS violated = CONSTRAINT_NAME;
    IF violated <> 'expense_unique' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO payments VALUES (prefix || '_duplicate_receipt', prefix || '_receipt', now(), prefix || '_other');
    RAISE EXCEPTION 'receipt_unique was not enforced';
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS violated = CONSTRAINT_NAME;
    IF violated <> 'receipt_unique' THEN RAISE; END IF;
  END;
END
$probe$;
ROLLBACK;
