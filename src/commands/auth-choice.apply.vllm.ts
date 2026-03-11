import { normalizeAgentId } from "../routing/session-key.js";
import type { ApplyAuthChoiceParams, ApplyAuthChoiceResult } from "./auth-choice.apply.js";
import {
  applyVllmDefaultModel,
  clearStaleVllmDefaultModel,
  isStaleManagedVllmModelRef,
} from "./vllm-default-model.js";
import { promptAndConfigureVllm } from "./vllm-setup.js";

function resolveCurrentAgentModelRef(params: ApplyAuthChoiceParams): string | undefined {
  const agentId = params.agentId ? normalizeAgentId(params.agentId) : undefined;
  if (!agentId) {
    return undefined;
  }

  const entry = params.config.agents?.list?.find(
    (candidate) => normalizeAgentId(candidate.id) === agentId,
  );
  if (!entry?.model) {
    return undefined;
  }

  if (typeof entry.model === "string") {
    return entry.model.trim() || undefined;
  }

  return entry.model.primary?.trim() || undefined;
}

export async function applyAuthChoiceVllm(
  params: ApplyAuthChoiceParams,
): Promise<ApplyAuthChoiceResult | null> {
  if (params.authChoice !== "vllm") {
    return null;
  }

  const vllmSelection = await promptAndConfigureVllm({
    cfg: params.config,
    prompter: params.prompter,
    agentDir: params.agentDir,
  });

  if (!vllmSelection.modelRef) {
    const shouldClearAgentModelOverride = isStaleManagedVllmModelRef(
      vllmSelection.config,
      resolveCurrentAgentModelRef(params),
    );
    return {
      config: clearStaleVllmDefaultModel(vllmSelection.config),
      ...(shouldClearAgentModelOverride ? { clearAgentModelOverride: true } : {}),
    };
  }

  const { config: nextConfig, modelRef } = vllmSelection;

  if (!params.setDefaultModel) {
    return { config: nextConfig, agentModelOverride: modelRef };
  }

  await params.prompter.note(`Default model set to ${modelRef}`, "Model configured");
  return { config: applyVllmDefaultModel(nextConfig, modelRef) };
}
