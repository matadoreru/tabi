const commitPattern = /^[0-9a-f]{7,64}$/i;

function normalizedCommit(value) {
  const commit = String(value || "").trim();
  return commitPattern.test(commit) ? commit.toLowerCase() : "";
}

function configuredCommit() {
  try {
    return normalizedCommit(Deno.env.get("TABI_COMMIT_SHA"));
  } catch {
    return "";
  }
}

function repositoryCommit() {
  try {
    const gitDirectory = new URL("../.git/", import.meta.url);
    const head = Deno.readTextFileSync(new URL("HEAD", gitDirectory)).trim();
    const detachedCommit = normalizedCommit(head);
    if (detachedCommit) return detachedCommit;
    if (!head.startsWith("ref: ")) return "";

    const ref = head.slice(5).trim();
    try {
      return normalizedCommit(Deno.readTextFileSync(new URL(ref, gitDirectory)));
    } catch {
      const packedRefs = Deno.readTextFileSync(new URL("packed-refs", gitDirectory));
      const match = packedRefs.split("\n").find((line) => line.endsWith(` ${ref}`));
      return normalizedCommit(match?.split(" ")[0]);
    }
  } catch {
    return "";
  }
}

export const APPLICATION_COMMIT = configuredCommit() || repositoryCommit();
