import { parseCcManifest, parseDiscussionTopic, parseQti12, parseWebLink } from './cc-parser';
import { buildCartridgeEntries, type CcExportModule } from './cc-writer';

const MODULES: CcExportModule[] = [
  {
    id: 'm1',
    title: '1-hafta & kirish',
    topics: [
      {
        id: 't1',
        title: 'Kirish',
        lessons: [
          {
            id: 'l1',
            title: "O'qish",
            html: '<p>Salom <img src="files/l1/pic.png" alt="r"></p>',
            files: [{ path: 'files/l1/pic.png', title: 'pic.png' }],
            links: [{ id: 'lk1', title: 'Manba', url: 'https://example.uz/a?b=1&c=2' }],
          },
        ],
        discussions: [{ id: 'd1', title: 'Savol & javob', html: '<p>Birinchi <b>xabar</b></p>' }],
        quizzes: [
          {
            id: 'q1',
            title: 'Haftalik test',
            durationMinutes: 25,
            questions: [
              {
                id: 'qa',
                text: '<p>Poytaxt?</p>',
                defaultScore: 2,
                payload: {
                  type: 'SINGLE',
                  options: [
                    { id: 'A', text: { 'uz-Latn': 'Samarqand' }, isCorrect: false, weight: 0 },
                    { id: 'B', text: { 'uz-Latn': 'Toshkent' }, isCorrect: true, weight: 1 },
                  ],
                },
              },
              {
                id: 'qb',
                text: 'Tub sonlar?',
                defaultScore: 1,
                payload: {
                  type: 'MULTI',
                  penalizeWrong: true,
                  options: [
                    { id: 'A', text: { 'uz-Latn': '2' }, isCorrect: true, weight: 0.5 },
                    { id: 'B', text: { 'uz-Latn': '4' }, isCorrect: false, weight: 0 },
                    { id: 'C', text: { 'uz-Latn': '5' }, isCorrect: true, weight: 0.5 },
                  ],
                },
              },
              {
                id: 'qc',
                text: 'Insho',
                defaultScore: 3,
                payload: { type: 'ESSAY', minWords: 0, maxWords: 0, allowAttachments: false },
              },
              {
                id: 'qd',
                text: 'Suv',
                defaultScore: 1,
                payload: {
                  type: 'CLOZE',
                  template: { 'uz-Latn': 'Suv formulasi [[1]]' },
                  blanks: [{ key: '1', accepted: ['H2O', 'h2o'], caseSensitive: false, points: 1 }],
                },
              },
              {
                id: 'qe',
                text: 'Xarita',
                defaultScore: 1,
                payload: {
                  type: 'HOTSPOT',
                  imageFileId: '11111111-1111-4111-8111-111111111111',
                  areas: [{ id: 'A', shape: 'RECT', x: 1, y: 1, width: 10, height: 10 }],
                  requiredAreaIds: ['A'],
                },
              },
            ],
          },
        ],
      },
    ],
  },
];

describe('cc-writer', () => {
  it('paket yoziladi va bizning CC tahlilchimiz uni qayta o`qiydi (round-trip)', () => {
    const { entries, skippedQuestions } = buildCartridgeEntries('Sinov kursi', MODULES);

    expect(skippedQuestions).toEqual([{ quizId: 'q1', questionId: 'qe', type: 'HOTSPOT' }]);
    expect(Array.from(entries.keys()).sort()).toEqual([
      'discussions/d1.xml',
      'imsmanifest.xml',
      'lessons/l1.html',
      'links/lk1.xml',
      'quizzes/q1.xml',
    ]);

    const manifest = parseCcManifest(entries.get('imsmanifest.xml')!);
    expect(manifest.title).toBe('Sinov kursi');
    expect(manifest.items.map((item) => item.title)).toEqual(['1-hafta & kirish']);
    const topic = manifest.items[0]!.children[0]!;
    expect(topic.title).toBe('Kirish');
    expect(topic.children.map((item) => item.title)).toEqual([
      "O'qish",
      'Manba',
      'Haftalik test',
      'Savol & javob',
    ]);
    expect(manifest.resources[topic.children[0]!.resourceId!]).toMatchObject({
      kind: 'webcontent',
      href: 'lessons/l1.html',
      files: ['lessons/l1.html', 'files/l1/pic.png'],
    });
    expect(manifest.resources[topic.children[1]!.resourceId!]!.kind).toBe('weblink');
    expect(manifest.resources[topic.children[2]!.resourceId!]!.kind).toBe('assessment');
    expect(manifest.resources[topic.children[3]!.resourceId!]!.kind).toBe('discussion');
    expect(parseDiscussionTopic(entries.get('discussions/d1.xml')!)).toEqual({
      title: 'Savol & javob',
      text: '<p>Birinchi <b>xabar</b></p>',
    });

    expect(parseWebLink(entries.get('links/lk1.xml')!)).toEqual({
      title: 'Manba',
      url: 'https://example.uz/a?b=1&c=2',
    });

    const quiz = parseQti12(entries.get('quizzes/q1.xml')!, 'uz-Latn');
    expect(quiz.title).toBe('Haftalik test');
    expect(quiz.timeLimitMinutes).toBe(25);
    expect(quiz.issues).toEqual([]);
    expect(quiz.questions.map((question) => question.payload.type)).toEqual([
      'SINGLE',
      'MULTI',
      'ESSAY',
      'CLOZE',
    ]);
    const multi = quiz.questions[1]!.payload as {
      options: Array<{ id: string; isCorrect: boolean }>;
    };
    expect(multi.options.filter((option) => option.isCorrect).map((option) => option.id)).toEqual([
      'A',
      'C',
    ]);
    const cloze = quiz.questions[3]!.payload as { blanks: Array<{ accepted: string[] }> };
    expect(cloze.blanks[0]!.accepted).toEqual(['H2O', 'h2o']);
    expect(quiz.questions[0]!.text['uz-Latn']).toBe('<p>Poytaxt?</p>');
  });
});
