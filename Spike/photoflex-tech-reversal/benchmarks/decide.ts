import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { decideFramework, type DecisionInput } from "../packages/benchmark-core/src/index.ts";

const inputPath = process.argv[2] ?? join(process.cwd(), "results", "comparison.json");
const outputPath = join(process.cwd(), "results", "verdict.md");
const envelope = JSON.parse(await readFile(inputPath, "utf8")) as { readyForDecision?: boolean; decisionInput?: DecisionInput };
if (!envelope.readyForDecision || !envelope.decisionInput) {
  throw new Error("Formal evidence is incomplete. Set readyForDecision=true and provide decisionInput only after all mandatory gates are measured.");
}
const input = envelope.decisionInput;
const decision = decideFramework(input);
const markdown = `# PhotoFlex 技术反转结论\n\n结论：**${decision.label}**\n\n环境与 Gate 输入：\`${inputPath}\`\n\n## 决策理由\n\n${decision.reasons.map((reason) => `- ${reason}`).join("\n")}\n`;
await writeFile(outputPath, markdown, "utf8");
console.log(JSON.stringify({ outputPath, decision }, null, 2));
