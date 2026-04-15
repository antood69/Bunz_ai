/**
 * Vault Brain — auto-linking, reflection, and knowledge graph for Obsidian second brain.
 *
 * Layer 1: Auto-linking — scans vault for related notes and adds [[wikilinks]]
 * Layer 2: Reflection — periodic bot that finds patterns and writes insight notes
 * Layer 3: Context memory — relationship-aware RAG
 */
import { storage } from "../storage";
import { connectorRegistry } from "./connectorRegistry";
import { modelRouter } from "../ai";

/**
 * Get the owner's Obsidian connector (DB or env var fallback)
 */
async function getObsConnector(): Promise<any | null> {
  try {
    const allUsers = await storage.getAllUsers();
    for (const u of allUsers) {
      const connectors = await storage.getConnectorsByUser(u.id);
      const obs = connectors.find((c: any) => c.provider === "obsidian" && c.status === "connected");
      if (obs) return obs;
    }
    if (process.env.OBSIDIAN_API_URL && process.env.OBSIDIAN_API_KEY) {
      return { id: "env", provider: "obsidian", status: "connected" };
    }
    return null;
  } catch { return null; }
}

/** Execute an Obsidian action — uses DB connector or env var fallback */
async function obsExec(connectorId: any, action: string, params: Record<string, any>) {
  if (connectorId === "env") return connectorRegistry.executeObsidianDirect(action, params);
  return connectorRegistry.execute(connectorId, action, params);
}

/**
 * Layer 1: Auto-link a new note to existing notes in the vault.
 * Scans for related topics and appends [[wikilinks]] section.
 */
export async function autoLinkNote(notePath: string, noteContent: string): Promise<string[]> {
  const obs = await getObsConnector();
  if (!obs) return [];

  try {
    // Extract key topics from the note using AI
    const topicResult = await modelRouter.chat({
      model: "gpt-5.4-mini",
      messages: [{ role: "user", content: `Extract 5-10 key topics/concepts from this note as a comma-separated list. Only output the list, nothing else.\n\n${noteContent.slice(0, 2000)}` }],
      systemPrompt: "You extract key topics from text. Output only a comma-separated list.",
    });

    const topics = topicResult.content.split(",").map(t => t.trim()).filter(Boolean);
    if (topics.length === 0) return [];

    // Search vault for related notes
    const relatedPaths: string[] = [];
    for (const topic of topics.slice(0, 5)) {
      const searchResult = await obsExec(obs.id, "search_notes", { query: topic });
      if (searchResult.ok && Array.isArray(searchResult.data)) {
        for (const r of searchResult.data) {
          if (r.path !== notePath && !relatedPaths.includes(r.path)) {
            relatedPaths.push(r.path);
          }
        }
      }
      if (relatedPaths.length >= 8) break;
    }

    if (relatedPaths.length === 0) return [];

    // Add wikilinks section to the note
    const links = relatedPaths.slice(0, 8).map(p => {
      const name = p.replace(/\.md$/, "").split("/").pop() || p;
      return `- [[${name}]]`;
    });

    const linkSection = `\n\n---\n## Related Notes\n${links.join("\n")}\n`;
    const updatedContent = noteContent + linkSection;

    await obsExec(obs.id, "write_note", { path: notePath, content: updatedContent });
    console.log(`[VaultBrain] Auto-linked ${notePath} to ${relatedPaths.length} notes`);

    return relatedPaths;
  } catch (e: any) {
    console.error(`[VaultBrain] Auto-link failed:`, e.message);
    return [];
  }
}

/**
 * Layer 2: Reflection — analyze recent vault activity and generate insights.
 * Called periodically by the reflection bot.
 */
