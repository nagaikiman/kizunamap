import React, { useRef } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  ChevronDown,
  ChevronRight,
  Lock,
  UserCheck,
  Users,
} from 'lucide-react';
import type { Group, NodeDisplayStyle, Person, TagItem } from '../../types/domain';
import type { ResolvedPersonView } from '../../utils/securityGuards';
import { AvatarBadge } from '../common/AvatarBadge';

/**
 * シングルクリック（フォーカス）とダブルクリック／ダブルタップ（詳細モーダル起動）を判定するフック
 */
function useFocusAndOpenGesture(
  onFocus: () => void,
  onOpenDetail: () => void
): (e: React.MouseEvent) => void {
  const lastTapTimeRef = useRef<number>(0);

  return (e: React.MouseEvent) => {
    e.stopPropagation();
    const now = Date.now();
    const delta = now - lastTapTimeRef.current;
    lastTapTimeRef.current = now;

    if (delta > 0 && delta < 330) {
      // ダブルクリックまたはダブルタップ（330ms以内）で詳細モーダルを開く
      onOpenDetail();
    } else {
      // シングルクリックではフォーカス（強調）のみ当てる
      onFocus();
    }
  };
}

/**
 * カードの四方（上・右・下・左）すべてから関係線を出したり受けたり・付け替えたりできる共通結点（Handle）
 * ReactFlow の ConnectionMode.Loose と組み合わせることで、4点すべてが始点（source）・終点（target）の両方として機能します。
 */
const FourSideHandles: React.FC = () => (
  <>
    <Handle
      type="source"
      position={Position.Top}
      id="top"
      className="!w-3 !h-3 !bg-indigo-600 !border-2 !border-white hover:!scale-125 transition-transform"
    />
    <Handle
      type="source"
      position={Position.Right}
      id="right"
      className="!w-3 !h-3 !bg-indigo-600 !border-2 !border-white hover:!scale-125 transition-transform"
    />
    <Handle
      type="source"
      position={Position.Bottom}
      id="bottom"
      className="!w-3 !h-3 !bg-indigo-600 !border-2 !border-white hover:!scale-125 transition-transform"
    />
    <Handle
      type="source"
      position={Position.Left}
      id="left"
      className="!w-3 !h-3 !bg-indigo-600 !border-2 !border-white hover:!scale-125 transition-transform"
    />
  </>
);

// ============================================================================
// 1. 初期画面（所属中心 / mixedモード）専用：
//    グループ枠内に配置される人物ノード（名前のすぐ下に「ここでのロール」のみを表示）
// ============================================================================
export interface ScopedPersonNodeData extends Record<string, unknown> {
  person: Person;
  resolved: ResolvedPersonView;
  membershipId: string | null;
  groupId: string | null;
  groupName: string | null;
  rolesHere: TagItem[]; // ここでのロール（所属先グループでの役割）
  nodeStyle: NodeDisplayStyle;
  isHighlighted: boolean;
  isDimmed: boolean;
  onFocusPerson: (personId: string) => void;
  onOpenPerson: (personId: string) => void;
}

