/**
 * Maqsad: tizimning uchdan-uchgacha ishlashini tekshirish (promt.md §15).
 *
 * Skript real HTTP so'rovlar yuboradi va §15 dagi qabul mezonlarini
 * ketma-ket tekshiradi. Har qanday xatolik butun tekshiruvni to'xtatadi
 * va aniq sabab bilan chiqadi.
 *
 * Ishga tushirish: node scripts/smoke.mjs [API_URL]
 */

const BASE = process.argv[2] ?? process.env.API_URL ?? 'http://localhost:4000/api/v1';
const PASSWORD = 'Demo!2026';

let passed = 0;
let failed = 0;
const failures = [];

function ok(label, detail = '') {
  passed += 1;
  console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`);
}

function fail(label, reason) {
  failed += 1;
  failures.push(`${label}: ${reason}`);
  console.log(`  ✗ ${label} — ${reason}`);
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers ?? {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  return { status: response.status, payload };
}

async function login(email) {
  const { status, payload } = await request('/auth/login', {
    method: 'POST',
    body: { login: email, password: PASSWORD },
  });
  if (status !== 200 || !payload?.success) {
    throw new Error(`${email} bilan kirib bo'lmadi (${status})`);
  }
  return { token: payload.data.tokens.accessToken, user: payload.data.user };
}

