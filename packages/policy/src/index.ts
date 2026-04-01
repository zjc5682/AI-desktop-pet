import {
  DEFAULT_PERMISSION_STATE,
  type PermissionName,
  type PermissionState,
} from '@table-pet/shared';

export interface PolicyContext {
  reason?: string;
  gameId?: string;
  source?: string;
}

export interface SensitiveAction {
  capability: PermissionName;
  description: string;
  context?: PolicyContext;
}

export interface ApprovalResult {
  approved: boolean;
  reason?: string;
}

export interface PolicyEngine {
  canUse(capability: PermissionName, context?: PolicyContext): Promise<boolean>;
  requireApproval(action: SensitiveAction): Promise<ApprovalResult>;
  isSafeModeEnabled(scope: 'game-control' | 'camera' | 'mic' | 'automation'): boolean;
}

export class StaticPolicyEngine implements PolicyEngine {
  constructor(
    private permissions: PermissionState = { ...DEFAULT_PERMISSION_STATE },
    private safeMode = true,
  ) {}

  async canUse(capability: PermissionName, _context?: PolicyContext): Promise<boolean> {
    return this.permissions[capability] === 'granted';
  }

  async requireApproval(action: SensitiveAction): Promise<ApprovalResult> {
    const approved = await this.canUse(action.capability, action.context);
    return {
      approved,
      reason: approved ? undefined : `${action.capability} requires approval.`,
    };
  }

  isSafeModeEnabled(scope: 'game-control' | 'camera' | 'mic' | 'automation'): boolean {
    if (scope === 'game-control') {
      return this.safeMode;
    }
    return false;
  }

  setPermission(capability: PermissionName, decision: PermissionState[PermissionName]): void {
    this.permissions = {
      ...this.permissions,
      [capability]: decision,
    };
  }

  setSafeMode(enabled: boolean): void {
    this.safeMode = enabled;
  }
}
