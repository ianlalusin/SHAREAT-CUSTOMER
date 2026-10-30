import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const eslintConfig = [
  { ignores: [".next/**", ".claude/**", "node_modules/**", "marketing/**", "scripts/**", "next-env.d.ts"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Audit BLD-02. The app already has ~485 explicit `any` types. Turning
      // them all into errors would block every build, so they are warnings and
      // `npm run lint` caps the total (--max-warnings): the count can go down,
      // never up. Burn it down file by file; do not raise the cap.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
];

export default eslintConfig;
