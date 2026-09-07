import { questionPayloadSchema } from '@lms/shared';
import { parseQtiXml } from './qti-parser';

const QTI3_CHOICE = `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqtiasi_v3p0" identifier="q1" title="Poytaxt" adaptive="false" time-dependent="false">
  <qti-response-declaration identifier="RESPONSE" cardinality="single" base-type="identifier">
    <qti-correct-response><qti-value>B</qti-value></qti-correct-response>
  </qti-response-declaration>
  <qti-outcome-declaration identifier="MAXSCORE" cardinality="single" base-type="float">
    <qti-default-value><qti-value>2</qti-value></qti-default-value>
  </qti-outcome-declaration>
  <qti-item-body>
    <p>O'zbekiston <strong>poytaxti</strong>?</p>
    <qti-choice-interaction response-identifier="RESPONSE" max-choices="1">
      <qti-prompt>Bittasini tanlang</qti-prompt>
      <qti-simple-choice identifier="A">Samarqand</qti-simple-choice>
      <qti-simple-choice identifier="B">Toshkent</qti-simple-choice>
      <qti-simple-choice identifier="C">Buxoro</qti-simple-choice>
    </qti-choice-interaction>
  </qti-item-body>
  <qti-modal-feedback outcome-identifier="FEEDBACK" identifier="correct" show-hide="show">Poytaxt — Toshkent.</qti-modal-feedback>
</qti-assessment-item>`;

const QTI2_MULTI_AND_TEXT = `<?xml version="1.0"?>
<root>
<assessmentItem xmlns="http://www.imsglobal.org/xsd/imsqti_v2p2" identifier="m1" title="Tub sonlar">
  <responseDeclaration identifier="RESPONSE" cardinality="multiple" baseType="identifier">
    <correctResponse><value>A</value><value>C</value></correctResponse>
    <mapping defaultValue="0"><mapEntry mapKey="A" mappedValue="0.5"/><mapEntry mapKey="C" mappedValue="0.5"/><mapEntry mapKey="B" mappedValue="-0.5"/></mapping>
  </responseDeclaration>
  <itemBody>
    <choiceInteraction responseIdentifier="RESPONSE" maxChoices="0">
      <prompt>Tub sonlarni belgilang</prompt>
      <simpleChoice identifier="A">2</simpleChoice>
      <simpleChoice identifier="B">4</simpleChoice>
      <simpleChoice identifier="C">5</simpleChoice>
    </choiceInteraction>
  </itemBody>
</assessmentItem>
<assessmentItem identifier="t1" title="Bo'shliq">
  <responseDeclaration identifier="R1" cardinality="single" baseType="string">
    <correctResponse><value>Toshkent</value></correctResponse>
  </responseDeclaration>
  <responseDeclaration identifier="R2" cardinality="single" baseType="string">
    <correctResponse><value>1991</value></correctResponse>
  </responseDeclaration>
  <itemBody>
    <p>Poytaxt <textEntryInteraction responseIdentifier="R1" expectedLength="10"/>, mustaqillik yili <textEntryInteraction responseIdentifier="R2"/>.</p>
  </itemBody>
</assessmentItem>
<assessmentItem identifier="n1" title="Son">
  <responseDeclaration identifier="R" cardinality="single" baseType="float">
    <correctResponse><value>3.14</value></correctResponse>
  </responseDeclaration>
  <itemBody><p>Pi: <textEntryInteraction responseIdentifier="R"/></p></itemBody>
</assessmentItem>
<assessmentItem identifier="e1" title="Insho">
  <responseDeclaration identifier="R" cardinality="single" baseType="string"/>
  <itemBody><p>Fikringizni yozing.</p><extendedTextInteraction responseIdentifier="R"/></itemBody>
</assessmentItem>
<assessmentItem identifier="o1" title="Tartib">
  <responseDeclaration identifier="R" cardinality="ordered" baseType="identifier">
    <correctResponse><value>X</value><value>Y</value><value>Z</value></correctResponse>
  </responseDeclaration>
  <itemBody>
    <orderInteraction responseIdentifier="R" shuffle="true">
      <prompt>Tartiblang</prompt>
      <simpleChoice identifier="Y">Ikki</simpleChoice>
      <simpleChoice identifier="X">Bir</simpleChoice>
      <simpleChoice identifier="Z">Uch</simpleChoice>
    </orderInteraction>
  </itemBody>
</assessmentItem>
<assessmentItem identifier="mt1" title="Moslash">
  <responseDeclaration identifier="R" cardinality="multiple" baseType="directedPair">
    <correctResponse><value>L1 R2</value><value>L2 R1</value></correctResponse>
  </responseDeclaration>
  <itemBody>
    <matchInteraction responseIdentifier="R" maxAssociations="2">
      <prompt>Moslang</prompt>
      <simpleMatchSet>
        <simpleAssociableChoice identifier="L1">Toshkent</simpleAssociableChoice>
        <simpleAssociableChoice identifier="L2">Astana</simpleAssociableChoice>
      </simpleMatchSet>
      <simpleMatchSet>
        <simpleAssociableChoice identifier="R1">Qozog'iston</simpleAssociableChoice>
        <simpleAssociableChoice identifier="R2">O'zbekiston</simpleAssociableChoice>
      </simpleMatchSet>
    </matchInteraction>
  </itemBody>
</assessmentItem>
<assessmentItem identifier="h1" title="Hotspot">
  <responseDeclaration identifier="R" cardinality="single" baseType="identifier"/>
  <itemBody><p>Rasmda belgilang</p><hotspotInteraction responseIdentifier="R"/></itemBody>
</assessmentItem>
</root>`;

