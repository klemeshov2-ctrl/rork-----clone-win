import type { TaskType } from '@/types';

interface ParsedTask {
  type?: TaskType;
  title?: string;
  objectId?: string;
  objectName?: string;
  date?: Date;
  time?: string;
  description?: string;
}

interface ParsedObject {
  name?: string;
  address?: string;
  contactName?: string;
  contactPhone?: string;
}

interface ParsedMaterial {
  name?: string;
  quantity?: number;
  unit?: string;
}

const TASK_TYPE_KEYWORDS: Record<string, TaskType> = {
  'заявка': 'request',
  'заявку': 'request',
  'заявки': 'request',
  'ремонт': 'request',
  'починить': 'request',
  'исправить': 'request',
  'напоминание': 'reminder',
  'напомни': 'reminder',
  'напомнить': 'reminder',
  'напоминалка': 'reminder',
};

const DATE_KEYWORDS: Record<string, () => Date> = {
  'сегодня': () => new Date(),
  'завтра': () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d;
  },
  'послезавтра': () => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d;
  },
};

const MONTHS: Record<string, number> = {
  'января': 0, 'январь': 0,
  'февраля': 1, 'февраль': 1,
  'марта': 2, 'март': 2,
  'апреля': 3, 'апрель': 3,
  'мая': 4, 'май': 4,
  'июня': 5, 'июнь': 5,
  'июля': 6, 'июль': 6,
  'августа': 7, 'август': 7,
  'сентября': 8, 'сентябрь': 8,
  'октября': 9, 'октябрь': 9,
  'ноября': 10, 'ноябрь': 10,
  'декабря': 11, 'декабрь': 11,
};

const UNIT_MAP: Record<string, string> = {
  'штук': 'шт', 'штуки': 'шт', 'штука': 'шт', 'шт': 'шт',
  'метров': 'м', 'метра': 'м', 'метр': 'м', 'м': 'м',
  'килограмм': 'кг', 'килограммов': 'кг', 'кг': 'кг', 'килограмма': 'кг',
  'литров': 'л', 'литра': 'л', 'литр': 'л', 'л': 'л',
  'упаковок': 'уп', 'упаковка': 'уп', 'упаковки': 'уп', 'уп': 'уп',
  'рулонов': 'рул', 'рулона': 'рул', 'рулон': 'рул',
  'бухт': 'бухт', 'бухта': 'бухт', 'бухты': 'бухт',
  'коробок': 'кор', 'коробка': 'кор', 'коробки': 'кор',
};

