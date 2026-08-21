import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const KB_DIR = path.join(process.cwd(), "content", "kb");

export interface KbFile {
  fileName: string;
  title: string;
  content: string;
}

export async function readKbFiles(): Promise<KbFile[]> {
  const fileNames = (await readdir(KB_DIR)).filter((f) => f.endsWith(".md")).sort();

  const files: KbFile[] = [];
  for (const fileName of fileNames) {
    const content = await readFile(path.join(KB_DIR, fileName), "utf-8");
    const titleMatch = content.match(/^#\s+(.+)$/m);
    files.push({ fileName, title: titleMatch?.[1]?.trim() ?? fileName, content });
  }

  return files;
}
