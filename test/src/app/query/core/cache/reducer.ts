import { generateCacheKey, splitKey } from "../keys";
import { CacheEntry, CacheAction } from "../types";

export const cacheReducer = (
  cache: Map<string, CacheEntry<any>>,
  action: CacheAction<any>
) => {
  const newCache = new Map(cache);
  switch (action.type) {
    case 'UPDATE':
      newCache.set(generateCacheKey(action.key), {
        data: action.payload,
        timestamp: action.timestamp,
      });
      break;
    case 'INVALIDATE':
      const keys = Array.from(cache.keys());
      keys.forEach((key) => {
        const parts = splitKey(key);
        action.key.every((part) => parts.includes(part)) &&
          newCache.delete(key);
      });
      break;
    case 'CLEAR':
      return new Map();
  }
  return newCache;
};
