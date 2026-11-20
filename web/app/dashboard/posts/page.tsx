import { getT } from "@/lib/i18n/server";
import { NoCampaign } from "@/components/dashboard/no-campaign";
import { listPosts, listUnscheduledDrafts } from "@/lib/posts/store";
import { getRequestScope } from "@/lib/request-scope";
import { PostsBoard } from "@/components/posts/posts-board";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("Posts") };
}

// Shell (sidebar, header, auth + campaign guards) lives in ../layout.tsx
export default async function PostsPage() {
  const scope = await getRequestScope();
  if (!scope) return <NoCampaign />;

  const [posts, drafts] = await Promise.all([listPosts(scope), listUnscheduledDrafts(scope)]);
  return <PostsBoard posts={posts} drafts={drafts} />;
}
