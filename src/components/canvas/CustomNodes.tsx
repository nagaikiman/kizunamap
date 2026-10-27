import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Lock,
  UserCheck,
  Users,
} from 'lucide-react';
import type { Group, NodeDisplayStyle, Person, TagItem } from '../../types/domain';
import type { ResolvedPersonView } from '../../utils/securityGuards';
import { AvatarBadge } from '../common/AvatarBadge';

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
  onSelectPerson: (personId: string) => void;
}

export interface GroupNodeData extends Record<string, unknown> {
  group: Group;
  parentGroupName: string | null;
  iconDataUrl: string | null;
  directCount: number;
  totalCount: number;
  roleSummary: { roleName: string; roleColor: string; count: number }[];
  isCollapsed: boolean;
  hasChildren: boolean;
  isHighlighted: boolean;
  isDimmed: boolean;
  onSelectGroup: (groupId: string) => void;
  onToggleCollapse: (groupId: string) => void;
}

/**
 * 人物ノード（ツールバーの「カード表示 / コンパクト表示」に応じて2種類のスタイルで描画）
 * ロール（全体ロールおよび所属先ごとのロール）が主役として一目で分かるデザイン
 */
export const PersonFlowNode: React.FC<NodeProps> = ({ data }) => {
  const d = data as unknown as PersonNodeData;
  const { person, resolved, globalRoles, groupMemberships, nodeStyle, isHighlighted, isDimmed } = d;

  const opacityClass = isDimmed ? 'opacity-30' : 'opacity-100';
  const ringClass = isHighlighted
    ? 'ring-3 ring-indigo-500 shadow-xl scale-[1.02]'
    : 'hover:shadow-md';

  // スタイルB: コンパクト表示（参考画像に近い丸アイコン＋ピル型名前＋主要ロールバッジ）
  if (nodeStyle === 'compact') {
    return (
      <div
        onClick={(e) => {
          e.stopPropagation();
          d.onSelectPerson(person.id);
        }}
        className={`group relative flex flex-col items-center cursor-pointer transition-all duration-150 ${opacityClass}`}
        data-testid={`person-node-${person.id}`}
      >
        <Handle
          type="target"
          position={Position.Top}
          className="!w-2.5 !h-2.5 !bg-slate-400 !border-white"
        />
        <Handle
          type="target"
          position={Position.Left}
          id="left-target"
          className="!w-2.5 !h-2.5 !bg-slate-400 !border-white"
        />

        <div className="relative">
          <AvatarBadge
            name={resolved.effectiveDisplayName}
            color={person.color}
            iconDataUrl={resolved.iconDataUrl}
            preset={resolved.avatarPreset}
            size="lg"
            className={`transition-transform ${
              isHighlighted ? 'ring-3 ring-indigo-500 scale-105' : 'group-hover:scale-105'
            }`}
          />
          {resolved.linkStatus === 'linked_public' && (
            <span
              className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white ring-2 ring-white"
              title="公開プロフィール連携済"
            >
              <UserCheck size={10} />
            </span>
          )}
          {resolved.linkStatus === 'linked_private' && (
            <span
              className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-white ring-2 ring-white"
              title="非公開プロフィール"
            >
              <Lock size={9} />
            </span>
          )}
        </div>

        {/* ピル型名前ラベル */}
        <div className="mt-1.5 rounded-full bg-white px-3 py-0.5 text-xs font-extrabold text-slate-800 shadow-sm border border-slate-200 whitespace-nowrap">
          {resolved.effectiveDisplayName}
        </div>

        {/* ロール強調バッジ（メイン表示） */}
        <div className="mt-1 flex flex-wrap justify-center gap-1 max-w-[190px]">
          {globalRoles.map((r) => (
            <span
              key={r.id}
              className="rounded-md px-2 py-0.5 text-[10px] font-extrabold text-white shadow-2xs"
              style={{ backgroundColor: r.color }}
            >
              {r.name}
            </span>
          ))}
          {groupMemberships.map((gm) =>
            gm.roles.map((r) => (
              <span
                key={`${gm.groupId}-${r.id}`}
                className="rounded-md px-1.5 py-0.5 text-[10px] font-bold border bg-white/95"
                style={{ borderColor: gm.groupColor, color: gm.groupColor }}
              >
                {gm.groupName}: {r.name}
              </span>
            ))
          )}
        </div>

        <Handle
          type="source"
          position={Position.Bottom}
          className="!w-2.5 !h-2.5 !bg-indigo-500 !border-white"
        />
        <Handle
          type="source"
          position={Position.Right}
          id="right-source"
          className="!w-2.5 !h-2.5 !bg-indigo-500 !border-white"
        />
      </div>
    );
  }

  // スタイルA: リッチカード表示（デフォルト：丸アイコン＋名前＋全体ロール＋所属グループ別ロール一覧）
  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        d.onSelectPerson(person.id);
      }}
      className={`w-[236px] rounded-2xl bg-white border-2 shadow-sm transition-all duration-150 cursor-pointer overflow-hidden ${ringClass} ${opacityClass}`}
      style={{ borderColor: isHighlighted ? '#4f46e5' : `${person.color}88` }}
      data-testid={`person-node-${person.id}`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-slate-500 !border-2 !border-white"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left-target"
        className="!w-3 !h-3 !bg-slate-500 !border-2 !border-white"
      />

      {/* 上部カラーバー＆人物ヘッダー */}
      <div
        className="px-3 py-2.5 flex items-center gap-2.5 border-b border-slate-100"
        style={{ background: `linear-gradient(135deg, ${person.color}18, #ffffff)` }}
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

        <div className="min-w-0 flex-1">
          <div className="text-xs font-extrabold text-slate-900 truncate">
            {resolved.effectiveDisplayName}
          </div>
          {/* 全体ロール強調表示 */}
          {globalRoles.length > 0 ? (
            <div className="flex flex-wrap gap-1 mt-1">
              {globalRoles.map((r) => (
                <span
                  key={r.id}
                  className="inline-block rounded px-1.5 py-0.5 text-[10px] font-extrabold text-white leading-none"
                  style={{ backgroundColor: r.color }}
                >
                  {r.name}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-[10px] text-slate-400">全体ロール未設定</span>
          )}
        </div>
      </div>

      {/* 所属グループとグループ内ロール一覧（メイン表示） */}
      <div className="p-2.5 space-y-1.5 bg-white">
        {groupMemberships.length > 0 ? (
          groupMemberships.map((gm) => (
            <div
              key={gm.groupId}
              className="rounded-lg bg-slate-50 border border-slate-200/80 px-2 py-1.5 flex flex-col gap-1"
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: gm.groupColor }}
                />
                <span className="text-[10px] font-bold text-slate-700 truncate">
                  {gm.groupName}
                </span>
              </div>
              {gm.roles.length > 0 && (
                <div className="flex flex-wrap gap-1 pl-3.5">
                  {gm.roles.map((r) => (
                    <span
                      key={r.id}
                      className="rounded px-1.5 py-0.5 text-[10px] font-extrabold text-white leading-none"
                      style={{ backgroundColor: r.color }}
                    >
                      {r.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="text-[10px] text-slate-400 text-center py-0.5">所属グループなし</div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-indigo-600 !border-2 !border-white"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right-source"
        className="!w-3 !h-3 !bg-indigo-600 !border-2 !border-white"
      />
    </div>
  );
};

/**
 * 大グループ・小グループノード
 * - 直接所属人数と配下を含む人数（重複排除済み）を表示
 * - 大グループは展開・折りたたみボタン付き
 * - グループ内で割り当てられている主要ロール集計もバッジ表示
 */
export const GroupFlowNode: React.FC<NodeProps> = ({ data }) => {
  const d = data as unknown as GroupNodeData;
  const {
    group,
    parentGroupName,
    iconDataUrl,
    directCount,
    totalCount,
    roleSummary,
    isCollapsed,
    hasChildren,
    isHighlighted,
    isDimmed,
  } = d;

  const isLarge = group.kind === 'large';
  const opacityClass = isDimmed ? 'opacity-30' : 'opacity-100';

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        d.onSelectGroup(group.id);
      }}
      className={`rounded-2xl bg-white transition-all duration-150 cursor-pointer overflow-hidden ${
        isLarge ? 'w-[272px] border-2 shadow-md' : 'w-[244px] border-2 shadow-sm'
      } ${isHighlighted ? 'ring-3 ring-indigo-500 scale-[1.02]' : 'hover:shadow-lg'} ${opacityClass}`}
      style={{
        borderColor: group.color,
        backgroundColor: isLarge ? '#ffffff' : '#fcfdff',
      }}
      data-testid={`group-node-${group.id}`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-slate-600 !border-2 !border-white"
      />

      {/* ヘッダー */}
      <div
        className="px-3.5 py-2.5 flex items-center justify-between gap-2"
        style={{
          background: isLarge
            ? `linear-gradient(135deg, ${group.color}, ${group.color}dd)`
            : `linear-gradient(135deg, ${group.color}22, #ffffff)`,
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <AvatarBadge
            name={group.name}
            color={group.color}
            iconDataUrl={iconDataUrl}
            preset={group.avatarPreset}
            size="sm"
            shape="rounded"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <span
                className={`text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded leading-none ${
                  isLarge
                    ? 'bg-white/25 text-white'
                    : 'text-white'
                }`}
                style={!isLarge ? { backgroundColor: group.color } : undefined}
              >
                {isLarge ? '大グループ' : '小グループ'}
              </span>
              {parentGroupName && (
                <span className="text-[10px] font-semibold text-slate-500 truncate">
                  ({parentGroupName})
                </span>
              )}
            </div>
            <div
              className={`text-xs font-extrabold truncate mt-1 ${
                isLarge ? 'text-white' : 'text-slate-900'
              }`}
            >
              {group.name}
            </div>
          </div>
        </div>

        {/* 大グループの折りたたみ・展開ボタン */}
        {isLarge && hasChildren && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              d.onToggleCollapse(group.id);
            }}
            className="rounded-lg bg-white/20 hover:bg-white/35 p-1 text-white transition shrink-0"
            title={isCollapsed ? '配下小グループを展開' : '配下小グループを折りたたむ'}
            data-testid={`toggle-collapse-${group.id}`}
          >
            {isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
          </button>
        )}
      </div>

      {/* 人数とロール内訳 */}
      <div className="p-3 space-y-2 bg-white">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-600 font-semibold flex items-center gap-1">
            <Users size={12} className="text-slate-400" />
            直接所属: <strong className="text-slate-900">{directCount}人</strong>
          </span>
          {isLarge && (
            <span className="rounded-full bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-[10px] font-extrabold text-indigo-800">
              配下含む計: {totalCount}人
            </span>
          )}
        </div>

        {roleSummary.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {roleSummary.slice(0, 4).map((rs, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
                style={{ backgroundColor: rs.roleColor }}
              >
                {rs.roleName}
                <span className="opacity-85">×{rs.count}</span>
              </span>
            ))}
          </div>
        )}

        {isLarge && isCollapsed && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-2 py-1 text-[10px] font-bold text-amber-800 text-center">
            配下の小グループを折りたたみ中
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-indigo-600 !border-2 !border-white"
      />
    </div>
  );
};
