import "server-only";
import { api } from "@/lib/botteam";
import type { Scope } from "@/lib/local-user";
import type { PostView } from "@/lib/posts/shared";
import type { ContentDraftView } from "@/lib/orchestration/types";

// Reading posts for one campaign from the BotTeam server (server/botteam/social.py).

type ServerPost = PostView & { campaignId: number };

export async function listPosts(scope: Scope): Promise<PostView[]> {
  return (await api<{ posts: ServerPost[] }>(`/api/social/posts?campaignId=${scope.campaignId}`)).posts;
}

// Posts with a time on the calendar (scheduled for, or published at), oldest first
export async function listCalendarPosts(scope: Scope) {
  return (await listPosts(scope))
    .filter((post) => post.scheduledAt || post.publishedAt)
    .sort((a, b) => (a.scheduledAt ?? a.publishedAt ?? "").localeCompare(b.scheduledAt ?? b.publishedAt ?? ""));
}

// Drafts the AI team saved: the team's bots work in chat and in their working folders, so none are listed
export async function listUnscheduledDrafts(_scope: Scope): Promise<ContentDraftView[]> {
  return [];
}

export async function getDraft(_scope: Scope, _draftId: number): Promise<ContentDraftView | null> {
  return null;
}

export async function getPost(scope: Scope, postId: number) {
  try {
    const post = await api<ServerPost>(`/api/social/posts/${postId}`);
    return post.campaignId === scope.campaignId ? post : null;
  } catch {
    return null;
  }
}

// Scheduled posts still to go out, soonest first
export async function listUpcomingPosts(campaignId: number, limit: number) {
  const now = Date.now();
  return (await listPosts({ userId: "local", campaignId }))
    .filter((post) => post.status === "scheduled" && post.scheduledAt && Date.parse(post.scheduledAt) > now)
    .sort((a, b) => a.scheduledAt!.localeCompare(b.scheduledAt!))
    .slice(0, limit);
}

export async function countPostsByStatus(campaignId: number) {
  const counts: Partial<Record<PostView["status"], number>> = {};
  for (const post of await listPosts({ userId: "local", campaignId })) counts[post.status] = (counts[post.status] ?? 0) + 1;
  return counts;
}
