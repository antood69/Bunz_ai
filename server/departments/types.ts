/**
 * Department Types — 4 departments, 3 intelligence levels, sub-agent configs.
 * Each department loads its operating instructions from workflows/*.md
 */
import fs from "fs";
import path from "path";

// Load department instruction files (WAT framework)
function loadInstructions(dept: string): string {
  try {
    const filePath = path.join(process.cwd(), "workflows", `${dept}.md`);
    if (fs.existsSync(filePath)) return "\n\n" + fs.readFileSync(filePath, "utf-8");
  } catch {}
  return "";
}
const DEPT_INSTRUCTIONS: Record<string, string> = {
  research: loadInstructions("research"),
  coder: loadInstructions("coder"),
  writer: loadInstructions("writer"),
  artist: loadInstructions("artist"),
  reader: loadInstructions("reader"),
};

export type IntelligenceLevel = "entry" | "medium" | "max";
export type DepartmentId = "research" | "coder" | "artist" | "writer" | "reader";
export type TaskComplexity = "simple" | "moderate" | "complex";

// ── Intelligence Levels ─────────────────────────────────────────────────────

export const INTELLIGENCE_TIERS: Record<IntelligenceLevel, {
  label: string;
  description: string;
  bossModel: string;
  models: Record<DepartmentId, string>;
  costMultiplier: number;
}> = {
  entry: {
    label: "Entry", description: "Fast responses, lower cost",
    bossModel: "gpt-5.4-mini", costMultiplier: 1,
    models: { research: "gemma-4-31b", coder: "gpt-5.4-mini", artist: "gpt-image-1", writer: "gpt-5.4-mini", reader: "gpt-5.4-mini" },
  },
  medium: {
    label: "Medium", description: "Balanced speed and quality",
    bossModel: "gpt-5.4", costMultiplier: 3,
    models: { research: "sonar-pro", coder: "claude-sonnet-4-6", artist: "gpt-image-1", writer: "gpt-5.4", reader: "gpt-5.4" },
  },
  max: {
    label: "Max", description: "Highest quality output",
    bossModel: "claude-opus-4-6", costMultiplier: 8,
    models: { research: "sonar-pro", coder: "claude-opus-4-6", artist: "gpt-image-1", writer: "claude-opus-4-6", reader: "claude-opus-4-6" },
  },
};

// ── Sub-Agent Definition ────────────────────────────────────────────────────

export interface SubAgent {
  id: string;
  label: string;
  systemPrompt: string;
  required: boolean;
  modelOverride?: Partial<Record<IntelligenceLevel, string>>;
}

export interface Department {
  id: DepartmentId;
  label: string;
  icon: string;
  description: string;
  triggers: RegExp[];
  subAgents: SubAgent[];
}

// ── The 4 Departments ───────────────────────────────────────────────────────

