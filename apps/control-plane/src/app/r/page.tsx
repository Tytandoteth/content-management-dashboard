import { loadArticles } from "@/lib/article";
import { ArticleIndex } from "@/components/ArticleIndex";

export const dynamic = "force-dynamic";

export default async function ArticlesHome() {
  const rows = await loadArticles({ publishedOnly: true });
  return <ArticleIndex articles={rows.map((r) => ({ slug: r.slug, title: r.title, tools: r.tools }))} />;
}
