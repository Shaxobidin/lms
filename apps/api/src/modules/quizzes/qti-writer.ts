/**
 * Maqsad: savollar bankini QTI 3.0 paketiga eksport qilish (F-07, §10 "QTI 3.0
 * (test import/eksport)") — sof funksiyalar.
 *
 * Har bir savol alohida `qti-assessment-item` XML fayl, paket `imsmanifest.xml`
 * bilan ZIP. Bizning `qti-parser.ts` shu chiqishni qayta o'qiy oladi (round-trip
 * testi bilan kafolatlangan), boshqa QTI 3.0 tizimlar ham.
 *
 * Xaritalash: SINGLE/MULTI → choice, CLOZE → textEntry (ro'yxatli bo'shliq → inlineChoice),
 * NUMERIC → textEntry (float) yoki slider (`range` bo'lsa),
 * ESSAY va CODE → extendedText, MATCHING → match, ORDERING → order,
 * HOTSPOT → hotspot (rasm `media/` da, koordinatalar foizdan pikselga),
 * DRAG_DROP → gapMatch.
 */

import type { Locale, LocalizedText, QuestionPayload } from '@lms/shared';

export interface ExportableQuestion {
  id: string;
  text: LocalizedText;
  payload: QuestionPayload;
  defaultScore: number;
  tags: string[];
  explanation?: LocalizedText | null;
  /** HOTSPOT rasmi: paketdagi nom va o'lchami (piksel koordinatalar uchun). */
  image?: { fileName: string; width: number; height: number };
}

const NS = 'http://www.imsglobal.org/xsd/imsqtiasi_v3p0';

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** XML identifikatori: harf bilan boshlanadi, faqat harf/raqam/_/- */
function ident(value: string, fallback: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9_-]/g, '_');
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : `${fallback}_${cleaned}`;
}

function pick(text: LocalizedText | null | undefined, locale: Locale): string {
  if (!text) return '';
  return text[locale] ?? text['uz-Latn'] ?? text.ru ?? text.en ?? text['uz-Cyrl'] ?? '';
}

/**
 * Matn HTML bo'lishi mumkin — XML ichiga XHTML sifatida yoziladi: void teglar
 * yopiladi, nomli entity'lar raqamliga o'giriladi (XML `&nbsp;` ni bilmaydi).
 * Sanitizer chiqishi (DOMPurify) atributlari qo'shtirnoqli, teglar yopiq —
 * shuning uchun bu yetarli.
 */
export function toXhtml(html: string): string {
  return html
    .replace(/<(br|hr|img|source|track)\b([^>]*?)\s*\/?>/gi, '<$1$2/>')
    .replace(/&nbsp;/g, '&#160;')
    .replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/gi, '&amp;');
}

function body(html: string): string {
  const trimmed = toXhtml(html).trim();
  if (!trimmed) return '';
  return /^<(p|div|ul|ol|table|h[1-6]|pre|blockquote)\b/i.test(trimmed)
    ? trimmed
    : `<p>${trimmed}</p>`;
}

