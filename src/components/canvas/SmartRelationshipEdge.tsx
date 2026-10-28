import React, { useRef } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
} from '@xyflow/react';
import type { RelationDirection, RelationLineStyle } from '../../types/domain';

export interface SmartRelationshipEdgeData extends Record<string, unknown> {
  relationshipId: string;
  label: string;
  direction: RelationDirection;
  color: string;
  lineStyle: RelationLineStyle;
  pairIndex: number; // 同一ペア（A-B間）での通し番号 (0, 1, 2...)
  pairTotal: number; // 同一ペア（A-B間）の関係総数
  edgeTier?: 'largeGroup' | 'smallGroup' | 'person'; // レイヤー順制御用（大グループ矢印 / 小グループ矢印 / ユーザ矢印）
  isHighlighted: boolean;
  isSelected?: boolean; // この関係線自体が選択されているか
  canReconnect?: boolean; // 結点ドラッグによる結合場所の付け替えが可能か
  onFocusRelationship?: (relId: string) => void; // ワンクリック時：線の選択・フォーカス
  onOpenRelationship?: (relId: string) => void; // ダブルクリック時：関係性編集モーダル起動
}

/**
 * 相互の片方向関係線（A→B と B→A）や複数関係線でラベルや線が重ならないカスタムエッジ
 * - 片方向（forward）の場合：ラベルを出発元の人物・グループの「根本寄り（t = 0.27）」に配置
 * - 双方向（bidirectional）・矢印なし（none）の場合：ラベルを「真ん中（t = 0.50）」に配置
 * - 同一対象間に複数の線がある場合は、法線方向へ曲線のコントロールポイントをオフセットして線自体も分離
 */
export const SmartRelationshipEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerStart,
  markerEnd,
  data,
}) => {
  const d = (data || {}) as unknown as SmartRelationshipEdgeData;
  const direction = d.direction || 'forward';
  const color = d.color || '#334155';
  const lineStyle = d.lineStyle || 'solid';
  const pairIndex = d.pairIndex ?? 0;
  const pairTotal = d.pairTotal ?? 1;
  const isHighlighted = Boolean(d.isHighlighted);
  const isSelected = Boolean(d.isSelected);
  const canReconnect = Boolean(d.canReconnect);
  const lastTapRef = useRef<number>(0);

  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const len = Math.max(1, Math.hypot(dx, dy));

  // 出発点→到着点に対する単位法線ベクトル（常に進行方向の右側へオフセットするため、A→B と B→A は自動的に逆方向へ膨らむ）
  const nx = -dy / len;
  const ny = dx / len;

  // 同一ペアに複数関係がある場合の膨らみ量
  let curveOffset = 0;
  if (pairTotal > 1) {
    // 進行方向に対して常に右側に膨らませる（同方向が複数ある場合は段階的に広げる）
    curveOffset = 28 + pairIndex * 22;
  }

  // 2次ベジェ曲線の制御点 C
  const midX = (sourceX + targetX) / 2;
  const midY = (sourceY + targetY) / 2;
  const ctrlX = midX + nx * curveOffset;
  const ctrlY = midY + ny * curveOffset;

  const edgePath =
    curveOffset === 0
      ? `M ${sourceX},${sourceY} L ${targetX},${targetY}`
      : `M ${sourceX},${sourceY} Q ${ctrlX},${ctrlY} ${targetX},${targetY}`;

  // ラベル位置パラメータ t (0.0 = 出発元根本, 0.5 = 真ん中, 1.0 = 到着先)
  // ご指示通り：
  // - 片方向（forward）の場合は出発元の人物・グループの根本寄り（t = 0.27）
  // - 双方向（bidirectional）または矢印なし（none）の場合は真ん中（t = 0.50）
  // 同一方向にさらに複数ある場合のみ微調整
  const baseT = direction === 'forward' ? 0.27 : 0.5;
  const t = Math.min(0.75, Math.max(0.2, baseT + (pairIndex > 1 ? (pairIndex - 1) * 0.12 : 0)));

  // 2次ベジェ曲線 B(t) = (1-t)^2 * P0 + 2(1-t)t * C + t^2 * P1 上の座標を算出
  const invT = 1 - t;
  const labelX = invT * invT * sourceX + 2 * invT * t * ctrlX + t * t * targetX;
  const labelY = invT * invT * sourceY + 2 * invT * t * ctrlY + t * t * targetY;

  // 表示順（z-index）制御（背面から）：
  // 1. 大グループ矢印(2) → 2. 大グループ矢印内容(4) → 3. 大グループカード(10)
  // → 4. 小グループ矢印(12) → 5. 小グループ矢印内容(14) → 6. 小グループカード(20)
  // → 7. ユーザ矢印(22) → 8. ユーザ矢印内容(24) → 9. ユーザカード(30)
  // - フォーカス時（ワンクリック選択中）：フォーカスされた矢印(40) → フォーカスされた矢印内容(50)
  const edgeTier = d.edgeTier || 'person';
  const baseLabelZIndex =
    edgeTier === 'largeGroup' ? 4 : edgeTier === 'smallGroup' ? 14 : 24;
  const labelZIndex = isHighlighted ? 50 : baseLabelZIndex;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerStart={markerStart}
        markerEnd={markerEnd}
        style={{
          stroke: color,
          strokeWidth: isSelected ? 3.6 : isHighlighted ? 3.2 : 2.2,
          strokeDasharray: lineStyle === 'dashed' ? '6 4' : undefined,
        }}
      />
      {/* 線を選択している時は両端の「結点」を視覚的に強調表示し、カードの別の四方へドラッグして付け替えられることを示す */}
      {isSelected && canReconnect && (
        <g className="pointer-events-none">
          <circle
            cx={sourceX}
            cy={sourceY}
            r={6.5}
            fill="#ffffff"
            stroke="#4f46e5"
            strokeWidth={3}
          />
          <circle
            cx={targetX}
            cy={targetY}
            r={6.5}
            fill="#ffffff"
            stroke="#4f46e5"
            strokeWidth={3}
          />
        </g>
      )}
      {d.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${Math.round(labelX)}px, ${Math.round(labelY)}px)`,
              pointerEvents: 'all',
              borderColor: color,
              zIndex: labelZIndex,
            }}
            title="クリックで線を選択（結点をドラッグで付け替え） / ダブルクリックで関係性を編集"
            onClick={(e) => {
              e.stopPropagation();
              if (!d.relationshipId) return;
              const now = Date.now();
              const diff = now - lastTapRef.current;
              lastTapRef.current = now;

              if (diff > 0 && diff < 330) {
                d.onOpenRelationship?.(d.relationshipId);
              } else {
                d.onFocusRelationship?.(d.relationshipId);
              }
            }}
            className={`nodrag nopan cursor-pointer rounded-md border bg-white px-2.5 py-0.5 text-[11px] font-extrabold text-slate-900 transition hover:scale-105 ${
              isSelected
                ? 'ring-3 ring-indigo-600 shadow-lg scale-105'
                : isHighlighted
                ? 'ring-2 ring-indigo-500 shadow-md scale-105'
                : 'shadow-xs'
            }`}
          >
            {d.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};
