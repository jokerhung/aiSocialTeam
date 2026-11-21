import "server-only";
import { api, ApiError } from "@/lib/botteam";
import { getT } from "@/lib/i18n/server";
import type { Scope } from "@/lib/local-user";
import { checkPost, zonedTimeToUtc, type PostInput, type PostView } from "@/lib/posts/shared";

// Saving, unscheduling and moving posts. The checks (platform rules, a time in the future) run here; the
// server keeps the post. Nothing publishes to a real network: see server/botteam/social.py.

type Result = { post?: PostView; error?: string };
type ServerPost = PostView & { campaignId: number };

const fail = async (error: unknown): Promise<Result> => ({ error: error instanceof ApiError ? error.message : (await getT()).t("That didn't work. Please try again.") });

function payload(post: ServerPost, change: Partial<{ status: "draft" | "scheduled"; scheduledAt: string | null }>) {
  return { ...post, status: change.status ?? (post.status === "scheduled" ? "scheduled" : "draft"), scheduledAt: change.scheduledAt === undefined ? post.scheduledAt : change.scheduledAt };
}

export async function savePostForScope(scope: Scope, input: PostInput, intent: "schedule" | "draft"): Promise<Result> {
  const { t } = await getT();
  const { errors } = checkPost(input, t);
  const scheduledAt = input.date && input.time ? zonedTimeToUtc(input.date, input.time, input.timeZone).toISOString() : null;
  if (intent === "schedule") {
    if (errors.length) return { error: errors[0] };
    if (!scheduledAt) return { error: t("Pick a date and time to schedule the post.") };
    if (Date.parse(scheduledAt) <= Date.now()) return { error: t("Pick a time in the future.") };
  }
  const body = {
    campaignId: scope.campaignId,
    title: input.title,
    caption: input.caption,
    hashtags: input.hashtags,
    platforms: input.platforms,
    media: input.media,
    draftId: input.draftId,
    source: input.draftId ? "ai" : "manual",
    status: intent === "schedule" ? "scheduled" : "draft",
    scheduledAt,
    timeZone: input.timeZone,
    accountIds: input.accountIds,
  };
  try {
    const post = input.postId
      ? await api<PostView>(`/api/social/posts/${input.postId}`, { method: "PUT", json: body })
      : await api<PostView>("/api/social/posts", { method: "POST", json: body });
    return { post };
  } catch (error) {
    return await fail(error);
  }
}

// Takes a scheduled post off the schedule; it stays on the Posts page as a draft
export async function unschedulePostForScope(_scope: Scope, postId: number): Promise<Result> {
  try {
    const post = await api<ServerPost>(`/api/social/posts/${postId}`);
    const updated = await api<PostView>(`/api/social/posts/${postId}`, { method: "PUT", json: payload(post, { status: "draft" }) });
    return { post: updated };
  } catch (error) {
    return await fail(error);
  }
}

// Moves a post to another moment; a scheduled post pushed into the past goes back to drafts
export async function reschedulePostForScope(_scope: Scope, postId: number, at: Date): Promise<Result> {
  try {
    const post = await api<ServerPost>(`/api/social/posts/${postId}`);
    const stillFuture = at.getTime() > Date.now();
    const updated = await api<PostView>(`/api/social/posts/${postId}`, {
      method: "PUT",
      json: payload(post, { status: post.status === "scheduled" && stillFuture ? "scheduled" : "draft", scheduledAt: at.toISOString() }),
    });
    return { post: updated };
  } catch (error) {
    return await fail(error);
  }
}
