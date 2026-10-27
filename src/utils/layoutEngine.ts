// ============================================================================
// 自動整列（Dagreレイアウトエンジン）
// 混合図・人物相関図・グループ相関図の3モードに応じて最適なレイアウト座標を算出
// ============================================================================

import dagre from 'dagre';
import type { DiagramViewMode, Group, Membership, NodePosition, Person, Relationship } from '../types/domain';

export function computeAutoLayoutPositions(
  viewMode: DiagramViewMode,
  groups: Group[],
  people: Person[],
  memberships: Membership[],
  relationships: Relationship[],
  collapsedGroupIds: string[] = []
): Record<string, NodePosition> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: viewMode === 'people' ? 'LR' : 'TB',
    nodesep: viewMode === 'people' ? 90 : 80,
    ranksep: viewMode === 'people' ? 140 : 130,
    marginx: 50,
    marginy: 50,
  });
  g.setDefaultEdgeLabel(() => ({}));

  const collapsedSet = new Set(collapsedGroupIds);

  if (viewMode === 'groups' || viewMode === 'mixed') {
    for (const grp of groups) {
      if (grp.kind === 'small' && grp.parentGroupId && collapsedSet.has(grp.parentGroupId)) {
        continue;
      }
      g.setNode(`group:${grp.id}`, {
        width: grp.kind === 'large' ? 280 : 250,
        height: grp.kind === 'large' ? 130 : 115,
      });
    }

    // 大グループ → 小グループの階層エッジ
    for (const grp of groups) {
      if (
        grp.kind === 'small' &&
        grp.parentGroupId &&
        !collapsedSet.has(grp.parentGroupId)
      ) {
        g.setEdge(`group:${grp.parentGroupId}`, `group:${grp.id}`);
      }
    }
  }

  if (viewMode === 'people' || viewMode === 'mixed') {
    for (const person of people) {
      g.setNode(`person:${person.id}`, {
        width: 240,
        height: 120,
      });
    }
  }

  if (viewMode === 'mixed') {
    for (const mem of memberships) {
      const targetGroup = groups.find((grp) => grp.id === mem.groupId);
      if (!targetGroup) continue;
      const effectiveGroupId =
        targetGroup.kind === 'small' &&
        targetGroup.parentGroupId &&
        collapsedSet.has(targetGroup.parentGroupId)
          ? targetGroup.parentGroupId
          : targetGroup.id;
      if (g.hasNode(`group:${effectiveGroupId}`) && g.hasNode(`person:${mem.personId}`)) {
        g.setEdge(`group:${effectiveGroupId}`, `person:${mem.personId}`);
      }
    }
  }

  for (const rel of relationships) {
    const srcKey = `${rel.sourceKind}:${rel.sourceId}`;
    const tgtKey = `${rel.targetKind}:${rel.targetId}`;
    if (g.hasNode(srcKey) && g.hasNode(tgtKey)) {
      g.setEdge(srcKey, tgtKey);
    }
  }

  dagre.layout(g);

  const positions: Record<string, NodePosition> = {};
  for (const nodeId of g.nodes()) {
    const nodeWithPos = g.node(nodeId);
    if (nodeWithPos && typeof nodeWithPos.x === 'number' && typeof nodeWithPos.y === 'number') {
      positions[nodeId] = {
        x: Math.round(nodeWithPos.x - (nodeWithPos.width || 220) / 2),
        y: Math.round(nodeWithPos.y - (nodeWithPos.height || 100) / 2),
      };
    }
  }

  return positions;
}
