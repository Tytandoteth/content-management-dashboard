import { prisma } from "@cmd/db";
import { Pane } from "@/components/ui";
import { RecipeList } from "@/components/RecipeList";
import { RecipeBuilder } from "@/components/RecipeBuilder";

export const dynamic = "force-dynamic";

export default async function RecipesPage() {
  let recipes: { slug: string; name: string; description: string | null }[] = [];
  try {
    recipes = await prisma.recipe.findMany({ orderBy: { name: "asc" } });
  } catch { /* db down */ }
  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <RecipeBuilder />
      <Pane label="03" title="Recipes" pad={false}>
        <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--line)", background: "var(--ink-850)", fontSize: "var(--t-sm)", color: "var(--fg-dim)" }}>
          One-click saved workflows. Running a recipe generates a scheduled batch of drafts, held for approval.
        </div>
        <RecipeList recipes={recipes.map((r) => ({ slug: r.slug, name: r.name, description: r.description }))} />
      </Pane>
    </div>
  );
}
