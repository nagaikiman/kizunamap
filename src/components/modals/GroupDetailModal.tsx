import React from 'react';
import {
  Building2,
  ChevronDown,
  ChevronRight,
  FolderGit2,
  Link2,
  Pencil,
  Users,
  X,
} from 'lucide-react';
import { useAppState } from '../../context/AppStateContext';
import { calculateGroupMemberCounts } from '../../utils/groupRules';
import { resolvePersonView } from '../../utils/securityGuards';
import { AvatarBadge } from '../common/AvatarBadge';

interface GroupDetailModalProps {
  groupId: string;
  onClose: () => void;
  onSelectPerson: (personId: string) => void;
  onEditGroup?: (groupId: string) => void;
}

export const GroupDetailModal: React.FC<GroupDetailModalProps> = ({
  groupId,
  onClose,
  onSelectPerson,
  onEditGroup,
}) => {
  const {
    currentBundle,
    actor,
    permissions,
    userProfiles,
    profileIcons,
    activeDiagram,
    toggleGroupCollapse,
  } = useAppState();

  if (!currentBundle) return null;
  const group = currentBundle.groups.find((g) => g.id === groupId);
  if (!group) return null;

  const countsMap = calculateGroupMemberCounts(
    currentBundle.groups,
    currentBundle.memberships,
    currentBundle.people
  );
  const groupCount = countsMap[group.id] || {
    directCount: 0,
    totalCount: 0,
    directPersonIds: [],
    totalUniquePersonIds: [],
  };

  const parentGroup =
    group.kind === 'small' && group.parentGroupId
      ? currentBundle.groups.find((g) => g.id === group.parentGroupId)
      : null;

  const childSmallGroups =
    group.kind === 'large'
      ? currentBundle.groups.filter((g) => g.kind === 'small' && g.parentGroupId === group.id)
      : [];

  const groupIcon = group.iconId ? currentBundle.projectIcons[group.iconId] : null;
  const isCollapsed = Boolean(activeDiagram?.collapsedGroupIds.includes(group.id));

  // このグループへの直接所属メンバーと、そのグループでの役割一覧
  const directMembers = currentBundle.memberships
    .filter((m) => m.groupId === group.id)
    .map((m) => {
      const person = currentBundle.people.find((p) => p.id === m.personId);
      if (!person) return null;
      const resolved = resolvePersonView(
        person,
        actor,
        userProfiles,
        profileIcons,
        currentBundle.projectIcons
      );
      const roles = m.roleIds
        .map((rid) => currentBundle.project.roleTags.find((t) => t.id === rid))
        .filter(Boolean);
      return {
        membership: m,
        person,
        resolved,
        roles,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  // 配下の小グループごとの所属者と役割一覧
  const childGroupDetails = childSmallGroups.map((child) => {
    const childMembers = currentBundle.memberships
      .filter((m) => m.groupId === child.id)
      .map((m) => {
        const person = currentBundle.people.find((p) => p.id === m.personId);
        if (!person) return null;
        const resolved = resolvePersonView(
          person,
          actor,
          userProfiles,
          profileIcons,
          currentBundle.projectIcons
        );
        const roles = m.roleIds
          .map((rid) => currentBundle.project.roleTags.find((t) => t.id === rid))
          .filter(Boolean);
        return {
          membership: m,
          person,
          resolved,
          roles,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
    return {
      child,
      count: countsMap[child.id]?.directCount ?? 0,
      members: childMembers,
    };
  });

  // このグループが関わる関係性（グループ↔グループ、グループ↔人物）
  const relatedRelationships = currentBundle.relationships
    .filter(
      (r) =>
        (r.sourceKind === 'group' && r.sourceId === group.id) ||
        (r.targetKind === 'group' && r.targetId === group.id)
    )
    .map((r) => {
      const isSource = r.sourceKind === 'group' && r.sourceId === group.id;
      const otherKind = isSource ? r.targetKind : r.sourceKind;
      const otherId = isSource ? r.targetId : r.sourceId;

      let otherName = '不明';
      let otherColor = '#64748b';
      if (otherKind === 'person') {
        const op = currentBundle.people.find((p) => p.id === otherId);
        if (op) {
          const opResolved = resolvePersonView(
            op,
            actor,
            userProfiles,
            profileIcons,
            currentBundle.projectIcons
          );
          otherName = opResolved.effectiveDisplayName;
          otherColor = op.color;
        }
      } else {
        const og = currentBundle.groups.find((g) => g.id === otherId);
        if (og) {
          otherName = og.name;
          otherColor = og.color;
        }
      }

      const directionSymbol =
        r.direction === 'bidirectional'
          ? '⇄'
          : r.direction === 'none'
          ? '―'
          : isSource
          ? '→'
          : '←';

      return {
        rel: r,
        otherKind,
        otherId,
        otherName,
        otherColor,
        directionSymbol,
      };
    });

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[90vh] flex flex-col">
        {/* ヘッダー */}
        <div
          className="px-6 py-4 flex items-center justify-between border-b border-slate-100"
          style={{ background: `linear-gradient(135deg, ${group.color}16, #ffffff)` }}
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <AvatarBadge
              name={group.name}
              color={group.color}
              iconDataUrl={groupIcon?.dataUrl}
              preset={group.avatarPreset}
              size="lg"
              shape="rounded"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="rounded-md px-2 py-0.5 text-[11px] font-extrabold text-white"
                  style={{ backgroundColor: group.color }}
                >
                  {group.kind === 'large' ? '大グループ' : '小グループ'}
                </span>
                {parentGroup && (
                  <span className="text-xs font-semibold text-slate-500">
                    親: {parentGroup.name}
                  </span>
                )}
              </div>
              <h2 className="text-lg font-extrabold text-slate-900 truncate mt-0.5">
                {group.name}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {group.kind === 'large' && activeDiagram && (
              <button
                type="button"
                onClick={() => toggleGroupCollapse(activeDiagram.id, group.id)}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                {isCollapsed ? '配下小グループを展開' : '配下小グループを折りたたむ'}
              </button>
            )}
            {permissions.isEditor && onEditGroup && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEditGroup(group.id);
                }}
                className="inline-flex items-center gap-1 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
              >
                <Pencil size={13} /> グループ編集
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* コンテンツ */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {group.description && (
            <p className="text-xs text-slate-600 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              {group.description}
            </p>
          )}

          {/* 人数サマリ（重複除外カウント明示） */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-slate-500 block">
                  このグループへの直接所属人数
                </span>
                <span className="text-[10px] text-slate-400">
                  （小グループ所属と大グループ直接所属は別管理）
                </span>
              </div>
              <span className="text-xl font-extrabold text-slate-900">
                {groupCount.directCount} <span className="text-xs font-semibold">人</span>
              </span>
            </div>

            {group.kind === 'large' && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-indigo-900 block">
                    配下小グループを含む合計人数
                  </span>
                  <span className="text-[10px] text-indigo-700">
                    （複数所属の同一人物は重複カウントせず1人として集計）
                  </span>
                </div>
                <span className="text-xl font-extrabold text-indigo-700">
                  {groupCount.totalCount} <span className="text-xs font-semibold">人</span>
                </span>
              </div>
            )}
          </div>

          {/* 直接所属メンバーと役割一覧 */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Users size={14} className="text-indigo-600" />
              直接所属メンバーとこのグループでの役割（{directMembers.length}名）
            </h3>

            {directMembers.length > 0 ? (
              <div className="grid grid-cols-1 gap-2">
                {directMembers.map(({ membership, person, resolved, roles }) => (
                  <div
                    key={membership.id}
                    onClick={() => {
                      onClose();
                      onSelectPerson(person.id);
                    }}
                    className="cursor-pointer rounded-xl border border-slate-200 bg-white p-3 hover:border-indigo-300 hover:bg-indigo-50/20 transition flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <AvatarBadge
                        name={resolved.effectiveDisplayName}
                        color={person.color}
                        iconDataUrl={resolved.iconDataUrl}
                        preset={resolved.avatarPreset}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-slate-900 truncate">
                          {resolved.effectiveDisplayName}
                        </div>
                        {membership.memo && (
                          <div className="text-[11px] text-slate-500 truncate">
                            {membership.memo}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1 justify-end">
                      {roles.length > 0 ? (
                        roles.map((r) =>
                          r ? (
                            <span
                              key={r.id}
                              className="rounded-md px-2 py-0.5 text-[11px] font-bold text-white"
                              style={{ backgroundColor: r.color }}
                            >
                              {r.name}
                            </span>
                          ) : null
                        )
                      ) : (
                        <span className="text-[11px] text-slate-400">役割未設定</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
                このグループへの直接所属者はいません
              </div>
            )}
          </div>

          {/* 大グループの場合：配下小グループと所属者・役割一覧 */}
          {group.kind === 'large' && childGroupDetails.length > 0 && (
            <div className="space-y-3 pt-2">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <FolderGit2 size={14} className="text-indigo-600" />
                配下の小グループ（{childGroupDetails.length}グループ）
              </h3>

              {childGroupDetails.map(({ child, count, members }) => (
                <div
                  key={child.id}
                  className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: child.color }}
                      />
                      <span className="text-sm font-bold text-slate-800">{child.name}</span>
                    </div>
                    <span className="text-xs font-bold text-slate-600 bg-white px-2.5 py-0.5 rounded-full border border-slate-200">
                      所属 {count}人
                    </span>
                  </div>

                  {members.length > 0 ? (
                    <div className="grid grid-cols-1 gap-1.5">
                      {members.map(({ membership, person, resolved, roles }) => (
                        <div
                          key={membership.id}
                          onClick={() => {
                            onClose();
                            onSelectPerson(person.id);
                          }}
                          className="cursor-pointer rounded-lg bg-white border border-slate-200 px-3 py-2 flex items-center justify-between hover:border-indigo-300"
                        >
                          <div className="flex items-center gap-2">
                            <AvatarBadge
                              name={resolved.effectiveDisplayName}
                              color={person.color}
                              iconDataUrl={resolved.iconDataUrl}
                              preset={resolved.avatarPreset}
                              size="xs"
                            />
                            <span className="text-xs font-bold text-slate-800">
                              {resolved.effectiveDisplayName}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {roles.map((r) =>
                              r ? (
                                <span
                                  key={r.id}
                                  className="rounded px-2 py-0.5 text-[10px] font-bold text-white"
                                  style={{ backgroundColor: r.color }}
                                >
                                  {r.name}
                                </span>
                              ) : null
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">所属者なし</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* このグループが関わる関係性（グループ間・グループと人物の関係性） */}
          <div className="space-y-2.5 pt-2">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Link2 size={14} className="text-indigo-600" />
              登録されている関係性（グループ・人物との関係：{relatedRelationships.length}件）
            </h3>
            {relatedRelationships.length > 0 ? (
              <div className="grid grid-cols-1 gap-2">
                {relatedRelationships.map(
                  ({ rel, otherKind, otherName, otherColor, directionSymbol }) => (
                    <div
                      key={rel.id}
                      className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 flex items-center justify-between gap-3 flex-wrap"
                    >
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                        <span className="text-slate-600">{group.name}</span>
                        <span
                          className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-extrabold text-white"
                          style={{ backgroundColor: rel.color || '#475569' }}
                        >
                          {directionSymbol} {rel.label}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: otherColor }}
                          />
                          <span>{otherName}</span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                            {otherKind === 'group' ? 'グループ' : '人物'}
                          </span>
                        </span>
                      </div>
                      {rel.memo && (
                        <span className="text-[11px] text-slate-500">{rel.memo}</span>
                      )}
                    </div>
                  )
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 p-3.5 text-center text-xs text-slate-400">
                登録されている関係性はありません
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
