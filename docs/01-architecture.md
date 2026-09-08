# B1 — Arxitektura: C4, ERD, ADR

**Loyiha:** QDU LMS
**Hujjat versiyasi:** 1.0
**Bog'liq hujjat:** [`00-analysis.md`](./00-analysis.md)

---

## 1. Arxitektura printsiplari

| #   | Printsip                 | Amaliy ma'nosi                                                                                                  |
| --- | ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| P1  | **Modulli monolit**      | Bitta deploy birligi, ammo modullar orasida qat'iy chegara. Mikroservislarga bo'lish keyin ham mumkin (ADR-002) |
| P2  | **Stateless API**        | Sessiya holati Redis'da, ilova xotirasida emas → gorizontal masshtab (NF-08)                                    |
| P3  | **Deklarativ ruxsatlar** | Kodda `if (role === 'admin')` yo'q; faqat `@RequirePermission()` + policy engine                                |
| P4  | **Adapter chegarasi**    | Har bir tashqi tizim interfeys ortida; mock implementatsiya majburiy                                            |
| P5  | **Og'ir ish — navbatga** | 200 ms dan uzoq har qanday amal BullMQ ga                                                                       |
| P6  | **Ma'lumot yo'qolmaydi** | Soft delete + append-only tarix jadvallari + audit log                                                          |
| P7  | **i18n birinchi**        | Backend xatolari ham kalit sifatida qaytadi, matn frontendda hosil bo'ladi                                      |
| P8  | **Kontrakt — kod**       | zod sxemalari `packages/shared` da, backend va frontend bir manbadan foydalanadi                                |

---

## 2. C4 diagrammalari

### 2.1. Level 1 — Kontekst (System Context)

```mermaid
graph TB
    subgraph Foydalanuvchilar
        U1["Talaba / Tinglovchi"]
        U2["Professor-o'qituvchi"]
        U3["Metodist / Kafedra mudiri"]
        U4["Dekanat / Rektorat"]
        U5["Administrator"]
        U6["Tashqi ekspert"]
    end

    LMS["QDU LMS<br/>O'quv jarayonini boshqarish tizimi"]

    HEMIS["HEMIS<br/>Vazirlik axborot tizimi"]
    ONEID["One ID (id.egov.uz)<br/>Yagona identifikatsiya"]
    EIMZO["E-IMZO<br/>Elektron raqamli imzo"]
    SMS["SMS gateway<br/>Eskiz / Play Mobile"]
    TG["Telegram Bot API"]
    PAY["To'lov tizimlari<br/>Payme / Click / Uzum"]
    BBB["BigBlueButton / Jitsi<br/>Virtual sinf"]
    SMTP["SMTP server"]

    U1 --> LMS
    U2 --> LMS
    U3 --> LMS
    U4 --> LMS
    U5 --> LMS
    U6 --> LMS

    LMS -->|"Talaba, o'qituvchi,<br/>o'quv reja sinxronizatsiyasi"| HEMIS
    LMS -->|"OIDC SSO"| ONEID
    LMS -->|"Hujjat imzolash"| EIMZO
    LMS -->|"OTP, bildirishnoma"| SMS
    LMS -->|"Bildirishnoma"| TG
    LMS -->|"Pullik kurslar"| PAY
    LMS -->|"Onlayn dars, yozuv"| BBB
    LMS -->|"Email"| SMTP
```

### 2.2. Level 2 — Konteynerlar (Container)

```mermaid
graph TB
    Browser["Brauzer / PWA<br/>[Next.js 15.5.25 App Router]"]

    subgraph Edge
        NGINX["Nginx<br/>reverse proxy, TLS,<br/>rate limit, statik"]
    end

    subgraph Ilova qatlami
        WEB["apps/web<br/>[Next.js 15.5.25 + React 19]<br/>SSR, RSC, i18n"]
        API["apps/api<br/>[NestJS 10 / Node 20]<br/>REST /api/v1"]
        WORKER["apps/api (worker rejim)<br/>[BullMQ processors]<br/>email, video, hisobot"]
    end

    subgraph Ma'lumot qatlami
        PG[("PostgreSQL 16<br/>asosiy MB + FTS")]
        REDIS[("Redis 7<br/>kesh, sessiya,<br/>rate-limit, navbat")]
        S3[("MinIO / S3<br/>media, hujjat, SCORM")]
    end

    subgraph Yordamchi
        FFMPEG["FFmpeg<br/>HLS transkod"]
        MAIL["MailHog (dev)<br/>SMTP (prod)"]
    end

    Browser --> NGINX
    NGINX --> WEB
    NGINX -->|"/api/v1/*"| API
    NGINX -->|"/media/* (X-Accel)"| S3
    WEB -->|"server-side fetch"| API
    API --> PG
    API --> REDIS
    API --> S3
    API -->|"job qo'shish"| REDIS
    WORKER -->|"job olish"| REDIS
    WORKER --> PG
    WORKER --> S3
    WORKER --> FFMPEG
    WORKER --> MAIL
```

### 2.3. Level 3 — Komponentlar (API konteyneri ichida)

