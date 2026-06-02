// 一次性：列出当前 API key 实际可用、且支持 generateContent 的模型 id。
import { readFileSync } from "node:fs";
const dv = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8");
const KEY = dv.match(/GEMINI_API_KEY\s*=\s*(.+)/)![1].trim().replace(/^["']|["']$/g, "");
const res = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models?key=${KEY}&pageSize=200`,
);
const data: any = await res.json();
if (!res.ok) {
  console.error("HTTP", res.status, JSON.stringify(data));
  process.exit(1);
}
const models = (data.models ?? [])
  .filter((m: any) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
  .map((m: any) => m.name.replace(/^models\//, ""));
console.log("支持 generateContent 的模型：");
models.forEach((n: string) => console.log("  " + n));
