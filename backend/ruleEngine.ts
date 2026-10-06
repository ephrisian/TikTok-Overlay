import { 
  NormalizedStreamEvent, 
  TikTokUser, 
  IFTTTRule, 
  TriggerAction, 
  SingleCondition 
} from './types.ts';
import { db } from './db.ts';

export class RuleEngine {
  private onActionGenerated: ((action: TriggerAction & { targetUser?: Partial<TikTokUser> }) => void) | null = null;

  public setCallback(callback: (action: TriggerAction & { targetUser?: Partial<TikTokUser> }) => void) {
    this.onActionGenerated = callback;
  }

  public evaluate(event: NormalizedStreamEvent, user: TikTokUser) {
    const rules = db.getTriggers().filter(r => r.enabled);
    const context = {
      event,
      user,
      stream: db.getCurrentStream()
    };

    for (const rule of rules) {
      if (this.matchesCondition(rule.condition, context)) {
        this.executeActions(rule, context);
      }
    }
  }

  private matchesCondition(condition: IFTTTRule['condition'], context: any): boolean {
    if (condition.all && condition.all.length > 0) {
      for (const cond of condition.all) {
        if (!this.evaluateSingle(cond, context)) {
          return false;
        }
      }
      return true;
    }

    if (condition.any && condition.any.length > 0) {
      for (const cond of condition.any) {
        if (this.evaluateSingle(cond, context)) {
          return true;
        }
      }
      return false;
    }

    return false;
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
        return String(actualValue).toLowerCase().includes(String(expectedValue).toLowerCase());
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

  private executeActions(rule: IFTTTRule, context: any) {
    for (const action of rule.actions) {
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
