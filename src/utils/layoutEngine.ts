// ============================================================================
// 自動整列＆入れ子（ネスト）コンテナ寸法算出エンジン
// - 初期画面（所属中心 / mixedモード）：大グループ枠の中に小グループ枠と大グループ直下ユーザーを配置
// - グループ図（グループ中心 / groupsモード）：大グループ枠の中に小グループ枠を配置し、メンバー一覧を内蔵
// - 人物図（人中心 / peopleモード）：Dagreによる人物ノードの自動整列
// ============================================================================

import dagre from 'dagre';
import type {
  DiagramViewMode,
  Group,
  Membership,
  NodePosition,
  Person,
  Relationship,
} from '../types/domain';

export interface NestedBoxGeometry {
  width: number;
  height: number;
  defaultRelativePos: NodePosition;
}

export interface NestedLayoutPlan {
  largeGroupBoxes: Record<string, NestedBoxGeometry>;
  smallGroupBoxes: Record<string, NestedBoxGeometry>;
  membershipRelativePositions: Record<string, NodePosition>; // key: `mem:${membershipId}`
  unaffiliatedPositions: Record<string, NodePosition>;       // key: `unaffiliated:${personId}`
}

/**
 * 初期画面（所属中心 / mixed）およびグループ図（groups）向けの入れ子（ネスト）コンテナ寸法と初期相対座標を計算
 */
export function computeNestedGroupLayout(
  viewMode: 'mixed' | 'groups',
  groups: Group[],
  people: Person[],
  memberships: Membership[],
  collapsedGroupIds: string[] = []
): NestedLayoutPlan {
  const collapsedSet = new Set(collapsedGroupIds);
  const largeGroups = groups.filter((g) => g.kind === 'large');
  const smallGroups = groups.filter((g) => g.kind === 'small');

  const largeGroupBoxes: Record<string, NestedBoxGeometry> = {};
  const smallGroupBoxes: Record<string, NestedBoxGeometry> = {};
  const membershipRelativePositions: Record<string, NodePosition> = {};
  const unaffiliatedPositions: Record<string, NodePosition> = {};

  // 1. 各小グループのサイズと内部メンバー座標を計算
  for (const sg of smallGroups) {
    const sgMemberships = memberships.filter((m) => m.groupId === sg.id);
    if (viewMode === 'mixed') {
      const count = sgMemberships.length;
      const sgWidth = 240;
      const sgHeight = Math.max(150, 62 + Math.max(1, count) * 86);
      smallGroupBoxes[sg.id] = {
        width: sgWidth,
        height: sgHeight,
        defaultRelativePos: { x: 24, y: 56 },
      };

      sgMemberships.forEach((m, idx) => {
        membershipRelativePositions[`mem:${m.id}`] = {
          x: 28,
          y: 52 + idx * 84,
        };
      });
    } else {
      // groups モード（メンバーは小グループ枠の中にリストとして内蔵描画）
      const count = sgMemberships.length;
      const sgWidth = 270;
      const sgHeight = Math.max(125, 70 + count * 42);
      smallGroupBoxes[sg.id] = {
        width: sgWidth,
        height: sgHeight,
        defaultRelativePos: { x: 24, y: 56 },
      };
    }
  }

  // 2. 各大グループのサイズと、内部の小グループ座標＋大グループ直下メンバー座標を計算
  let cursorLargeX = 40;
  let maxLargeHeight = 360;

  largeGroups.forEach((lg) => {
    const isCollapsed = collapsedSet.has(lg.id);
    const childSmallGroups = isCollapsed
      ? []
      : smallGroups.filter((sg) => sg.parentGroupId === lg.id);
    const directMemberships = memberships.filter((m) => m.groupId === lg.id);

    if (viewMode === 'mixed') {
      // 左エリアに小グループを横に並べ、右または下エリアに大グループ直下メンバーを縦に並べる（添付図の構造）
      let childCursorX = 24;
      let maxChildBottom = 60;

      childSmallGroups.forEach((sg) => {
        const box = smallGroupBoxes[sg.id];
        if (!box) return;
        box.defaultRelativePos = { x: childCursorX, y: 56 };
        childCursorX += box.width + 24;
        maxChildBottom = Math.max(maxChildBottom, 56 + box.height);
      });

      const directColumnX = childSmallGroups.length > 0 ? childCursorX + 8 : 28;
      const directStartY = childSmallGroups.length > 0 ? 90 : 56;

      directMemberships.forEach((m, idx) => {
        membershipRelativePositions[`mem:${m.id}`] = {
          x: directColumnX,
          y: directStartY + idx * 86,
        };
      });

      const directBottom =
        directMemberships.length > 0
          ? directStartY + directMemberships.length * 86 + 24
          : 120;

      const lgWidth = Math.max(
        340,
        directMemberships.length > 0 ? directColumnX + 216 : childCursorX + 12
      );
      const lgHeight = Math.max(260, maxChildBottom + 28, directBottom);

      largeGroupBoxes[lg.id] = {
        width: lgWidth,
        height: lgHeight,
        defaultRelativePos: { x: cursorLargeX, y: 40 },
      };

      cursorLargeX += lgWidth + 48;
      maxLargeHeight = Math.max(maxLargeHeight, lgHeight);
    } else {
      // groups モード（大グループ直下メンバー一覧を上部に内蔵表示し、その下に小グループ枠を配置）
      const directHeaderHeight = 76 + Math.max(1, directMemberships.length) * 42;
      let childCursorX = 24;
      let maxChildHeight = 0;

      childSmallGroups.forEach((sg) => {
        const box = smallGroupBoxes[sg.id];
        if (!box) return;
        box.defaultRelativePos = { x: childCursorX, y: directHeaderHeight + 16 };
        childCursorX += box.width + 20;
        maxChildHeight = Math.max(maxChildHeight, box.height);
      });

      const lgWidth = Math.max(330, childCursorX + 12);
      const lgHeight =
        childSmallGroups.length > 0
          ? directHeaderHeight + maxChildHeight + 40
          : directHeaderHeight + 24;

      largeGroupBoxes[lg.id] = {
        width: lgWidth,
        height: lgHeight,
        defaultRelativePos: { x: cursorLargeX, y: 40 },
      };

      cursorLargeX += lgWidth + 48;
      maxLargeHeight = Math.max(maxLargeHeight, lgHeight);
    }
  });

  // 3. どのグループにも所属していない未所属メンバーの初期座標（下部エリア）
  const affiliatedPersonIds = new Set(memberships.map((m) => m.personId));
  let unaffiliatedIdx = 0;
  for (const p of people) {
    if (!affiliatedPersonIds.has(p.id)) {
      unaffiliatedPositions[`unaffiliated:${p.id}`] = {
        x: 60 + unaffiliatedIdx * 220,
        y: maxLargeHeight + 90,
      };
      unaffiliatedIdx++;
    }
  }

  return {
    largeGroupBoxes,
    smallGroupBoxes,
    membershipRelativePositions,
    unaffiliatedPositions,
  };
}

