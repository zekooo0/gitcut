// One slug rule for every step: <repo>-<branch>, minus feat/fix prefixes.
// The repo name keeps two repos with the same branch name from sharing one video/<slug> branch.
// usage: node scripts/slug.ts <owner/repo> <branch>
export const slugFor = (repo: string, branch: string) => {
  const r = repo.split("/").pop()!.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const b = branch
    .replace(/^(feat|feature|fix|chore)[/-]/i, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${r}-${b}`.slice(0, 60).replace(/-+$/, "");
};

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!process.argv[3]) {
    console.error("usage: node scripts/slug.ts <owner/repo> <branch>");
    process.exit(2);
  }
  console.log(slugFor(process.argv[2], process.argv[3]));
}
