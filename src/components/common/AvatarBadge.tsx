import React from 'react';
import {
  Building2,
  CheckCircle2,
  Code2,
  Compass,
  Crown,
  LayoutGrid,
  Palette,
  Server,
  ShieldCheck,
  Sparkles,
  User,
} from 'lucide-react';

export const AVATAR_PRESET_OPTIONS = [
  { id: 'user', label: '人物標準' },
  { id: 'crown', label: 'PM / 責任者' },
  { id: 'code', label: 'エンジニア' },
  { id: 'palette', label: 'デザイナー' },
  { id: 'shield', label: 'QA / セキュリティ' },
  { id: 'server', label: 'SRE / 基盤' },
  { id: 'sparkles', label: '企画 / リサーチ' },
  { id: 'compass', label: 'ディレクター' },
  { id: 'building', label: '部門・組織' },
  { id: 'layout', label: 'チーム・班' },
  { id: 'check', label: '品質・監査' },
] as const;

interface AvatarBadgeProps {
  name: string;
  color: string;
  iconDataUrl?: string | null;
  preset?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  shape?: 'circle' | 'rounded';
  className?: string;
}

const sizeClasses: Record<NonNullable<AvatarBadgeProps['size']>, string> = {
  xs: 'w-6 h-6 text-xs',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-xl',
};

const iconSizes: Record<NonNullable<AvatarBadgeProps['size']>, number> = {
  xs: 12,
  sm: 15,
  md: 18,
  lg: 22,
  xl: 28,
};

export const AvatarBadge: React.FC<AvatarBadgeProps> = ({
  name,
  color,
  iconDataUrl,
  preset,
  size = 'md',
  shape = 'circle',
  className = '',
}) => {
  const radiusClass = shape === 'circle' ? 'rounded-full' : 'rounded-xl';
  const dimClass = sizeClasses[size];
  const iconPx = iconSizes[size];

  // セキュリティ配慮：data:image/webp;base64,... のみ img src として安全に描画
  const isSafeWebp =
    typeof iconDataUrl === 'string' &&
    /^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(iconDataUrl);

  if (isSafeWebp && iconDataUrl) {
    return (
      <div
        className={`relative shrink-0 overflow-hidden border border-white/80 shadow-sm ${dimClass} ${radiusClass} ${className}`}
        style={{ backgroundColor: color || '#3b82f6' }}
      >
        <img
          src={iconDataUrl}
          alt={name}
          className="h-full w-full object-cover"
          draggable={false}
        />
      </div>
    );
  }

  // 頭文字の抽出（日本語1文字または英字最大2文字）
  const trimmed = (name || '?').trim();
  const firstChar = Array.from(trimmed)[0] || '?';

  const renderPresetIcon = () => {
    switch (preset) {
      case 'crown':
        return <Crown size={iconPx} />;
      case 'code':
        return <Code2 size={iconPx} />;
      case 'palette':
        return <Palette size={iconPx} />;
      case 'shield':
        return <ShieldCheck size={iconPx} />;
      case 'server':
        return <Server size={iconPx} />;
      case 'sparkles':
        return <Sparkles size={iconPx} />;
      case 'compass':
        return <Compass size={iconPx} />;
      case 'building':
        return <Building2 size={iconPx} />;
      case 'layout':
        return <LayoutGrid size={iconPx} />;
      case 'check':
        return <CheckCircle2 size={iconPx} />;
      case 'initial':
      case 'user':
      default:
        return <span className="font-bold tracking-tight select-none">{firstChar}</span>;
    }
  };

  return (
    <div
      className={`flex shrink-0 items-center justify-center text-white font-bold shadow-sm border border-white/60 ${dimClass} ${radiusClass} ${className}`}
      style={{ backgroundColor: color || '#3b82f6' }}
      title={name}
    >
      {renderPresetIcon()}
    </div>
  );
};
