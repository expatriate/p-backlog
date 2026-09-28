import { errorCodeOrText } from "../../core/errors";
import type { CliEnv } from "../io";
import { skillLinkPath, type SkillLinkOptions } from "../skill-link";
import { AGENT_SPECS, type Agent } from "./agent";

type SkillSite = Pick<CliEnv, "env" | "home" | "packageRoot" | "platform">;

type AgentSkillLink<R> = { target: string } & ({ ok: true; result: R } | { ok: false; failed: string });

export async function linkAgentSkill<R>(agent: Agent, site: SkillSite, link: (options: SkillLinkOptions) => Promise<R>): Promise<AgentSkillLink<R>> {
  const skillsDir = AGENT_SPECS[agent].skillsDir(site);
  const target = skillLinkPath(skillsDir);
  try {
    return { target, ok: true, result: await link({ skillsDir, packageRoot: site.packageRoot, platform: site.platform }) };
  } catch (error) {
    return { target, ok: false, failed: errorCodeOrText(error) };
  }
}
