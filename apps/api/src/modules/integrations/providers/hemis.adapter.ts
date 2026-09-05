/**
 * Maqsad: HEMIS integratsiyasi (A-03, RSK-01).
 *
 * Anti-corruption layer: HEMIS ma'lumot tuzilishi bevosita bazaga tushmaydi,
 * u avval ichki modelga o'giriladi. Shu tufayli HEMIS sxemasi o'zgarsa,
 * o'zgarish faqat shu faylga tegadi.
 *
 * `HEMIS_MODE=mock` bo'lganda realistik namunaviy ma'lumot qaytariladi —
 * tizim kalitlarsiz ham to'liq ishlaydi va e2e testlar bajariladi.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../../config/configuration';
import type { HemisAdapter, HemisCurriculum, HemisStudent, HemisTeacher } from '../contracts';
import { AppException } from '../../../common/errors/app.exception';

@Injectable()
export class MockHemisAdapter implements HemisAdapter {
  readonly mode = 'mock' as const;
  private readonly logger = new Logger(MockHemisAdapter.name);

  async fetchStudents(params: { since?: Date; groupCode?: string }): Promise<HemisStudent[]> {
    this.logger.log({ params }, "HEMIS (mock): talabalar ro'yxati so'raldi");

    // Namunaviy ma'lumot: real API bilan bir xil tuzilishda
    return [
      {
        externalId: 'HEMIS-STU-000001',
        firstName: 'Dilnoza',
        lastName: 'Rahimova',
        middleName: 'Anvarovna',
        email: 'd.rahimova@student.qdu.uz',
        phone: '+998901234567',
        groupCode: 'MI-24-01',
        specialityCode: '60110100',
        admissionYear: 2024,
        educationForm: 'DAYTIME',
        status: 'ACTIVE',
      },
      {
        externalId: 'HEMIS-STU-000002',
        firstName: 'Jasur',
        lastName: 'Toshmatov',
        middleName: 'Baxtiyorovich',
        email: 'j.toshmatov@student.qdu.uz',
        groupCode: 'MI-24-01',
        specialityCode: '60110100',
        admissionYear: 2024,
        educationForm: 'DAYTIME',
        status: 'ACTIVE',
      },
    ];
  }

  async fetchTeachers(params: { since?: Date; departmentCode?: string }): Promise<HemisTeacher[]> {
    this.logger.log({ params }, "HEMIS (mock): o'qituvchilar ro'yxati so'raldi");
    return [
      {
        externalId: 'HEMIS-TCH-000001',
        firstName: 'Aziz',
        lastName: 'Karimov',
        middleName: 'Rustamovich',
        email: 'a.karimov@qdu.uz',
        departmentCode: 'KAF-INF',
        academicDegree: 'PhD',
        position: 'Dotsent',
      },
    ];
  }

  async fetchCurricula(params: { specialityCode?: string }): Promise<HemisCurriculum[]> {
    this.logger.log({ params }, "HEMIS (mock): o'quv rejalar so'raldi");
    return [
      {
        externalId: 'HEMIS-CUR-000001',
        specialityCode: params.specialityCode ?? '60110100',
        admissionYear: 2024,
        totalCredits: 240,
        subjects: [
          {
            subjectCode: 'MAT101',
            subjectName: 'Oliy matematika',
            credits: 6,
            semesterNumber: 1,
            lectureHours: 30,
            practiceHours: 30,
            labHours: 0,
            independentHours: 120,
            controlForm: 'EXAM',
          },
          {
            subjectCode: 'INF101',
            subjectName: 'Axborot texnologiyalari',
            credits: 5,
            semesterNumber: 1,
            lectureHours: 24,
            practiceHours: 16,
            labHours: 20,
            independentHours: 90,
            controlForm: 'EXAM',
          },
        ],
      },
    ];
  }

  async pushGrades(): Promise<{ accepted: number; rejected: number; errors: string[] }> {
    this.logger.log('HEMIS (mock): baholar qabul qilindi');
    return { accepted: 0, rejected: 0, errors: [] };
  }
}

/**
 * Real HEMIS API adapteri.
 *
 * Muhim: HEMIS ning rasmiy spetsifikatsiyasi loyihaga taqdim etilmagan (A-03),
 * shuning uchun bu yerda REST konvensiyalari bo'yicha standart so'rovlar
 * amalga oshirilgan. Endpoint nomlari `.env` orqali sozlanadi va real
 * spetsifikatsiya olingach shu faylda moslanadi.
 */
@Injectable()
export class LiveHemisAdapter implements HemisAdapter {
  readonly mode = 'live' as const;
  private readonly logger = new Logger(LiveHemisAdapter.name);
  private readonly baseUrl: string;
  private readonly token?: string;

  constructor(config: ConfigService<AppConfig, true>) {
    this.baseUrl = config.get('HEMIS_BASE_URL', { infer: true });
    this.token = config.get('HEMIS_API_TOKEN', { infer: true });
  }

  async fetchStudents(params: { since?: Date; groupCode?: string }): Promise<HemisStudent[]> {
    const raw = await this.request<{ data?: unknown[] }>('/students', {
      ...(params.since ? { updated_since: params.since.toISOString() } : {}),
      ...(params.groupCode ? { group: params.groupCode } : {}),
    });
    return (raw.data ?? []).map((item) => this.mapStudent(item as Record<string, unknown>));
  }

  async fetchTeachers(params: { since?: Date; departmentCode?: string }): Promise<HemisTeacher[]> {
    const raw = await this.request<{ data?: unknown[] }>('/employees', {
      ...(params.since ? { updated_since: params.since.toISOString() } : {}),
      ...(params.departmentCode ? { department: params.departmentCode } : {}),
    });
    return (raw.data ?? []).map((item) => this.mapTeacher(item as Record<string, unknown>));
  }

