import { notifications } from "../../database/schema";

export async function createInAppNotifications(
  tx: any,
  input: {
    groupId: number | null;
    userIds: Array<number | null | undefined>;
    type: string;
    title: string;
    body: string;
    metadata?: Record<string, unknown>;
  },
) {
  const userIds = [...new Set(input.userIds.filter((id): id is number => Number.isSafeInteger(id) && Number(id) > 0))];
  if (!userIds.length) return 0;
  await tx.insert(notifications).values(userIds.map(userId => ({
    groupId: input.groupId,
    userId,
    channel: "in_app" as const,
    type: input.type,
    title: input.title,
    body: input.body,
    status: "queued" as const,
    metadata: input.metadata ?? null,
  })));
  return userIds.length;
}