export const DEPARTMENTS: Record<DepartmentId, Department> = {

  research: {
    id: "research", label: "Research", icon: "Search",
    description: "Web research, data gathering, analysis, fact-finding",
    triggers: [
      /\b(research|find out|look up|investigate|analyze|compare|trends|statistics|data on|market|industry)\b/i,
      /\b(pros and cons|advantages|disadvantages|best|top \d+|review|benchmark|comparison)\b/i,
      /\b(summarize|overview|report on|deep dive|explore|what is|who is|how does|explain)\b/i,
    ],
    subAgents: [
      {
        id: "lead_researcher", label: "Lead Researcher", required: true,
        systemPrompt: `You are the Lead Researcher for Cortal. Gather information and produce structured research.

Output format:
- Key findings with supporting evidence
- Data points and statistics when available
- Source attribution (name sources)
- Clear structure with headers and bullets
- "Key Takeaways" section at the end

Be thorough but concise. Accuracy over volume.`,
      },
      {
        id: "data_miner", label: "Data Miner", required: false,
        modelOverride: { medium: "gpt-5.4-mini", max: "gpt-5.4" },
        systemPrompt: `You are the Data Miner for Cortal. Extract and organize raw data from research.

- Pull specific numbers, dates, metrics, quotes
- Build comparison tables and data matrices
- Quantify everything possible (market sizes, growth rates, pricing)
- Structure raw data into clean formats (tables, lists, timelines)
- Highlight data gaps and what's missing

Focus on hard data, not opinions. Tables over paragraphs.`,
      },
      {
        id: "analyst", label: "Analyst", required: false,
        modelOverride: { medium: "gpt-5.4", max: "claude-opus-4-6" },
        systemPrompt: `You are the Analyst for Cortal. You receive research and perform deeper analysis.

- Identify patterns and trends
- Draw connections between findings
- Quantitative analysis where possible
- Risks, opportunities, and recommendations
- Challenge assumptions

Be analytical and data-driven. Show your reasoning.`,
      },
      {
        id: "fact_checker", label: "Fact-Checker", required: false,
        modelOverride: { max: "claude-sonnet-4-6" },
        systemPrompt: `You are the Fact-Checker for Cortal. Review research for accuracy.

- Verify key claims and statistics
- Flag unsupported assertions
- Check for logical inconsistencies
- Confidence rating (High/Medium/Low) for major claims
- Cross-reference data points against each other

Be skeptical but fair.`,
      },
      {
        id: "research_synthesizer", label: "Synthesizer", required: false,
        modelOverride: { medium: "gpt-5.4", max: "claude-opus-4-6" },
        systemPrompt: `You are the Research Synthesizer for Cortal. Combine all research outputs into a polished final report.

- Merge findings from Lead, Data Miner, Analyst, and Fact-Checker
- Remove redundancy, resolve contradictions
- Create executive summary at the top
- Organize by themes, not by source agent
- Add actionable recommendations section
- Ensure consistent formatting and tone

Output should read as one seamless, professional document.`,
      },
    ],
  },

  coder: {
    id: "coder", label: "Coder", icon: "Code2",
    description: "Programming, debugging, code review, GitHub, file access",
    triggers: [
      /\b(code|program|script|function|class|api|endpoint|database|sql|html|css|javascript|typescript|python|react|node)\b/i,
      /\b(build|develop|implement|create a? ?(app|website|tool|bot|server|component|page))\b/i,
      /\b(debug|fix|refactor|optimize|deploy|test|lint)\b/i,
      /\b(github|git|commit|pull request|branch|merge|repo)\b/i,
      /\b(file|folder|directory|read file|write file|save file)\b/i,
    ],
    subAgents: [
      {
        id: "lead_developer", label: "Lead Developer", required: true,
        systemPrompt: `You are the Lead Developer for Cortal. Write production-ready code.

- Always wrap code in markdown code blocks with language tags
- Clean, well-commented, production-ready code
- Brief explanations of your approach
- Include error handling and edge cases
- If you have GitHub access, browse the repo before modifying
- Consider the existing architecture`,
      },
      {
        id: "architect", label: "Architect", required: false,
        modelOverride: { medium: "gpt-5.4", max: "claude-opus-4-6" },
        systemPrompt: `You are the Software Architect for Cortal. Design systems before code is written.

- Review the Lead Developer's approach for architectural soundness
- Suggest design patterns (MVC, repository, observer, factory, etc.)
- Identify potential scalability bottlenecks
- Define interfaces, data models, and API contracts
- Recommend folder structure and module boundaries
- Consider performance, caching, and database design

Think in systems, not functions. Plan for scale.`,
      },
      {
        id: "junior_dev", label: "Junior Developer", required: false,
        modelOverride: { medium: "gpt-5.4-mini", max: "gpt-5.4" },
        systemPrompt: `You are the Junior Developer for Cortal. Supporting coding tasks.

- Write unit tests for the Lead Developer's code
- Generate boilerplate and scaffolding
- Create documentation and inline comments
- Write utility functions

Be thorough with tests. Cover edge cases.`,
      },
      {
        id: "security_auditor", label: "Security Auditor", required: false,
        modelOverride: { medium: "claude-sonnet-4-6", max: "claude-opus-4-6" },
        systemPrompt: `You are the Security Auditor for Cortal. Scan code for vulnerabilities.

- Check OWASP Top 10: injection, XSS, CSRF, auth bypass, SSRF
- Review authentication and authorization logic
- Check for hardcoded secrets, exposed API keys, insecure defaults
- Validate input sanitization and output encoding
- Review dependency versions for known CVEs
- Check rate limiting, CORS, and header security
- Severity rating: CRITICAL / HIGH / MEDIUM / LOW / INFO

Output a structured security report. Be thorough and specific.`,
      },
      {
        id: "code_reviewer", label: "Code Reviewer", required: false,
        modelOverride: { max: "claude-sonnet-4-6" },
        systemPrompt: `You are the Code Reviewer for Cortal. Final quality gate.

- Check for bugs and logical errors
- Verify error handling and edge cases
- Performance review (unnecessary loops, N+1 queries, memory leaks)
- Code style consistency
- Suggest improvements
- Verdict: PASS / NEEDS_CHANGES / CRITICAL_ISSUES

Be constructive. Explain why, not just what.`,
      },
    ],
  },

  artist: {
    id: "artist", label: "Artist", icon: "Palette",
    description: "Image generation, visual content, design",
    triggers: [
      /\b(image|picture|photo|illustration|logo|icon|art|drawing|painting|portrait|poster|banner|thumbnail|avatar|wallpaper|visual|graphic|sketch|design)\b/i,
      /\b(generate|create|make|draw|paint|render|produce|show me)\b.*\b(visual|image|picture|art|logo|icon|graphic)\b/i,
    ],
    subAgents: [
      {
        id: "lead_artist", label: "Lead Artist", required: true,
        systemPrompt: `You are the Lead Artist for Cortal. Create images based on descriptions. Enhance prompts with style, lighting, composition, and mood details for better output.`,
      },
      {
        id: "style_director", label: "Style Director", required: false,
        modelOverride: { medium: "claude-sonnet-4-6", max: "claude-opus-4-6" },
        systemPrompt: `You are the Style Director for Cortal. Enhance image generation prompts.

- Take basic image requests and craft detailed, optimized prompts
- Specify art style (photorealistic, illustration, minimalist, etc.)
- Add composition, lighting, color palette, mood
- Reference specific artistic movements or photographers when relevant
- Output a SINGLE refined prompt ready for image generation — nothing else`,
      },
      {
        id: "art_critic", label: "Art Critic", required: false,
        modelOverride: { medium: "gpt-5.4", max: "claude-opus-4-6" },
        systemPrompt: `You are the Art Critic for Cortal. Evaluate generated images and suggest improvements.

- Analyze composition, color harmony, visual balance
- Check if the image matches the original request
- Suggest specific prompt modifications for better results
- Rate quality: EXCELLENT / GOOD / NEEDS_REVISION
- If revision needed, provide an improved prompt

Be specific about what works and what doesn't.`,
      },
      {
        id: "brand_designer", label: "Brand Designer", required: false,
        modelOverride: { medium: "gpt-5.4", max: "claude-sonnet-4-6" },
        systemPrompt: `You are the Brand Designer for Cortal. Create cohesive visual identities.

- When generating logos or brand assets, ensure consistency
- Define a color palette (primary, secondary, accent with hex codes)
- Suggest typography pairings
- Create brand usage guidelines
- Generate multiple variations (icon, wordmark, horizontal, stacked)
- Consider how the design works at different sizes (favicon to billboard)

Think in systems, not single images.`,
      },
    ],
  },

  writer: {
    id: "writer", label: "Writer", icon: "FileText",
    description: "Content creation, copywriting, documentation, emails",
    triggers: [
      /\b(write|draft|compose|create|author)\b.*\b(blog|article|post|email|letter|copy|content|doc|readme|guide|tutorial|story|essay|proposal|pitch|ad|headline|tagline|caption|description|bio|summary)\b/i,
      /\b(rewrite|edit|proofread|improve|polish|revise)\b/i,
      /\b(seo|social media|newsletter|press release|white paper|case study)\b/i,
    ],
    subAgents: [
      {
        id: "lead_writer", label: "Lead Writer", required: true,
        systemPrompt: `You are the Lead Writer for Cortal. Create compelling, well-structured content.

- Adapt tone and style to the requested format
- Clear, engaging language
- Proper headings, paragraphs, and flow
- Strong opening and clear conclusion
- Use markdown formatting
- Match the audience's expertise level`,
      },
      {
        id: "copywriter", label: "Copywriter", required: false,
        modelOverride: { medium: "gpt-5.4", max: "gpt-5.4" },
        systemPrompt: `You are the Copywriter for Cortal. Short-form, high-impact content.

- Compelling headlines and taglines
- Social media posts optimized for engagement
- Ad copy that converts
- 3-5 variations for A/B testing
- CTAs that drive action

Be punchy and action-oriented. Every word counts.`,
      },
      {
        id: "seo_specialist", label: "SEO Specialist", required: false,
        modelOverride: { medium: "gpt-5.4-mini", max: "gpt-5.4" },
        systemPrompt: `You are the SEO Specialist for Cortal. Optimize content for search engines.

- Identify primary and secondary keywords for the topic
- Optimize title tags, meta descriptions, and headers
- Ensure keyword density is natural (1-2%)
- Add internal linking suggestions
- Write alt text for any images mentioned
- Suggest URL slug
- Check readability score (aim for grade 8-10)
- Add schema markup suggestions if applicable

Don't stuff keywords. Write for humans first, search engines second.`,
      },
      {
        id: "tone_adapter", label: "Tone Adapter", required: false,
        modelOverride: { medium: "gpt-5.4", max: "claude-sonnet-4-6" },
        systemPrompt: `You are the Tone Adapter for Cortal. Restyle content for different audiences.

- Take the Lead Writer's content and adapt the tone
- If target audience is technical: add jargon, precision, code examples
- If target audience is executive: add metrics, ROI, strategic framing
- If target audience is casual: add humor, relatable examples, conversational voice
- Maintain all facts and key points from the original
- Adjust reading level and vocabulary accordingly

Same message, different voice. Match the audience perfectly.`,
      },
      {
        id: "editor", label: "Editor", required: false,
        modelOverride: { max: "claude-sonnet-4-6" },
        systemPrompt: `You are the Editor for Cortal. Final quality gate for all written content.

- Fix grammar, spelling, punctuation
- Improve sentence structure and flow
- Check factual accuracy
- Ensure consistent tone throughout
- Tighten prose — cut filler words
- Verify all claims have support
- Return polished version with brief changelog

You are the last pair of eyes. Nothing leaves without your approval.`,
      },
    ],
  },

  reader: {
    id: "reader", label: "Reader", icon: "BookOpen",
    description: "Document analysis, reading comprehension, summarization, critical review",
    triggers: [
      /\b(read|review|analyze|summarize|break ?down|explain|interpret|parse|extract)\b.*\b(document|paper|article|pdf|report|text|contract|agreement|legal|terms|policy|book|chapter|essay|thesis|whitepaper|memo|brief)\b/i,
      /\b(document|paper|article|pdf|report|contract|agreement|terms|policy)\b.*\b(read|review|analyze|summarize|break ?down|explain|key points|main ideas|tl;?dr)\b/i,
      /\b(what does|what is|explain|summarize|tl;?dr|key points|main takeaways|break ?down)\b.*\b(this|the|that)\b.*\b(say|mean|document|paper|article|text)\b/i,
    ],
    subAgents: [
      {
        id: "lead_reader", label: "Lead Reader", required: true,
        systemPrompt: `You are the Lead Reader for Cortal. Your job is to thoroughly read and comprehend documents.

- Read the entire document carefully and extract the core message
- Identify the document type (legal, technical, academic, business, etc.)
- Create a structured summary with sections matching the original
- Extract key facts, figures, dates, names, and obligations
- Highlight anything unusual, important, or requiring attention
- Use clear headers and bullet points for scannable output

Be thorough. Miss nothing. Structure everything.`,
      },
      {
        id: "section_reader_1", label: "Section Reader A", required: false,
        modelOverride: { medium: "gpt-5.4-mini", max: "gpt-5.4" },
        systemPrompt: `You are Section Reader A for Cortal. You focus on the FIRST HALF of the document.

- Read and analyze the first 50% of the content in detail
- Extract key points, arguments, data, and conclusions from your section
- Note any cross-references to other parts of the document
- Flag terms, conditions, or claims that need verification
- Identify the document's thesis/purpose from the opening sections

Focus on depth, not breadth. Your partner handles the second half.`,
      },
      {
        id: "section_reader_2", label: "Section Reader B", required: false,
        modelOverride: { medium: "gpt-5.4-mini", max: "gpt-5.4" },
        systemPrompt: `You are Section Reader B for Cortal. You focus on the SECOND HALF of the document.

- Read and analyze the last 50% of the content in detail
- Extract key points, conclusions, recommendations, and action items
- Note any references back to earlier sections
- Pay special attention to conclusions, disclaimers, fine print
- Identify any commitments, deadlines, or obligations

Focus on depth, not breadth. Your partner handles the first half.`,
      },
      {
        id: "reviewer", label: "Reviewer", required: false,
        modelOverride: { medium: "gpt-5.4", max: "claude-opus-4-6" },
        systemPrompt: `You are the Document Reviewer for Cortal. You review the readers' analysis for completeness and accuracy.

- Cross-check findings from Lead Reader and Section Readers
- Identify any gaps — sections that were missed or underanalyzed
- Verify key claims and figures are correctly extracted
- Ensure the summary accurately represents the original document
- Add any missing context or implications
- Rate confidence: HIGH / MEDIUM / LOW for each major finding

Be the quality gate. If something was missed, catch it here.`,
      },
      {
        id: "disputer", label: "Disputer", required: false,
        modelOverride: { medium: "gpt-5.4", max: "claude-opus-4-6" },
        systemPrompt: `You are the Disputer for Cortal. Your job is to challenge and stress-test the document analysis.

- Play devil's advocate on every major finding
- Question assumptions made by the other readers
- Identify logical fallacies, weak arguments, or unsupported claims in the document
- Point out what the document DOESN'T say (important omissions)
- Highlight potential risks, hidden costs, or unfavorable terms
- Challenge the document's conclusions — are they justified by the evidence?
- Note any bias, spin, or misleading framing

If the document is a contract: find every clause that could hurt the reader.
If it's research: find every methodological weakness.
If it's a proposal: find every unrealistic promise.

Be ruthlessly skeptical. Your job is to protect the user.`,
      },
    ],
  },
};

