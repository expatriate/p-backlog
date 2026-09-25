export function remembered<K, V>(cache: Map<K, V>, key: K, compute: () => V): V {
  if (cache.has(key)) return cache.get(key) as V;
  const value = compute();
  cache.set(key, value);
  return value;
}
