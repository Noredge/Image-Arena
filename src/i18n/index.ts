import english from './en.json';

export type Language = 'zh' | 'en';
let currentLanguage: Language = 'zh';
export const getLanguage = () => currentLanguage;
export function setLanguage(language: Language) { currentLanguage = language; }
export const messages: Readonly<Record<string, string>> = english;
export const dictionaries = { zh: Object.fromEntries(Object.keys(english).map(key => [key, key])), en: messages };

/** Named source sentences keep interpolation values (filenames, paths and IDs) opaque. */
export function t(source: string, values: readonly unknown[] = [], language = currentLanguage): string {
  const template = language === 'en' ? englishTemplate(source, values) : source;
  return template.replace(/\{(\d+)\}/g, (token, index) => index < values.length ? String(values[index] ?? '') : token);
}
const singularNouns: Record<string, string> = { images:'image', files:'file', matches:'match', losses:'loss', points:'point', favorites:'favorite', wins:'win', 'original files':'original file' };
function englishTemplate(source: string, values: readonly unknown[]) {
  let template=messages[source]??source;
  if(Number(values[0])===1) {
    if(source==='{0} 位选手到了。{1}')template='{0} image is in. {1}';
    if(source==='{0} 个文件未加入')template="{0} file wasn't added";
  }
  return template.replace(/\{(\d+)\} (original files|images|files|matches|losses|points|favorites|wins)\b/g,
    (token, index, noun) => Number(values[index])===1 ? `{${index}} ${singularNouns[noun]}` : token);
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function pattern(template: string) {
  const slots: number[] = [];
  let position = 0, result = '^';
  for (const match of template.matchAll(/\{(\d+)\}/g)) {
    result += escape(template.slice(position, match.index)) + '([\\s\\S]*?)';
    slots.push(Number(match[1])); position = match.index! + match[0].length;
  }
  return { regex: new RegExp(result + escape(template.slice(position)) + '$'), slots };
}
const templates = Object.entries(messages).filter(([zh, en]) => /\{\d+\}/.test(zh) && zh !== en)
  .map(([zh, en]) => ({ zh, en, chinese: pattern(zh), english: pattern(en), singular: pattern(englishTemplate(zh, Array(16).fill(1))) }))
  .sort((a, b) => b.zh.replace(/\{\d+\}/g, '').length - a.zh.replace(/\{\d+\}/g, '').length);
const reverse = new Map(Object.entries(messages).map(([zh, en]) => [en, zh]));

/** Translate stored notices and native diagnostics at display time, including after a language change. */
export function message(source: string, language = currentLanguage): string {
  if (messages[source] !== undefined) return t(source, [], language);
  const original = reverse.get(source);
  if (original) return t(original, [], language);
  for (const entry of templates) {
    for (const p of [entry.chinese, entry.english, entry.singular]) {
      const match = p.regex.exec(source);
      if (!match) continue;
      const values: string[] = [];
      p.slots.forEach((slot, index) => { values[slot] = match[index + 1]; });
      // These slots contain app copy, rather than a filename or path.
      const nested: Record<string, number[]> = {
        '{0} 位选手到了。{1}': [1], '本轮退场：{0}。{1}': [1],
        '上次{0}目标目录 {1} 不存在、不可访问或已被替换，请重新选择。': [0],
        '胜者组 · {0}': [0],
        '{0}；临时副本保留于 {1}：{2}': [0],
        '目标已复制并校验，原文件仍保留。{0}；请人工核对，不自动重试。': [0],
        '目标已复制并校验，原文件未移除：{0}。不自动重试。': [0],
        '{0}。源位置已不可见，请检查回收站；不自动重试。': [0],
      };
      for (const slot of nested[entry.zh] ?? []) values[slot] = message(values[slot], language);
      return t(entry.zh, values, language);
    }
  }
  // Native failures may have an Error prefix, or an opaque filename followed by a diagnostic.
  for (const separator of ['Error: ', '：', ':']) {
    for (let index = source.lastIndexOf(separator); index >= 0; index = source.lastIndexOf(separator, index - 1)) {
      const tail = source.slice(index + separator.length);
      const translated = messageTail(tail, language);
      if (translated !== tail) return source.slice(0, index) + (separator === '：' && language === 'en' ? ': ' : separator) + translated;
      if (index === 0) break;
    }
  }
  return source;
}
function messageTail(source: string, language: Language) {
  return message(source, language);
}
