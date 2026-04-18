/**
 * The Pulse — personalized AI briefing and proactive insights.
 *
 * Generates a dynamic, contextual feed based on:
 * - Recent activity (conversations, workflows, bots)
 * - Memory connections found
 * - Platform usage patterns
 * - Proactive suggestions based on user behavior
 */

import { Router, type Request, type Response } from "express";
import { dbAll, dbGet } from "./lib/db";

export function createPulseRouter() {
  const router = Router();

  router.get("/", async (req: Request, res: Response) => {
    const userId = req.user?.id || 1;
    const now = Date.now();
    const today = now - 24 * 60 * 60 * 1000;
    const week = now - 7 * 24 * 60 * 60 * 1000;

    try {
      // Gather data from across the platform
      const [
        recentConversations,
        recentWorkflowRuns,
        activeBots,
        botErrors,
        unreadNotifications,
        recentTraces,
        memoryCount,
        totalConversations,
        totalWorkflows,
        totalBots,
        todayTokens,
        recentMemories,
      ] = await Promise.all([
        dbAll("SELECT id, title, updated_at FROM conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 5", userId),
        dbAll("SELECT id, pipeline_id, status, completed_at, total_tokens FROM pipeline_runs WHERE user_id = ? AND created_at > ? ORDER BY created_at DESC LIMIT 10", userId, week),
        dbAll("SELECT id, name, status, last_active_at, total_runs FROM bots WHERE user_id = ? AND status = 'running'", userId),
        dbAll("SELECT bot_id, message, created_at FROM bot_logs WHERE type = 'error' AND created_at > ? ORDER BY created_at DESC LIMIT 5", today),
        dbGet("SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0", userId),
        dbAll("SELECT department, status, total_tokens, duration_ms, created_at FROM agent_traces WHERE user_id = ? AND created_at > ? ORDER BY created_at DESC LIMIT 20", userId, today),
        dbGet("SELECT COUNT(*) as count FROM agent_memory WHERE user_id = ?", userId),
        dbGet("SELECT COUNT(*) as count FROM conversations WHERE user_id = ?", userId),
        dbGet("SELECT COUNT(*) as count FROM pipelines WHERE user_id = ?", userId),
        dbGet("SELECT COUNT(*) as count FROM bots WHERE user_id = ?", userId),
        dbGet("SELECT COALESCE(SUM(total_tokens), 0) as total FROM agent_traces WHERE user_id = ? AND created_at > ?", userId, today),
        dbAll("SELECT content, category, created_at FROM agent_memory WHERE user_id = ? ORDER BY created_at DESC LIMIT 5", userId),
      ]);

      const items: any[] = [];
      let idx = 0;
      const id = () => `pulse-${idx++}`;

      // Unread notifications
      const unreadCount = (unreadNotifications as any)?.count || 0;
      if (unreadCount > 0) {
        items.push({
          id: id(), type: "alert", icon: "alert",
          title: `${unreadCount} unread notification${unreadCount > 1 ? "s" : ""}`,
          content: `You have pending notifications. Check them to stay up to date.`,
          action: { label: "View notifications", href: "/notifications" },
        });
      }

      // Active bots
      const botList = (activeBots as any[]) || [];
      if (botList.length > 0) {
        items.push({
          id: id(), type: "stat", icon: "bot",
          title: `${botList.length} bot${botList.length > 1 ? "s" : ""} running`,
          content: botList.map((b: any) => `${b.name} (${b.total_runs} runs)`).join(", "),
          action: { label: "View bots", href: "/bots" },
        });
      }

      // Bot errors
      const errors = (botErrors as any[]) || [];
      if (errors.length > 0) {
        items.push({
          id: id(), type: "alert", icon: "alert",
          title: `${errors.length} bot error${errors.length > 1 ? "s" : ""} today`,
          content: errors[0]?.message?.slice(0, 100) || "Check bot logs for details",
          action: { label: "View bot logs", href: "/bots" },
        });
      }

      // Recent workflow runs
      const runs = (recentWorkflowRuns as any[]) || [];
      const completedRuns = runs.filter((r: any) => r.status === "complete");
      const failedRuns = runs.filter((r: any) => r.status === "failed");
      if (completedRuns.length > 0) {
        items.push({
          id: id(), type: "accomplishment", icon: "check",
          title: `${completedRuns.length} workflow${completedRuns.length > 1 ? "s" : ""} completed this week`,
          content: `Total tokens used: ${completedRuns.reduce((s: number, r: any) => s + (r.total_tokens || 0), 0).toLocaleString()}`,
          action: { label: "View workflows", href: "/workflows" },
        });
      }
      if (failedRuns.length > 0) {
        items.push({
          id: id(), type: "alert", icon: "alert",
          title: `${failedRuns.length} workflow${failedRuns.length > 1 ? "s" : ""} failed this week`,
          content: "Check the workflow logs for error details",
          action: { label: "Investigate", href: "/workflows" },
        });
      }

      // Today's AI usage
      const tokensToday = (todayTokens as any)?.total || 0;
      const tracesArr = (recentTraces as any[]) || [];
      if (tracesArr.length > 0) {
        const departments = Array.from(new Set(tracesArr.map((t: any) => t.department).filter(Boolean)));
        items.push({
          id: id(), type: "stat", icon: "activity",
          title: `${tracesArr.length} AI operations today`,
          content: `Departments used: ${departments.join(", ") || "none"}. ${tokensToday > 0 ? `${(tokensToday / 1000).toFixed(1)}K tokens consumed.` : ""}`,
          action: { label: "View traces", href: "/traces" },
        });
      }

      // Memory insights
      const memories = (recentMemories as any[]) || [];
      const memCount = (memoryCount as any)?.count || 0;
      if (memCount > 0) {
        items.push({
          id: id(), type: "memory", icon: "brain",
          title: `${memCount} memories stored`,
          content: memories.length > 0
            ? `Latest: "${(memories[0] as any).content?.slice(0, 80)}..."`
            : "Your AI is building knowledge about your work patterns",
          action: { label: "View memories", href: "/settings" },
        });
      }

      // Proactive suggestions based on usage
      const convCount = (totalConversations as any)?.count || 0;
      const wfCount = (totalWorkflows as any)?.count || 0;
      const btCount = (totalBots as any)?.count || 0;

      if (convCount > 0 && wfCount === 0) {
        items.push({
          id: id(), type: "suggestion", icon: "zap",
          title: "Turn your conversations into workflows",
          content: "You've had conversations but haven't created any workflows yet. Workflows let you automate repeated tasks — try /build or the Generate button.",
          action: { label: "Create workflow", href: "/workflows" },
        });
      }

      if (wfCount > 0 && btCount === 0) {
        items.push({
          id: id(), type: "suggestion", icon: "bot",
          title: "Deploy your first bot",
          content: "Bots run autonomously on schedules. Try the Daily Briefing template — it summarizes your platform activity every morning.",
          action: { label: "Create bot", href: "/bots" },
        });
      }

      if (convCount === 0) {
        items.push({
          id: id(), type: "suggestion", icon: "sparkles",
          title: "Start your first conversation",
          content: "Type anything in the quick input above, or head to Chat. Try: /research, /build, /swarm, /chart, or /design.",
          action: { label: "Open Chat", href: "/boss" },
        });
      }

      // Always add a motivational closer
      items.push({
        id: id(), type: "insight", icon: "sparkles",
        title: "Your AI is always learning",
        content: `Every conversation, every workflow, every decision is making your AI smarter. ${memCount > 0 ? `You have ${memCount} memories stored — your AI remembers your preferences and patterns.` : "Start using Cortal to build your personal AI memory."}`,
      });

      res.json({
        items,
        stats: {
          totalConversations: convCount,
          totalWorkflows: wfCount,
          totalBots: btCount,
          tokensToday,
          memoryCount: memCount,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