describe('parseQtiXml', () => {
  it('QTI 3.0 choice itemini SINGLE ga o`giradi (ball, teg, izoh bilan)', () => {
    const result = parseQtiXml(QTI3_CHOICE, 'uz-Latn');

    expect(result.issues).toEqual([]);
    expect(result.questions).toHaveLength(1);
    const [question] = result.questions;
    expect(question!.payload.type).toBe('SINGLE');
    expect(question!.defaultScore).toBe(2);
    expect(question!.tags).toEqual(['Poytaxt']);
    expect(question!.text['uz-Latn']).toBe(
      "<p>O'zbekiston <strong>poytaxti</strong>?</p> Bittasini tanlang",
    );
    expect(question!.explanation).toEqual({ 'uz-Latn': 'Poytaxt — Toshkent.' });
    const options = (question!.payload as { options: Array<{ id: string; isCorrect: boolean }> })
      .options;
    expect(options.map((option) => `${option.id}:${option.isCorrect}`)).toEqual([
      'A:false',
      'B:true',
      'C:false',
    ]);
    expect(questionPayloadSchema.safeParse(question!.payload).success).toBe(true);
  });

  it('QTI 2.x turlarini tanidi; rasmsiz hotspot muammo sifatida qaytadi', () => {
    const result = parseQtiXml(QTI2_MULTI_AND_TEXT, 'ru');

    expect(result.questions.map((question) => question.payload.type)).toEqual([
      'MULTI',
      'CLOZE',
      'NUMERIC',
      'ESSAY',
      'ORDERING',
      'MATCHING',
    ]);
    expect(result.issues).toEqual([{ line: 7, reason: 'import.qti_image_missing', detail: 'h1' }]);

    const multi = result.questions[0]!.payload as {
      options: Array<{ id: string; weight: number }>;
    };
    expect(multi.options.find((option) => option.id === 'B')?.weight).toBe(-0.5);

    const cloze = result.questions[1]!.payload as {
      template: Record<string, string>;
      blanks: Array<{ key: string; accepted: string[] }>;
    };
    expect(cloze.template.ru).toBe('<p>Poytaxt [[1]], mustaqillik yili [[2]].</p>');
    expect(cloze.blanks.map((blank) => blank.accepted[0])).toEqual(['Toshkent', '1991']);

    expect(result.questions[2]!.payload).toEqual({
      type: 'NUMERIC',
      correctValue: 3.14,
      tolerance: 0,
    });

    const ordering = result.questions[4]!.payload as { correctOrder: string[] };
    expect(ordering.correctOrder).toEqual(['X', 'Y', 'Z']);

    const matching = result.questions[5]!.payload as {
      pairs: Array<{ leftId: string; rightId: string }>;
    };
    expect(matching.pairs).toEqual([
      { leftId: 'L1', rightId: 'R2' },
      { leftId: 'L2', rightId: 'R1' },
    ]);

    for (const question of result.questions) {
      expect(questionPayloadSchema.safeParse(question.payload).success).toBe(true);
    }
  });

  it('itemsiz yoki buzuq XML aniq muammo beradi', () => {
    expect(parseQtiXml('<root><p>hech narsa</p></root>', 'en').issues).toEqual([
      { line: 0, reason: 'import.qti_no_items' },
    ]);
  });
});