async function main() {
  console.log(`\nQDU LMS — smoke test\nAPI: ${BASE}\n`);

  // --- 1. Salomatlik --------------------------------------------------------
  console.log('1. Tizim salomatligi');
  const health = await request('/health');
  if (health.payload?.data?.status === 'ok') {
    ok(
      'Health endpoint',
      `db=${health.payload.data.checks.database}, redis=${health.payload.data.checks.redis}`,
    );
  } else {
    fail('Health endpoint', JSON.stringify(health.payload));
  }

  // --- 2. Har bir rol uchun kirish (§15) -----------------------------------
  console.log("\n2. Rollar bo'yicha kirish");
  const accounts = {
    SUPER_ADMIN: 'admin@qdu.uz',
    INSTITUTION_ADMIN: 'rector@qdu.uz',
    DEANERY: 'dekan@qdu.uz',
    DEPARTMENT_HEAD: 'mudir@qdu.uz',
    METHODIST: 'metodist@qdu.uz',
    TEACHER: 'oqituvchi@qdu.uz',
    TUTOR: 'tyutor@qdu.uz',
    STUDENT: 'talaba@qdu.uz',
    EXTERNAL_EXPERT: 'ekspert@qdu.uz',
  };

  const sessions = {};
  for (const [role, email] of Object.entries(accounts)) {
    try {
      const session = await login(email);
      sessions[role] = session;
      ok(role, `${session.user.permissions.length} ta ruxsat`);
    } catch (error) {
      fail(role, error.message);
    }
  }

  const teacher = sessions.TEACHER;
  const student = sessions.STUDENT;
  const admin = sessions.SUPER_ADMIN;

  if (!teacher || !student || !admin) {
    console.log('\nAsosiy hisoblar ishlamadi — qolgan testlar bajarilmaydi.');
    summary();
    return;
  }

  // --- 3. Autentifikatsiya xavfsizligi -------------------------------------
  console.log('\n3. Autentifikatsiya xavfsizligi');

  const badLogin = await request('/auth/login', {
    method: 'POST',
    body: { login: 'talaba@qdu.uz', password: "noto'g'ri-parol" },
  });
  if (badLogin.status === 401 && badLogin.payload?.error?.code === 'INVALID_CREDENTIALS') {
    ok("Noto'g'ri parol rad etildi");
  } else {
    fail("Noto'g'ri parol", `kutilgan 401, olindi ${badLogin.status}`);
  }

  const noToken = await request('/users');
  if (noToken.status === 401) {
    ok("Tokensiz so'rov rad etildi");
  } else {
    fail("Tokensiz so'rov", `kutilgan 401, olindi ${noToken.status}`);
  }

  const badValidation = await request('/auth/login', {
    method: 'POST',
    body: { login: 'x', password: '' },
  });
  if (badValidation.status === 400 && badValidation.payload?.error?.details?.length > 0) {
    ok('Validatsiya maydon darajasida xatolik qaytardi');
  } else {
    fail('Validatsiya', `kutilgan 400 + details, olindi ${badValidation.status}`);
  }

  // --- 4. RBAC/ABAC ---------------------------------------------------------
  console.log('\n4. Ruxsatlar modeli (RBAC + ABAC)');

  const studentUsers = await request('/users', { token: student.token });
  if (studentUsers.status === 403) {
    ok("Talaba foydalanuvchilar ro'yxatiga kira olmadi");
  } else {
    fail('Talaba ruxsati', `kutilgan 403, olindi ${studentUsers.status}`);
  }

  const adminUsers = await request('/users?limit=5', { token: admin.token });
  if (adminUsers.status === 200 && Array.isArray(adminUsers.payload?.data)) {
    ok("Administrator foydalanuvchilarni ko'rdi", `${adminUsers.payload.data.length} ta`);
  } else {
    fail('Administrator ruxsati', `status ${adminUsers.status}`);
  }

  const studentSettings = await request('/admin/feature-flags', { token: student.token });
  if (studentSettings.status === 403) {
    ok('Talaba tizim sozlamalariga kira olmadi');
  } else {
    fail('Sozlamalar himoyasi', `kutilgan 403, olindi ${studentSettings.status}`);
  }

  // --- 5. Kurslar va tuzilma -----------------------------------------------
  console.log('\n5. Kurslar va tuzilma');

  const courses = await request('/courses?limit=10', { token: teacher.token });
  const teacherCourses = courses.payload?.data ?? [];
  if (courses.status === 200 && teacherCourses.length > 0) {
    ok("O'qituvchi kurslari", `${teacherCourses.length} ta`);
  } else {
    fail("O'qituvchi kurslari", `status ${courses.status}`);
  }

  const courseId = teacherCourses[0]?.id;
  if (courseId) {
    const structure = await request(`/courses/${courseId}`, { token: teacher.token });
    const modules = structure.payload?.data?.modules ?? [];
    if (structure.status === 200) {
      ok('Kurs tuzilishi', `${modules.length} modul`);
    } else {
      fail('Kurs tuzilishi', `status ${structure.status}`);
    }
  }

  const tree = await request('/org/tree', { token: admin.token });
  if (tree.status === 200 && (tree.payload?.data?.length ?? 0) >= 3) {
    ok('Tashkiliy daraxt', `${tree.payload.data.length} fakultet`);
  } else {
    fail('Tashkiliy daraxt', `status ${tree.status}`);
  }

  // --- 6. Talaba oqimi ------------------------------------------------------
  console.log('\n6. Talaba oqimi');

  const studentCourses = await request('/courses?onlyEnrolled=true&limit=10', {
    token: student.token,
  });
  const enrolled = studentCourses.payload?.data ?? [];
  if (studentCourses.status === 200 && enrolled.length > 0) {
    ok('Talaba yozilgan kurslar', `${enrolled.length} ta`);
  } else {
    fail('Talaba kurslari', `status ${studentCourses.status}`);
  }

  // Topshiriq va test biriktirilgan kursni topamiz (ro'yxat tartibi
  // kafolatlanmagani uchun barcha yozilgan kurslarni ko'rib chiqamiz)
  let studentCourseId = enrolled[0]?.id;
  let quizForFlow = null;

  for (const course of enrolled) {
    const list = await request(`/courses/${course.id}/quizzes`, { token: student.token });
    const published = (list.payload?.data ?? []).find((item) => item.isPublished);
    if (published) {
      studentCourseId = course.id;
      quizForFlow = published;
      break;
    }
  }

  if (studentCourseId) {
    const assignments = await request(`/courses/${studentCourseId}/assignments`, {
      token: student.token,
    });
    if (assignments.status === 200) {
      ok("Topshiriqlar ro'yxati", `${assignments.payload?.data?.length ?? 0} ta`);
    } else {
      fail('Topshiriqlar', `status ${assignments.status}`);
    }

    const quizzes = await request(`/courses/${studentCourseId}/quizzes`, { token: student.token });
    if (quizzes.status === 200) {
      ok("Testlar ro'yxati", `${quizzes.payload?.data?.length ?? 0} ta`);
    } else {
      fail('Testlar', `status ${quizzes.status}`);
    }

    const result = await request(`/grading/courses/${studentCourseId}/my-result`, {
      token: student.token,
    });
    if (result.status === 200 && typeof result.payload?.data?.score === 'number') {
      ok('Yakuniy ball hisoblandi', `${result.payload.data.score} (${result.payload.data.letter})`);
    } else {
      fail('Yakuniy ball', `status ${result.status}`);
    }
  }

  // --- 7. Test topshirish oqimi --------------------------------------------
  console.log('\n7. Test topshirish oqimi');

  {
    const quiz = quizForFlow;

    if (quiz) {
      const attempt = await request(`/quizzes/${quiz.id}/attempts`, {
        method: 'POST',
        token: student.token,
      });

      if (attempt.status === 201 || attempt.status === 200) {
        const data = attempt.payload?.data;
        ok('Urinish boshlandi', `${data?.questions?.length ?? 0} savol`);

        // To'g'ri javoblar mijozga YUBORILMASLIGI kerak (xavfsizlik)
        const leaked = JSON.stringify(data?.questions ?? []).includes('"isCorrect"');
        if (!leaked) {
          ok("To'g'ri javoblar mijozga sizib chiqmadi");
        } else {
          fail('Javob sizib chiqishi', 'payload ichida isCorrect topildi');
        }

        // Birinchi savolga javob saqlaymiz
        const first = data?.questions?.[0];
        if (first && first.type === 'SINGLE') {
          const optionId = first.payload?.options?.[0]?.id;
          const save = await request('/attempts/answers', {
            method: 'POST',
            token: student.token,
            body: {
              attemptId: data.attemptId,
              questionId: first.id,
              response: { type: 'SINGLE', optionId },
              flagged: false,
            },
          });
          if (save.status === 201 || save.status === 200) ok('Javob saqlandi (avtosaqlash)');
          else fail('Javob saqlash', `status ${save.status}`);
        }

        const submit = await request(`/attempts/${data.attemptId}/submit`, {
          method: 'POST',
          token: student.token,
        });
        if (submit.status === 200 || submit.status === 201) {
          ok('Urinish yakunlandi', `ball: ${submit.payload?.data?.score}`);
        } else {
          fail('Urinishni yakunlash', `status ${submit.status}`);
        }
      } else {
        fail(
          'Urinish boshlash',
          `status ${attempt.status}: ${JSON.stringify(attempt.payload?.error?.messageKey)}`,
        );
      }
    } else {
      console.log("  – Nashr etilgan test topilmadi, bosqich o'tkazib yuborildi");
    }
  }

  // --- 8. Analitika ---------------------------------------------------------
  console.log('\n8. Analitika');

  const dashboard = await request('/analytics/dashboard', { token: teacher.token });
  if (dashboard.status === 200 && dashboard.payload?.data?.totals) {
    ok("O'qituvchi dashboardi", `${dashboard.payload.data.totals.courses} kurs`);
  } else {
    fail('Dashboard', `status ${dashboard.status}`);
  }

  const overview = await request('/analytics/student-overview', { token: student.token });
  if (overview.status === 200) {
    ok("Talaba ko'rsatkichlari", `${overview.payload?.data?.courses?.total ?? 0} kurs`);
  } else {
    fail("Talaba ko'rsatkichlari", `status ${overview.status}`);
  }

  if (courseId) {
    const gradebook = await request(`/grading/courses/${courseId}/gradebook`, {
      token: teacher.token,
    });
    if (gradebook.status === 200) {
      ok('Kurs jurnali', `${gradebook.payload?.data?.length ?? 0} talaba`);
    } else {
      fail('Kurs jurnali', `status ${gradebook.status}`);
    }
  }

  // --- 9. Audit va sozlamalar ----------------------------------------------
  console.log('\n9. Administratsiya');

  const audit = await request('/admin/audit-log?limit=5', { token: admin.token });
  if (audit.status === 200 && Array.isArray(audit.payload?.data)) {
    ok('Audit jurnali', `${audit.payload.data.length} yozuv`);
  } else {
    fail('Audit jurnali', `status ${audit.status}`);
  }

  const publicSettings = await request('/admin/settings/public');
  if (publicSettings.status === 200 && publicSettings.payload?.data) {
    ok('Ochiq sozlamalar (autentifikatsiyasiz)');
  } else {
    fail('Ochiq sozlamalar', `status ${publicSettings.status}`);
  }

  const stats = await request('/admin/stats', { token: admin.token });
  if (stats.status === 200) {
    ok('Tizim statistikasi', `${stats.payload?.data?.users} foydalanuvchi`);
  } else {
    fail('Tizim statistikasi', `status ${stats.status}`);
  }

  // --- 10. Sertifikat verifikatsiyasi (ochiq) ------------------------------
  console.log('\n10. Sertifikat verifikatsiyasi');
  const verify = await request('/certificates/verify/mavjud-emas-kod');
  if (verify.status === 200 && verify.payload?.data?.valid === false) {
    ok("Noto'g'ri kod uchun to'g'ri javob qaytdi");
  } else {
    fail('Sertifikat verifikatsiyasi', `status ${verify.status}`);
  }

  // --- 11. Javob konverti ---------------------------------------------------
  console.log('\n11. API konvensiyalari');
  const envelope = health.payload;
  const hasEnvelope =
    envelope &&
    'success' in envelope &&
    'data' in envelope &&
    'meta' in envelope &&
    'error' in envelope;
  if (hasEnvelope) ok('Javob konverti { success, data, meta, error }');
  else fail('Javob konverti', "maydonlar to'liq emas");

  const notFound = await request('/courses/00000000-0000-4000-8000-000000000000', {
    token: teacher.token,
  });
  if ([403, 404].includes(notFound.status) && notFound.payload?.error?.traceId) {
    ok('Xatolik konverti traceId bilan qaytdi');
  } else {
    fail('Xatolik konverti', `status ${notFound.status}`);
  }

  summary();
}

function summary() {
  console.log(`\n${'='.repeat(52)}`);
  console.log(`Muvaffaqiyatli: ${passed}  |  Xatolik: ${failed}`);
  if (failures.length > 0) {
    console.log('\nXatoliklar:');
    for (const item of failures) console.log(`  - ${item}`);
  }
  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('\nSmoke test uzildi:', error.message);
  process.exit(1);
});
