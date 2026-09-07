import { questionPayloadSchema } from '@lms/shared';
import {
  classifyResourceType,
  parseBasicLtiLink,
  parseCcManifest,
  parseDiscussionTopic,
  parseQti12,
  parseWebLink,
} from './cc-parser';

const MANIFEST = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="m1" xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1"
  xmlns:lomimscc="http://ltsc.ieee.org/xsd/imsccv1p1/LOM/manifest">
  <metadata>
    <schema>IMS Common Cartridge</schema>
    <schemaversion>1.1.0</schemaversion>
    <lomimscc:lom><lomimscc:general><lomimscc:title><lomimscc:string>Sinov kursi</lomimscc:string></lomimscc:title></lomimscc:general></lomimscc:lom>
  </metadata>
  <organizations>
    <organization identifier="org1" structure="rooted-hierarchy">
      <item identifier="root">
        <item identifier="w1"><title>1-hafta</title>
          <item identifier="w1t1"><title>Kirish</title>
            <item identifier="w1t1l1" identifierref="r_html"><title>O'qish</title></item>
            <item identifier="w1t1l2" identifierref="r_link"><title>Havola</title></item>
          </item>
          <item identifier="w1t2" identifierref="r_quiz"><title>Test</title></item>
        </item>
        <item identifier="w2" identifierref="r_dt"><title>Muhokama</title></item>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="r_html" type="webcontent" href="w1/reading.html"><file href="w1/reading.html"/><file href="w1/pic.png"/></resource>
    <resource identifier="r_link" type="imswl_xmlv1p1"><file href="r_link/link.xml"/></resource>
    <resource identifier="r_quiz" type="imsqti_xmlv1p2/imscc_xmlv1p1/assessment"><file href="r_quiz/quiz.xml"/></resource>
    <resource identifier="r_dt" type="imsdt_xmlv1p1"><file href="r_dt/dt.xml"/></resource>
    <resource identifier="r_lti" type="imsbasiclti_xmlv1p0"><file href="lti.xml"/></resource>
    <resource identifier="r_x" type="imsqti_xmlv1p2/imscc_xmlv1p1/question-bank"><file href="bank.xml"/></resource>
  </resources>
</manifest>`;

const QTI12 = `<?xml version="1.0"?>
<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2">
  <assessment ident="a1" title="1-hafta testi">
    <qtimetadata><qtimetadatafield><fieldlabel>qmd_timelimit</fieldlabel><fieldentry>20</fieldentry></qtimetadatafield></qtimetadata>
    <section ident="root">
      <item ident="i1" title="Poytaxt">
        <itemmetadata><qtimetadata><qtimetadatafield><fieldlabel>cc_profile</fieldlabel><fieldentry>cc.multiple_choice.v0p1</fieldentry></qtimetadatafield></qtimetadata></itemmetadata>
        <presentation>
          <material><mattext texttype="text/html">&lt;p&gt;Poytaxt?&lt;/p&gt;</mattext></material>
          <response_lid ident="response1" rcardinality="Single">
            <render_choice>
              <response_label ident="A"><material><mattext>Samarqand</mattext></material></response_label>
              <response_label ident="B"><material><mattext>Toshkent</mattext></material></response_label>
            </render_choice>
          </response_lid>
        </presentation>
        <resprocessing>
          <outcomes><decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/></outcomes>
          <respcondition continue="No"><conditionvar><varequal respident="response1">B</varequal></conditionvar><setvar action="Set" varname="SCORE">100</setvar></respcondition>
        </resprocessing>
      </item>
      <item ident="i2" title="Tub sonlar">
        <itemmetadata><qtimetadata><qtimetadatafield><fieldlabel>cc_profile</fieldlabel><fieldentry>cc.multiple_response.v0p1</fieldentry></qtimetadatafield></qtimetadata></itemmetadata>
        <presentation>
          <material><mattext>Tub sonlar?</mattext></material>
          <response_lid ident="r" rcardinality="Multiple">
            <render_choice>
              <response_label ident="A"><material><mattext>2</mattext></material></response_label>
              <response_label ident="B"><material><mattext>4</mattext></material></response_label>
              <response_label ident="C"><material><mattext>5</mattext></material></response_label>
            </render_choice>
          </response_lid>
        </presentation>
        <resprocessing>
          <respcondition continue="No"><conditionvar><and><varequal respident="r">A</varequal><not><varequal respident="r">B</varequal></not><varequal respident="r">C</varequal></and></conditionvar><setvar varname="SCORE" action="Set">100</setvar></respcondition>
        </resprocessing>
      </item>
      <item ident="i3" title="Insho">
        <itemmetadata><qtimetadata><qtimetadatafield><fieldlabel>cc_profile</fieldlabel><fieldentry>cc.essay.v0p1</fieldentry></qtimetadatafield></qtimetadata></itemmetadata>
        <presentation><material><mattext>Fikringiz?</mattext></material><response_str ident="r"><render_fib><response_label ident="x"/></render_fib></response_str></presentation>
      </item>
      <item ident="i4" title="Bo'shliq">
        <itemmetadata><qtimetadata><qtimetadatafield><fieldlabel>cc_profile</fieldlabel><fieldentry>cc.fib.v0p1</fieldentry></qtimetadatafield></qtimetadata></itemmetadata>
        <presentation><material><mattext>Suv formulasi</mattext></material><response_str ident="r"><render_fib/></response_str></presentation>
        <resprocessing><respcondition><conditionvar><varequal respident="r">H2O</varequal></conditionvar><setvar varname="SCORE" action="Set">100</setvar></respcondition></resprocessing>
      </item>
      <item ident="i5" title="Javobsiz">
        <presentation><material><mattext>?</mattext></material><response_lid ident="r"><render_choice><response_label ident="A"><material><mattext>a</mattext></material></response_label><response_label ident="B"><material><mattext>b</mattext></material></response_label></render_choice></response_lid></presentation>
      </item>
    </section>
  </assessment>