```mermaid
graph TB
    subgraph "apps/api"
        subgraph "Interfeys qatlami"
            CTRL["Controllers<br/>REST + OpenAPI"]
            GUARD["Guards<br/>JwtAuthGuard,<br/>PolicyGuard (RBAC+ABAC)"]
            PIPE["Pipes / Filters<br/>ZodValidationPipe,<br/>AllExceptionsFilter"]
        end

        subgraph "Domen modullari"
            M1["auth"]
            M2["org"]
            M3["curriculum"]
            M4["courses"]
            M5["content"]
            M6["assignments"]
            M7["quizzes"]
            M8["grading"]
            M9["attendance"]
            M10["messaging"]
            M11["classroom"]
            M12["certificates"]
            M13["analytics"]
            M14["documents"]
            M15["gamification"]
            M17["admin"]
        end

        subgraph "Infratuzilma qatlami"
            PRISMA["PrismaService<br/>+ soft-delete extension"]
            CACHE["CacheService (Redis)"]
            STORAGE["StorageService (S3)"]
            QUEUE["QueueService (BullMQ)"]
            AUDIT["AuditService"]
            I18N["I18nService"]
        end

        subgraph "Integratsiya adapterlari"
            AD1["HemisAdapter"]
            AD2["OneIdAdapter"]
            AD3["SignatureProvider"]
            AD4["SmsProvider"]
            AD5["PaymentProvider"]
            AD6["ClassroomProvider"]
            AD7["PlagiarismProvider"]
        end
    end

    CTRL --> GUARD --> PIPE
    PIPE --> M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14 & M15 & M17
    M1 --> AD2 & AD4
    M5 --> STORAGE & QUEUE
    M6 --> AD7
    M11 --> AD6
    M12 --> AD3
    M14 --> AD3
    M2 --> AD1
    M1 & M2 & M3 & M4 --> PRISMA
    M8 & M13 --> PRISMA
    GUARD --> CACHE
    PRISMA --> AUDIT
```

---

## 3. Ma'lumotlar modeli — ERD (Mermaid)