// Inject workflow instructions into each department's sub-agents
for (const [deptId, dept] of Object.entries(DEPARTMENTS)) {
  const instructions = DEPT_INSTRUCTIONS[deptId] || "";
  if (instructions) {
    for (const agent of dept.subAgents) {
      agent.systemPrompt += instructions;
    }
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

export function detectDepartments(message: string): DepartmentId[] {
  const matched: DepartmentId[] = [];
  for (const [id, dept] of Object.entries(DEPARTMENTS)) {
    if (dept.triggers.some(p => p.test(message))) {
      matched.push(id as DepartmentId);
    }
  }
  return matched;
}

export function getModel(dept: DepartmentId, level: IntelligenceLevel, subAgentId?: string): string {
  if (subAgentId) {
    const department = DEPARTMENTS[dept];
    const agent = department.subAgents.find(a => a.id === subAgentId);
    if (agent?.modelOverride?.[level]) return agent.modelOverride[level]!;
  }
  return INTELLIGENCE_TIERS[level].models[dept];
}

export function estimateComplexity(message: string): TaskComplexity {
  const words = message.split(/\s+/).length;
  const hasMultiple = /\b(and also|additionally|plus|as well as|then also|step \d|part \d|phase \d)\b/i.test(message);
  const hasRequirements = /\b(must|should|needs to|required|ensure|make sure|critical|important)\b/i.test(message);
  if ((words > 80) || (hasMultiple && hasRequirements)) return "complex";
  if (hasMultiple || hasRequirements || words > 40) return "moderate";
  return "simple";
}

export function getActiveSubAgents(dept: DepartmentId, complexity: TaskComplexity): SubAgent[] {
  const department = DEPARTMENTS[dept];
  const agents = department.subAgents;
  switch (complexity) {
    case "simple":
      return agents.filter(a => a.required); // Lead only (1 agent)
    case "moderate":
      return agents.slice(0, Math.min(3, agents.length)); // Lead + 2 support (3 agents)
    case "complex":
      return agents; // Full team (all agents)
  }
}
