import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  ConnectionMode,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toPng } from 'html-to-image';
import {
  Camera,
  Copy,
  Filter,
  GitBranch,
  LayoutGrid,
  LayoutList,
  Link2,
  MousePointerClick,
  Network,
  Plus,
  Redo2,
  Sparkles,
  Trash2,
  Undo2,
  Users,
  X,
} from 'lucide-react';
import { useAppState } from '../../context/AppStateContext';
import type {
  DiagramViewMode,
  EntityKind,
  HandleSide,
  NodeDisplayStyle,
} from '../../types/domain';
import { calculateGroupMemberCounts } from '../../utils/groupRules';
import {
  computeAutoLayoutPositions,
  computeNestedGroupLayout,
} from '../../utils/layoutEngine';
import {
  canManageRelationship,
  resolvePersonView,
} from '../../utils/securityGuards';
import {
  GroupFlowNode,
  PersonFlowNode,
  ScopedPersonFlowNode,
} from './CustomNodes';
import { SmartRelationshipEdge } from './SmartRelationshipEdge';

const nodeTypes = {
  personNode: PersonFlowNode,
  scopedPersonNode: ScopedPersonFlowNode,
  groupNode: GroupFlowNode,
};

const edgeTypes = {
  smartRelation: SmartRelationshipEdge,
};

function normalizeHandleSide(raw?: string | null): HandleSide | null {
  if (raw === 'top' || raw === 'right' || raw === 'bottom' || raw === 'left') {
    return raw;
  }
  return null;
}

/**
 * 関係線の始点・終点の結合場所（上・右・下・左）を決定するヘルパー
 * - ユーザーが明示的に指定・ドラッグ付け替えした sourceHandle / targetHandle があればそれを最優先
 * - 未設定の場合は2つのカードの相対位置（上下左右の向き）から最短で向かい合う辺を自動選択（カード裏を貫通しないようにする）
 */
function resolveBestHandles(
  sKey: string,
  tKey: string,
  explicitSource: HandleSide | null | undefined,
  explicitTarget: HandleSide | null | undefined,
  allNodes: Node[]
): { sourceHandle: HandleSide; targetHandle: HandleSide } {
  const sExplicit = normalizeHandleSide(explicitSource);
  const tExplicit = normalizeHandleSide(explicitTarget);
  if (sExplicit && tExplicit) {
    return { sourceHandle: sExplicit, targetHandle: tExplicit };
  }

  const nodeMap = new Map(allNodes.map((n) => [n.id, n]));
  const getAbsCenter = (nodeId: string): { x: number; y: number } => {
    const n = nodeMap.get(nodeId);
    if (!n) return { x: 0, y: 0 };
    let x = n.position.x;
    let y = n.position.y;
    let currParentId = n.parentId;
    while (currParentId) {
      const p = nodeMap.get(currParentId);
      if (!p) break;
      x += p.position.x;
      y += p.position.y;
      currParentId = p.parentId;
    }
    const w = (n.style?.width as number) || (n.data?.width as number) || 320;
    const h = (n.style?.height as number) || (n.data?.height as number) || 140;
    return { x: x + w / 2, y: y + h / 2 };
  };

  const sc = getAbsCenter(sKey);
  const tc = getAbsCenter(tKey);
  const dx = tc.x - sc.x;
  const dy = tc.y - sc.y;

  let autoSource: HandleSide;
  let autoTarget: HandleSide;
  if (Math.abs(dx) > Math.abs(dy) * 1.35) {
    autoSource = dx >= 0 ? 'right' : 'left';
    autoTarget = dx >= 0 ? 'left' : 'right';
  } else {
    autoSource = dy >= 0 ? 'bottom' : 'top';
    autoTarget = dy >= 0 ? 'top' : 'bottom';
  }

  return {
    sourceHandle: sExplicit || autoSource,
    targetHandle: tExplicit || autoTarget,
  };
}

interface CorrelationCanvasProps {
  selectedEntityKey: string | null; // "person:{id}" | "group:{id}" | "rel:{id}"
  onSelectEntityKey: (key: string | null) => void;
  onOpenPersonProfile: (personId: string) => void;
  onOpenGroupDetail: (groupId: string) => void;
  onOpenRelationshipEditor: (
    relId?: string | null,
    src?: { kind: EntityKind; id: string },
    tgt?: { kind: EntityKind; id: string },
    srcHandle?: HandleSide | null,
    tgtHandle?: HandleSide | null
  ) => void;
  searchQuery: string;
}