</questestinterop>`;

describe('parseCcManifest', () => {
  it('sarlavha, daraxt va resurslarni o`qiydi, ildiz itemni ochadi', () => {
    const manifest = parseCcManifest(MANIFEST);

    expect(manifest.title).toBe('Sinov kursi');
    expect(manifest.schemaVersion).toBe('1.1.0');
    expect(manifest.items.map((item) => item.title)).toEqual(['1-hafta', 'Muhokama']);
    expect(manifest.items[0]!.children[0]!.children.map((item) => item.resourceId)).toEqual([
      'r_html',
      'r_link',
    ]);
    expect(manifest.resources['r_html']).toEqual({
      id: 'r_html',
      type: 'webcontent',
      kind: 'webcontent',
      href: 'w1/reading.html',
      files: ['w1/reading.html', 'w1/pic.png'],
    });
    expect(manifest.resources['r_quiz']!.kind).toBe('assessment');
    expect(manifest.resources['r_dt']!.kind).toBe('discussion');
    expect(manifest.resources['r_lti']!.kind).toBe('basiclti');
  });

  it('turlarni prefiks bo`yicha tasniflaydi', () => {
    expect(classifyResourceType('imswl_xmlv1p3')).toBe('weblink');
    expect(
      classifyResourceType('associatedcontent/imscc_xmlv1p1/learning-application-resource'),
    ).toBe('webcontent');
    expect(classifyResourceType('imsqti_xmlv1p2/imscc_xmlv1p3/assessment')).toBe('assessment');
    expect(classifyResourceType('something/else')).toBe('unsupported');
  });

  it('manifestsiz XML xatolik beradi', () => {
    expect(() => parseCcManifest('<root/>')).toThrow('cc_manifest_invalid');
  });
});

describe('resurs XML fayllari', () => {
  it('web link, muhokama va basic LTI', () => {
    expect(
      parseWebLink(
        '<webLink xmlns="x"><title>Sayt</title><url href="https://example.uz/a"/></webLink>',
      ),
    ).toEqual({ title: 'Sayt', url: 'https://example.uz/a' });
    expect(
      parseWebLink('<webLink><title>X</title><url href="javascript:alert(1)"/></webLink>'),
    ).toBeNull();
    expect(
      parseDiscussionTopic(
        '<topic><title>Savol</title><text texttype="text/html">&lt;p&gt;Fikr&lt;/p&gt;</text></topic>',
      ),
    ).toEqual({ title: 'Savol', text: '<p>Fikr</p>' });
    expect(
      parseBasicLtiLink(
        '<cartridge_basiclti_link xmlns:blti="b"><blti:title>Tool</blti:title><blti:launch_url>https://tool.uz/launch</blti:launch_url></cartridge_basiclti_link>',
      ),
    ).toEqual({ title: 'Tool', url: 'https://tool.uz/launch' });
  });
});

describe('parseQti12', () => {
  it('CC profillarini ichki turlarga o`giradi va vaqt chegarasini o`qiydi', () => {
    const result = parseQti12(QTI12, 'uz-Latn');

    expect(result.title).toBe('1-hafta testi');
    expect(result.timeLimitMinutes).toBe(20);
    expect(result.questions.map((question) => question.payload.type)).toEqual([
      'SINGLE',
      'MULTI',
      'ESSAY',
      'CLOZE',
    ]);
    expect(result.issues).toEqual([
      { line: 5, reason: 'import.no_correct_option', detail: 'Javobsiz' },
    ]);

    expect(result.questions[0]!.text).toEqual({ 'uz-Latn': '<p>Poytaxt?</p>' });
    const single = result.questions[0]!.payload as {
      options: Array<{ id: string; isCorrect: boolean }>;
    };
    expect(single.options.map((option) => `${option.id}:${option.isCorrect}`)).toEqual([
      'A:false',
      'B:true',
    ]);

    // `<not>` ichidagi B to'g'ri hisoblanmaydi
    const multi = result.questions[1]!.payload as {
      options: Array<{ id: string; isCorrect: boolean }>;
    };
    expect(multi.options.filter((option) => option.isCorrect).map((option) => option.id)).toEqual([
      'A',
      'C',
    ]);

    const cloze = result.questions[3]!.payload as { blanks: Array<{ accepted: string[] }> };
    expect(cloze.blanks[0]!.accepted).toEqual(['H2O']);

    for (const question of result.questions) {
      expect(questionPayloadSchema.safeParse(question.payload).success).toBe(true);
    }
  });
});
