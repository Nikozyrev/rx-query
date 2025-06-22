/**
 * Простая хеш-функция для строк
 * @param str Строка для хеширования
 * @returns Хеш в виде строки
 */
function simpleHash(str: string): string {
  let hash = 0;
  if (str.length === 0) return hash.toString(36);

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  return Math.abs(hash).toString(36);
}

/**
 * Создает уникальный строковый ключ из JSON-сериализуемого значения.
 * При повторном вызове с тем же значением возвращает идентичный результат.
 *
 * @param value - JSON-сериализуемое значение (строка, число, булево, null, массив, объект)
 * @returns Уникальный строковый ключ
 * @throws Ошибку, если значение не может быть сериализовано в JSON
 */
export function createUniqueKey(value: unknown): string {
  // Обработка примитивов и null
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return `str:${value}`;
  if (typeof value === 'number') {
    if (isNaN(value)) return 'num:NaN';
    if (!isFinite(value)) return `num:${value > 0 ? 'Infinity' : '-Infinity'}`;
    return `num:${value}`;
  }
  if (typeof value === 'boolean') return `bool:${value}`;

  // Обработка объектов и массивов (JSON-сериализуемые)
  if (typeof value === 'object' && value !== null) {
    try {
      // Сортируем ключи для стабильного результата
      const canonicalJson = canonicalizeJson(value);
      return `json:${simpleHash(canonicalJson)}`;
    } catch (e) {
      throw new Error(
        `Значение не может быть сериализовано в JSON: ${e}`
      );
    }
  }

  // Для несериализуемых типов выбрасываем ошибку
  throw new Error(`Тип ${typeof value} не может быть сериализован в JSON`);
}

/**
 * Создает каноническое JSON-представление объекта с отсортированными ключами
 * @param value Объект для сериализации
 * @returns Строка JSON с отсортированными ключами
 */
function canonicalizeJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return '[' + value.map(canonicalizeJson).join(',') + ']';
  }

  const keys = Object.keys(value).sort();
  const pairs = keys.map((key) => {
    return (
      JSON.stringify(key) +
      ':' +
      canonicalizeJson((value as Record<string, unknown>)[key])
    );
  });

  return '{' + pairs.join(',') + '}';
}

const KEY_DELIMITER = '::';

/** Генерирует уникальный ключ на основе базового ключа и (опционально) параметров */
export function generateCacheKey(keys: string[]): string {
  return keys.join(KEY_DELIMITER);
}

export function generateCacheKeyArray(keys: unknown[]): string[] {
  return keys.map((key) => `${createUniqueKey(key)}`);
}

export function generateStoreKey(keys: unknown[]): string {
  return generateCacheKey(generateCacheKeyArray(keys));
}

export function splitKey(key: string): string[] {
  return key.split(KEY_DELIMITER);
}
