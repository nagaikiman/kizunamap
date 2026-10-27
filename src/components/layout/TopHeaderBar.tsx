import React from 'react';
import {
  AlertCircle,
  BellRing,
  Check,
  Cloud,
  CloudOff,
  Download,
  Eye,
  FileCode2,
  FolderKanban,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import { useAppState } from '../../context/AppStateContext';

interface TopHeaderBarProps {
  onOpenAdminSettings: (tab?: 'project' | 'members' | 'yaml' | 'testUsers') => void;
  onOpenSelfProfileModal: (personId: string) => void;
}

export const TopHeaderBar: React.FC<TopHeaderBarProps> = ({
  onOpenAdminSettings,
  onOpenSelfProfileModal,
}) => {
  const {
    projectsMap,
    currentProjectId,
    selectProject,
    currentBundle,
    actor,
    testUsers,
    activeTestUserUid,
    switchTestUser,
    permissions,
    saveStatus,
    saveErrorMessage,
    simulateNetworkFailure,
    setSimulateNetworkFailure,
    manualRefreshProject,
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

  return (
    <div className="flex flex-col shrink-0 z-20">
      {/* メイン上部バー */}
      <header className="h-14 bg-white border-b border-slate-200 px-4 flex items-center justify-between gap-3">
        {/* 左：アプリタイトル＆プロジェクト切替 */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-base font-black tracking-tight text-slate-900">
              Kizuna<span className="text-indigo-600">Map</span>
            </span>
          </div>

          <div className="h-5 w-px bg-slate-200 hidden sm:block" />

          {/* プロジェクト選択ドロップダウン */}
          <div className="flex items-center gap-1.5 bg-slate-100 rounded-xl px-2.5 py-1 border border-slate-200">
            <FolderKanban size={14} className="text-indigo-600 shrink-0" />
            <select
              value={currentProjectId}
              onChange={(e) => selectProject(e.target.value)}
              className="bg-transparent text-xs font-extrabold text-slate-800 focus:outline-none max-w-[230px] truncate"
              data-testid="project-selector"
            >
              {Object.values(projectsMap).map((b) => (
                <option key={b.project.id} value={b.project.id}>
                  {b.project.isPublic ? '🌐 ' : '🔒 '}
                  {b.project.name}
                </option>
              ))}
            </select>
          </div>

          {/* 公開状態＆現在の権限バッジ */}
          {currentBundle && (
            <div className="hidden lg:flex items-center gap-1.5">
              {currentBundle.project.isPublic ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                  <Eye size={11} /> 公開プロジェクト
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
                  <Lock size={11} /> 非公開プロジェクト
                </span>
              )}

              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${
                  permissions.isAdmin
                    ? 'bg-indigo-600 text-white'
                    : permissions.isEditor
                    ? 'bg-sky-100 text-sky-800'
                    : actor.uid
                    ? 'bg-slate-200 text-slate-700'
                    : 'bg-slate-100 text-slate-500'
                }`}
                data-testid="current-permission-badge"
              >
                <ShieldCheck size={11} />
                {permissions.isAdmin
                  ? '権限: 管理者(オーナー)'
                  : permissions.isEditor
                  ? '権限: 編集者'
                  : actor.uid
                  ? '権限: 閲覧＋本人プロフィール編集のみ'
                  : '権限: 未ログイン閲覧'}
              </span>
            </div>
          )}
        </div>

        {/* 右：保存状態・通信テスト・YAML退避・マルチユーザースイッチャー */}
        <div className="flex items-center gap-2">
          {/* 保存ステータスインジケータ（通信失敗時は未保存と明示） */}
          <div
            className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-bold border ${
              saveStatus === 'error'
                ? 'bg-rose-50 border-rose-300 text-rose-700'
                : saveStatus === 'saving'
                ? 'bg-amber-50 border-amber-200 text-amber-800'
                : 'bg-emerald-50 border-emerald-200 text-emerald-700'
            }`}
            data-testid="save-status-badge"
          >
            {saveStatus === 'error' ? (
              <>
                <CloudOff size={14} className="text-rose-600" />
                <span>未保存（保存失敗）</span>
              </>
            ) : saveStatus === 'saving' ? (
              <>
                <Loader2 size={14} className="animate-spin text-amber-600" />
                <span>保存中...</span>
              </>
            ) : (
              <>
                <Cloud size={14} className="text-emerald-600" />
                <span>保存済み</span>
              </>
            )}
          </div>

          {/* 公開閲覧時の手動更新ボタン */}
          {!permissions.isEditor && (
            <button
              type="button"
              onClick={manualRefreshProject}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              title="最新の図データを手動取得"
            >
              <RefreshCw size={13} /> 更新
            </button>
          )}

          {/* 通信失敗シミュレーション切替（テスト要件「通信失敗時の未保存表示」検証用） */}
          <button
            type="button"
            onClick={() => setSimulateNetworkFailure(!simulateNetworkFailure)}
            className={`hidden xl:inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-[11px] font-bold transition ${
              simulateNetworkFailure
                ? 'border-rose-400 bg-rose-600 text-white'
                : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
            title="通信失敗・無料枠到達時の未保存表示を検証するためのトグル"
            data-testid="toggle-network-failure-btn"
          >
            <WifiOff size={12} />
            {simulateNetworkFailure ? '通信障害テスト中(ON)' : '通信障害テスト'}
          </button>

          {/* 自分の本人プロフィール直通ボタン（自分にひも付いた人物がある場合） */}
          {myLinkedPerson && (
            <button
              type="button"
              onClick={() => onOpenSelfProfileModal(myLinkedPerson.id)}
              className="inline-flex items-center gap-1 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
              data-testid="header-my-profile-btn"
            >
              本人プロフィール ({myLinkedPerson.displayName})
            </button>
          )}

          {/* 管理者専用：YAML退避・取込ショートカット */}
          {permissions.isAdmin && (
            <button
              type="button"
              onClick={() => onOpenAdminSettings('yaml')}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-100"
              title="ローカルへのYAML退避・取込（管理者専用）"
              data-testid="header-yaml-btn"
            >
              <FileCode2 size={14} className="text-indigo-600" />
              <span className="hidden md:inline">YAML退避・取込</span>
            </button>
          )}

          {/* マルチユーザー検証用：アカウント切り替えセレクタ */}
          <div className="flex items-center gap-1.5 rounded-xl bg-slate-900 text-white px-2.5 py-1 shadow-xs">
            <Users size={13} className="text-indigo-400 shrink-0" />
            <select
              value={activeTestUserUid ?? '__anonymous__'}
              onChange={(e) => {
                const val = e.target.value;
                switchTestUser(val === '__anonymous__' ? null : val);
              }}
              className="bg-slate-900 text-white text-xs font-bold focus:outline-none max-w-[230px] truncate cursor-pointer"
              title="テスト用操作ユーザーを切り替え"
              data-testid="test-user-switcher"
            >
              <option value="__anonymous__">👤 未ログイン（ゲスト閲覧者）</option>
              {testUsers.map((u) => (
                <option key={u.uid} value={u.uid}>
                  🔑 {u.displayName} ({u.email})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onOpenAdminSettings('testUsers')}
              className="rounded bg-indigo-600 hover:bg-indigo-500 px-1.5 py-0.5 text-[10px] font-extrabold text-white shrink-0"
              title="テスト用ユーザーを新規作成・管理"
              data-testid="open-test-users-modal-btn"
            >
              ＋作成
            </button>
          </div>
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
