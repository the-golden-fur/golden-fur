-- New notification event: a customer or staff member submitted a bug
-- report / feature request (see 20261102003's bug_reports table). Fired by
-- notifyStaffRole (notification.service.ts) to every Developer. Standalone
-- migration since `alter type ... add value` can't run inside a transaction
-- with other DDL - same constraint as the staff_role enum additions.
alter type public.notification_event_type add value 'bug_report_submitted';
