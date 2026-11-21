/**
 * 自動遮罩邏輯 (Letter Hint Masking)
 * 將目標單字或多字片語的每個單字保留首尾字母，中間依字母數替換為底線。
 *
 * 規則：
 * - 多字片語以空白分割，對每個單字獨立處理後再以空白組合：
 *   例如 `nowhere to be found` -> `n_____e t_o b_e f___d` (或依視覺底線顯示)
 * - 若單字帶有常見詞尾變化 (如 -rs, -ed, -ing) 或標準單字：
 *   保留首字母與尾字母（若長度 <= 2，如 "to", "be"，在中間插入底線 `t___o`, `b___e` 以清楚提示首尾字母；
 *   若長度 >= 3，保留第一個字母與最後一個字母，中間每個字母替換為底線，或針對複數如 `factors` 保留詞尾提示）
 */
export function maskWordToken(token: string): string {
  const clean = token.trim();
  if (!clean) return '';

  // 分離前後可能附帶的標點符號
  const match = clean.match(/^([^a-zA-Z]*)([a-zA-Z'-]+)([^a-zA-Z]*)$/);
  if (!match) return clean;

  const [, prefix, word, suffix] = match;

  if (word.length === 1) {
    return `${prefix}${word}___${suffix}`;
  }

  if (word.length === 2) {
    // 例如 "to" -> "t___o", "be" -> "b___e" 符合題目規格範例 `n______e t______o b______e f______d`
    return `${prefix}${word[0]}___${word[1]}${suffix}`;
  }

  // 若單字結尾為常見複數詞形變化 "rs" / "es" 且長度 >= 6 (如 factors -> f_____rs)
  if (word.length >= 6 && (word.toLowerCase().endsWith('rs') || word.toLowerCase().endsWith('ed'))) {
    const first = word[0];
    const tail = word.slice(-2);
    const middleCount = Math.max(3, word.length - 3);
    const underscores = '_'.repeat(middleCount);
    return `${prefix}${first}${underscores}${tail}${suffix}`;
  }

  const first = word[0];
  const last = word[word.length - 1];
  const middleCount = Math.max(3, word.length - 2);
  const underscores = '_'.repeat(middleCount);

  return `${prefix}${first}${underscores}${last}${suffix}`;
}

export function generateLetterHintMask(targetTerm: string | undefined | null): string {
  if (!targetTerm || typeof targetTerm !== 'string') return '';
  return targetTerm
    .trim()
    .split(/\s+/)
    .map((token) => maskWordToken(token))
    .join('  ');
}

/**
 * 計算題幹雜湊 (questionHash)
 * 用於防重複出題演算法：確保使用者不會重複做到相同題幹語境的題目
 */
export function computeQuestionHash(content: string): string {
  const normalized = content.trim().toLowerCase().replace(/\s+/g, ' ');
  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return 'qh_' + (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * 比對使用者在「文意字彙」輸入的答案是否正確
 * 自動忽略大小寫、前後多餘空白與連續空白
 */
export function checkLetterHintAnswer(userAnswer: string, targetTerm: string, baseTerm?: string): boolean {
  const normalize = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/[.,!?;:'"]/g, '')
      .replace(/\s+/g, ' ');

  const userNorm = normalize(userAnswer);
  if (!userNorm) return false;
  if (userNorm === normalize(targetTerm)) return true;
  if (baseTerm && userNorm === normalize(baseTerm)) return true;
  return false;
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

/**
 * 近似拼字判定（Near-Miss Spelling）：
 * 當字數 >= 6 時容許最多 2 個字元差異（字數 4~5 時容許 1 個字元差異），顯示「差一點就對了」提示。
 */
export function isNearMissSpelling(userAnswer: string, targetTerm: string, baseTerm?: string): boolean {
  const normalize = (s: string) =>
    s.trim().toLowerCase().replace(/[.,!?;:'"]/g, '').replace(/\s+/g, ' ');
  const u = normalize(userAnswer);
  const t = normalize(targetTerm);
  if (!u || !t || u === t) return false;
  const maxDist = t.length >= 6 ? 2 : t.length >= 4 ? 1 : 0;
  if (maxDist === 0) return false;
  if (levenshteinDistance(u, t) <= maxDist) return true;
  if (baseTerm) {
    const b = normalize(baseTerm);
    if (b && levenshteinDistance(u, b) <= maxDist) return true;
  }
  return false;
}
