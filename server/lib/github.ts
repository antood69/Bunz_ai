/**
 * GitHub Service Layer
 * Provides real repo operations (list repos, read/write files, create branches,
 * commit, create PRs) using the user's stored GitHub OAuth token.
 *
 * All methods accept a `token` parameter — the user's GitHub access_token
 * stored during OAuth login.
 */

const GITHUB_API = "https://api.github.com";

interface GitHubHeaders {
  Authorization: string;
  Accept: string;
  "Content-Type"?: string;
  "X-GitHub-Api-Version": string;
}

function headers(token: string): GitHubHeaders {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function ghFetch(token: string, path: string, opts: RequestInit = {}): Promise<any> {
  const url = path.startsWith("http") ? path : `${GITHUB_API}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: { ...headers(token), ...(opts.headers as Record<string, string> || {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${res.status}: ${body}`);
  }
  // Some endpoints return 204 No Content
  if (res.status === 204) return null;
  return res.json();
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface RepoInfo {
  full_name: string;   // "owner/repo"
  name: string;
  private: boolean;
  default_branch: string;
  description: string | null;
  html_url: string;
  language: string | null;
  updated_at: string;
}

export interface FileEntry {
  name: string;
  path: string;
  type: "file" | "dir" | "symlink" | "submodule";
  size: number;
  sha: string;
}

export interface FileContent {
  path: string;
  content: string;       // decoded from base64
  sha: string;           // needed for updates
  size: number;
  encoding: string;
}

export interface CommitResult {
  sha: string;
  html_url: string;
  message: string;
}

export interface PRResult {
  number: number;
  html_url: string;
  title: string;
  state: string;
}

export interface BranchInfo {
  name: string;
  sha: string;
}

export interface SearchResult {
  path: string;
  html_url: string;
  text_matches?: Array<{ fragment: string }>;
}

// ── User / Repos ────────────────────────────────────────────────────────────

/** Get the authenticated GitHub user */
export async function getGitHubUser(token: string) {
  return ghFetch(token, "/user");
}

/** List repos the user has access to (push access) */
export async function listRepos(token: string, page = 1, perPage = 30): Promise<RepoInfo[]> {
  const repos = await ghFetch(
    token,
    `/user/repos?sort=updated&per_page=${perPage}&page=${page}&affiliation=owner,collaborator,organization_member`
  );
  return repos.map((r: any) => ({
    full_name: r.full_name,
    name: r.name,
    private: r.private,
    default_branch: r.default_branch,
    description: r.description,
    html_url: r.html_url,
    language: r.language,
    updated_at: r.updated_at,
  }));
}

// ── File Operations ─────────────────────────────────────────────────────────

/** List files/dirs at a path in a repo */
export async function listFiles(
  token: string,
  repo: string,
  path = "",
  ref?: string
): Promise<FileEntry[]> {
  const q = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  const data = await ghFetch(token, `/repos/${repo}/contents/${path}${q}`);
  // Single file returns an object, directory returns array
  const items = Array.isArray(data) ? data : [data];
  return items.map((f: any) => ({
    name: f.name,
    path: f.path,
    type: f.type,
    size: f.size || 0,
    sha: f.sha,
  }));
}

/** Read a file's contents (decoded from base64) */
export async function readFile(
  token: string,
  repo: string,
  path: string,
  ref?: string
): Promise<FileContent> {
  const q = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  const data = await ghFetch(token, `/repos/${repo}/contents/${path}${q}`);
  if (data.type !== "file") {
    throw new Error(`${path} is a ${data.type}, not a file`);
  }
  // Decode base64 content
  const content = Buffer.from(data.content, "base64").toString("utf-8");
  return {
    path: data.path,
    content,
    sha: data.sha,
    size: data.size,
    encoding: data.encoding,
  };
}

