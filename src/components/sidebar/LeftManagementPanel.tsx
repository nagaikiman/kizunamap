import React, { useMemo, useState } from 'react';
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Eye,
  FolderGit2,
  GitCommitHorizontal,
  Layers,
  Lock,
  Pencil,
  Plus,
  Search,
  Settings,
  Tags,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import { useAppState } from '../../context/AppStateContext';
import { calculateGroupMemberCounts } from '../../utils/groupRules';
import {
  canCreateSelfPerson,
  canDeletePersonCard,
  canEditPersonCard,
  canManageRelationship,
  getPersonPrivilegeRole,
  resolvePersonView,
} from '../../utils/securityGuards';
import { generateUnfathomableId } from '../../utils/validation';
import { AvatarBadge } from '../common/AvatarBadge';

export type LeftSidebarTab = 'all' | 'people' | 'groups' | 'relations' | 'tags';

interface LeftManagementPanelProps {
  activeTab: LeftSidebarTab;
  onChangeTab: (tab: LeftSidebarTab) => void;
  searchQuery: string;
  onChangeSearchQuery: (q: string) => void;
  selectedEntityKey: string | null;
  onSelectEntityKey: (key: string | null) => void;
  onOpenPersonProfile: (personId: string) => void;
  onOpenPersonEditor: (personId?: string | null) => void;
  onOpenGroupDetail: (groupId: string) => void;
  onOpenGroupEditor: (groupId?: string | null, defaultParentId?: string | null) => void;
  onOpenRelationshipEditor: (relId?: string | null) => void;
  onOpenAdminSettings: (tab?: 'project' | 'members' | 'yaml' | 'testUsers') => void;
}

