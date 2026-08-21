// Character-based token approximation (~4 chars/token for English) — avoids a tokenizer
// dependency for a KB this small. See specs/02-rag-pipeline.md for the target values.
const CHARS_PER_TOKEN = 4;
const TARGET_CHUNK_CHARS = 400 * CHARS_PER_TOKEN;
const OVERLAP_CHARS = 60 * CHARS_PER_TOKEN;

export function chunkMarkdown(content: string): string[] {
  const sections = splitByHeaders(content);
  const chunks: string[] = [];

  for (const section of sections) {
    if (section.length <= TARGET_CHUNK_CHARS) {
      chunks.push(section);
      continue;
    }
    chunks.push(...packUnits(splitByParagraphs(section)));
  }

  return chunks;
}

function packUnits(units: string[]): string[] {
  const packed: string[] = [];
  let current = "";

  for (const unit of units) {
    const pieces = unit.length > TARGET_CHUNK_CHARS ? splitBySentences(unit) : [unit];

    for (const piece of pieces) {
      const candidate = current ? `${current}\n\n${piece}` : piece;

      if (candidate.length > TARGET_CHUNK_CHARS && current) {
        packed.push(current);
        current = `${current.slice(-OVERLAP_CHARS)}\n\n${piece}`;
      } else {
        current = candidate;
      }
    }
  }

  if (current) packed.push(current);
  return packed;
}

function splitByHeaders(markdown: string): string[] {
  const rawSections = markdown
    .split(/\n(?=##\s)/g)
    .map((s) => s.trim())
    .filter(Boolean);

  if (rawSections.length <= 1) return rawSections;

  // Anything before the first "## " header (the H1 title, any preamble) is merged into the
  // first real section instead of becoming its own chunk — a title-only chunk has almost no
  // content but can still win retrieval on title-text similarity, starving out the chunks that
  // actually answer the question.
  const [preamble, ...sections] = rawSections;
  sections[0] = `${preamble}\n\n${sections[0]}`;
  return sections;
}

function splitByParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function splitBySentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
