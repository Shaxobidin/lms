/**
 * Maqsad: `@lms/shared` paketining ommaviy API si.
 * Backend va frontend faqat shu nuqtadan import qiladi.
 */

// Konstantalar
export * from './constants/locales';

// Tiplar
export * from './types/localized';
export * from './types/api';

// Ruxsatlar (RBAC + ABAC)
export * from './rbac/permissions';

// Domen qoidalari
export * from './domain/grading';
export * from './domain/autograde';
export * from './domain/risk';
export * from './domain/similarity';

// Utilitalar
export * from './utils/translit';
export * from './utils/datetime';

// Sxemalar
export * from './schemas/common';
export * from './schemas/auth';
export * from './schemas/org';
export * from './schemas/curriculum';
export * from './schemas/course';
export * from './schemas/assignment';
export * from './schemas/quiz';
export * from './schemas/attendance';
export * from './schemas/communication';
export * from './schemas/document';
export * from './schemas/lti';
export * from './schemas/student';

// Sayt boshqaruvi (Moodle uslubidagi sozlamalar daraxti)
export * from './admin/site-settings';

// Savollar importi (AIKEN / GIFT / CSV — sof matn tahlilchilari)
export * from './import/question-formats';

// SCORM / xAPI
export * from './scorm/types';
