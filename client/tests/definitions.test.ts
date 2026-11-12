import { describe, expect, it } from 'vitest';
import { formatDefinitions, stripHtml } from '../src/dict/definitions';

describe('stripHtml', () => {
  it('убирает теги и раскодирует entities', () => {
    expect(stripHtml('<b>отряд</b>')).toBe('отряд');
    expect(stripHtml('то, что <a href="./слово">строится</a>')).toBe('то, что строится');
    expect(stripHtml('медведь &amp; волк')).toBe('медведь & волк');
    expect(stripHtml('&quot;ёлка&quot;')).toBe('"ёлка"');
    expect(stripHtml('&lt;скобки&gt;')).toBe('<скобки>');
    expect(stripHtml('a&nbsp;&nbsp;b')).toBe('a b');
    expect(stripHtml('<style>.x{color:red}</style>текст')).toBe('текст');
  });

  it('схлопывает пробелы и может вернуть пустую строку', () => {
    expect(stripHtml('  несколько   пробелов  ')).toBe('несколько пробелов');
    expect(stripHtml('<br/>')).toBe('');
  });
});

describe('formatDefinitions', () => {
  it('достаёт русские толкования и дедуплицирует', () => {
    const api = {
      ru: [
        {
          partOfSpeech: 'существительное',
          definitions: [{ definition: 'небольшой <b>отряд</b>' }, { definition: '' }, { definition: 'небольшой отряд' }],
        },
        { definitions: [{ definition: 'объект <a href="/wiki/x">строительства</a>' }] },
      ],
      en: [{ definitions: [{ definition: 'squad' }] }],
    };
    expect(formatDefinitions(api)).toEqual(['небольшой отряд', 'объект строительства']);
  });

  it('защита от мусорного ответа', () => {
    expect(formatDefinitions(null)).toEqual([]);
    expect(formatDefinitions('строка')).toEqual([]);
    expect(formatDefinitions({})).toEqual([]);
    expect(formatDefinitions({ en: [{ definitions: [{ definition: 'x' }] }] })).toEqual([]);
    expect(
      formatDefinitions({ ru: [null, { definitions: null }, { definitions: [null, { definition: 5 }, { definition: 'тест' }] }] }),
    ).toEqual(['тест']);
  });

  it('ограничивает количество и длину толкований', () => {
    const six = { ru: [{ definitions: [1, 2, 3, 4, 5, 6].map((n) => ({ definition: 'определение ' + n })) }] };
    expect(formatDefinitions(six)).toHaveLength(4);

    const long = { ru: [{ definitions: [{ definition: 'д'.repeat(250) }] }] };
    const truncated = formatDefinitions(long)[0] ?? '';
    expect(truncated).toHaveLength(200);
    expect(truncated.endsWith('…')).toBe(true);
  });
});