export async function runReflection(): Promise<string | null> {
  const obs = await getObsConnector();
  if (!obs) return null;

  try {
    // List recent notes from key folders
    const folders = ["Boss", "Research", "Coder", "Writer", "Synthesis", "Inputs"];
    const recentNotes: Array<{ path: string; content: string }> = [];

    for (const folder of folders) {
      const listResult = await obsExec(obs.id, "list_notes", { folder });
      if (!listResult.ok || !Array.isArray(listResult.data?.files)) continue;

      // Get the 3 most recent files per folder
      const files = (listResult.data.files || [])
        .filter((f: string) => f.endsWith(".md"))
        .slice(-3);

      for (const file of files) {
        const readResult = await obsExec(obs.id, "read_note", { path: `${folder}/${file}` });
        if (readResult.ok && readResult.data?.content) {
          recentNotes.push({ path: `${folder}/${file}`, content: readResult.data.content.slice(0, 1000) });
        }
      }
    }

    if (recentNotes.length < 3) return null; // Not enough data to reflect on

    // Generate reflection using AI
    const noteSummaries = recentNotes.map(n => `--- ${n.path} ---\n${n.content}`).join("\n\n");

    const reflection = await modelRouter.chat({
      model: "gpt-5.4",
      messages: [{ role: "user", content: `Analyze these recent vault notes and generate insights:\n\n${noteSummaries}` }],
      systemPrompt: `You are a knowledge analyst reviewing a personal knowledge vault. Your job is to:

1. **Find patterns** — what themes keep appearing across notes?
2. **Spot connections** — which notes relate to each other in non-obvious ways?
3. **Generate insights** — what conclusions can you draw that the user hasn't explicitly stated?
4. **Suggest actions** — based on patterns, what should the user explore or do next?
5. **Flag contradictions** — do any notes contradict each other?

Write a structured insight report in markdown. Use [[wikilinks]] to reference related notes by their filename (without .md extension).
Be specific, not generic. Reference actual content from the notes.`,
    });

    // Save reflection to vault
    const timestamp = new Date().toISOString().slice(0, 10);
    const time = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    const reflectionPath = `Reflections/${timestamp}-${time.replace(/[: ]/g, "")}.md`;
    const header = `# Vault Reflection\n*${new Date().toLocaleString()} | Analyzed ${recentNotes.length} recent notes*\n\n---\n\n`;

    await obsExec(obs.id, "write_note", {
      path: reflectionPath,
      content: header + reflection.content,
    });

    console.log(`[VaultBrain] Reflection saved: ${reflectionPath}`);
    return reflectionPath;
  } catch (e: any) {
    console.error(`[VaultBrain] Reflection failed:`, e.message);
    return null;
  }
}

/**
 * Layer 3: Context-aware search — finds not just matching notes but related ones.
 * Returns notes with relationship context for richer RAG.
 */
export async function contextSearch(query: string, maxResults = 5): Promise<Array<{ path: string; content: string; relevance: string }>> {
  const obs = await getObsConnector();
  if (!obs) return [];

  try {
    // Direct search
    const directResult = await obsExec(obs.id, "search_notes", { query });
    const directMatches: Array<{ path: string; content: string }> = [];

    if (directResult.ok && Array.isArray(directResult.data)) {
      for (const r of directResult.data.slice(0, maxResults)) {
        const readResult = await obsExec(obs.id, "read_note", { path: r.path });
        if (readResult.ok) {
          directMatches.push({ path: r.path, content: readResult.data.content?.slice(0, 1500) || "" });
        }
      }
    }

    if (directMatches.length === 0) return [];

    // Find notes linked FROM the direct matches (follow wikilinks)
    const linkedPaths = new Set<string>();
    for (const match of directMatches) {
      const wikilinks = match.content.match(/\[\[([^\]]+)\]\]/g) || [];
      for (const link of wikilinks) {
        const name = link.replace(/\[\[|\]\]/g, "");
        // Search for the linked note
        const linkSearch = await obsExec(obs.id, "search_notes", { query: name });
        if (linkSearch.ok && Array.isArray(linkSearch.data) && linkSearch.data.length > 0) {
          linkedPaths.add(linkSearch.data[0].path);
        }
      }
    }

    // Read linked notes
    const linkedMatches: Array<{ path: string; content: string }> = [];
    for (const path of Array.from(linkedPaths)) {
      if (directMatches.some(m => m.path === path)) continue;
      const readResult = await obsExec(obs.id, "read_note", { path });
      if (readResult.ok) {
        linkedMatches.push({ path, content: readResult.data.content?.slice(0, 1000) || "" });
      }
      if (linkedMatches.length >= 3) break;
    }

    // Combine with relevance labels
    return [
      ...directMatches.map(m => ({ ...m, relevance: "direct match" })),
      ...linkedMatches.map(m => ({ ...m, relevance: "linked reference" })),
    ];
  } catch (e: any) {
    console.error(`[VaultBrain] Context search failed:`, e.message);
    return [];
  }
}
