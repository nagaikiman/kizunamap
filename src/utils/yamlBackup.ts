import { stringify, parse } from 'yaml';
import type {
  Diagram,
  Group,
  Membership,
  Person,
  Project,
  ProjectBundle,
  ProjectIconDoc,
  Relationship,
} from '../types/domain';
import { validateProcessedIconDataUrl } from './imageProcessor';

export interface YamlBackupPayload {
  schemaVersion: '1.0.0';
  app: 'KizunaMap';
  exportedAt: string;
  project: {
    id: string;
    name: string;
    description: string;
    isPublic: boolean;
    roleTags: Project['roleTags'];
    skillTags: Project['skillTags'];
    relationTags: Project['relationTags'];
    groupTags: Project['groupTags'];
  };
  groups: Group[];
  people: Person[];
  memberships: Membership[];
  relationships: Relationship[];
  diagrams: Diagram[];
  projectIcons: ProjectIconDoc[];
}

/**
 * プロジェクト管理者がローカルへYAML形式で退避（エクスポート）するためのシリアライザ
 * - メールアドレスや他人の非公開本人プロフィール（userProfiles）は絶対に含めない
 * - プロジェクト基本情報・グループ階層・人物（プロジェクト管理項目）・所属ロール・関係線・図の座標・プロジェクト用アイコンを含む
 */
export function exportProjectBundleToYaml(bundle: ProjectBundle): string {
  const payload: YamlBackupPayload = {
    schemaVersion: '1.0.0',
    app: 'KizunaMap',
    exportedAt: new Date().toISOString(),
    project: {
      id: bundle.project.id,
      name: bundle.project.name,
      description: bundle.project.description,
      isPublic: bundle.project.isPublic,
      roleTags: bundle.project.roleTags,
      skillTags: bundle.project.skillTags,
      relationTags: bundle.project.relationTags,
      groupTags: bundle.project.groupTags,
    },
    groups: bundle.groups.map((g) => ({ ...g })),
    people: bundle.people.map((p) => ({
      ...p,
      // セキュリティのため招待IDはバックアップ復元時に無効化できるよう保持またはクリア可能
    })),
    memberships: bundle.memberships.map((m) => ({ ...m })),
    relationships: bundle.relationships.map((r) => ({ ...r })),
    diagrams: bundle.diagrams.map((d) => ({ ...d })),
    projectIcons: Object.values(bundle.projectIcons),
  };

  return stringify(payload, {
    indent: 2,
    lineWidth: 120,
  });
}

export interface YamlImportValidationResult {
  valid: boolean;
  error?: string;
  warnings: string[];
  bundle?: Omit<ProjectBundle, 'editorEmails'>;
}

/**
 * YAMLファイルの検証とProjectBundleへの変換（管理者のみ取込可能）
 * - 二階層グループの整合性チェック
 * - 所属・関係線の参照整合性チェック
 * - アイコン画像のサイズ・形式チェック
 * - 他人の本人プロフィールは一切書き換えない
 */
