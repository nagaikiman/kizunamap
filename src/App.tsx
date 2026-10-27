import React, { useState } from 'react';
import { Lock, Network, PanelLeft, ShieldAlert } from 'lucide-react';
import { AppStateProvider, useAppState } from './context/AppStateContext';
import type { EntityKind } from './types/domain';
import { TopHeaderBar } from './components/layout/TopHeaderBar';
import { LeftManagementPanel, type LeftSidebarTab } from './components/sidebar/LeftManagementPanel';
import { CorrelationCanvas } from './components/canvas/CorrelationCanvas';
import { PersonProfileModal } from './components/modals/PersonProfileModal';
import { GroupDetailModal } from './components/modals/GroupDetailModal';
import {
  GroupEditorModal,
  PersonEditorModal,
  RelationshipEditorModal,
} from './components/modals/EntityEditorModals';
import { AdminSettingsModal } from './components/modals/AdminSettingsModal';
import { DEMO_ADMIN_UID, DEMO_PROJECT_ID } from './data/demoData';

const KizunaMapWorkspace: React.FC = () => {
  const { currentBundle, permissions, selectProject, switchTestUser } = useAppState();

  const [sidebarTab, setSidebarTab] = useState<LeftSidebarTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEntityKey, setSelectedEntityKey] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<'canvas' | 'sidebar'>('canvas');

  // モーダル制御
  const [profileModalPersonId, setProfileModalPersonId] = useState<string | null>(null);
  const [groupDetailModalId, setGroupDetailModalId] = useState<string | null>(null);
  const [personEditorTargetId, setPersonEditorTargetId] = useState<string | null | undefined>(
    undefined
  );
  const [groupEditorTarget, setGroupEditorTarget] = useState<{
    groupId: string | null;
    defaultParentId?: string | null;
  } | null>(null);
  const [relEditorTarget, setRelEditorTarget] = useState<{
    relId?: string | null;
    src?: { kind: EntityKind; id: string };
    tgt?: { kind: EntityKind; id: string };
  } | null>(null);
  const [adminModalTab, setAdminModalTab] = useState<
    'project' | 'members' | 'yaml' | 'testUsers' | null
  >(null);

  if (!currentBundle) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100 p-6">
        <div className="rounded-2xl bg-white p-6 shadow-lg border border-slate-200 text-center space-y-3">
          <p className="text-sm font-bold text-slate-800">プロジェクトが見つかりません。</p>
          <button
            type="button"
            onClick={() => selectProject(DEMO_PROJECT_ID)}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white"
          >
            デモプロジェクトを開く
          </button>
        </div>
      </div>
    );
  }

  // 非公開プロジェクトに未ログインまたは未許可アカウントでアクセスした場合は直接アクセスも拒否
  if (!permissions.canRead) {
    return (
      <div className="flex flex-col h-screen bg-slate-100">
        <TopHeaderBar
          onOpenAdminSettings={(t) => setAdminModalTab(t || 'project')}
          onOpenSelfProfileModal={(pid) => setProfileModalPersonId(pid)}
        />
        <div
          className="flex-1 flex items-center justify-center p-6"
          data-testid="private-project-denied"
        >
          <div className="max-w-md w-full rounded-2xl bg-white p-8 shadow-xl border border-slate-200 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
              <Lock size={28} />
            </div>
            <h2 className="text-lg font-extrabold text-slate-900">
              このプロジェクトは非公開に設定されています
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              非公開プロジェクトは、プロジェクト管理者（オーナー）および許可リスト（<code>editorEmails</code>）に登録された確認済みGoogleアカウントのみが閲覧できます。
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => selectProject(DEMO_PROJECT_ID)}
                className="w-full sm:w-auto rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                公開デモプロジェクトへ戻る
              </button>
              <button
                type="button"
                onClick={() => switchTestUser(DEMO_ADMIN_UID)}
                className="w-full sm:w-auto rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700"
              >
                管理者アカウントに切り替えて閲覧
              </button>
            </div>
          </div>
        </div>

        {adminModalTab && (
          <AdminSettingsModal
            initialTab={adminModalTab}
            onClose={() => setAdminModalTab(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-50">
      <TopHeaderBar
        onOpenAdminSettings={(t) => setAdminModalTab(t || 'project')}
        onOpenSelfProfileModal={(pid) => setProfileModalPersonId(pid)}
      />

      {/* スマートフォン向け表示切替バー */}
      <div className="flex md:hidden border-b border-slate-200 bg-white px-3 py-1.5 gap-2">
        <button
          type="button"
          onClick={() => setMobileView('canvas')}
          className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold ${
            mobileView === 'canvas'
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-100 text-slate-600'
          }`}
        >
          <Network size={14} /> 相関図キャンバス
        </button>
        <button
          type="button"
          onClick={() => setMobileView('sidebar')}
          className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold ${
            mobileView === 'sidebar'
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-100 text-slate-600'
          }`}
        >
          <PanelLeft size={14} /> 管理パネル・一覧
        </button>
      </div>

      {/* メイン2ペインレイアウト（左：管理パネル、右：相関図キャンバス） */}
      <main className="flex-1 flex overflow-hidden relative">
        <div
          className={`${
            mobileView === 'sidebar' ? 'flex w-full' : 'hidden'
          } md:flex md:w-auto h-full`}
        >
          <LeftManagementPanel
            activeTab={sidebarTab}
            onChangeTab={setSidebarTab}
            searchQuery={searchQuery}
            onChangeSearchQuery={setSearchQuery}
            selectedEntityKey={selectedEntityKey}
            onSelectEntityKey={setSelectedEntityKey}
            onOpenPersonProfile={(pid) => setProfileModalPersonId(pid)}
            onOpenPersonEditor={(pid) => setPersonEditorTargetId(pid ?? null)}
            onOpenGroupDetail={(gid) => setGroupDetailModalId(gid)}
            onOpenGroupEditor={(gid, defaultParent) =>
              setGroupEditorTarget({
                groupId: gid ?? null,
                defaultParentId: defaultParent ?? null,
              })
            }
            onOpenRelationshipEditor={(relId) => setRelEditorTarget({ relId: relId ?? null })}
            onOpenAdminSettings={(t) => setAdminModalTab(t || 'project')}
          />
        </div>

        <div
          className={`${
            mobileView === 'canvas' ? 'flex' : 'hidden'
          } md:flex flex-1 h-full overflow-hidden`}
        >
          <CorrelationCanvas
            selectedEntityKey={selectedEntityKey}
            onSelectEntityKey={setSelectedEntityKey}
            onOpenPersonProfile={(pid) => setProfileModalPersonId(pid)}
            onOpenGroupDetail={(gid) => setGroupDetailModalId(gid)}
            onOpenRelationshipEditor={(relId, src, tgt) =>
              setRelEditorTarget({ relId: relId ?? null, src, tgt })
            }
            searchQuery={searchQuery}
          />
        </div>
      </main>

      {/* 各種詳細・編集モーダル */}
      {profileModalPersonId && (
        <PersonProfileModal
          personId={profileModalPersonId}
          onClose={() => setProfileModalPersonId(null)}
          onEditPersonProjectFields={(pid) => setPersonEditorTargetId(pid)}
        />
      )}

      {groupDetailModalId && (
        <GroupDetailModal
          groupId={groupDetailModalId}
          onClose={() => setGroupDetailModalId(null)}
          onSelectPerson={(pid) => setProfileModalPersonId(pid)}
          onEditGroup={(gid) => setGroupEditorTarget({ groupId: gid })}
        />
      )}

      {personEditorTargetId !== undefined && (
        <PersonEditorModal
          personId={personEditorTargetId}
          onClose={() => setPersonEditorTargetId(undefined)}
        />
      )}

      {groupEditorTarget && (
        <GroupEditorModal
          groupId={groupEditorTarget.groupId}
          defaultParentId={groupEditorTarget.defaultParentId}
          onClose={() => setGroupEditorTarget(null)}
        />
      )}

      {relEditorTarget && (
        <RelationshipEditorModal
          relationshipId={relEditorTarget.relId}
          initialSource={relEditorTarget.src}
          initialTarget={relEditorTarget.tgt}
          onClose={() => setRelEditorTarget(null)}
        />
      )}

      {adminModalTab && (
        <AdminSettingsModal
          initialTab={adminModalTab}
          onClose={() => setAdminModalTab(null)}
        />
      )}
    </div>
  );
};

export default function App() {
  return (
    <AppStateProvider>
      <KizunaMapWorkspace />
    </AppStateProvider>
  );
}
