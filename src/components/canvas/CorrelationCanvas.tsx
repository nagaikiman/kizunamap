import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
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
import type { DiagramViewMode, EntityKind, NodeDisplayStyle } from '../../types/domain';
import { calculateGroupMemberCounts } from '../../utils/groupRules';
import { computeAutoLayoutPositions } from '../../utils/layoutEngine';
import { resolvePersonView } from '../../utils/securityGuards';
import { GroupFlowNode, PersonFlowNode } from './CustomNodes';

const nodeTypes = {
  personNode: PersonFlowNode,
  groupNode: GroupFlowNode,
};

interface CorrelationCanvasProps {
  selectedEntityKey: string | null; // "person:{id}" or "group:{id}"
  onSelectEntityKey: (key: string | null) => void;
  onOpenPersonProfile: (personId: string) => void;
  onOpenGroupDetail: (groupId: string) => void;
  onOpenRelationshipEditor: (
    relId?: string | null,
    src?: { kind: EntityKind; id: string },
    tgt?: { kind: EntityKind; id: string }
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
    canUndo,
    canRedo,
    undoLastAction,
    redoLastAction,
  } = useAppState();

  const canvasWrapperRef = useRef<HTMLDivElement | null>(null);
  const [interactionMode, setInteractionMode] = useState<'move' | 'connect'>('move');
  const [confirmDeleteDiagId, setConfirmDeleteDiagId] = useState<string | null>(null);
  const [isExportingPng, setIsExportingPng] = useState(false);

  // 図タイトル・説明のデバウンス自動保存ステート（入力が一定時間止まった時に保存）
  const [diagramTitleDraft, setDiagramTitleDraft] = useState(activeDiagram?.name || '');
  const [diagramDescDraft, setDiagramDescDraft] = useState(activeDiagram?.description || '');

  useEffect(() => {
    setDiagramTitleDraft(activeDiagram?.name || '');
    setDiagramDescDraft(activeDiagram?.description || '');
  }, [activeDiagram?.id, activeDiagram?.name, activeDiagram?.description]);

  useEffect(() => {
    if (!activeDiagram || !permissions.isEditor) return;
    if (
      diagramTitleDraft === activeDiagram.name &&
      diagramDescDraft === activeDiagram.description
    ) {
      return;
    }
    const timer = setTimeout(() => {
      if (diagramTitleDraft.trim()) {
        updateDiagram(activeDiagram.id, {
          name: diagramTitleDraft.trim(),
          description: diagramDescDraft,
        });
      }
    }, 650);
    return () => clearTimeout(timer);
  }, [
    diagramTitleDraft,
    diagramDescDraft,
    activeDiagram,
    permissions.isEditor,
    updateDiagram,
  ]);

  // グループ人数集計（重複除外済）
  const groupMemberCounts = useMemo(() => {
    if (!currentBundle) return {};
    return calculateGroupMemberCounts(
      currentBundle.groups,
      currentBundle.memberships,
      currentBundle.people
    );
  }, [currentBundle]);

  // 選択対象に関連するノード集合の算出（ハイライト強調用）
  const connectedNodeKeys = useMemo(() => {
    const set = new Set<string>();
    if (!selectedEntityKey || !currentBundle) return set;
    set.add(selectedEntityKey);

    for (const rel of currentBundle.relationships) {
      const sKey = `${rel.sourceKind}:${rel.sourceId}`;
      const tKey = `${rel.targetKind}:${rel.targetId}`;
      if (sKey === selectedEntityKey) set.add(tKey);
      if (tKey === selectedEntityKey) set.add(sKey);
    }

    for (const mem of currentBundle.memberships) {
      const pKey = `person:${mem.personId}`;
      const gKey = `group:${mem.groupId}`;
      if (pKey === selectedEntityKey) set.add(gKey);
      if (gKey === selectedEntityKey) set.add(pKey);
    }

    for (const grp of currentBundle.groups) {
      if (grp.kind === 'small' && grp.parentGroupId) {
        const pKey = `group:${grp.parentGroupId}`;
        const cKey = `group:${grp.id}`;
        if (pKey === selectedEntityKey) set.add(cKey);
        if (cKey === selectedEntityKey) set.add(pKey);
      }
    }

    return set;
  }, [currentBundle, selectedEntityKey]);

