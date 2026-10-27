import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileCode2,
  FolderPlus,
  KeyRound,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useAppState } from '../../context/AppStateContext';
import type { TestSandboxUser } from '../../types/domain';

interface AdminSettingsModalProps {
  initialTab?: 'project' | 'members' | 'yaml' | 'testUsers';
  onClose: () => void;
}

export const AdminSettingsModal: React.FC<AdminSettingsModalProps> = ({
  initialTab = 'project',
  onClose,
}) => {
  const {
    currentBundle,
    permissions,
    actor,
    updateProjectMeta,
    createProject,
    deleteCurrentProject,
    addEditorEmail,
    revokeEditorEmail,
    exportCurrentProjectYaml,
    importCurrentProjectYaml,
    testUsers,
    activeTestUserUid,
    switchTestUser,
    createTestUser,
    deleteTestUser,
    resetDemoState,
  } = useAppState();

  const [tab, setTab] = useState<'project' | 'members' | 'yaml' | 'testUsers'>(initialTab);

  // プロジェクト設定
  const [projName, setProjName] = useState(currentBundle?.project.name || '');
  const [projDesc, setProjDesc] = useState(currentBundle?.project.description || '');
  const [projPublic, setProjPublic] = useState(currentBundle?.project.isPublic ?? true);

  // 新規プロジェクト作成
  const [newProjName, setNewProjName] = useState('');
  const [newProjDesc, setNewProjDesc] = useState('');
  const [newProjPublic, setNewProjPublic] = useState(true);

  // 編集者メール追加
  const [editorEmailInput, setEditorEmailInput] = useState('');

  // YAML バックアップ
  const yamlFileInputRef = useRef<HTMLInputElement | null>(null);
  const [yamlTextPreview, setYamlTextPreview] = useState('');

  // テスト用マルチユーザー作成
  const [testUserName, setTestUserName] = useState('');
  const [testUserEmail, setTestUserEmail] = useState('');
  const [testUserRole, setTestUserRole] = useState<TestSandboxUser['roleHint']>('self_only');

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
  const [confirmDeleteProj, setConfirmDeleteProj] = useState(false);

  if (!currentBundle) return null;

  const handleSaveProjectMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      await updateProjectMeta({
        name: projName.trim(),
        description: projDesc.trim(),
        isPublic: projPublic,
      });
      setFeedback({ type: 'success', text: 'プロジェクト設定を更新しました。' });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : String(err) });
    }
  };

  const handleCreateNewProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      await createProject(newProjName, newProjDesc, newProjPublic);
      setNewProjName('');
      setNewProjDesc('');
      setFeedback({ type: 'success', text: '新しいプロジェクトを作成し、切り替えました。' });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : String(err) });
    }
  };

  const handleAddEditor = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      await addEditorEmail(editorEmailInput);
      setEditorEmailInput('');
      setFeedback({ type: 'success', text: '編集者メールアドレスを許可リストに追加しました。' });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : String(err) });
    }
  };

  const handleDownloadYaml = () => {
    setFeedback(null);
    try {
      const yamlStr = exportCurrentProjectYaml();
      setYamlTextPreview(yamlStr);
      const blob = new Blob([yamlStr], { type: 'text/yaml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeName = currentBundle.project.name.replace(/[\\/:*?"<>|\s]+/g, '_');
      const dateStr = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `kizunamap_backup_${safeName}_${dateStr}.yaml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setFeedback({
        type: 'success',
        text: 'ローカルへYAMLバックアップファイルを退避（ダウンロード）しました。',
      });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : String(err) });
    }
  };

  const handleYamlFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFeedback(null);
    try {
      const text = await file.text();
      setYamlTextPreview(text);
      const res = await importCurrentProjectYaml(text);
      const warnSuffix =
        res.warnings.length > 0 ? `（注意: ${res.warnings.join(' / ')}）` : '';
      setFeedback({
        type: 'success',
        text: `YAMLバックアップからの取込（復元）が完了しました。${warnSuffix}`,
      });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : String(err) });
    } finally {
      e.target.value = '';
    }
  };

  const handleImportFromTextarea = async () => {
    setFeedback(null);
    try {
      const res = await importCurrentProjectYaml(yamlTextPreview);
      const warnSuffix =
        res.warnings.length > 0 ? `（注意: ${res.warnings.join(' / ')}）` : '';
      setFeedback({
        type: 'success',
        text: `YAMLテキストからの取込が完了しました。${warnSuffix}`,
      });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : String(err) });
    }
  };

  const handleCreateTestUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const created = await createTestUser({
        displayName: testUserName,
        email: testUserEmail,
        roleHint: testUserRole,
      });
      setTestUserName('');
      setTestUserEmail('');
      setFeedback({
        type: 'success',
        text: `テスト用ユーザー「${created.displayName} (${created.email})」を作成しました。一覧の「このユーザーで操作」または画面上部のスイッチャーからすぐに切り替えられます。`,
      });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : String(err) });
    }
  };

  const shareUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}?project=${currentBundle.project.id}`
      : `?project=${currentBundle.project.id}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* ヘッダー */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldCheck size={20} className="text-indigo-400" />
            <div>
              <h2 className="text-base font-extrabold">
                プロジェクト管理・YAML退避/取込・マルチユーザー検証
              </h2>
              <p className="text-[11px] text-slate-300">
                現在の操作アカウント: {actor.email || '未ログイン'} / 管理者権限:{' '}
                {permissions.isAdmin ? 'あり（オーナー）' : 'なし'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* タブバー */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-4 gap-1 overflow-x-auto">
          <button
            type="button"
            onClick={() => {
              setTab('project');
              setFeedback(null);
            }}
            className={`px-4 py-3 text-xs font-bold border-b-2 transition whitespace-nowrap ${
              tab === 'project'
                ? 'border-indigo-600 text-indigo-700 bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            1. プロジェクト・公開設定
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('members');
              setFeedback(null);
            }}
            className={`px-4 py-3 text-xs font-bold border-b-2 transition whitespace-nowrap ${
              tab === 'members'
                ? 'border-indigo-600 text-indigo-700 bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            2. 編集者メンバー管理（ACL）
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('yaml');
              setFeedback(null);
            }}
            className={`px-4 py-3 text-xs font-bold border-b-2 transition whitespace-nowrap flex items-center gap-1.5 ${
              tab === 'yaml'
                ? 'border-indigo-600 text-indigo-700 bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileCode2 size={14} />
            3. YAMLバックアップ退避・取込（管理者専用）
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('testUsers');
              setFeedback(null);
            }}
            className={`px-4 py-3 text-xs font-bold border-b-2 transition whitespace-nowrap flex items-center gap-1.5 ${
              tab === 'testUsers'
                ? 'border-indigo-600 text-indigo-700 bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users size={14} />
            4. テスト用複数ユーザー作成・切替
          </button>
        </div>

        {/* コンテンツ */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {feedback && (
            <div
              className={`flex items-start gap-2 rounded-xl border p-3.5 text-xs font-semibold ${
                feedback.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-rose-200 bg-rose-50 text-rose-700'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-emerald-600" />
              ) : (
                <AlertTriangle size={16} className="shrink-0 mt-0.5 text-rose-600" />
              )}
              <span>{feedback.text}</span>
            </div>
          )}

          {/* TAB 1: プロジェクト・公開設定 */}
          {tab === 'project' && (
            <div className="space-y-6">
              <form onSubmit={handleSaveProjectMeta} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    プロジェクト名
                  </label>
                  <input
                    type="text"
                    required
                    disabled={!permissions.isEditor}
                    value={projName}
                    onChange={(e) => setProjName(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm disabled:bg-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    プロジェクト説明
                  </label>
                  <textarea
                    rows={2}
                    disabled={!permissions.isEditor}
                    value={projDesc}
                    onChange={(e) => setProjDesc(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm disabled:bg-slate-100"
                  />
                </div>

                {/* 公開設定とURL限定公開の注意説明 */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                        {projPublic ? (
                          <>
                            <Eye size={15} className="text-emerald-600" />
                            公開プロジェクト（URLを知っている人はログインなしで閲覧可能）
                          </>
                        ) : (
                          <>
                            <EyeOff size={15} className="text-amber-600" />
                            非公開プロジェクト（管理者と許可された編集者のみ閲覧可能）
                          </>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        ※公開設定の変更はプロジェクト管理者（オーナー）のみ可能です。
                      </p>
                    </div>
                    <label className="relative inline-flex cursor-pointer items-center">
                      <input
                        type="checkbox"
                        disabled={!permissions.isAdmin}
                        checked={projPublic}
                        onChange={(e) => setProjPublic(e.target.checked)}
                        className="peer sr-only"
                      />
                      <div className="h-6 w-11 rounded-full bg-slate-300 after:absolute after:top-0.5 after:left-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-emerald-600 peer-checked:after:translate-x-full peer-disabled:opacity-50" />
                    </label>
                  </div>

                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-900 space-y-1">
                    <p className="font-bold flex items-center gap-1">
                      <AlertTriangle size={13} className="text-amber-600" />
                      URL識別子と公開に関するセキュリティ上の注意
                    </p>
                    <p>
                      プロジェクトURLには推測しにくい識別子（<code>{currentBundle.project.id}</code>）を使用し、<code>noindex, nofollow</code> で検索エンジンへの掲載を抑制していますが、<strong>URL限定公開は暗号化やアクセス制限による秘密保持の仕組みではありません</strong>。社外秘・機密情報を含む場合は必ず「非公開プロジェクト」に設定してください。
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={shareUrl}
                      className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono text-slate-600"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(shareUrl);
                        setFeedback({ type: 'success', text: '共有URLをクリップボードにコピーしました。' });
                      }}
                      className="inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                    >
                      <Copy size={13} /> URLコピー
                    </button>
                  </div>
                </div>

                {permissions.isEditor && (
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white hover:bg-indigo-700"
                    >
                      プロジェクト設定を保存
                    </button>
                  </div>
                )}
              </form>

              {/* 新規プロジェクト作成（運営アカウントのみ） */}
              <div className="border-t border-slate-200 pt-5 space-y-3">
                <h3 className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5">
                  <FolderPlus size={15} className="text-indigo-600" />
                  新規プロジェクト作成（事前登録された運営アカウントのみ可能）
                </h3>
                <form onSubmit={handleCreateNewProject} className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <div className="md:col-span-4">
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      新規プロジェクト名
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="例: 2027年度 新規事業体制"
                      value={newProjName}
                      onChange={(e) => setNewProjName(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
                    />
                  </div>
                  <div className="md:col-span-5">
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      説明
                    </label>
                    <input
                      type="text"
                      placeholder="プロジェクトの目的・概要"
                      value={newProjDesc}
                      onChange={(e) => setNewProjDesc(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
                    />
                  </div>
                  <div className="md:col-span-3 flex items-center justify-end gap-2">
                    <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={newProjPublic}
                        onChange={(e) => setNewProjPublic(e.target.checked)}
                      />
                      公開
                    </label>
                    <button
                      type="submit"
                      className="rounded-lg bg-slate-800 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-slate-900"
                    >
                      作成
                    </button>
                  </div>
                </form>
              </div>

              {/* プロジェクト削除とデモ初期化 */}
              {permissions.isAdmin && (
                <div className="border-t border-slate-200 pt-5 flex items-center justify-between flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      resetDemoState();
                      setFeedback({ type: 'success', text: '初期デモデータにリセットしました。' });
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    <RotateCcw size={14} /> 初期デモデータに戻す
                  </button>

                  {!confirmDeleteProj ? (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteProj(true)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100"
                    >
                      <Trash2 size={14} /> このプロジェクトを削除
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-xl">
                      <span className="text-xs font-bold text-rose-800">本当に削除しますか？</span>
                      <button
                        type="button"
                        onClick={async () => {
                          await deleteCurrentProject();
                          onClose();
                        }}
                        className="rounded-lg bg-rose-600 px-3 py-1 text-xs font-bold text-white hover:bg-rose-700"
                      >
                        削除実行
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteProj(false)}
                        className="rounded-lg bg-white border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600"
                      >
                        キャンセル
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: 編集者メンバー管理（ACL） */}
          {tab === 'members' && (
            <div className="space-y-4">
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 text-xs text-slate-600 space-y-1">
                <p className="font-bold text-slate-800 flex items-center gap-1.5">
                  <KeyRound size={14} className="text-indigo-600" />
                  プロジェクト編集権限とグループ内ロールの分離
                </p>
                <ul className="list-disc list-inside space-y-0.5 text-[11px] text-slate-500">
                  <li>図の中のグループ役割（「管理者」「責任者」など）を設定しても、このアプリの編集権限は付与されません。</li>
                  <li>ここで許可された確認済みGoogleメールアドレスのみが編集操作を行えます。</li>
                  <li>許可リストの一覧取得・変更はオーナー管理者のみ可能であり、一般閲覧者や編集者にはメンバー一覧（メールアドレス）は公開されません。</li>
                </ul>
              </div>

              {!permissions.isAdmin ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold text-amber-800">
                  編集者許可リストの一覧閲覧・追加・取り消しはプロジェクト管理者（オーナー）のみ可能です。
                </div>
              ) : (
                <>
                  <form onSubmit={handleAddEditor} className="flex gap-2">
                    <input
                      type="email"
                      required
                      placeholder="許可するGoogleアカウントのメールアドレス (例: sato.editor@example.com)"
                      value={editorEmailInput}
                      onChange={(e) => setEditorEmailInput(e.target.value)}
                      className="flex-1 rounded-xl border border-slate-300 px-3.5 py-2 text-xs"
                    />
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700"
                    >
                      <UserPlus size={14} /> 編集者として許可
                    </button>
                  </form>

                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-700">
                      登録済み編集者メールアドレス（管理者専用表示）
                    </h4>
                    {currentBundle.editorEmails.length === 0 ? (
                      <p className="text-xs text-slate-400">登録されている編集者はいません。</p>
                    ) : (
                      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                        {currentBundle.editorEmails.map((rec) => (
                          <div
                            key={rec.email}
                            className="flex items-center justify-between px-4 py-3 text-xs"
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="font-mono font-bold text-slate-800">
                                {rec.email}
                              </span>
                              {rec.active ? (
                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                                  編集許可中
                                </span>
                              ) : (
                                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                                  取り消し済み（書き込み拒否）
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              {rec.active ? (
                                <button
                                  type="button"
                                  onClick={() => revokeEditorEmail(rec.email)}
                                  className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 hover:bg-rose-100"
                                >
                                  権限を取り消す
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => addEditorEmail(rec.email)}
                                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
                                >
                                  再許可する
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB 3: YAMLバックアップ退避・取込（管理者専用） */}
          {tab === 'yaml' && (
            <div className="space-y-4">
              {!permissions.isAdmin ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-bold text-rose-800">
                  YAMLバックアップの退避（エクスポート）および取込（インポート）はプロジェクト管理者のみ実行できます。
                </div>
              ) : (
                <>
                  <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 text-xs text-slate-600 space-y-1">
                    <p className="font-bold text-slate-800">
                      ローカルYAMLバックアップ（退避・取込）仕様
                    </p>
                    <ul className="list-disc list-inside space-y-0.5 text-[11px] text-slate-500">
                      <li>プロジェクト基本情報、大・小グループ階層、人物（プロジェクト管理項目）、所属・ロール、関係線、全タブの座標、グループ画像・未連携仮画像を1つの <code>.yaml</code> ファイルに退避・復元できます。</li>
                      <li>セキュリティ保護のため、他人の非公開本人プロフィールや招待メールアドレスはYAMLに含めず、取込時も他人の本人プロフィール（<code>userProfiles</code>）は一切書き換えません。</li>
                    </ul>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={handleDownloadYaml}
                      className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-indigo-700"
                      data-testid="export-yaml-btn"
                    >
                      <Download size={15} />
                      YAMLファイルをローカルへ退避（ダウンロード）
                    </button>

                    <input
                      ref={yamlFileInputRef}
                      type="file"
                      accept=".yaml,.yml,text/yaml,application/x-yaml"
                      onChange={handleYamlFileUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => yamlFileInputRef.current?.click()}
                      className="inline-flex items-center gap-2 rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-2.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
                      data-testid="import-yaml-file-btn"
                    >
                      <Upload size={15} />
                      YAMLファイルを選択して取込（復元）
                    </button>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700">
                        YAMLプレビュー / 直接編集して取込
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setYamlTextPreview(exportCurrentProjectYaml())}
                          className="text-xs font-semibold text-indigo-600 hover:underline"
                        >
                          現在の状態をYAML生成して表示
                        </button>
                        {yamlTextPreview.trim() && (
                          <button
                            type="button"
                            onClick={handleImportFromTextarea}
                            className="rounded-lg bg-slate-800 px-3 py-1 text-xs font-bold text-white hover:bg-slate-900"
                            data-testid="apply-yaml-textarea-btn"
                          >
                            このYAML内容を取込反映
                          </button>
                        )}
                      </div>
                    </div>
                    <textarea
                      rows={11}
                      value={yamlTextPreview}
                      onChange={(e) => setYamlTextPreview(e.target.value)}
                      placeholder="ここにYAMLバックアップの内容が表示されます。直接貼り付けて「このYAML内容を取込反映」を押すことも可能です。"
                      className="w-full rounded-xl border border-slate-300 bg-slate-950 text-emerald-300 p-3.5 text-xs font-mono leading-relaxed"
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB 4: テスト用複数ユーザー作成・切り替え機能 */}
          {tab === 'testUsers' && (
            <div className="space-y-4">
              <div className="rounded-xl bg-indigo-50/70 border border-indigo-200 p-3.5 text-xs text-indigo-950 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <Users size={15} className="text-indigo-600" />
                  管理者用：テスト用仮想ユーザーの作成・ワンクリック切り替え
                </p>
                <p className="text-[11px] text-indigo-800">
                  あなたが1人で「本人プロフィールの編集」「メールアドレス宛てひも付け招待の承認」「編集者権限」「編集権限なし本人」「未ログイン閲覧」をすべてテストできるよう、複数のテストユーザーを作成して瞬時にログイン状態（UID・メールアドレス）を切り替えられます。
                </p>
              </div>

              {/* テストユーザー新規追加フォーム */}
              <form
                onSubmit={handleCreateTestUser}
                className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end bg-slate-50 p-3.5 rounded-xl border border-slate-200"
              >
                <div className="md:col-span-4">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    テストユーザー表示名
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="例: 田中 テスト（本人確認用）"
                    value={testUserName}
                    onChange={(e) => setTestUserName(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
                  />
                </div>
                <div className="md:col-span-4">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    テスト用Googleメールアドレス
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="例: tanaka.test@example.com"
                    value={testUserEmail}
                    onChange={(e) => setTestUserEmail(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    初期ロール種別
                  </label>
                  <select
                    value={testUserRole}
                    onChange={(e) =>
                      setTestUserRole(e.target.value as TestSandboxUser['roleHint'])
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
                  >
                    <option value="self_only">編集権限なし本人</option>
                    <option value="editor">プロジェクト編集者</option>
                    <option value="unauthorized">未許可アカウント</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <button
                    type="submit"
                    className="w-full rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
                    data-testid="create-test-user-btn"
                  >
                    ＋ ユーザー作成
                  </button>
                </div>
              </form>

              {/* テストユーザー一覧 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-700">
                    登録済みテストユーザー一覧（クリックで現在の操作アカウントを切り替え）
                  </h4>
                  <button
                    type="button"
                    onClick={() => switchTestUser(null)}
                    className={`rounded-lg px-3 py-1 text-xs font-bold border transition ${
                      activeTestUserUid === null
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    未ログイン（ゲスト閲覧者）に切替
                  </button>
                </div>

                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                  {testUsers.map((u) => {
                    const isCurrent = activeTestUserUid === u.uid;
                    return (
                      <div
                        key={u.uid}
                        className={`flex items-center justify-between px-4 py-3 text-xs ${
                          isCurrent ? 'bg-indigo-50/70' : ''
                        }`}
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">{u.displayName}</span>
                            <span className="font-mono text-[11px] text-slate-500">
                              &lt;{u.email}&gt;
                            </span>
                            {isCurrent && (
                              <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white">
                                操作中
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            UID: {u.uid}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {!isCurrent && (
                            <button
                              type="button"
                              onClick={() => switchTestUser(u.uid)}
                              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
                            >
                              このユーザーで操作
                            </button>
                          )}
                          {u.uid !== 'uid_admin_owner' && (
                            <button
                              type="button"
                              onClick={() => deleteTestUser(u.uid)}
                              className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                              title="テストユーザーを削除"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
