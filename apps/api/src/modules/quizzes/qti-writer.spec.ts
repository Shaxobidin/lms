import { questionPayloadSchema, type QuestionPayload } from '@lms/shared';
import { parseQtiXml } from './qti-parser';
import { toXhtml, writeQtiItem, writeQtiManifest, type ExportableQuestion } from './qti-writer';

const uz = (value: string) => ({ 'uz-Latn': value });

function question(
  id: string,
  payload: QuestionPayload,
  extra: Partial<ExportableQuestion> = {},
): ExportableQuestion {
  return {
    id,
    text: uz(`<p>Savol ${id}</p>`),
    payload,
    defaultScore: 2,
    tags: [`T${id}`],
    ...extra,
  };
}

const QUESTIONS: ExportableQuestion[] = [
  question('single', {
    type: 'SINGLE',
    options: [
      { id: 'A', text: uz('Samarqand'), isCorrect: false, weight: 0 },
      { id: 'B', text: uz('Toshkent'), isCorrect: true, weight: 1 },
    ],
  }),
  question('multi', {
    type: 'MULTI',
    penalizeWrong: true,
    options: [
      { id: 'A', text: uz('2'), isCorrect: true, weight: 0.5 },
      { id: 'B', text: uz('4'), isCorrect: false, weight: -0.5 },
      { id: 'C', text: uz('5'), isCorrect: true, weight: 0.5 },
    ],
  }),
  question('cloze', {
    type: 'CLOZE',
    template: uz('Poytaxt [[1]], yil [[2]].'),
    blanks: [
      { key: '1', accepted: ['Toshkent'], caseSensitive: false, points: 1 },
      {
        key: '2',
        accepted: ['1991'],
        caseSensitive: false,
        points: 1,
        options: ['1990', '1991', '1992'],
      },
    ],
  }),
  question('numeric', {
    type: 'NUMERIC',
    correctValue: 3.14,
    tolerance: 0.01,
    unit: 'sm',
    range: { min: 0, max: 10, step: 0.01 },
  }),
  question('essay', { type: 'ESSAY', minWords: 50, maxWords: 0, allowAttachments: false }),
  question('match', {
    type: 'MATCHING',
    left: [
      { id: 'L1', text: uz('Toshkent') },
      { id: 'L2', text: uz('Astana') },
    ],
    right: [
      { id: 'R1', text: uz("Qozog'iston") },
      { id: 'R2', text: uz("O'zbekiston") },
    ],
    pairs: [
      { leftId: 'L1', rightId: 'R2' },
      { leftId: 'L2', rightId: 'R1' },
    ],
  }),
  question('order', {
    type: 'ORDERING',
    items: [
      { id: 'X', text: uz('Bir') },
      { id: 'Y', text: uz('Ikki') },
    ],
    correctOrder: ['X', 'Y'],
  }),
  question('drag', {
    type: 'DRAG_DROP',
    items: [
      { id: 'W1', text: uz('Toshkent') },
      { id: 'W2', text: uz('Buxoro') },
    ],
    zones: [{ id: 'Z1', label: uz('Poytaxt') }],
    placements: [{ itemId: 'W1', zoneId: 'Z1' }],
  }),
  question(
    'hotspot',
    {
      type: 'HOTSPOT',
      imageFileId: '11111111-1111-4111-8111-111111111111',
      areas: [
        { id: 'A', shape: 'RECT', x: 10, y: 10, width: 20, height: 20 },
        { id: 'B', shape: 'CIRCLE', x: 75, y: 50, radius: 10 },
        {
          id: 'C',
          shape: 'POLY',
          x: 50,
          y: 10,
          points: [
            { x: 50, y: 10 },
            { x: 60, y: 30 },
            { x: 40, y: 30 },
          ],
        },
      ],
      requiredAreaIds: ['A'],
    },
    { image: { fileName: 'map.png', width: 400, height: 200 } },
  ),
  question('code', {
    type: 'CODE',
    language: 'python',
    starterCode: 'print(1)',
    testCases: [],
  }),
];

