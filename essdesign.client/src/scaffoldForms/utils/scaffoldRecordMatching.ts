// Derived from ESSApp/src/utils/scaffoldRecordMatching.ts; regenerate with scripts/sync-ios-scaffold-forms.py.
export type ScaffoldMatchCandidate<T> = {
  item: T;
  values: Array<string | null | undefined>;
};

export type ScaffoldMatch<T> = {
  item: T;
  score: number;
};

const GENERIC_WORDS = new Set([
  'scaffold',
  'scaffolding',
  'scaff',
  'tag',
  'handover',
  'certificate',
]);

export function normalizeScaffoldName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(token => token && !GENERIC_WORDS.has(token))
    .join(' ');
}

function bigrams(value: string): Set<string> {
  const compact = value.replace(/\s+/g, '');
  if (compact.length < 2) {
    return new Set(compact ? [compact] : []);
  }
  return new Set(Array.from({length: compact.length - 1}, (_, index) =>
    compact.slice(index, index + 2)));
}

function diceSimilarity(left: string, right: string): number {
  const leftBigrams = bigrams(left);
  const rightBigrams = bigrams(right);
  if (!leftBigrams.size || !rightBigrams.size) {
    return left === right ? 1 : 0;
  }
  let shared = 0;
  leftBigrams.forEach(value => {
    if (rightBigrams.has(value)) {
      shared += 1;
    }
  });
  return (2 * shared) / (leftBigrams.size + rightBigrams.size);
}

function editDistance(left: string, right: string): number {
  const rows = left.length + 1;
  const columns = right.length + 1;
  const matrix = Array.from({length: rows}, () => Array<number>(columns).fill(0));
  for (let row = 0; row < rows; row += 1) {
    matrix[row][0] = row;
  }
  for (let column = 0; column < columns; column += 1) {
    matrix[0][column] = column;
  }
  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + substitutionCost,
      );
      if (
        row > 1
        && column > 1
        && left[row - 1] === right[column - 2]
        && left[row - 2] === right[column - 1]
      ) {
        matrix[row][column] = Math.min(matrix[row][column], matrix[row - 2][column - 2] + 1);
      }
    }
  }
  return matrix[left.length][right.length];
}

function tokenSimilarity(queryToken: string, candidateToken: string): number {
  if (queryToken === candidateToken) {
    return 1;
  }
  if (candidateToken.startsWith(queryToken)) {
    return 0.9 + 0.08 * (queryToken.length / candidateToken.length);
  }
  if (queryToken.startsWith(candidateToken) && candidateToken.length >= 2) {
    return 0.78 + 0.12 * (candidateToken.length / queryToken.length);
  }
  if (
    queryToken.length >= 3
    && (candidateToken.includes(queryToken) || queryToken.includes(candidateToken))
  ) {
    return 0.76;
  }
  if (queryToken.length < 3 || candidateToken.length < 3) {
    return 0;
  }
  const editScore = 1 - editDistance(queryToken, candidateToken)
    / Math.max(queryToken.length, candidateToken.length);
  const fuzzyScore = Math.max(editScore, diceSimilarity(queryToken, candidateToken) * 0.9);
  return fuzzyScore >= 0.64 ? fuzzyScore : 0;
}

export function scoreScaffoldNameMatch(query: string, candidate: string): number {
  const normalizedQuery = normalizeScaffoldName(query);
  const normalizedCandidate = normalizeScaffoldName(candidate);
  if (!normalizedQuery || !normalizedCandidate) {
    return 0;
  }
  if (normalizedQuery === normalizedCandidate) {
    return 1;
  }
  const queryTokens = normalizedQuery.split(' ');
  const candidateTokens = normalizedCandidate.split(' ');
  if (normalizedQuery.length <= 2 && queryTokens.length === 1) {
    return candidateTokens.some(token => token.startsWith(normalizedQuery)) ? 0.72 : 0;
  }
  if (
    normalizedCandidate.includes(normalizedQuery)
    || normalizedQuery.includes(normalizedCandidate)
  ) {
    const shorter = Math.min(normalizedQuery.length, normalizedCandidate.length);
    const longer = Math.max(normalizedQuery.length, normalizedCandidate.length);
    return 0.78 + (0.18 * shorter) / longer;
  }

  const tokenCoverage = queryTokens.reduce((total, queryToken) => total + Math.max(
    0,
    ...candidateTokens.map(candidateToken => tokenSimilarity(queryToken, candidateToken)),
  ), 0) / queryTokens.length;
  const phraseSimilarity = diceSimilarity(normalizedQuery, normalizedCandidate);
  return tokenCoverage * 0.78 + phraseSimilarity * 0.22;
}

export function findBestScaffoldMatch<T>(
  query: string,
  candidates: Array<ScaffoldMatchCandidate<T>>,
  minimumScore = 0.62,
): ScaffoldMatch<T> | null {
  const ranked = findScaffoldMatches(query, candidates, minimumScore);

  if (!ranked.length) {
    return null;
  }
  if (ranked[1] && ranked[0].score - ranked[1].score < 0.04) {
    return null;
  }
  return ranked[0];
}

export function findScaffoldMatches<T>(
  query: string,
  candidates: Array<ScaffoldMatchCandidate<T>>,
  minimumScore?: number,
): Array<ScaffoldMatch<T>> {
  const normalizedQuery = normalizeScaffoldName(query);
  if (!normalizedQuery) {
    return [];
  }
  const dynamicMinimum = normalizedQuery.length <= 2
    ? 0.68
    : normalizedQuery.length <= 4
      ? 0.4
      : 0.32;
  const effectiveMinimum = minimumScore ?? dynamicMinimum;
  return candidates
    .map(candidate => ({
      item: candidate.item,
      score: Math.max(
        0,
        ...candidate.values.map(value => scoreScaffoldNameMatch(query, value ?? '')),
      ),
    }))
    .filter(candidate => candidate.score >= effectiveMinimum)
    .sort((left, right) => right.score - left.score);
}