export function parseAndValidateYamlBackup(
  yamlText: string,
  targetProjectId: string,
  currentOwnerUid: string
): YamlImportValidationResult {
  const warnings: string[] = [];

  if (!yamlText || !yamlText.trim()) {
    return { valid: false, error: 'YAMLファイルが空です。', warnings };
  }

  let parsed: unknown;
  try {
    parsed = parse(yamlText);
  } catch (err) {
    return {
      valid: false,
      error: `YAMLの構文解析に失敗しました: ${err instanceof Error ? err.message : String(err)}`,
      warnings,
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { valid: false, error: '有効なYAMLオブジェクトではありません。', warnings };
  }

  const raw = parsed as Partial<YamlBackupPayload>;
  if (raw.app !== 'KizunaMap') {
    return {
      valid: false,
      error: 'KizunaMap形式のバックアップファイルではありません（app: KizunaMap が見つかりません）。',
      warnings,
    };
  }

  if (!raw.project || typeof raw.project.name !== 'string' || !raw.project.name.trim()) {
    return { valid: false, error: 'プロジェクト名（project.name）が不正です。', warnings };
  }

  const now = new Date().toISOString();
  const rawGroups = Array.isArray(raw.groups) ? raw.groups : [];
  const rawPeople = Array.isArray(raw.people) ? raw.people : [];
  const rawMemberships = Array.isArray(raw.memberships) ? raw.memberships : [];
  const rawRelationships = Array.isArray(raw.relationships) ? raw.relationships : [];
  const rawDiagrams = Array.isArray(raw.diagrams) ? raw.diagrams : [];
  const rawIcons = Array.isArray(raw.projectIcons) ? raw.projectIcons : [];

  // 1. グループ検証（大グループを先に確認し、小グループの親が大グループであることを確認）
  const largeGroupIds = new Set<string>();
  for (const g of rawGroups) {
    if (!g || typeof g.id !== 'string' || typeof g.name !== 'string') {
      return { valid: false, error: '不正なグループ定義が含まれています。', warnings };
    }
    if (g.kind === 'large') {
      largeGroupIds.add(g.id);
    }
  }

  const validGroups: Group[] = [];
  const allGroupIds = new Set<string>();

  for (const g of rawGroups) {
    if (g.kind === 'small') {
      if (!g.parentGroupId || !largeGroupIds.has(g.parentGroupId)) {
        return {
          valid: false,
          error: `小グループ「${g.name}」の親グループ（${g.parentGroupId ?? '未指定'}）が大グループとして存在しません。`,
          warnings,
        };
      }
    }
    allGroupIds.add(g.id);
    validGroups.push({
      id: g.id,
      projectId: targetProjectId,
      name: g.name.slice(0, 80),
      kind: g.kind === 'small' ? 'small' : 'large',
      parentGroupId: g.kind === 'small' ? g.parentGroupId : null,
      color: typeof g.color === 'string' ? g.color : '#4f46e5',
      description: typeof g.description === 'string' ? g.description.slice(0, 500) : '',
      tags: Array.isArray(g.tags) ? g.tags.filter((t): t is string => typeof t === 'string') : [],
      iconId: typeof g.iconId === 'string' ? g.iconId : null,
      iconRevision: typeof g.iconRevision === 'number' ? g.iconRevision : 0,
      avatarPreset: typeof g.avatarPreset === 'string' ? g.avatarPreset : 'building',
      order: typeof g.order === 'number' ? g.order : validGroups.length,
      updatedAt: now,
    });
  }

  // 2. 人物検証
  const validPeople: Person[] = [];
  const allPersonIds = new Set<string>();

  for (const p of rawPeople) {
    if (!p || typeof p.id !== 'string' || typeof p.displayName !== 'string') {
      return { valid: false, error: '不正な人物定義が含まれています。', warnings };
    }
    allPersonIds.add(p.id);
    validPeople.push({
      id: p.id,
      projectId: targetProjectId,
      displayName: p.displayName.slice(0, 80),
      globalRoleIds: Array.isArray(p.globalRoleIds) ? p.globalRoleIds : [],
      skillIds: Array.isArray(p.skillIds) ? p.skillIds : [],
      color: typeof p.color === 'string' ? p.color : '#0ea5e9',
      projectMemo: typeof p.projectMemo === 'string' ? p.projectMemo.slice(0, 1000) : '',
      // セキュリティルール上、インポートで他人のUIDを勝手に新規ひも付けすることはできないため、
      // バックアップ内のlinkedUidは保持するが、Firestore反映時は既存連携と一致しない場合は未連携として安全に取り込む案内を出す
      linkedUid: typeof p.linkedUid === 'string' ? p.linkedUid : null,
      activeInvitationId: null,
      tempIconId: typeof p.tempIconId === 'string' ? p.tempIconId : null,
      tempIconRevision: typeof p.tempIconRevision === 'number' ? p.tempIconRevision : 0,
      avatarPreset: typeof p.avatarPreset === 'string' ? p.avatarPreset : 'user',
      updatedAt: now,
    });
  }

  // 3. 所属（Membership）の参照整合性検証
  const validMemberships: Membership[] = [];
  for (const m of rawMemberships) {
    if (!m || typeof m.id !== 'string') continue;
    if (!allPersonIds.has(m.personId) || !allGroupIds.has(m.groupId)) {
      warnings.push(`存在しない人物またはグループを参照していた所属データ（ID: ${m.id}）を除外しました。`);
      continue;
    }
    validMemberships.push({
      id: m.id,
      projectId: targetProjectId,
      personId: m.personId,
      groupId: m.groupId,
      roleIds: Array.isArray(m.roleIds) ? m.roleIds : [],
      memo: typeof m.memo === 'string' ? m.memo.slice(0, 500) : '',
      updatedAt: now,
    });
  }

  // 4. 関係線（Relationship）の参照整合性検証
  const validRelationships: Relationship[] = [];
  for (const r of rawRelationships) {
    if (!r || typeof r.id !== 'string') continue;
    const sourceExists =
      r.sourceKind === 'person' ? allPersonIds.has(r.sourceId) : allGroupIds.has(r.sourceId);
    const targetExists =
      r.targetKind === 'person' ? allPersonIds.has(r.targetId) : allGroupIds.has(r.targetId);

    if (!sourceExists || !targetExists) {
      warnings.push(`存在しない対象を参照していた関係線「${r.label || r.id}」を除外しました。`);
      continue;
    }
    validRelationships.push({
      id: r.id,
      projectId: targetProjectId,
      sourceKind: r.sourceKind === 'group' ? 'group' : 'person',
      sourceId: r.sourceId,
      targetKind: r.targetKind === 'group' ? 'group' : 'person',
      targetId: r.targetId,
      label: typeof r.label === 'string' && r.label.trim() ? r.label.slice(0, 80) : '関係',
      tagIds: Array.isArray(r.tagIds) ? r.tagIds : [],
      direction:
        r.direction === 'bidirectional' || r.direction === 'none' ? r.direction : 'forward',
      color: typeof r.color === 'string' ? r.color : '#64748b',
      lineStyle: r.lineStyle === 'dashed' ? 'dashed' : 'solid',
      memo: typeof r.memo === 'string' ? r.memo.slice(0, 500) : '',
      updatedAt: now,
    });
  }

  // 5. 図（Diagram）の検証
  const validDiagrams: Diagram[] = rawDiagrams.map((d, idx) => ({
    id: typeof d.id === 'string' ? d.id : `diag_${idx + 1}`,
    projectId: targetProjectId,
    name: typeof d.name === 'string' && d.name.trim() ? d.name.slice(0, 80) : `図 ${idx + 1}`,
    description: typeof d.description === 'string' ? d.description.slice(0, 500) : '',
    viewMode:
      d.viewMode === 'people' || d.viewMode === 'groups' || d.viewMode === 'mixed'
        ? d.viewMode
        : 'mixed',
    nodeStyle: d.nodeStyle === 'compact' ? 'compact' : 'card',
    nodePositions: d.nodePositions && typeof d.nodePositions === 'object' ? d.nodePositions : {},
    collapsedGroupIds: Array.isArray(d.collapsedGroupIds) ? d.collapsedGroupIds : [],
    hiddenNodeIds: Array.isArray(d.hiddenNodeIds) ? d.hiddenNodeIds : [],
    filterConfig: d.filterConfig ?? {
      focusedEntityId: null,
      focusedGroupId: null,
      selectedRoleIds: [],
      selectedSkillIds: [],
      showMemberships: true,
      showRelationships: true,
      showGroupHierarchy: true,
    },
    order: typeof d.order === 'number' ? d.order : idx,
    updatedAt: now,
  }));

  if (validDiagrams.length === 0) {
    validDiagrams.push({
      id: 'diag_main',
      projectId: targetProjectId,
      name: 'メイン相関図',
      description: 'インポートされた標準相関図',
      viewMode: 'mixed',
      nodeStyle: 'card',
      nodePositions: {},
      collapsedGroupIds: [],
      hiddenNodeIds: [],
      filterConfig: {
        focusedEntityId: null,
        focusedGroupId: null,
        selectedRoleIds: [],
        selectedSkillIds: [],
        showMemberships: true,
        showRelationships: true,
        showGroupHierarchy: true,
      },
      order: 0,
      updatedAt: now,
    });
  }

  // 6. プロジェクトアイコンの検証
  const validIcons: Record<string, ProjectIconDoc> = {};
  for (const icon of rawIcons) {
    if (!icon || typeof icon.id !== 'string' || typeof icon.dataUrl !== 'string') continue;
    const check = validateProcessedIconDataUrl(icon.dataUrl, icon.byteSize);
    if (!check.valid) {
      warnings.push(`アイコン画像（ID: ${icon.id}）がサイズまたは形式制限を満たさないためスキップしました。`);
      continue;
    }
    validIcons[icon.id] = {
      id: icon.id,
      projectId: targetProjectId,
      targetKind: icon.targetKind === 'unlinkedPerson' ? 'unlinkedPerson' : 'group',
      targetId: icon.targetId,
      revision: typeof icon.revision === 'number' ? icon.revision : 1,
      mimeType: 'image/webp',
      width: 128,
      height: 128,
      byteSize: icon.byteSize,
      dataUrl: icon.dataUrl,
      updatedAt: now,
    };
  }

  const project: Project = {
    id: targetProjectId,
    name: raw.project.name.slice(0, 100),
    description:
      typeof raw.project.description === 'string' ? raw.project.description.slice(0, 1000) : '',
    ownerUid: currentOwnerUid,
    isPublic: Boolean(raw.project.isPublic),
    roleTags: Array.isArray(raw.project.roleTags) ? raw.project.roleTags : [],
    skillTags: Array.isArray(raw.project.skillTags) ? raw.project.skillTags : [],
    relationTags: Array.isArray(raw.project.relationTags) ? raw.project.relationTags : [],
    groupTags: Array.isArray(raw.project.groupTags) ? raw.project.groupTags : [],
    createdAt: now,
    updatedAt: now,
  };

  return {
    valid: true,
    warnings,
    bundle: {
      project,
      groups: validGroups,
      people: validPeople,
      memberships: validMemberships,
      relationships: validRelationships,
      diagrams: validDiagrams,
      projectIcons: validIcons,
    },
  };
}