  async fetchCurricula(params: { specialityCode?: string }): Promise<HemisCurriculum[]> {
    const raw = await this.request<{ data?: unknown[] }>('/curriculum', {
      ...(params.specialityCode ? { speciality: params.specialityCode } : {}),
    });
    return (raw.data ?? []).map((item) => this.mapCurriculum(item as Record<string, unknown>));
  }

  async pushGrades(
    grades: Array<{
      studentExternalId: string;
      subjectCode: string;
      semesterNumber: number;
      score: number;
      credits: number;
    }>,
  ): Promise<{ accepted: number; rejected: number; errors: string[] }> {
    const response = await fetch(`${this.baseUrl}/grades`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        grades: grades.map((grade) => ({
          student_id: grade.studentExternalId,
          subject_code: grade.subjectCode,
          semester: grade.semesterNumber,
          total_score: grade.score,
          credits: grade.credits,
        })),
      }),
    });

    if (!response.ok) {
      this.logger.error({ status: response.status }, 'HEMIS ga baholarni yuborishda xatolik');
      throw AppException.dependencyUnavailable('hemis');
    }

    const payload = (await response.json()) as {
      accepted?: number;
      rejected?: number;
      errors?: string[];
    };

    return {
      accepted: payload.accepted ?? 0,
      rejected: payload.rejected ?? 0,
      errors: payload.errors ?? [],
    };
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
    };
  }

  private async request<T>(path: string, query: Record<string, string>): Promise<T> {
    if (!this.baseUrl) throw AppException.dependencyUnavailable('hemis_not_configured');

    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);

    const response = await fetch(url, { headers: this.headers() });
    if (!response.ok) {
      this.logger.error({ path, status: response.status }, "HEMIS so'rovi muvaffaqiyatsiz");
      throw AppException.dependencyUnavailable('hemis');
    }
    return (await response.json()) as T;
  }

  // --- Anti-corruption: HEMIS shakli -> ichki model -------------------------

  private mapStudent(raw: Record<string, unknown>): HemisStudent {
    return {
      externalId: String(raw['id'] ?? raw['student_id_number'] ?? ''),
      firstName: String(raw['first_name'] ?? ''),
      lastName: String(raw['second_name'] ?? raw['last_name'] ?? ''),
      middleName: raw['third_name'] ? String(raw['third_name']) : undefined,
      email: raw['email'] ? String(raw['email']) : undefined,
      phone: raw['phone'] ? String(raw['phone']) : undefined,
      groupCode: String((raw['group'] as Record<string, unknown>)?.['name'] ?? ''),
      specialityCode: String((raw['specialty'] as Record<string, unknown>)?.['code'] ?? ''),
      admissionYear: Number(raw['year_of_enter'] ?? 0),
      educationForm: mapEducationForm(
        String((raw['educationForm'] as Record<string, unknown>)?.['code'] ?? ''),
      ),
      status: mapStudentStatus(
        String((raw['studentStatus'] as Record<string, unknown>)?.['code'] ?? ''),
      ),
    };
  }

  private mapTeacher(raw: Record<string, unknown>): HemisTeacher {
    return {
      externalId: String(raw['id'] ?? raw['employee_id_number'] ?? ''),
      firstName: String(raw['first_name'] ?? ''),
      lastName: String(raw['second_name'] ?? raw['last_name'] ?? ''),
      middleName: raw['third_name'] ? String(raw['third_name']) : undefined,
      email: raw['email'] ? String(raw['email']) : undefined,
      departmentCode: String((raw['department'] as Record<string, unknown>)?.['code'] ?? ''),
      academicDegree: raw['academicDegree'] ? String(raw['academicDegree']) : undefined,
      position: raw['staffPosition'] ? String(raw['staffPosition']) : undefined,
    };
  }

  private mapCurriculum(raw: Record<string, unknown>): HemisCurriculum {
    const subjects = Array.isArray(raw['subjects']) ? (raw['subjects'] as unknown[]) : [];
    return {
      externalId: String(raw['id'] ?? ''),
      specialityCode: String((raw['specialty'] as Record<string, unknown>)?.['code'] ?? ''),
      admissionYear: Number(raw['education_year'] ?? 0),
      totalCredits: Number(raw['total_credit'] ?? 0),
      subjects: subjects.map((item) => {
        const subject = item as Record<string, unknown>;
        return {
          subjectCode: String(subject['code'] ?? ''),
          subjectName: String(subject['name'] ?? ''),
          credits: Number(subject['credit'] ?? 0),
          semesterNumber: Number(subject['semester'] ?? 1),
          lectureHours: Number(subject['lecture'] ?? 0),
          practiceHours: Number(subject['practice'] ?? 0),
          labHours: Number(subject['laboratory'] ?? 0),
          independentHours: Number(subject['independent'] ?? 0),
          controlForm: String(subject['control_form'] ?? 'EXAM'),
        };
      }),
    };
  }
}

/** HEMIS kodlarini ichki enum ga o'girish. */
function mapEducationForm(code: string): string {
  const map: Record<string, string> = {
    '11': 'DAYTIME',
    '12': 'EVENING',
    '13': 'EXTRAMURAL',
    '14': 'DISTANCE',
  };
  return map[code] ?? 'DAYTIME';
}

function mapStudentStatus(code: string): HemisStudent['status'] {
  const map: Record<string, HemisStudent['status']> = {
    '11': 'ACTIVE',
    '12': 'ACADEMIC_LEAVE',
    '13': 'EXPELLED',
    '14': 'GRADUATED',
  };
  return map[code] ?? 'ACTIVE';
}
