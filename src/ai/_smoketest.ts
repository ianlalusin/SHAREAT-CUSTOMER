import { ai } from "./genkit";

async function main() {
  const r = await ai.generate({
    prompt: "Reply with exactly: OK",
  });
  console.log(r.text);
}

main().catch((e) => {
  console.error("SMOKETEST ERROR:", e?.message ?? e);
  process.exit(1);
});
