/**
 * Maqsad: faylni to'g'ridan-to'g'ri obyekt saqlashga yuklash (ADR-009).
 *
 * Oqim uch bosqichli:
 *  1. `presign` — server fayl yozuvini yaratadi va vaqtinchalik havola beradi;
 *  2. `PUT` — brauzer faylni TO'G'RIDAN-TO'G'RI S3 ga yuboradi (API ning
 *     xotirasi va kanali band bo'lmaydi);
 *  3. `complete` — server hajm va magic bytes ni tekshiradi (§11).
 *
 * Uchinchi bosqich MAJBURIY: usiz fayl `PENDING` holatida qoladi va hech
 * qayerda ko'rinmaydi.
 */

import { api } from './api-client';

export interface PresignResponse {
  fileObjectId: string;
  uploadUrl: string;
  objectKey: string;
  requiredHeaders: Record<string, string>;
  expiresInSeconds: number;
}

export type UploadPurpose =
  'COURSE_CONTENT' | 'SUBMISSION' | 'AVATAR' | 'SCORM' | 'DOCUMENT' | 'QUESTION_IMPORT';

export interface UploadResult {
  fileObjectId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Faylni yuklaydi va tayyor `fileObjectId` ni qaytaradi.
 *
 * `onProgress` 0..1 oralig'ida chaqiriladi. `XMLHttpRequest` ishlatilishining
 * sababi: `fetch` yuklash jarayonini kuzatishga imkon bermaydi.
 */
export async function uploadFile(
  file: File,
  options: {
    purpose: UploadPurpose;
    courseId?: string;
    /** Brauzer aniqlay olmagan turlar uchun (masalan, `.gift`, `.xml`) aniq MIME. */
    mimeType?: string;
    onProgress?: (fraction: number) => void;
    signal?: AbortSignal;
  },
): Promise<UploadResult> {
  const { data: presigned } = await api.post<PresignResponse>('/content/files/presign', {
    fileName: file.name,
    mimeType: options.mimeType ?? (file.type || 'application/octet-stream'),
    sizeBytes: file.size,
    purpose: options.purpose,
    ...(options.courseId ? { courseId: options.courseId } : {}),
  });

  await putWithProgress(presigned, file, options.onProgress, options.signal);

  await api.post('/content/files/complete', { fileObjectId: presigned.fileObjectId });

  return {
    fileObjectId: presigned.fileObjectId,
    fileName: file.name,
    mimeType: options.mimeType ?? (file.type || 'application/octet-stream'),
    sizeBytes: file.size,
  };
}

function putWithProgress(
  presigned: PresignResponse,
  file: File,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', presigned.uploadUrl, true);

    // Imzo aynan shu sarlavhalar bilan hisoblangan — o'zgartirib bo'lmaydi
    for (const [name, value] of Object.entries(presigned.requiredHeaders)) {
      // `Content-Length` ni brauzer o'zi qo'yadi va qo'lda o'rnatishga ruxsat bermaydi
      if (name.toLowerCase() === 'content-length') continue;
      request.setRequestHeader(name, value);
    }

    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total);
    });

    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress?.(1);
        resolve();
        return;
      }
      reject(new Error(`upload_failed_${request.status}`));
    });

    request.addEventListener('error', () => reject(new Error('upload_network_error')));
    request.addEventListener('abort', () => reject(new Error('upload_aborted')));

    signal?.addEventListener('abort', () => request.abort(), { once: true });

    request.send(file);
  });
}

/** Fayl hajmini o'qishga qulay ko'rinishda (KB / MB). */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Fayl turidan resurs turini aniqlaydi — o'qituvchi qo'lda tanlashi shart emas.
 * Aniqlanmaganda umumiy `FILE` qaytariladi.
 */
export function resourceKindForFile(file: File): 'VIDEO' | 'AUDIO' | 'PDF' | 'SCORM' | 'FILE' {
  const mime = file.type.toLowerCase();
  if (mime.startsWith('video/')) return 'VIDEO';
  if (mime.startsWith('audio/')) return 'AUDIO';
  if (mime === 'application/pdf') return 'PDF';
  if (file.name.toLowerCase().endsWith('.zip')) return 'SCORM';
  return 'FILE';
}
