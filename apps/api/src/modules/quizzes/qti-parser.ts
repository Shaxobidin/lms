/**
 * Maqsad: QTI 3.0 (va QTI 2.x) `assessmentItem` XML ni ichki savol modeliga o'girish
 * (F-07, §10 "QTI 3.0 (test import/eksport)").
 *
 * Qo'llab-quvvatlanadigan interaksiyalar:
 *  - choiceInteraction        → SINGLE / MULTI
 *  - textEntryInteraction     → CLOZE (bir nechta bo'shliq) yoki NUMERIC (sonli bitta bo'shliq)
 *  - extendedTextInteraction  → ESSAY
 *  - matchInteraction         → MATCHING
 *  - orderInteraction         → ORDERING
 *  - gapMatchInteraction      → DRAG_DROP (bo'shliqlar — zonalar, gapText — elementlar)
 *  - hotspotInteraction       → HOTSPOT (rasm paketdan yuklanadi, koordinatalar foizga o'giriladi; rect/circle/poly)
 *  - inlineChoiceInteraction  → CLOZE bo'shlig'i ochiladigan ro'yxat bilan (`options`)
 *  - sliderInteraction        → NUMERIC (`range` bilan — slayder)
 *
 * QTI 3.0 elementlari `qti-choice-interaction` ko'rinishida (kebab-case, `qti-` prefiksli),
 * QTI 2.x esa `choiceInteraction` — ikkalasi bitta nomga normallashtiriladi, shuning
 * uchun bitta tahlil yo'li ishlaydi. Boshqa turlar (slider, drawing, ...) yutilmaydi —
 * `issues` ga `import.unsupported_type` bilan tushadi (§16).
 */

import { XMLParser } from 'fast-xml-parser';
import { PLACEHOLDER_IMAGE_FILE_ID } from '@lms/shared';
import type {
  ImportIssue,
  ImportParseResult,
  ImportedQuestion,
  Locale,
  QuestionPayload,
} from '@lms/shared';

type XmlNode = Record<string, unknown> & { ':@'?: Record<string, string> };

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: true,
  preserveOrder: true,
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
});

const SUPPORTED = new Set([
  'choiceInteraction',
  'textEntryInteraction',
  'extendedTextInteraction',
  'matchInteraction',
  'orderInteraction',
  'gapMatchInteraction',
  'hotspotInteraction',
  'inlineChoiceInteraction',
  'sliderInteraction',
]);
/** Matn ichida bo'shliq sifatida turadigan interaksiyalar — bitta CLOZE savoli. */
const BLANK_TAGS = new Set(['textEntryInteraction', 'inlineChoiceInteraction']);
const UNSUPPORTED = new Set([
  'associateInteraction',
  'graphicGapMatchInteraction',
  'hottextInteraction',
  'selectPointInteraction',
  'drawingInteraction',
  'uploadInteraction',
  'customInteraction',
]);
const VOID_TAGS = new Set(['br', 'img', 'hr']);