describe('qti-writer', () => {
  it('barcha turlar yoziladi va o`z tahlilchimiz ularni qayta o`qiydi (round-trip)', () => {
    const files = QUESTIONS.map((item) => writeQtiItem(item, 'uz-Latn'));
    expect(files.every(Boolean)).toBe(true);

    const parsed = parseQtiXml(`<root>${files.join('\n')}</root>`, 'uz-Latn');
    expect(parsed.issues).toEqual([]);
    expect(parsed.questions.map((item) => item.payload.type)).toEqual([
      'SINGLE',
      'MULTI',
      'CLOZE',
      'NUMERIC',
      'ESSAY',
      'MATCHING',
      'ORDERING',
      'DRAG_DROP',
      'HOTSPOT',
      'ESSAY', // CODE → extendedText
    ]);
    expect(parsed.questions.map((item) => item.defaultScore)).toEqual(Array(10).fill(2));

    const multi = parsed.questions[1]!.payload as {
      options: Array<{ id: string; isCorrect: boolean; weight: number }>;
    };
    expect(multi.options.filter((option) => option.isCorrect).map((option) => option.id)).toEqual([
      'A',
      'C',
    ]);
    expect(multi.options.find((option) => option.id === 'B')?.weight).toBe(-0.5);

    const cloze = parsed.questions[2]!.payload as {
      blanks: Array<{ accepted: string[]; options?: string[] }>;
    };
    expect(cloze.blanks.map((blank) => blank.accepted[0])).toEqual(['Toshkent', '1991']);
    // Ro'yxatli bo'shliq inlineChoice orqali qaytib keladi
    expect(cloze.blanks[0]!.options).toBeUndefined();
    expect(cloze.blanks[1]!.options).toEqual(['1990', '1991', '1992']);

    const numeric = parsed.questions[3]!.payload as { correctValue: number; range?: unknown };
    expect(numeric.correctValue).toBe(3.14);
    expect(numeric.range).toEqual({ min: 0, max: 10, step: 0.01 });

    const match = parsed.questions[5]!.payload as {
      pairs: Array<{ leftId: string; rightId: string }>;
    };
    expect(match.pairs).toEqual([
      { leftId: 'L1', rightId: 'R2' },
      { leftId: 'L2', rightId: 'R1' },
    ]);

    const hotspot = parsed.questions[8]!;
    expect(hotspot.imageRef).toEqual({ path: '../media/map.png', width: 400, height: 200 });
    const areas = (hotspot.payload as { areas: Array<Record<string, unknown>> }).areas;
    // 10% × 400 = 40 px; 20% × 400 = 80 px kenglik
    expect(areas[0]).toEqual({ id: 'A', shape: 'RECT', x: 40, y: 20, width: 80, height: 40 });
    // POLY: 50% × 400 = 200 px, 10% × 200 = 20 px
    expect(areas[2]).toEqual({
      id: 'C',
      shape: 'POLY',
      x: 200,
      y: 20,
      points: [
        { x: 200, y: 20 },
        { x: 240, y: 60 },
        { x: 160, y: 60 },
      ],
    });

    for (const item of parsed.questions) {
      if (item.payload.type === 'HOTSPOT') continue; // rasm id backend'da to'ldiriladi
      expect(questionPayloadSchema.safeParse(item.payload).success).toBe(true);
    }
  });

  it('rasmsiz HOTSPOT eksport qilinmaydi, manifest resurslarni sanaydi', () => {
    expect(writeQtiItem(question('h', QUESTIONS[8]!.payload), 'uz-Latn')).toBeNull();
    const manifest = writeQtiManifest(
      [
        { id: 'a', file: 'items/a.xml' },
        { id: 'b', file: 'items/b.xml', media: 'media/b.png' },
      ],
      'Bank & Co',
    );
    expect(manifest).toContain('type="imsqti_item_xmlv3p0"');
    expect(manifest).toContain('<title>Bank &amp; Co</title>');
    expect(manifest).toContain('<file href="media/b.png"/>');
  });

  it('toXhtml void teglarni yopadi va entity`larni to`g`rilaydi', () => {
    expect(toXhtml('<p>a<br>b&nbsp;c &amp; d & e</p>')).toBe(
      '<p>a<br/>b&#160;c &amp; d &amp; e</p>',
    );
  });
});
