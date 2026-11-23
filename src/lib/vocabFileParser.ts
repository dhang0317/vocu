export interface ParsedVocabEntry {
  term: string;
  pos: string;
  definition: string;
}

const POS_REGEX =
  /\b(n\.|v\.|vt\.|vi\.|adj\.|adv\.|prep\.|conj\.|pron\.|interj\.|phr\.|aux\.|art\.|num\.|n\.\/v\.|v\.\/n\.|adj\.\/adv\.|n|v|vt|vi|adj|adv|prep|conj|phr)\b/i;

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function isHeaderOrNoise(line: string): boolean {
  const lower = line.toLowerCase().trim();
  if (!lower) return true;
  if (/^(?:page\s*\d+|-\s*\d+\s*-|\d+)$/i.test(lower)) return true;
  if (/^(?:term|word|vocabulary|單字|字詞)[,\t|]/i.test(lower)) return true;
  if (/^[\|\-\s:=]+$/.test(lower)) return true;
  return false;
}

export function parseVocabText(rawText: string): ParsedVocabEntry[] {
  const lines = rawText.split(/\r?\n/);
  const entries: ParsedVocabEntry[] = [];
  const seen = new Set<string>();

  for (let rawLine of lines) {
    let line = rawLine.trim();
    if (!line || isHeaderOrNoise(line)) continue;

    // Strip leading markdown table pipes
    if (line.startsWith('|') && line.endsWith('|')) {
      line = line.slice(1, -1).trim();
    }

    // Strip leading list numbering or bullets: "1. ", "12) ", "(1) ", "• ", "- ", "* "
    line = line
      .replace(/^(?:\(\d+\)|\d+[\.\):、]|[•●▪▸\-*])\s+/, '')
      .trim();
    if (!line || isHeaderOrNoise(line)) continue;

    let term = '';
    let pos = '';
    let definition = '';

    // 1. Delimiter-based: pipe | or tab \t
    if (line.includes('|') || line.includes('\t')) {
      const sep = line.includes('|') ? '|' : '\t';
      const cols = line.split(sep).map((c) => c.trim()).filter(Boolean);
      if (cols.length >= 3) {
        term = cols[0];
        pos = cols[1];
        definition = cols.slice(2).join(' ');
      } else if (cols.length === 2) {
        term = cols[0];
        const second = cols[1];
        const posMatch = second.match(/^(\(?[a-z./]+\.?\)?)\s+(.+)$/i);
        if (posMatch && POS_REGEX.test(posMatch[1])) {
          pos = posMatch[1].replace(/[()]/g, '');
          definition = posMatch[2].trim();
        } else {
          definition = second;
        }
      }
    }
    // 2. CSV (comma-separated, only if it looks like CSV columns)
    else if (line.includes(',') && splitCsvLine(line).length >= 2 && /[a-zA-Z]/.test(splitCsvLine(line)[0])) {
      const cols = splitCsvLine(line).filter(Boolean);
      if (cols.length >= 3 && POS_REGEX.test(cols[1])) {
        term = cols[0];
        pos = cols[1];
        definition = cols.slice(2).join(', ');
      } else if (cols.length >= 2 && /[\u4e00-\u9fff]/.test(cols.slice(1).join(''))) {
        term = cols[0];
        const rest = cols.slice(1).join(', ');
        const posMatch = rest.match(/^(\(?[a-z./]+\.?\)?)\s+(.+)$/i);
        if (posMatch && POS_REGEX.test(posMatch[1])) {
          pos = posMatch[1].replace(/[()]/g, '');
          definition = posMatch[2].trim();
        } else {
          definition = rest;
        }
      }
    }

    // 3. Fallback: natural text / PDF line ("word (n.) 中文", "word - n. 中文", "word: 中文", "word 中文")
    if (!term || !definition) {
      // Split at first CJK character
      const cjkIdx = line.search(/[\u4e00-\u9fff]/);
      if (cjkIdx > 0) {
        let left = line.slice(0, cjkIdx).trim();
        const right = line.slice(cjkIdx).trim();

        // Strip trailing separators from left: ":", "-", "—", "=", "/"
        left = left.replace(/[\s:\-—=–/]+$/, '').trim();

        // Extract POS from end of left: e.g. "abandon (v.)" or "abandon [vt.]" or "abandon v."
        const bracketPos = left.match(/[\(\[]\s*([a-z./]+\.?)\s*[\)\]]\s*$/i);
        if (bracketPos && POS_REGEX.test(bracketPos[1])) {
          pos = bracketPos[1].trim();
          left = left.slice(0, bracketPos.index).replace(/[\s:\-—=–]+$/, '').trim();
        } else {
          const inlinePos = left.match(/\s+([a-z./]+\.?)\s*$/i);
          if (inlinePos && POS_REGEX.test(inlinePos[1])) {
            pos = inlinePos[1].trim();
            left = left.slice(0, inlinePos.index).replace(/[\s:\-—=–]+$/, '').trim();
          }
        }

        // Remove phonetic transcriptions like /əˈbændən/ or [əˈbændən]
        left = left.replace(/\/[^/]+\/|\[[^\]]+\]/g, '').trim();

        term = left;
        definition = right;
      }
    }

    term = term.replace(/^["']|["']$/g, '').trim();
    pos = pos.replace(/^["']|["']$/g, '').trim();
    definition = definition.replace(/^["']|["']$/g, '').trim();

    if (term && definition && /[a-zA-Z]/.test(term)) {
      const key = term.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        entries.push({ term, pos, definition });
      }
    }
  }

  return entries;
}

export async function extractTextFromPdfFile(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pageTexts: string[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();

    // Group text items by Y coordinate to reconstruct lines accurately
    const linesByY = new Map<number, Array<{ x: number; str: string }>>();
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const transform = item.transform as number[];
      const x = transform[4];
      const y = Math.round(transform[5] / 3) * 3; // 3px tolerance for same line
      if (!linesByY.has(y)) linesByY.set(y, []);
      linesByY.get(y)!.push({ x, str: item.str });
    }

    const sortedYs = Array.from(linesByY.keys()).sort((a, b) => b - a);
    const pageLines = sortedYs.map((y) =>
      linesByY
        .get(y)!
        .sort((a, b) => a.x - b.x)
        .map((i) => i.str)
        .join(' ')
    );
    pageTexts.push(pageLines.join('\n'));
  }

  return pageTexts.join('\n');
}
