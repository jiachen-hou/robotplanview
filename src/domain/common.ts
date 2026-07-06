export function uniqueStrings(values: Array<string | undefined | null>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])];
}

export function matchesAccountKeyword(value: string | undefined, keyword: string): boolean {
  if (!value) return false;
  const normalizedValue = value.trim().toLowerCase();
  const normalizedKeyword = keyword.trim().toLowerCase();
  if (!normalizedValue || !normalizedKeyword) return false;

  if (normalizedValue === normalizedKeyword) return true;

  const accountPart = normalizedValue.split('@')[0];
  return normalizedValue.includes(normalizedKeyword) || accountPart.includes(normalizedKeyword);
}

export function normalizeLookupKey(value?: string | null): string {
  return String(value || '').trim().toLowerCase();
}

export function formatNamesForLabel(names: string[], emptyText: string): string {
  const uniqueNames = uniqueStrings(names);
  if (uniqueNames.length === 0) return emptyText;
  if (uniqueNames.length <= 2) return uniqueNames.join('、');
  return `${uniqueNames.slice(0, 2).join('、')} 等 ${uniqueNames.length} 个`;
}

export function findByLookupKey<T>(lookupMap: ReadonlyMap<string, T>, value?: string | null): T | undefined {
  const key = normalizeLookupKey(value);
  if (!key) return undefined;
  return lookupMap.get(key)
    || [...lookupMap.entries()].find(([name]) => name.includes(key) || key.includes(name))?.[1];
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(workers);
  return results;
}
