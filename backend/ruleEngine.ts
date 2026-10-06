import { 
  NormalizedStreamEvent, 
  TikTokUser, 
  IFTTTRule, 
  TriggerAction, 
  SingleCondition,
  PachinkoDropEvent,
  BuddySpawnInfo
} from './types.ts';
import { db } from './db.ts';
import { pachinkoManager } from './pachinkoManager.ts';

export class RuleEngine {
  private onActionGenerated: ((action: TriggerAction & { targetUser?: Partial<TikTokUser> }) => void) | null = null;
  private onPachinkoDrop: ((drop: PachinkoDropEvent) => void) | null = null;

  public setCallback(callback: (action: TriggerAction & { targetUser?: Partial<TikTokUser> }) => void) {
    this.onActionGenerated = callback;
  }

  public setPachinkoCallback(callback: (drop: PachinkoDropEvent) => void) {
    this.onPachinkoDrop = callback;
  }

  public evaluate(event: NormalizedStreamEvent, user: TikTokUser) {
    const rules = db.getTriggers().filter(r => r.enabled);
    if (rules.length === 0) {
      return;
    }

    // Expose join-derived flags (used by preset rules as user.firstTime etc.)
    const joinFlags = event.type === 'join'
      ? {
          firstTime: event.firstTime,
          firstTimeThisStream: event.firstTimeThisStream,
          returningFromBreak: event.returningFromBreak
        }
      : {};

    const context = {
      event,
      user: { ...user, ...joinFlags },
      stream: db.getCurrentStream()
    };

    for (const rule of rules) {
      const matchResult = this.checkConditionWithExplanation(rule.condition, context);
      if (matchResult.matched) {
        console.log(`[RuleEngine] RULE MATCHED: "${rule.name}" (ID: ${rule.id}) on event: "${event.type}" from user: @${user.username || 'unknown'} | Reason: ${matchResult.reason} | Dispatched actions: [${rule.actions.map(a => a.type).join(', ')}]`);
        this.executeActions(rule, context, event);
      }
    }
  }

  private checkConditionWithExplanation(
    condition: IFTTTRule['condition'], 
    context: any
  ): { matched: boolean; reason: string } {
    if (condition.all && condition.all.length > 0) {
      const reasons: string[] = [];
      for (const cond of condition.all) {
        const actual = this.resolveField(cond.field, context);
        const pass = this.evaluateSingle(cond, context);
        reasons.push(`${cond.field} (${actual}) ${cond.op} ${cond.value} => ${pass ? 'PASS' : 'FAIL'}`);
        if (!pass) {
          return { matched: false, reason: reasons.join('; ') };
        }
      }
      return { matched: true, reason: `ALL criteria met: ${reasons.join('; ')}` };
    }

    if (condition.any && condition.any.length > 0) {
      const reasons: string[] = [];
      for (const cond of condition.any) {
        const actual = this.resolveField(cond.field, context);
        const pass = this.evaluateSingle(cond, context);
        reasons.push(`${cond.field} (${actual}) ${cond.op} ${cond.value} => ${pass ? 'PASS' : 'FAIL'}`);
        if (pass) {
          return { matched: true, reason: `ANY matched: ${cond.field} (${actual}) ${cond.op} ${cond.value}` };
        }
      }
      return { matched: false, reason: `None matched: ${reasons.join('; ')}` };
    }

    return { matched: false, reason: 'Empty condition set' };
  }

  private matchesCondition(condition: IFTTTRule['condition'], context: any): boolean {
    return this.checkConditionWithExplanation(condition, context).matched;
  }

  private evaluateSingle(cond: SingleCondition, context: any): boolean {
    const actualValue = this.resolveField(cond.field, context);
    const expectedValue = cond.value;

    switch (cond.op) {
      case 'equals':
        return actualValue === expectedValue;
      case 'not_equals':
        return actualValue !== expectedValue;
      case 'greater_than':
        return Number(actualValue) > Number(expectedValue);
      case 'less_than':
        return Number(actualValue) < Number(expectedValue);
      case 'greater_or_equal':
        return Number(actualValue) >= Number(expectedValue);
      case 'less_or_equal':
        return Number(actualValue) <= Number(expectedValue);
      case 'contains':
        return String(actualValue || '').toLowerCase().includes(String(expectedValue || '').toLowerCase());
      default:
        return false;
    }
  }

  private resolveField(pathStr: string, context: any): any {
    const parts = pathStr.split('.');
    let curr: any = context;
    for (const part of parts) {
      if (curr === undefined || curr === null) return undefined;
      curr = curr[part];
    }
    return curr;
  }

  private executeActions(rule: IFTTTRule, context: any, event: NormalizedStreamEvent) {
    for (const action of rule.actions) {
      console.log(`[RuleEngine] ACTION DISPATCHED: Type "${action.type}" via Rule "${rule.name}" for @${context.user?.username || 'user'}`);

      // Handle Pachinko drop strictly through rule action with cooldown protection
      if (action.type === 'trigger_pachinko') {
        const settings = db.getSettings();
        if (settings.pachinkoEnabled) {
          const drop = pachinkoManager.triggerDropIfAllowed(
            context.user.id,
            context.user.username,
            context.user.pfp_url,
            action.pachinkoRarity,
            rule.name
          );
          if (drop && this.onPachinkoDrop) {
            this.onPachinkoDrop(drop);
          }
        } else {
          console.log(`[RuleEngine] Pachinko drop skipped: Pachinko game is disabled in settings.`);
        }
      }

      // Interpolate text template strings in textOverrides
      const textOverrides: Record<string, string> = {};
      if (action.textOverrides) {
        for (const [key, template] of Object.entries(action.textOverrides)) {
          textOverrides[key] = this.interpolate(template, context);
        }
      }

      const enrichedAction: TriggerAction & { targetUser?: Partial<TikTokUser> } = {
        ...action,
        textOverrides: Object.keys(textOverrides).length > 0 ? textOverrides : undefined,
        targetUser: {
          id: context.user?.id,
          username: context.user?.username,
          pfp_url: context.user?.pfp_url,
          glow_color: context.user?.glow_color,
          rarity_tier: context.user?.rarity_tier,
          buddy_type: action.buddyType || context.user?.buddy_type || 'circle'
        }
      };

      // Buddies exist only because a rule fired: attach provenance, lifetime and exit behavior
      if (action.type === 'spawn_buddy') {
        const buddySettings = db.getSettings().buddies;
        const spawn: BuddySpawnInfo = {
          instanceId: `buddy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          ruleId: rule.id,
          ruleName: rule.name,
          eventType: event.type,
          lifetimeMs: action.buddyLifetimeMs ?? buddySettings.defaultLifetimeMs,
          exitAnimation: action.exitAnimation ?? buddySettings.defaultExitAnimation
        };
        (enrichedAction as any).spawn = spawn;
        console.log(`[RuleEngine] BUDDY SPAWN: @${context.user?.username} via rule "${rule.name}" on "${event.type}" | lifetime ${spawn.lifetimeMs}ms, exit ${spawn.exitAnimation}`);
      }

      if (this.onActionGenerated) {
        this.onActionGenerated(enrichedAction);
      }
    }
  }

  private interpolate(template: string, context: any): string {
    return template.replace(/\{\{([\w.]+)\}\}/g, (_, key) => {
      const val = this.resolveField(key, context);
      return val !== undefined && val !== null ? String(val) : '';
    });
  }
}

export const ruleEngine = new RuleEngine();
