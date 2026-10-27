import type { Group, Membership, Person, Relationship } from '../types/domain';

export interface GroupMemberCount {
  groupId: string;
  directPersonIds: string[];
  directCount: number;
  totalUniquePersonIds: string[];
  totalCount: number;
}

/**
 * グループごとの所属人数集計
 * - 小グループ所属と大グループ直接所属は別管理
 * - 小グループ所属者は親の大グループの「配下を含む人数（totalCount）」に含める
 * - 同じ人物が「大グループ直接」と「配下の複数の小グループ」に重複所属していても、
 *   totalCount では Set で重複排除し 1 人としてカウントする
 */
export function calculateGroupMemberCounts(
  groups: Group[],
  memberships: Membership[],
  people: Person[]
): Record<string, GroupMemberCount> {
  const validPersonIds = new Set(people.map((p) => p.id));
  const result: Record<string, GroupMemberCount> = {};

  // 1. 各グループの直接所属者（重複排除済み）を計算
  const directMap: Record<string, Set<string>> = {};
  for (const g of groups) {
    directMap[g.id] = new Set<string>();
  }

  for (const m of memberships) {
    if (!validPersonIds.has(m.personId)) continue;
    if (directMap[m.groupId]) {
      directMap[m.groupId].add(m.personId);
    }
  }

  // 2. 小グループ一覧を親グループIDごとに索引化
  const childrenByParent: Record<string, Group[]> = {};
  for (const g of groups) {
    if (g.kind === 'small' && g.parentGroupId) {
      if (!childrenByParent[g.parentGroupId]) {
        childrenByParent[g.parentGroupId] = [];
      }
      childrenByParent[g.parentGroupId].push(g);
    }
  }

  // 3. 各グループの directCount と totalCount（配下小グループを含むユニーク人数）を算出
  for (const g of groups) {
    const directSet = directMap[g.id] || new Set<string>();
    const totalSet = new Set<string>(directSet);

    if (g.kind === 'large') {
      const childGroups = childrenByParent[g.id] || [];
      for (const child of childGroups) {
        const childDirect = directMap[child.id] || new Set<string>();
        for (const pid of childDirect) {
          totalSet.add(pid);
        }
      }
    }

    const directPersonIds = Array.from(directSet);
    const totalUniquePersonIds = Array.from(totalSet);

    result[g.id] = {
      groupId: g.id,
      directPersonIds,
      directCount: directPersonIds.length,
      totalUniquePersonIds,
      totalCount: totalUniquePersonIds.length,
    };
  }

  return result;
}

export interface GroupDeletionImpact {
  targetGroup: Group;
  childSmallGroups: Group[];
  affectedMemberships: Membership[];
  affectedRelationships: Relationship[];
  summaryMessages: string[];
}

/**
 * グループ削除前の影響分析（子グループ・所属・関係線への影響を一覧化）
 */
export function analyzeGroupDeletionImpact(
  groupId: string,
  groups: Group[],
  memberships: Membership[],
  relationships: Relationship[]
): GroupDeletionImpact | null {
  const targetGroup = groups.find((g) => g.id === groupId);
  if (!targetGroup) return null;

  const childSmallGroups =
    targetGroup.kind === 'large'
      ? groups.filter((g) => g.kind === 'small' && g.parentGroupId === groupId)
      : [];

  const allDeletedGroupIds = new Set<string>([
    groupId,
    ...childSmallGroups.map((c) => c.id),
  ]);

  const affectedMemberships = memberships.filter((m) => allDeletedGroupIds.has(m.groupId));
  const affectedRelationships = relationships.filter(
    (r) =>
      (r.sourceKind === 'group' && allDeletedGroupIds.has(r.sourceId)) ||
      (r.targetKind === 'group' && allDeletedGroupIds.has(r.targetId))
  );

  const summaryMessages: string[] = [];
  if (childSmallGroups.length > 0) {
    summaryMessages.push(
      `配下の小グループ ${childSmallGroups.length}件（${childSmallGroups.map((c) => c.name).join('、')}）も同時に削除されます。`
    );
  }
  if (affectedMemberships.length > 0) {
    summaryMessages.push(
      `このグループ（および配下小グループ）への所属・ロール設定 ${affectedMemberships.length}件が解除されます（人物データ自体は削除されません）。`
    );
  }
  if (affectedRelationships.length > 0) {
    summaryMessages.push(
      `このグループに接続されている関係線 ${affectedRelationships.length}件が削除されます。`
    );
  }
  if (summaryMessages.length === 0) {
    summaryMessages.push('このグループには配下の小グループ・所属・関係線はありません。安全に削除できます。');
  }

  return {
    targetGroup,
    childSmallGroups,
    affectedMemberships,
    affectedRelationships,
    summaryMessages,
  };
}

export interface GroupParentChangeImpact {
  valid: boolean;
  error?: string;
  warnings: string[];
}

/**
 * グループの種別・親グループ変更時の整合性検証と影響案内
 */
export function validateAndAnalyzeGroupParentChange(
  targetGroup: Group,
  newKind: 'large' | 'small',
  newParentGroupId: string | null,
  allGroups: Group[],
  memberships: Membership[]
): GroupParentChangeImpact {
  const warnings: string[] = [];

  if (newKind === 'large') {
    if (newParentGroupId !== null) {
      return {
        valid: false,
        error: '大グループには親グループを設定できません。',
        warnings,
      };
    }
    if (targetGroup.kind === 'small' && targetGroup.parentGroupId) {
      const oldParent = allGroups.find((g) => g.id === targetGroup.parentGroupId);
      const memberCount = memberships.filter((m) => m.groupId === targetGroup.id).length;
      if (oldParent) {
        warnings.push(
          `小グループから独立した大グループへ変更すると、旧親グループ「${oldParent.name}」の配下人数集計からこのグループの所属者（${memberCount}件）が外れます。`
        );
      }
    }
    return { valid: true, warnings };
  }

  // newKind === 'small' の場合
  const existingChildren = allGroups.filter(
    (g) => g.kind === 'small' && g.parentGroupId === targetGroup.id
  );
  if (existingChildren.length > 0) {
    return {
      valid: false,
      error: `配下に小グループ（${existingChildren.map((c) => c.name).join('、')}）が存在するため、この大グループを小グループに変更することはできません。先に配下の小グループを移動または削除してください。`,
      warnings,
    };
  }

  if (!newParentGroupId) {
    return {
      valid: false,
      error: '小グループには親となる大グループの選択が必須です。',
      warnings,
    };
  }

  if (newParentGroupId === targetGroup.id) {
    return {
      valid: false,
      error: '自分自身を親グループに設定することはできません。',
      warnings,
    };
  }

  const parentGroup = allGroups.find((g) => g.id === newParentGroupId);
  if (!parentGroup || parentGroup.kind !== 'large') {
    return {
      valid: false,
      error: '親グループには有効な大グループを指定してください（三階層以上のネストはできません）。',
      warnings,
    };
  }

  if (targetGroup.parentGroupId && targetGroup.parentGroupId !== newParentGroupId) {
    const oldParent = allGroups.find((g) => g.id === targetGroup.parentGroupId);
    const memberCount = memberships.filter((m) => m.groupId === targetGroup.id).length;
    warnings.push(
      `親グループを「${oldParent?.name ?? '旧グループ'}」から「${parentGroup.name}」へ変更します。所属者（${memberCount}件）のロール設定は維持され、配下人数の集計先が「${parentGroup.name}」へ移ります。`
    );
  }

  return { valid: true, warnings };
}
