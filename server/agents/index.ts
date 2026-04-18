/**
 * Agent system — exports specialist agents and department types.
 *
 * v2: 4 departments (Research, Coder, Artist, Writer)
 * Coder and Art have dedicated agent files with special handling.
 * Research and Writer run through the department executor directly.
 */

export { runCoderAgent, CODER_SYSTEM_PROMPT, CODER_DEFAULT_MODEL } from "./coder";
export type { CoderInput, AgentOutput } from "./coder";

export { runArtAgent, ART_SYSTEM_PROMPT, ART_DEFAULT_MODEL } from "./art";
export type { ArtInput, ArtOutput } from "./art";

// Department system (v2)
export { DEPARTMENTS, INTELLIGENCE_TIERS, detectDepartments, estimateComplexity, getModel, getActiveSubAgents } from "../departments/types";
export type { DepartmentId, IntelligenceLevel, TaskComplexity, SubAgent, Department } from "../departments/types";
export { executeDepartment } from "../departments/executor";
export type { DepartmentTask, DepartmentResult, SubAgentResult } from "../departments/executor";

// Legacy compat — some files may still reference AgentType
import type { DepartmentId as _DepartmentId } from "../departments/types";
export type AgentType = _DepartmentId;
