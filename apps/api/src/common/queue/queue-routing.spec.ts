/**
 * Maqsad: har bir ish turi HAQIQATAN iste'molchisi bor navbatga tushishini
 * kafolatlash.
 *
 * Nima uchun kerak: `certificate.issue` CERTIFICATE navbatiga yuborilardi,
 * lekin uning ishlovchisi (ReportWorker) REPORT navbatini tinglaydi. Ish
 * navbatda abadiy qolib ketardi — sertifikat PDF hech qachon yaratilmasdi.
 * Xatolik ham chiqmasdi, chunki ishni hech kim olmagan edi. Bu test aynan
 * shu jim buzilishni ushlaydi.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { JOB_QUEUE_MAP, QUEUES } from './queue.service';

const WORKERS_DIR = join(__dirname, '..', '..', 'workers');

/** Ishlovchi fayllaridan `super(redis, QUEUES.X, ...)` chaqiruvlarini o'qiydi. */
function collectConsumedQueues(): Set<string> {
  const consumed = new Set<string>();

  for (const file of readdirSync(WORKERS_DIR)) {
    if (!file.endsWith('.worker.ts') || file.endsWith('.spec.ts')) continue;

    const source = readFileSync(join(WORKERS_DIR, file), 'utf8');
    for (const match of source.matchAll(/super\(\s*redis,\s*QUEUES\.([A-Z_]+)/g)) {
      const name = match[1] as keyof typeof QUEUES;
      consumed.add(QUEUES[name]);
    }
  }

  return consumed;
}

/** Ishlovchi fayllaridagi `case 'job.name':` yorliqlarini o'qiydi. */
function collectHandledJobs(): Set<string> {
  const handled = new Set<string>();

  for (const file of readdirSync(WORKERS_DIR)) {
    if (!file.endsWith('.worker.ts') || file.endsWith('.spec.ts')) continue;

    const source = readFileSync(join(WORKERS_DIR, file), 'utf8');

    for (const match of source.matchAll(/case '([a-z][a-z0-9_.]*)':/g)) {
      handled.add(match[1] as string);
    }

    // `switch` ishlatmaydigan ishlovchilar bitta ish turiga xizmat qiladi:
    // ular payload tipini `JobPayloads['job.name']` orqali e'lon qiladi.
    for (const match of source.matchAll(/JobPayloads\['([a-z][a-z0-9_.]*)'\]/g)) {
      handled.add(match[1] as string);
    }
  }

  return handled;
}

describe('Navbat yo`naltirilishi', () => {
  const consumedQueues = collectConsumedQueues();
  const handledJobs = collectHandledJobs();

  it('kamida bitta ishlovchi ro`yxatga olingan', () => {
    expect(consumedQueues.size).toBeGreaterThan(0);
    expect(handledJobs.size).toBeGreaterThan(0);
  });

  it.each(Object.entries(JOB_QUEUE_MAP))(
    '`%s` ishi iste`molchisi bor navbatga tushadi (%s)',
    (_jobName, queueName) => {
      expect(consumedQueues.has(queueName)).toBe(true);
    },
  );

  it.each(Object.keys(JOB_QUEUE_MAP))('`%s` ishi uchun ishlovchi mavjud', (jobName) => {
    expect(handledJobs.has(jobName)).toBe(true);
  });

  it('ishlovchi bajaradigan ish o`z navbatida turadi', () => {
    // Ishlovchi `case 'x'` yozgan bo'lsa, `x` shu ishlovchi tinglayotgan
    // navbatga yo'naltirilgan bo'lishi kerak. Aks holda `case` o'lik kod.
    for (const file of readdirSync(WORKERS_DIR)) {
      if (!file.endsWith('.worker.ts')) continue;

      const source = readFileSync(join(WORKERS_DIR, file), 'utf8');
      const queues = [...source.matchAll(/super\(\s*redis,\s*QUEUES\.([A-Z_]+)/g)].map(
        (match) => QUEUES[match[1] as keyof typeof QUEUES],
      );
      if (queues.length === 0) continue;

      for (const match of source.matchAll(/case '([a-z][a-z0-9_.]*)':/g)) {
        const jobName = match[1] as keyof typeof JOB_QUEUE_MAP;
        const target = JOB_QUEUE_MAP[jobName];
        if (!target) continue;

        expect({ file, jobName, target }).toEqual({
          file,
          jobName,
          target: queues.find((queue) => queue === target) ?? target,
        });
        expect(queues).toContain(target);
      }
    }
  });
});
