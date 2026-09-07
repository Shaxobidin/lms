/**
 * Maqsad: kursni IMS Common Cartridge 1.1 paketiga eksport qilish — sof
 * yozuvchilar (F-05, §10). `cc-parser.ts` shu chiqishni qayta o'qiydi (round-trip).
 *
 * Xaritalash (bizning model → CC):
 *  - Modul → 1-daraja item, Mavzu → 2-daraja, Dars → 3-daraja item + `webcontent`
 *    HTML (`lessons/<id>.html`); darsdagi fayl resurslari HTML yonidagi fayl;
 *  - LINK resursi → `imswl_xmlv1p1` (web link);
 *  - Forum mavzulari → `imsdt_xmlv1p1` (discussion topic) — alohida "Forum" moduli ostida;
 *  - Mavzuga biriktirilgan test → QTI 1.2 `assessment` (`imsqti_xmlv1p2/imscc_xmlv1p1/assessment`):
 *    SINGLE/MULTI/ESSAY/CLOZE/NUMERIC; boshqa turlar `skipped` ga tushadi.
 */

import type { Locale, LocalizedText, QuestionPayload } from '@lms/shared';

export interface CcExportLesson {
  id: string;
  title: string;
  html: string;
  /** Darsga biriktirilgan fayllar (paketdagi yo'li `files/...`). */
  files: Array<{ path: string; title: string }>;
  links: Array<{ id: string; title: string; url: string }>;
}
/** Forum mavzusi → CC `imsdt` discussion topic (birinchi xabar — matn). */
export interface CcExportDiscussion {
  id: string;
  title: string;
  html: string;
}
export interface CcExportTopic {
  id: string;
  title: string;
  lessons: CcExportLesson[];
  quizzes: Array<{
    id: string;
    title: string;
    durationMinutes: number;
    questions: CcExportQuestion[];
  }>;
  discussions?: CcExportDiscussion[];
}
export interface CcExportModule {
  id: string;
  title: string;
  topics: CcExportTopic[];
}
export interface CcExportQuestion {
  id: string;
  text: string;
  payload: QuestionPayload;
  defaultScore: number;
}