/** `qti-choice-interaction` → `choiceInteraction`, `response-identifier` → `responseIdentifier`. */
function normalizeName(name: string): string {
  const stripped = name.startsWith('qti-') ? name.slice(4) : name;
  return stripped.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function tagOf(node: XmlNode): string {
  const key = Object.keys(node).find((item) => item !== ':@');
  return key ? normalizeName(key) : '';
}

function childrenOf(node: XmlNode): XmlNode[] {
  const key = Object.keys(node).find((item) => item !== ':@');
  const value = key ? node[key] : undefined;
  return Array.isArray(value) ? (value as XmlNode[]) : [];
}

function attrsOf(node: XmlNode): Record<string, string> {
  const raw = node[':@'] ?? {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) result[normalizeName(key)] = String(value);
  return result;
}

function isText(node: XmlNode): boolean {
  return Object.prototype.hasOwnProperty.call(node, '#text');
}

function findAll(nodes: XmlNode[], name: string, out: XmlNode[] = []): XmlNode[] {
  for (const node of nodes) {
    if (isText(node)) continue;
    if (tagOf(node) === name) out.push(node);
    findAll(childrenOf(node), name, out);
  }
  return out;
}

function findFirst(nodes: XmlNode[], name: string): XmlNode | undefined {
  return findAll(nodes, name)[0];
}

/** Faqat matn — teglarsiz, bo'shliqlar siqilgan. */
function textOf(nodes: XmlNode[]): string {
  let out = '';
  for (const node of nodes) {
    if (isText(node)) out += String(node['#text']);
    else out += textOf(childrenOf(node));
  }
  return out.replace(/\s+/g, ' ').trim();
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Savol tanasini HTML ga qaytaradi. Interaksiya elementlari `replace` orqali
 * almashtiriladi (masalan, textEntry → `[[1]]`), qolgan teglar saqlanadi —
 * sanitizatsiya serverda, bu yerda emas.
 */
function htmlOf(nodes: XmlNode[], replace: (node: XmlNode, tag: string) => string | null): string {
  let out = '';
  for (const node of nodes) {
    if (isText(node)) {
      out += escapeHtml(String(node['#text']));
      continue;
    }
    const tag = tagOf(node);
    const replacement = replace(node, tag);
    if (replacement !== null) {
      out += replacement;
      continue;
    }
    const inner = htmlOf(childrenOf(node), replace);
    if (VOID_TAGS.has(tag)) {
      out += `<${tag}>`;
    } else if (
      /^(p|div|span|strong|em|b|i|u|ul|ol|li|table|thead|tbody|tr|td|th|pre|code|sub|sup|blockquote|h[1-6])$/.test(
        tag,
      )
    ) {
      out += `<${tag}>${inner}</${tag}>`;
    } else {
      // Noma'lum QTI tegi — faqat ichidagi matn
      out += inner;
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}

interface ResponseDeclaration {
  cardinality: string;
  baseType: string;
  correct: string[];
  mapping: Record<string, number>;
}

function readDeclarations(item: XmlNode): Record<string, ResponseDeclaration> {
  const result: Record<string, ResponseDeclaration> = {};
  for (const declaration of findAll(childrenOf(item), 'responseDeclaration')) {
    const attrs = attrsOf(declaration);
    const id = attrs.identifier ?? '';
    const correct = findAll(childrenOf(declaration), 'correctResponse').flatMap((block) =>
      findAll(childrenOf(block), 'value').map((value) => textOf(childrenOf(value))),
    );
    const mapping: Record<string, number> = {};
    for (const entry of findAll(childrenOf(declaration), 'mapEntry')) {
      const entryAttrs = attrsOf(entry);
      const key = entryAttrs.mapKey ?? '';
      const value = Number(entryAttrs.mappedValue ?? '0');
      if (key && Number.isFinite(value)) mapping[key] = value;
    }
    result[id] = {
      cardinality: (attrs.cardinality ?? 'single').toLowerCase(),
      baseType: (attrs.baseType ?? 'identifier').toLowerCase(),
      correct,
      mapping,
    };
  }
  return result;
}

function readMaxScore(item: XmlNode): number | null {
  for (const outcome of findAll(childrenOf(item), 'outcomeDeclaration')) {
    if ((attrsOf(outcome).identifier ?? '').toUpperCase() !== 'MAXSCORE') continue;
    const value = findFirst(childrenOf(outcome), 'value');
    const score = value ? Number(textOf(childrenOf(value))) : NaN;
    if (Number.isFinite(score) && score > 0) return score;
  }
  return null;
}

function localized(locale: Locale, value: string): Record<string, string> {
  return { [locale]: value };
}

/** Bitta `assessmentItem` ni savolga o'giradi yoki muammo qaytaradi. */
function convertItem(item: XmlNode, locale: Locale, index: number): ImportedQuestion | ImportIssue {
  const attrs = attrsOf(item);
  const declarations = readDeclarations(item);
  const body = findFirst(childrenOf(item), 'itemBody');
  if (!body) return { line: index, reason: 'import.qti_no_interaction', detail: attrs.identifier };

  const bodyChildren = childrenOf(body);
  const interactions: Array<{ node: XmlNode; tag: string }> = [];
  const collect = (nodes: XmlNode[]) => {
    for (const node of nodes) {
      if (isText(node)) continue;
      const tag = tagOf(node);
      if (SUPPORTED.has(tag) || UNSUPPORTED.has(tag)) {
        interactions.push({ node, tag });
        continue;
      }
      collect(childrenOf(node));
    }
  };
  collect(bodyChildren);

  const supported = interactions.filter((entry) => SUPPORTED.has(entry.tag));
  if (supported.length === 0) {
    const unsupported = interactions[0]?.tag;
    return unsupported
      ? { line: index, reason: 'import.unsupported_type', detail: unsupported }
      : { line: index, reason: 'import.qti_no_interaction', detail: attrs.identifier };
  }

  const tags = attrs.title ? [attrs.title.slice(0, 48)] : [];
  const defaultScore = readMaxScore(item) ?? 1;
  const base = { defaultScore, tags };

  // Bir nechta textEntry — bitta CLOZE savoli; boshqa turlarda birinchi interaksiya olinadi
  const textEntries = supported.filter((entry) => BLANK_TAGS.has(entry.tag));
  const primary = supported.find((entry) => !BLANK_TAGS.has(entry.tag)) ?? supported[0]!;

  /** Tana matni: interaksiyalar olib tashlanadi, prompt matni qo'shiladi. */
  const blankKeys = new Map<XmlNode, string>();
  textEntries.forEach((entry, position) => blankKeys.set(entry.node, String(position + 1)));
  const bodyHtml = htmlOf(bodyChildren, (node, tag) => {
    if (BLANK_TAGS.has(tag)) return `[[${blankKeys.get(node) ?? '1'}]]`;
    if (SUPPORTED.has(tag) || UNSUPPORTED.has(tag)) {
      const prompt = findFirst(childrenOf(node), 'prompt');
      return prompt ? htmlOf(childrenOf(prompt), () => null) : '';
    }
    return null;
  });

  const feedback = findAll(childrenOf(item), 'modalFeedback')
    .map((node) => textOf(childrenOf(node)))
    .filter(Boolean)
    .join(' ');
  const explanation = feedback ? localized(locale, feedback) : undefined;

  const responseFor = (node: XmlNode) => declarations[attrsOf(node).responseIdentifier ?? ''];

  if (BLANK_TAGS.has(primary.tag)) {
    const blanks = textEntries.map((entry) => {
      const declaration = responseFor(entry.node);
      if (entry.tag === 'inlineChoiceInteraction') {
        // Ochiladigan ro'yxat: variant matnlari — `options`, to'g'ri identifikatorlar — `accepted`
        const choices = findAll(childrenOf(entry.node), 'inlineChoice').map((choice, position) => ({
          id: attrsOf(choice).identifier || `c${position + 1}`,
          text: textOf(childrenOf(choice)).trim() || `#${position + 1}`,
        }));
        const correctIds = new Set([
          ...(declaration?.correct ?? []),
          ...Object.entries(declaration?.mapping ?? {})
            .filter(([, value]) => value > 0)
            .map(([key]) => key),
        ]);
        const accepted = choices.filter((choice) => correctIds.has(choice.id)).map((c) => c.text);
        return {
          key: blankKeys.get(entry.node) ?? '1',
          accepted,
          declaration,
          options: choices.map((choice) => choice.text),
          isChoice: true,
        };
      }
      const accepted = [
        ...(declaration?.correct ?? []),
        ...Object.keys(declaration?.mapping ?? {}),
      ].filter(Boolean);
      return {
        key: blankKeys.get(entry.node) ?? '1',
        accepted,
        declaration,
        options: undefined as string[] | undefined,
        isChoice: false,
      };
    });
    if (blanks.some((blank) => blank.accepted.length === 0)) {
      return { line: index, reason: 'import.missing_answer', detail: attrs.identifier };
    }
    if (blanks.some((blank) => blank.isChoice && (blank.options?.length ?? 0) < 2)) {
      return { line: index, reason: 'import.too_few_options', detail: attrs.identifier };
    }
    const single = blanks.length === 1 && !blanks[0]!.isChoice ? blanks[0] : undefined;
    if (
      single &&
      ['float', 'integer'].includes(single.declaration?.baseType ?? '') &&
      Number.isFinite(Number(single.accepted[0]))
    ) {
      const payload: QuestionPayload = {
        type: 'NUMERIC',
        correctValue: Number(single.accepted[0]),
        tolerance: 0,
      };
      return {
        ...base,
        text: localized(locale, bodyHtml.replace(/\[\[\d+\]\]/g, '___')),
        payload,
        explanation,
      };
    }
    const payload: QuestionPayload = {
      type: 'CLOZE',
      template: localized(locale, bodyHtml),
      blanks: blanks.map((blank) => ({
        key: blank.key,
        accepted: Array.from(new Set(blank.accepted)).slice(0, 10),
        caseSensitive: false,
        points: 1,
        ...(blank.options ? { options: Array.from(new Set(blank.options)).slice(0, 20) } : {}),
      })),
    };
    return {
      ...base,
      text: localized(locale, bodyHtml.replace(/\[\[\d+\]\]/g, '___')),
      payload,
      explanation,
    };
  }

  const text = bodyHtml;
  // gapMatch matni interaksiya ichida — u o'z bo'limida yig'iladi
  if (!text && primary.tag !== 'gapMatchInteraction') {
    return { line: index, reason: 'import.missing_question_text', detail: attrs.identifier };
  }
  const declaration = responseFor(primary.node);

  if (primary.tag === 'choiceInteraction') {
    const choices = findAll(childrenOf(primary.node), 'simpleChoice');
    if (choices.length < 2)
      return { line: index, reason: 'import.too_few_options', detail: attrs.identifier };
    const correct = new Set(declaration?.correct ?? []);
    if (correct.size === 0)
      return { line: index, reason: 'import.no_correct_option', detail: attrs.identifier };
    const maxChoices = Number(attrsOf(primary.node).maxChoices ?? '1');
    const isMulti = correct.size > 1 || maxChoices !== 1 || declaration?.cardinality === 'multiple';
    const options = choices.map((choice, position) => {
      const id = attrsOf(choice).identifier || `o${position + 1}`;
      const isCorrect = correct.has(id);
      const mapped = declaration?.mapping[id];
      return {
        id: id.slice(0, 64),
        text: localized(locale, htmlOf(childrenOf(choice), () => null) || `#${position + 1}`),
        isCorrect,
        weight: isMulti
          ? Math.max(-1, Math.min(1, mapped ?? (isCorrect ? 1 / correct.size : 0)))
          : isCorrect
            ? 1
            : 0,
      };
    });
    const payload: QuestionPayload = isMulti
      ? { type: 'MULTI', options, penalizeWrong: true }
      : { type: 'SINGLE', options };
    return { ...base, text: localized(locale, text), payload, explanation };
  }

  if (primary.tag === 'extendedTextInteraction') {
    const payload: QuestionPayload = {
      type: 'ESSAY',
      minWords: 0,
      maxWords: 0,
      allowAttachments: false,
    };
    return { ...base, text: localized(locale, text), payload, explanation };
  }

  if (primary.tag === 'orderInteraction') {
    const choices = findAll(childrenOf(primary.node), 'simpleChoice');
    const items = choices.map((choice, position) => ({
      id: (attrsOf(choice).identifier || `i${position + 1}`).slice(0, 64),
      text: localized(locale, htmlOf(childrenOf(choice), () => null) || `#${position + 1}`),
    }));
    const correctOrder = (declaration?.correct ?? []).filter((id) =>
      items.some((item) => item.id === id),
    );
    if (items.length < 2 || correctOrder.length !== items.length) {
      return { line: index, reason: 'import.missing_answer', detail: attrs.identifier };
    }
    const payload: QuestionPayload = { type: 'ORDERING', items, correctOrder };
    return { ...base, text: localized(locale, text), payload, explanation };
  }

  if (primary.tag === 'gapMatchInteraction') {
    // gapText — sudraladigan elementlar; <gap> — matn ichidagi zonalar
    const gapTexts = findAll(childrenOf(primary.node), 'gapText');
    const gaps = findAll(childrenOf(primary.node), 'gap');
    const gapIndex = new Map<XmlNode, number>();
    gaps.forEach((gap, position) => gapIndex.set(gap, position + 1));
    const items = gapTexts.map((node, position) => ({
      id: (attrsOf(node).identifier || `g${position + 1}`).slice(0, 64),
      text: localized(locale, htmlOf(childrenOf(node), () => null) || `#${position + 1}`),
    }));
    const zones = gaps.map((node, position) => ({
      id: (attrsOf(node).identifier || `z${position + 1}`).slice(0, 64),
      label: localized(locale, `[${position + 1}]`),
    }));
    const placements = (declaration?.correct ?? [])
      .map((value) => value.trim().split(/\s+/))
      .filter((pair) => pair.length === 2)
      .map(([itemId, zoneId]) => ({ itemId: itemId!, zoneId: zoneId! }))
      .filter(
        (pair) =>
          items.some((item) => item.id === pair.itemId) &&
          zones.some((zone) => zone.id === pair.zoneId),
      );
    if (items.length === 0 || zones.length === 0 || placements.length === 0) {
      return { line: index, reason: 'import.missing_answer', detail: attrs.identifier };
    }
    // Matn: gapText lar tashqarida, bo'shliqlar `[n]` bilan
    const gapBody = htmlOf(childrenOf(primary.node), (node, tag) => {
      if (tag === 'gapText') return '';
      if (tag === 'gap') return `[${gapIndex.get(node) ?? '?'}]`;
      return null;
    });
    const payload: QuestionPayload = { type: 'DRAG_DROP', items, zones, placements };
    return {
      ...base,
      text: localized(locale, [text, gapBody].filter(Boolean).join(' ')),
      payload,
      explanation,
    };
  }

  if (primary.tag === 'sliderInteraction') {
    const sliderAttrs = attrsOf(primary.node);
    const correctValue = Number(declaration?.correct?.[0]);
    if (!Number.isFinite(correctValue)) {
      return { line: index, reason: 'import.missing_answer', detail: attrs.identifier };
    }
    const min = Number(sliderAttrs.lowerBound);
    const max = Number(sliderAttrs.upperBound);
    const step = Number(sliderAttrs.step);
    const payload: QuestionPayload = {
      type: 'NUMERIC',
      correctValue,
      tolerance: 0,
      ...(Number.isFinite(min) && Number.isFinite(max) && max > min
        ? { range: { min, max, step: Number.isFinite(step) && step > 0 ? step : 1 } }
        : {}),
    };
    return { ...base, text: localized(locale, text), payload, explanation };
  }

  if (primary.tag === 'hotspotInteraction') {
    const object = findFirst(childrenOf(primary.node), 'object');
    const objectAttrs = object ? attrsOf(object) : {};
    const imagePath = objectAttrs.data ?? '';
    if (!imagePath)
      return { line: index, reason: 'import.qti_image_missing', detail: attrs.identifier };
    const toNumber = (value: string | undefined) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    };
    const correct = new Set(declaration?.correct ?? []);
    const areas: Array<Record<string, unknown>> = [];
    findAll(childrenOf(primary.node), 'hotspotChoice').forEach((choice, position) => {
      const choiceAttrs = attrsOf(choice);
      const id = (choiceAttrs.identifier || `a${position + 1}`).slice(0, 64);
      const coords = (choiceAttrs.coords ?? '').split(',').map((part) => Number(part.trim()));
      const shape = (choiceAttrs.shape ?? '').toLowerCase();
      if (shape === 'rect' && coords.length === 4 && coords.every(Number.isFinite)) {
        const [x1, y1, x2, y2] = coords as [number, number, number, number];
        areas.push({ id, shape: 'RECT', x: x1, y: y1, width: x2 - x1, height: y2 - y1 });
      } else if (shape === 'circle' && coords.length === 3 && coords.every(Number.isFinite)) {
        const [cx, cy, r] = coords as [number, number, number];
        areas.push({ id, shape: 'CIRCLE', x: cx, y: cy, radius: r });
      } else if (
        shape === 'poly' &&
        coords.length >= 6 &&
        coords.length % 2 === 0 &&
        coords.every(Number.isFinite)
      ) {
        const points: Array<{ x: number; y: number }> = [];
        for (let i = 0; i < coords.length && points.length < 50; i += 2) {
          points.push({ x: coords[i]!, y: coords[i + 1]! });
        }
        areas.push({ id, shape: 'POLY', x: points[0]!.x, y: points[0]!.y, points });
      }
      // `default` (butun rasm) — ma'nosiz, o'tkazib yuboriladi
    });
    const requiredAreaIds = Array.from(correct).filter((id) =>
      areas.some((area) => area.id === id),
    );
    if (areas.length === 0 || requiredAreaIds.length === 0) {
      return { line: index, reason: 'import.hotspot_no_areas', detail: attrs.identifier };
    }
    // Koordinatalar hozircha PIKSELDA — backend rasm o'lchamini bilib foizga o'giradi
    const payload = {
      type: 'HOTSPOT',
      imageFileId: PLACEHOLDER_IMAGE_FILE_ID,
      areas,
      requiredAreaIds,
    } as unknown as QuestionPayload;
    return {
      ...base,
      text: localized(locale, text),
      payload,
      explanation,
      imageRef: {
        path: imagePath,
        width: toNumber(objectAttrs.width),
        height: toNumber(objectAttrs.height),
      },
    };
  }

  // matchInteraction
  const sets = findAll(childrenOf(primary.node), 'simpleMatchSet');
  const readSet = (set: XmlNode | undefined, prefix: string) =>
    (set ? findAll(childrenOf(set), 'simpleAssociableChoice') : []).map((choice, position) => ({
      id: (attrsOf(choice).identifier || `${prefix}${position + 1}`).slice(0, 64),
      text: localized(locale, htmlOf(childrenOf(choice), () => null) || `#${position + 1}`),
    }));
  const left = readSet(sets[0], 'l');
  const right = readSet(sets[1], 'r');
  const pairs = (declaration?.correct ?? [])
    .map((value) => value.trim().split(/\s+/))
    .filter((pair) => pair.length === 2)
    .map(([leftId, rightId]) => ({ leftId: leftId!, rightId: rightId! }))
    .filter(
      (pair) =>
        left.some((item) => item.id === pair.leftId) &&
        right.some((item) => item.id === pair.rightId),
    );
  if (left.length < 2 || right.length < 2 || pairs.length < 2) {
    return { line: index, reason: 'import.missing_answer', detail: attrs.identifier };
  }
  const payload: QuestionPayload = { type: 'MATCHING', left, right, pairs };
  return { ...base, text: localized(locale, text), payload, explanation };
}

/**
 * XML matnidagi barcha `assessmentItem` larni o'giradi. `line` maydoni bu yerda
 * item tartib raqami (XML da qator ma'nosiz) — foydalanuvchi qaysi savolda
 * muammo borligini shundan topadi.
 */
export function parseQtiXml(xml: string, locale: Locale): ImportParseResult {
  let document: XmlNode[];
  try {
    document = parser.parse(xml.replace(/^\uFEFF/, '')) as XmlNode[];
  } catch {
    return { questions: [], issues: [{ line: 0, reason: 'import.qti_xml_invalid' }] };
  }

  const items = findAll(document, 'assessmentItem');
  if (items.length === 0) {
    return { questions: [], issues: [{ line: 0, reason: 'import.qti_no_items' }] };
  }

  const questions: ImportedQuestion[] = [];
  const issues: ImportIssue[] = [];
  items.forEach((item, position) => {
    const converted = convertItem(item, locale, position + 1);
    if ('reason' in converted) issues.push(converted);
    else questions.push(converted);
  });
  return { questions, issues };
}
