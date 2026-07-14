import { describe, expect, test } from "bun:test";
import { DEFAULT_TELEGRAM_TEMPLATE, DEFAULT_WEBHOOK_TEMPLATE, renderNotificationTemplate } from "./server/notification-delivery";

describe("notification delivery templates", () => {
  test("crash report detail is available to default templates", () => {
    const record = {
      id: "notif-1",
      clientId: "client-1",
      host: "host-a",
      user: "user-a",
      os: "Windows",
      title: "Client crash report: panic",
      process: "crash report",
      detail: "panic: nil pointer at session.go:123",
      keyword: "crash",
      category: "crash_report" as const,
      ts: 123,
    };

    const webhook = JSON.parse(renderNotificationTemplate(DEFAULT_WEBHOOK_TEMPLATE, record, DEFAULT_WEBHOOK_TEMPLATE));
    const telegram = renderNotificationTemplate(DEFAULT_TELEGRAM_TEMPLATE, record, DEFAULT_TELEGRAM_TEMPLATE);

    expect(webhook.data.detail).toBe(record.detail);
    expect(telegram).toContain(record.detail);
  });
});
