/**
 * Maqsad: IMS Common Cartridge (1.1 / 1.2 / 1.3) paketini tahlil qilish — sof
 * funksiyalar (F-05, §10 "IMS Common Cartridge").
 *
 * Ikki qism:
 *  - `parseCcManifest` — `imsmanifest.xml`: tashkilot daraxti (item) va resurslar
 *    ro'yxati (type bo'yicha tasniflangan);
 *  - `parseQti12` — CC ichidagi testlar QTI **1.2** (`questestinterop`) formatida
 *    bo'ladi; bu QTI 2.x/3.0 dan tubdan farq qiladi, shuning uchun alohida tahlilchi.
 *
 * Fayl o'qish, S3 ga yuklash va bazaga yozish `CartridgeImportService` da.
 */

import { XMLParser } from 'fast-xml-parser';
import type { ImportIssue, ImportedQuestion, Locale, QuestionPayload } from '@lms/shared';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

type Node = Record<string, unknown>;

function toArray<T = Node>(value: unknown): T[] {
  if (value === undefined || value === null) return [];
  return (Array.isArray(value) ? value : [value]) as T[];
}

/** `<title>` yoki `<mattext>` — matn yoki `{ '#text': ... }` obyekti bo'lishi mumkin. */
function textValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') {
    const node = value as Node;
    if (typeof node['#text'] === 'string') return (node['#text'] as string).trim();
    // lomimscc: <title><string>..</string></title>
    if (node['string'] !== undefined) return textValue(toArray(node['string'])[0]);
  }
  return '';
}

// =============================================================================
// Manifest
// =============================================================================

export type CcResourceKind =
  'webcontent' | 'weblink' | 'discussion' | 'assessment' | 'basiclti' | 'unsupported';

export interface CcResource {
  id: string;
  type: string;
  kind: CcResourceKind;
  /** Asosiy fayl (manifestdagi `href`), paket ildiziga nisbatan. */
  href: string | null;
  /** Barcha fayllar (`<file href>`). */
  files: string[];
}

export interface CcItem {
  id: string;
  title: string;
  resourceId: string | null;
  children: CcItem[];
}

export interface CcManifest {
  title: string;
  schemaVersion: string;
  items: CcItem[];
  resources: Record<string, CcResource>;
}

/** Resurs turi (`type` atributi) → ichki tasnif. Versiya raqamlari farq qiladi, prefiks bo'yicha. */
export function classifyResourceType(type: string): CcResourceKind {
  const value = type.toLowerCase();
  if (value === 'webcontent' || value.startsWith('associatedcontent/')) return 'webcontent';
  if (value.startsWith('imswl_')) return 'weblink';
  if (value.startsWith('imsdt_')) return 'discussion';
  if (value.startsWith('imsqti_')) return 'assessment';
  if (value.startsWith('imsbasiclti_')) return 'basiclti';
  return 'unsupported';
}

function readItem(node: Node): CcItem {
  return {
    id: String(node['@_identifier'] ?? ''),
    title: textValue(node['title']),
    resourceId: node['@_identifierref'] ? String(node['@_identifierref']) : null,
    children: toArray(node['item']).map(readItem),
  };
}

export function parseCcManifest(xml: string): CcManifest {
  const parsed = parser.parse(xml.replace(/^\uFEFF/, '')) as Node;
  const manifest = parsed['manifest'] as Node | undefined;
  if (!manifest) throw new Error('cc_manifest_invalid');

  const metadata = manifest['metadata'] as Node | undefined;
  const schemaVersion = String(metadata?.['schemaversion'] ?? '');
  const lom = metadata?.['lom'] as Node | undefined;
  const general = lom?.['general'] as Node | undefined;
  const title = textValue(general?.['title']);

  const organizations = manifest['organizations'] as Node | undefined;
  const organization = toArray(organizations?.['organization'])[0];
  let items = toArray(organization?.['item']).map(readItem);
  // `rooted-hierarchy`: bitta ildiz item (masalan, "LearningModules") modullarni o'rab turadi
  if (items.length === 1 && items[0] && !items[0].resourceId && items[0].children.length > 0) {
    items = items[0].children;
  }

  const resources: Record<string, CcResource> = {};
  const resourcesNode = manifest['resources'] as Node | undefined;
  for (const resource of toArray(resourcesNode?.['resource'])) {
    const id = String(resource['@_identifier'] ?? '');
    if (!id) continue;
    const type = String(resource['@_type'] ?? '');
    const files = toArray(resource['file'])
      .map((file) => String(file['@_href'] ?? ''))
      .filter(Boolean);
    const href = resource['@_href'] ? String(resource['@_href']) : (files[0] ?? null);
    resources[id] = { id, type, kind: classifyResourceType(type), href, files };
  }

  return { title, schemaVersion, items, resources };
}