const QTI_GAP_HOTSPOT = `<root>
<assessmentItem identifier="gm1" title="Gap">
  <responseDeclaration identifier="R" cardinality="multiple" baseType="directedPair">
    <correctResponse><value>W1 G1</value><value>W2 G2</value></correctResponse>
  </responseDeclaration>
  <itemBody>
    <gapMatchInteraction responseIdentifier="R" shuffle="false">
      <gapText identifier="W1" matchMax="1">Toshkent</gapText>
      <gapText identifier="W2" matchMax="1">1991</gapText>
      <p>Poytaxt <gap identifier="G1"/>, mustaqillik <gap identifier="G2"/>.</p>
    </gapMatchInteraction>
  </itemBody>
</assessmentItem>
<assessmentItem identifier="hs1" title="Xarita">
  <responseDeclaration identifier="R" cardinality="single" baseType="identifier">
    <correctResponse><value>A</value></correctResponse>
  </responseDeclaration>
  <itemBody>
    <p>Toshkentni belgilang</p>
    <hotspotInteraction responseIdentifier="R" maxChoices="1">
      <object type="image/png" data="img/map.png" width="400" height="200"/>
      <hotspotChoice shape="rect" coords="40,20,120,60" identifier="A"/>
      <hotspotChoice shape="circle" coords="300,100,20" identifier="B"/>
      <hotspotChoice shape="poly" coords="1,1,2,2,3,3" identifier="C"/>
    </hotspotInteraction>
  </itemBody>
</assessmentItem>
</root>`;

describe('parseQtiXml — gapMatch va hotspot', () => {
  it('gapMatch DRAG_DROP ga, hotspot rasm havolasi bilan HOTSPOT ga o`giriladi', () => {
    const result = parseQtiXml(QTI_GAP_HOTSPOT, 'uz-Latn');
    expect(result.issues).toEqual([]);

    const drag = result.questions[0]!;
    expect(drag.payload.type).toBe('DRAG_DROP');
    const dragPayload = drag.payload as {
      items: Array<{ id: string }>;
      zones: Array<{ id: string }>;
      placements: Array<{ itemId: string; zoneId: string }>;
    };
    expect(dragPayload.items.map((item) => item.id)).toEqual(['W1', 'W2']);
    expect(dragPayload.zones.map((zone) => zone.id)).toEqual(['G1', 'G2']);
    expect(dragPayload.placements).toEqual([
      { itemId: 'W1', zoneId: 'G1' },
      { itemId: 'W2', zoneId: 'G2' },
    ]);
    expect(drag.text['uz-Latn']).toContain('Poytaxt [1], mustaqillik [2].');
    expect(questionPayloadSchema.safeParse(drag.payload).success).toBe(true);

    const hotspot = result.questions[1]!;
    expect(hotspot.payload.type).toBe('HOTSPOT');
    expect(hotspot.imageRef).toEqual({ path: 'img/map.png', width: 400, height: 200 });
    const areas = (hotspot.payload as { areas: Array<Record<string, unknown>> }).areas;
    // koordinatalar hali pikselda; poly — uchlar ro'yxati
    expect(areas).toEqual([
      { id: 'A', shape: 'RECT', x: 40, y: 20, width: 80, height: 40 },
      { id: 'B', shape: 'CIRCLE', x: 300, y: 100, radius: 20 },
      {
        id: 'C',
        shape: 'POLY',
        x: 1,
        y: 1,
        points: [
          { x: 1, y: 1 },
          { x: 2, y: 2 },
          { x: 3, y: 3 },
        ],
      },
    ]);
    expect((hotspot.payload as { requiredAreaIds: string[] }).requiredAreaIds).toEqual(['A']);
  });
});