function inlineText(html: string): string {
  return escapeXml(
    html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

function correctResponse(
  id: string,
  cardinality: string,
  baseType: string,
  values: string[],
): string {
  return `  <qti-response-declaration identifier="${id}" cardinality="${cardinality}" base-type="${baseType}">
    <qti-correct-response>
${values.map((value) => `      <qti-value>${escapeXml(value)}</qti-value>`).join('\n')}
    </qti-correct-response>
  </qti-response-declaration>`;
}

function outcome(score: number): string {
  return `  <qti-outcome-declaration identifier="SCORE" cardinality="single" base-type="float"><qti-default-value><qti-value>0</qti-value></qti-default-value></qti-outcome-declaration>
  <qti-outcome-declaration identifier="MAXSCORE" cardinality="single" base-type="float"><qti-default-value><qti-value>${score}</qti-value></qti-default-value></qti-outcome-declaration>`;
}

/** Bitta savol → `qti-assessment-item` XML. `null` — eksport qilib bo'lmaydigan holat. */
export function writeQtiItem(question: ExportableQuestion, locale: Locale): string | null {
  const itemId = ident(question.id, 'q');
  const title = escapeXml(question.tags[0] ?? question.payload.type);
  const text = pick(question.text, locale);
  const explanation = pick(question.explanation, locale);
  const feedback = explanation
    ? `  <qti-modal-feedback outcome-identifier="FEEDBACK" identifier="general" show-hide="show">${body(explanation)}</qti-modal-feedback>`
    : '';
  const payload = question.payload;

  let declarations = '';
  let itemBody = '';

  switch (payload.type) {
    case 'SINGLE':
    case 'MULTI': {
      const isMulti = payload.type === 'MULTI';
      const correct = payload.options
        .filter((option) => option.isCorrect)
        .map((option) => ident(option.id, 'o'));
      declarations = correctResponse(
        'RESPONSE',
        isMulti ? 'multiple' : 'single',
        'identifier',
        correct,
      );
      if (isMulti) {
        declarations = declarations.replace(
          '  </qti-response-declaration>',
          `    <qti-mapping default-value="0">
${payload.options.map((option) => `      <qti-map-entry map-key="${ident(option.id, 'o')}" mapped-value="${option.weight}"/>`).join('\n')}
    </qti-mapping>
  </qti-response-declaration>`,
        );
      }
      itemBody = `${body(text)}
    <qti-choice-interaction response-identifier="RESPONSE" max-choices="${isMulti ? 0 : 1}" shuffle="true">
${payload.options.map((option) => `      <qti-simple-choice identifier="${ident(option.id, 'o')}">${inlineText(pick(option.text, locale))}</qti-simple-choice>`).join('\n')}
    </qti-choice-interaction>`;
      break;
    }
    case 'CLOZE': {
      const template = pick(payload.template, locale);
      /** Ro'yxatli bo'shliq: variant → identifikator; to'g'ri javoblar identifikator bilan. */
      const choiceIds = (blank: (typeof payload.blanks)[number]) => {
        const options = Array.from(new Set([...(blank.options ?? []), ...blank.accepted]));
        return options.map((option, position) => ({ id: `IC${position + 1}`, text: option }));
      };
      declarations = payload.blanks
        .map((blank) => {
          const responseId = `R_${ident(blank.key, 'b')}`;
          if (!blank.options)
            return correctResponse(responseId, 'single', 'string', blank.accepted);
          const ids = choiceIds(blank)
            .filter((choice) => blank.accepted.includes(choice.text))
            .map((choice) => choice.id);
          return correctResponse(responseId, 'single', 'identifier', ids);
        })
        .join('\n');
      const html = template.replace(/\[\[([^\]]+)\]\]/g, (_, key: string) => {
        const blank = payload.blanks.find((item) => item.key === key);
        if (!blank) return '';
        const responseId = `R_${ident(blank.key, 'b')}`;
        if (blank.options) {
          return `<qti-inline-choice-interaction response-identifier="${responseId}" shuffle="false">${choiceIds(
            blank,
          )
            .map(
              (choice) =>
                `<qti-inline-choice identifier="${choice.id}">${inlineText(choice.text)}</qti-inline-choice>`,
            )
            .join('')}</qti-inline-choice-interaction>`;
        }
        return `<qti-text-entry-interaction response-identifier="${responseId}" expected-length="20"/>`;
      });
      // Interaksiyalar CDATA ichida bo'lmasligi kerak — matn to'g'ridan-to'g'ri yoziladi
      itemBody = `<p>${toXhtml(html).replace(/<\/?p>/gi, '')}</p>`;
      break;
    }
    case 'NUMERIC': {
      declarations = correctResponse('RESPONSE', 'single', 'float', [String(payload.correctValue)]);
      itemBody = payload.range
        ? `${body(text)}
    <qti-slider-interaction response-identifier="RESPONSE" lower-bound="${payload.range.min}" upper-bound="${payload.range.max}" step="${payload.range.step}"${payload.unit ? ` data-unit="${escapeXml(payload.unit)}"` : ''}/>`
        : `${body(text)}
    <p><qti-text-entry-interaction response-identifier="RESPONSE" expected-length="12"/>${payload.unit ? ` ${escapeXml(payload.unit)}` : ''}</p>`;
      break;
    }
    case 'ESSAY':
    case 'CODE': {
      declarations = `  <qti-response-declaration identifier="RESPONSE" cardinality="single" base-type="string"/>`;
      const hint =
        payload.type === 'CODE' ? `<p><code>${escapeXml(payload.language)}</code></p>` : '';
      itemBody = `${body(text)}${hint}
    <qti-extended-text-interaction response-identifier="RESPONSE"${payload.type === 'ESSAY' && payload.minWords ? ` min-strings="${payload.minWords}"` : ''}/>`;
      break;
    }
    case 'MATCHING': {
      declarations = correctResponse(
        'RESPONSE',
        'multiple',
        'directedPair',
        payload.pairs.map((pair) => `${ident(pair.leftId, 'l')} ${ident(pair.rightId, 'r')}`),
      );
      const set = (items: Array<{ id: string; text: LocalizedText }>, prefix: string) =>
        items
          .map(
            (item) =>
              `        <qti-simple-associable-choice identifier="${ident(item.id, prefix)}" match-max="1">${inlineText(pick(item.text, locale))}</qti-simple-associable-choice>`,
          )
          .join('\n');
      itemBody = `${body(text)}
    <qti-match-interaction response-identifier="RESPONSE" max-associations="${payload.pairs.length}" shuffle="true">
      <qti-simple-match-set>
${set(payload.left, 'l')}
      </qti-simple-match-set>
      <qti-simple-match-set>
${set(payload.right, 'r')}
      </qti-simple-match-set>
    </qti-match-interaction>`;
      break;
    }
    case 'ORDERING': {
      declarations = correctResponse(
        'RESPONSE',
        'ordered',
        'identifier',
        payload.correctOrder.map((id) => ident(id, 'i')),
      );
      itemBody = `${body(text)}
    <qti-order-interaction response-identifier="RESPONSE" shuffle="true">
${payload.items.map((item) => `      <qti-simple-choice identifier="${ident(item.id, 'i')}">${inlineText(pick(item.text, locale))}</qti-simple-choice>`).join('\n')}
    </qti-order-interaction>`;
      break;
    }
    case 'DRAG_DROP': {
      declarations = correctResponse(
        'RESPONSE',
        'multiple',
        'directedPair',
        payload.placements.map(
          (placement) => `${ident(placement.itemId, 'w')} ${ident(placement.zoneId, 'z')}`,
        ),
      );
      itemBody = `${body(text)}
    <qti-gap-match-interaction response-identifier="RESPONSE" shuffle="true">
${payload.items.map((item) => `      <qti-gap-text identifier="${ident(item.id, 'w')}" match-max="1">${inlineText(pick(item.text, locale))}</qti-gap-text>`).join('\n')}
      <p>${payload.zones.map((zone) => `${inlineText(pick(zone.label, locale))} <qti-gap identifier="${ident(zone.id, 'z')}"/>`).join(' ')}</p>
    </qti-gap-match-interaction>`;
      break;
    }
    case 'HOTSPOT': {
      if (!question.image) return null;
      const { fileName, width, height } = question.image;
      const px = (percent: number, total: number) => Math.round((percent / 100) * total);
      declarations = correctResponse(
        'RESPONSE',
        payload.requiredAreaIds.length > 1 ? 'multiple' : 'single',
        'identifier',
        payload.requiredAreaIds.map((id) => ident(id, 'a')),
      );
      itemBody = `${body(text)}
    <qti-hotspot-interaction response-identifier="RESPONSE" max-choices="${payload.requiredAreaIds.length}">
      <object type="image/png" data="../media/${escapeXml(fileName)}" width="${width}" height="${height}"/>
${payload.areas
  .map((area) =>
    area.shape === 'RECT'
      ? `      <qti-hotspot-choice identifier="${ident(area.id, 'a')}" shape="rect" coords="${px(area.x, width)},${px(area.y, height)},${px(area.x + (area.width ?? 0), width)},${px(area.y + (area.height ?? 0), height)}"/>`
      : area.shape === 'POLY'
        ? `      <qti-hotspot-choice identifier="${ident(area.id, 'a')}" shape="poly" coords="${(area.points ?? []).map((point) => `${px(point.x, width)},${px(point.y, height)}`).join(',')}"/>`
        : `      <qti-hotspot-choice identifier="${ident(area.id, 'a')}" shape="circle" coords="${px(area.x, width)},${px(area.y, height)},${px(area.radius ?? 0, Math.min(width, height))}"/>`,
  )
  .join('\n')}
    </qti-hotspot-interaction>`;
      break;
    }
    default:
      return null;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item xmlns="${NS}" identifier="${itemId}" title="${title}" adaptive="false" time-dependent="false">
${declarations}
${outcome(question.defaultScore)}
  <qti-item-body>
    ${itemBody}
  </qti-item-body>
${feedback}
</qti-assessment-item>
`;
}

/** Paket manifesti (IMS CP + QTI 3.0 resurs turlari). */
export function writeQtiManifest(
  items: Array<{ id: string; file: string; media?: string }>,
  title: string,
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest xmlns="http://www.imsglobal.org/xsd/imscp_v1p1" identifier="bank_${Date.now()}">
  <metadata>
    <schema>QTI Package</schema>
    <schemaversion>3.0.0</schemaversion>
    <title>${escapeXml(title)}</title>
  </metadata>
  <organizations/>
  <resources>
${items
  .map(
    (item) =>
      `    <resource identifier="${ident(item.id, 'q')}" type="imsqti_item_xmlv3p0" href="${escapeXml(item.file)}">
      <file href="${escapeXml(item.file)}"/>${item.media ? `\n      <file href="${escapeXml(item.media)}"/>` : ''}
    </resource>`,
  )
  .join('\n')}
  </resources>
</manifest>
`;
}