export const CorrelationCanvas: React.FC<CorrelationCanvasProps> = ({
  selectedEntityKey,
  onSelectEntityKey,
  onOpenPersonProfile,
  onOpenGroupDetail,
  onOpenRelationshipEditor,
  searchQuery,
}) => {
  const {
    currentBundle,
    activeDiagram,
    setActiveDiagramId,
    actor,
    permissions,
    userProfiles,
    profileIcons,
    createDiagram,
    duplicateDiagram,
    updateDiagram,
    deleteDiagram,
    updateNodePosition,
    updateMultipleNodePositions,
    toggleGroupCollapse,
    moveOrCopyMembershipByDrag,
    upsertRelationship,
    canUndo,
    canRedo,
    undoLastAction,
    redoLastAction,
  } = useAppState();

  const canvasWrapperRef = useRef<HTMLDivElement | null>(null);
  const lastEdgeTapRef = useRef<{ edgeId: string; time: number }>({ edgeId: '', time: 0 });
  const [interactionMode, setInteractionMode] = useState<'move' | 'connect'>('move');
  const [confirmDeleteDiagId, setConfirmDeleteDiagId] = useState<string | null>(null);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [isExportingPng, setIsExportingPng] = useState(false);

  // ドラッグ中のグループ枠ハイライト状態（移動 or Ctrl/右ドラッグによるコピー追加）
  const [dragHoverGroupId, setDragHoverGroupId] = useState<string | null>(null);
  const [dragIsCopyMode, setDragIsCopyMode] = useState<boolean>(false);
  const [dragFeedbackToast, setDragFeedbackToast] = useState<string | null>(null);

  // 図タイトル編集ステート（タブダブルクリック時用）
  const [diagramTitleDraft, setDiagramTitleDraft] = useState(activeDiagram?.name || '');

  useEffect(() => {
    setDiagramTitleDraft(activeDiagram?.name || '');
    setEditingTabId(null);
  }, [activeDiagram?.id, activeDiagram?.name]);

  const groupMemberCounts = useMemo(() => {
    if (!currentBundle) return {};
    return calculateGroupMemberCounts(
      currentBundle.groups,
      currentBundle.memberships,
      currentBundle.people
    );
  }, [currentBundle]);

  // 選択対象に関連するエンティティの算出
  const connectedEntityKeys = useMemo(() => {
    const set = new Set<string>();
    if (!selectedEntityKey || !currentBundle) return set;
    set.add(selectedEntityKey);

    // 関係線が選択されている場合は、その接続元・接続先エンティティも関連に含める
    if (selectedEntityKey.startsWith('rel:')) {
      const rid = selectedEntityKey.replace('rel:', '');
      const rel = currentBundle.relationships.find((r) => r.id === rid);
      if (rel) {
        set.add(`${rel.sourceKind}:${rel.sourceId}`);
        set.add(`${rel.targetKind}:${rel.targetId}`);
      }
    }

    // 大グループまたは小グループ選択時は親子グループも関連に含める（親コンテナの半透明化で子が薄くなるのを防ぐ）
    if (selectedEntityKey.startsWith('group:')) {
      const gid = selectedEntityKey.replace('group:', '');
      const grp = currentBundle.groups.find((g) => g.id === gid);
      if (grp?.parentGroupId) {
        set.add(`group:${grp.parentGroupId}`);
      }
      for (const child of currentBundle.groups) {
        if (child.parentGroupId === gid) {
          set.add(`group:${child.id}`);
        }
      }
    }

    for (const rel of currentBundle.relationships) {
      const sKey = `${rel.sourceKind}:${rel.sourceId}`;
      const tKey = `${rel.targetKind}:${rel.targetId}`;
      if (sKey === selectedEntityKey) set.add(tKey);
      if (tKey === selectedEntityKey) set.add(sKey);
    }

    for (const mem of currentBundle.memberships) {
      const pKey = `person:${mem.personId}`;
      const gKey = `group:${mem.groupId}`;
      if (pKey === selectedEntityKey) {
        set.add(gKey);
        const grp = currentBundle.groups.find((g) => g.id === mem.groupId);
        if (grp?.parentGroupId) {
          set.add(`group:${grp.parentGroupId}`);
        }
      }
      if (gKey === selectedEntityKey) set.add(pKey);
    }

    // 選択されたエンティティと関係線で結ばれたグループに親グループがある場合も親枠を薄くしない
    for (const key of Array.from(set)) {
      if (key.startsWith('group:')) {
        const gid = key.replace('group:', '');
        const grp = currentBundle.groups.find((g) => g.id === gid);
        if (grp?.parentGroupId) {
          set.add(`group:${grp.parentGroupId}`);
        }
      }
    }

    return set;
  }, [currentBundle, selectedEntityKey]);

  // ==========================================================================
  // 3つの表示モード別のノード・エッジ生成
  // - mixed : 初期画面（所属中心）— 大グループ枠の中に小グループ枠と直下ユーザーが入る入れ子構造、名前の下にここでのロール表示、関係線はラベルなし
  // - people: 人物図（人中心）— 人名の右脇に所属グループ＋ロールをずらっと表示、関係線は文字ラベルあり
  // - groups: グループ図（グループ中心）— 大グループ枠の中に小グループ枠が入る入れ子構造、枠内に所属人名＋ロールをずらっと内蔵表示、グループ関係線は文字ラベルあり
  // ==========================================================================
  const { computedNodes, computedEdges } = useMemo(() => {
    if (!currentBundle || !activeDiagram) {
      return { computedNodes: [] as Node[], computedEdges: [] as Edge[] };
    }

    const viewMode = activeDiagram.viewMode;
    const nodeStyle = activeDiagram.nodeStyle;
    const collapsedSet = new Set(activeDiagram.collapsedGroupIds);
    const focusedGroupId = activeDiagram.filterConfig?.focusedGroupId || null;
    const q = searchQuery.trim().toLowerCase();

    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // ------------------------------------------------------------------------
    // モード1 & 3: 初期画面（所属中心 / mixed）および グループ図（グループ中心 / groups）
    // ------------------------------------------------------------------------
    if (viewMode === 'mixed' || viewMode === 'groups') {
      const nestedPlan = computeNestedGroupLayout(
        viewMode,
        currentBundle.groups,
        currentBundle.people,
        currentBundle.memberships,
        activeDiagram.collapsedGroupIds
      );

      // 小グループと直下メンバーが親枠の外へはみ出ていた場合に親枠を自動拡張するため、実効座標を先に解決
      const resolvedSmallPos: Record<string, { x: number; y: number; width: number; height: number }> = {};
      const resolvedMemPos: Record<string, { x: number; y: number }> = {};

      for (const mem of currentBundle.memberships) {
        const memKey = `mem:${mem.id}`;
        const saved = activeDiagram.nodePositions[memKey];
        const fallback = nestedPlan.membershipRelativePositions[memKey] || { x: 28, y: 56 };
        resolvedMemPos[mem.id] = {
          x: Math.max(16, saved?.x ?? fallback.x),
          y: Math.max(46, saved?.y ?? fallback.y),
        };
      }

      // 小グループの実効サイズ（内部メンバーの座標を包含するよう自動調整）
      const smallGroups = currentBundle.groups.filter((g) => g.kind === 'small');
      for (const sg of smallGroups) {
        const baseBox = nestedPlan.smallGroupBoxes[sg.id] || {
          width: 240,
          height: 150,
          defaultRelativePos: { x: 24, y: 56 },
        };
        const savedSgPos = activeDiagram.nodePositions[`group:${sg.id}`];
        const relX = Math.max(16, savedSgPos?.x ?? baseBox.defaultRelativePos.x);
        const relY = Math.max(46, savedSgPos?.y ?? baseBox.defaultRelativePos.y);

        let w = baseBox.width;
        let h = baseBox.height;

        if (viewMode === 'mixed') {
          const sgMems = currentBundle.memberships.filter((m) => m.groupId === sg.id);
          for (const m of sgMems) {
            const mp = resolvedMemPos[m.id];
            if (mp) {
              w = Math.max(w, mp.x + 206);
              h = Math.max(h, mp.y + 84);
            }
          }
        }

        resolvedSmallPos[sg.id] = { x: relX, y: relY, width: w, height: h };
      }

      // A. 大グループ枠ノード（最背面・親コンテナ）
      const largeGroups = currentBundle.groups.filter((g) => g.kind === 'large');
      for (const lg of largeGroups) {
        if (focusedGroupId && lg.id !== focusedGroupId) {
          const isParentOfFocused = smallGroups.some(
            (sg) => sg.id === focusedGroupId && sg.parentGroupId === lg.id
          );
          if (!isParentOfFocused) continue;
        }

        const baseBox = nestedPlan.largeGroupBoxes[lg.id] || {
          width: 420,
          height: 320,
          defaultRelativePos: { x: 40, y: 40 },
        };
        const pos = activeDiagram.nodePositions[`group:${lg.id}`] || baseBox.defaultRelativePos;

        let lgWidth = baseBox.width;
        let lgHeight = baseBox.height;

        if (!collapsedSet.has(lg.id)) {
          for (const sg of smallGroups.filter((s) => s.parentGroupId === lg.id)) {
            const sp = resolvedSmallPos[sg.id];
            if (sp) {
              lgWidth = Math.max(lgWidth, sp.x + sp.width + 24);
              lgHeight = Math.max(lgHeight, sp.y + sp.height + 24);
            }
          }
        }

        if (viewMode === 'mixed') {
          for (const m of currentBundle.memberships.filter((mem) => mem.groupId === lg.id)) {
            const mp = resolvedMemPos[m.id];
            if (mp) {
              lgWidth = Math.max(lgWidth, mp.x + 212);
              lgHeight = Math.max(lgHeight, mp.y + 88);
            }
          }
        }

        const embeddedMembers = currentBundle.memberships
          .filter((m) => m.groupId === lg.id)
          .map((m) => {
            const p = currentBundle.people.find((per) => per.id === m.personId);
            if (!p) return null;
            const res = resolvePersonView(
              p,
              actor,
              userProfiles,
              profileIcons,
              currentBundle.projectIcons
            );
            const roles = m.roleIds
              .map((rid) => currentBundle.project.roleTags.find((t) => t.id === rid))
              .filter((t): t is NonNullable<typeof t> => Boolean(t));
            return {
              personId: p.id,
              displayName: res.effectiveDisplayName,
              personColor: p.color,
              iconDataUrl: res.iconDataUrl,
              avatarPreset: res.avatarPreset,
              roles,
            };
          })
          .filter((item): item is NonNullable<typeof item> => item !== null);

        const iconDoc = lg.iconId ? currentBundle.projectIcons[lg.iconId] : null;
        const hasChildren = smallGroups.some((sg) => sg.parentGroupId === lg.id);
        const key = `group:${lg.id}`;

        nodes.push({
          id: key,
          type: 'groupNode',
          position: pos,
          style: { width: lgWidth, height: lgHeight },
          // レイヤー3: 大グループカード（zIndex: 10、選択時11 — 小グループ矢印12より常に背面）
          zIndex: selectedEntityKey === key ? 11 : 10,
          draggable: permissions.isEditor && interactionMode === 'move',
          data: {
            group: lg,
            iconDataUrl: iconDoc?.dataUrl || null,
            directCount: groupMemberCounts[lg.id]?.directCount ?? 0,
            totalCount: groupMemberCounts[lg.id]?.totalCount ?? 0,
            width: lgWidth,
            height: lgHeight,
            viewMode,
            embeddedMembers,
            isCollapsed: collapsedSet.has(lg.id),
            hasChildren,
            isDropTarget: dragHoverGroupId === lg.id && !dragIsCopyMode,
            isCopyDropTarget: dragHoverGroupId === lg.id && dragIsCopyMode,
            isHighlighted: selectedEntityKey === key,
            isDimmed: Boolean(selectedEntityKey) && !connectedEntityKeys.has(key),
            onFocusGroup: (gid: string) => onSelectEntityKey(`group:${gid}`),
            onOpenGroup: (gid: string) => {
              onSelectEntityKey(`group:${gid}`);
              onOpenGroupDetail(gid);
            },
            onFocusPerson: (pid: string) => onSelectEntityKey(`person:${pid}`),
            onOpenPerson: (pid: string) => {
              onSelectEntityKey(`person:${pid}`);
              onOpenPersonProfile(pid);
            },
            onToggleCollapse: (gid: string) => toggleGroupCollapse(activeDiagram.id, gid),
          },
        });
      }

      // B. 小グループ枠ノード（親の大グループ枠の中に parentId でネスト配置、親枠の外には出られない）
      for (const sg of smallGroups) {
        if (!sg.parentGroupId || collapsedSet.has(sg.parentGroupId)) continue;
        const parentNodeKey = `group:${sg.parentGroupId}`;
        if (!nodes.some((n) => n.id === parentNodeKey)) continue;
        if (focusedGroupId && sg.id !== focusedGroupId && sg.parentGroupId !== focusedGroupId) {
          continue;
        }

        const sp = resolvedSmallPos[sg.id];
        const embeddedMembers = currentBundle.memberships
          .filter((m) => m.groupId === sg.id)
          .map((m) => {
            const p = currentBundle.people.find((per) => per.id === m.personId);
            if (!p) return null;
            const res = resolvePersonView(
              p,
              actor,
              userProfiles,
              profileIcons,
              currentBundle.projectIcons
            );
            const roles = m.roleIds
              .map((rid) => currentBundle.project.roleTags.find((t) => t.id === rid))
              .filter((t): t is NonNullable<typeof t> => Boolean(t));
            return {
              personId: p.id,
              displayName: res.effectiveDisplayName,
              personColor: p.color,
              iconDataUrl: res.iconDataUrl,
              avatarPreset: res.avatarPreset,
              roles,
            };
          })
          .filter((item): item is NonNullable<typeof item> => item !== null);

        const iconDoc = sg.iconId ? currentBundle.projectIcons[sg.iconId] : null;
        const key = `group:${sg.id}`;

        nodes.push({
          id: key,
          type: 'groupNode',
          parentId: parentNodeKey,
          extent: 'parent',
          position: { x: sp.x, y: sp.y },
          style: { width: sp.width, height: sp.height },
          // レイヤー6: 小グループカード（zIndex: 20、選択時21 — 小グループ矢印12/14より前面、ユーザ矢印22より背面）
          zIndex: selectedEntityKey === key ? 21 : 20,
          draggable: permissions.isEditor && interactionMode === 'move',
          data: {
            group: sg,
            iconDataUrl: iconDoc?.dataUrl || null,
            directCount: groupMemberCounts[sg.id]?.directCount ?? 0,
            totalCount: groupMemberCounts[sg.id]?.totalCount ?? 0,
            width: sp.width,
            height: sp.height,
            viewMode,
            embeddedMembers,
            isCollapsed: false,
            hasChildren: false,
            isDropTarget: dragHoverGroupId === sg.id && !dragIsCopyMode,
            isCopyDropTarget: dragHoverGroupId === sg.id && dragIsCopyMode,
            isHighlighted: selectedEntityKey === key,
            isDimmed: Boolean(selectedEntityKey) && !connectedEntityKeys.has(key),
            onFocusGroup: (gid: string) => onSelectEntityKey(`group:${gid}`),
            onOpenGroup: (gid: string) => {
              onSelectEntityKey(`group:${gid}`);
              onOpenGroupDetail(gid);
            },
            onFocusPerson: (pid: string) => onSelectEntityKey(`person:${pid}`),
            onOpenPerson: (pid: string) => {
              onSelectEntityKey(`person:${pid}`);
              onOpenPersonProfile(pid);
            },
            onToggleCollapse: () => {},
          },
        });
      }

      // C. 初期画面（所属中心 / mixedモード）のとき：
      //    各所属（Membership）ごとに、所属先のグループ枠の中に人物ノードを配置（複数所属なら各グループ内にその場所でのロール付きで配置）
      const personToRenderedNodeIds = new Map<string, string[]>();

      if (viewMode === 'mixed') {
        for (const mem of currentBundle.memberships) {
          const person = currentBundle.people.find((p) => p.id === mem.personId);
          const grp = currentBundle.groups.find((g) => g.id === mem.groupId);
          if (!person || !grp) continue;

          const parentGroupNodeId = `group:${grp.id}`;
          if (!nodes.some((n) => n.id === parentGroupNodeId)) continue;

          const resolved = resolvePersonView(
            person,
            actor,
            userProfiles,
            profileIcons,
            currentBundle.projectIcons
          );

          const rolesHere = mem.roleIds
            .map((rid) => currentBundle.project.roleTags.find((t) => t.id === rid))
            .filter((t): t is NonNullable<typeof t> => Boolean(t));

          const mp = resolvedMemPos[mem.id] || { x: 28, y: 56 };
          const nodeId = `mem:${mem.id}`;

          const list = personToRenderedNodeIds.get(person.id) || [];
          list.push(nodeId);
          personToRenderedNodeIds.set(person.id, list);

          const matchesSearch =
            !q ||
            resolved.effectiveDisplayName.toLowerCase().includes(q) ||
            grp.name.toLowerCase().includes(q) ||
            rolesHere.some((r) => r.name.toLowerCase().includes(q));

          const personEntityKey = `person:${person.id}`;
          // キャンバス上のドラッグ移動は管理者・編集者のみ可能
          const canMoveThisPerson = permissions.isEditor && interactionMode === 'move';

          nodes.push({
            id: nodeId,
            type: 'scopedPersonNode',
            parentId: parentGroupNodeId,
            position: mp,
            // レイヤー9: ユーザカード（zIndex: 30、選択時35 — ユーザ矢印22/24より前面、フォーカス矢印40より背面）
            zIndex: selectedEntityKey === personEntityKey ? 35 : 30,
            draggable: canMoveThisPerson,
            data: {
              person,
              resolved,
              membershipId: mem.id,
              groupId: grp.id,
              groupName: grp.name,
              rolesHere,
              nodeStyle,
              isHighlighted: selectedEntityKey === personEntityKey,
              isDimmed:
                (!matchesSearch && Boolean(q)) ||
                (Boolean(selectedEntityKey) && !connectedEntityKeys.has(personEntityKey)),
              onFocusPerson: (pid: string) => onSelectEntityKey(`person:${pid}`),
              onOpenPerson: (pid: string) => {
                onSelectEntityKey(`person:${pid}`);
                onOpenPersonProfile(pid);
              },
            },
          });
        }

        // どのグループにも所属していない未所属の人物は枠の外（下部）に配置
        const affiliatedIds = new Set(currentBundle.memberships.map((m) => m.personId));
        for (const person of currentBundle.people) {
          if (affiliatedIds.has(person.id)) continue;
          if (focusedGroupId) continue;

          const unKey = `unaffiliated:${person.id}`;
          const pos =
            activeDiagram.nodePositions[unKey] ||
            nestedPlan.unaffiliatedPositions[unKey] || { x: 80, y: 520 };

          const resolved = resolvePersonView(
            person,
            actor,
            userProfiles,
            profileIcons,
            currentBundle.projectIcons
          );

          const globalRoles = person.globalRoleIds
            .map((rid) => currentBundle.project.roleTags.find((t) => t.id === rid))
            .filter((t): t is NonNullable<typeof t> => Boolean(t));

          personToRenderedNodeIds.set(person.id, [unKey]);
          const personEntityKey = `person:${person.id}`;
          const canMoveThisPerson = permissions.isEditor && interactionMode === 'move';

          nodes.push({
            id: unKey,
            type: 'scopedPersonNode',
            position: pos,
            zIndex: selectedEntityKey === personEntityKey ? 35 : 30,
            draggable: canMoveThisPerson,
            data: {
              person,
              resolved,
              membershipId: null,
              groupId: null,
              groupName: null,
              rolesHere: globalRoles,
              nodeStyle,
              isHighlighted: selectedEntityKey === personEntityKey,
              isDimmed:
                Boolean(selectedEntityKey) && !connectedEntityKeys.has(personEntityKey),
              onFocusPerson: (pid: string) => onSelectEntityKey(`person:${pid}`),
              onOpenPerson: (pid: string) => {
                onSelectEntityKey(`person:${pid}`);
                onOpenPersonProfile(pid);
              },
            },
          });
        }
      }

      // D. 関係線の描画
      // レイヤー順（背面から）：
      // 1. 大グループ矢印(2) → 2. 大グループ矢印内容(4) → 3. 大グループカード(10)
      // → 4. 小グループ矢印(12) → 5. 小グループ矢印内容(14) → 6. 小グループカード(20)
      // → 7. ユーザ矢印(22) → 8. ユーザ矢印内容(24) → 9. ユーザカード(30)
      // （フォーカス時は矢印 40 → 矢印内容 50）
      const renderedNodeIdSet = new Set(nodes.map((n) => n.id));
      const showArrowsInMixed = Boolean(activeDiagram.filterConfig?.showMixedArrows);
      const showArrowsInGroups = activeDiagram.filterConfig?.showRelationships !== false;

      if (viewMode === 'mixed' && showArrowsInMixed) {
        // 初期画面（所属中心）で「矢印表示」ONのとき：グループ間・人物間・グループと人物間の全関係線を1対Nも含めて描画
        const rawPairs: {
          rel: (typeof currentBundle.relationships)[number];
          sNodeId: string;
          tNodeId: string;
          edgeTier: 'largeGroup' | 'smallGroup' | 'person';
          baseEdgeZ: number;
          isEdgeHighlighted: boolean;
          isEdgeSelected: boolean;
        }[] = [];

        for (const rel of currentBundle.relationships) {
          const srcNodeIds =
            rel.sourceKind === 'group'
              ? renderedNodeIdSet.has(`group:${rel.sourceId}`)
                ? [`group:${rel.sourceId}`]
                : []
              : personToRenderedNodeIds.get(rel.sourceId) || [];
          const tgtNodeIds =
            rel.targetKind === 'group'
              ? renderedNodeIdSet.has(`group:${rel.targetId}`)
                ? [`group:${rel.targetId}`]
                : []
              : personToRenderedNodeIds.get(rel.targetId) || [];

          if (srcNodeIds.length === 0 || tgtNodeIds.length === 0) continue;

          let edgeTier: 'largeGroup' | 'smallGroup' | 'person' = 'person';
          let baseEdgeZ = 22;
          if (rel.sourceKind === 'group' && rel.targetKind === 'group') {
            const srcGrp = currentBundle.groups.find((g) => g.id === rel.sourceId);
            const tgtGrp = currentBundle.groups.find((g) => g.id === rel.targetId);
            if (srcGrp?.kind === 'small' || tgtGrp?.kind === 'small') {
              edgeTier = 'smallGroup';
              baseEdgeZ = 12;
            } else {
              edgeTier = 'largeGroup';
              baseEdgeZ = 2;
            }
          }

          const sEntityKey = `${rel.sourceKind}:${rel.sourceId}`;
          const tEntityKey = `${rel.targetKind}:${rel.targetId}`;
          const isEdgeSelected = selectedEntityKey === `rel:${rel.id}`;
          const isEdgeHighlighted =
            isEdgeSelected ||
            selectedEntityKey === sEntityKey ||
            selectedEntityKey === tEntityKey;

          for (const sNodeId of srcNodeIds) {
            for (const tNodeId of tgtNodeIds) {
              if (sNodeId === tNodeId) continue;
              rawPairs.push({
                rel,
                sNodeId,
                tNodeId,
                edgeTier,
                baseEdgeZ,
                isEdgeHighlighted,
                isEdgeSelected,
              });
            }
          }
        }

        const pairCounts = new Map<string, number>();
        for (const item of rawPairs) {
          const pk = [item.sNodeId, item.tNodeId].sort().join('--');
          pairCounts.set(pk, (pairCounts.get(pk) || 0) + 1);
        }

        const pairIdxTracker = new Map<string, number>();
        for (const item of rawPairs) {
          const {
            rel,
            sNodeId,
            tNodeId,
            edgeTier,
            baseEdgeZ,
            isEdgeHighlighted,
            isEdgeSelected,
          } = item;
          const pk = [sNodeId, tNodeId].sort().join('--');
          const pairIndex = pairIdxTracker.get(pk) || 0;
          pairIdxTracker.set(pk, pairIndex + 1);
          const pairTotal = pairCounts.get(pk) || 1;

          const handles = resolveBestHandles(
            sNodeId,
            tNodeId,
            rel.sourceHandle,
            rel.targetHandle,
            nodes
          );
          const canEditRel = canManageRelationship(actor, rel, currentBundle);

          edges.push({
            id: `rel:${rel.id}__${sNodeId}__${tNodeId}`,
            source: sNodeId,
            target: tNodeId,
            sourceHandle: handles.sourceHandle,
            targetHandle: handles.targetHandle,
            type: 'smartRelation',
            reconnectable: isEdgeSelected && canEditRel,
            zIndex: isEdgeHighlighted ? 40 : baseEdgeZ,
            markerEnd:
              rel.direction === 'forward' || rel.direction === 'bidirectional'
                ? { type: MarkerType.ArrowClosed, color: rel.color, width: 18, height: 18 }
                : undefined,
            markerStart:
              rel.direction === 'bidirectional'
                ? { type: MarkerType.ArrowClosed, color: rel.color, width: 18, height: 18 }
                : undefined,
            data: {
              relationshipId: rel.id,
              label: rel.label,
              direction: rel.direction,
              color: rel.color,
              lineStyle: rel.lineStyle,
              pairIndex,
              pairTotal,
              edgeTier,
              isHighlighted: isEdgeHighlighted,
              isSelected: isEdgeSelected,
              canReconnect: canEditRel,
              onFocusRelationship: (rid: string) => onSelectEntityKey(`rel:${rid}`),
              onOpenRelationship: canEditRel
                ? (rid: string) => onOpenRelationshipEditor(rid)
                : undefined,
            },
          });
        }
      } else if (viewMode === 'groups' && showArrowsInGroups) {
        const groupRels = currentBundle.relationships.filter(
          (r) =>
            r.sourceKind === 'group' &&
            r.targetKind === 'group' &&
            renderedNodeIdSet.has(`group:${r.sourceId}`) &&
            renderedNodeIdSet.has(`group:${r.targetId}`)
        );

        const pairCounts = new Map<string, number>();
        for (const r of groupRels) {
          const pk = [`group:${r.sourceId}`, `group:${r.targetId}`].sort().join('--');
          pairCounts.set(pk, (pairCounts.get(pk) || 0) + 1);
        }

        const pairIdxTracker = new Map<string, number>();
        for (const rel of groupRels) {
          const sKey = `group:${rel.sourceId}`;
          const tKey = `group:${rel.targetId}`;
          const pk = [sKey, tKey].sort().join('--');
          const pairIndex = pairIdxTracker.get(pk) || 0;
          pairIdxTracker.set(pk, pairIndex + 1);
          const pairTotal = pairCounts.get(pk) || 1;
          const srcGrp = currentBundle.groups.find((g) => g.id === rel.sourceId);
          const tgtGrp = currentBundle.groups.find((g) => g.id === rel.targetId);
          const isSmallGroupRel = srcGrp?.kind === 'small' || tgtGrp?.kind === 'small';
          const edgeTier: 'largeGroup' | 'smallGroup' = isSmallGroupRel
            ? 'smallGroup'
            : 'largeGroup';
          const baseEdgeZ = isSmallGroupRel ? 12 : 2;
          const isEdgeSelected = selectedEntityKey === `rel:${rel.id}`;
          const isEdgeHighlighted =
            isEdgeSelected ||
            selectedEntityKey === sKey ||
            selectedEntityKey === tKey ||
            (srcGrp?.parentGroupId && selectedEntityKey === `group:${srcGrp.parentGroupId}`) ||
            (tgtGrp?.parentGroupId && selectedEntityKey === `group:${tgtGrp.parentGroupId}`);

          const handles = resolveBestHandles(
            sKey,
            tKey,
            rel.sourceHandle,
            rel.targetHandle,
            nodes
          );

          edges.push({
            id: `rel:${rel.id}`,
            source: sKey,
            target: tKey,
            sourceHandle: handles.sourceHandle,
            targetHandle: handles.targetHandle,
            type: 'smartRelation',
            reconnectable: isEdgeSelected && permissions.isEditor,
            zIndex: isEdgeHighlighted ? 40 : baseEdgeZ,
            markerEnd:
              rel.direction === 'forward' || rel.direction === 'bidirectional'
                ? { type: MarkerType.ArrowClosed, color: rel.color, width: 18, height: 18 }
                : undefined,
            markerStart:
              rel.direction === 'bidirectional'
                ? { type: MarkerType.ArrowClosed, color: rel.color, width: 18, height: 18 }
                : undefined,
            data: {
              relationshipId: rel.id,
              label: rel.label,
              direction: rel.direction,
              color: rel.color,
              lineStyle: rel.lineStyle,
              pairIndex,
              pairTotal,
              edgeTier,
              isHighlighted: isEdgeHighlighted,
              isSelected: isEdgeSelected,
              canReconnect: permissions.isEditor,
              onFocusRelationship: (rid: string) => onSelectEntityKey(`rel:${rid}`),
              onOpenRelationship: permissions.isEditor
                ? (rid: string) => onOpenRelationshipEditor(rid)
                : undefined,
            },
          });
        }
      }

      return { computedNodes: nodes, computedEdges: edges };
    }

    // ------------------------------------------------------------------------
    // モード2: 人物図（人中心 / people）
    // - 所属しているグループとロールは人名の「右脇」にずらっと表示
    // - 関係の線と内容の意味は強いため、文字情報（ラベル）をしっかり表示
    // ------------------------------------------------------------------------
    const fallbackPeoplePositions = computeAutoLayoutPositions(
      'people',
      currentBundle.groups,
      currentBundle.people,
      currentBundle.memberships,
      currentBundle.relationships,
      activeDiagram.collapsedGroupIds
    );

    const visiblePersonKeys = new Set<string>();

    currentBundle.people.forEach((person, idx) => {
      const personMems = currentBundle.memberships.filter((m) => m.personId === person.id);

      if (focusedGroupId) {
        const childIds = currentBundle.groups
          .filter((g) => g.parentGroupId === focusedGroupId)
          .map((g) => g.id);
        const targetSet = new Set([focusedGroupId, ...childIds]);
        if (!personMems.some((m) => targetSet.has(m.groupId))) return;
      }

      const key = `person:${person.id}`;
      visiblePersonKeys.add(key);

      const pos = activeDiagram.nodePositions[key] ||
        fallbackPeoplePositions[key] || {
          x: 80 + (idx % 3) * 420,
          y: 80 + Math.floor(idx / 3) * 200,
        };

      const resolved = resolvePersonView(
        person,
        actor,
        userProfiles,
        profileIcons,
        currentBundle.projectIcons
      );

      const globalRoles = person.globalRoleIds
        .map((rid) => currentBundle.project.roleTags.find((t) => t.id === rid))
        .filter((t): t is NonNullable<typeof t> => Boolean(t));

      const skills = person.skillIds
        .map((sid) => currentBundle.project.skillTags.find((t) => t.id === sid))
        .filter((t): t is NonNullable<typeof t> => Boolean(t));

      const groupMemberships = personMems
        .map((m) => {
          const grp = currentBundle.groups.find((g) => g.id === m.groupId);
          if (!grp) return null;
          const roles = m.roleIds
            .map((rid) => currentBundle.project.roleTags.find((t) => t.id === rid))
            .filter((t): t is NonNullable<typeof t> => Boolean(t));
          return {
            groupId: grp.id,
            groupName: grp.name,
            groupColor: grp.color,
            roles,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      const matchesSearch =
        !q ||
        resolved.effectiveDisplayName.toLowerCase().includes(q) ||
        globalRoles.some((r) => r.name.toLowerCase().includes(q)) ||
        groupMemberships.some(
          (gm) =>
            gm.groupName.toLowerCase().includes(q) ||
            gm.roles.some((r) => r.name.toLowerCase().includes(q))
        );

      nodes.push({
        id: key,
        type: 'personNode',
        position: pos,
        // レイヤー9: ユーザカード（zIndex: 30、選択時35）
        zIndex: selectedEntityKey === key ? 35 : 30,
        // キャンバス上のドラッグ移動は管理者・編集者のみ可能
        draggable: permissions.isEditor && interactionMode === 'move',
        data: {
          person,
          resolved,
          globalRoles,
          skills,
          groupMemberships,
          nodeStyle,
          isHighlighted: selectedEntityKey === key,
          isDimmed:
            (!matchesSearch && Boolean(q)) ||
            (Boolean(selectedEntityKey) && !connectedEntityKeys.has(key)),
          onFocusPerson: (pid: string) => onSelectEntityKey(`person:${pid}`),
          onOpenPerson: (pid: string) => {
            onSelectEntityKey(`person:${pid}`);
            onOpenPersonProfile(pid);
          },
        },
      });
    });

    // 人物間の関係線（矢印表示ONのとき表示、デフォルトON）
    if (activeDiagram.filterConfig?.showRelationships !== false) {
      const personRels = currentBundle.relationships.filter(
        (r) =>
          r.sourceKind === 'person' &&
          r.targetKind === 'person' &&
          visiblePersonKeys.has(`person:${r.sourceId}`) &&
          visiblePersonKeys.has(`person:${r.targetId}`)
      );

      const pairCounts = new Map<string, number>();
      for (const r of personRels) {
        const pk = [`person:${r.sourceId}`, `person:${r.targetId}`].sort().join('--');
        pairCounts.set(pk, (pairCounts.get(pk) || 0) + 1);
      }

      const pairIdxTracker = new Map<string, number>();
      for (const rel of personRels) {
        const sKey = `person:${rel.sourceId}`;
        const tKey = `person:${rel.targetId}`;
        const pk = [sKey, tKey].sort().join('--');
        const pairIndex = pairIdxTracker.get(pk) || 0;
        pairIdxTracker.set(pk, pairIndex + 1);
        const pairTotal = pairCounts.get(pk) || 1;
        const isEdgeSelected = selectedEntityKey === `rel:${rel.id}`;
        const isEdgeHighlighted =
          isEdgeSelected || selectedEntityKey === sKey || selectedEntityKey === tKey;

        const handles = resolveBestHandles(
          sKey,
          tKey,
          rel.sourceHandle,
          rel.targetHandle,
          nodes
        );
        const canEditRel = canManageRelationship(actor, rel, currentBundle);

        edges.push({
          id: `rel:${rel.id}`,
          source: sKey,
          target: tKey,
          sourceHandle: handles.sourceHandle,
          targetHandle: handles.targetHandle,
          type: 'smartRelation',
          reconnectable: isEdgeSelected && canEditRel,
          // 通常時はユーザ矢印（zIndex: 22、ラベル: 24）＜ ユーザカード（30〜35）
          // フォーカス時は矢印（zIndex: 40）＜ ラベル（50）
          zIndex: isEdgeHighlighted ? 40 : 22,
          markerEnd:
            rel.direction === 'forward' || rel.direction === 'bidirectional'
              ? { type: MarkerType.ArrowClosed, color: rel.color, width: 18, height: 18 }
              : undefined,
          markerStart:
            rel.direction === 'bidirectional'
              ? { type: MarkerType.ArrowClosed, color: rel.color, width: 18, height: 18 }
              : undefined,
          data: {
            relationshipId: rel.id,
            label: rel.label,
            direction: rel.direction,
            color: rel.color,
            lineStyle: rel.lineStyle,
            pairIndex,
            pairTotal,
            edgeTier: 'person',
            isHighlighted: isEdgeHighlighted,
            isSelected: isEdgeSelected,
            canReconnect: canEditRel,
            onFocusRelationship: (rid: string) => onSelectEntityKey(`rel:${rid}`),
            onOpenRelationship: canEditRel
              ? (rid: string) => onOpenRelationshipEditor(rid)
              : undefined,
          },
        });
      }
    }

    return { computedNodes: nodes, computedEdges: edges };
  }, [
    currentBundle,
    activeDiagram,
    searchQuery,
    actor,
    userProfiles,
    profileIcons,
    selectedEntityKey,
    connectedEntityKeys,
    permissions.isEditor,
    interactionMode,
    groupMemberCounts,
    dragHoverGroupId,
    dragIsCopyMode,
    onSelectEntityKey,
    onOpenGroupDetail,
    onOpenPersonProfile,
    onOpenRelationshipEditor,
    toggleGroupCollapse,
  ]);

  const [nodes, setNodes, onNodesChange] = useNodesState(computedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(computedEdges);

  useEffect(() => {
    setNodes(computedNodes);
  }, [computedNodes, setNodes]);

  useEffect(() => {
    setEdges(computedEdges);
  }, [computedEdges, setEdges]);

  // ノードのキャンバス絶対座標とグループ枠の当たり判定ヘルパー
  const findTargetGroupAtAbsolutePoint = useCallback(
    (absCenterX: number, absCenterY: number, allNodes: Node[]): { groupId: string; relX: number; relY: number } | null => {
      const nodeMap = new Map(allNodes.map((n) => [n.id, n]));

      const getAbsPos = (n: Node): { x: number; y: number } => {
        let x = n.position.x;
        let y = n.position.y;
        let currParentId = n.parentId;
        while (currParentId) {
          const p = nodeMap.get(currParentId);
          if (!p) break;
          x += p.position.x;
          y += p.position.y;
          currParentId = p.parentId;
        }
        return { x, y };
      };

      // 小グループ（内側）を優先して判定し、次に大グループ（外側）を判定する
      const groupNodes = allNodes.filter((n) => n.id.startsWith('group:'));
      const smallGroupNodes = groupNodes.filter((n) => Boolean(n.parentId));
      const largeGroupNodes = groupNodes.filter((n) => !n.parentId);

      for (const gn of [...smallGroupNodes, ...largeGroupNodes]) {
        const abs = getAbsPos(gn);
        const w = (gn.style?.width as number) || (gn.data?.width as number) || 300;
        const h = (gn.style?.height as number) || (gn.data?.height as number) || 220;
        if (
          absCenterX >= abs.x &&
          absCenterX <= abs.x + w &&
          absCenterY >= abs.y &&
          absCenterY <= abs.y + h
        ) {
          return {
            groupId: gn.id.replace('group:', ''),
            relX: Math.max(16, Math.round(absCenterX - abs.x - 85)),
            relY: Math.max(46, Math.round(absCenterY - abs.y - 30)),
          };
        }
      }
      return null;
    },
    []
  );

  // ドラッグ中のリアルタイム判定（別グループへの移動 or Ctrl/右ドラッグによるコピー表示）
  // ※ドラッグ移動は管理者・編集者のみ可能
  const handleNodeDrag = useCallback(
    (event: React.MouseEvent | MouseEvent | TouchEvent, node: Node) => {
      if (!permissions.isEditor) return;
      if (!activeDiagram || activeDiagram.viewMode !== 'mixed' || !currentBundle) return;
      if (!node.id.startsWith('mem:') && !node.id.startsWith('unaffiliated:')) return;

      const isCopy =
        ('ctrlKey' in event && Boolean(event.ctrlKey)) ||
        ('metaKey' in event && Boolean(event.metaKey)) ||
        ('altKey' in event && Boolean(event.altKey)) ||
        ('buttons' in event && (event.buttons === 2 || event.buttons === 3));

      setDragIsCopyMode(isCopy);

      const nodeMap = new Map(nodes.map((n) => [n.id, n]));
      let absX = node.position.x;
      let absY = node.position.y;
      let currParentId = node.parentId;
      while (currParentId) {
        const p = nodeMap.get(currParentId);
        if (!p) break;
        absX += p.position.x;
        absY += p.position.y;
        currParentId = p.parentId;
      }

      const hit = findTargetGroupAtAbsolutePoint(absX + 90, absY + 32, nodes);
      const currentGroupId = (node.data?.groupId as string | null) || null;
      if (hit && hit.groupId !== currentGroupId) {
        setDragHoverGroupId(hit.groupId);
      } else {
        setDragHoverGroupId(null);
      }
    },
    [activeDiagram, currentBundle, findTargetGroupAtAbsolutePoint, nodes, permissions.isEditor]
  );

  // ドラッグ終了時の処理（管理者・編集者のみ可能）：
  // - 初期画面（所属中心）で人物ノードを別のグループ枠へドロップした場合：
  //   - 通常ドラッグ：元の所属を新しいグループへ「移動」
  //   - Ctrl+ドラッグ（またはAlt/Cmd/右ドラッグ）：元の所属を残したまま新しいグループにも「コピー（複数所属追加）」
  // - 同じグループ枠内でドロップした場合：枠からはみ出ないようクランプして座標保存
  const handleNodeDragStop = useCallback(
    async (event: React.MouseEvent | MouseEvent | TouchEvent, node: Node) => {
      setDragHoverGroupId(null);
      setDragIsCopyMode(false);
      if (!activeDiagram || !currentBundle || !permissions.isEditor) return;

      if (
        activeDiagram.viewMode === 'mixed' &&
        (node.id.startsWith('mem:') || node.id.startsWith('unaffiliated:'))
      ) {
        const isCopy =
          ('ctrlKey' in event && Boolean(event.ctrlKey)) ||
          ('metaKey' in event && Boolean(event.metaKey)) ||
          ('altKey' in event && Boolean(event.altKey)) ||
          ('button' in event && event.button === 2);

        const nodeMap = new Map(nodes.map((n) => [n.id, n]));
        let absX = node.position.x;
        let absY = node.position.y;
        let currParentId = node.parentId;
        while (currParentId) {
          const p = nodeMap.get(currParentId);
          if (!p) break;
          absX += p.position.x;
          absY += p.position.y;
          currParentId = p.parentId;
        }

        const hit = findTargetGroupAtAbsolutePoint(absX + 90, absY + 32, nodes);
        const currentGroupId = (node.data?.groupId as string | null) || null;
        const membershipId = (node.data?.membershipId as string | null) || null;
        const person = node.data?.person as { id: string; displayName: string } | undefined;

        if (person && hit && hit.groupId !== currentGroupId) {
          const targetGroup = currentBundle.groups.find((g) => g.id === hit.groupId);
          const result = await moveOrCopyMembershipByDrag({
            personId: person.id,
            sourceMembershipId: membershipId,
            targetGroupId: hit.groupId,
            isCopy,
          });
          await updateNodePosition(activeDiagram.id, `mem:${result.membershipId}`, {
            x: hit.relX,
            y: hit.relY,
          });
          if (targetGroup) {
            setDragFeedbackToast(
              result.action === 'copied'
                ? `「${person.displayName}」を「${targetGroup.name}」にも複数所属（コピー）させました`
                : `「${person.displayName}」の所属を「${targetGroup.name}」へ移動しました`
            );
            setTimeout(() => setDragFeedbackToast(null), 3500);
          }
          return;
        }

        // 同じグループ内（または枠外へ出そうとした場合）は所属グループ枠の内部に座標を収める
        const clampedX = Math.max(16, Math.round(node.position.x));
        const clampedY = Math.max(46, Math.round(node.position.y));
        await updateNodePosition(activeDiagram.id, node.id, {
          x: clampedX,
          y: clampedY,
        });
        return;
      }

      // グループノードまたは人物図のノード座標保存
      await updateNodePosition(activeDiagram.id, node.id, {
        x: Math.round(node.position.x),
        y: Math.round(node.position.y),
      });
    },
    [
      activeDiagram,
      currentBundle,
      findTargetGroupAtAbsolutePoint,
      moveOrCopyMembershipByDrag,
      nodes,
      permissions.isEditor,
      updateNodePosition,
    ]
  );

  const resolveNodeEndpoint = useCallback(
    (handleNodeId: string): { kind: EntityKind; id: string } | null => {
      if (!currentBundle) return null;
      if (handleNodeId.startsWith('group:')) {
        return { kind: 'group', id: handleNodeId.replace('group:', '') };
      }
      if (handleNodeId.startsWith('person:')) {
        return { kind: 'person', id: handleNodeId.replace('person:', '') };
      }
      if (handleNodeId.startsWith('unaffiliated:')) {
        return { kind: 'person', id: handleNodeId.replace('unaffiliated:', '') };
      }
      if (handleNodeId.startsWith('mem:')) {
        const memId = handleNodeId.replace('mem:', '');
        const mem = currentBundle.memberships.find((m) => m.id === memId);
        if (mem) return { kind: 'person', id: mem.personId };
      }
      return null;
    },
    [currentBundle]
  );

  // キャンバス上の四方の点から別の四方の点へドラッグして新規関係線を作成
  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target || !currentBundle) {
        return;
      }

      const src = resolveNodeEndpoint(connection.source);
      const tgt = resolveNodeEndpoint(connection.target);
      if (!src || !tgt) return;

      if (
        !canManageRelationship(
          actor,
          {
            sourceKind: src.kind,
            sourceId: src.id,
            targetKind: tgt.kind,
            targetId: tgt.id,
          },
          currentBundle
        )
      ) {
        setDragFeedbackToast(
          '一般ログインユーザーは、自分自身の人物カードが関わる関係線のみ作成できます'
        );
        setTimeout(() => setDragFeedbackToast(null), 3200);
        return;
      }

      const srcHandle = normalizeHandleSide(connection.sourceHandle);
      const tgtHandle = normalizeHandleSide(connection.targetHandle);

      onOpenRelationshipEditor(null, src, tgt, srcHandle, tgtHandle);
    },
    [actor, currentBundle, onOpenRelationshipEditor, resolveNodeEndpoint]
  );

  // 線を選択してから結点（端点）を別の四方（または別カード）へドラッグして結合場所を付け替える
  const handleReconnect = useCallback(
    async (oldEdge: Edge, newConnection: Connection) => {
      if (!currentBundle || !newConnection.source || !newConnection.target) {
        return;
      }
      const relId = oldEdge.id.replace('rel:', '').split('__')[0];
      const existingRel = currentBundle.relationships.find((r) => r.id === relId);
      if (!existingRel) return;

      const src = resolveNodeEndpoint(newConnection.source);
      const tgt = resolveNodeEndpoint(newConnection.target);
      if (!src || !tgt) return;

      if (
        !canManageRelationship(actor, existingRel, currentBundle) ||
        !canManageRelationship(
          actor,
          {
            sourceKind: src.kind,
            sourceId: src.id,
            targetKind: tgt.kind,
            targetId: tgt.id,
          },
          currentBundle
        )
      ) {
        return;
      }

      const srcHandle =
        normalizeHandleSide(newConnection.sourceHandle) ??
        normalizeHandleSide(oldEdge.sourceHandle) ??
        existingRel.sourceHandle ??
        null;
      const tgtHandle =
        normalizeHandleSide(newConnection.targetHandle) ??
        normalizeHandleSide(oldEdge.targetHandle) ??
        existingRel.targetHandle ??
        null;

      await upsertRelationship({
        id: existingRel.id,
        sourceKind: src.kind,
        sourceId: src.id,
        targetKind: tgt.kind,
        targetId: tgt.id,
        sourceHandle: srcHandle,
        targetHandle: tgtHandle,
        label: existingRel.label,
        tagIds: existingRel.tagIds,
        direction: existingRel.direction,
        color: existingRel.color,
        lineStyle: existingRel.lineStyle,
        memo: existingRel.memo,
      });

      onSelectEntityKey(`rel:${relId}`);
      setDragFeedbackToast(`関係線「${existingRel.label}」の結合場所を付け替えました`);
      setTimeout(() => setDragFeedbackToast(null), 2800);
    },
    [actor, currentBundle, onSelectEntityKey, resolveNodeEndpoint, upsertRelationship]
  );

  // 自動整列の実行
  const handleAutoLayout = async () => {
    if (!currentBundle || !activeDiagram || !permissions.isEditor) return;
    const nextPositions = computeAutoLayoutPositions(
      activeDiagram.viewMode,
      currentBundle.groups,
      currentBundle.people,
      currentBundle.memberships,
      currentBundle.relationships,
      activeDiagram.collapsedGroupIds
    );
    await updateMultipleNodePositions(activeDiagram.id, nextPositions);
  };

  // PNG書き出し
  const handleExportPng = async () => {
    if (!canvasWrapperRef.current || !activeDiagram) return;
    setIsExportingPng(true);
    try {
      const dataUrl = await toPng(canvasWrapperRef.current, {
        backgroundColor: '#f8fafc',
        pixelRatio: 2,
        cacheBust: false,
      });
      const link = document.createElement('a');
      const safeName = activeDiagram.name.replace(/[\\/:*?"<>|\s]+/g, '_');
      link.download = `kizunamap_${safeName}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('PNG書き出しに失敗しました:', err);
    } finally {
      setIsExportingPng(false);
    }
  };

  if (!currentBundle || !activeDiagram) return null;

  const focusedGroupId = activeDiagram.filterConfig?.focusedGroupId || null;
  const myLinkedPerson = currentBundle.people.find(
    (p) => actor.uid && p.linkedUid === actor.uid
  );
  const canInteractOnCanvas = permissions.isEditor || Boolean(myLinkedPerson);

  const isArrowsVisible =
    activeDiagram.viewMode === 'mixed'
      ? Boolean(activeDiagram.filterConfig?.showMixedArrows)
      : activeDiagram.filterConfig?.showRelationships !== false;

  const handleToggleArrows = () => {
    if (activeDiagram.viewMode === 'mixed') {
      updateDiagram(activeDiagram.id, {
        filterConfig: {
          ...activeDiagram.filterConfig,
          showMixedArrows: !activeDiagram.filterConfig?.showMixedArrows,
        },
      });
    } else {
      updateDiagram(activeDiagram.id, {
        filterConfig: {
          ...activeDiagram.filterConfig,
          showRelationships: activeDiagram.filterConfig?.showRelationships === false,
        },
      });
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden">
      {/* 1. 相関図タブバー（〇〇中心の表記を無くしてコンパクト化・ダブルクリックでタブ名変更） */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-100/90 px-2.5 pt-1 gap-2 overflow-x-auto">
        <div className="flex items-center gap-1 overflow-x-auto">
          {currentBundle.diagrams.map((diag) => {
            const isActive = diag.id === activeDiagram.id;
            const cleanTabName =
              diag.name
                .replace(/[（(](所属中心|人中心|グループ中心|所属|人|グループ)[)）]/g, '')
                .trim() || diag.name;

            return (
              <div
                key={diag.id}
                onClick={() => setActiveDiagramId(diag.id)}
                onDoubleClick={() => {
                  if (permissions.isEditor) {
                    setEditingTabId(diag.id);
                    setDiagramTitleDraft(cleanTabName);
                  }
                }}
                title={
                  permissions.isEditor
                    ? 'クリックで切替 / ダブルクリックでタブ名変更'
                    : 'クリックでタブ切替'
                }
                className={`group flex items-center gap-1.5 rounded-t-lg px-2.5 py-1.5 text-xs font-bold cursor-pointer border-t border-x transition select-none whitespace-nowrap ${
                  isActive
                    ? 'bg-white text-indigo-700 border-slate-200 shadow-2xs'
                    : 'bg-slate-200/60 text-slate-600 border-transparent hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                <Network size={12} className={isActive ? 'text-indigo-600' : 'text-slate-400'} />
                {editingTabId === diag.id && permissions.isEditor ? (
                  <input
                    type="text"
                    autoFocus
                    value={diagramTitleDraft}
                    onChange={(e) => setDiagramTitleDraft(e.target.value)}
                    onBlur={() => {
                      if (diagramTitleDraft.trim()) {
                        updateDiagram(diag.id, { name: diagramTitleDraft.trim() });
                      }
                      setEditingTabId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === 'Escape') {
                        if (e.key === 'Enter' && diagramTitleDraft.trim()) {
                          updateDiagram(diag.id, { name: diagramTitleDraft.trim() });
                        }
                        setEditingTabId(null);
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-28 rounded border border-indigo-400 bg-white px-1 py-0 text-xs font-bold text-slate-900 focus:outline-none"
                  />
                ) : (
                  <span>{cleanTabName}</span>
                )}

                {permissions.isEditor && isActive && (
                  <div className="flex items-center gap-0.5 ml-0.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        duplicateDiagram(diag.id);
                      }}
                      className="p-0.5 text-slate-400 hover:text-indigo-600 rounded"
                      title="この図を複製"
                    >
                      <Copy size={11} />
                    </button>
                    {currentBundle.diagrams.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteDiagId(diag.id);
                        }}
                        className="p-0.5 text-slate-400 hover:text-rose-600 rounded"
                        title="この図を削除"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {permissions.isEditor && (
            <button
              type="button"
              onClick={() =>
                createDiagram(
                  `相関図タブ ${currentBundle.diagrams.length + 1}`,
                  '',
                  'mixed'
                )
              }
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-slate-600 hover:bg-slate-200/80 mb-0.5"
            >
              <Plus size={13} /> タブ追加
            </button>
          )}
        </div>

        {confirmDeleteDiagId && (
          <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 px-3 py-1 rounded-lg mb-1 text-xs">
            <span className="font-bold text-rose-800">
              この図タブを削除しますか？（人物やグループ自体は削除されません）
            </span>
            <button
              type="button"
              onClick={async () => {
                await deleteDiagram(confirmDeleteDiagId);
                setConfirmDeleteDiagId(null);
              }}
              className="rounded bg-rose-600 px-2 py-0.5 text-[11px] font-bold text-white"
            >
              削除する
            </button>
            <button
              type="button"
              onClick={() => setConfirmDeleteDiagId(null)}
              className="rounded bg-white border border-slate-300 px-2 py-0.5 text-[11px]"
            >
              キャンセル
            </button>
          </div>
        )}
      </div>

      {/* 2. ツールバー（全表示モード共通・2行にすっきり収まる構成） */}
      <div className="bg-white border-b border-slate-200 px-3 py-1.5 space-y-1.5">
        {/* 1行目：図モード切替 ＋ グループ絞り込み・元に戻す・自動整列・PNG書き出し */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex rounded-xl bg-slate-100 p-0.5 border border-slate-200">
            {(
              [
                { id: 'mixed', label: '初期画面（所属中心）', icon: GitBranch },
                { id: 'people', label: '人物図（人中心）', icon: Users },
                { id: 'groups', label: 'グループ図（グループ中心）', icon: Network },
              ] as const
            ).map((m) => {
              const Icon = m.icon;
              const active = activeDiagram.viewMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() =>
                    updateDiagram(activeDiagram.id, {
                      viewMode: m.id as DiagramViewMode,
                    })
                  }
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-extrabold transition ${
                    active
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  data-testid={`viewmode-${m.id}`}
                >
                  <Icon size={13} />
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-xs">
              <Filter size={13} className="text-slate-400" />
              <select
                value={focusedGroupId || ''}
                onChange={(e) =>
                  updateDiagram(activeDiagram.id, {
                    filterConfig: {
                      ...activeDiagram.filterConfig,
                      focusedGroupId: e.target.value || null,
                    },
                  })
                }
                className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none"
              >
                <option value="">すべてのグループを表示</option>
                {currentBundle.groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.kind === 'large' ? '■ ' : '└ '}
                    {g.name} で絞り込み
                  </option>
                ))}
              </select>
            </div>

            {permissions.isEditor && (
              <>
                <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5">
                  <button
                    type="button"
                    disabled={!canUndo}
                    onClick={undoLastAction}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-35"
                  >
                    <Undo2 size={13} /> 元に戻す
                  </button>
                  <button
                    type="button"
                    disabled={!canRedo}
                    onClick={redoLastAction}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-35"
                  >
                    <Redo2 size={13} /> やり直す
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleAutoLayout}
                  className="inline-flex items-center gap-1 rounded-xl bg-indigo-50 border border-indigo-200 px-2.5 py-1 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition"
                >
                  <Sparkles size={13} />
                  自動整列
                </button>
              </>
            )}

            <button
              type="button"
              disabled={isExportingPng}
              onClick={handleExportPng}
              className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-2.5 py-1 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              <Camera size={13} />
              {isExportingPng ? 'PNG出力中...' : 'PNG書き出し'}
            </button>
          </div>
        </div>

        {/* 2行目：カード表示・コンパクト表示 ＋ 移動・つなぐ ＋ 矢印表示（ON/OFF・デフォルトOFF） */}
        <div className="flex flex-wrap items-center gap-2">
          {/* カードスタイル切替（全モード共通配置） */}
          <div className="inline-flex rounded-xl bg-slate-100 p-0.5 border border-slate-200">
            {(
              [
                { id: 'card', label: 'カード表示', icon: LayoutList },
                { id: 'compact', label: 'コンパクト表示', icon: LayoutGrid },
              ] as const
            ).map((st) => {
              const Icon = st.icon;
              const active = activeDiagram.nodeStyle === st.id;
              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() =>
                    updateDiagram(activeDiagram.id, {
                      nodeStyle: st.id as NodeDisplayStyle,
                    })
                  }
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                    active
                      ? 'bg-white text-indigo-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  data-testid={`nodestyle-${st.id}`}
                >
                  <Icon size={13} />
                  <span>{st.label}</span>
                </button>
              );
            })}
          </div>

          {/* 移動 / つなぐ（関係線作成）切替（キャンバス上からツールバー2行目へ統合） */}
          <div className="inline-flex rounded-xl bg-slate-100 p-0.5 border border-slate-200">
            <button
              type="button"
              onClick={() => setInteractionMode('move')}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-extrabold transition ${
                interactionMode === 'move'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MousePointerClick size={13} /> 移動 / 所属ドラッグ
            </button>
            <button
              type="button"
              disabled={!canInteractOnCanvas}
              onClick={() => setInteractionMode('connect')}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-extrabold transition disabled:opacity-40 ${
                interactionMode === 'connect'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Link2 size={13} /> つなぐ（関係線作成）
            </button>
          </div>

          {/* 矢印表示（ON/OFF・初期画面はデフォルトOFF） */}
          <button
            type="button"
            onClick={handleToggleArrows}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1 text-xs font-extrabold transition ${
              isArrowsVisible
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                : 'bg-slate-100 text-slate-600 border-slate-200 hover:text-slate-900'
            }`}
            data-testid="toggle-arrows-btn"
          >
            <Link2 size={13} />
            <span>矢印表示：{isArrowsVisible ? 'ON' : 'OFF'}</span>
          </button>

          {selectedEntityKey && (
            <button
              type="button"
              onClick={() => onSelectEntityKey(null)}
              className="inline-flex items-center gap-1 rounded-xl bg-slate-900 text-white px-2.5 py-1 text-xs font-bold shadow-2xs hover:bg-slate-800"
            >
              <X size={13} /> 選択解除
            </button>
          )}
        </div>
      </div>

      {/* 3. キャンバス領域 */}
      <div
        ref={canvasWrapperRef}
        onContextMenu={(e) => e.preventDefault()}
        className="relative flex-1 w-full h-full"
      >
        {/* ドラッグ移動・コピー完了トースト */}
        {dragFeedbackToast && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 rounded-xl bg-slate-900 text-white px-4 py-2 text-xs font-bold shadow-lg border border-slate-700">
            {dragFeedbackToast}
          </div>
        )}

        {/* 左下ガイドバー（現在の図モードに応じた操作説明） */}
        <div className="absolute bottom-3 left-3 z-10 flex flex-wrap items-center gap-3 rounded-xl bg-white/95 backdrop-blur-xs px-3.5 py-2 text-[11px] font-semibold text-slate-700 shadow-sm border border-slate-200">
          {activeDiagram.viewMode === 'mixed' && (
            <>
              <span className="font-extrabold text-indigo-700">【初期画面：所属中心】</span>
              <span>クリック＝フォーカス / <strong>ダブルクリック＝詳細表示</strong></span>
              {permissions.isEditor && (
                <>
                  <span>/</span>
                  <span>別枠へドラッグ＝<strong>所属移動</strong></span>
                  <span>/</span>
                  <span className="text-emerald-700 font-bold">
                    Ctrl+ドラッグ＝<strong>所属コピー（兼務）</strong>
                  </span>
                </>
              )}
            </>
          )}
          {activeDiagram.viewMode === 'people' && (
            <>
              <span className="font-extrabold text-indigo-700">【人物図：人中心】</span>
              <span>クリック＝選択 / <strong>ダブルクリック＝詳細・編集</strong> / <strong>線を選択して端点を四方へドラッグ＝結合場所の付け替え</strong></span>
            </>
          )}
          {activeDiagram.viewMode === 'groups' && (
            <>
              <span className="font-extrabold text-indigo-700">【グループ図：グループ中心】</span>
              <span>クリック＝選択 / <strong>ダブルクリック＝詳細・編集</strong> / <strong>線を選択して端点を四方へドラッグ＝結合場所の付け替え</strong></span>
            </>
          )}
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDrag={handleNodeDrag}
          onNodeDragStop={handleNodeDragStop}
          onConnect={handleConnect}
          onReconnect={handleReconnect}
          edgesReconnectable={canInteractOnCanvas}
          reconnectRadius={24}
          connectionRadius={36}
          connectionMode={ConnectionMode.Loose}
          onEdgeClick={(e, edge) => {
            e.stopPropagation();
            if (!edge.id.startsWith('rel:')) return;
            const relId = edge.id.replace('rel:', '').split('__')[0];
            const rel = currentBundle.relationships.find((r) => r.id === relId);
            const now = Date.now();
            const prev = lastEdgeTapRef.current;
            lastEdgeTapRef.current = { edgeId: edge.id, time: now };

            if (prev.edgeId === edge.id && now - prev.time < 330) {
              if (rel && canManageRelationship(actor, rel, currentBundle)) {
                onOpenRelationshipEditor(relId);
              }
            } else {
              onSelectEntityKey(`rel:${relId}`);
            }
          }}
          onEdgeDoubleClick={(e, edge) => {
            e.stopPropagation();
            if (edge.id.startsWith('rel:')) {
              const relId = edge.id.replace('rel:', '').split('__')[0];
              const rel = currentBundle.relationships.find((r) => r.id === relId);
              if (rel && canManageRelationship(actor, rel, currentBundle)) {
                onOpenRelationshipEditor(relId);
              }
            }
          }}
          onPaneClick={() => onSelectEntityKey(null)}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          zIndexMode="manual"
          elevateNodesOnSelect={false}
          elevateEdgesOnSelect={false}
          fitView
          fitViewOptions={{ padding: 0.14 }}
          minZoom={0.15}
          maxZoom={2}
        >
          <Background color="#cbd5e1" gap={20} size={1} />
          <Controls position="bottom-right" />
          <MiniMap
            position="top-right"
            pannable
            zoomable
            className="!bg-white/90 !border !border-slate-200 !rounded-xl !shadow-sm"
          />
        </ReactFlow>
      </div>
    </div>
  );
};