/**
 * 自動配置ボタン実行時の座標算出
 */
export function computeAutoLayoutPositions(
  viewMode: DiagramViewMode,
  groups: Group[],
  people: Person[],
  memberships: Membership[],
  relationships: Relationship[],
  collapsedGroupIds: string[] = []
): Record<string, NodePosition> {
  if (viewMode === 'mixed' || viewMode === 'groups') {
    const plan = computeNestedGroupLayout(
      viewMode,
      groups,
      people,
      memberships,
      collapsedGroupIds
    );
    const result: Record<string, NodePosition> = {};
    for (const [lgId, box] of Object.entries(plan.largeGroupBoxes)) {
      result[`group:${lgId}`] = box.defaultRelativePos;
    }
    for (const [sgId, box] of Object.entries(plan.smallGroupBoxes)) {
      result[`group:${sgId}`] = box.defaultRelativePos;
    }
    for (const [memKey, pos] of Object.entries(plan.membershipRelativePositions)) {
      result[memKey] = pos;
    }
    for (const [unKey, pos] of Object.entries(plan.unaffiliatedPositions)) {
      result[unKey] = pos;
    }
    return result;
  }

  // people モード（人中心図）の自動配置
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: 'LR',
    nodesep: 90,
    ranksep: 160,
    marginx: 50,
    marginy: 50,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const person of people) {
    g.setNode(`person:${person.id}`, {
      width: 340,
      height: 140,
    });
  }

  for (const rel of relationships) {
    if (rel.sourceKind === 'person' && rel.targetKind === 'person') {
      const srcKey = `person:${rel.sourceId}`;
      const tgtKey = `person:${rel.targetId}`;
      if (g.hasNode(srcKey) && g.hasNode(tgtKey)) {
        g.setEdge(srcKey, tgtKey);
      }
    }
  }

  dagre.layout(g);

  const positions: Record<string, NodePosition> = {};
  for (const nodeId of g.nodes()) {
    const nodeWithPos = g.node(nodeId);
    if (nodeWithPos && typeof nodeWithPos.x === 'number' && typeof nodeWithPos.y === 'number') {
      positions[nodeId] = {
        x: Math.round(nodeWithPos.x - (nodeWithPos.width || 320) / 2),
        y: Math.round(nodeWithPos.y - (nodeWithPos.height || 130) / 2),
      };
    }
  }

  return positions;
}
