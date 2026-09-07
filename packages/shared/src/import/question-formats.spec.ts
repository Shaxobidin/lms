import { describe, expect, it } from 'vitest';
import { questionPayloadSchema } from '../schemas/quiz';
import { parseAiken, parseCsv, parseGift } from './question-formats';

/** Har bir tahlil natijasi ichki sxemadan o'tishi shart — aks holda import bazaga tushmaydi. */
function expectValidPayloads(questions: Array<{ payload: unknown }>) {
  for (const question of questions) {
    const parsed = questionPayloadSchema.safeParse(question.payload);
    expect(parsed.success, JSON.stringify(parsed.success ? null : parsed.error.issues)).toBe(true);
  }
}

describe('parseAiken', () => {
  it('bitta to`g`ri javobli savolni SINGLE ga o`giradi', () => {
    const result = parseAiken(
      [
        "O'zbekiston poytaxti qaysi?",
        'A. Samarqand',
        'B. Toshkent',
        'C. Buxoro',
        'ANSWER: B',
        '',
        'Ikki karra ikki?',
        'A) 3',
        'B) 4',
        'ANSWER: B',
      ].join('\n'),
      'uz-Latn',
    );

    expect(result.issues).toEqual([]);
    expect(result.questions).toHaveLength(2);
    expect(result.questions[0].payload.type).toBe('SINGLE');
    const options = (result.questions[0].payload as { options: Array<{ isCorrect: boolean }> })
      .options;
    expect(options.map((option) => option.isCorrect)).toEqual([false, true, false]);
    expectValidPayloads(result.questions);
  });

  it('bir nechta javob MULTI bo`ladi, javobsiz blok muammo sifatida qaytadi', () => {
    const result = parseAiken(
      [
        'Tub sonlar?',
        'A. 2',
        'B. 4',
        'C. 5',
        'ANSWER: A,C',
        '',
        'Tugallanmagan',
        'A. x',
        'B. y',
      ].join('\n'),
      'ru',
    );

    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].payload.type).toBe('MULTI');
    expect(result.issues).toEqual([{ line: 7, reason: 'import.missing_answer' }]);
  });

  it('javob variantlar ichida bo`lmasa rad etadi', () => {
    const result = parseAiken('Savol\nA. bir\nB. ikki\nANSWER: D', 'en');
    expect(result.questions).toHaveLength(0);
    expect(result.issues[0].reason).toBe('import.answer_not_in_options');
  });
});

describe('parseGift', () => {
  it('asosiy turlarni tanidi', () => {
    const source = [
      '// izoh qatori',
      "::Poytaxt:: O'zbekiston poytaxti? { =Toshkent ~Samarqand#Yo'q ~Buxoro }",
      '',
      'Yer yassi. {F}',
      '',
      'Fransiya poytaxti { =Parij =Paris }',
      '',
      'Pi soni? {#3.14:0.01}',
      '',
      'Insho yozing. {}',
      '',
      "Moslang { =Toshkent -> O'zbekiston =Astana -> Qozog'iston }",
      '',
      "Ko'p tanlov { ~%50%A ~%50%B ~%-50%C ####Umumiy izoh }",
    ].join('\n');

    const result = parseGift(source, 'uz-Latn');
    expect(result.issues).toEqual([]);
    expect(result.questions.map((question) => question.payload.type)).toEqual([
      'SINGLE',
      'SINGLE',
      'CLOZE',
      'NUMERIC',
      'ESSAY',
      'MATCHING',
      'MULTI',
    ]);
    expect(result.questions[0].tags).toEqual(['Poytaxt']);
    expect(result.questions[3].payload).toEqual({
      type: 'NUMERIC',
      correctValue: 3.14,
      tolerance: 0.01,
    });
    expect(result.questions[6].explanation).toEqual({ 'uz-Latn': 'Umumiy izoh' });
    expectValidPayloads(result.questions);
  });

  it('qavs yo`q blok va to`g`ri javobsiz blok muammo beradi', () => {
    const result = parseGift('Qavssiz savol\n\nSavol { ~a ~b }', 'en');
    expect(result.questions).toHaveLength(0);
    expect(result.issues.map((issue) => issue.reason)).toEqual([
      'import.gift_braces_missing',
      'import.no_correct_option',
    ]);
  });

  it('ekranlangan belgilar matnda saqlanadi', () => {
    const result = parseGift('2 \\= 1+1? { =To\\:g\\:ri ~Noto\\:g\\:ri }', 'uz-Latn');
    expect(result.questions[0].text).toEqual({ 'uz-Latn': '2 = 1+1?' });
    const options = (
      result.questions[0].payload as { options: Array<{ text: { 'uz-Latn'?: string } }> }
    ).options;
    expect(options[0].text['uz-Latn']).toBe('To:g:ri');
  });
});

describe('parseCsv', () => {
  it('sarlavha bo`yicha ustunlarni o`qiydi, qo`shtirnoq va `;` ni qo`llaydi', () => {
    const source = [
      'type;text;options;correct;score;tags',
      'SINGLE;"Poytaxt; qaysi?";Toshkent|Samarqand;1;2;geo|oson',
      'MULTI;Tub sonlar;2|4|5;1|3;1;',
      'CLOZE;Suv formulasi;;H2O|h2o;1;',
      'NUMERIC;Pi;;3.14:0.01;1;',
      'ESSAY;Insho;;;3;',
    ].join('\n');

    const result = parseCsv(source, 'uz-Latn');
    expect(result.issues).toEqual([]);
    expect(result.questions.map((question) => question.payload.type)).toEqual([
      'SINGLE',
      'MULTI',
      'CLOZE',
      'NUMERIC',
      'ESSAY',
    ]);
    expect(result.questions[0].text).toEqual({ 'uz-Latn': 'Poytaxt; qaysi?' });
    expect(result.questions[0].defaultScore).toBe(2);
    expect(result.questions[0].tags).toEqual(['geo', 'oson']);
    expectValidPayloads(result.questions);
  });

  it('sarlavhasiz fayl va noma`lum tur rad etiladi', () => {
    expect(parseCsv('a,b,c', 'en').issues[0].reason).toBe('import.csv_header_missing');
    const result = parseCsv('type,text,options,correct\nHOTSPOT,Rasm,,', 'en');
    expect(result.issues).toEqual([
      { line: 2, reason: 'import.unsupported_type', detail: 'HOTSPOT' },
    ]);
  });
});
