import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { ingestKnowledgeBase } from "@/modules/bot/application/ingest-knowledge-base";

async function main() {
  const results = await ingestKnowledgeBase();

  for (const r of results) {
    const label = r.skipped ? "skip (unchanged)" : `wrote ${r.chunksWritten} chunks`;
    console.log(`${r.fileName.padEnd(30)} ${label}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
