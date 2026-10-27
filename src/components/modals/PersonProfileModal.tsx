import React, { useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  ImagePlus,
  Link2,
  Lock,
  Mail,
  Pencil,
  Plus,
  ShieldAlert,
  Sparkles,
  Trash2,
  Unlink,
  UserCheck,
  X,
} from 'lucide-react';
import { useAppState } from '../../context/AppStateContext';
import type { ProfileLink } from '../../types/domain';
import { canEditPersonCard, resolvePersonView } from '../../utils/securityGuards';
import { getSafeCharCount } from '../../utils/validation';
import { AvatarBadge, AVATAR_PRESET_OPTIONS } from '../common/AvatarBadge';
import { IconCropperModal } from './IconCropperModal';

interface PersonProfileModalProps {
  personId: string;
  onClose: () => void;
  onEditPersonProjectFields?: (personId: string) => void;
}

export const PersonProfileModal: React.FC<PersonProfileModalProps> = ({
  personId,
  onClose,
  onEditPersonProjectFields,
}) => {
  const {
    currentBundle,
    actor,
    permissions,
    userProfiles,
    profileIcons,
    updateSelfProfile,
    invitations,
    createAccountInvitation,
    unlinkPersonAccount,
  } = useAppState();

  const [isEditingSelf, setIsEditingSelf] = useState(false);
  const [showIconCropper, setShowIconCropper] = useState(false);

  // 本人プロフィール編集フォーム状態
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [links, setLinks] = useState<ProfileLink[]>([]);
  const [isPublic, setIsPublic] = useState(false);
  const [avatarPreset, setAvatarPreset] = useState('user');
  const [pendingIconData, setPendingIconData] = useState<{ dataUrl: string; byteSize: number } | null | undefined>(
    undefined
  );
  const [removeIconFlag, setRemoveIconFlag] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // 管理者によるひも付け招待フォーム状態
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);

  if (!currentBundle) return null;
  const person = currentBundle.people.find((p) => p.id === personId);
  if (!person) return null;

  const resolved = resolvePersonView(
    person,
    actor,
    userProfiles,
    profileIcons,
    currentBundle.projectIcons
  );

  // 所属グループと所属ごとの役割一覧
  const personMemberships = currentBundle.memberships
    .filter((m) => m.personId === person.id)
    .map((m) => {
      const grp = currentBundle.groups.find((g) => g.id === m.groupId);
      const parentGrp =
        grp?.kind === 'small' && grp.parentGroupId
          ? currentBundle.groups.find((g) => g.id === grp.parentGroupId)
          : null;
      const roles = m.roleIds
        .map((rid) => currentBundle.project.roleTags.find((t) => t.id === rid))
        .filter(Boolean);
      return {
        membership: m,
        group: grp,
        parentGroup: parentGrp,
        roles,
      };
    })
    .filter((item) => item.group !== undefined);

  const globalRoles = person.globalRoleIds
    .map((rid) => currentBundle.project.roleTags.find((t) => t.id === rid))
    .filter(Boolean);

  const skills = person.skillIds
    .map((sid) => currentBundle.project.skillTags.find((t) => t.id === sid))
    .filter(Boolean);

  // この人物が関わるすべての関係性（人物↔人物、人物↔グループの両方をユーザー情報として表示）
  const relatedRelationships = currentBundle.relationships
    .filter(
      (r) =>
        (r.sourceKind === 'person' && r.sourceId === person.id) ||
        (r.targetKind === 'person' && r.targetId === person.id)
    )
    .map((r) => {
      const isSource = r.sourceKind === 'person' && r.sourceId === person.id;
      const otherKind = isSource ? r.targetKind : r.sourceKind;
      const otherId = isSource ? r.targetId : r.sourceId;

      let otherName = '不明';
      let otherColor = '#64748b';
      if (otherKind === 'person') {
        const op = currentBundle.people.find((p) => p.id === otherId);
        if (op) {
          const opResolved = resolvePersonView(
            op,
            actor,
            userProfiles,
            profileIcons,
            currentBundle.projectIcons
          );
          otherName = opResolved.effectiveDisplayName;
          otherColor = op.color;
        }
      } else {
        const og = currentBundle.groups.find((g) => g.id === otherId);
        if (og) {
          otherName = og.name;
          otherColor = og.color;
        }
      }

      const directionSymbol =
        r.direction === 'bidirectional'
          ? '⇄'
          : r.direction === 'none'
          ? '―'
          : isSource
          ? '→'
          : '←';

      return {
        rel: r,
        isSource,
        otherKind,
        otherId,
        otherName,
        otherColor,
        directionSymbol,
      };
    });

  const activeInvitation = person.activeInvitationId
    ? invitations.find((i) => i.id === person.activeInvitationId && i.status === 'pending')
    : null;

  // 本人プロフィール編集モードを開始
  const handleStartEditSelf = () => {
    if (!person.linkedUid || actor.uid !== person.linkedUid) return;
    const currentProf = userProfiles[person.linkedUid];
    setDisplayName(currentProf?.displayName || person.displayName);
    setBio(currentProf?.bio || '');
    setLinks(currentProf?.links ? currentProf.links.map((l) => ({ ...l })) : []);
    setIsPublic(currentProf?.isPublic ?? false);
    setAvatarPreset(currentProf?.avatarPreset || person.avatarPreset || 'user');
    setPendingIconData(undefined);
    setRemoveIconFlag(false);
    setFormError(null);
    setSaveSuccessMsg(null);
    setIsEditingSelf(true);
  };

  const handleSaveSelfProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!person.linkedUid) return;
    setFormError(null);
    setSaveSuccessMsg(null);
    try {
      await updateSelfProfile(
        person.linkedUid,
        {
          displayName,
          bio,
          links,
          isPublic,
          avatarPreset,
        },
        pendingIconData,
        removeIconFlag
      );
      setIsEditingSelf(false);
      setSaveSuccessMsg('本人プロフィールを保存しました。');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCreateInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteMsg(null);
    try {
      const inv = await createAccountInvitation(person.id, inviteEmail);
      setInviteEmail('');
      setInviteMsg(
        `招待を作成しました（宛先: ${inv.targetEmail}）。対象者がそのGoogleアカウントでログインして承認するとひも付けが完了します。`
      );
    } catch (err) {
      setInviteMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const bioCount = getSafeCharCount(bio);
  const canUnlink =
    person.linkedUid !== null &&
    (permissions.isAdmin || (actor.uid && actor.uid === person.linkedUid));

  const previewIconUrl = removeIconFlag
    ? null
    : pendingIconData?.dataUrl ?? resolved.iconDataUrl;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* ヘッダー */}
        <div
          className="px-6 py-4 flex items-center justify-between border-b border-slate-100"
          style={{ background: `linear-gradient(135deg, ${person.color}14, #ffffff)` }}
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <AvatarBadge
              name={resolved.effectiveDisplayName}
              color={person.color}
              iconDataUrl={resolved.iconDataUrl}
              preset={resolved.avatarPreset}
              size="xl"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-extrabold text-slate-900 truncate">
                  {resolved.effectiveDisplayName}
                </h2>
                {resolved.profileDisplayName &&
                  resolved.profileDisplayName !== resolved.effectiveDisplayName && (
                    <span className="text-xs font-medium text-slate-500">
                      （本人名: {resolved.profileDisplayName}）
                    </span>
                  )}
              </div>

              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {resolved.linkStatus === 'linked_public' && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                    <UserCheck size={12} /> 本人アカウント連携済（公開プロフィール）
                  </span>
                )}
                {resolved.linkStatus === 'linked_private' && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
                    <Lock size={12} /> 本人プロフィール非公開
                  </span>
                )}
                {resolved.linkStatus === 'invited' && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-0.5 text-[11px] font-bold text-sky-800">
                    <Mail size={12} /> 本人ひも付け招待承認待ち
                  </span>
                )}
                {resolved.linkStatus === 'unlinked' && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
                    アカウント未連携
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* 本人にだけ「プロフィール編集」ボタンを表示（管理者や編集者でも他人には表示しない） */}
            {resolved.canEditSelfProfile && !isEditingSelf && (
              <button
                type="button"
                onClick={handleStartEditSelf}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 transition"
                data-testid="edit-self-profile-btn"
              >
                <Pencil size={14} />
                プロフィール編集（本人専用）
              </button>
            )}

            {canEditPersonCard(actor, person, currentBundle) &&
              onEditPersonProjectFields &&
              !isEditingSelf && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onEditPersonProjectFields(person.id);
                  }}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  data-testid="open-person-editor-from-profile-btn"
                >
                  {permissions.isEditor ? 'プロジェクト設定・所属編集' : '所属・ロール・カード編集'}
                </button>
              )}

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* 本文エリア */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {saveSuccessMsg && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">
              <CheckCircle2 size={16} />
              <span>{saveSuccessMsg}</span>
            </div>
          )}

          {/* 本人専用プロフィール編集フォーム */}
          {isEditingSelf ? (
            <form onSubmit={handleSaveSelfProfile} className="space-y-4 bg-indigo-50/40 p-5 rounded-2xl border border-indigo-200">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-indigo-950 flex items-center gap-1.5">
                  <Sparkles size={16} className="text-indigo-600" />
                  本人プロフィールの編集（あなたのGoogleアカウント所有）
                </h3>
                <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-100 px-2.5 py-0.5 rounded-full">
                  管理者も変更不可・本人のみ編集可
                </span>
              </div>

              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                  アカウント共通プロフィールと公開範囲に関する重要なご案内
                </p>
                <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-800">
                  <li>本人プロフィールはアカウント単位で共通のため、変更内容はあなたが連携している複数プロジェクトすべてに反映されます。</li>
                  <li>「公開する」をONにすると、公開プロジェクトのURLを知っている第三者もあなたのプロフィール表示名・アイコン・コメント・リンクを閲覧できます（Googleメールアドレスは公開プロフィールに含まれません）。</li>
                  <li>後から「非公開」に戻すと今後の取得は制限されますが、既に第三者が保存した画像や情報までは回収できない点にご留意ください。</li>
                </ul>
              </div>

              {formError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
                  {formError}
                </div>
              )}

              {/* 本人アイコンとプリセット */}
              <div className="flex items-center gap-4 bg-white p-3.5 rounded-xl border border-slate-200">
                <AvatarBadge
                  name={displayName || person.displayName}
                  color={person.color}
                  iconDataUrl={previewIconUrl}
                  preset={avatarPreset}
                  size="lg"
                />
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setShowIconCropper(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
                    >
                      <ImagePlus size={14} />
                      本人アイコン画像をアップロード (128×128 WebP)
                    </button>
                    {previewIconUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          setPendingIconData(null);
                          setRemoveIconFlag(true);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                      >
                        <Trash2 size={13} /> 画像を削除
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-500">代替アイコン:</span>
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

              {/* プロフィール表示名 */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  プロフィール表示名（最大60文字）
                </label>
                <input
                  type="text"
                  required
                  maxLength={60}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              {/* 本人コメント（最大400文字、日本語・絵文字・UTF-16コード単位を考慮した安全カウント表示） */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700">
                    本人コメント（プレーンテキスト・最大400文字）
                  </label>
                  <span
                    className={`text-xs font-mono font-bold ${
                      bioCount.effectiveCount > 400 ? 'text-rose-600' : 'text-slate-500'
                    }`}
                  >
                    {bioCount.effectiveCount} / 400文字
                    {bioCount.utf16Units !== bioCount.graphemes &&
                      ` (表示:${bioCount.graphemes} / 保存単位:${bioCount.utf16Units})`}
                  </span>
                </div>
                <textarea
                  rows={4}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="自己紹介や担当領域、連絡手段などを入力してください（HTMLは実行されずプレーンテキストとして安全に表示されます）"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              {/* URLリンク（最大2個、http:// or https:// のみ） */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700">
                    URLリンク（最大2個・ラベル最大50文字・http:// または https:// のみ）
                  </label>
                  {links.length < 2 && (
                    <button
                      type="button"
                      onClick={() => setLinks((prev) => [...prev, { label: '', url: 'https://' }])}
                      className="inline-flex items-center gap-1 rounded-lg bg-white border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Plus size={13} /> リンクを追加
                    </button>
                  )}
                </div>

                {links.map((link, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-white p-2.5 rounded-xl border border-slate-200">
                    <div className="col-span-4">
                      <input
                        type="text"
                        placeholder="表示ラベル (最大50文字)"
                        maxLength={50}
                        value={link.label}
                        onChange={(e) => {
                          const val = e.target.value;
                          setLinks((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, label: val } : item))
                          );
                        }}
                        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                      />
                    </div>
                    <div className="col-span-7">
                      <input
                        type="url"
                        placeholder="https://example.com"
                        value={link.url}
                        onChange={(e) => {
                          const val = e.target.value;
                          setLinks((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, url: val } : item))
                          );
                        }}
                        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
                      />
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setLinks((prev) => prev.filter((_, i) => i !== idx))}
                        className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* 公開設定トグル */}
              <div className="flex items-center justify-between rounded-xl bg-white p-3.5 border border-slate-200">
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    {isPublic ? (
                      <>
                        <Eye size={15} className="text-emerald-600" />
                        本人プロフィールを公開する
                      </>
                    ) : (
                      <>
                        <EyeOff size={15} className="text-amber-600" />
                        非公開にする（本人以外にコメント・リンク・本人アイコンを公開しない）
                      </>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    非公開時は、相関図ではプロジェクト上の表示名「{person.displayName}」と代替アイコンで表示されます。
                  </p>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={isPublic}
                    onChange={(e) => setIsPublic(e.target.checked)}
                    className="peer sr-only"
                  />
                  <div className="h-6 w-11 rounded-full bg-slate-300 after:absolute after:top-0.5 after:left-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-emerald-600 peer-checked:after:translate-x-full" />
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditingSelf(false)}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700"
                >
                  本人プロフィールを保存
                </button>
              </div>
            </form>
          ) : (
            /* 通常閲覧ビュー：本人プロフィール領域 */
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                  本人プロフィール（アカウント所有者管理）
                </h3>
                {!resolved.canEditSelfProfile && person.linkedUid && (
                  <span className="text-[11px] text-slate-400">
                    ※本人プロフィールは連携アカウント本人のみ編集できます
                  </span>
                )}
              </div>

              {resolved.linkStatus === 'unlinked' || resolved.linkStatus === 'invited' ? (
                <div className="rounded-xl bg-white border border-slate-200 p-3.5 text-xs text-slate-600 space-y-1">
                  <p className="font-semibold text-slate-700">
                    本人コメント・本人リンク：未登録（Googleアカウント未連携）
                  </p>
                  <p className="text-[11px] text-slate-500">
                    この人物はまだGoogleアカウントとひも付けられていません。プロジェクト編集者が設定した表示名と仮アイコンで表示されています。
                  </p>
                </div>
              ) : !resolved.canViewProfileContent ? (
                <div className="rounded-xl bg-amber-50/70 border border-amber-200 p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
                  <Lock size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">この人物の本人プロフィールは非公開に設定されています</p>
                    <p className="text-[11px] text-amber-800 mt-0.5">
                      非公開設定のため、本人以外に本人コメント・URLリンク・本人アイコンは公開されません。図ではプロジェクト上の表示名と代替アイコンで表示されます。
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 bg-white rounded-xl border border-slate-200 p-4">
                  {!resolved.isProfilePublic && (
                    <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5 text-[11px] font-semibold text-amber-800">
                      🔒 現在「非公開」設定中です（あなた本人にのみこの内容が見えています）
                    </div>
                  )}
                  <div>
                    <span className="text-[11px] font-semibold text-slate-400 block mb-1">
                      本人コメント
                    </span>
                    {/* プレーンテキストとして安全に表示（HTML非実行） */}
                    <p className="text-sm text-slate-800 whitespace-pre-wrap break-words leading-relaxed">
                      {resolved.bio || '（コメントは入力されていません）'}
                    </p>
                  </div>

                  {resolved.links.length > 0 && (
                    <div>
                      <span className="text-[11px] font-semibold text-slate-400 block mb-1.5">
                        本人URLリンク
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {resolved.links.map((link, idx) => (
                          <a
                            key={idx}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50/70 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition"
                          >
                            <Link2 size={13} />
                            <span>{link.label}</span>
                            <ExternalLink size={12} className="opacity-70" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 所属グループと所属先ごとのロール（メイン情報） */}
          <div className="space-y-3">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Building2 size={14} className="text-indigo-600" />
              所属グループとグループ内での役割（ロール）
            </h3>

            {/* 全体ロール */}
            <div className="rounded-xl border border-slate-200 bg-white p-3.5">
              <span className="text-[11px] font-bold text-slate-500 block mb-1.5">
                プロジェクト全体での役割・肩書
              </span>
              {globalRoles.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {globalRoles.map((r) =>
                    r ? (
                      <span
                        key={r.id}
                        className="inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-bold text-white shadow-2xs"
                        style={{ backgroundColor: r.color }}
                      >
                        {r.name}
                      </span>
                    ) : null
                  )}
                </div>
              ) : (
                <span className="text-xs text-slate-400">未設定</span>
              )}
            </div>

            {/* 所属グループごとの役割カード */}
            {personMemberships.length > 0 ? (
              <div className="grid grid-cols-1 gap-2.5">
                {personMemberships.map(({ membership, group, parentGroup, roles }) => (
                  <div
                    key={membership.id}
                    className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: group!.color }}
                        />
                        {parentGroup && (
                          <span className="text-xs font-semibold text-slate-400">
                            {parentGroup.name} /
                          </span>
                        )}
                        <span className="text-sm font-bold text-slate-900">{group!.name}</span>
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                          {group!.kind === 'large' ? '大グループ直接所属' : '小グループ所属'}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {roles.length > 0 ? (
                          roles.map((r) =>
                            r ? (
                              <span
                                key={r.id}
                                className="inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-bold text-white"
                                style={{ backgroundColor: r.color }}
                              >
                                {r.name}
                              </span>
                            ) : null
                          )
                        ) : (
                          <span className="text-xs text-slate-400">役割タグなし</span>
                        )}
                      </div>
                    </div>

                    {membership.memo && (
                      <p className="text-xs text-slate-600 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                        所属メモ: {membership.memo}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
                所属しているグループはありません
              </div>
            )}
          </div>

          {/* 関係性一覧（人物間および「グループ-人」の関係性をユーザー情報として表示） */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Link2 size={14} className="text-indigo-600" />
              登録されている関係性（人物・グループとの関係：{relatedRelationships.length}件）
            </h3>
            {relatedRelationships.length > 0 ? (
              <div className="grid grid-cols-1 gap-2">
                {relatedRelationships.map(
                  ({ rel, otherKind, otherName, otherColor, directionSymbol }) => (
                    <div
                      key={rel.id}
                      className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 flex items-center justify-between gap-3 flex-wrap"
                    >
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                        <span className="text-slate-600">{resolved.effectiveDisplayName}</span>
                        <span
                          className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-extrabold text-white"
                          style={{ backgroundColor: rel.color || '#475569' }}
                        >
                          {directionSymbol} {rel.label}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: otherColor }}
                          />
                          <span>{otherName}</span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                            {otherKind === 'group' ? 'グループ' : '人物'}
                          </span>
                        </span>
                      </div>
                      {rel.memo && (
                        <span className="text-[11px] text-slate-500">{rel.memo}</span>
                      )}
                    </div>
                  )
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 p-3.5 text-center text-xs text-slate-400">
                登録されている関係性はありません
              </div>
            )}
          </div>

          {/* スキル・プロジェクト用メモ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-3.5">
              <span className="text-[11px] font-bold text-slate-500 block mb-2">スキルタグ</span>
              {skills.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {skills.map((s) =>
                    s ? (
                      <span
                        key={s.id}
                        className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold"
                        style={{
                          borderColor: `${s.color}55`,
                          backgroundColor: `${s.color}15`,
                          color: s.color,
                        }}
                      >
                        {s.name}
                      </span>
                    ) : null
                  )}
                </div>
              ) : (
                <span className="text-xs text-slate-400">スキル未設定</span>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3.5">
              <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1 mb-1">
                <FileText size={12} />
                プロジェクト用メモ（編集者管理項目）
              </span>
              <p className="text-xs text-slate-700 whitespace-pre-wrap">
                {person.projectMemo || '（メモなし）'}
              </p>
            </div>
          </div>

          {/* アカウントひも付け管理（管理者または連携本人） */}
          {(permissions.isAdmin || canUnlink) && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <h4 className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5">
                <ShieldAlert size={15} className="text-indigo-600" />
                人物とGoogleアカウントの安全なひも付け管理
              </h4>

              {!person.linkedUid && permissions.isAdmin && (
                <form onSubmit={handleCreateInvitation} className="space-y-2">
                  <p className="text-[11px] text-slate-600">
                    管理者がメールアドレスを入力しただけでは勝手にひも付けられません。招待を作成し、対象者本人がそのGoogleアカウントでログインして承認した時のみひも付けが完了します。
                  </p>
                  {activeInvitation && (
                    <div className="rounded-xl bg-sky-50 border border-sky-200 px-3 py-2 text-xs text-sky-900">
                      現在 <strong>{activeInvitation.targetEmail}</strong> 宛てに招待を送信中です（承認待ち）。
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="email"
                      required
                      placeholder="対象者のGoogleメールアドレス (例: ito.infra@example.com)"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs"
                    />
                    <button
                      type="submit"
                      className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-bold text-white hover:bg-slate-900 shrink-0"
                    >
                      ひも付け招待を作成
                    </button>
                  </div>
                  {inviteMsg && (
                    <p className="text-xs font-semibold text-indigo-700">{inviteMsg}</p>
                  )}
                </form>
              )}

              {canUnlink && (
                <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200">
                  <div className="text-xs text-slate-600">
                    <p className="font-bold text-slate-800">アカウントのひも付け解除</p>
                    <p className="text-[11px] text-slate-500">
                      ひも付けを解除しても、本人プロフィール自体のデータや画像は変更・削除されません。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await unlinkPersonAccount(person.id);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 shrink-0"
                  >
                    <Unlink size={14} />
                    ひも付けを解除
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showIconCropper && (
        <IconCropperModal
          title="本人プロフィール画像の切り抜き・WebP圧縮"
          currentDataUrl={previewIconUrl}
          onSave={(res) => {
            if (res === null) {
              setPendingIconData(null);
              setRemoveIconFlag(true);
            } else {
              setPendingIconData(res);
              setRemoveIconFlag(false);
            }
          }}
          onClose={() => setShowIconCropper(false)}
        />
      )}
    </div>
  );
};