export const LeftManagementPanel: React.FC<LeftManagementPanelProps> = ({
  activeTab,
  onChangeTab,
  searchQuery,
  onChangeSearchQuery,
  selectedEntityKey,
  onSelectEntityKey,
  onOpenPersonProfile,
  onOpenPersonEditor,
  onOpenGroupDetail,
  onOpenGroupEditor,
  onOpenRelationshipEditor,
  onOpenAdminSettings,
}) => {
  const {
    currentBundle,
    actor,
    permissions,
    testUsers,
    userProfiles,
    profileIcons,
    deletePersonWithCascade,
    deleteRelationship,
    upsertTag,
    deleteTag,
  } = useAppState();

  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#2563eb');
  const [newTagCategory, setNewTagCategory] = useState<
    'roleTags' | 'skillTags' | 'relationTags' | 'groupTags'
  >('roleTags');
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editingTagName, setEditingTagName] = useState('');

  const groupCounts = useMemo(() => {
    if (!currentBundle) return {};
    return calculateGroupMemberCounts(
      currentBundle.groups,
      currentBundle.memberships,
      currentBundle.people
    );
  }, [currentBundle]);

  if (!currentBundle) return null;

  const q = searchQuery.trim().toLowerCase();

  // 人物リスト（ロール・所属バッジ付き）
  const filteredPeople = currentBundle.people.filter((p) => {
    if (!q) return true;
    if (p.displayName.toLowerCase().includes(q)) return true;
    const roleMatch = p.globalRoleIds.some((rid) =>
      currentBundle.project.roleTags
        .find((t) => t.id === rid)
        ?.name.toLowerCase()
        .includes(q)
    );
    const memMatch = currentBundle.memberships
      .filter((m) => m.personId === p.id)
      .some((m) => {
        const grp = currentBundle.groups.find((g) => g.id === m.groupId);
        const grpRoleMatch = m.roleIds.some((rid) =>
          currentBundle.project.roleTags
            .find((t) => t.id === rid)
            ?.name.toLowerCase()
            .includes(q)
        );
        return grp?.name.toLowerCase().includes(q) || grpRoleMatch;
      });
    return roleMatch || memMatch;
  });

  // 大グループと配下小グループの階層構造
  const largeGroups = currentBundle.groups.filter((g) => g.kind === 'large');
  const myLinkedPerson = currentBundle.people.find(
    (p) => actor.uid && p.linkedUid === actor.uid
  );
  const canAddSelfPerson = canCreateSelfPerson(actor, currentBundle);
  const effectiveTab: LeftSidebarTab =
    activeTab === 'tags' && !permissions.isEditor ? 'all' : activeTab;

  const toggleSection = (key: string) =>
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleAddTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagName.trim()) return;
    await upsertTag(newTagCategory, {
      id: generateUnfathomableId('tag'),
      name: newTagName.trim().slice(0, 40),
      color: newTagColor,
    });
    setNewTagName('');
  };

  return (
    <div className="flex h-full shrink-0 border-r border-slate-200 bg-white select-none">
      {/* 1. 左端ダークネイビー・アイコンレール（参考画像のデザインを踏襲） */}
      <aside className="w-14 bg-[#0f172a] text-slate-300 flex flex-col items-center py-3 justify-between shrink-0">
        <div className="flex flex-col items-center gap-3 w-full">
          {/* アプリシンボル */}
          <div
            className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black text-sm shadow-md mb-1"
            title="KizunaMap"
          >
            絆
          </div>

          {(
            [
              { id: 'all', label: 'すべて（ロール・所属・関係）', icon: Layers, editorOnly: false },
              { id: 'people', label: '人物・ロール一覧', icon: Users, editorOnly: false },
              { id: 'groups', label: 'グループ階層・所属管理', icon: Building2, editorOnly: false },
              { id: 'relations', label: '関係性管理', icon: GitCommitHorizontal, editorOnly: false },
              { id: 'tags', label: 'ロール・スキル・タグ管理（管理者・編集者用）', icon: Tags, editorOnly: true },
            ] as const
          )
            .filter((item) => !item.editorOnly || permissions.isEditor)
            .map((item) => {
              const Icon = item.icon;
              const active = effectiveTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onChangeTab(item.id)}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition ${
                    active
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                  title={item.label}
                >
                  <Icon size={18} />
                </button>
              );
            })}
        </div>

        <div className="flex flex-col items-center gap-2">
          {permissions.isAdmin && (
            <button
              type="button"
              onClick={() => onOpenAdminSettings('project')}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-800 hover:text-white transition"
              title="管理メニュー（プロジェクト設定・編集者任命・YAMLバックアップ・テストユーザー管理）"
              data-testid="sidebar-admin-settings-btn"
            >
              <Settings size={18} />
            </button>
          )}
        </div>
      </aside>

      {/* 2. 左管理パネル本体 */}
      <div className="w-[350px] md:w-[375px] flex flex-col h-full bg-slate-50/70">
        {/* 上部サブタブバー（[すべて] [人物・ロール] [グループ・所属] [関係性] [タグ（編集者以上のみ）]） */}
        <div className="bg-white border-b border-slate-200 px-3 pt-2.5 pb-2 space-y-2.5">
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
            {(
              [
                { id: 'all', label: 'すべて', editorOnly: false },
                { id: 'people', label: '人物・ロール', count: currentBundle.people.length, editorOnly: false },
                { id: 'groups', label: 'グループ・所属', count: currentBundle.groups.length, editorOnly: false },
                { id: 'relations', label: '関係性', count: currentBundle.relationships.length, editorOnly: false },
                { id: 'tags', label: 'タグ管理', editorOnly: true },
              ] as const
            )
              .filter((t) => !t.editorOnly || permissions.isEditor)
              .map((t) => {
                const active = effectiveTab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onChangeTab(t.id)}
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-extrabold transition whitespace-nowrap ${
                      active
                        ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span>{t.label}</span>
                    {'count' in t && t.count !== undefined && (
                      <span
                        className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                          active ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {t.count}
                      </span>
                    )}
                  </button>
                );
              })}
          </div>

          {/* 検索・絞り込みボックス */}
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              placeholder="人物名・ロール（役割）・所属グループで検索..."
              value={searchQuery}
              onChange={(e) => onChangeSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 py-1.5 text-xs focus:bg-white focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        {/* スクロール可能なカードリスト領域 */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {/* セクション1: 人物・ロール一覧 */}
          {(effectiveTab === 'all' || effectiveTab === 'people') && (
            <section className="rounded-2xl bg-white border border-slate-200/90 shadow-2xs overflow-hidden">
              <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-100 bg-slate-50/50">
                <button
                  type="button"
                  onClick={() => toggleSection('people')}
                  className="flex items-center gap-1.5 text-xs font-extrabold text-slate-800"
                >
                  <Users size={15} className="text-indigo-600" />
                  <span>人物・ロール</span>
                  <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                    {filteredPeople.length}人
                  </span>
                </button>

                <div className="flex items-center gap-1.5">
                  {permissions.isEditor ? (
                    <button
                      type="button"
                      onClick={() => onOpenPersonEditor(null)}
                      className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-indigo-700"
                      data-testid="add-person-btn"
                    >
                      <Plus size={12} /> 人物追加
                    </button>
                  ) : (
                    canAddSelfPerson && (
                      <button
                        type="button"
                        onClick={() => onOpenPersonEditor(null)}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700"
                        data-testid="add-self-person-btn"
                      >
                        <Plus size={12} /> 自分の人物追加
                      </button>
                    )
                  )}
                  <button
                    type="button"
                    onClick={() => toggleSection('people')}
                    className="p-1 text-slate-400 hover:text-slate-700"
                  >
                    {collapsedSections['people'] ? (
                      <ChevronRight size={15} />
                    ) : (
                      <ChevronDown size={15} />
                    )}
                  </button>
                </div>
              </div>

              {!collapsedSections['people'] && (
                <div className="p-2.5 space-y-2">
                  {filteredPeople.map((person) => {
                    const resolved = resolvePersonView(
                      person,
                      actor,
                      userProfiles,
                      profileIcons,
                      currentBundle.projectIcons
                    );
                    const globalRoles = person.globalRoleIds
                      .map((rid) => currentBundle.project.roleTags.find((t) => t.id === rid))
                      .filter(Boolean);

                    const personMems = currentBundle.memberships
                      .filter((m) => m.personId === person.id)
                      .map((m) => {
                        const grp = currentBundle.groups.find((g) => g.id === m.groupId);
                        const roles = m.roleIds
                          .map((rid) => currentBundle.project.roleTags.find((t) => t.id === rid))
                          .filter(Boolean);
                        return { grp, roles };
                      })
                      .filter((x) => x.grp !== undefined);

                    const isSelected = selectedEntityKey === `person:${person.id}`;
                    const privRole = getPersonPrivilegeRole(person, currentBundle, testUsers);
                    const isSelfCard = Boolean(actor.uid && person.linkedUid === actor.uid);
                    const canEditThisPerson = canEditPersonCard(actor, person, currentBundle);
                    const canDeleteThisPerson = canDeletePersonCard(
                      actor,
                      person,
                      currentBundle,
                      testUsers
                    );

                    return (
                      <div
                        key={person.id}
                        onClick={() => onSelectEntityKey(`person:${person.id}`)}
                        className={`relative rounded-xl border bg-white p-2.5 transition cursor-pointer flex flex-col gap-2 overflow-hidden ${
                          isSelected
                            ? 'border-indigo-500 ring-2 ring-indigo-100 bg-indigo-50/20'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                        style={{
                          borderLeftWidth: 5,
                          borderLeftColor: person.color,
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <AvatarBadge
                              name={resolved.effectiveDisplayName}
                              color={person.color}
                              iconDataUrl={resolved.iconDataUrl}
                              preset={resolved.avatarPreset}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs font-extrabold text-slate-900 truncate">
                                  {resolved.effectiveDisplayName}
                                </span>
                                {privRole === 'admin' && (
                                  <span className="rounded bg-indigo-100 px-1.5 py-0.2 text-[9px] font-extrabold text-indigo-800 shrink-0">
                                    管理者
                                  </span>
                                )}
                                {privRole === 'editor' && (
                                  <span className="rounded bg-sky-100 px-1.5 py-0.2 text-[9px] font-extrabold text-sky-800 shrink-0">
                                    編集者
                                  </span>
                                )}
                                {isSelfCard && (
                                  <span className="rounded bg-emerald-100 px-1.5 py-0.2 text-[9px] font-extrabold text-emerald-800 shrink-0">
                                    あなた
                                  </span>
                                )}
                                {resolved.linkStatus === 'linked_public' && (
                                  <span title="公開プロフィール連携済" className="inline-flex shrink-0">
                                    <UserCheck
                                      size={12}
                                      className="text-emerald-600"
                                    />
                                  </span>
                                )}
                                {resolved.linkStatus === 'linked_private' && (
                                  <span title="非公開プロフィール" className="inline-flex shrink-0">
                                    <Lock
                                      size={11}
                                      className="text-amber-600"
                                    />
                                  </span>
                                )}
                              </div>

                              {/* 全体ロールバッジ */}
                              <div className="flex flex-wrap gap-1 mt-0.5">
                                {globalRoles.map((r) =>
                                  r ? (
                                    <span
                                      key={r.id}
                                      className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white leading-none"
                                      style={{ backgroundColor: r.color }}
                                    >
                                      {r.name}
                                    </span>
                                  ) : null
                                )}
                              </div>
                            </div>
                          </div>

                          {/* アクションボタン群（権限に応じてペン・プロフィール・ゴミ箱ボタンを表示制御） */}
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenPersonProfile(person.id);
                              }}
                              className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
                              title="プロフィール・所属ロール詳細を表示"
                              data-testid={`open-profile-${person.id}`}
                            >
                              <Eye size={13} />
                            </button>
                            {canEditThisPerson && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenPersonEditor(person.id);
                                }}
                                className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100"
                                title={
                                  isSelfCard && !permissions.isEditor
                                    ? '自分の人物カード・所属ロールを編集'
                                    : '人物・所属ロールを編集'
                                }
                              >
                                <Pencil size={13} />
                              </button>
                            )}
                            {canDeleteThisPerson && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deletePersonWithCascade(person.id);
                                }}
                                className="rounded-lg border border-slate-200 bg-white p-1.5 text-rose-500 hover:bg-rose-50"
                                title={
                                  isSelfCard && !permissions.isEditor
                                    ? '自分の人物カードを削除（退会）'
                                    : '人物を削除'
                                }
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* 所属先ごとのロール一覧（メイン情報としてカード下部に常時表示） */}
                        {personMems.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1 border-t border-slate-100">
                            {personMems.map(({ grp, roles }, idx) => (
                              <span
                                key={idx}
                                className="inline-flex items-center gap-1 rounded-md bg-slate-50 border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700"
                              >
                                <span
                                  className="w-1.5 h-1.5 rounded-full"
                                  style={{ backgroundColor: grp!.color }}
                                />
                                <span>{grp!.name}:</span>
                                {roles.length > 0 ? (
                                  roles.map((r) =>
                                    r ? (
                                      <strong
                                        key={r.id}
                                        className="font-extrabold"
                                        style={{ color: r.color }}
                                      >
                                        {r.name}
                                      </strong>
                                    ) : null
                                  )
                                ) : (
                                  <span className="text-slate-400">メンバー</span>
                                )}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* セクション2: 大グループ・小グループ階層と所属ロール管理 */}
          {(effectiveTab === 'all' || effectiveTab === 'groups') && (
            <section className="rounded-2xl bg-white border border-slate-200/90 shadow-2xs overflow-hidden">
              <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-100 bg-slate-50/50">
                <button
                  type="button"
                  onClick={() => toggleSection('groups')}
                  className="flex items-center gap-1.5 text-xs font-extrabold text-slate-800"
                >
                  <FolderGit2 size={15} className="text-indigo-600" />
                  <span>グループ階層・所属ロール</span>
                  <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                    {currentBundle.groups.length}
                  </span>
                </button>

                <div className="flex items-center gap-1.5">
                  {permissions.isEditor && (
                    <button
                      type="button"
                      onClick={() => onOpenGroupEditor(null, null)}
                      className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-indigo-700"
                      data-testid="add-group-btn"
                    >
                      <Plus size={12} /> グループ追加
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleSection('groups')}
                    className="p-1 text-slate-400 hover:text-slate-700"
                  >
                    {collapsedSections['groups'] ? (
                      <ChevronRight size={15} />
                    ) : (
                      <ChevronDown size={15} />
                    )}
                  </button>
                </div>
              </div>

              {!collapsedSections['groups'] && (
                <div className="p-2.5 space-y-2.5">
                  {largeGroups.map((lg) => {
                    const lgCount = groupCounts[lg.id] || { directCount: 0, totalCount: 0 };
                    const childGroups = currentBundle.groups.filter(
                      (g) => g.kind === 'small' && g.parentGroupId === lg.id
                    );
                    const lgIcon = lg.iconId ? currentBundle.projectIcons[lg.iconId] : null;

                    return (
                      <div
                        key={lg.id}
                        className="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5 space-y-2"
                      >
                        {/* 大グループ行 */}
                        <div
                          onClick={() => onSelectEntityKey(`group:${lg.id}`)}
                          className="flex items-center justify-between gap-2 cursor-pointer"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <AvatarBadge
                              name={lg.name}
                              color={lg.color}
                              iconDataUrl={lgIcon?.dataUrl}
                              preset={lg.avatarPreset}
                              size="sm"
                              shape="rounded"
                            />
                            <div className="min-w-0">
                              <div className="text-xs font-extrabold text-slate-900 truncate">
                                {lg.name}
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-slate-500 font-semibold">
                                <span>直接: {lgCount.directCount}人</span>
                                <span className="text-indigo-700 font-bold">
                                  配下計: {lgCount.totalCount}人 (重複除外)
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenGroupDetail(lg.id);
                              }}
                              className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-indigo-50"
                              title="所属者と役割一覧を表示"
                            >
                              <Eye size={13} />
                            </button>
                            {permissions.isEditor && (
                              <>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenGroupEditor(null, lg.id);
                                  }}
                                  className="rounded-lg border border-slate-200 bg-white p-1.5 text-indigo-600 hover:bg-indigo-50"
                                  title="配下に小グループを追加"
                                >
                                  <Plus size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenGroupEditor(lg.id);
                                  }}
                                  className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100"
                                  title="大グループを編集"
                                >
                                  <Pencil size={13} />
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {/* 配下の小グループ一覧 */}
                        {childGroups.length > 0 && (
                          <div className="pl-3 border-l-2 border-slate-200 space-y-1.5">
                            {childGroups.map((sg) => {
                              const sgCount = groupCounts[sg.id]?.directCount ?? 0;
                              return (
                                <div
                                  key={sg.id}
                                  onClick={() => onSelectEntityKey(`group:${sg.id}`)}
                                  className="rounded-lg bg-white border border-slate-200 px-2.5 py-1.5 flex items-center justify-between gap-2 cursor-pointer hover:border-indigo-300"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span
                                      className="w-2.5 h-2.5 rounded-full shrink-0"
                                      style={{ backgroundColor: sg.color }}
                                    />
                                    <span className="text-xs font-bold text-slate-800 truncate">
                                      {sg.name}
                                    </span>
                                    <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[10px] font-bold text-slate-600 shrink-0">
                                      {sgCount}人
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onOpenGroupDetail(sg.id);
                                      }}
                                      className="p-1 text-slate-500 hover:text-indigo-600"
                                      title="小グループ詳細"
                                    >
                                      <Eye size={12} />
                                    </button>
                                    {permissions.isEditor && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onOpenGroupEditor(sg.id);
                                        }}
                                        className="p-1 text-slate-500 hover:text-slate-900"
                                        title="小グループ編集"
                                      >
                                        <Pencil size={12} />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* セクション3: 関係性一覧 */}
          {(effectiveTab === 'all' || effectiveTab === 'relations') && (
            <section className="rounded-2xl bg-white border border-slate-200/90 shadow-2xs overflow-hidden">
              <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-100 bg-slate-50/50">
                <button
                  type="button"
                  onClick={() => toggleSection('relations')}
                  className="flex items-center gap-1.5 text-xs font-extrabold text-slate-800"
                >
                  <GitCommitHorizontal size={15} className="text-indigo-600" />
                  <span>関係性</span>
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                    {currentBundle.relationships.length}関係
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => toggleSection('relations')}
                  className="p-1 text-slate-400 hover:text-slate-700"
                >
                  {collapsedSections['relations'] ? (
                    <ChevronRight size={15} />
                  ) : (
                    <ChevronDown size={15} />
                  )}
                </button>
              </div>

              {!collapsedSections['relations'] && (
                <div className="p-2.5 space-y-2">
                  {currentBundle.relationships.map((rel) => {
                    const srcEntity =
                      rel.sourceKind === 'person'
                        ? currentBundle.people.find((p) => p.id === rel.sourceId)
                        : currentBundle.groups.find((g) => g.id === rel.sourceId);
                    const tgtEntity =
                      rel.targetKind === 'person'
                        ? currentBundle.people.find((p) => p.id === rel.targetId)
                        : currentBundle.groups.find((g) => g.id === rel.targetId);

                    const srcName =
                      srcEntity && 'displayName' in srcEntity
                        ? srcEntity.displayName
                        : srcEntity?.name || '不明';
                    const tgtName =
                      tgtEntity && 'displayName' in tgtEntity
                        ? tgtEntity.displayName
                        : tgtEntity?.name || '不明';

                    const arrowText =
                      rel.direction === 'bidirectional'
                        ? '↔'
                        : rel.direction === 'none'
                        ? '―'
                        : '→';

                    return (
                      <div
                        key={rel.id}
                        className="rounded-xl border border-slate-200 bg-white p-2.5 flex items-center justify-between gap-2 hover:border-slate-300"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="flex -space-x-1.5 shrink-0">
                            <AvatarBadge
                              name={srcName}
                              color={srcEntity?.color || '#64748b'}
                              size="xs"
                            />
                            <AvatarBadge
                              name={tgtName}
                              color={tgtEntity?.color || '#3b82f6'}
                              size="xs"
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-extrabold text-slate-900 truncate">
                              {rel.label}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">
                              {srcName} {arrowText} {tgtName}
                            </div>
                          </div>
                        </div>

                        {canManageRelationship(actor, rel, currentBundle) && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => onOpenRelationshipEditor(rel.id)}
                              className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100"
                              title="関係線を編集"
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteRelationship(rel.id)}
                              className="rounded-lg border border-slate-200 bg-white p-1.5 text-rose-500 hover:bg-rose-50"
                              title="関係線を削除"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {(permissions.isEditor || Boolean(myLinkedPerson)) && (
                    <button
                      type="button"
                      onClick={() => onOpenRelationshipEditor(null)}
                      className="w-full rounded-xl border border-dashed border-indigo-300 bg-indigo-50/40 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100/60 transition flex items-center justify-center gap-1"
                    >
                      <Plus size={14} />{' '}
                      {permissions.isEditor ? '関係性を追加' : '自分の関係性を追加'}
                    </button>
                  )}
                </div>
              )}
            </section>
          )}

          {/* セクション4: タグ管理（管理者・編集者のみ表示・編集可能） */}
          {effectiveTab === 'tags' && permissions.isEditor && (
            <section className="rounded-2xl bg-white border border-slate-200 p-3.5 space-y-4">
              <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-800">
                <Tags size={15} className="text-indigo-600" />
                <span>ロール（役割）・スキル・関係タグの管理</span>
              </div>

              {permissions.isEditor && (
                <form onSubmit={handleAddTag} className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={newTagCategory}
                      onChange={(e) =>
                        setNewTagCategory(
                          e.target.value as
                            | 'roleTags'
                            | 'skillTags'
                            | 'relationTags'
                            | 'groupTags'
                        )
                      }
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-bold"
                    >
                      <option value="roleTags">役割・ロールタグ</option>
                      <option value="skillTags">スキルタグ</option>
                      <option value="relationTags">関係タグ</option>
                      <option value="groupTags">グループタグ</option>
                    </select>
                    <input
                      type="color"
                      value={newTagColor}
                      onChange={(e) => setNewTagColor(e.target.value)}
                      className="w-full h-8 rounded cursor-pointer border border-slate-300 bg-white"
                    />
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      required
                      placeholder="新しいタグ名を入力..."
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                    />
                    <button
                      type="submit"
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
                    >
                      追加
                    </button>
                  </div>
                </form>
              )}

              {(
                [
                  { key: 'roleTags', title: '役割・ロールタグ（全体＆所属先別）' },
                  { key: 'skillTags', title: 'スキルタグ' },
                  { key: 'relationTags', title: '関係タグ' },
                  { key: 'groupTags', title: 'グループタグ' },
                ] as const
              ).map((cat) => (
                <div key={cat.key} className="space-y-1.5">
                  <h4 className="text-[11px] font-bold text-slate-500">{cat.title}</h4>
                  <div className="space-y-1">
                    {currentBundle.project[cat.key].map((tag) => (
                      <div
                        key={tag.id}
                        className="flex items-center justify-between rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs"
                      >
                        {editingTagId === tag.id ? (
                          <div className="flex items-center gap-1.5 flex-1">
                            <input
                              type="text"
                              value={editingTagName}
                              onChange={(e) => setEditingTagName(e.target.value)}
                              className="flex-1 rounded border border-slate-300 px-2 py-0.5 text-xs"
                            />
                            <button
                              type="button"
                              onClick={async () => {
                                if (editingTagName.trim()) {
                                  await upsertTag(cat.key, {
                                    ...tag,
                                    name: editingTagName.trim(),
                                  });
                                }
                                setEditingTagId(null);
                              }}
                              className="rounded bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white"
                            >
                              保存
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2">
                              <span
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: tag.color }}
                              />
                              <span className="font-bold text-slate-800">{tag.name}</span>
                            </div>
                            {permissions.isEditor && (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingTagId(tag.id);
                                    setEditingTagName(tag.name);
                                  }}
                                  className="p-1 text-slate-400 hover:text-slate-700"
                                  title="タグ名称変更"
                                >
                                  <Pencil size={12} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteTag(cat.key, tag.id)}
                                  className="p-1 text-rose-400 hover:text-rose-600"
                                  title="タグ削除"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          )}
        </div>
      </div>
    </div>
  );
};
