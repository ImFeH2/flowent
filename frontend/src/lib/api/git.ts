export async function listBranches(repo: string): Promise<string[]> {
  const res = await fetch(`/api/git/branches?repo=${encodeURIComponent(repo)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.branches ?? [];
}

export interface GitCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
}

export async function listCommits(
  repo: string,
  branch = "main",
): Promise<GitCommit[]> {
  const res = await fetch(
    `/api/git/commits?repo=${encodeURIComponent(repo)}&branch=${encodeURIComponent(branch)}`,
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.commits ?? [];
}