export const ScopedPersonFlowNode: React.FC<NodeProps> = ({ data }) => {
  const d = data as unknown as ScopedPersonNodeData;
  const { person, resolved, rolesHere, nodeStyle, isHighlighted, isDimmed } = d;

  const handleClick = useFocusAndOpenGesture(
    () => d.onFocusPerson(person.id),
    () => d.onOpenPerson(person.id)
  );

  const opacityClass = isDimmed ? 'opacity-30' : 'opacity-100';

  if (nodeStyle === 'compact') {
    return (
      <div
        onClick={handleClick}
        onContextMenu={(e) => e.preventDefault()}
        title="クリックでフォーカス / ダブルクリックで詳細プロフィールを開く"
        className={`group relative flex flex-col items-center cursor-pointer select-none transition-all ${opacityClass}`}
        data-testid={`person-node-${person.id}`}
      >
        <FourSideHandles />
        <AvatarBadge
          name={resolved.effectiveDisplayName}
          color={person.color}
          iconDataUrl={resolved.iconDataUrl}
          preset={resolved.avatarPreset}
          size="md"
          className={isHighlighted ? 'ring-3 ring-indigo-600 scale-105' : ''}
        />
        <div className="mt-1 rounded-md bg-white px-2.5 py-0.5 text-[11px] font-extrabold text-slate-900 border border-slate-300 shadow-2xs whitespace-nowrap">
          {resolved.effectiveDisplayName}
        </div>
        {/* 名前の下に「ここでのロール」を表示 */}
        <div className="mt-0.5 flex flex-wrap justify-center gap-0.5 max-w-[165px]">
          {rolesHere.length > 0 ? (
            rolesHere.map((r) => (
              <span
                key={r.id}
                className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white leading-none"
                style={{ backgroundColor: r.color }}
              >
                {r.name}
              </span>
            ))
          ) : (
            <span className="text-[10px] text-slate-500 font-medium">メンバー</span>
          )}
        </div>
      </div>
    );
  }

  // 標準カード型（名前の下に「ここでのロール」をスッキリ表示）
  return (
    <div
      onClick={handleClick}
      onContextMenu={(e) => e.preventDefault()}
      title="クリックでフォーカス / ダブルクリックで詳細プロフィールを開く"
      className={`relative w-[184px] rounded-xl bg-white border-2 px-3 py-2 shadow-xs cursor-pointer select-none transition-all ${
        isHighlighted
          ? 'ring-3 ring-indigo-600 border-indigo-600 shadow-md'
          : 'hover:border-slate-400'
      } ${opacityClass}`}
      style={{
        borderColor: isHighlighted ? '#4f46e5' : `${person.color}99`,
      }}
      data-testid={`person-node-${person.id}`}
    >
      <FourSideHandles />

      {/* 上段：アイコン＋名前 */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="relative shrink-0">
          <AvatarBadge
            name={resolved.effectiveDisplayName}
            color={person.color}
            iconDataUrl={resolved.iconDataUrl}
            preset={resolved.avatarPreset}
            size="sm"
          />
          {resolved.linkStatus === 'linked_public' && (
            <span
              className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-white ring-1 ring-white"
              title="公開プロフィール"
            >
              <UserCheck size={8} />
            </span>
          )}
          {resolved.linkStatus === 'linked_private' && (
            <span
              className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-white ring-1 ring-white"
              title="非公開プロフィール"
            >
              <Lock size={8} />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-extrabold text-slate-900 truncate">
            {resolved.effectiveDisplayName}
          </div>
        </div>
      </div>

      {/* 下段：名前のすぐ下に「ここでのロール」を表示 */}
      <div className="mt-1.5 pt-1.5 border-t border-slate-100 flex flex-wrap gap-1">
        {rolesHere.length > 0 ? (
          rolesHere.map((r) => (
            <span
              key={r.id}
              className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold text-white leading-tight"
              style={{ backgroundColor: r.color }}
            >
              {r.name}
            </span>
          ))
        ) : (
          <span className="text-[10px] font-semibold text-slate-400">役割未設定（メンバー）</span>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// 2. 人物図（人中心 / peopleモード）専用：
//    人名の「右脇」に所属しているグループとロールをずらっと並べて表示
// ============================================================================
export interface PersonNodeData extends Record<string, unknown> {
  person: Person;
  resolved: ResolvedPersonView;
  globalRoles: TagItem[];
  skills: TagItem[];
  groupMemberships: {
    groupId: string;
    groupName: string;
    groupColor: string;
    roles: TagItem[];
  }[];
  nodeStyle: NodeDisplayStyle;
  isHighlighted: boolean;
  isDimmed: boolean;
  onFocusPerson: (personId: string) => void;
  onOpenPerson: (personId: string) => void;
}

export const PersonFlowNode: React.FC<NodeProps> = ({ data }) => {
  const d = data as unknown as PersonNodeData;
  const { person, resolved, globalRoles, groupMemberships, nodeStyle, isHighlighted, isDimmed } = d;

  const handleClick = useFocusAndOpenGesture(
    () => d.onFocusPerson(person.id),
    () => d.onOpenPerson(person.id)
  );

  const opacityClass = isDimmed ? 'opacity-30' : 'opacity-100';

  if (nodeStyle === 'compact') {
    return (
      <div
        onClick={handleClick}
        title="クリックでフォーカス / ダブルクリックで詳細プロフィールを開く"
        className={`relative rounded-xl bg-white border-2 px-3 py-2 shadow-xs transition-all cursor-pointer select-none flex items-center gap-2.5 ${
          isHighlighted ? 'ring-3 ring-indigo-500 shadow-lg' : 'hover:shadow-md'
        } ${opacityClass}`}
        style={{
          borderColor: isHighlighted ? '#4f46e5' : person.color,
          minWidth: 180,
          maxWidth: 280,
        }}
        data-testid={`person-node-${person.id}`}
      >
        <FourSideHandles />
        <AvatarBadge
          name={resolved.effectiveDisplayName}
          color={person.color}
          iconDataUrl={resolved.iconDataUrl}
          preset={resolved.avatarPreset}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-extrabold text-slate-900 truncate">
            {resolved.effectiveDisplayName}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-1">
            {groupMemberships.length > 0 ? (
              groupMemberships.map((gm) => (
                <span
                  key={gm.groupId}
                  className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700"
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: gm.groupColor }}
                  />
                  {gm.groupName}
                </span>
              ))
            ) : (
              <span className="text-[10px] text-slate-400">未所属</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={handleClick}
      title="クリックでフォーカス / ダブルクリックで詳細プロフィールを開く"
      className={`relative rounded-2xl bg-white border-2 shadow-sm transition-all cursor-pointer select-none ${
        isHighlighted ? 'ring-3 ring-indigo-500 shadow-xl' : 'hover:shadow-md'
      } ${opacityClass}`}
      style={{
        borderColor: isHighlighted ? '#4f46e5' : person.color,
        minWidth: 310,
        maxWidth: 420,
      }}
      data-testid={`person-node-${person.id}`}
    >
      <FourSideHandles />

      {/* 左側に人物アイコン＆名前、その右脇に所属グループとロールをずらっと並べる横並び構造 */}
      <div className="flex items-stretch rounded-[14px] overflow-hidden">
        <div
          className="w-[138px] shrink-0 p-3 flex flex-col items-center justify-center text-center border-r border-slate-200"
          style={{ background: `linear-gradient(155deg, ${person.color}18, #ffffff)` }}
        >
          <div className="relative">
            <AvatarBadge
              name={resolved.effectiveDisplayName}
              color={person.color}
              iconDataUrl={resolved.iconDataUrl}
              preset={resolved.avatarPreset}
              size="md"
            />
            {resolved.linkStatus === 'linked_public' && (
              <span
                className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-white ring-1 ring-white"
                title="公開プロフィール"
              >
                <UserCheck size={9} />
              </span>
            )}
            {resolved.linkStatus === 'linked_private' && (
              <span
                className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-white ring-1 ring-white"
                title="非公開プロフィール"
              >
                <Lock size={8} />
              </span>
            )}
          </div>

          <div className="mt-1.5 text-xs font-extrabold text-slate-900 leading-snug break-words w-full">
            {resolved.effectiveDisplayName}
          </div>

          {globalRoles.length > 0 && (
            <div className="mt-1 flex flex-wrap justify-center gap-0.5">
              {globalRoles.map((r) => (
                <span
                  key={r.id}
                  className="rounded px-1.5 py-0.5 text-[9px] font-bold text-white leading-none"
                  style={{ backgroundColor: r.color }}
                >
                  {r.name}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 右脇カラム：所属しているグループとそこでのロールをずらっと一覧表示 */}
        <div className="flex-1 p-2.5 bg-white flex flex-col justify-center space-y-1.5">
          <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
            所属グループ / 役割（ロール）
          </div>
          {groupMemberships.length > 0 ? (
            <div className="space-y-1.5">
              {groupMemberships.map((gm) => (
                <div
                  key={gm.groupId}
                  className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-1.5"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: gm.groupColor }}
                    />
                    <span className="text-[11px] font-extrabold text-slate-800 truncate">
                      {gm.groupName}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 justify-end shrink-0">
                    {gm.roles.length > 0 ? (
                      gm.roles.map((r) => (
                        <span
                          key={r.id}
                          className="rounded px-1.5 py-0.5 text-[10px] font-extrabold text-white leading-none"
                          style={{ backgroundColor: r.color }}
                        >
                          {r.name}
                        </span>
                      ))
                    ) : (
                      <span className="text-[10px] text-slate-400 font-semibold">メンバー</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[11px] text-slate-400 py-1">所属グループなし</div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 3. 大グループ・小グループの入れ子コンテナ枠ノード
// ============================================================================
export interface GroupContainerNodeData extends Record<string, unknown> {
  group: Group;
  iconDataUrl: string | null;
  directCount: number;
  totalCount: number;
  width: number;
  height: number;
  viewMode: 'mixed' | 'groups';
  embeddedMembers: {
    personId: string;
    displayName: string;
    personColor: string;
    iconDataUrl: string | null;
    avatarPreset: string;
    roles: TagItem[];
  }[];
  isCollapsed: boolean;
  hasChildren: boolean;
  isDropTarget: boolean;
  isCopyDropTarget: boolean;
  isHighlighted: boolean;
  isDimmed: boolean;
  onFocusGroup: (groupId: string) => void;
  onOpenGroup: (groupId: string) => void;
  onFocusPerson: (personId: string) => void;
  onOpenPerson: (personId: string) => void;
  onToggleCollapse: (groupId: string) => void;
}

export const GroupFlowNode: React.FC<NodeProps> = ({ data }) => {
  const d = data as unknown as GroupContainerNodeData;
  const {
    group,
    iconDataUrl,
    directCount,
    totalCount,
    width,
    height,
    viewMode,
    embeddedMembers,
    isCollapsed,
    hasChildren,
    isDropTarget,
    isCopyDropTarget,
    isHighlighted,
    isDimmed,
  } = d;

  const handleGroupClick = useFocusAndOpenGesture(
    () => d.onFocusGroup(group.id),
    () => d.onOpenGroup(group.id)
  );

  const lastMemberTapRef = useRef<{ personId: string; time: number }>({
    personId: '',
    time: 0,
  });

  const handleMemberRowClick = (e: React.MouseEvent, personId: string) => {
    e.stopPropagation();
    const now = Date.now();
    const prev = lastMemberTapRef.current;
    lastMemberTapRef.current = { personId, time: now };

    if (prev.personId === personId && now - prev.time < 330) {
      d.onOpenPerson(personId);
    } else {
      d.onFocusPerson(personId);
    }
  };

  const isLarge = group.kind === 'large';
  const opacityClass = isDimmed ? 'opacity-35' : 'opacity-100';

  const dropHighlightClass = isCopyDropTarget
    ? 'ring-4 ring-emerald-500 bg-emerald-50/40'
    : isDropTarget
    ? 'ring-4 ring-indigo-500 bg-indigo-50/40'
    : isHighlighted
    ? 'ring-3 ring-indigo-500'
    : '';

  return (
    <div
      onClick={handleGroupClick}
      title="クリックでフォーカス / ダブルクリックでグループ詳細を開く"
      style={{
        width,
        height,
        borderColor: group.color,
        backgroundColor: isLarge ? `${group.color}0A` : '#ffffff',
      }}
      className={`relative rounded-xl border-2 transition-colors select-none ${
        isLarge ? 'shadow-sm' : 'shadow-2xs'
      } ${dropHighlightClass} ${opacityClass}`}
      data-testid={`group-node-${group.id}`}
    >
      <FourSideHandles />

      {/* コンテナ枠の左上ヘッダーバー */}
      <div
        className="flex items-center justify-between px-3 py-1.5 border-b rounded-t-[10px]"
        style={{
          borderColor: `${group.color}44`,
          backgroundColor: isLarge ? `${group.color}18` : `${group.color}12`,
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <AvatarBadge
            name={group.name}
            color={group.color}
            iconDataUrl={iconDataUrl}
            preset={group.avatarPreset}
            size="xs"
            shape="rounded"
          />
          <span className="text-xs font-extrabold text-slate-900 truncate">{group.name}</span>
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white leading-none shrink-0"
            style={{ backgroundColor: group.color }}
          >
            {isLarge ? '大グループ' : '小グループ'}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-bold text-slate-600 flex items-center gap-1 bg-white/80 px-2 py-0.5 rounded-full border border-slate-200">
            <Users size={11} />
            直下 {directCount}人{isLarge ? ` / 配下計 ${totalCount}人` : ''}
          </span>

          {isLarge && hasChildren && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                d.onToggleCollapse(group.id);
              }}
              className="rounded bg-white/80 hover:bg-white p-0.5 text-slate-700 border border-slate-300"
              title={isCollapsed ? '小グループを展開' : '小グループを折りたたむ'}
              data-testid={`toggle-collapse-${group.id}`}
            >
              {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
        </div>
      </div>

      {/* ドロップ操作中のガイド表示 */}
      {(isDropTarget || isCopyDropTarget) && (
        <div
          className={`absolute top-10 right-3 z-20 rounded-lg px-2.5 py-1 text-[11px] font-extrabold text-white shadow-md ${
            isCopyDropTarget ? 'bg-emerald-600' : 'bg-indigo-600'
          }`}
        >
          {isCopyDropTarget
            ? `＋「${group.name}」へ所属をコピー（複数所属）`
            : `→「${group.name}」へ所属を移動`}
        </div>
      )}

      {/* グループ図（グループ中心 / groupsモード）のとき：直下メンバーとロールを枠内にずらっと表示 */}
      {viewMode === 'groups' && (
        <div className="p-3 space-y-1.5">
          <div className="text-[10px] font-extrabold text-slate-500">
            {isLarge ? '大グループ直下メンバー・役割' : '小グループ所属メンバー・役割'}
          </div>
          {embeddedMembers.length > 0 ? (
            <div className="grid grid-cols-1 gap-1.5">
              {embeddedMembers.map((m) => (
                <div
                  key={m.personId}
                  onClick={(e) => handleMemberRowClick(e, m.personId)}
                  title="クリックでフォーカス / ダブルクリックで詳細プロフィールを開く"
                  className="flex items-center justify-between gap-2 rounded-lg bg-white border border-slate-200 px-2.5 py-1.5 shadow-2xs hover:border-indigo-400 cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <AvatarBadge
                      name={m.displayName}
                      color={m.personColor}
                      iconDataUrl={m.iconDataUrl}
                      preset={m.avatarPreset}
                      size="xs"
                    />
                    <span className="text-xs font-extrabold text-slate-900 truncate">
                      {m.displayName}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 justify-end shrink-0">
                    {m.roles.length > 0 ? (
                      m.roles.map((r) => (
                        <span
                          key={r.id}
                          className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white leading-none"
                          style={{ backgroundColor: r.color }}
                        >
                          {r.name}
                        </span>
                      ))
                    ) : (
                      <span className="text-[10px] text-slate-400 font-semibold">メンバー</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[11px] text-slate-400 py-1">直下メンバーなし</div>
          )}
        </div>
      )}
    </div>
  );
};
