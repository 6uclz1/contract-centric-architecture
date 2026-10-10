import { z } from "zod";
// Reject invisible controls and unpaired surrogates instead of silently dropping them.
export const text = z
  .string()
  .refine(
    (s) =>
      !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(s) &&
      !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
        s,
      ),
    "Unsupported display character",
  );
