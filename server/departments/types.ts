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
};

export type IntelligenceLevel = "entry" | "medium" | "max";
export type DepartmentId = "research" | "coder" | "artist" | "writer";
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
    models: { research: "gpt-5.4-mini", coder: "gpt-5.4-mini", artist: "gpt-image-1", writer: "gpt-5.4-mini" },
  },
  medium: {
    label: "Medium", description: "Balanced speed and quality",
    bossModel: "gpt-5.4", costMultiplier: 3,
    models: { research: "sonar-pro", coder: "claude-sonnet-4-6", artist: "gpt-image-1", writer: "claude-sonnet-4-6" },
  },
  max: {
    label: "Max", description: "Highest quality output",
    bossModel: "claude-opus-4-6", costMultiplier: 8,
    models: { research: "sonar-pro", coder: "claude-opus-4-6", artist: "gpt-image-1", writer: "claude-opus-4-6" },
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
        systemPrompt: `You are the Lead Researcher for Bunz. Gather information and produce structured research.

Output format:
- Key findings with supporting evidence
- Data points and statistics when available
- Source attribution (name sources)
- Clear structure with headers and bullets
- "Key Takeaways" section at the end

Be thorough but concise. Accuracy over volume.`,
      },
      {
        id: "analyst", label: "Analyst", required: false,
        modelOverride: { medium: "gpt-5.4", max: "claude-opus-4-6" },
        systemPrompt: `You are the Analyst for Bunz. You receive research and perform deeper analysis.

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
        systemPrompt: `You are the Fact-Checker for Bunz. Review research for accuracy.

- Verify key claims and statistics
- Flag unsupported assertions
- Check for logical inconsistencies
- Confidence rating (High/Medium/Low) for major claims

Be skeptical but fair.`,
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
        systemPrompt: `You are the Lead Developer for Bunz. Write production-ready code.

- Always wrap code in markdown code blocks with language tags
- Clean, well-commented, production-ready code
- Brief explanations of your approach
- Include error handling and edge cases
- If you have GitHub access, browse the repo before modifying
- Consider the existing architecture`,
      },
      {
        id: "junior_dev", label: "Junior Developer", required: false,
        modelOverride: { medium: "gpt-5.4-mini", max: "gpt-5.4" },
        systemPrompt: `You are the Junior Developer for Bunz. Supporting coding tasks.

- Write unit tests for the Lead Developer's code
- Generate boilerplate and scaffolding
- Create documentation and inline comments
- Write utility functions

Be thorough with tests. Cover edge cases.`,
      },
      {
        id: "code_reviewer", label: "Code Reviewer", required: false,
        modelOverride: { max: "claude-sonnet-4-6" },
        systemPrompt: `You are the Code Reviewer for Bunz. Review code for quality.

- Check for bugs and logical errors
- Identify security vulnerabilities
- Verify error handling
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
        systemPrompt: `You are the Lead Artist for Bunz. Create images based on descriptions. Enhance prompts with style, lighting, composition, and mood details for better output.`,
      },
      {
        id: "style_director", label: "Style Director", required: false,
        modelOverride: { medium: "claude-sonnet-4-6", max: "claude-opus-4-6" },
        systemPrompt: `You are the Style Director for Bunz. Enhance image generation prompts.

- Take basic image requests and craft detailed, optimized prompts
- Specify art style (photorealistic, illustration, minimalist, etc.)
- Add composition, lighting, color palette, mood
- Output a SINGLE refined prompt ready for image generation — nothing else`,
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
        systemPrompt: `You are the Lead Writer for Bunz. Create compelling, well-structured content.

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
        systemPrompt: `You are the Copywriter for Bunz. Short-form, high-impact content.

- Compelling headlines and taglines
- Social media posts optimized for engagement
- Ad copy that converts
- 3-5 variations for A/B testing

Be punchy and action-oriented. Every word counts.`,
      },
      {
        id: "editor", label: "Editor", required: false,
        modelOverride: { max: "claude-sonnet-4-6" },
        systemPrompt: `You are the Editor for Bunz. Polish content to publication quality.

- Fix grammar, spelling, punctuation
- Improve sentence structure and flow
- Check factual accuracy
- Ensure consistent tone
- Return polished version with brief changelog`,
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
  switch (complexity) {
    case "simple": return department.subAgents.filter(a => a.required);
    case "moderate": return department.subAgents.slice(0, 2);
    case "complex": return department.subAgents;
  }
}
