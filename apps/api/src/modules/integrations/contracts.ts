/**
 * Maqsad: tashqi tizimlar bilan ishlash uchun ABSTRAKT interfeyslar (promt.md §10, P4).
 *
 * Har bir integratsiya shu interfeyslardan biri ortida turadi. Domen kodi
 * konkret provayderni bilmaydi — bu HEMIS API o'zgarganda (RSK-01) yoki
 * SMS provayderi almashtirilganda ilova mantig'iga tegilmasligini kafolatlaydi.
 *
 * Real kalitlar bo'lmaganda `Mock*` implementatsiyalari ishlatiladi (A-03..A-22),
 * shuning uchun tizim to'liq ishga tushadi va e2e testlar bajariladi.
 */

// --- SMS (F-01 OTP, F-10 bildirishnoma) -------------------------------------

export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

export interface SmsSendResult {
  providerMessageId: string;
  status: 'SENT' | 'QUEUED' | 'FAILED';
  cost?: number;
}

export interface SmsProvider {
  readonly name: string;
  send(phone: string, text: string): Promise<SmsSendResult>;
  /** Yetkazilganlik holatini tekshirish (provayder qo'llab-quvvatlasa). */
  getStatus?(providerMessageId: string): Promise<string>;
}

// --- HEMIS (F-02, F-03) ------------------------------------------------------

export const HEMIS_ADAPTER = Symbol('HEMIS_ADAPTER');

export interface HemisStudent {
  externalId: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  email?: string;
  phone?: string;
  groupCode: string;
  specialityCode: string;
  admissionYear: number;
  educationForm: string;
  status: 'ACTIVE' | 'EXPELLED' | 'ACADEMIC_LEAVE' | 'GRADUATED';
}

export interface HemisTeacher {
  externalId: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  email?: string;
  departmentCode: string;
  academicDegree?: string;
  position?: string;
}

export interface HemisCurriculumSubject {
  subjectCode: string;
  subjectName: string;
  credits: number;
  semesterNumber: number;
  lectureHours: number;
  practiceHours: number;
  labHours: number;
  independentHours: number;
  controlForm: string;
}

export interface HemisCurriculum {
  externalId: string;
  specialityCode: string;
  admissionYear: number;
  totalCredits: number;
  subjects: HemisCurriculumSubject[];
}

export interface HemisAdapter {
  readonly mode: 'mock' | 'live';
  fetchStudents(params: { since?: Date; groupCode?: string }): Promise<HemisStudent[]>;
  fetchTeachers(params: { since?: Date; departmentCode?: string }): Promise<HemisTeacher[]>;
  fetchCurricula(params: { specialityCode?: string }): Promise<HemisCurriculum[]>;
  /** Yakuniy baholarni HEMIS ga qaytarish (ikki tomonlama sinxronizatsiya). */
  pushGrades(
    grades: Array<{
      studentExternalId: string;
      subjectCode: string;
      semesterNumber: number;
      score: number;
      credits: number;
    }>,
  ): Promise<{ accepted: number; rejected: number; errors: string[] }>;
}

// --- One ID SSO (F-01) -------------------------------------------------------

export const SSO_PROVIDER = Symbol('SSO_PROVIDER');

export interface SsoUserInfo {
  externalId: string;
  email?: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  phone?: string;
  /** PINFL/JSHSHIR — talabani HEMIS bilan solishtirish uchun. */
  pinfl?: string;
}

export interface SsoProvider {
  readonly enabled: boolean;
  /** Foydalanuvchini yo'naltirish uchun avtorizatsiya URL (PKCE bilan). */
  buildAuthorizationUrl(state: string, codeChallenge: string): string;
  exchangeCode(code: string, codeVerifier: string): Promise<SsoUserInfo>;
}

// --- E-IMZO (F-14) -----------------------------------------------------------

export const SIGNATURE_PROVIDER = Symbol('SIGNATURE_PROVIDER');

export interface SignatureVerification {
  valid: boolean;
  signerFullName?: string;
  certificateSerial?: string;
  signedAt?: Date;
  reason?: string;
}

export interface SignatureProvider {
  readonly name: string;
  /**
   * Imzoni tekshiradi. Backend E-IMZO CSP ga to'g'ridan-to'g'ri ulana olmaydi
   * (A-05), shuning uchun imzo brauzerda yaratiladi va bu yerda tasdiqlanadi.
   */
  verify(documentHash: string, signature: string): Promise<SignatureVerification>;
}

// --- To'lov (F-12) -----------------------------------------------------------

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export interface PaymentInvoice {
  providerInvoiceId: string;
  /** Foydalanuvchi yo'naltiriladigan to'lov sahifasi. */
  paymentUrl: string;
  expiresAt: Date;
}

export interface PaymentProvider {
  readonly name: string;
  createInvoice(params: {
    orderId: string;
    amountUzs: number;
    description: string;
    returnUrl: string;
  }): Promise<PaymentInvoice>;
  /** Webhook imzosini tekshirish — soxta "to'lov bajarildi" so'rovini to'sadi. */
  verifyWebhook(payload: unknown, signature: string): boolean;
  parseWebhook(payload: unknown): { orderId: string; status: 'PAID' | 'FAILED' | 'CANCELLED' };
}

// --- Virtual sinf (F-11) -----------------------------------------------------

export const CLASSROOM_PROVIDER = Symbol('CLASSROOM_PROVIDER');

export interface MeetingSession {
  externalMeetingId: string;
  joinUrl: string;
  moderatorUrl?: string;
}

export interface ClassroomProvider {
  readonly name: string;
  createMeeting(params: {
    title: string;
    externalId: string;
    durationMinutes: number;
    recordingEnabled: boolean;
    moderatorName: string;
  }): Promise<MeetingSession>;
  buildJoinUrl(params: {
    externalMeetingId: string;
    displayName: string;
    isModerator: boolean;
  }): Promise<string>;
  /** Yozuv havolasi (mavjud bo'lsa). */
  getRecordingUrl?(externalMeetingId: string): Promise<string | null>;
  /** Ishtirokchilar ro'yxati — avtomatik davomat uchun (F-11). */
  getParticipants?(
    externalMeetingId: string,
  ): Promise<Array<{ name: string; durationSeconds: number }>>;
}

// --- Plagiat (F-06) ----------------------------------------------------------

export const PLAGIARISM_PROVIDER = Symbol('PLAGIARISM_PROVIDER');

export interface PlagiarismResult {
  similarityPercent: number;
  matches: Array<{ targetId: string; similarityPercent: number; label?: string }>;
  /** Qaysi manbalar bilan solishtirilgani — hisobotda ko'rsatiladi. */
  scope: 'INTERNAL' | 'EXTERNAL';
}

export interface PlagiarismProvider {
  readonly name: string;
  check(params: {
    submissionId: string;
    text: string;
    assignmentId: string;
  }): Promise<PlagiarismResult>;
}

// --- Telegram (F-10) ---------------------------------------------------------

export const TELEGRAM_PROVIDER = Symbol('TELEGRAM_PROVIDER');

export interface TelegramProvider {
  readonly enabled: boolean;
  sendMessage(chatId: string, text: string): Promise<{ ok: boolean }>;
  /** Bog'lash kodi orqali foydalanuvchi hisobini ulash. */
  buildDeepLink(linkCode: string): string;
}
