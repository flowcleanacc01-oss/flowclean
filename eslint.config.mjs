import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Thai UI content มี " ' เยอะ → escape เป็น &quot; ทำ source อ่านยาก (React render ได้ปกติ)
      // เก็บเฉพาะ > } ที่อาจทำ JSX พังจริง
      "react/no-unescaped-entities": ["error", { forbid: [">", "}"] }],
      // react-compiler advisory rules — โปรเจคนี้ไม่ได้เปิด react-compiler (next.config)
      //   set-state-in-effect / preserve-manual-memoization = แนะนำเพื่อ compiler optimization
      //   ไม่ใช่ runtime correctness → ปิดสำหรับ codebase ที่ไม่ใช้ compiler (legit sync patterns เยอะ)
      //   *คงไว้* react-hooks/rules-of-hooks, set-state-in-render, refs, exhaustive-deps (จับ bug จริง)
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/preserve-manual-memoization": "off",
    },
  },
]);

export default eslintConfig;
