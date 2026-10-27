import React, { useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Eye,
  GitCommitHorizontal,
  ImagePlus,
  Plus,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { useAppState } from '../../context/AppStateContext';
import type { EntityKind, Group, Person, RelationDirection, RelationLineStyle } from '../../types/domain';
import {
  analyzeGroupDeletionImpact,
  validateAndAnalyzeGroupParentChange,
} from '../../utils/groupRules';
import { generateUnfathomableId } from '../../utils/validation';
import { AvatarBadge, AVATAR_PRESET_OPTIONS } from '../common/AvatarBadge';
import { IconCropperModal } from './IconCropperModal';

const COLOR_PALETTE = [
  '#2563eb',
  '#ef4444',
  '#db2777',
  '#059669',
  '#7c3aed',
  '#0891b2',
  '#ea580c',
  '#4f46e5',
  '#64748b',
];

// ============================================================================
// 1. 人物（プロジェクト管理項目＋所属ロール一括設定）エディタモーダル
// ============================================================================
interface PersonEditorModalProps {
  personId?: string | null; // null の場合は新規作成
  onClose: () => void;
}

export const PersonEditorModal: React.FC<PersonEditorModalProps> = ({ personId, onClose }) => {
  const {
    currentBundle,
    upsertPerson,
    deletePersonWithCascade,
    upsertMembership,
    deleteMembership,
  } = useAppState();

  const existing = personId
    ? currentBundle?.people.find((p) => p.id === personId) || null
    : null;

  const [displayName, setDisplayName] = useState(existing?.displayName || '');
  const [globalRoleIds, setGlobalRoleIds] = useState<string[]>(existing?.globalRoleIds || []);
  const [skillIds, setSkillIds] = useState<string[]>(existing?.skillIds || []);
  const [color, setColor] = useState(existing?.color || '#2563eb');
  const [projectMemo, setProjectMemo] = useState(existing?.projectMemo || '');
  const [avatarPreset, setAvatarPreset] = useState(existing?.avatarPreset || 'user');
  const [tempIconData, setTempIconData] = useState<{ dataUrl: string; byteSize: number } | null | undefined>(
    undefined
  );
  const [showIconCropper, setShowIconCropper] = useState(false);

  // 新規所属追加用ステート
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [selectedGroupRoleIds, setSelectedGroupRoleIds] = useState<string[]>([]);
  const [membershipMemo, setMembershipMemo] = useState('');

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!currentBundle) return null;

  const existingTempIconUrl =
    existing?.tempIconId ? currentBundle.projectIcons[existing.tempIconId]?.dataUrl : null;
  const previewIconUrl =
    tempIconData === null ? null : tempIconData?.dataUrl ?? existingTempIconUrl;

  const currentMemberships = existing
    ? currentBundle.memberships.filter((m) => m.personId === existing.id)
    : [];

  const handleSavePerson = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!displayName.trim()) {
      setErrorMsg('プロジェクト上の表示名を入力してください。');
      return;
    }
    try {
      const targetId = existing ? existing.id : generateUnfathomableId('person');
      await upsertPerson(
        {
          id: targetId,
          displayName: displayName.trim(),
          globalRoleIds,
          skillIds,
          color,
          projectMemo: projectMemo.trim(),
          tempIconId: existing?.tempIconId || null,
          tempIconRevision: existing?.tempIconRevision || 0,
          avatarPreset,
        },
        tempIconData
      );

      // 新規作成時にグループ所属も選択されていたら同時に保存
      if (!existing && selectedGroupId) {
        await upsertMembership({
          id: generateUnfathomableId('mem'),
          personId: targetId,
          groupId: selectedGroupId,
          roleIds: selectedGroupRoleIds,
          memo: membershipMemo.trim(),
        });
      }

      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const handleAddOrUpdateMembership = async () => {
    if (!existing || !selectedGroupId) return;
    setErrorMsg(null);
    try {
      await upsertMembership({
        id: generateUnfathomableId('mem'),
        personId: existing.id,
        groupId: selectedGroupId,
        roleIds: selectedGroupRoleIds,
        memo: membershipMemo.trim(),
      });
      setSelectedGroupId('');
      setSelectedGroupRoleIds([]);
      setMembershipMemo('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const toggleInArray = (arr: string[], id: string) =>
    arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
            <UserPlus size={17} className="text-indigo-600" />
            {existing ? `人物・ロール設定の編集: ${existing.displayName}` : '人物の新規登録（Googleアカウント不要でも登録可）'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-200"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSavePerson} className="p-6 overflow-y-auto space-y-5 flex-1">
          {errorMsg && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
              {errorMsg}
            </div>
          )}

          {/* 基本情報・カラー・仮アイコン */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
            <div className="md:col-span-7 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  プロジェクト上の表示名 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={80}
                  placeholder="例: 鈴木 一郎"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  図の表示色
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {COLOR_PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`w-6 h-6 rounded-full border-2 transition ${
                        color === c ? 'border-slate-900 scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-7 h-7 rounded cursor-pointer border border-slate-300"
                  />
                </div>
              </div>
            </div>

            {/* アイコン設定（未連携人物は編集者が仮アイコンを設定可能、連携済みは本人のみ変更可） */}
            <div className="md:col-span-5 rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2.5">
              <div className="flex items-center gap-3">
                <AvatarBadge
                  name={displayName || '新'}
                  color={color}
                  iconDataUrl={previewIconUrl}
                  preset={avatarPreset}
                  size="lg"
                />
                <div className="space-y-1 text-xs">
                  <span className="font-bold text-slate-700 block">
                    {existing?.linkedUid ? '本人アカウント連携済み' : '未連携人物の仮アイコン'}
                  </span>
                  {existing?.linkedUid ? (
                    <span className="text-[11px] text-amber-700 block">
                      ※本人連携済のため、編集者は本人アイコンを変更できません。
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowIconCropper(true)}
                      className="inline-flex items-center gap-1 rounded-lg bg-white border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      <ImagePlus size={13} /> 仮画像を設定
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-slate-500">代替プリセット:</span>
                <select
                  value={avatarPreset}
                  onChange={(e) => setAvatarPreset(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs"
                >
                  {AVATAR_PRESET_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* 全体での役割・肩書（複数タグ選択） */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700">
              全体での役割・肩書（複数選択可・メイン表示）
            </label>
            <div className="flex flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3">
              {currentBundle.project.roleTags.map((tag) => {
                const selected = globalRoleIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => setGlobalRoleIds((prev) => toggleInArray(prev, tag.id))}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold transition border ${
                      selected
                        ? 'text-white shadow-xs border-transparent'
                        : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                    }`}
                    style={selected ? { backgroundColor: tag.color } : undefined}
                  >
                    {selected ? '✓ ' : '+ '}
                    {tag.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* スキル（複数タグ選択） */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700">
              スキル（複数選択可）
            </label>
            <div className="flex flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3">
              {currentBundle.project.skillTags.map((tag) => {
                const selected = skillIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => setSkillIds((prev) => toggleInArray(prev, tag.id))}
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold transition border ${
                      selected
                        ? 'text-white border-transparent'
                        : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                    }`}
                    style={selected ? { backgroundColor: tag.color } : undefined}
                  >
                    {selected ? '✓ ' : '+ '}
                    {tag.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 所属グループと所属先ごとの役割管理 */}
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-extrabold text-indigo-950 flex items-center gap-1.5">
                <Building2 size={15} className="text-indigo-600" />
                グループ所属と所属先ごとの役割（ロール）
              </h4>
              <span className="text-[11px] text-indigo-700">
                ※小グループ所属と大グループ直接所属は別管理です（自動作成しません）
              </span>
            </div>

            {/* 既存所属一覧 */}
            {existing && currentMemberships.length > 0 && (
              <div className="space-y-2">
                {currentMemberships.map((m) => {
                  const grp = currentBundle.groups.find((g) => g.id === m.groupId);
                  if (!grp) return null;
                  return (
                    <div
                      key={m.id}
                      className="rounded-xl bg-white border border-slate-200 p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: grp.color }}
                          />
                          <span className="text-xs font-bold text-slate-800">{grp.name}</span>
                          <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                            {grp.kind === 'large' ? '大グループ直接' : '小グループ'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteMembership(m.id)}
                          className="text-xs text-rose-600 hover:underline flex items-center gap-1"
                        >
                          <Trash2 size={12} /> 所属解除
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {currentBundle.project.roleTags.map((rTag) => {
                          const hasRole = m.roleIds.includes(rTag.id);
                          return (
                            <button
                              key={rTag.id}
                              type="button"
                              onClick={() => {
                                const nextRoles = toggleInArray(m.roleIds, rTag.id);
                                upsertMembership({
                                  id: m.id,
                                  personId: m.personId,
                                  groupId: m.groupId,
                                  roleIds: nextRoles,
                                  memo: m.memo,
                                });
                              }}
                              className={`rounded px-2 py-0.5 text-[11px] font-bold border transition ${
                                hasRole
                                  ? 'text-white border-transparent'
                                  : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                              }`}
                              style={hasRole ? { backgroundColor: rTag.color } : undefined}
                            >
                              {hasRole ? '✓ ' : '+ '}
                              {rTag.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 所属追加フォーム */}
            <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-2.5">
              <span className="text-xs font-bold text-slate-700 block">
                {existing ? '＋ 新しい所属グループと役割を追加' : '初期所属グループと役割（任意）'}
              </span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <select
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(e.target.value)}
                  className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                >
                  <option value="">-- 所属先グループを選択 --</option>
                  {currentBundle.groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      [{g.kind === 'large' ? '大グループ' : '小グループ'}] {g.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="所属メモ (例: レビュー担当として兼務)"
                  value={membershipMemo}
                  onChange={(e) => setMembershipMemo(e.target.value)}
                  className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                />
              </div>

              {selectedGroupId && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-slate-600 block">
                    この所属先での役割（複数選択可）:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {currentBundle.project.roleTags.map((tag) => {
                      const active = selectedGroupRoleIds.includes(tag.id);
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() =>
                            setSelectedGroupRoleIds((prev) => toggleInArray(prev, tag.id))
                          }
                          className={`rounded px-2 py-0.5 text-[11px] font-bold border ${
                            active
                              ? 'text-white border-transparent'
                              : 'bg-slate-50 text-slate-600 border-slate-300'
                          }`}
                          style={active ? { backgroundColor: tag.color } : undefined}
                        >
                          {active ? '✓ ' : '+ '}
                          {tag.name}
                        </button>
                      );
                    })}
                  </div>
                  {existing && (
                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={handleAddOrUpdateMembership}
                        className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1 text-xs font-bold text-white hover:bg-indigo-700"
                      >
                        <Plus size={13} /> このグループ所属を追加
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* プロジェクト用メモ（公開プロジェクトでは公開されることを明示） */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700">
                プロジェクト用メモ（本人プロフィールのコメントとは別管理）
              </label>
            </div>
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5 text-[11px] text-amber-900 flex items-center gap-1.5">
              <Eye size={13} className="text-amber-600 shrink-0" />
              <span>
                <strong>ご注意：</strong>
                このプロジェクト用メモは、公開プロジェクト（現在:{' '}
                {currentBundle.project.isPublic ? '公開中' : '非公開'}
                ）では閲覧者全員に公開されます。秘匿情報やメールアドレスは記入しないでください。
              </span>
            </div>
            <textarea
              rows={2}
              maxLength={1000}
              placeholder="プロジェクト内での担当範囲や補足メモを入力..."
              value={projectMemo}
              onChange={(e) => setProjectMemo(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs"
            />
          </div>

          {/* フッターボタン */}
          <div className="flex items-center justify-between border-t border-slate-200 pt-4">
            {existing ? (
              !confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100"
                >
                  <Trash2 size={14} /> 人物を削除
                </button>
              ) : (
                <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-xl">
                  <span className="text-xs font-bold text-rose-800">
                    所属・関係線も解除されます（本人プロフィールは削除されません）。削除しますか？
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      await deletePersonWithCascade(existing.id);
                      onClose();
                    }}
                    className="rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-bold text-white"
                  >
                    削除実行
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="rounded-lg bg-white border border-slate-300 px-2 py-1 text-xs"
                  >
                    戻る
                  </button>
                </div>
              )
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                キャンセル
              </button>
              <button
                type="submit"
                className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700"
              >
                保存する
              </button>
            </div>
          </div>
        </form>
      </div>

      {showIconCropper && (
        <IconCropperModal
          title="未連携人物の仮アイコン設定 (128×128 WebP)"
          currentDataUrl={previewIconUrl}
          onSave={(res) => setTempIconData(res)}
          onClose={() => setShowIconCropper(false)}
        />
      )}
    </div>
  );
};

// ============================================================================
// 2. 大グループ・小グループ エディタモーダル（親変更・削除時の影響表示付き）
// ============================================================================
interface GroupEditorModalProps {
  groupId?: string | null;
  defaultParentId?: string | null;
  onClose: () => void;
}

export const GroupEditorModal: React.FC<GroupEditorModalProps> = ({
  groupId,
  defaultParentId = null,
  onClose,
}) => {
  const { currentBundle, upsertGroup, deleteGroupWithCascade } = useAppState();

  const existing = groupId
    ? currentBundle?.groups.find((g) => g.id === groupId) || null
    : null;

  const [name, setName] = useState(existing?.name || '');
  const [kind, setKind] = useState<'large' | 'small'>(
    existing ? existing.kind : defaultParentId ? 'small' : 'large'
  );
  const [parentGroupId, setParentGroupId] = useState<string | null>(
    existing ? existing.parentGroupId : defaultParentId
  );
  const [color, setColor] = useState(existing?.color || '#2563eb');
  const [description, setDescription] = useState(existing?.description || '');
  const [tags, setTags] = useState<string[]>(existing?.tags || []);
  const [avatarPreset, setAvatarPreset] = useState(existing?.avatarPreset || 'building');
  const [iconData, setIconData] = useState<{ dataUrl: string; byteSize: number } | null | undefined>(
    undefined
  );
  const [showIconCropper, setShowIconCropper] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!currentBundle) return null;

  const largeGroups = currentBundle.groups.filter(
    (g) => g.kind === 'large' && g.id !== existing?.id
  );

  // 親変更時の影響チェック
  const parentChangeCheck = existing
    ? validateAndAnalyzeGroupParentChange(
        existing,
        kind,
        kind === 'large' ? null : parentGroupId,
        currentBundle.groups,
        currentBundle.memberships
      )
    : null;

  // 削除時の影響チェック
  const deletionImpact = existing
    ? analyzeGroupDeletionImpact(
        existing.id,
        currentBundle.groups,
        currentBundle.memberships,
        currentBundle.relationships
      )
    : null;

  const existingIconUrl =
    existing?.iconId ? currentBundle.projectIcons[existing.iconId]?.dataUrl : null;
  const previewIconUrl = iconData === null ? null : iconData?.dataUrl ?? existingIconUrl;

  const handleSaveGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!name.trim()) {
      setErrorMsg('グループ名を入力してください。');
      return;
    }
    if (parentChangeCheck && !parentChangeCheck.valid) {
      setErrorMsg(parentChangeCheck.error || '親グループの設定が不正です。');
      return;
    }
    if (kind === 'small' && !parentGroupId) {
      setErrorMsg('小グループには親となる大グループを選択してください。');
      return;
    }

    try {
      await upsertGroup(
        {
          id: existing ? existing.id : generateUnfathomableId('grp'),
          name: name.trim(),
          kind,
          parentGroupId: kind === 'large' ? null : parentGroupId,
          color,
          description: description.trim(),
          tags,
          iconId: existing?.iconId || null,
          iconRevision: existing?.iconRevision || 0,
          avatarPreset,
          order: existing ? existing.order : currentBundle.groups.length,
        },
        iconData
      );
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden my-auto">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
            <Building2 size={17} className="text-indigo-600" />
            {existing ? `グループの編集: ${existing.name}` : 'グループの新規作成（二階層管理）'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-200"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSaveGroup} className="p-6 space-y-4">
          {errorMsg && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-7 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  グループ名 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={80}
                  placeholder="例: プロダクト開発本部 / フロントエンド班"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">階層種別</label>
                  <select
                    value={kind}
                    onChange={(e) => {
                      const nextK = e.target.value as 'large' | 'small';
                      setKind(nextK);
                      if (nextK === 'large') {
                        setParentGroupId(null);
                      } else if (!parentGroupId && largeGroups.length > 0) {
                        setParentGroupId(largeGroups[0].id);
                      }
                    }}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold"
                  >
                    <option value="large">大グループ（親なし）</option>
                    <option value="small">小グループ（大グループ配下）</option>
                  </select>
                </div>

                {kind === 'small' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      親の大グループ
                    </label>
                    <select
                      value={parentGroupId || ''}
                      onChange={(e) => setParentGroupId(e.target.value || null)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
                    >
                      <option value="">-- 選択 --</option>
                      {largeGroups.map((lg) => (
                        <option key={lg.id} value={lg.id}>
                          {lg.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            <div className="md:col-span-5 rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2">
              <div className="flex items-center gap-3">
                <AvatarBadge
                  name={name || 'G'}
                  color={color}
                  iconDataUrl={previewIconUrl}
                  preset={avatarPreset}
                  size="lg"
                  shape="rounded"
                />
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() => setShowIconCropper(true)}
                    className="inline-flex items-center gap-1 rounded-lg bg-white border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    <ImagePlus size={13} /> グループ画像設定
                  </button>
                  <select
                    value={avatarPreset}
                    onChange={(e) => setAvatarPreset(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs"
                  >
                    {AVATAR_PRESET_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* 親変更時の影響警告表示 */}
          {parentChangeCheck &&
            (!parentChangeCheck.valid || parentChangeCheck.warnings.length > 0) && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
                <p className="font-bold flex items-center gap-1">
                  <AlertTriangle size={14} className="text-amber-600" />
                  階層・親グループ変更の影響確認
                </p>
                {parentChangeCheck.error && (
                  <p className="text-rose-700 font-semibold">{parentChangeCheck.error}</p>
                )}
                {parentChangeCheck.warnings.map((w, i) => (
                  <p key={i}>{w}</p>
                ))}
              </div>
            )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">表示色</label>
            <div className="flex items-center gap-2 flex-wrap">
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full border-2 ${
                    color === c ? 'border-slate-900 scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">説明</label>
            <textarea
              rows={2}
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs"
            />
          </div>

          {/* 削除確認（影響表示付き） */}
          {existing && confirmDelete && deletionImpact && (
            <div className="rounded-xl border border-rose-300 bg-rose-50 p-3.5 text-xs text-rose-900 space-y-2">
              <p className="font-extrabold flex items-center gap-1.5 text-rose-800">
                <AlertTriangle size={15} />
                グループ「{existing.name}」の削除による影響確認
              </p>
              <ul className="list-disc list-inside space-y-1 text-[11px]">
                {deletionImpact.summaryMessages.map((msg, idx) => (
                  <li key={idx}>{msg}</li>
                ))}
              </ul>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-lg bg-white border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await deleteGroupWithCascade(existing.id);
                    onClose();
                  }}
                  className="rounded-lg bg-rose-600 px-3 py-1 text-xs font-bold text-white hover:bg-rose-700"
                >
                  影響を確認して削除実行
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-slate-200 pt-4">
            {existing && !confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100"
              >
                <Trash2 size={14} /> グループを削除
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700"
              >
                キャンセル
              </button>
              <button
                type="submit"
                className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white hover:bg-indigo-700"
              >
                保存する
              </button>
            </div>
          </div>
        </form>
      </div>

      {showIconCropper && (
        <IconCropperModal
          title="グループアイコン画像の設定 (128×128 WebP)"
          currentDataUrl={previewIconUrl}
          onSave={(res) => setIconData(res)}
          onClose={() => setShowIconCropper(false)}
        />
      )}
    </div>
  );
};

// ============================================================================
// 3. 関係線エディタモーダル（人物間・グループ間・人物とグループの所属以外の関係）
// ============================================================================
interface RelationshipEditorModalProps {
  relationshipId?: string | null;
  initialSource?: { kind: EntityKind; id: string };
  initialTarget?: { kind: EntityKind; id: string };
  onClose: () => void;
}

export const RelationshipEditorModal: React.FC<RelationshipEditorModalProps> = ({
  relationshipId,
  initialSource,
  initialTarget,
  onClose,
}) => {
  const { currentBundle, upsertRelationship, deleteRelationship } = useAppState();

  const existing = relationshipId
    ? currentBundle?.relationships.find((r) => r.id === relationshipId) || null
    : null;

  const defaultSourceKind = existing?.sourceKind || initialSource?.kind || 'person';
  const defaultSourceId =
    existing?.sourceId ||
    initialSource?.id ||
    currentBundle?.people[0]?.id ||
    currentBundle?.groups[0]?.id ||
    '';

  const defaultTargetKind = existing?.targetKind || initialTarget?.kind || 'person';
  const defaultTargetId =
    existing?.targetId ||
    initialTarget?.id ||
    currentBundle?.people[1]?.id ||
    currentBundle?.people[0]?.id ||
    '';

  const [sourceKind, setSourceKind] = useState<EntityKind>(defaultSourceKind);
  const [sourceId, setSourceId] = useState<string>(defaultSourceId);
  const [targetKind, setTargetKind] = useState<EntityKind>(defaultTargetKind);
  const [targetId, setTargetId] = useState<string>(defaultTargetId);
  const [label, setLabel] = useState(existing?.label || '');
  const [tagIds, setTagIds] = useState<string[]>(existing?.tagIds || []);
  const [direction, setDirection] = useState<RelationDirection>(existing?.direction || 'forward');
  const [color, setColor] = useState(existing?.color || '#4f46e5');
  const [lineStyle, setLineStyle] = useState<RelationLineStyle>(existing?.lineStyle || 'solid');
  const [memo, setMemo] = useState(existing?.memo || '');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!currentBundle) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!label.trim()) {
      setErrorMsg('関係名を入力してください（例: 開発指示、テスト依頼、UI共有）。');
      return;
    }
    if (!sourceId || !targetId) {
      setErrorMsg('接続元と接続先の対象を選択してください。');
      return;
    }

    try {
      await upsertRelationship({
        id: existing ? existing.id : generateUnfathomableId('rel'),
        sourceKind,
        sourceId,
        targetKind,
        targetId,
        label: label.trim(),
        tagIds,
        direction,
        color,
        lineStyle,
        memo: memo.trim(),
      });
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden my-auto">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
            <GitCommitHorizontal size={17} className="text-indigo-600" />
            {existing ? '関係線の編集' : '関係線の追加（同じ対象間に複数登録可）'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-200"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4">
          {errorMsg && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
              {errorMsg}
            </div>
          )}

          {/* 接続元と接続先 */}
          <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-slate-600">接続元 (From)</label>
              <select
                value={sourceKind}
                onChange={(e) => {
                  const k = e.target.value as EntityKind;
                  setSourceKind(k);
                  setSourceId(
                    k === 'person'
                      ? currentBundle.people[0]?.id || ''
                      : currentBundle.groups[0]?.id || ''
                  );
                }}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
              >
                <option value="person">人物</option>
                <option value="group">グループ</option>
              </select>
              <select
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold"
              >
                {sourceKind === 'person'
                  ? currentBundle.people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.displayName}
                      </option>
                    ))
                  : currentBundle.groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-slate-600">接続先 (To)</label>
              <select
                value={targetKind}
                onChange={(e) => {
                  const k = e.target.value as EntityKind;
                  setTargetKind(k);
                  setTargetId(
                    k === 'person'
                      ? currentBundle.people[0]?.id || ''
                      : currentBundle.groups[0]?.id || ''
                  );
                }}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
              >
                <option value="person">人物</option>
                <option value="group">グループ</option>
              </select>
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold"
              >
                {targetKind === 'person'
                  ? currentBundle.people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.displayName}
                      </option>
                    ))
                  : currentBundle.groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              関係名 <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              maxLength={80}
              placeholder="例: 開発指示 / デザイン依頼 / UI仕様共有 / テスト依頼"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">矢印の方向</label>
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value as RelationDirection)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
              >
                <option value="forward">片方向 (From → To)</option>
                <option value="bidirectional">双方向 (From ↔ To)</option>
                <option value="none">矢印なし (―)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">線種</label>
              <select
                value={lineStyle}
                onChange={(e) => setLineStyle(e.target.value as RelationLineStyle)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
              >
                <option value="solid">実線</option>
                <option value="dashed">破線</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">線の色</label>
            <div className="flex items-center gap-2">
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full border-2 ${
                    color === c ? 'border-slate-900 scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">メモ</label>
            <input
              type="text"
              maxLength={500}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
            />
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 pt-4">
            {existing ? (
              <button
                type="button"
                onClick={async () => {
                  await deleteRelationship(existing.id);
                  onClose();
                }}
                className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100"
              >
                <Trash2 size={14} /> 削除
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700"
              >
                キャンセル
              </button>
              <button
                type="submit"
                className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white hover:bg-indigo-700"
              >
                保存する
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