export interface CcPackageFiles {
  /** `path → content` (matnli fayllar); ikkilik fayllar servisda qo'shiladi. */
  entries: Map<string, string>;
  skippedQuestions: Array<{ quizId: string; questionId: string; type: string }>;
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ident(prefix: string, id: string): string {
  return `${prefix}_${id.replace(/[^A-Za-z0-9]/g, '')}`;
}

export function pickText(text: LocalizedText | null | undefined, locale: Locale): string {
  if (!text) return '';
  return text[locale] ?? text['uz-Latn'] ?? text.ru ?? text.en ?? text['uz-Cyrl'] ?? '';
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// --- Manifest ----------------------------------------------------------------------

export function writeCcManifest(title: string, modules: CcExportModule[]): string {
  const resources: string[] = [];
  const items = modules
    .map((module) => {
      const topics = module.topics
        .map((topic) => {
          const lessons = topic.lessons.map((lesson) => {
            const resourceId = ident('r', lesson.id);
            const files = [`lessons/${lesson.id}.html`, ...lesson.files.map((file) => file.path)];
            resources.push(
              `    <resource identifier="${resourceId}" type="webcontent" href="lessons/${lesson.id}.html">
${files.map((file) => `      <file href="${escapeXml(file)}"/>`).join('\n')}
    </resource>`,
            );
            const linkItems = lesson.links.map((link) => {
              const linkId = ident('rl', link.id);
              resources.push(
                `    <resource identifier="${linkId}" type="imswl_xmlv1p1"><file href="links/${link.id}.xml"/></resource>`,
              );
              return `          <item identifier="${ident('il', link.id)}" identifierref="${linkId}"><title>${escapeXml(link.title)}</title></item>`;
            });
            return [
              `          <item identifier="${ident('i', lesson.id)}" identifierref="${resourceId}"><title>${escapeXml(lesson.title)}</title></item>`,
              ...linkItems,
            ].join('\n');
          });
          const quizzes = topic.quizzes.map((quiz) => {
            const quizId = ident('rq', quiz.id);
            resources.push(
              `    <resource identifier="${quizId}" type="imsqti_xmlv1p2/imscc_xmlv1p1/assessment"><file href="quizzes/${quiz.id}.xml"/></resource>`,
            );
            return `          <item identifier="${ident('iq', quiz.id)}" identifierref="${quizId}"><title>${escapeXml(quiz.title)}</title></item>`;
          });
          const discussions = (topic.discussions ?? []).map((discussion) => {
            const discussionId = ident('rd', discussion.id);
            resources.push(
              `    <resource identifier="${discussionId}" type="imsdt_xmlv1p1"><file href="discussions/${discussion.id}.xml"/></resource>`,
            );
            return `          <item identifier="${ident('id', discussion.id)}" identifierref="${discussionId}"><title>${escapeXml(discussion.title)}</title></item>`;
          });
          return `        <item identifier="${ident('t', topic.id)}">
          <title>${escapeXml(topic.title)}</title>
${[...lessons, ...quizzes, ...discussions].join('\n')}
        </item>`;
        })
        .join('\n');
      return `      <item identifier="${ident('m', module.id)}">
        <title>${escapeXml(module.title)}</title>
${topics}
      </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="cc_${Date.now()}" xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1"
  xmlns:lomimscc="http://ltsc.ieee.org/xsd/imsccv1p1/LOM/manifest">
  <metadata>
    <schema>IMS Common Cartridge</schema>
    <schemaversion>1.1.0</schemaversion>
    <lomimscc:lom><lomimscc:general><lomimscc:title><lomimscc:string>${escapeXml(title)}</lomimscc:string></lomimscc:title></lomimscc:general></lomimscc:lom>
  </metadata>
  <organizations>
    <organization identifier="org_1" structure="rooted-hierarchy">
      <item identifier="LearningModules">
${items}
      </item>
    </organization>
  </organizations>
  <resources>
${resources.join('\n')}
  </resources>
</manifest>
`;
}

export function writeWebLink(title: string, url: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<webLink xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imswl_v1p1"><title>${escapeXml(title)}</title><url href="${escapeXml(url)}" target="_blank"/></webLink>
`;
}

/** CC discussion topic (`imsdt_v1p1`): sarlavha va HTML matn. */
export function writeDiscussionTopic(title: string, html: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<topic xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imsdt_v1p1"><title>${escapeXml(title)}</title><text texttype="text/html">${escapeXml(html)}</text></topic>
`;
}

export function writeLessonHtml(title: string, html: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeXml(title)}</title></head>
<body>
${html}
</body></html>
`;
}

// --- QTI 1.2 -------------------------------------------------------------------------

function mattext(html: string): string {
  return `<material><mattext texttype="text/html">${escapeXml(html)}</mattext></material>`;
}

function metadata(profile: string): string {
  return `<itemmetadata><qtimetadata><qtimetadatafield><fieldlabel>cc_profile</fieldlabel><fieldentry>${profile}</fieldentry></qtimetadatafield></qtimetadata></itemmetadata>`;
}

/** Bitta savol → QTI 1.2 `item`; qo'llab-quvvatlanmagan tur uchun `null`. */
export function writeQti12Item(question: CcExportQuestion): string | null {
  const id = ident('i', question.id);
  const payload = question.payload;
  const score = question.defaultScore;

  if (payload.type === 'SINGLE' || payload.type === 'MULTI') {
    const isMulti = payload.type === 'MULTI';
    const labels = payload.options
      .map(
        (option) =>
          `<response_label ident="${escapeXml(option.id)}">${mattext(stripTags(pickTextAny(option.text)))}</response_label>`,
      )
      .join('');
    const correct = payload.options.filter((option) => option.isCorrect);
    const condition = isMulti
      ? `<and>${payload.options
          .map((option) =>
            option.isCorrect
              ? `<varequal respident="RESPONSE">${escapeXml(option.id)}</varequal>`
              : `<not><varequal respident="RESPONSE">${escapeXml(option.id)}</varequal></not>`,
          )
          .join('')}</and>`
      : `<varequal respident="RESPONSE">${escapeXml(correct[0]?.id ?? '')}</varequal>`;
    return `<item ident="${id}" title="${escapeXml(stripTags(question.text).slice(0, 80))}">
${metadata(isMulti ? 'cc.multiple_response.v0p1' : 'cc.multiple_choice.v0p1')}
<presentation>${mattext(question.text)}<response_lid ident="RESPONSE" rcardinality="${isMulti ? 'Multiple' : 'Single'}"><render_choice>${labels}</render_choice></response_lid></presentation>
<resprocessing><outcomes><decvar maxvalue="${score}" minvalue="0" varname="SCORE" vartype="Decimal"/></outcomes>
<respcondition continue="No"><conditionvar>${condition}</conditionvar><setvar action="Set" varname="SCORE">${score}</setvar></respcondition></resprocessing>
</item>`;
  }

  if (payload.type === 'ESSAY' || payload.type === 'CODE') {
    return `<item ident="${id}" title="${escapeXml(stripTags(question.text).slice(0, 80))}">
${metadata('cc.essay.v0p1')}
<presentation>${mattext(question.text)}<response_str ident="RESPONSE" rcardinality="Single"><render_fib><response_label ident="answer" rshuffle="No"/></render_fib></response_str></presentation>
</item>`;
  }

  if (payload.type === 'CLOZE' || payload.type === 'NUMERIC') {
    const accepted =
      payload.type === 'NUMERIC'
        ? [String(payload.correctValue)]
        : payload.blanks.flatMap((blank) => blank.accepted);
    const text =
      payload.type === 'CLOZE'
        ? pickTextAny(payload.template).replace(/\[\[[^\]]+\]\]/g, '____')
        : question.text;
    return `<item ident="${id}" title="${escapeXml(stripTags(text).slice(0, 80))}">
${metadata('cc.fib.v0p1')}
<presentation>${mattext(text)}<response_str ident="RESPONSE" rcardinality="Single"><render_fib><response_label ident="answer" rshuffle="No"/></render_fib></response_str></presentation>
<resprocessing><outcomes><decvar maxvalue="${score}" minvalue="0" varname="SCORE" vartype="Decimal"/></outcomes>
<respcondition continue="No"><conditionvar>${accepted.map((value) => `<varequal respident="RESPONSE" case="No">${escapeXml(value)}</varequal>`).join('')}</conditionvar><setvar action="Set" varname="SCORE">${score}</setvar></respcondition></resprocessing>
</item>`;
  }

  return null;
}

/** Bir tilli matn: birinchi mavjud til (eksport chaqiruvchi allaqachon tilni tanlab bergan). */
function pickTextAny(text: LocalizedText): string {
  return text['uz-Latn'] ?? text.ru ?? text.en ?? text['uz-Cyrl'] ?? '';
}

export function writeQti12Assessment(
  quiz: { id: string; title: string; durationMinutes: number },
  items: string[],
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2">
<assessment ident="${ident('a', quiz.id)}" title="${escapeXml(quiz.title)}">
<qtimetadata><qtimetadatafield><fieldlabel>cc_profile</fieldlabel><fieldentry>cc.exam.v0p1</fieldentry></qtimetadatafield><qtimetadatafield><fieldlabel>qmd_timelimit</fieldlabel><fieldentry>${quiz.durationMinutes}</fieldentry></qtimetadatafield></qtimetadata>
<section ident="root_section">
${items.join('\n')}
</section>
</assessment>
</questestinterop>
`;
}

/** Barcha matnli fayllarni yig'adi (manifest, HTML, havolalar, testlar). */
export function buildCartridgeEntries(title: string, modules: CcExportModule[]): CcPackageFiles {
  const entries = new Map<string, string>();
  const skippedQuestions: CcPackageFiles['skippedQuestions'] = [];
  entries.set('imsmanifest.xml', writeCcManifest(title, modules));
  for (const module of modules) {
    for (const topic of module.topics) {
      for (const lesson of topic.lessons) {
        entries.set(`lessons/${lesson.id}.html`, writeLessonHtml(lesson.title, lesson.html));
        for (const link of lesson.links) {
          entries.set(`links/${link.id}.xml`, writeWebLink(link.title, link.url));
        }
      }
      for (const discussion of topic.discussions ?? []) {
        entries.set(
          `discussions/${discussion.id}.xml`,
          writeDiscussionTopic(discussion.title, discussion.html),
        );
      }
      for (const quiz of topic.quizzes) {
        const items: string[] = [];
        for (const question of quiz.questions) {
          const xml = writeQti12Item(question);
          if (xml) items.push(xml);
          else
            skippedQuestions.push({
              quizId: quiz.id,
              questionId: question.id,
              type: question.payload.type,
            });
        }
        entries.set(`quizzes/${quiz.id}.xml`, writeQti12Assessment(quiz, items));
      }
    }
  }
  return { entries, skippedQuestions };
}
