/**
 * Clone Me — Digital Twin Creator.
 *
 * Users go through an interactive interview where the AI deeply learns their:
 * - Communication style (formal/casual, humor, vocabulary)
 * - Decision-making patterns (risk tolerance, priorities)
 * - Domain expertise (what they know deeply)
 * - Values and opinions
 *
 * The result: a system prompt + memory profile that makes the AI
 * respond exactly like the user. Other people can't tell the difference.
 */

import { v4 as uuidv4 } from "uuid";
import { Router, type Request, type Response } from "express";
import { dbRun, dbAll, dbGet } from "./lib/db";
import { modelRouter } from "./ai";

const INTERVIEW_QUESTIONS = [
  {
    phase: "communication",
    question: "How would you describe your communication style? Are you more formal or casual? Do you use humor? Short sentences or detailed explanations? Give me an example of how you'd explain something to a coworker.",
  },
  {
    phase: "communication",
    question: "When you write an email or message, what does it usually look like? Short and punchy, or detailed with context? Do you use emojis, exclamation marks, or keep it professional? Paste an example if you have one.",
  },
  {
    phase: "expertise",
    question: "What are the top 3-5 things you know deeply? What topics could you talk about for hours? What do people come to you for advice on?",
  },
  {
    phase: "expertise",
    question: "What's your job/role? Walk me through a typical day. What tools do you use? What decisions do you make regularly?",
  },
  {
    phase: "decisions",
    question: "When you face a tough decision, how do you approach it? Do you go with gut instinct, analyze data, ask others, sleep on it? Give me a recent example.",
  },
  {
    phase: "decisions",
    question: "What are your non-negotiables? Things you'd never compromise on professionally? What trade-offs do you usually accept?",
  },
  {
    phase: "personality",
    question: "What's your sense of humor like? What makes you laugh? What annoys you? How do you react when things go wrong?",
  },
  {
    phase: "personality",
    question: "What do you value most in work? Speed, quality, creativity, efficiency? How do you want people to perceive you?",
  },
];

export function createCloneRouter() {
  const router = Router();

  // Get user's clone profile
  router.get("/profile", async (req: Request, res: Response) => {
    const userId = req.user?.id || 1;
    const profile = await dbGet("SELECT * FROM clone_profiles WHERE user_id = ?", userId);
    res.json(profile || null);
  });

  // Start or continue the interview
  router.post("/interview", async (req: Request, res: Response) => {
    const userId = req.user?.id || 1;
    const { answers = [], currentStep = 0 } = req.body;

    // If we have all answers, generate the clone profile
    if (currentStep >= INTERVIEW_QUESTIONS.length || answers.length >= INTERVIEW_QUESTIONS.length) {
      try {
        const profile = await generateCloneProfile(userId, answers);
        res.json({ complete: true, profile });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
      return;
    }

    // Return the next question
    const question = INTERVIEW_QUESTIONS[currentStep];
    res.json({
      complete: false,
      step: currentStep,
      totalSteps: INTERVIEW_QUESTIONS.length,
      phase: question.phase,
      question: question.question,
    });
  });

  // Chat with someone's clone (public endpoint for shared clones)
  router.post("/chat/:userId", async (req: Request, res: Response) => {
    const targetUserId = parseInt(req.params.userId as string);
    const { message, history = [] } = req.body;
    if (!message) return res.status(400).json({ error: "message required" });

    const profile = await dbGet("SELECT * FROM clone_profiles WHERE user_id = ? AND is_active = 1", targetUserId) as any;
    if (!profile) return res.status(404).json({ error: "Clone not found or not active" });

    try {
      const result = await modelRouter.chat({
        model: "gpt-5.4",
        messages: [
          ...history.slice(-6).map((m: any) => ({ role: m.role, content: m.content })),
          { role: "user" as const, content: message },
        ],
        systemPrompt: profile.system_prompt,
      });

      // Update usage count
      await dbRun("UPDATE clone_profiles SET usage_count = usage_count + 1, last_used_at = ? WHERE id = ?",
        Date.now(), profile.id);

      res.json({ reply: result.content, tokens: result.usage.totalTokens });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Toggle clone active status
  router.post("/toggle", async (req: Request, res: Response) => {
    const userId = req.user?.id || 1;
    const profile = await dbGet("SELECT id, is_active FROM clone_profiles WHERE user_id = ?", userId) as any;
    if (!profile) return res.status(404).json({ error: "No clone profile found. Complete the interview first." });

    await dbRun("UPDATE clone_profiles SET is_active = ? WHERE id = ?", profile.is_active ? 0 : 1, profile.id);
    res.json({ ok: true, isActive: !profile.is_active });
  });

  // Delete clone
  router.delete("/", async (req: Request, res: Response) => {
    const userId = req.user?.id || 1;
    await dbRun("DELETE FROM clone_profiles WHERE user_id = ?", userId);
    res.json({ ok: true });
  });

  return router;
}

async function generateCloneProfile(userId: number, answers: string[]): Promise<any> {
  // Compile all answers
  const interviewData = INTERVIEW_QUESTIONS.map((q, i) => ({
    phase: q.phase,
    question: q.question,
    answer: answers[i] || "",
  }));

  // Generate the system prompt that captures the user's personality
  const result = await modelRouter.chat({
    model: "gpt-5.4",
    messages: [{
      role: "user",
      content: `Based on this interview, create a detailed system prompt that will make an AI respond EXACTLY like this person. The prompt should capture their communication style, expertise, decision-making patterns, humor, values, and personality quirks.

INTERVIEW RESPONSES:
${interviewData.map(q => `Q: ${q.question}\nA: ${q.answer}`).join("\n\n")}

Generate a system prompt (500-800 words) that starts with "You are [name/role]..." and includes:
1. Communication style rules (tone, vocabulary, sentence structure, use of humor)
2. Domain expertise areas and how they talk about them
3. Decision-making framework
4. Personality traits, quirks, pet peeves
5. Example phrases or patterns they commonly use
6. How they respond to different types of situations (urgent, casual, technical, emotional)

Make it specific enough that someone who knows this person would say "that sounds exactly like them."
Also generate a short bio (2-3 sentences) for display purposes.

Return as JSON:
{
  "systemPrompt": "You are...",
  "displayName": "Name or role",
  "bio": "Short bio",
  "traits": ["trait1", "trait2", "trait3"]
}`,
    }],
    systemPrompt: "You are an expert at capturing human personality and communication patterns in AI system prompts. Be incredibly specific and nuanced.",
  });

  let profileData: any;
  try {
    const match = result.content.match(/\{[\s\S]*\}/);
    profileData = match ? JSON.parse(match[0]) : null;
  } catch {
    profileData = { systemPrompt: result.content, displayName: "Clone", bio: "", traits: [] };
  }

  if (!profileData) throw new Error("Failed to generate clone profile");

  const id = uuidv4();
  await dbRun(`
    INSERT OR REPLACE INTO clone_profiles
      (id, user_id, display_name, bio, system_prompt, traits, interview_data, is_active, usage_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
  `,
    id, userId,
    profileData.displayName || "My Clone",
    profileData.bio || "",
    profileData.systemPrompt,
    JSON.stringify(profileData.traits || []),
    JSON.stringify(interviewData),
    Date.now(), Date.now(),
  );

  return { id, ...profileData };
}
