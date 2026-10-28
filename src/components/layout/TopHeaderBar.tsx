import React from 'react';
import {
  AlertCircle,
  BellRing,
  Check,
  FolderKanban,
  UserPlus,
  X,
} from 'lucide-react';
import { useAppState } from '../../context/AppStateContext';
import { signInWithGooglePopup, signOutFirebase } from '../../services/firebaseClient';
import { canCreateSelfPerson } from '../../utils/securityGuards';

interface TopHeaderBarProps {
  onOpenAdminSettings: (tab?: 'project' | 'members' | 'yaml' | 'testUsers') => void;
  onOpenSelfProfileModal: (personId: string) => void;
  onOpenSelfPersonCreator?: () => void;
}

export const TopHeaderBar: React.FC<TopHeaderBarProps> = ({
  onOpenAdminSettings,
  onOpenSelfProfileModal,
  onOpenSelfPersonCreator,
}) => {
  const {
    projectsMap,
    currentProjectId,
    selectProject,
    currentBundle,
    actor,
    currentUserLabel,
    isFirebaseConfigured,
    testUsers,
    activeTestUserUid,
    switchTestUser,
    permissions,
    saveStatus,
    saveErrorMessage,
    simulateNetworkFailure,
    setSimulateNetworkFailure,
    invitations,
    approveAccountInvitation,
    declineOrCancelInvitation,
  } = useAppState();

  // 現在ログインしているユーザーのメールアドレス宛てに届いている「承認待ち（pending）」招待
  const pendingInvitationsForMe = invitations.filter(
    (inv) =>
      inv.status === 'pending' &&
      actor.email &&
      actor.emailVerified &&
      inv.targetEmail.toLowerCase() === actor.email.toLowerCase()
  );

  // 現在のプロジェクト内で自分にひも付いている人物
  const myLinkedPerson = currentBundle?.people.find(
    (p) => actor.uid && p.linkedUid === actor.uid
  );

  const rolePrefix = permissions.isAdmin ? '管理：' : '一般：';

  return (
    <div className="flex flex-col shrink-0 z-20">
      {/* メイン上部バー */}
      <header className="min-h-13 bg-white border-b border-slate-200 px-3 sm:px-4 py-1.5 flex items-center justify-between gap-2 overflow-x-auto">
        {/* 左：アプリタイトル＆プロジェクト切替 */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink-0">
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm sm:text-base font-black tracking-tight text-slate-900">
              Kizuna<span className="text-indigo-600">Map</span>
            </span>
          </div>

          <div className="h-5 w-px bg-slate-200 hidden sm:block" />

          {/* プロジェクト選択ドロップダウン */}
          <div className="flex items-center gap-1.5 bg-slate-100 rounded-xl px-2.5 py-1 border border-slate-200">
            <FolderKanban size={14} className="text-indigo-600 shrink-0 hidden sm:inline" />
            <select
              value={currentProjectId}
              onChange={(e) => selectProject(e.target.value)}
              className="bg-transparent text-xs font-extrabold text-slate-800 focus:outline-none max-w-[140px] sm:max-w-[230px] truncate"
              data-testid="project-selector"
            >
              {Object.values(projectsMap).map((b) => (
                <option key={b.project.id} value={b.project.id}>
                  {b.project.name}
                </option>
              ))}
            </select>
          </div>

          {/* 権限バッジ（アイコン無し・シンプル表示、管理者はクリックで管理設定を開ける） */}
          {currentBundle && permissions.isAdmin && (
            <button
              type="button"
              onClick={() => onOpenAdminSettings('project')}
              className="hidden md:inline-flex items-center rounded-full bg-indigo-600 text-white px-3 py-1 text-[11px] font-extrabold hover:bg-indigo-700 transition whitespace-nowrap"
              title="クリックでプロジェクト管理設定を開く"
              data-testid="current-permission-badge"
            >
              権限: 管理者
            </button>
          )}
        </div>

        {/* 右：カード未作成時の追加ボタン・YAML退避・アカウント表示（クリックでプロフィール編集） */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* ログイン済みでまだ自分の人物カードが無い場合のみ追加ボタンを表示 */}
          {!myLinkedPerson &&
            currentBundle &&
            canCreateSelfPerson(actor, currentBundle) &&
            onOpenSelfPersonCreator && (
              <button
                type="button"
                onClick={onOpenSelfPersonCreator}
                className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 shadow-2xs whitespace-nowrap"
                data-testid="header-create-self-person-btn"
              >
                <UserPlus size={13} /> 自分のカードを追加
              </button>
            )}

          {/* 管理者用：YAML退避・取込（アイコン無し） */}
          {permissions.isAdmin && (
            <button
              type="button"
              onClick={() => onOpenAdminSettings('yaml')}
              className="hidden sm:inline-flex items-center rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-100 whitespace-nowrap"
              title="ローカルへのYAML退避・取込"
              data-testid="header-yaml-btn"
            >
              YAML退避・取込
            </button>
          )}

          {/* 本番Firebase接続時：右端アカウントピル（名前クリックで自分のプロフィール・カードを開く） */}
          {isFirebaseConfigured && !activeTestUserUid ? (
            <div className="flex items-center gap-1.5 sm:gap-2 rounded-xl bg-slate-900 text-white px-2.5 sm:px-3 py-1.5 shadow-xs whitespace-nowrap">
              {actor.uid ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      if (myLinkedPerson) {
                        onOpenSelfProfileModal(myLinkedPerson.id);
                      } else if (onOpenSelfPersonCreator) {
                        onOpenSelfPersonCreator();
                      }
                    }}
                    className="text-xs font-bold truncate max-w-[130px] sm:max-w-[200px] hover:text-indigo-300 transition text-left cursor-pointer"
                    title="クリックして自分のプロフィール・カードを編集"
                    data-testid="header-my-profile-btn"
                  >
                    {rolePrefix}
                    {myLinkedPerson?.displayName || currentUserLabel}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await signOutFirebase();
                      switchTestUser(null);
                    }}
                    className="rounded-lg bg-slate-700 hover:bg-slate-600 px-2 py-0.5 text-[11px] font-bold text-white shrink-0"
                  >
                    ログアウト
                  </button>
                </>
              ) : (
                <>
                  <span className="text-xs font-bold text-slate-300 whitespace-nowrap">
                    一般：未ログイン
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await signInWithGooglePopup();
                      } catch (err) {
                        alert(err instanceof Error ? err.message : String(err));
                      }
                    }}
                    className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-2.5 py-1 text-xs font-extrabold text-white shrink-0 whitespace-nowrap"
                  >
                    ログイン
                  </button>
                </>
              )}
            </div>
          ) : (
            /* ローカルデモモード時 */
            <div className="flex items-center gap-1.5 rounded-xl bg-slate-900 text-white px-2.5 py-1 shadow-xs whitespace-nowrap">
              <select
                value={activeTestUserUid ?? '__anonymous__'}
                onChange={(e) => {
                  const val = e.target.value;
                  switchTestUser(val === '__anonymous__' ? null : val);
                }}
                className="bg-slate-900 text-white text-xs font-bold focus:outline-none max-w-[180px] truncate cursor-pointer"
                title="操作ユーザーを切り替え"
                data-testid="test-user-switcher"
              >
                <option value="__anonymous__">一般：未ログイン</option>
                {testUsers.map((u) => {
                  const linkedPerson = currentBundle?.people.find((p) => p.linkedUid === u.uid);
                  const resolvedLabel = linkedPerson ? linkedPerson.displayName : u.displayName;
                  const prefix = u.roleHint === 'admin' || u.roleHint === 'editor' ? '管理：' : '一般：';
                  return (
                    <option key={u.uid} value={u.uid}>
                      {prefix}
                      {resolvedLabel}
                    </option>
                  );
                })}
              </select>
              {myLinkedPerson && (
                <button
                  type="button"
                  onClick={() => onOpenSelfProfileModal(myLinkedPerson.id)}
                  className="rounded bg-slate-700 hover:bg-slate-600 px-2 py-0.5 text-[10px] font-bold text-white shrink-0"
                >
                  プロフィール
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      {/* 通信エラー発生時の警告バナー */}
      {saveStatus === 'error' && saveErrorMessage && (
        <div
          className="bg-rose-600 text-white px-4 py-2 text-xs font-bold flex items-center justify-between"
          data-testid="network-error-banner"
        >
          <div className="flex items-center gap-2">
            <AlertCircle size={15} />
            <span>{saveErrorMessage}</span>
          </div>
          {simulateNetworkFailure && (
            <button
              type="button"
              onClick={() => setSimulateNetworkFailure(false)}
              className="rounded bg-white text-rose-700 px-2.5 py-0.5 text-[11px] font-extrabold"
            >
              通信障害テストを解除して復旧
            </button>
          )}
        </div>
      )}

      {/* ログイン中の本人メールアドレス宛ての「人物ひも付け招待」承認バナー */}
      {pendingInvitationsForMe.map((inv) => (
        <div
          key={inv.id}
          className="bg-indigo-600 text-white px-4 py-2.5 text-xs flex flex-wrap items-center justify-between gap-3 border-b border-indigo-700"
          data-testid={`invitation-banner-${inv.id}`}
        >
          <div className="flex items-center gap-2">
            <BellRing size={16} className="text-amber-300 shrink-0" />
            <span>
              <strong>【本人確認・ひも付け招待】</strong> プロジェクト「
              <strong>{inv.projectName}</strong>」の人物「
              <strong>{inv.personDisplayName}</strong>」へのアカウントひも付け招待が{' '}
              <code>{inv.targetEmail}</code> 宛てに届いています。対象人物とプロジェクトを確認して承認しますか？
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => approveAccountInvitation(inv.id)}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-400 text-slate-950 px-3 py-1 text-xs font-extrabold hover:bg-emerald-300"
              data-testid={`approve-invitation-${inv.id}`}
            >
              <Check size={14} /> 本人として承認してひも付ける
            </button>
            <button
              type="button"
              onClick={() => declineOrCancelInvitation(inv.id)}
              className="inline-flex items-center gap-1 rounded-lg bg-indigo-800 text-white px-2.5 py-1 text-xs font-semibold hover:bg-indigo-900"
            >
              <X size={13} /> 辞退する
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
