import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runDueJobs } from './jobs.service.ts';
import { runStayCheckoutJob } from '../hotel/jobs/stayCheckout.job.ts';
import { runAppointmentReminderJob } from '../notifications/services/appointmentReminder.job.ts';
import {
  runCareLogDailyReportJob,
  shouldRunAt,
} from '../notifications/services/careLogDailyReport.job.ts';

vi.mock('../hotel/jobs/stayCheckout.job.ts', () => ({
  runStayCheckoutJob: vi.fn(),
}));
vi.mock('../notifications/services/appointmentReminder.job.ts', () => ({
  runAppointmentReminderJob: vi.fn(),
}));
vi.mock('../notifications/services/careLogDailyReport.job.ts', () => ({
  runCareLogDailyReportJob: vi.fn(),
  shouldRunAt: vi.fn(),
}));

const NOW = new Date('2026-10-22T13:30:00.000Z');

describe('jobs.service runDueJobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runStayCheckoutJob).mockResolvedValue(2);
    vi.mocked(runAppointmentReminderJob).mockResolvedValue(1);
    vi.mocked(runCareLogDailyReportJob).mockResolvedValue(3);
    vi.mocked(shouldRunAt).mockReturnValue(true);
  });

  it('runs every job with the same clock and reports each count', async () => {
    expect(await runDueJobs(NOW)).toEqual({
      stayCheckout: 2,
      appointmentReminder: 1,
      careLogDailyReport: 3,
    });
    expect(runStayCheckoutJob).toHaveBeenCalledWith(NOW);
    expect(runAppointmentReminderJob).toHaveBeenCalledWith(NOW);
    expect(runCareLogDailyReportJob).toHaveBeenCalledWith(NOW);
  });

  it('skips the care-log daily report outside its evening window', async () => {
    vi.mocked(shouldRunAt).mockReturnValue(false);

    const result = await runDueJobs(NOW);

    expect(result.careLogDailyReport).toBeNull();
    expect(runCareLogDailyReportJob).not.toHaveBeenCalled();
  });

  it('keeps running the other jobs when one fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(runStayCheckoutJob).mockRejectedValue(new Error('db down'));

    const result = await runDueJobs(NOW);

    expect(result.stayCheckout).toEqual({ error: 'db down' });
    expect(result.appointmentReminder).toBe(1);
    expect(result.careLogDailyReport).toBe(3);
  });
});