// =============================================================================
// Web link, discussion, basic LTI (resurs XML fayllari)
// =============================================================================

export function parseWebLink(xml: string): { title: string; url: string } | null {
  const parsed = parser.parse(xml) as Node;
  const link = parsed['webLink'] as Node | undefined;
  if (!link) return null;
  const url = String((link['url'] as Node | undefined)?.['@_href'] ?? '');
  if (!/^https?:\/\//i.test(url)) return null;
  return { title: textValue(link['title']), url };
}

export function parseDiscussionTopic(xml: string): { title: string; text: string } | null {
  const parsed = parser.parse(xml) as Node;
  const topic = parsed['topic'] as Node | undefined;
  if (!topic) return null;
  return { title: textValue(topic['title']), text: textValue(topic['text']) };
}

export function parseBasicLtiLink(xml: string): { title: string; url: string } | null {
  const parsed = parser.parse(xml) as Node;
  const link = parsed['cartridge_basiclti_link'] as Node | undefined;
  if (!link) return null;
  const url = textValue(link['secure_launch_url']) || textValue(link['launch_url']);
  if (!/^https?:\/\//i.test(url)) return null;
  return { title: textValue(link['title']), url };
}

// =============================================================================
// QTI 1.2 (CC assessment)
// =============================================================================

export interface Qti12Assessment {
  title: string;
  /** `qmd_timelimit` (daqiqa) bo'lsa. */
  timeLimitMinutes: number | null;
  questions: ImportedQuestion[];
  issues: ImportIssue[];
}

function localized(locale: Locale, value: string): Record<string, string> {
  return { [locale]: value };
}

/** `<varequal>` qiymatlari: `<and>` ichidagilar ham, `<not>` ichidagilar CHIQARIB tashlanadi. */
function collectVarequal(node: Node | undefined, out: string[] = []): string[] {
  if (!node) return out;
  for (const value of toArray(node['varequal'])) out.push(textValue(value));
  for (const and of toArray(node['and'])) collectVarequal(and, out);
  for (const or of toArray(node['or'])) collectVarequal(or, out);
  return out;
}

/** SCORE ni musbat qiladigan `respcondition` lar — to'g'ri javob shulardan olinadi. */
function correctValues(item: Node): string[] {
  const values: string[] = [];
  for (const processing of toArray(item['resprocessing'])) {
    for (const condition of toArray(processing['respcondition'])) {
      const positive = toArray(condition['setvar']).some((setvar) => {
        const node = setvar as Node;
        const varname = String(node['@_varname'] ?? 'SCORE').toUpperCase();
        return varname === 'SCORE' && Number(textValue(node)) > 0;
      });
      if (positive) collectVarequal(condition['conditionvar'] as Node | undefined, values);
    }
  }
  return Array.from(new Set(values.filter(Boolean)));
}

function profileOf(item: Node): string {
  const metadata = item['itemmetadata'] as Node | undefined;
  for (const block of toArray(metadata?.['qtimetadata'])) {
    for (const field of toArray(block['qtimetadatafield'])) {
      if (textValue(field['fieldlabel']).toLowerCase() === 'cc_profile') {
        return textValue(field['fieldentry']).toLowerCase();
      }
    }
  }
  return '';
}

function convertQti12Item(
  item: Node,
  locale: Locale,
  index: number,
): ImportedQuestion | ImportIssue {
  const title = String(item['@_title'] ?? '');
  const presentation = item['presentation'] as Node | undefined;
  const text = textValue(toArray(presentation?.['material'])[0]?.['mattext']);
  if (!text) return { line: index, reason: 'import.missing_question_text', detail: title };

  const profile = profileOf(item);
  const tags = title ? [title.slice(0, 48)] : [];
  const correct = correctValues(item);
  const base = { defaultScore: 1, tags };
  // `<flow>` ichida ham bo'lishi mumkin
  const flow = presentation?.['flow'] as Node | undefined;
  const responseLid = toArray(presentation?.['response_lid'] ?? flow?.['response_lid'])[0];
  const responseStr = toArray(presentation?.['response_str'] ?? flow?.['response_str'])[0];

  if (profile.includes('essay') || (!responseLid && responseStr && !correct.length)) {
    const payload: QuestionPayload = {
      type: 'ESSAY',
      minWords: 0,
      maxWords: 0,
      allowAttachments: false,
    };
    return { ...base, text: localized(locale, text), payload };
  }

  if (responseLid) {
    const labels = toArray((responseLid['render_choice'] as Node | undefined)?.['response_label']);
    if (labels.length < 2) return { line: index, reason: 'import.too_few_options', detail: title };
    if (correct.length === 0)
      return { line: index, reason: 'import.no_correct_option', detail: title };
    const isMulti =
      profile.includes('multiple_response') ||
      String(responseLid['@_rcardinality'] ?? '').toLowerCase() === 'multiple' ||
      correct.length > 1;
    const options = labels.map((label, position) => {
      const id = String(label['@_ident'] ?? `o${position + 1}`).slice(0, 64);
      const isCorrect = correct.includes(id);
      return {
        id,
        text: localized(
          locale,
          textValue(toArray(label['material'])[0]?.['mattext']) || `#${position + 1}`,
        ),
        isCorrect,
        weight: isMulti ? (isCorrect ? 1 / correct.length : 0) : isCorrect ? 1 : 0,
      };
    });
    if (!options.some((option) => option.isCorrect)) {
      return { line: index, reason: 'import.answer_not_in_options', detail: title };
    }
    const payload: QuestionPayload = isMulti
      ? { type: 'MULTI', options, penalizeWrong: true }
      : { type: 'SINGLE', options };
    return { ...base, text: localized(locale, text), payload };
  }

  if (responseStr) {
    if (correct.length === 0)
      return { line: index, reason: 'import.missing_answer', detail: title };
    const payload: QuestionPayload = {
      type: 'CLOZE',
      template: localized(locale, `${text} [[1]]`),
      blanks: [{ key: '1', accepted: correct.slice(0, 10), caseSensitive: false, points: 1 }],
    };
    return { ...base, text: localized(locale, text), payload };
  }

  return { line: index, reason: 'import.unsupported_type', detail: profile || title };
}

export function parseQti12(xml: string, locale: Locale): Qti12Assessment {
  let parsed: Node;
  try {
    parsed = parser.parse(xml.replace(/^\uFEFF/, '')) as Node;
  } catch {
    return {
      title: '',
      timeLimitMinutes: null,
      questions: [],
      issues: [{ line: 0, reason: 'import.qti_xml_invalid' }],
    };
  }
  const root = parsed['questestinterop'] as Node | undefined;
  const assessment = toArray(root?.['assessment'])[0];
  if (!assessment) {
    return {
      title: '',
      timeLimitMinutes: null,
      questions: [],
      issues: [{ line: 0, reason: 'import.qti_no_items' }],
    };
  }

  let timeLimitMinutes: number | null = null;
  for (const block of toArray((assessment['qtimetadata'] as Node | undefined) ?? [])) {
    for (const field of toArray(block['qtimetadatafield'])) {
      if (textValue(field['fieldlabel']).toLowerCase() === 'qmd_timelimit') {
        const minutes = Number(textValue(field['fieldentry']));
        if (Number.isFinite(minutes) && minutes > 0) timeLimitMinutes = minutes;
      }
    }
  }

  const items: Node[] = [];
  const collect = (node: Node | undefined) => {
    if (!node) return;
    items.push(...toArray(node['item']));
    for (const section of toArray(node['section'])) collect(section);
  };
  collect(assessment);

  const questions: ImportedQuestion[] = [];
  const issues: ImportIssue[] = [];
  items.forEach((item, position) => {
    const converted = convertQti12Item(item, locale, position + 1);
    if ('reason' in converted) issues.push(converted);
    else questions.push(converted);
  });
  if (items.length === 0) issues.push({ line: 0, reason: 'import.qti_no_items' });

  return { title: String(assessment['@_title'] ?? ''), timeLimitMinutes, questions, issues };
}