function normalizeText(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

function findSimilarObject(
  name: string,
  objects: Array<{ id: string; name: string }>
): { id: string; name: string } | undefined {
  const normalized = name.toLowerCase();
  
  const exact = objects.find(o => o.name.toLowerCase() === normalized);
  if (exact) return exact;

  const partial = objects.find(o => {
    const oName = o.name.toLowerCase();
    return oName.includes(normalized) || normalized.includes(oName);
  });
  if (partial) return partial;

  for (const obj of objects) {
    const words = normalized.split(' ');
    const objWords = obj.name.toLowerCase().split(' ');
    const matchCount = words.filter(w => objWords.some(ow => ow.includes(w) || w.includes(ow))).length;
    if (matchCount >= Math.max(1, Math.floor(words.length * 0.5))) {
      return obj;
    }
  }

  return undefined;
}

function extractTime(text: string): { time: string; remaining: string } | null {
  console.log('[voiceParser:extractTime] Input:', text);

  const timePatterns: Array<{ regex: RegExp; getHM: (m: RegExpMatchArray) => { h: number; m: number } | null }> = [
    {
      regex: /в\s+(\d{1,2})[:.](\d{2})\s+утра/,
      getHM: (m) => {
        let h = parseInt(m[1]);
        if (h === 12) h = 0;
        return { h, m: parseInt(m[2]) };
      },
    },
    {
      regex: /в\s+(\d{1,2})[:.](\d{2})\s+(?:вечера|дня)/,
      getHM: (m) => {
        let h = parseInt(m[1]);
        if (h < 12) h += 12;
        return { h, m: parseInt(m[2]) };
      },
    },
    {
      regex: /в\s+(\d{1,2})\s+утра/,
      getHM: (m) => {
        let h = parseInt(m[1]);
        if (h === 12) h = 0;
        return { h, m: 0 };
      },
    },
    {
      regex: /в\s+(\d{1,2})\s+(?:вечера|дня)/,
      getHM: (m) => {
        let h = parseInt(m[1]);
        if (h < 12) h += 12;
        return { h, m: 0 };
      },
    },
    {
      regex: /в\s+(\d{1,2})[:.](\d{2})/,
      getHM: (m) => ({ h: parseInt(m[1]), m: parseInt(m[2]) }),
    },
    {
      regex: /в\s+(\d{1,2})\s+час(?:ов|а|ы)?(?:\s+(\d{1,2})\s*(?:минут(?:а|ы)?)?)?/,
      getHM: (m) => ({ h: parseInt(m[1]), m: m[2] ? parseInt(m[2]) : 0 }),
    },
    {
      regex: /(\d{1,2})[:.](\d{2})/,
      getHM: (m) => ({ h: parseInt(m[1]), m: parseInt(m[2]) }),
    },
  ];

  for (const { regex, getHM } of timePatterns) {
    const match = text.match(regex);
    if (match) {
      const result = getHM(match);
      if (result && result.h >= 0 && result.h <= 23 && result.m >= 0 && result.m <= 59) {
        const time = `${String(result.h).padStart(2, '0')}:${String(result.m).padStart(2, '0')}`;
        const remaining = text.replace(match[0], ' ').replace(/\s+/g, ' ').trim();
        console.log('[voiceParser:extractTime] Found time:', time, '| Remaining:', remaining);
        return { time, remaining };
      }
    }
  }
  console.log('[voiceParser:extractTime] No time found');
  return null;
}

function extractDate(text: string): { date: Date; remaining: string } | null {
  console.log('[voiceParser:extractDate] Input:', text);

  for (const [keyword, getDate] of Object.entries(DATE_KEYWORDS)) {
    if (text.includes(keyword)) {
      const date = getDate();
      const remaining = text.replace(keyword, ' ').replace(/\s+/g, ' ').trim();
      console.log('[voiceParser:extractDate] Found keyword:', keyword, '| Date:', date.toLocaleDateString('ru-RU'), '| Remaining:', remaining);
      return { date, remaining };
    }
  }

  const throughMatch = text.match(/через\s+(\d+)\s+(день|дня|дней)/);
  if (throughMatch) {
    const days = parseInt(throughMatch[1]);
    const d = new Date();
    d.setDate(d.getDate() + days);
    const remaining = text.replace(throughMatch[0], ' ').replace(/\s+/g, ' ').trim();
    console.log('[voiceParser:extractDate] Found "через N дней":', days, '| Date:', d.toLocaleDateString('ru-RU'), '| Remaining:', remaining);
    return { date: d, remaining };
  }

  for (const [monthName, monthIndex] of Object.entries(MONTHS)) {
    const patternWithYear = new RegExp(`(\\d{1,2})\\s+${monthName}\\s+(\\d{4})`);
    const matchWithYear = text.match(patternWithYear);
    if (matchWithYear) {
      const day = parseInt(matchWithYear[1]);
      const year = parseInt(matchWithYear[2]);
      const d = new Date(year, monthIndex, day);
      const remaining = text.replace(matchWithYear[0], ' ').replace(/\s+/g, ' ').trim();
      console.log('[voiceParser:extractDate] Found date with year:', d.toLocaleDateString('ru-RU'), '| Remaining:', remaining);
      return { date: d, remaining };
    }

    const pattern = new RegExp(`(\\d{1,2})\\s+${monthName}`);
    const match = text.match(pattern);
    if (match) {
      const day = parseInt(match[1]);
      const d = new Date();
      d.setMonth(monthIndex, day);
      d.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (d < today) {
        d.setFullYear(d.getFullYear() + 1);
      }
      const remaining = text.replace(match[0], ' ').replace(/\s+/g, ' ').trim();
      console.log('[voiceParser:extractDate] Found date with month:', d.toLocaleDateString('ru-RU'), '| Remaining:', remaining);
      return { date: d, remaining };
    }
  }

  const dotDateMatch = text.match(/(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?/);
  if (dotDateMatch) {
    const day = parseInt(dotDateMatch[1]);
    const month = parseInt(dotDateMatch[2]) - 1;
    let year: number;
    if (dotDateMatch[3]) {
      year = parseInt(dotDateMatch[3]);
      if (year < 100) year += 2000;
    } else {
      year = new Date().getFullYear();
      const d = new Date(year, month, day);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (d < today) year++;
    }
    const d = new Date(year, month, day);
    if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
      const remaining = text.replace(dotDateMatch[0], ' ').replace(/\s+/g, ' ').trim();
      console.log('[voiceParser:extractDate] Found dot date:', d.toLocaleDateString('ru-RU'), '| Remaining:', remaining);
      return { date: d, remaining };
    }
  }

  console.log('[voiceParser:extractDate] No date found');
  return null;
}

export function parseTaskVoice(
  text: string,
  existingObjects: Array<{ id: string; name: string }>
): ParsedTask {
  const result: ParsedTask = {};
  let remaining = normalizeText(text);
  console.log('[voiceParser:parseTaskVoice] Normalized input:', remaining);

  for (const [keyword, type] of Object.entries(TASK_TYPE_KEYWORDS)) {
    if (remaining.includes(keyword)) {
      result.type = type;
      remaining = remaining.replace(keyword, ' ').replace(/\s+/g, ' ').trim();
      console.log('[voiceParser:parseTaskVoice] Type:', type, '| Remaining:', remaining);
      break;
    }
  }

  remaining = remaining
    .replace(/^\s*(создай|создать|добавь|добавить|новую|новая|новый|новое)\s*(задачу|задача)?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  console.log('[voiceParser:parseTaskVoice] After trigger cleanup:', remaining);

  const timeResult = extractTime(remaining);
  if (timeResult) {
    result.time = timeResult.time;
    remaining = timeResult.remaining;
  }

  const dateResult = extractDate(remaining);
  if (dateResult) {
    result.date = dateResult.date;
    remaining = dateResult.remaining;
  }

  for (const obj of existingObjects) {
    const objNameLower = obj.name.toLowerCase();
    if (remaining.includes(objNameLower)) {
      result.objectId = obj.id;
      result.objectName = obj.name;
      remaining = remaining.replace(objNameLower, '').trim();
      break;
    }
  }

  if (!result.objectId) {
    const objPatterns = [
      /(?:на объекте|объект|для объекта|по объекту)\s+[«"]?(.+?)[»"]?(?:\s|$)/,
    ];
    for (const pattern of objPatterns) {
      const match = remaining.match(pattern);
      if (match) {
        const found = findSimilarObject(match[1], existingObjects);
        if (found) {
          result.objectId = found.id;
          result.objectName = found.name;
          remaining = remaining.replace(match[0], '').trim();
        }
        break;
      }
    }
  }

  remaining = remaining
    .replace(/^\s*(создай|создать|добавь|добавить|новую|новая|новый|новое|задачу|задача)\s*/i, '')
    .replace(/\s*(на объекте|для объекта|по объекту|на объект|объект)\s*/i, ' ')
    .replace(/\s*(по|на|в|к|для)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  console.log('[voiceParser:parseTaskVoice] Title after cleanup:', remaining);

  if (remaining) {
    result.title = remaining.charAt(0).toUpperCase() + remaining.slice(1);
  }

  console.log('[voiceParser:parseTaskVoice] Final result:', JSON.stringify(result, null, 2));
  return result;
}

export function parseObjectVoice(text: string): ParsedObject {
  const result: ParsedObject = {};
  let remaining = normalizeText(text);

  remaining = remaining
    .replace(/^\s*(создай|создать|добавь|добавить|новый|новая|новое)\s*(объект)?\s*/i, '')
    .trim();

  const addressPatterns = [
    /(?:адрес|находится по адресу|по адресу|расположен по)\s+(.+?)(?:\s*(?:ответственный|контакт|контактное лицо|телефон)|$)/,
    /(?:улица|ул\.?)\s+(.+?)(?:\s*(?:ответственный|контакт|телефон)|$)/,
  ];

  for (const pattern of addressPatterns) {
    const match = remaining.match(pattern);
    if (match) {
      result.address = match[1].trim();
      remaining = remaining.replace(match[0], match[0].replace(match[1], '')).trim();
      break;
    }
  }

  const contactPatterns = [
    /(?:ответственный|контакт|контактное лицо)\s+(.+?)(?:\s*(?:телефон|номер)|$)/,
  ];

  for (const pattern of contactPatterns) {
    const match = remaining.match(pattern);
    if (match) {
      result.contactName = match[1].trim();
      remaining = remaining.replace(match[0], '').trim();
      break;
    }
  }

  const phoneMatch = remaining.match(/(?:телефон|номер)\s+([\d\s\-+()]+)/);
  if (phoneMatch) {
    result.contactPhone = phoneMatch[1].replace(/\s+/g, '').trim();
    remaining = remaining.replace(phoneMatch[0], '').trim();
  }

  remaining = remaining
    .replace(/(?:адрес|ответственный|контакт|телефон|номер)\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (remaining) {
    result.name = remaining.charAt(0).toUpperCase() + remaining.slice(1);
  }

  return result;
}

export function parseMaterialVoice(text: string): ParsedMaterial {
  const result: ParsedMaterial = {};
  let remaining = normalizeText(text);
  console.log('[voiceParser:parseMaterialVoice] Normalized input:', remaining);

  remaining = remaining
    .replace(/^\s*(создай|создать|добавь|добавить|новый|новая|новое)\s*(материал|позицию)?\s*/i, '')
    .trim();
  console.log('[voiceParser:parseMaterialVoice] After trigger cleanup:', remaining);

  const unitWords = 'штук[аи]?|шт|метров|метра|метр|м|килограммов|килограмма|килограмм|кг|литров|литра|литр|л|упаковок|упаковки|упаковка|уп|рулонов|рулона|рулон|бухт[аы]?|коробок|коробки|коробка|кор';

  const qtyWithUnitRegex = new RegExp(`(\\d+(?:[,.]\\d+)?)\\s*(${unitWords})`, 'i');
  const qtyWithUnitMatch = remaining.match(qtyWithUnitRegex);

  if (qtyWithUnitMatch) {
    const rawQty = qtyWithUnitMatch[1].replace(',', '.');
    result.quantity = parseFloat(rawQty);
    if (Number.isInteger(result.quantity)) result.quantity = Math.round(result.quantity);
    const unitKey = qtyWithUnitMatch[2].toLowerCase();
    result.unit = UNIT_MAP[unitKey] || unitKey;
    remaining = remaining.replace(qtyWithUnitMatch[0], ' ').replace(/\s+/g, ' ').trim();
    console.log('[voiceParser:parseMaterialVoice] Found qty+unit:', result.quantity, result.unit);
  } else {
    const trailingQtyRegex = /(\d+(?:[,.]\d+)?)\s*$/;
    const trailingMatch = remaining.match(trailingQtyRegex);
    if (trailingMatch) {
      const rawQty = trailingMatch[1].replace(',', '.');
      result.quantity = parseFloat(rawQty);
      if (Number.isInteger(result.quantity)) result.quantity = Math.round(result.quantity);
      remaining = remaining.replace(trailingMatch[0], '').trim();
      console.log('[voiceParser:parseMaterialVoice] Found trailing qty:', result.quantity);
    } else {
      const standaloneQtyRegex = /(?:^|\s)(\d+(?:[,.]\d+)?)(?:\s|$)/;
      const standaloneMatch = remaining.match(standaloneQtyRegex);
      if (standaloneMatch) {
        const rawQty = standaloneMatch[1].replace(',', '.');
        result.quantity = parseFloat(rawQty);
        if (Number.isInteger(result.quantity)) result.quantity = Math.round(result.quantity);
        remaining = remaining.replace(standaloneMatch[1], ' ').replace(/\s+/g, ' ').trim();
        console.log('[voiceParser:parseMaterialVoice] Found standalone qty:', result.quantity);
      }
    }
  }

  remaining = remaining.replace(/\s+/g, ' ').trim();

  if (remaining) {
    result.name = remaining.charAt(0).toUpperCase() + remaining.slice(1);
  }

  console.log('[voiceParser:parseMaterialVoice] Final result:', JSON.stringify(result));
  return result;
}