/** Create or update a file in a repo */
export async function writeFile(
  token: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  branch?: string,
  sha?: string  // required for updates, omit for new files
): Promise<CommitResult> {
  const body: any = {
    message,
    content: Buffer.from(content).toString("base64"),
  };
  if (branch) body.branch = branch;
  if (sha) body.sha = sha;

  const data = await ghFetch(token, `/repos/${repo}/contents/${path}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  return {
    sha: data.commit.sha,
    html_url: data.commit.html_url,
    message: data.commit.message,
  };
}

/** Delete a file from a repo */
export async function deleteFile(
  token: string,
  repo: string,
  path: string,
  message: string,
  sha: string,
  branch?: string
): Promise<CommitResult> {
  const body: any = { message, sha };
  if (branch) body.branch = branch;

  const data = await ghFetch(token, `/repos/${repo}/contents/${path}`, {
    method: "DELETE",
    body: JSON.stringify(body),
  });
  return {
    sha: data.commit.sha,
    html_url: data.commit.html_url,
    message: data.commit.message,
  };
}

// ── Branches ────────────────────────────────────────────────────────────────

/** List branches */
export async function listBranches(token: string, repo: string): Promise<BranchInfo[]> {
  const data = await ghFetch(token, `/repos/${repo}/branches?per_page=100`);
  return data.map((b: any) => ({ name: b.name, sha: b.commit.sha }));
}

/** Create a branch from a ref (default: HEAD of default branch) */
export async function createBranch(
  token: string,
  repo: string,
  branchName: string,
  fromSha?: string
): Promise<BranchInfo> {
  // If no sha provided, get the default branch's HEAD
  if (!fromSha) {
    const repoData = await ghFetch(token, `/repos/${repo}`);
    const defaultBranch = repoData.default_branch;
    const ref = await ghFetch(token, `/repos/${repo}/git/ref/heads/${defaultBranch}`);
    fromSha = ref.object.sha;
  }

  const data = await ghFetch(token, `/repos/${repo}/git/refs`, {
    method: "POST",
    body: JSON.stringify({
      ref: `refs/heads/${branchName}`,
      sha: fromSha,
    }),
  });
  return { name: branchName, sha: data.object.sha };
}

// ── Multi-file Commits (Tree API) ───────────────────────────────────────────

interface FileChange {
  path: string;
  content: string;        // file content (UTF-8 string)
  mode?: "100644" | "100755";  // normal file or executable
}

/**
 * Commit multiple file changes atomically using the Git Tree API.
 * This is essential for the Coder agent — it can modify several files
 * in a single commit rather than one file at a time.
 */
export async function commitMultipleFiles(
  token: string,
  repo: string,
  branch: string,
  message: string,
  files: FileChange[]
): Promise<CommitResult> {
  // 1. Get the current commit SHA of the branch
  const refData = await ghFetch(token, `/repos/${repo}/git/ref/heads/${branch}`);
  const baseSha = refData.object.sha;

  // 2. Get the tree SHA of that commit
  const commitData = await ghFetch(token, `/repos/${repo}/git/commits/${baseSha}`);
  const baseTreeSha = commitData.tree.sha;

  // 3. Create blobs for each file
  const tree = await Promise.all(
    files.map(async (f) => {
      const blob = await ghFetch(token, `/repos/${repo}/git/blobs`, {
        method: "POST",
        body: JSON.stringify({
          content: f.content,
          encoding: "utf-8",
        }),
      });
      return {
        path: f.path,
        mode: f.mode || "100644",
        type: "blob" as const,
        sha: blob.sha,
      };
    })
  );

  // 4. Create a new tree
  const newTree = await ghFetch(token, `/repos/${repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree,
    }),
  });

  // 5. Create a new commit
  const newCommit = await ghFetch(token, `/repos/${repo}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message,
      tree: newTree.sha,
      parents: [baseSha],
    }),
  });

  // 6. Update the branch ref
  await ghFetch(token, `/repos/${repo}/git/refs/heads/${branch}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: newCommit.sha }),
  });

  return {
    sha: newCommit.sha,
    html_url: `https://github.com/${repo}/commit/${newCommit.sha}`,
    message,
  };
}

// ── Pull Requests ───────────────────────────────────────────────────────────

/** Create a pull request */
export async function createPullRequest(
  token: string,
  repo: string,
  title: string,
  head: string,   // branch with changes
  base: string,   // target branch (usually "main")
  body?: string
): Promise<PRResult> {
  const data = await ghFetch(token, `/repos/${repo}/pulls`, {
    method: "POST",
    body: JSON.stringify({ title, head, base, body: body || "" }),
  });
  return {
    number: data.number,
    html_url: data.html_url,
    title: data.title,
    state: data.state,
  };
}

/** List open PRs */
export async function listPullRequests(
  token: string,
  repo: string,
  state: "open" | "closed" | "all" = "open"
): Promise<PRResult[]> {
  const data = await ghFetch(token, `/repos/${repo}/pulls?state=${state}&per_page=20`);
  return data.map((pr: any) => ({
    number: pr.number,
    html_url: pr.html_url,
    title: pr.title,
    state: pr.state,
  }));
}

// ── Search ──────────────────────────────────────────────────────────────────

/** Search code within a repo */
export async function searchCode(
  token: string,
  repo: string,
  query: string
): Promise<SearchResult[]> {
  const q = encodeURIComponent(`${query} repo:${repo}`);
  const data = await ghFetch(token, `/search/code?q=${q}&per_page=20`, {
    headers: { Accept: "application/vnd.github.text-match+json" } as any,
  });
  return (data.items || []).map((item: any) => ({
    path: item.path,
    html_url: item.html_url,
    text_matches: item.text_matches?.map((m: any) => ({ fragment: m.fragment })),
  }));
}

// ── Repo Tree (full file listing) ───────────────────────────────────────────

/** Get the full file tree of a repo (recursive) */
export async function getRepoTree(
  token: string,
  repo: string,
  branch?: string
): Promise<Array<{ path: string; type: string; size: number }>> {
  // Get default branch if not specified
  if (!branch) {
    const repoData = await ghFetch(token, `/repos/${repo}`);
    branch = repoData.default_branch;
  }
  const data = await ghFetch(token, `/repos/${repo}/git/trees/${branch}?recursive=1`);
  return (data.tree || [])
    .filter((item: any) => item.type === "blob")
    .map((item: any) => ({
      path: item.path,
      type: item.type,
      size: item.size || 0,
    }));
}
