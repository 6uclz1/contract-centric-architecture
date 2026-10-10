-- One catalog statement; the caller uses a read-only repeatable-read transaction.
SELECT jsonb_build_object(
  'version', current_setting('server_version_num')::integer,
  'tables', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', c.relname, 'kind', c.relkind, 'rowSecurity', c.relrowsecurity,
      'columns', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', a.attname, 'type', t.typname, 'typeSchema', tn.nspname,
        'typeKind', t.typtype, 'nullable', NOT a.attnotnull,
        'dimensions', a.attndims, 'generated', a.attgenerated, 'identity', a.attidentity, 'hasDefault', a.atthasdef,
        'values', CASE WHEN t.typtype = 'e' THEN
          (SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid = t.oid)
          ELSE NULL END
      ) ORDER BY a.attnum) FROM pg_attribute a
        JOIN pg_type t ON t.oid = a.atttypid JOIN pg_namespace tn ON tn.oid = t.typnamespace
        WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped), '[]'::jsonb),
      'indexes', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', COALESCE(con.conname, ic.relname), 'primary', ix.indisprimary,
        'unique', ix.indisunique, 'valid', ix.indisvalid, 'ready', ix.indisready,
        'partial', ix.indpred IS NOT NULL, 'expression', ix.indexprs IS NOT NULL,
        'immediate', ix.indimmediate, 'method', am.amname,
        'columns', (SELECT jsonb_agg(a.attname ORDER BY k.n) FROM unnest(ix.indkey) WITH ORDINALITY k(num,n)
          LEFT JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.num WHERE k.n <= ix.indnkeyatts)
      ) ORDER BY ic.relname) FROM pg_index ix JOIN pg_class ic ON ic.oid = ix.indexrelid JOIN pg_am am ON am.oid = ic.relam
        LEFT JOIN pg_constraint con ON con.conindid = ix.indexrelid AND con.contype IN ('p','u')
        WHERE ix.indrelid = c.oid AND (ix.indisunique OR ix.indisprimary)), '[]'::jsonb),
      'constraints', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', con.conname, 'kind', con.contype, 'validated', con.convalidated,
        'deferrable', con.condeferrable,
        'columns', (SELECT jsonb_agg(a.attname ORDER BY k.n) FROM unnest(con.conkey) WITH ORDINALITY k(num,n)
          JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.num),
        'targetSchema', ns.nspname, 'targetTable', tc.relname,
        'targetColumns', (SELECT jsonb_agg(a.attname ORDER BY k.n) FROM unnest(con.confkey) WITH ORDINALITY k(num,n)
          JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.num),
        'updateAction', con.confupdtype, 'deleteAction', con.confdeltype, 'match', con.confmatchtype
      ) ORDER BY con.conname) FROM pg_constraint con
        LEFT JOIN pg_class tc ON tc.oid = con.confrelid LEFT JOIN pg_namespace ns ON ns.oid = tc.relnamespace
        WHERE con.conrelid = c.oid), '[]'::jsonb),
      'triggers', (SELECT count(*) FROM pg_trigger tr WHERE tr.tgrelid = c.oid AND NOT tr.tgisinternal),
      'disabledTriggers', (SELECT count(*) FROM pg_trigger tr WHERE tr.tgrelid = c.oid AND tr.tgenabled <> 'O'),
      'inherited', EXISTS (SELECT 1 FROM pg_inherits inh WHERE inh.inhrelid = c.oid)
    ) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r','p','f','v','m')
  ), '[]'::jsonb)
);