Sxema o'lchami tufayli 6 ta domen bo'yicha ajratilgan. Barcha jadvallarda
`id uuid`, `createdAt`, `updatedAt`, `deletedAt` mavjud (takrorlanmaslik uchun
diagrammada ko'rsatilmagan).

### 3.1. Identifikatsiya va ruxsatlar

```mermaid
erDiagram
    User ||--o{ UserRole : "ega"
    Role ||--o{ UserRole : "beriladi"
    Role ||--o{ RolePermission : "qamraydi"
    Permission ||--o{ RolePermission : "kiritiladi"
    User ||--o{ Session : "ochadi"
    User ||--o{ AuditLog : "hosil qiladi"
    User ||--o{ UserProfile : "to'ldiradi"

    User {
        uuid id PK
        string email UK
        string passwordHash
        string phone
        enum status "ACTIVE|BLOCKED|PENDING"
        bool twoFactorEnabled
        string totpSecret "shifrlangan"
        string locale "uz-Latn|uz-Cyrl|ru|en"
        timestamp lastLoginAt
    }
    UserProfile {
        uuid userId PK_FK
        string firstName
        string lastName
        string middleName
        date birthDate
        string avatarFileId FK
        json meta
    }
    Role {
        uuid id PK
        string code UK "R1..R10"
        json name "i18n"
        bool isSystem
    }
    Permission {
        uuid id PK
        string resource
        string action
        string scope "all|own_faculty|own_department|own_course|own"
        string key UK "resource:action:scope"
    }
    UserRole {
        uuid id PK
        uuid userId FK
        uuid roleId FK
        uuid scopeFacultyId FK "ABAC"
        uuid scopeDepartmentId FK "ABAC"
        timestamp expiresAt "tashqi ekspert uchun"
    }
    Session {
        uuid id PK
        uuid userId FK
        string refreshTokenHash
        string family "rotatsiya oilasi"
        string ip
        string userAgent
        bool revoked
        timestamp expiresAt
    }
```

### 3.2. Tashkiliy tuzilma va o'quv reja

```mermaid
erDiagram
    Faculty ||--o{ Department : "tarkibida"
    Department ||--o{ Speciality : "yuritadi"
    Speciality ||--o{ Group : "guruhlari"
    Speciality ||--o{ Curriculum : "o'quv rejasi"
    AcademicYear ||--o{ Semester : "bo'linadi"
    Curriculum ||--o{ CurriculumSubject : "tarkib"
    Subject ||--o{ CurriculumSubject : "kiritiladi"
    Subject ||--o{ Syllabus : "sillabusi"
    Syllabus ||--o{ SyllabusVersion : "versiyalari"
    Group ||--o{ Enrollment : "talabalari"
    Department ||--o{ Subject : "biriktirilgan"

    Faculty {
        uuid id PK
        string code UK
        json name
        uuid deanId FK
    }
    Department {
        uuid id PK
        uuid facultyId FK
        string code UK
        json name
        uuid headId FK
    }
    Speciality {
        uuid id PK
        uuid departmentId FK
        string code UK "60110100"
        json name
        enum level "BACHELOR|MASTER|COURSE"
    }
    Group {
        uuid id PK
        uuid specialityId FK
        string name UK
        int admissionYear
        enum educationForm "DAYTIME|EXTRAMURAL|EVENING|DISTANCE"
        uuid curatorId FK
    }
    AcademicYear {
        uuid id PK
        string name UK "2026-2027"
        date startsAt
        date endsAt
        bool isCurrent
    }
    Semester {
        uuid id PK
        uuid academicYearId FK
        int number
        date startsAt
        date endsAt
        bool isCurrent
    }
    Curriculum {
        uuid id PK
        uuid specialityId FK
        string code
        int totalCredits
        enum status "DRAFT|APPROVED|ARCHIVED"
    }
    Subject {
        uuid id PK
        uuid departmentId FK
        string code UK
        json name
        int credits
        enum controlForm "EXAM|CREDIT|COURSE_WORK"
    }
    CurriculumSubject {
        uuid id PK
        uuid curriculumId FK
        uuid subjectId FK
        int semesterNumber
        int lectureHours
        int practiceHours
        int labHours
        int independentHours
    }
    Syllabus {
        uuid id PK
        uuid subjectId FK
        uuid departmentId FK
        enum status "DRAFT|REVIEW|APPROVED|REJECTED"
        int currentVersion
    }
    SyllabusVersion {
        uuid id PK
        uuid syllabusId FK
        int version
        json content "maqsad, natijalar, mavzular, adabiyot"
        json gradingPolicy "JN/ON/YN og'irliklari"
        uuid authorId FK
        uuid approvedById FK
        timestamp approvedAt
        string rejectReason
    }
```

### 3.3. Kurs, kontent va yozilish

```mermaid
erDiagram
    Course ||--o{ Module : "modullari"
    Module ||--o{ Topic : "mavzulari"
    Topic ||--o{ Lesson : "darslari"
    Lesson ||--o{ Resource : "resurslari"
    Course ||--o{ Enrollment : "yozilishlar"
    Course ||--o{ CourseTeacher : "o'qituvchilari"
    Resource ||--o| FileObject : "fayli"
    Lesson ||--o{ LessonProgress : "progress"
    Course ||--o{ ScormPackage : "scorm"

    Course {
        uuid id PK
        uuid subjectId FK
        uuid semesterId FK
        uuid departmentId FK
        string code UK
        json title
        json description
        enum type "ACADEMIC|PROFESSIONAL_DEV|OPEN"
        enum status "DRAFT|PUBLISHED|ARCHIVED"
        enum deliveryMode "ONLINE|BLENDED|CLASSIC"
        bool isPaid
        int priceUzs
        uuid coverFileId FK
        json gradingPolicy
        int enrollmentLimit
    }
    Module {
        uuid id PK
        uuid courseId FK
        json title
        int position
        bool isPublished
    }
    Topic {
        uuid id PK
        uuid moduleId FK
        json title
        int position
        enum bloomLevel "REMEMBER|UNDERSTAND|APPLY|ANALYZE|EVALUATE|CREATE"
    }
    Lesson {
        uuid id PK
        uuid topicId FK
        json title
        json contentHtml
        int position
        int durationMinutes
        bool isPublished
        json availability "sana oralig'i, oldingi dars sharti"
    }
    Resource {
        uuid id PK
        uuid lessonId FK
        uuid fileObjectId FK
        enum kind "VIDEO|PDF|AUDIO|LINK|H5P|SCORM|XAPI|TEXT"
        json title
        string externalUrl
        json meta "HLS manifest, davomiylik"
        int position
    }
    FileObject {
        uuid id PK
        string bucket
        string objectKey UK
        string mimeType
        bigint sizeBytes
        string checksumSha256
        string originalName
        uuid uploadedById FK
        enum status "PENDING|READY|FAILED"
        json variants "HLS/thumbnail"
    }
    Enrollment {
        uuid id PK
        uuid courseId FK
        uuid userId FK
        uuid groupId FK
        enum status "ACTIVE|COMPLETED|WITHDRAWN|PENDING_PAYMENT"
        timestamp enrolledAt
        timestamp completedAt
        decimal progressPercent
    }
    CourseTeacher {
        uuid id PK
        uuid courseId FK
        uuid userId FK
        enum role "LEAD|ASSISTANT|EXAMINER"
        int workloadHours
    }
    LessonProgress {
        uuid id PK
        uuid lessonId FK
        uuid userId FK
        enum state "NOT_STARTED|IN_PROGRESS|COMPLETED"
        int secondsSpent
        decimal lastPosition
        timestamp completedAt
    }
    ScormPackage {
        uuid id PK
        uuid courseId FK
        uuid fileObjectId FK
        string version "1.2|2004"
        string entryPoint
        json manifest
    }
```

### 3.4. Topshiriq, test va baholash

```mermaid
erDiagram
    Assignment ||--o{ Submission : "javoblar"
    Assignment ||--o| Rubric : "rubrika"
    Rubric ||--o{ RubricCriterion : "mezonlari"
    Submission ||--o{ RubricScore : "mezon ballari"
    QuestionBank ||--o{ Question : "savollari"
    Question ||--o{ QuestionOption : "variantlari"
    Quiz ||--o{ QuizQuestion : "tarkibi"
    Question ||--o{ QuizQuestion : "ishlatiladi"
    Quiz ||--o{ QuizAttempt : "urinishlar"
    QuizAttempt ||--o{ QuizAnswer : "javoblar"
    Grade ||--o{ GradeHistory : "tarixi"
    ControlType ||--o{ Grade : "turi"

    Assignment {
        uuid id PK
        uuid courseId FK
        uuid topicId FK
        json title
        json description
        enum kind "INDIVIDUAL|GROUP"
        int maxScore
        timestamp dueAt
        timestamp lateUntil
        decimal latePenaltyPercent
        bool peerReviewEnabled
        int peerReviewCount
        bool plagiarismCheck
        uuid rubricId FK
        json allowedMimeTypes
        int maxFileSizeMb
    }
    Submission {
        uuid id PK
        uuid assignmentId FK
        uuid userId FK
        uuid groupSubmissionId
        json contentHtml
        json fileIds
        int attemptNumber
        enum status "DRAFT|SUBMITTED|LATE|GRADED|RETURNED"
        decimal score
        json feedback
        decimal similarityPercent
        uuid gradedById FK
        timestamp submittedAt
        timestamp gradedAt
    }
    Rubric {
        uuid id PK
        uuid courseId FK
        json title
        int totalPoints
    }
    RubricCriterion {
        uuid id PK
        uuid rubricId FK
        json title
        json levels "daraja: ball + tavsif"
        int maxPoints
        int position
    }
    RubricScore {
        uuid id PK
        uuid submissionId FK
        uuid criterionId FK
        decimal points
        string comment
    }
    QuestionBank {
        uuid id PK
        uuid courseId FK
        uuid subjectId FK
        json title
        bool isShared
    }
    Question {
        uuid id PK
        uuid bankId FK
        enum type "SINGLE|MULTI|MATCHING|ORDERING|CLOZE|ESSAY|NUMERIC|HOTSPOT|DRAG_DROP|CODE"
        json text
        json payload "turga xos ma'lumot"
        decimal defaultScore
        enum bloomLevel
        enum difficulty "EASY|MEDIUM|HARD"
        json tags
        decimal facilityIndex "item analysis"
        decimal discriminationIndex
        int usageCount
    }
    QuestionOption {
        uuid id PK
        uuid questionId FK
        json text
        bool isCorrect
        decimal weight
        int position
        json meta "hotspot koordinatalari"
    }
    Quiz {
        uuid id PK
        uuid courseId FK
        uuid topicId FK
        json title
        enum controlType "JN|ON|YN|PRACTICE"
        int durationMinutes
        int maxAttempts
        enum gradingMethod "HIGHEST|LAST|AVERAGE|FIRST"
        bool shuffleQuestions
        bool shuffleOptions
        int questionsPerAttempt
        timestamp opensAt
        timestamp closesAt
        decimal passScore
        bool proctoringEnabled
        bool showAnswersAfter
    }
    QuizQuestion {
        uuid id PK
        uuid quizId FK
        uuid questionId FK
        decimal score
        int position
        string poolTag "randomizatsiya guruhi"
    }
    QuizAttempt {
        uuid id PK
        uuid quizId FK
        uuid userId FK
        int attemptNumber
        enum status "IN_PROGRESS|SUBMITTED|GRADED|EXPIRED|VOIDED"
        json questionOrder
        decimal score
        decimal maxScore
        timestamp startedAt
        timestamp submittedAt
        json proctoringEvents
        string ip
    }
    QuizAnswer {
        uuid id PK
        uuid attemptId FK
        uuid questionId FK
        json response
        decimal score
        bool isCorrect
        bool needsManualGrading
        json graderFeedback
    }
    ControlType {
        uuid id PK
        string code UK "JN|ON|YN"
        json name
        decimal defaultWeight
    }
    Grade {
        uuid id PK
        uuid courseId FK
        uuid userId FK
        uuid controlTypeId FK
        uuid sourceQuizId FK
        uuid sourceAssignmentId FK
        decimal score
        decimal maxScore
        enum origin "AUTO|MANUAL|IMPORTED"
        uuid gradedById FK
        bool isFinal
        string comment
    }
    GradeHistory {
        uuid id PK
        uuid gradeId FK
        decimal oldScore
        decimal newScore
        uuid changedById FK
        string reason
        timestamp changedAt
    }
```

### 3.5. Davomat, jadval va kommunikatsiya

```mermaid
erDiagram
    Schedule ||--o{ ClassSession : "darslari"
    ClassSession ||--o{ Attendance : "davomat"
    Attendance ||--o{ AttendanceHistory : "tarixi"
    ForumThread ||--o{ ForumPost : "postlari"
    ForumPost ||--o{ ForumPost : "javoblari"
    Notification }o--|| NotificationChannel : "kanal"

    Schedule {
        uuid id PK
        uuid courseId FK
        uuid groupId FK
        uuid teacherId FK
        int weekday
        time startsAt
        time endsAt
        string room
        enum lessonType "LECTURE|PRACTICE|LAB|SEMINAR"
        int weekParity "0=har hafta"
    }
    ClassSession {
        uuid id PK
        uuid scheduleId FK
        uuid courseId FK
        uuid teacherId FK
        date date
        enum status "PLANNED|ONGOING|FINISHED|CANCELLED"
        string topic
        string qrToken
        timestamp qrExpiresAt
        json geoFence "lat, lng, radius"
        string meetingUrl
        string recordingUrl
    }
    Attendance {
        uuid id PK
        uuid classSessionId FK
        uuid userId FK
        enum status "PRESENT|ABSENT|LATE|EXCUSED"
        enum method "MANUAL|QR|GEO|AUTO_VIRTUAL"
        uuid excuseFileId FK
        uuid markedById FK
        timestamp markedAt
    }
    AttendanceHistory {
        uuid id PK
        uuid attendanceId FK
        string oldStatus
        string newStatus
        uuid changedById FK
        string reason
        timestamp changedAt
    }
    ForumThread {
        uuid id PK
        uuid courseId FK
        uuid authorId FK
        string title
        bool isPinned
        bool isLocked
        int postCount
        timestamp lastPostAt
    }
    ForumPost {
        uuid id PK
        uuid threadId FK
        uuid parentId FK
        uuid authorId FK
        string contentHtml
        int depth
        bool isAnswer
    }
    Message {
        uuid id PK
        uuid senderId FK
        uuid recipientId FK
        string subject
        string body
        timestamp readAt
    }
    Announcement {
        uuid id PK
        uuid courseId FK
        uuid authorId FK
        json title
        json body
        enum audience "ALL|COURSE|GROUP|ROLE"
        json audienceRef
        timestamp publishAt
    }
    Notification {
        uuid id PK
        uuid userId FK
        string templateKey
        json params
        json channels
        enum status "PENDING|SENT|FAILED|READ"
        timestamp readAt
    }
    NotificationChannel {
        uuid id PK
        string code UK "IN_APP|EMAIL|SMS|TELEGRAM|PUSH"
        bool enabled
    }
```

### 3.6. Sertifikat, hujjat, gamifikatsiya va tizim

```mermaid
erDiagram
    CertificateTemplate ||--o{ Certificate : "shablon"
    Certificate ||--|| VerificationCode : "QR kodi"
    Badge ||--o{ UserBadge : "beriladi"

    CertificateTemplate {
        uuid id PK
        json name
        string htmlTemplate
        string cssTemplate
        json fields
        enum orientation "PORTRAIT|LANDSCAPE"
        bool isActive
    }
    Certificate {
        uuid id PK
        uuid templateId FK
        uuid userId FK
        uuid courseId FK
        string serialNumber UK
        json payload "F.I.Sh, kurs, soat, sana"
        uuid pdfFileId FK
        enum status "ISSUED|REVOKED"
        timestamp issuedAt
        timestamp expiresAt
        uuid issuedById FK
    }
    VerificationCode {
        uuid id PK
        uuid certificateId FK
        string code UK "public URL segmenti"
        int viewCount
    }
    GeneratedDocument {
        uuid id PK
        string templateKey "rating_sheet|order|reference|protocol"
        json params
        uuid fileObjectId FK
        enum format "DOCX|PDF|XLSX"
        uuid createdById FK
        string signatureHash
        json signatureMeta
    }
    Badge {
        uuid id PK
        string code UK
        json name
        json description
        string icon
        json rule "shart: tur + chegara"
        int xpReward
    }
    UserBadge {
        uuid id PK
        uuid userId FK
        uuid badgeId FK
        uuid courseId FK
        timestamp awardedAt
    }
    UserXp {
        uuid userId PK_FK
        int totalXp
        int level
        int weeklyXp
    }
    AuditLog {
        uuid id PK
        uuid actorId FK
        string action
        string resource
        string resourceId
        json before
        json after
        string ip
        string userAgent
        string traceId
        timestamp createdAt
    }
    Setting {
        string key PK
        json value
        string description
        bool isPublic
    }
    FeatureFlag {
        string key PK
        bool enabled
        json rolloutRules
        string description
    }
    XapiStatement {
        uuid id PK
        uuid actorUserId FK
        json statement
        string verbId
        string objectId
        uuid courseId FK
        timestamp storedAt
    }
    Payment {
        uuid id PK
        uuid userId FK
        uuid courseId FK
        string provider
        string externalId
        int amountUzs
        enum status "PENDING|PAID|FAILED|REFUNDED"
        json rawPayload
    }
```

---

## 4. Ruxsatlar modeli (RBAC + ABAC)

### 4.1. Kalit formati

```
resource:action:scope
```

- **resource** — `course`, `grade`, `user`, `syllabus`, ...
- **action** — `create`, `read`, `update`, `delete`, `approve`, `export`, `grade`
- **scope** — `all` | `own_faculty` | `own_department` | `own_course` | `own`

### 4.2. Baholash algoritmi

```mermaid
flowchart TD
    A["So'rov: @RequirePermission('grade:update:own_course')"] --> B{"Token yaroqli?"}
    B -->|yo'q| E401["401 UNAUTHENTICATED"]
    B -->|ha| C["Foydalanuvchining effektiv ruxsatlari<br/>(Redis kesh, 60 s)"]
    C --> D{"Kerakli kalit bormi?<br/>(scope kengroq bo'lsa ham hisobga olinadi)"}
    D -->|yo'q| E403["403 FORBIDDEN"]
    D -->|ha| F{"scope = all ?"}
    F -->|ha| OK["Ruxsat"]
    F -->|yo'q| G["ABAC: resurs kontekstini yuklash<br/>(ScopeResolver)"]
    G --> H{"Foydalanuvchi atributi<br/>resurs atributiga mos?"}
    H -->|ha| OK
    H -->|yo'q| E403
```

`ScopeResolver` — har bir resurs turi uchun "bu resurs qaysi fakultet/kafedra/kursga
tegishli" savoliga javob beruvchi registratsiya qilinadigan funksiya. Shu sababli
domen kodida hech qanday rol tekshiruvi bo'lmaydi (P3).

### 4.3. Rollar va scope

| Rol                 | Asosiy scope                      | ABAC atributi                |
| ------------------- | --------------------------------- | ---------------------------- |
| R1 Super admin      | `all`                             | —                            |
| R2 Muassasa admin   | `all` (konfiguratsiya)            | —                            |
| R3 Rektorat/Dekanat | `own_faculty`                     | `UserRole.scopeFacultyId`    |
| R4 Kafedra mudiri   | `own_department`                  | `UserRole.scopeDepartmentId` |
| R5 Metodist         | `own_faculty` (metodik resurslar) | `scopeFacultyId`             |
| R6 O'qituvchi       | `own_course`                      | `CourseTeacher`              |
| R7 Tyutor           | `own_group`                       | `Group.curatorId`            |
| R8 Talaba           | `own`                             | `userId`                     |
| R9 Tashqi ekspert   | `own_course` + `expiresAt`        | vaqtinchalik `UserRole`      |
| R10 Mehmon          | ochiq resurslar                   | —                            |

---

## 5. API konvensiyalari

### 5.1. Javob konverti

```json
{ "success": true, "data": {}, "meta": { "page": 1, "total": 0 }, "error": null }
```

Xatolikda:

```json
{
  "success": false,
  "data": null,
  "meta": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "messageKey": "errors.validation",
    "message": { "uz-Latn": "...", "ru": "...", "en": "..." },
    "details": [{ "field": "email", "code": "invalid_email" }],
    "traceId": "01J..."
  }
}
```

### 5.2. Xatolik katalogi

| HTTP | `code`                    | Qachon                                       |
| ---- | ------------------------- | -------------------------------------------- |
| 400  | `VALIDATION_ERROR`        | zod sxemasi rad etdi                         |
| 401  | `UNAUTHENTICATED`         | token yo'q / muddati o'tgan                  |
| 401  | `INVALID_CREDENTIALS`     | login/parol noto'g'ri                        |
| 401  | `TWO_FACTOR_REQUIRED`     | 2FA kodi kutilmoqda                          |
| 403  | `FORBIDDEN`               | ruxsat yetarli emas                          |
| 404  | `NOT_FOUND`               | resurs yo'q yoki scope tashqarisida          |
| 409  | `CONFLICT`                | unikal cheklov / holat mos emas              |
| 409  | `IDEMPOTENCY_CONFLICT`    | bir xil kalit, boshqa tana                   |
| 413  | `PAYLOAD_TOO_LARGE`       | fayl limitidan katta                         |
| 415  | `UNSUPPORTED_MEDIA_TYPE`  | MIME/magic bytes mos emas                    |
| 422  | `BUSINESS_RULE_VIOLATION` | domen qoidasi (masalan, muddati o'tgan test) |
| 429  | `RATE_LIMITED`            | limit oshdi (`Retry-After` sarlavhasi bilan) |
| 500  | `INTERNAL_ERROR`          | kutilmagan xato (traceId bilan)              |
| 503  | `DEPENDENCY_UNAVAILABLE`  | tashqi tizim javob bermadi                   |

### 5.3. Pagination

- Cursor-based: `?cursor=<opaque>&limit=50` → `meta.nextCursor`
- `limit` maksimum **100**, standart 20
- Kichik lug'atlar uchun offset ham qo'llab-quvvatlanadi (`?page=&perPage=`)

### 5.4. Idempotentlik

`POST` uchun `Idempotency-Key` sarlavhasi. Kalit + endpoint + tana hash'i Redis'da
24 soat saqlanadi; takroriy so'rov saqlangan javobni qaytaradi.

### 5.5. Rate limit (rol bo'yicha)

| Rol        | So'rov / daqiqa | Auth endpointlari |
| ---------- | --------------- | ----------------- |
| Mehmon     | 60              | 5 / 15 daq        |
| Talaba     | 300             | 10 / 15 daq       |
| O'qituvchi | 600             | 10 / 15 daq       |
| Admin      | 1200            | 10 / 15 daq       |

---

## 6. ADR — Arxitektura qarorlari

> Format: **Kontekst → Qaror → Oqibatlar (+/−) → Alternativalar**

### ADR-001 — Modulli monolit, mikroservis emas

**Kontekst.** 12 000 foydalanuvchi, 2 000 bir vaqtda, kichik ishlab chiqish jamoasi.
**Qaror.** NestJS modullaridan iborat bitta deploy birligi. Modullar orasidagi
murojaat faqat servis interfeyslari orqali; to'g'ridan-to'g'ri boshqa modulning
Prisma so'rovi taqiqlanadi (ESLint qoidasi bilan nazorat qilinadi).
**Oqibatlar.** (+) Tranzaksiya yaxlitligi, sodda deploy, past kechikish.
(−) Bitta katta jarayon; masshtab faqat gorizontal. Bu NF-02 uchun yetarli.
**Alternativa.** Mikroservislar — 500 RPS uchun asossiz murakkablik.

### ADR-002 — Ma'lumotlar bazasi: PostgreSQL 16, yagona instans

**Kontekst.** Relatsion, tranzaksiyaga muhtoj ma'lumot (baho, davomat) + qidiruv + JSON.
**Qaror.** PostgreSQL 16; `jsonb` i18n va moslashuvchan payload uchun; FTS
(`tsvector` + `pg_trgm`) global qidiruv uchun (A-13); o'qish uchun replika prod'da.
**Oqibatlar.** (+) Bitta texnologiya, ACID, kuchli indekslar.
(−) FTS Elasticsearch darajasida emas — hozirgi hajm uchun yetarli.

### ADR-003 — Prisma ORM

**Kontekst.** TypeScript strict, tez ishlab chiqish, migratsiyalar.
**Qaror.** Prisma + `prisma migrate`; soft-delete Prisma Client `$extends` orqali;
og'ir analitik so'rovlar uchun `$queryRaw` (parametrlangan).
**Oqibatlar.** (+) Tur xavfsizligi, avtomatik migratsiya. (−) Murakkab agregatsiyalarda
cheklovlar → raw SQL. `migrate` forward-only bo'lgani uchun har bir migratsiyaga qo'lda
`down.sql` yoziladi (A-27, §16 talabi).

### ADR-004 — Og'ir vazifalar BullMQ navbatiga

**Kontekst.** Video transkodlash, DOCX/XLSX hisobot, ommaviy email/SMS, avtomatik baholash.
**Qaror.** BullMQ (Redis). API faqat job qo'shadi va `jobId` qaytaradi; natija
`FileObject` sifatida saqlanadi va SSE orqali xabar beriladi.
**Oqibatlar.** (+) API p95 < 300 ms saqlanadi (NF-01). (−) Asinxron UX — progress
ko'rsatkichi kerak.

### ADR-005 — Autentifikatsiya: JWT access + rotatsiyalanuvchi refresh

**Kontekst.** Stateless API (P2) + sessiyani bekor qilish imkoniyati.
**Qaror.** Access token 15 daqiqa (JWT, xotirada saqlanadi), refresh token 30 kun
(`httpOnly` cookie, bazada hash'i, oila (`family`) bo'yicha rotatsiya + reuse detection:
eski token ishlatilsa butun oila bekor qilinadi).
**Oqibatlar.** (+) O'g'irlangan tokenni aniqlash. (−) Har bir yangilashda yozish —
Redis + PostgreSQL kombinatsiyasi bilan yumshatiladi.

### ADR-006 — Parol xeshi: Argon2id

**Qaror.** `argon2id`, `memoryCost = 19456 KiB`, `timeCost = 2`, `parallelism = 1`
(OWASP 2021 tavsiyasi). bcrypt emas — GPU hujumiga chidamliroq.

### ADR-007 — i18n: kalit-asosli, kontent uchun JSONB

**Qaror.** UI matnlari — `next-intl` JSON kataloglari (`uz-Latn`, `uz-Cyrl`, `ru`, `en`).
Domen kontenti — `jsonb` maydonida `{ "uz-Latn": "...", "ru": "..." }` (A-15).
Backend hech qachon tayyor matn qaytarmaydi — faqat `messageKey` + parametrlar.
**Oqibatlar.** (+) Yangi til qo'shish — faqat katalog fayli. (−) JSONB ichida
qidiruv indeksi maxsus (`jsonb_path_ops` + generated `tsvector` ustuni).

### ADR-008 — SCORM: o'z RTE adapterimiz

**Kontekst.** SCORM 1.2 va 2004 ni qo'llab-quvvatlash talab qilinadi (§12);
ochiq va ishonchli npm paketi yo'q (A-06).
**Qaror.** `packages/shared/src/scorm` ichida `window.API` (1.2) va
`window.API_1484_11` (2004) obyektlarini implementatsiya qilamiz; paket iframe
sandbox'da yuklanadi, `cmi.*` model bazaga (`ScormTracking`) saqlanadi.
**Oqibatlar.** (+) Tashqi bog'liqlik yo'q, to'liq nazorat. (−) Standartning kamdan-kam
ishlatiladigan qismlari (`cmi.interactions` to'liq) minimal darajada.

### ADR-009 — Fayl saqlash: S3-mos (MinIO), presigned upload

**Qaror.** Fayl brauzerdan to'g'ridan-to'g'ri S3 ga (presigned PUT) yuklanadi; API
faqat `FileObject` yozuvini yaratadi va yuklangandan keyin validatsiya (magic bytes,
hajm, checksum) ni navbatda bajaradi. Media Nginx orqali alohida `MEDIA_DOMAIN` dan
uzatiladi (§11).
**Oqibatlar.** (+) API RAM/CPU yuklanmaydi. (−) Yuklanmagan `PENDING` yozuvlarni
tozalovchi cron kerak.

### ADR-010 — Real-time: SSE + Redis pub/sub

**Qaror.** WebSocket o'rniga SSE (A-14): bildirishnoma, forum yangiligi, job progress.
**Oqibatlar.** (+) HTTP/2 ustida sodda, proxy bilan muammosiz, avtomatik qayta ulanish.
(−) Bir tomonlama — mijozdan yozish oddiy REST orqali.

### ADR-011 — Validatsiya: zod (yagona manba)

**Qaror.** Barcha DTO'lar `packages/shared/src/schemas` da zod sxemasi sifatida;
backend `ZodValidationPipe`, frontend `react-hook-form` + `zodResolver`, OpenAPI
sxemasi `zod-to-openapi` orqali generatsiya qilinadi.
**Oqibatlar.** (+) Kontrakt bitta joyda, drift yo'q. (−) NestJS `class-validator`
ekotizimidan chetlanish — bu ongli qaror (§6 "chetlanish uchun sabab").

### ADR-012 — Baholash: hisoblangan qiymat, saqlanmaydigan yakuniy ball

**Kontekst.** JN/ON/YN og'irliklari sillabusda o'zgarishi mumkin.
**Qaror.** Har bir `Grade` — atomik ball. Yakuniy ball, GPA va reyting
`GradingEngine` tomonidan sillabus siyosati asosida hisoblanadi va Redis'ga
keshlanadi (jurnal yopilganda `Transcript` ga muzlatiladi).
**Oqibatlar.** (+) Siyosat o'zgarsa qayta hisoblash mumkin. (−) Hisoblash narxi —
kesh va materiallashtirilgan `Transcript` bilan yechiladi.

### ADR-013 — Frontend: Next.js App Router, server komponentlari birinchi

**Qaror.** Ma'lumot o'qish — RSC (server komponent) orqali; interaktivlik kerak
bo'lgan joyda `"use client"` + TanStack Query. Client state faqat UI holati uchun
(Zustand).
**Oqibatlar.** (+) LCP < 2.5 s (NF-01), kam JS. (−) Ikki xil ma'lumot olish yo'li —
konvensiya bilan tartibga solinadi.

### ADR-014 — Audit: Prisma extension + aniq `AuditService`

**Qaror.** Yozish amallari `AuditService.record()` orqali; `before`/`after`
snapshot'lari `jsonb` da; PII maydonlari maskirovka qilinadi. Audit yozuvlari
hech qachon o'chirilmaydi va yangilanmaydi (faqat `INSERT`).

### ADR-015 — Ko'p tilli qidiruv va translit

**Qaror.** `search_vector` generated ustuni `unaccent` + lotin transliteratsiyasi
bilan to'ldiriladi; kirillcha so'rov ham lotinchaga o'giriladi (A-16), shuning uchun
"Матeматика" va "Matematika" bir xil natija beradi.

---

## 7. Deploy topologiyasi

```mermaid
graph LR
    subgraph "Internet"
        CL["Foydalanuvchilar"]
    end
    subgraph "DMZ"
        NG["Nginx<br/>TLS 1.3, HSTS,<br/>rate limit"]
    end
    subgraph "Ilova tarmog'i (ichki)"
        W1["web-1"]
        W2["web-2"]
        A1["api-1"]
        A2["api-2"]
        WK["worker-1..N"]
    end
    subgraph "Ma'lumot tarmog'i (ichki, TLS)"
        PG[("PostgreSQL<br/>primary")]
        PGR[("replica")]
        RD[("Redis")]
        S3[("MinIO")]
    end

    CL --> NG
    NG --> W1 & W2
    NG --> A1 & A2
    NG --> S3
    A1 & A2 --> PG
    A1 & A2 --> PGR
    A1 & A2 --> RD
    WK --> RD
    WK --> PG
    PG --> PGR
```

**RPO ≤ 1 soat:** WAL arxivlash + har soatlik inkremental nusxa.
**RTO ≤ 4 soat:** `docker compose` bilan qayta ko'tarish + `pg_restore` protsedurasi
(`docs/deploy.md`).

---

## Bosqich yakuni

**Bajarildi:** C4 (3 daraja), 6 domen bo'yicha to'liq ERD, ruxsat modeli algoritmi,
API konvensiyalari va xatolik katalogi, 15 ta ADR, deploy topologiyasi.

**Keyingi (B2):** monorepo skeleti (npm workspaces), Docker Compose (postgres, redis,
minio, mailhog, api, web, nginx), Prisma sxemasi va birinchi migratsiya, GitHub Actions CI.