const QTI_INLINE_SLIDER = `<root>
<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqtiasi_v3p0" identifier="ic1" title="Ro'yxat">
  <qti-response-declaration identifier="R1" cardinality="single" base-type="identifier">
    <qti-correct-response><qti-value>B</qti-value></qti-correct-response>
  </qti-response-declaration>
  <qti-response-declaration identifier="R2" cardinality="single" base-type="string">
    <qti-correct-response><qti-value>1991</qti-value></qti-correct-response>
  </qti-response-declaration>
  <qti-item-body><p>Poytaxt <qti-inline-choice-interaction response-identifier="R1" shuffle="false">
    <qti-inline-choice identifier="A">Samarqand</qti-inline-choice>
    <qti-inline-choice identifier="B">Toshkent</qti-inline-choice>
    <qti-inline-choice identifier="C">Buxoro</qti-inline-choice>
  </qti-inline-choice-interaction>, yil <qti-text-entry-interaction response-identifier="R2"/>.</p></qti-item-body>
</qti-assessment-item>
<qti-assessment-item identifier="sl1" title="Slayder">
  <qti-response-declaration identifier="RESPONSE" cardinality="single" base-type="integer">
    <qti-correct-response><qti-value>7</qti-value></qti-correct-response>
  </qti-response-declaration>
  <qti-item-body><p>Haftada necha kun?</p>
    <qti-slider-interaction response-identifier="RESPONSE" lower-bound="1" upper-bound="10" step="1"/>
  </qti-item-body>
</qti-assessment-item>
<qti-assessment-item identifier="ic2" title="Bitta variant">
  <qti-response-declaration identifier="R1" cardinality="single" base-type="identifier">
    <qti-correct-response><qti-value>A</qti-value></qti-correct-response>
  </qti-response-declaration>
  <qti-item-body><p>Faqat <qti-inline-choice-interaction response-identifier="R1"><qti-inline-choice identifier="A">bir</qti-inline-choice></qti-inline-choice-interaction></p></qti-item-body>
</qti-assessment-item>
</root>`;

describe('parseQtiXml — inlineChoice va slider', () => {
  it('inlineChoice ro`yxatli CLOZE bo`shlig`iga, slider range`li NUMERIC ga o`giriladi', () => {
    const result = parseQtiXml(QTI_INLINE_SLIDER, 'uz-Latn');
    expect(result.issues).toEqual([{ line: 3, reason: 'import.too_few_options', detail: 'ic2' }]);

    const cloze = result.questions[0]!;
    expect(cloze.payload.type).toBe('CLOZE');
    const clozePayload = cloze.payload as {
      template: Record<string, string>;
      blanks: Array<{ key: string; accepted: string[]; options?: string[] }>;
    };
    expect(clozePayload.template['uz-Latn']).toContain('Poytaxt [[1]], yil [[2]].');
    expect(clozePayload.blanks).toEqual([
      expect.objectContaining({
        key: '1',
        accepted: ['Toshkent'],
        options: ['Samarqand', 'Toshkent', 'Buxoro'],
      }),
      expect.objectContaining({ key: '2', accepted: ['1991'] }),
    ]);
    expect(clozePayload.blanks[1]!.options).toBeUndefined();
    expect(questionPayloadSchema.safeParse(cloze.payload).success).toBe(true);

    const slider = result.questions[1]!;
    expect(slider.payload).toEqual({
      type: 'NUMERIC',
      correctValue: 7,
      tolerance: 0,
      range: { min: 1, max: 10, step: 1 },
    });
    expect(slider.text['uz-Latn']).toContain('Haftada necha kun?');
    expect(questionPayloadSchema.safeParse(slider.payload).success).toBe(true);
  });
});