  // モード（混合図 / 人物相関図 / グループ相関図）に応じたノード・エッジ構築
  const { computedNodes, computedEdges } = useMemo(() => {
    if (!currentBundle || !activeDiagram) {
      return { computedNodes: [] as Node[], computedEdges: [] as Edge[] };
    }

    const viewMode = activeDiagram.viewMode;
    const nodeStyle = activeDiagram.nodeStyle;
    const collapsedSet = new Set(activeDiagram.collapsedGroupIds);
    const focusedGroupId = activeDiagram.filterConfig?.focusedGroupId || null;
    const q = searchQuery.trim().toLowerCase();

    // 座標が未登録のノード用に自動整列座標をフォールバック計算
    const fallbackPositions = computeAutoLayoutPositions(
      viewMode,
      currentBundle.groups,
      currentBundle.people,
      currentBundle.memberships,
      currentBundle.relationships,
      activeDiagram.collapsedGroupIds
    );

    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const visibleNodeKeys = new Set<string>();

    // 1. グループノード生成（グループ相関図 または 混合図）
    if (viewMode === 'groups' || viewMode === 'mixed') {
      currentBundle.groups.forEach((grp, idx) => {
        if (
          grp.kind === 'small' &&
          grp.parentGroupId &&
          collapsedSet.has(grp.parentGroupId)
        ) {
          return;
        }
        if (
          focusedGroupId &&
          grp.id !== focusedGroupId &&
          grp.parentGroupId !== focusedGroupId
        ) {
          return;
        }

        const key = `group:${grp.id}`;
        visibleNodeKeys.add(key);

        const pos = activeDiagram.nodePositions[key] ||
          fallbackPositions[key] || {
            x: 100 + (idx % 4) * 300,
            y: grp.kind === 'large' ? 60 : 250,
          };

        const parentGrp =
          grp.kind === 'small' && grp.parentGroupId
            ? currentBundle.groups.find((g) => g.id === grp.parentGroupId) || null
            : null;

        const hasChildren =
          grp.kind === 'large' &&
          currentBundle.groups.some((g) => g.kind === 'small' && g.parentGroupId === grp.id);

        // グループ内のロール集計
        const roleCountMap = new Map<string, { roleName: string; roleColor: string; count: number }>();
        currentBundle.memberships
          .filter((m) => m.groupId === grp.id)
          .forEach((m) => {
            m.roleIds.forEach((rid) => {
              const rTag = currentBundle.project.roleTags.find((t) => t.id === rid);
              if (!rTag) return;
              const prev = roleCountMap.get(rid);
              if (prev) {
                prev.count += 1;
              } else {
                roleCountMap.set(rid, {
                  roleName: rTag.name,
                  roleColor: rTag.color,
                  count: 1,
                });
              }
            });
          });

        const iconDoc = grp.iconId ? currentBundle.projectIcons[grp.iconId] : null;
        const matchesSearch = !q || grp.name.toLowerCase().includes(q);
        const isHighlighted = selectedEntityKey === key;
        const isDimmed =
          (!matchesSearch && Boolean(q)) ||
          (Boolean(selectedEntityKey) && !connectedNodeKeys.has(key));

        nodes.push({
          id: key,
          type: 'groupNode',
          position: pos,
          draggable: permissions.isEditor && interactionMode === 'move',
          data: {
            group: grp,
            parentGroupName: parentGrp?.name || null,
            iconDataUrl: iconDoc?.dataUrl || null,
            directCount: groupMemberCounts[grp.id]?.directCount ?? 0,
            totalCount: groupMemberCounts[grp.id]?.totalCount ?? 0,
            roleSummary: Array.from(roleCountMap.values()),
            isCollapsed: collapsedSet.has(grp.id),
            hasChildren,
            isHighlighted,
            isDimmed,
            onSelectGroup: (gid: string) => {
              onSelectEntityKey(`group:${gid}`);
              onOpenGroupDetail(gid);
            },
            onToggleCollapse: (gid: string) => toggleGroupCollapse(activeDiagram.id, gid),
          },
        });
      });

      // 大グループ → 小グループの階層親子エッジ（任意の関係線や所属線と明確に区別）
      currentBundle.groups.forEach((grp) => {
        if (grp.kind === 'small' && grp.parentGroupId) {
          const pKey = `group:${grp.parentGroupId}`;
          const cKey = `group:${grp.id}`;
          if (visibleNodeKeys.has(pKey) && visibleNodeKeys.has(cKey)) {
            edges.push({
              id: `hierarchy:${grp.parentGroupId}->${grp.id}`,
              source: pKey,
              target: cKey,
              type: 'smoothstep',
              label: '階層(親子)',
              style: {
                stroke: '#94a3b8',
                strokeWidth: 2,
                strokeDasharray: '3 3',
              },
              labelStyle: {
                fill: '#64748b',
                fontSize: 10,
                fontWeight: 700,
              },
              labelBgStyle: {
                fill: '#f8fafc',
                fillOpacity: 0.9,
              },
            });
          }
        }
      });
    }

    // 2. 人物ノード生成（人物相関図 または 混合図）
    if (viewMode === 'people' || viewMode === 'mixed') {
      currentBundle.people.forEach((person, idx) => {
        const personMems = currentBundle.memberships.filter((m) => m.personId === person.id);

        if (focusedGroupId) {
          const childIds = currentBundle.groups
            .filter((g) => g.parentGroupId === focusedGroupId)
            .map((g) => g.id);
          const targetGroupSet = new Set([focusedGroupId, ...childIds]);
          const belongs = personMems.some((m) => targetGroupSet.has(m.groupId));
          if (!belongs) return;
        }

        const key = `person:${person.id}`;
        visibleNodeKeys.add(key);

        const pos = activeDiagram.nodePositions[key] ||
          fallbackPositions[key] || {
            x: 120 + (idx % 4) * 280,
            y: 420 + Math.floor(idx / 4) * 200,
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

        const isHighlighted = selectedEntityKey === key;
        const isDimmed =
          (!matchesSearch && Boolean(q)) ||
          (Boolean(selectedEntityKey) && !connectedNodeKeys.has(key));

        nodes.push({
          id: key,
          type: 'personNode',
          position: pos,
          draggable: permissions.isEditor && interactionMode === 'move',
          data: {
            person,
            resolved,
            globalRoles,
            skills,
            groupMemberships,
            nodeStyle,
            isHighlighted,
            isDimmed,
            onSelectPerson: (pid: string) => {
              onSelectEntityKey(`person:${pid}`);
              onOpenPersonProfile(pid);
            },
          },
        });
      });
    }

    // 3. 混合図での所属線（1つの人物ノードから複数グループへ所属線を引いて、線上にグループ内ロールを表示）
    if (viewMode === 'mixed') {
      currentBundle.memberships.forEach((mem) => {
        const grp = currentBundle.groups.find((g) => g.id === mem.groupId);
        if (!grp) return;

        // もし小グループの親が折りたたまれている場合は親グループへ接続
        const effectiveGroupId =
          grp.kind === 'small' &&
          grp.parentGroupId &&
          collapsedSet.has(grp.parentGroupId)
            ? grp.parentGroupId
            : grp.id;

        const gKey = `group:${effectiveGroupId}`;
        const pKey = `person:${mem.personId}`;
        if (!visibleNodeKeys.has(gKey) || !visibleNodeKeys.has(pKey)) return;

        const roleNames = mem.roleIds
          .map((rid) => currentBundle.project.roleTags.find((t) => t.id === rid)?.name)
          .filter(Boolean);

        const roleLabel =
          roleNames.length > 0 ? `所属ロール: ${roleNames.join('・')}` : '所属';

        const isEdgeHighlighted =
          selectedEntityKey === gKey || selectedEntityKey === pKey;

        edges.push({
          id: `membership:${mem.id}`,
          source: gKey,
          target: pKey,
          label: roleLabel,
          animated: isEdgeHighlighted,
          style: {
            stroke: grp.color || '#4f46e5',
            strokeWidth: isEdgeHighlighted ? 3 : 2,
          },
          labelStyle: {
            fill: '#1e1b4b',
            fontWeight: 800,
            fontSize: 11,
          },
          labelBgStyle: {
            fill: '#eef2ff',
            stroke: grp.color || '#4f46e5',
            strokeWidth: 1,
            fillOpacity: 0.96,
          },
          labelBgPadding: [6, 4],
          labelBgBorderRadius: 6,
        });
      });
    }

    // 4. 任意の関係線（同じ対象間の複数関係にも対応し、所属線・親子線と区別して描画）
    const pairCounter = new Map<string, number>();
    currentBundle.relationships.forEach((rel) => {
      const sKey = `${rel.sourceKind}:${rel.sourceId}`;
      const tKey = `${rel.targetKind}:${rel.targetId}`;
      if (!visibleNodeKeys.has(sKey) || !visibleNodeKeys.has(tKey)) return;

      const pairKey = [sKey, tKey].sort().join('--');
      const idxInPair = pairCounter.get(pairKey) || 0;
      pairCounter.set(pairKey, idxInPair + 1);

      const displayLabel =
        idxInPair > 0 ? `${rel.label} (#${idxInPair + 1})` : rel.label;

      const isEdgeHighlighted =
        selectedEntityKey === sKey || selectedEntityKey === tKey;

      edges.push({
        id: `rel:${rel.id}`,
        source: sKey,
        target: tKey,
        type: idxInPair > 0 ? 'smoothstep' : 'default',
        label: displayLabel,
        animated: isEdgeHighlighted,
        markerEnd:
          rel.direction === 'forward' || rel.direction === 'bidirectional'
            ? { type: MarkerType.ArrowClosed, color: rel.color, width: 18, height: 18 }
            : undefined,
        markerStart:
          rel.direction === 'bidirectional'
            ? { type: MarkerType.ArrowClosed, color: rel.color, width: 18, height: 18 }
            : undefined,
        style: {
          stroke: rel.color || '#475569',
          strokeWidth: isEdgeHighlighted ? 3 : 2,
          strokeDasharray: rel.lineStyle === 'dashed' ? '6 4' : undefined,
        },
        labelStyle: {
          fill: '#0f172a',
          fontWeight: 700,
          fontSize: 11,
        },
        labelBgStyle: {
          fill: '#ffffff',
          stroke: rel.color || '#cbd5e1',
          strokeWidth: 1,
          fillOpacity: 0.95,
        },
        labelBgPadding: [6, 3],
        labelBgBorderRadius: 6,
        data: { relationshipId: rel.id },
      });
    });

    return { computedNodes: nodes, computedEdges: edges };
  }, [
    currentBundle,
    activeDiagram,
    searchQuery,
    actor,
    userProfiles,
    profileIcons,
    selectedEntityKey,
    connectedNodeKeys,
    permissions.isEditor,
    interactionMode,
    groupMemberCounts,
    onSelectEntityKey,
    onOpenGroupDetail,
    onOpenPersonProfile,
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

  // ドラッグ終了時にそのノードの座標のみを保存
  const handleNodeDragStop = useCallback(
    (_event: React.MouseEvent | MouseEvent | TouchEvent, node: Node) => {
      if (!activeDiagram || !permissions.isEditor) return;
      updateNodePosition(activeDiagram.id, node.id, {
        x: Math.round(node.position.x),
        y: Math.round(node.position.y),
      });
    },
    [activeDiagram, permissions.isEditor, updateNodePosition]
  );

  // キャンバス上の接続操作で関係線を作成
  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!permissions.isEditor || !connection.source || !connection.target) return;
      const [srcKind, srcId] = connection.source.split(':') as [EntityKind, string];
      const [tgtKind, tgtId] = connection.target.split(':') as [EntityKind, string];
      if (!srcId || !tgtId) return;
      onOpenRelationshipEditor(
        null,
        { kind: srcKind, id: srcId },
        { kind: tgtKind, id: tgtId }
      );
    },
    [onOpenRelationshipEditor, permissions.isEditor]
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

  // PNG書き出し（Base64 WebPアイコン画像も含めて出力）
  const handleExportPng = async () => {
    if (!canvasWrapperRef.current || !activeDiagram) return;
    setIsExportingPng(true);
    try {
      const viewportEl = canvasWrapperRef.current.querySelector(
        '.react-flow__viewport'
      ) as HTMLElement | null;
      const targetEl = viewportEl ? canvasWrapperRef.current : canvasWrapperRef.current;
      const dataUrl = await toPng(targetEl, {
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

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden">
      {/* 1. 相関図タブバー（複数図の切り替え・新規追加・複製・削除確認） */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-100/90 px-3 pt-1.5 gap-2 overflow-x-auto">
        <div className="flex items-center gap-1 overflow-x-auto">
          {currentBundle.diagrams.map((diag) => {
            const isActive = diag.id === activeDiagram.id;
            return (
              <div
                key={diag.id}
                onClick={() => setActiveDiagramId(diag.id)}
                className={`group flex items-center gap-2 rounded-t-xl px-3.5 py-2 text-xs font-bold cursor-pointer border-t border-x transition select-none whitespace-nowrap ${
                  isActive
                    ? 'bg-white text-indigo-700 border-slate-200 shadow-2xs'
                    : 'bg-slate-200/60 text-slate-600 border-transparent hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                <Network size={13} className={isActive ? 'text-indigo-600' : 'text-slate-400'} />
                <span>{diag.name}</span>
                <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[10px] font-semibold text-slate-500">
                  {diag.viewMode === 'mixed'
                    ? '混合'
                    : diag.viewMode === 'people'
                    ? '人物'
                    : 'グループ'}
                </span>

                {permissions.isEditor && isActive && (
                  <div className="flex items-center gap-0.5 ml-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        duplicateDiagram(diag.id);
                      }}
                      className="p-0.5 text-slate-400 hover:text-indigo-600 rounded"
                      title="この図を複製"
                    >
                      <Copy size={12} />
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
                        <Trash2 size={12} />
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
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200/80 mb-1"
              title="新しい相関図タブを追加"
            >
              <Plus size={14} /> タブ追加
            </button>
          )}
        </div>

        {/* 図の削除確認インラインバー */}
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

      {/* 2. キャンバスヘッダー・モード切替・表示切替・自動整列・PNG書き出しツールバー */}
      <div className="bg-white border-b border-slate-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
        {/* 左：図の名前・説明（編集者はインライン編集・デバウンス自動保存） */}
        <div className="flex items-center gap-3 min-w-[220px] flex-1">
          <div className="min-w-0 flex-1 max-w-md">
            {permissions.isEditor ? (
              <input
                type="text"
                value={diagramTitleDraft}
                onChange={(e) => setDiagramTitleDraft(e.target.value)}
                placeholder="図のタイトルを入力..."
                className="w-full text-sm font-extrabold text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-indigo-500 focus:outline-none px-1 py-0.5"
              />
            ) : (
              <h2 className="text-sm font-extrabold text-slate-900 truncate">
                {activeDiagram.name}
              </h2>
            )}
          </div>

          {/* 3モード切替（混合図［デフォルト］ / 人物相関図 / グループ相関図） */}
          <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200">
            {(
              [
                { id: 'mixed', label: '混合図（ロール・所属中心）', icon: GitBranch },
                { id: 'people', label: '人物相関図', icon: Users },
                { id: 'groups', label: 'グループ相関図', icon: Network },
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
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition ${
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

          {/* 人物ノード表示スタイル切替（カード表示 / コンパクト表示） */}
          {activeDiagram.viewMode !== 'groups' && (
            <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200">
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
          )}
        </div>

        {/* 右：Undo/Redo・自動整列・グループ絞り込み・PNG書き出し */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* グループ絞り込みフィルタ */}
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
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-35"
                  title="元に戻す（自分の変更のみ）"
                >
                  <Undo2 size={14} /> 元に戻す
                </button>
                <button
                  type="button"
                  disabled={!canRedo}
                  onClick={redoLastAction}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-35"
                  title="やり直す"
                >
                  <Redo2 size={14} /> やり直す
                </button>
              </div>

              <button
                type="button"
                onClick={handleAutoLayout}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-50 border border-indigo-200 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition"
              >
                <Sparkles size={14} />
                自動配置
              </button>
            </>
          )}

          <button
            type="button"
            disabled={isExportingPng}
            onClick={handleExportPng}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            <Camera size={14} />
            {isExportingPng ? 'PNG出力中...' : 'PNG書き出し'}
          </button>
        </div>
      </div>

      {/* 3. React Flow キャンバス本体 */}
      <div ref={canvasWrapperRef} className="relative flex-1 w-full h-full">
        {/* 中央上部フローティングピル（参考画像同様の「移動 / つなぐ」切替＋選択解除） */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2">
          {permissions.isEditor && (
            <div className="inline-flex rounded-xl bg-white/95 backdrop-blur-xs p-1 shadow-md border border-slate-200">
              <button
                type="button"
                onClick={() => setInteractionMode('move')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1 text-xs font-extrabold transition ${
                  interactionMode === 'move'
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <MousePointerClick size={13} /> 移動
              </button>
              <button
                type="button"
                onClick={() => setInteractionMode('connect')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1 text-xs font-extrabold transition ${
                  interactionMode === 'connect'
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Link2 size={13} /> つなぐ（関係線作成）
              </button>
            </div>
          )}

          {selectedEntityKey && (
            <button
              type="button"
              onClick={() => onSelectEntityKey(null)}
              className="inline-flex items-center gap-1 rounded-xl bg-slate-900/90 text-white px-3 py-1.5 text-xs font-bold shadow-md hover:bg-slate-800"
            >
              <X size={13} /> 強調表示を解除
            </button>
          )}
        </div>

        {/* 凡例バッジ（左下） */}
        <div className="absolute bottom-3 left-3 z-10 flex flex-wrap items-center gap-3 rounded-xl bg-white/90 backdrop-blur-xs px-3 py-1.5 text-[11px] font-semibold text-slate-600 shadow-sm border border-slate-200">
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 bg-indigo-600 inline-block" /> 所属ロール線
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 bg-slate-500 border-b border-dashed inline-block" /> グループ階層(親子)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 bg-rose-500 inline-block" /> 任意の関係線
          </span>
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={handleNodeDragStop}
          onConnect={handleConnect}
          onEdgeClick={(_e, edge) => {
            if (edge.id.startsWith('rel:') && permissions.isEditor) {
              const relId = edge.id.replace('rel:', '');
              onOpenRelationshipEditor(relId);
            }
          }}
          onPaneClick={() => onSelectEntityKey(null)}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.18 }}
          minZoom={0.2}
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
