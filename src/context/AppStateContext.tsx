import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import type {
  AccountInvitation,
  Diagram,
  DiagramViewMode,
  EditorEmailRecord,
  Group,
  Membership,
  NodeDisplayStyle,
  NodePosition,
  Person,
  ProfileIconDoc,
  Project,
  ProjectBundle,
  ProjectIconDoc,
  Relationship,
  SaveStatus,
  TagItem,
  TestSandboxUser,
  UserProfile,
} from '../types/domain';
import {
  createInitialDemoProjects,
  DEMO_ADMIN_UID,
  DEMO_PROJECT_ID,
  INITIAL_INVITATIONS,
  INITIAL_PROFILE_ICONS,
  INITIAL_TEST_USERS,
  INITIAL_USER_PROFILES,
} from '../data/demoData';
import {
  assertCanApproveInvitation,
  assertCanUnlinkAccount,
  assertCanUpdateProfileIcon,
  assertCanUpdateUserProfile,
  canCreateSelfPerson,
  canDeletePersonCard,
  canEditPersonCard,
  canManageRelationship,
  canReadUserProfile,
  evaluateProjectAccess,
  getPersonPrivilegeRole,
  type AuthActor,
} from '../utils/securityGuards';
import { generateUnfathomableId } from '../utils/validation';
import { getFirebaseClients } from '../services/firebaseClient';
import { exportProjectBundleToYaml, parseAndValidateYamlBackup } from '../utils/yamlBackup';

const STORAGE_KEY = 'kizunamap_state_v2';
const SYNC_CHANNEL_NAME = 'kizunamap_multi_tab_sync_v2';

interface PersistedLocalStore {
  projects: Record<string, ProjectBundle>;
  userProfiles: Record<string, UserProfile>;
  profileIcons: Record<string, ProfileIconDoc>;
  invitations: AccountInvitation[];
  testUsers: TestSandboxUser[];
}

export interface UndoOperation {
  label: string;
  undo: () => Promise<void> | void;
  redo: () => Promise<void> | void;
}

export interface AppStateContextValue {
  // モード・認証状態
  isFirebaseConfigured: boolean;
  actor: AuthActor;
  currentUserLabel: string;
  testUsers: TestSandboxUser[];
  activeTestUserUid: string | null; // null の場合は未ログイン状態
  switchTestUser: (uid: string | null) => void;
  createTestUser: (input: {
    displayName: string;
    email: string;
    roleHint: TestSandboxUser['roleHint'];
  }) => Promise<TestSandboxUser>;
  deleteTestUser: (uid: string) => Promise<void>;

  // 保存状態・通信エラーシミュレーション
  saveStatus: SaveStatus;
  lastSavedAt: string | null;
  saveErrorMessage: string | null;
  simulateNetworkFailure: boolean;
  setSimulateNetworkFailure: (val: boolean) => void;
  manualRefreshProject: () => Promise<void>;

  // プロジェクト選択・権限
  projectsMap: Record<string, ProjectBundle>;
  currentProjectId: string;
  selectProject: (projectId: string) => void;
  currentBundle: ProjectBundle | null;
  activeDiagramId: string;
  setActiveDiagramId: (diagramId: string) => void;
  activeDiagram: Diagram | null;
  permissions: {
    isAdmin: boolean;
    isEditor: boolean;
    canRead: boolean;
  };

  // Undo / Redo（自分の操作履歴のみ対象・他人の変更は巻き戻さない）
  canUndo: boolean;
  canRedo: boolean;
  undoLastAction: () => Promise<void>;
  redoLastAction: () => Promise<void>;

  // プロジェクト管理操作
  createProject: (name: string, description: string, isPublic: boolean) => Promise<string>;
  updateProjectMeta: (patch: Partial<Pick<Project, 'name' | 'description' | 'isPublic'>>) => Promise<void>;
  deleteCurrentProject: () => Promise<void>;

  // 編集者許可リスト（管理者のみ）
  addEditorEmail: (email: string) => Promise<void>;
  revokeEditorEmail: (email: string) => Promise<void>;

  // タグ管理（ロール・スキル・関係・グループ）
  upsertTag: (
    category: 'roleTags' | 'skillTags' | 'relationTags' | 'groupTags',
    tag: TagItem
  ) => Promise<void>;
  deleteTag: (
    category: 'roleTags' | 'skillTags' | 'relationTags' | 'groupTags',
    tagId: string
  ) => Promise<void>;

  // 図（タブ）管理
  createDiagram: (name: string, description: string, viewMode: DiagramViewMode) => Promise<string>;
  duplicateDiagram: (diagramId: string) => Promise<string>;
  updateDiagram: (diagramId: string, patch: Partial<Diagram>) => Promise<void>;
  deleteDiagram: (diagramId: string) => Promise<void>;
  updateNodePosition: (diagramId: string, nodeKey: string, pos: NodePosition) => Promise<void>;
  updateMultipleNodePositions: (diagramId: string, positions: Record<string, NodePosition>) => Promise<void>;
  toggleGroupCollapse: (diagramId: string, largeGroupId: string) => Promise<void>;

  // グループ（大・小）管理
  upsertGroup: (group: Omit<Group, 'projectId' | 'updatedAt'>, iconData?: { dataUrl: string; byteSize: number } | null) => Promise<void>;
  deleteGroupWithCascade: (groupId: string) => Promise<void>;

  // 人物管理
  upsertPerson: (
    person: Omit<Person, 'projectId' | 'updatedAt' | 'linkedUid' | 'activeInvitationId'>,
    tempIconData?: { dataUrl: string; byteSize: number } | null
  ) => Promise<void>;
  deletePersonWithCascade: (personId: string) => Promise<void>;

  // 所属・グループ内ロール管理
  upsertMembership: (membership: Omit<Membership, 'projectId' | 'updatedAt'>) => Promise<void>;
  deleteMembership: (membershipId: string) => Promise<void>;
  moveOrCopyMembershipByDrag: (params: {
    personId: string;
    sourceMembershipId: string | null;
    targetGroupId: string;
    isCopy: boolean;
  }) => Promise<{ membershipId: string; action: 'moved' | 'copied' | 'noop' }>;

  // 関係線管理
  upsertRelationship: (relationship: Omit<Relationship, 'projectId' | 'updatedAt'>) => Promise<void>;
  deleteRelationship: (relationshipId: string) => Promise<void>;

  // 本人プロフィール・本人アイコン管理（所有者UID本人のみ）
  userProfiles: Record<string, UserProfile>;
  profileIcons: Record<string, ProfileIconDoc>;
  fetchUserProfileOnDemand: (uid: string) => Promise<UserProfile | null>;
  updateSelfProfile: (
    targetUid: string,
    profileInput: Pick<UserProfile, 'displayName' | 'bio' | 'links' | 'isPublic' | 'avatarPreset'>,
    newIconData?: { dataUrl: string; byteSize: number } | null,
    removeIcon?: boolean
  ) => Promise<void>;

  // 人物とGoogleアカウントの安全なひも付け招待・承認・解除
  invitations: AccountInvitation[];
  createAccountInvitation: (personId: string, targetEmail: string) => Promise<AccountInvitation>;
  approveAccountInvitation: (invitationId: string) => Promise<void>;
  declineOrCancelInvitation: (invitationId: string) => Promise<void>;
  unlinkPersonAccount: (personId: string) => Promise<void>;

  // YAML バックアップ退避・取込（管理者のみ）
  exportCurrentProjectYaml: () => string;
  importCurrentProjectYaml: (yamlContent: string) => Promise<{ warnings: string[] }>;

  // デモデータ初期化リセット
  resetDemoState: () => void;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

function loadInitialLocalStore(): PersistedLocalStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedLocalStore;
      if (parsed && parsed.projects && parsed.userProfiles && parsed.testUsers) {
        return parsed;
      }
    }
  } catch {
    // ignore storage parse error
  }
  return {
    projects: createInitialDemoProjects(),
    userProfiles: { ...INITIAL_USER_PROFILES },
    profileIcons: { ...INITIAL_PROFILE_ICONS },
    invitations: [...INITIAL_INVITATIONS],
    testUsers: [...INITIAL_TEST_USERS],
  };
}

export const AppStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const firebaseClients = useMemo(() => getFirebaseClients(), []);
  const isFirebaseConfigured = Boolean(firebaseClients);

  const [store, setStore] = useState<PersistedLocalStore>(() => loadInitialLocalStore());
  // Firebase本番接続時は初期状態を必ず「未ログイン（ゲスト閲覧者 = null）」にする（URLを開いた人が勝手に管理者にならないようにする）
  const [activeTestUserUid, setActiveTestUserUid] = useState<string | null>(() =>
    isFirebaseConfigured ? null : DEMO_ADMIN_UID
  );
  const [firebaseAuthUser, setFirebaseAuthUser] = useState<{
    uid: string;
    email: string | null;
    emailVerified: boolean;
    displayName: string | null;
  } | null>(null);
  const [isFirebaseOperator, setIsFirebaseOperator] = useState<boolean>(false);

  // URLクエリ ?project=xxx があれば初期プロジェクトにする
  const [currentProjectId, setCurrentProjectId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const pid = params.get('project');
      if (pid) return pid;
    }
    return DEMO_PROJECT_ID;
  });

  const [activeDiagramId, setActiveDiagramId] = useState<string>('diag_mixed_main');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(() => new Date().toISOString());
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [simulateNetworkFailure, setSimulateNetworkFailure] = useState<boolean>(false);

  // 自分の操作単位のUndo / Redoスタック（他人の変更を巻き戻さない）
  const [undoStack, setUndoStack] = useState<UndoOperation[]>([]);
  const [redoStack, setRedoStack] = useState<UndoOperation[]>([]);
  const isExecutingUndoRedo = useRef(false);

  // アイコン画像のインメモリキャッシュ（key: `${id}@${revision}`）
  const iconCacheRef = useRef<Map<string, string>>(new Map());

  // 現在の操作アクター解決（テスト用マルチユーザースイッチャー対応）
  const activeTestUser = useMemo(
    () => store.testUsers.find((u) => u.uid === activeTestUserUid) || null,
    [store.testUsers, activeTestUserUid]
  );

  const actor: AuthActor = useMemo(() => {
    if (firebaseAuthUser && !activeTestUserUid) {
      return {
        uid: firebaseAuthUser.uid,
        email: firebaseAuthUser.email,
        emailVerified: firebaseAuthUser.emailVerified,
        isOperator: isFirebaseOperator,
      };
    }
    if (!activeTestUser) {
      return {
        uid: null,
        email: null,
        emailVerified: false,
        isOperator: false,
      };
    }
    return {
      uid: activeTestUser.uid,
      email: activeTestUser.email,
      emailVerified: activeTestUser.emailVerified,
      isOperator: activeTestUser.roleHint === 'admin',
    };
  }, [firebaseAuthUser, activeTestUser, activeTestUserUid, isFirebaseOperator]);

  const currentUserLabel = useMemo(() => {
    if (firebaseAuthUser && !activeTestUserUid) {
      const b = store.projects[currentProjectId];
      const linkedPerson = b?.people.find((p) => p.linkedUid === firebaseAuthUser.uid);
      return (
        linkedPerson?.displayName ||
        store.userProfiles[firebaseAuthUser.uid]?.displayName ||
        firebaseAuthUser.displayName ||
        firebaseAuthUser.email ||
        'Googleログインユーザー'
      );
    }
    if (!activeTestUser) {
      return '一般人（ログイン無し・閲覧のみ）';
    }
    const b = store.projects[currentProjectId];
    const linkedPerson = b?.people.find((p) => p.linkedUid === activeTestUser.uid);
    if (linkedPerson) {
      return `${linkedPerson.displayName}${activeTestUser.roleHint === 'admin' ? '（管理者・オーナー）' : ''}`;
    }
    return activeTestUser.displayName;
  }, [firebaseAuthUser, activeTestUser, activeTestUserUid, store.projects, store.userProfiles, currentProjectId]);

  // Firebase Auth 監視 ＆ systemConfig/operators による管理者（オーナー）判定
  useEffect(() => {
    if (!firebaseClients) return;
    const unsub = onAuthStateChanged(firebaseClients.auth, async (user) => {
      if (user) {
        // 本番Googleログイン時はテストユーザー選択を解除して実アカウントで動作させる
        setActiveTestUserUid(null);
        setFirebaseAuthUser({
          uid: user.uid,
          email: user.email,
          emailVerified: user.emailVerified,
          displayName: user.displayName,
        });

        let isOp = false;
        try {
          const opSnap = await getDoc(doc(firebaseClients.db, 'systemConfig', 'operators'));
          if (opSnap.exists()) {
            const data = opSnap.data() as { allowedEmails?: string[]; allowedUids?: string[] };
            const emailLower = (user.email || '').trim().toLowerCase();
            const allowedEmails = (data.allowedEmails || []).map((e) => String(e).trim().toLowerCase());
            const allowedUids = (data.allowedUids || []).map((u) => String(u).trim());
            if ((emailLower && allowedEmails.includes(emailLower)) || allowedUids.includes(user.uid)) {
              isOp = true;
            }
          }
        } catch (err) {
          console.warn('Failed to check systemConfig/operators:', err);
        }
        setIsFirebaseOperator(isOp);

        // 管理者（operators登録メール本人）がログインした場合、初期プロジェクトの ownerUid と管理者カードを本人の実Google UIDに引き継ぐ
        if (isOp) {
          setStore((prev) => {
            let changed = false;
            const nextProjects = { ...prev.projects };
            for (const pid of Object.keys(nextProjects)) {
              const bundle = nextProjects[pid];
              if (bundle.project.ownerUid === DEMO_ADMIN_UID) {
                changed = true;
                nextProjects[pid] = {
                  ...bundle,
                  project: {
                    ...bundle.project,
                    ownerUid: user.uid,
                  },
                  people: bundle.people.map((p) =>
                    p.linkedUid === DEMO_ADMIN_UID ? { ...p, linkedUid: user.uid } : p
                  ),
                };
              }
            }
            const nextProfiles = { ...prev.userProfiles };
            if (nextProfiles[DEMO_ADMIN_UID] && !nextProfiles[user.uid]) {
              changed = true;
              const adminCard = nextProjects[currentProjectId]?.people.find(
                (p) => p.linkedUid === user.uid
              );
              nextProfiles[user.uid] = {
                ...nextProfiles[DEMO_ADMIN_UID],
                ownerUid: user.uid,
                displayName: adminCard?.displayName || user.displayName || nextProfiles[DEMO_ADMIN_UID].displayName,
              };
            }
            if (!changed) return prev;
            const nextState: PersistedLocalStore = {
              ...prev,
              projects: nextProjects,
              userProfiles: nextProfiles,
            };
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
              setDoc(doc(firebaseClients.db, 'appWorkspace', 'main_v2'), {
                payloadJson: JSON.stringify(nextState),
                updatedAt: new Date().toISOString(),
              }).catch(() => {});
            } catch {
              // ignore
            }
            return nextState;
          });
        }
      } else {
        setFirebaseAuthUser(null);
        setIsFirebaseOperator(false);
      }
    });
    return () => unsub();
  }, [firebaseClients, currentProjectId]);

  // Cloud Firestore からのリアルタイム同期（本番環境で全ユーザーが同じ最新データを共有できるようにする）
  useEffect(() => {
    if (!firebaseClients) return;
    const wsRef = doc(firebaseClients.db, 'appWorkspace', 'main_v2');
    const unsub = onSnapshot(
      wsRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as { payloadJson?: string };
          if (data?.payloadJson) {
            try {
              const parsed = JSON.parse(data.payloadJson) as PersistedLocalStore;
              if (parsed && parsed.projects && parsed.userProfiles) {
                setStore(parsed);
                localStorage.setItem(STORAGE_KEY, data.payloadJson);
              }
            } catch {
              // ignore parse error
            }
          }
        }
      },
      (err) => {
        console.warn('Firestore workspace listener warning:', err);
      }
    );
    return () => unsub();
  }, [firebaseClients]);

  // 複数ブラウザ・別タブ間のリアルタイム同期（BroadcastChannel & storage イベント）
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue) as PersistedLocalStore;
          setStore(parsed);
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('storage', handleStorage);

    let bc: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel(SYNC_CHANNEL_NAME);
      bc.onmessage = (event) => {
        if (event.data && event.data.type === 'SYNC_STORE') {
          setStore(event.data.payload);
        }
      };
    }

    return () => {
      window.removeEventListener('storage', handleStorage);
      if (bc) bc.close();
    };
  }, []);

  // 画面離脱時のクリーンアップとFirestoreリスナー管理（編集モード時のみリアルタイム監視、公開閲覧時は初期読込＋手動更新）
  const currentBundle = store.projects[currentProjectId] || null;
  const permissions = useMemo(() => {
    if (!currentBundle) {
      return { isAdmin: false, isEditor: false, canRead: false };
    }
    return evaluateProjectAccess(actor, currentBundle);
  }, [actor, currentBundle]);

  // activeDiagramId の補正
  useEffect(() => {
    if (!currentBundle) return;
    const exists = currentBundle.diagrams.some((d) => d.id === activeDiagramId);
    if (!exists && currentBundle.diagrams.length > 0) {
      setActiveDiagramId(currentBundle.diagrams[0].id);
    }
  }, [currentBundle, activeDiagramId]);

  const activeDiagram = useMemo(() => {
    if (!currentBundle) return null;
    return (
      currentBundle.diagrams.find((d) => d.id === activeDiagramId) ||
      currentBundle.diagrams[0] ||
      null
    );
  }, [currentBundle, activeDiagramId]);

  // 永続化・保存状態制御ラッパー（通信失敗時は絶対に「保存済み」と表示しない）
  const commitStoreUpdate = useCallback(
    async (
      updater: (prev: PersistedLocalStore) => PersistedLocalStore,
      undoOp?: UndoOperation
    ) => {
      setSaveStatus('saving');
      setSaveErrorMessage(null);

      // 通信失敗・無料枠到達シミュレーションがONの場合は保存を失敗させ、未保存エラーを表示する
      if (simulateNetworkFailure) {
        await new Promise((r) => setTimeout(r, 180));
        setSaveStatus('error');
        setSaveErrorMessage(
          '通信エラーまたはFirestore無料枠上限のため保存できませんでした（未保存の変更があります）。'
        );
        throw new Error(
          'NETWORK_OR_QUOTA_ERROR: 通信失敗のため保存されませんでした。ネットワークまたは無料枠の状態を確認してください。'
        );
      }

      setStore((prev) => {
        const next = updater(prev);
        try {
          const serialized = JSON.stringify(next);
          localStorage.setItem(STORAGE_KEY, serialized);
          if (typeof BroadcastChannel !== 'undefined') {
            const bc = new BroadcastChannel(SYNC_CHANNEL_NAME);
            bc.postMessage({ type: 'SYNC_STORE', payload: next });
            bc.close();
          }
          if (firebaseClients) {
            setDoc(doc(firebaseClients.db, 'appWorkspace', 'main_v2'), {
              payloadJson: serialized,
              updatedAt: new Date().toISOString(),
            }).catch((err) => {
              console.warn('Firestore save warning:', err);
            });
          }
        } catch (e) {
          console.error('Failed to persist store', e);
        }
        return next;
      });

      if (undoOp && !isExecutingUndoRedo.current) {
        setUndoStack((prev) => [...prev.slice(-29), undoOp]);
        setRedoStack([]);
      }

      setSaveStatus('saved');
      setLastSavedAt(new Date().toISOString());
    },
    [simulateNetworkFailure]
  );

  // 手動更新（公開閲覧モードの基本動作）
  const manualRefreshProject = useCallback(async () => {
    setSaveStatus('saving');
    setSaveErrorMessage(null);
    if (simulateNetworkFailure) {
      setSaveStatus('error');
      setSaveErrorMessage('最新データの取得に失敗しました。');
      return;
    }
    const latest = loadInitialLocalStore();
    setStore(latest);
    setSaveStatus('saved');
    setLastSavedAt(new Date().toISOString());
  }, [simulateNetworkFailure]);

  // プロジェクト選択・URLパラメータ反映
  const selectProject = useCallback((projectId: string) => {
    setCurrentProjectId(projectId);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('project', projectId);
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  // テスト用ユーザーの切り替え・追加・削除
  const switchTestUser = useCallback((uid: string | null) => {
    setActiveTestUserUid(uid);
  }, []);

  const createTestUser = useCallback(
    async (input: {
      displayName: string;
      email: string;
      roleHint: TestSandboxUser['roleHint'];
    }): Promise<TestSandboxUser> => {
      const cleanEmail = input.email.trim().toLowerCase();
      if (!cleanEmail || !cleanEmail.includes('@')) {
        throw new Error('有効なテスト用メールアドレスを入力してください。');
      }
      const newUser: TestSandboxUser = {
        uid: generateUnfathomableId('uid_test'),
        displayName: input.displayName.trim() || cleanEmail,
        email: cleanEmail,
        emailVerified: true,
        roleHint: input.roleHint,
        createdAt: new Date().toISOString(),
      };

      await commitStoreUpdate((prev) => {
        const nextProjects = { ...prev.projects };
        // roleHint が 'editor' の場合は現在のプロジェクトの editorEmails に自動登録してすぐテストできるようにする
        if (input.roleHint === 'editor' && nextProjects[currentProjectId]) {
          const b = nextProjects[currentProjectId];
          const filtered = b.editorEmails.filter((e) => e.email.toLowerCase() !== cleanEmail);
          nextProjects[currentProjectId] = {
            ...b,
            editorEmails: [
              ...filtered,
              {
                email: cleanEmail,
                uid: newUser.uid,
                active: true,
                addedByUid: actor.uid || DEMO_ADMIN_UID,
                updatedAt: new Date().toISOString(),
              },
            ],
          };
        }

        const nextProfiles = { ...prev.userProfiles };
        nextProfiles[newUser.uid] = {
          ownerUid: newUser.uid,
          displayName: newUser.displayName,
          bio: `${newUser.displayName} のテスト用本人プロフィールです。`,
          links: [],
          isPublic: true,
          iconRevision: 0,
          avatarPreset: 'user',
          updatedAt: new Date().toISOString(),
        };

        return {
          ...prev,
          projects: nextProjects,
          userProfiles: nextProfiles,
          testUsers: [...prev.testUsers, newUser],
        };
      });

      return newUser;
    },
    [actor.uid, commitStoreUpdate, currentProjectId]
  );

  const deleteTestUser = useCallback(
    async (uid: string) => {
      if (uid === DEMO_ADMIN_UID) {
        throw new Error('初期オーナー管理者アカウントは削除できません。');
      }
      await commitStoreUpdate((prev) => ({
        ...prev,
        testUsers: prev.testUsers.filter((u) => u.uid !== uid),
      }));
      if (activeTestUserUid === uid) {
        setActiveTestUserUid(DEMO_ADMIN_UID);
      }
    },
    [activeTestUserUid, commitStoreUpdate]
  );

  // Undo / Redo 実行
  const undoLastAction = useCallback(async () => {
    const op = undoStack[undoStack.length - 1];
    if (!op) return;
    isExecutingUndoRedo.current = true;
    try {
      await op.undo();
      setUndoStack((prev) => prev.slice(0, -1));
      setRedoStack((prev) => [...prev, op]);
    } finally {
      isExecutingUndoRedo.current = false;
    }
  }, [undoStack]);

  const redoLastAction = useCallback(async () => {
    const op = redoStack[redoStack.length - 1];
    if (!op) return;
    isExecutingUndoRedo.current = true;
    try {
      await op.redo();
      setRedoStack((prev) => prev.slice(0, -1));
      setUndoStack((prev) => [...prev, op]);
    } finally {
      isExecutingUndoRedo.current = false;
    }
  }, [redoStack]);

  // プロジェクト新規作成（運営アカウントのみ可能）
  const createProject = useCallback(
    async (name: string, description: string, isPublic: boolean): Promise<string> => {
      if (!actor.uid || !actor.isOperator) {
        throw new Error(
          'PERMISSION_DENIED: プロジェクトの新規作成は、Firebaseコンソールで事前登録された運営アカウントのみ可能です。'
        );
      }
      const newProjectId = generateUnfathomableId('p');
      const now = new Date().toISOString();
      const defaultDiagramId = generateUnfathomableId('diag');

      const newBundle: ProjectBundle = {
        project: {
          id: newProjectId,
          name: name.trim().slice(0, 100),
          description: description.trim().slice(0, 1000),
          ownerUid: actor.uid,
          isPublic,
          roleTags: [
            { id: 'role_mgr', name: '責任者', color: '#7c3aed' },
            { id: 'role_member', name: 'メンバー', color: '#2563eb' },
            { id: 'role_review', name: 'レビュー担当', color: '#0891b2' },
          ],
          skillTags: [{ id: 'skill_general', name: '企画・推進', color: '#059669' }],
          relationTags: [{ id: 'rel_collab', name: '連携', color: '#6366f1' }],
          groupTags: [{ id: 'gtag_dept', name: '部門', color: '#2563eb' }],
          createdAt: now,
          updatedAt: now,
        },
        groups: [],
        people: [],
        memberships: [],
        relationships: [],
        diagrams: [
          {
            id: defaultDiagramId,
            projectId: newProjectId,
            name: 'メイン相関図',
            description: '初期相関図',
            viewMode: 'mixed',
            nodeStyle: 'card',
            nodePositions: {},
            collapsedGroupIds: [],
            hiddenNodeIds: [],
            filterConfig: {
              focusedEntityId: null,
              focusedGroupId: null,
              selectedRoleIds: [],
              selectedSkillIds: [],
              showMemberships: true,
              showRelationships: true,
              showGroupHierarchy: true,
            },
            order: 0,
            updatedAt: now,
          },
        ],
        editorEmails: [],
        projectIcons: {},
      };

      await commitStoreUpdate((prev) => ({
        ...prev,
        projects: {
          ...prev.projects,
          [newProjectId]: newBundle,
        },
      }));

      selectProject(newProjectId);
      setActiveDiagramId(defaultDiagramId);
      return newProjectId;
    },
    [actor, commitStoreUpdate, selectProject]
  );

  const updateProjectMeta = useCallback(
    async (patch: Partial<Pick<Project, 'name' | 'description' | 'isPublic'>>) => {
      if (!currentBundle) return;
      if (!permissions.isEditor) {
        throw new Error('PERMISSION_DENIED: プロジェクト編集権限がありません。');
      }
      if (
        patch.isPublic !== undefined &&
        patch.isPublic !== currentBundle.project.isPublic &&
        !permissions.isAdmin
      ) {
        throw new Error('PERMISSION_DENIED: プロジェクトの公開・非公開設定は管理者のみ変更できます。');
      }

      await commitStoreUpdate((prev) => {
        const b = prev.projects[currentProjectId];
        if (!b) return prev;
        return {
          ...prev,
          projects: {
            ...prev.projects,
            [currentProjectId]: {
              ...b,
              project: {
                ...b.project,
                ...patch,
                updatedAt: new Date().toISOString(),
              },
            },
          },
        };
      });
    },
    [commitStoreUpdate, currentBundle, currentProjectId, permissions]
  );

  const deleteCurrentProject = useCallback(async () => {
    if (!currentBundle) return;
    if (!permissions.isAdmin) {
      throw new Error('PERMISSION_DENIED: プロジェクトの削除はオーナー管理者のみ可能です。');
    }
    const targetId = currentProjectId;
    await commitStoreUpdate((prev) => {
      const nextProjects = { ...prev.projects };
      delete nextProjects[targetId];
      return {
        ...prev,
        projects: nextProjects,
      };
    });
    const remainingIds = Object.keys(store.projects).filter((id) => id !== targetId);
    if (remainingIds.length > 0) {
      selectProject(remainingIds[0]);
    }
  }, [commitStoreUpdate, currentBundle, currentProjectId, permissions.isAdmin, selectProject, store.projects]);

  // 編集者許可リスト（管理者のみ）
  const addEditorEmail = useCallback(
    async (email: string) => {
      if (!permissions.isAdmin || !actor.uid) {
        throw new Error('PERMISSION_DENIED: 編集者の許可リスト変更は管理者のみ可能です。');
      }
      const cleanEmail = email.trim().toLowerCase();
      if (!cleanEmail || !cleanEmail.includes('@')) {
        throw new Error('VALIDATION_ERROR: 正しいメールアドレスを入力してください。');
      }
      await commitStoreUpdate((prev) => {
        const b = prev.projects[currentProjectId];
        if (!b) return prev;
        const matchedTestUser = prev.testUsers.find(
          (u) => u.email.toLowerCase() === cleanEmail
        );
        const others = b.editorEmails.filter((e) => e.email.toLowerCase() !== cleanEmail);
        return {
          ...prev,
          projects: {
            ...prev.projects,
            [currentProjectId]: {
              ...b,
              editorEmails: [
                ...others,
                {
                  email: cleanEmail,
                  uid: matchedTestUser?.uid ?? null,
                  active: true,
                  addedByUid: actor.uid!,
                  updatedAt: new Date().toISOString(),
                },
              ],
            },
          },
        };
      });
    },
    [actor.uid, commitStoreUpdate, currentProjectId, permissions.isAdmin]
  );

  const revokeEditorEmail = useCallback(
    async (email: string) => {
      if (!permissions.isAdmin) {
        throw new Error('PERMISSION_DENIED: 編集者の許可取り消しは管理者のみ可能です。');
      }
      const cleanEmail = email.trim().toLowerCase();
      await commitStoreUpdate((prev) => {
        const b = prev.projects[currentProjectId];
        if (!b) return prev;
        return {
          ...prev,
          projects: {
            ...prev.projects,
            [currentProjectId]: {
              ...b,
              editorEmails: b.editorEmails.map((e) =>
                e.email.toLowerCase() === cleanEmail
                  ? { ...e, active: false, updatedAt: new Date().toISOString() }
                  : e
              ),
            },
          },
        };
      });
    },
    [commitStoreUpdate, currentProjectId, permissions.isAdmin]
  );

  // タグ管理
  const upsertTag = useCallback(
    async (
      category: 'roleTags' | 'skillTags' | 'relationTags' | 'groupTags',
      tag: TagItem
    ) => {
      if (!permissions.isEditor) {
        throw new Error('PERMISSION_DENIED: タグの編集にはプロジェクト編集権限が必要です。');
      }
      await commitStoreUpdate((prev) => {
        const b = prev.projects[currentProjectId];
        if (!b) return prev;
        const list = b.project[category];
        const exists = list.some((t) => t.id === tag.id);
        const nextList = exists
          ? list.map((t) => (t.id === tag.id ? tag : t))
          : [...list, tag];
        return {
          ...prev,
          projects: {
            ...prev.projects,
            [currentProjectId]: {
              ...b,
              project: {
                ...b.project,
                [category]: nextList,
                updatedAt: new Date().toISOString(),
              },
            },
          },
        };
      });
    },
    [commitStoreUpdate, currentProjectId, permissions.isEditor]
  );

  const deleteTag = useCallback(
    async (
      category: 'roleTags' | 'skillTags' | 'relationTags' | 'groupTags',
      tagId: string
    ) => {
      if (!permissions.isEditor) {
        throw new Error('PERMISSION_DENIED: タグの削除にはプロジェクト編集権限が必要です。');
      }
      await commitStoreUpdate((prev) => {
        const b = prev.projects[currentProjectId];
        if (!b) return prev;
        const nextList = b.project[category].filter((t) => t.id !== tagId);
        // 参照している人物・所属・関係・グループからも安全に除去
        const nextPeople =
          category === 'roleTags' || category === 'skillTags'
            ? b.people.map((p) => ({
                ...p,
                globalRoleIds: p.globalRoleIds.filter((id) => id !== tagId),
                skillIds: p.skillIds.filter((id) => id !== tagId),
              }))
            : b.people;
        const nextMemberships =
          category === 'roleTags'
            ? b.memberships.map((m) => ({
                ...m,
                roleIds: m.roleIds.filter((id) => id !== tagId),
              }))
            : b.memberships;
        const nextRelationships =
          category === 'relationTags'
            ? b.relationships.map((r) => ({
                ...r,
                tagIds: r.tagIds.filter((id) => id !== tagId),
              }))
            : b.relationships;
        const nextGroups =
          category === 'groupTags'
            ? b.groups.map((g) => ({
                ...g,
                tags: g.tags.filter((id) => id !== tagId),
              }))
            : b.groups;

        return {
          ...prev,
          projects: {
            ...prev.projects,
            [currentProjectId]: {
              ...b,
              project: {
                ...b.project,
                [category]: nextList,
                updatedAt: new Date().toISOString(),
              },
              people: nextPeople,
              memberships: nextMemberships,
              relationships: nextRelationships,
              groups: nextGroups,
            },
          },
        };
      });
    },
    [commitStoreUpdate, currentProjectId, permissions.isEditor]
  );

  // 図（タブ）管理
  const createDiagram = useCallback(
    async (name: string, description: string, viewMode: DiagramViewMode): Promise<string> => {
      if (!permissions.isEditor) {
        throw new Error('PERMISSION_DENIED: 図の作成にはプロジェクト編集権限が必要です。');
      }
      const newId = generateUnfathomableId('diag');
      const now = new Date().toISOString();
      await commitStoreUpdate((prev) => {
        const b = prev.projects[currentProjectId];
        if (!b) return prev;
        const basePositions = b.diagrams[0]?.nodePositions
          ? { ...b.diagrams[0].nodePositions }
          : {};
        const newDiag: Diagram = {
          id: newId,
          projectId: currentProjectId,
          name: name.trim().slice(0, 80) || '新規相関図',
          description: description.trim().slice(0, 500),
          viewMode,
          nodeStyle: 'card',
          nodePositions: basePositions,
          collapsedGroupIds: [],
          hiddenNodeIds: [],
          filterConfig: {
            focusedEntityId: null,
            focusedGroupId: null,
            selectedRoleIds: [],
            selectedSkillIds: [],
            showMemberships: true,
            showRelationships: true,
            showGroupHierarchy: true,
          },
          order: b.diagrams.length,
          updatedAt: now,
        };
        return {
          ...prev,
          projects: {
            ...prev.projects,
            [currentProjectId]: {
              ...b,
              diagrams: [...b.diagrams, newDiag],
            },
          },
        };
      });
      setActiveDiagramId(newId);
      return newId;
    },
    [commitStoreUpdate, currentProjectId, permissions.isEditor]
  );

  const duplicateDiagram = useCallback(
    async (diagramId: string): Promise<string> => {
      if (!permissions.isEditor) {
        throw new Error('PERMISSION_DENIED: 図の複製にはプロジェクト編集権限が必要です。');
      }
      const newId = generateUnfathomableId('diag');
      const now = new Date().toISOString();
      await commitStoreUpdate((prev) => {
        const b = prev.projects[currentProjectId];
        if (!b) return prev;
        const source = b.diagrams.find((d) => d.id === diagramId);
        if (!source) return prev;
        const copy: Diagram = {
          ...source,
          id: newId,
          name: `${source.name} (コピー)`.slice(0, 80),
          nodePositions: { ...source.nodePositions },
          collapsedGroupIds: [...source.collapsedGroupIds],
          hiddenNodeIds: [...source.hiddenNodeIds],
          filterConfig: { ...source.filterConfig },
          order: b.diagrams.length,
          updatedAt: now,
        };
        return {
          ...prev,
          projects: {
            ...prev.projects,
            [currentProjectId]: {
              ...b,
              diagrams: [...b.diagrams, copy],
            },
          },
        };
      });
      setActiveDiagramId(newId);
      return newId;
    },
    [commitStoreUpdate, currentProjectId, permissions.isEditor]
  );

  const updateDiagram = useCallback(
    async (diagramId: string, patch: Partial<Diagram>) => {
      const isMetadataEdit =
        patch.name !== undefined || patch.description !== undefined;
      if (isMetadataEdit && !permissions.isEditor) {
        throw new Error('PERMISSION_DENIED: 図のタイトル変更にはプロジェクト編集権限が必要です。');
      }

      const applyPatch = (prev: PersistedLocalStore): PersistedLocalStore => {
        const b = prev.projects[currentProjectId];
        if (!b) return prev;
        return {
          ...prev,
          projects: {
            ...prev.projects,
            [currentProjectId]: {
              ...b,
              diagrams: b.diagrams.map((d) =>
                d.id === diagramId
                  ? { ...d, ...patch, updatedAt: new Date().toISOString() }
                  : d
              ),
            },
          },
        };
      };

      // 未ログイン・閲覧のみのユーザーは手元の画面表示のみ切り替え（サーバーへは保存しない）
      if (!permissions.isEditor) {
        setStore(applyPatch);
        return;
      }

      await commitStoreUpdate(applyPatch);
    },
    [commitStoreUpdate, currentProjectId, permissions.isEditor]
  );

  const deleteDiagram = useCallback(
    async (diagramId: string) => {
      if (!permissions.isEditor || !currentBundle) {
        throw new Error('PERMISSION_DENIED: 図の削除にはプロジェクト編集権限が必要です。');
      }
      if (currentBundle.diagrams.length <= 1) {
        throw new Error('VALIDATION_ERROR: 最後の1つの図は削除できません。');
      }
      await commitStoreUpdate((prev) => {
        const b = prev.projects[currentProjectId];
        if (!b) return prev;
        return {
          ...prev,
          projects: {
            ...prev.projects,
            [currentProjectId]: {
              ...b,
              diagrams: b.diagrams.filter((d) => d.id !== diagramId),
            },
          },
        };
      });
    },
    [commitStoreUpdate, currentBundle, currentProjectId, permissions.isEditor]
  );

  // ノード座標保存（ドラッグ終了時に該当ノードのみ更新、Undo対応）
  const updateNodePosition = useCallback(
    async (diagramId: string, nodeKey: string, pos: NodePosition) => {
      if (!currentBundle) return;
      const myLinkedPerson = actor.uid
        ? currentBundle.people.find((p) => p.linkedUid === actor.uid)
        : null;
      const isMyPersonNode =
        Boolean(myLinkedPerson) &&
        (nodeKey === `person:${myLinkedPerson!.id}` ||
          nodeKey === `unaffiliated:${myLinkedPerson!.id}` ||
          (nodeKey.startsWith('mem:') &&
            currentBundle.memberships.some(
              (m) => `mem:${m.id}` === nodeKey && m.personId === myLinkedPerson!.id
            )));

      if (!permissions.isEditor && !isMyPersonNode) return;
      const diag = currentBundle.diagrams.find((d) => d.id === diagramId);
      const oldPos = diag?.nodePositions[nodeKey];

      const applyPos = async (targetPos: NodePosition | undefined) => {
        await commitStoreUpdate((prev) => {
          const b = prev.projects[currentProjectId];
          if (!b) return prev;
          return {
            ...prev,
            projects: {
              ...prev.projects,
              [currentProjectId]: {
                ...b,
                diagrams: b.diagrams.map((d) => {
                  if (d.id !== diagramId) return d;
                  const nextMap = { ...d.nodePositions };
                  if (targetPos) {
                    nextMap[nodeKey] = targetPos;
                  } else {
                    delete nextMap[nodeKey];
                  }
                  return {
                    ...d,
                    nodePositions: nextMap,
                    updatedAt: new Date().toISOString(),
                  };
                }),
              },
            },
          };
        });
      };

      await commitStoreUpdate(
        (prev) => {
          const b = prev.projects[currentProjectId];
          if (!b) return prev;
          return {
            ...prev,
            projects: {
              ...prev.projects,
              [currentProjectId]: {
                ...b,
                diagrams: b.diagrams.map((d) =>
                  d.id === diagramId
                    ? {
                        ...d,
                        nodePositions: {
                          ...d.nodePositions,
                          [nodeKey]: pos,
                        },
                        updatedAt: new Date().toISOString(),
                      }
                    : d
                ),
              },
            },
          };
        },
        {
          label: `ノード座標移動 (${nodeKey})`,
          undo: () => applyPos(oldPos),
          redo: () => applyPos(pos),
        }
      );
    },
    [actor.uid, commitStoreUpdate, currentBundle, currentProjectId, permissions.isEditor]
  );

  const updateMultipleNodePositions = useCallback(
    async (diagramId: string, positions: Record<string, NodePosition>) => {
      if (!permissions.isEditor || !currentBundle) return;
      const diag = currentBundle.diagrams.find((d) => d.id === diagramId);
      const oldPositions = diag ? { ...diag.nodePositions } : {};

      const applyMap = async (map: Record<string, NodePosition>) => {
        await commitStoreUpdate((prev) => {
          const b = prev.projects[currentProjectId];
          if (!b) return prev;
          return {
            ...prev,
            projects: {
              ...prev.projects,
              [currentProjectId]: {
                ...b,
                diagrams: b.diagrams.map((d) =>
                  d.id === diagramId
                    ? {
                        ...d,
                        nodePositions: { ...d.nodePositions, ...map },
                        updatedAt: new Date().toISOString(),
                      }
                    : d
                ),
              },
            },
          };
        });
      };

      await commitStoreUpdate(
        (prev) => {
          const b = prev.projects[currentProjectId];
          if (!b) return prev;
          return {
            ...prev,
            projects: {
              ...prev.projects,
              [currentProjectId]: {
                ...b,
                diagrams: b.diagrams.map((d) =>
                  d.id === diagramId
                    ? {
                        ...d,
                        nodePositions: { ...d.nodePositions, ...positions },
                        updatedAt: new Date().toISOString(),
                      }
                    : d
                ),
              },
            },
          };
        },
        {
          label: '自動整列',
          undo: () => applyMap(oldPositions),
          redo: () => applyMap(positions),
        }
      );
    },
    [commitStoreUpdate, currentBundle, currentProjectId, permissions.isEditor]
  );

  const toggleGroupCollapse = useCallback(
    async (diagramId: string, largeGroupId: string) => {
      const applyToggle = (prev: PersistedLocalStore): PersistedLocalStore => {
        const b = prev.projects[currentProjectId];
        if (!b) return prev;
        return {
          ...prev,
          projects: {
            ...prev.projects,
            [currentProjectId]: {
              ...b,
              diagrams: b.diagrams.map((d) => {
                if (d.id !== diagramId) return d;
                const exists = d.collapsedGroupIds.includes(largeGroupId);
                return {
                  ...d,
                  collapsedGroupIds: exists
                    ? d.collapsedGroupIds.filter((id) => id !== largeGroupId)
                    : [...d.collapsedGroupIds, largeGroupId],
                  updatedAt: new Date().toISOString(),
                };
              }),
            },
          },
        };
      };

      if (!permissions.isEditor) {
        setStore(applyToggle);
        return;
      }

      await commitStoreUpdate(applyToggle);
    },
    [commitStoreUpdate, currentProjectId, permissions.isEditor]
  );

  // グループ追加・更新（二階層整合性＆グループアイコン保存対応）
  const upsertGroup = useCallback(
    async (
      groupInput: Omit<Group, 'projectId' | 'updatedAt'>,
      iconData?: { dataUrl: string; byteSize: number } | null
    ) => {
      if (!permissions.isEditor) {
        throw new Error('PERMISSION_DENIED: グループの編集にはプロジェクト編集権限が必要です。');
      }
      const now = new Date().toISOString();
      await commitStoreUpdate((prev) => {
        const b = prev.projects[currentProjectId];
        if (!b) return prev;

        if (groupInput.kind === 'small') {
          if (!groupInput.parentGroupId) {
            throw new Error('VALIDATION_ERROR: 小グループには親の大グループが必要です。');
          }
          const parent = b.groups.find((g) => g.id === groupInput.parentGroupId);
          if (!parent || parent.kind !== 'large') {
            throw new Error('VALIDATION_ERROR: 小グループの親には有効な大グループを指定してください。');
          }
        }

        const nextIcons = { ...b.projectIcons };
        let nextIconId = groupInput.iconId;
        let nextIconRev = groupInput.iconRevision;

        if (iconData) {
          nextIconId = `icon_grp_${groupInput.id}`;
          nextIconRev = (groupInput.iconRevision || 0) + 1;
          nextIcons[nextIconId] = {
            id: nextIconId,
            projectId: currentProjectId,
            targetKind: 'group',
            targetId: groupInput.id,
            revision: nextIconRev,
            mimeType: 'image/webp',
            width: 128,
            height: 128,
            byteSize: iconData.byteSize,
            dataUrl: iconData.dataUrl,
            updatedAt: now,
          };
        } else if (iconData === null && nextIconId) {
          delete nextIcons[nextIconId];
          nextIconId = null;
          nextIconRev = 0;
        }

        const newGroup: Group = {
          ...groupInput,
          projectId: currentProjectId,
          parentGroupId: groupInput.kind === 'large' ? null : groupInput.parentGroupId,
          iconId: nextIconId,
          iconRevision: nextIconRev,
          updatedAt: now,
        };

        const exists = b.groups.some((g) => g.id === newGroup.id);
        const nextGroups = exists
          ? b.groups.map((g) => (g.id === newGroup.id ? newGroup : g))
          : [...b.groups, newGroup];

        return {
          ...prev,
          projects: {
            ...prev.projects,
            [currentProjectId]: {
              ...b,
              groups: nextGroups,
              projectIcons: nextIcons,
            },
          },
        };
      });
    },
    [commitStoreUpdate, currentProjectId, permissions.isEditor]
  );

  // グループ削除（配下小グループ・所属・関係線・不要な画像文書も一括クリーンアップ）
  const deleteGroupWithCascade = useCallback(
    async (groupId: string) => {
      if (!permissions.isEditor) {
        throw new Error('PERMISSION_DENIED: グループの削除にはプロジェクト編集権限が必要です。');
      }
      await commitStoreUpdate((prev) => {
        const b = prev.projects[currentProjectId];
        if (!b) return prev;
        const childIds = b.groups
          .filter((g) => g.kind === 'small' && g.parentGroupId === groupId)
          .map((g) => g.id);
        const removeIds = new Set<string>([groupId, ...childIds]);

        const nextIcons = { ...b.projectIcons };
        for (const g of b.groups) {
          if (removeIds.has(g.id) && g.iconId) {
            delete nextIcons[g.iconId];
          }
        }

        return {
          ...prev,
          projects: {
            ...prev.projects,
            [currentProjectId]: {
              ...b,
              groups: b.groups.filter((g) => !removeIds.has(g.id)),
              memberships: b.memberships.filter((m) => !removeIds.has(m.groupId)),
              relationships: b.relationships.filter(
                (r) =>
                  !(
                    (r.sourceKind === 'group' && removeIds.has(r.sourceId)) ||
                    (r.targetKind === 'group' && removeIds.has(r.targetId))
                  )
              ),
              projectIcons: nextIcons,
            },
          },
        };
      });
    },
    [commitStoreUpdate, currentProjectId, permissions.isEditor]
  );

  // 人物追加・更新
  // - 管理者・編集者：任意の人物を追加・編集可能（未連携人物も登録可）
  // - 一般人（ログインあり）：自分自身の人物カードを1枚だけ追加可能（自動的に actor.uid とひも付け）、および自分の人物カードのみ編集可能
  const upsertPerson = useCallback(
    async (
      personInput: Omit<Person, 'projectId' | 'updatedAt' | 'linkedUid' | 'activeInvitationId'>,
      tempIconData?: { dataUrl: string; byteSize: number } | null
    ) => {
      if (!currentBundle) return;
      const existingInCurrent = currentBundle.people.find((p) => p.id === personInput.id);

      if (existingInCurrent) {
        if (!canEditPersonCard(actor, existingInCurrent, currentBundle)) {
          throw new Error(
            'PERMISSION_DENIED: 他のユーザーの人物カードを編集する権限がありません。'
          );
        }
      } else {
        if (!permissions.isEditor) {
          if (!actor.uid) {
            throw new Error('PERMISSION_DENIED: 人物の追加にはGoogleログインが必要です。');
          }
          if (!canCreateSelfPerson(actor, currentBundle)) {
            throw new Error(
              'PERMISSION_DENIED: 一般ログインユーザーが追加できるのは自分自身の人物カード（1アカウントにつき1名）のみです。'
            );
          }
        }
      }

      const now = new Date().toISOString();
      await commitStoreUpdate((prev) => {
        const b = prev.projects[currentProjectId];
        if (!b) return prev;
        const existing = b.people.find((p) => p.id === personInput.id);

        // 一般人（ログインあり・非編集者）による新規追加時は、自動的に本人UID（actor.uid）と紐づける
        const isSelfRegistration = !existing && !permissions.isEditor && Boolean(actor.uid);
        const resolvedLinkedUid = existing
          ? existing.linkedUid
          : isSelfRegistration
          ? actor.uid
          : null;

        const nextIcons = { ...b.projectIcons };
        let nextTempIconId = existing ? existing.tempIconId : personInput.tempIconId;
        let nextTempIconRev = existing ? existing.tempIconRevision : personInput.tempIconRevision;

        // 既に本人アカウント連携済みの場合は、編集者が本人アイコンを上書きすることはできない
        if (!resolvedLinkedUid) {
          if (tempIconData) {
            nextTempIconId = `icon_person_${personInput.id}`;
            nextTempIconRev = (nextTempIconRev || 0) + 1;
            nextIcons[nextTempIconId] = {
              id: nextTempIconId,
              projectId: currentProjectId,
              targetKind: 'unlinkedPerson',
              targetId: personInput.id,
              revision: nextTempIconRev,
              mimeType: 'image/webp',
              width: 128,
              height: 128,
              byteSize: tempIconData.byteSize,
              dataUrl: tempIconData.dataUrl,
              updatedAt: now,
            };
          } else if (tempIconData === null && nextTempIconId) {
            delete nextIcons[nextTempIconId];
            nextTempIconId = null;
            nextTempIconRev = 0;
          }
        }

        const nextPerson: Person = {
          ...personInput,
          projectId: currentProjectId,
          linkedUid: resolvedLinkedUid,
          activeInvitationId: existing ? existing.activeInvitationId : null,
          tempIconId: nextTempIconId,
          tempIconRevision: nextTempIconRev,
          updatedAt: now,
        };

        const nextPeople = existing
          ? b.people.map((p) => (p.id === nextPerson.id ? nextPerson : p))
          : [...b.people, nextPerson];

        // 一般ログインユーザーが自分の人物カードを新規作成した際、本人プロフィールが未作成なら初期プロフィールを用意
        // また既にアカウント連携済みの人物カードの名前を変更した場合、本人プロフィールとテストユーザーの表示名も同期する
        const nextProfiles = { ...prev.userProfiles };
        if (isSelfRegistration && actor.uid && !nextProfiles[actor.uid]) {
          nextProfiles[actor.uid] = {
            ownerUid: actor.uid,
            displayName: personInput.displayName,
            bio: '',
            links: [],
            isPublic: true,
            iconRevision: 0,
            avatarPreset: personInput.avatarPreset || 'user',
            updatedAt: now,
          };
        } else if (resolvedLinkedUid && nextProfiles[resolvedLinkedUid]) {
          nextProfiles[resolvedLinkedUid] = {
            ...nextProfiles[resolvedLinkedUid],
            displayName: personInput.displayName,
            updatedAt: now,
          };
        }

        const nextTestUsers = resolvedLinkedUid
          ? prev.testUsers.map((u) =>
              u.uid === resolvedLinkedUid
                ? {
                    ...u,
                    displayName:
                      u.roleHint === 'admin'
                        ? `${personInput.displayName}（管理者・オーナー）`
                        : personInput.displayName,
                  }
                : u
            )
          : prev.testUsers;

        return {
          ...prev,
          userProfiles: nextProfiles,
          testUsers: nextTestUsers,
          projects: {
            ...prev.projects,
            [currentProjectId]: {
              ...b,
              people: nextPeople,
              projectIcons: nextIcons,
            },
          },
        };
      });
    },
    [actor, commitStoreUpdate, currentBundle, currentProjectId, permissions.isEditor]
  );

  // 人物削除（4階層権限ルール：管理者は全削除可、編集者は一般人のみ削除可［管理者・他編集者は削除不可］、一般ログイン本人は自分のカードのみ削除［退会］可）
  const deletePersonWithCascade = useCallback(
    async (personId: string) => {
      if (!currentBundle) return;
      const targetPerson = currentBundle.people.find((p) => p.id === personId);
      if (!targetPerson) return;

      if (!canDeletePersonCard(actor, targetPerson, currentBundle, store.testUsers)) {
        const targetRole = getPersonPrivilegeRole(targetPerson, currentBundle, store.testUsers);
        if (permissions.isEditor && (targetRole === 'admin' || targetRole === 'editor')) {
          throw new Error(
            'PERMISSION_DENIED: 編集者は「管理者」や「他の編集者」の人物カードを削除できません。'
          );
        }
        throw new Error('PERMISSION_DENIED: この人物カードを削除する権限がありません。');
      }

      await commitStoreUpdate((prev) => {
        const b = prev.projects[currentProjectId];
        if (!b) return prev;
        const target = b.people.find((p) => p.id === personId);
        const nextIcons = { ...b.projectIcons };
        if (target?.tempIconId) {
          delete nextIcons[target.tempIconId];
        }

        return {
          ...prev,
          projects: {
            ...prev.projects,
            [currentProjectId]: {
              ...b,
              people: b.people.filter((p) => p.id !== personId),
              memberships: b.memberships.filter((m) => m.personId !== personId),
              relationships: b.relationships.filter(
                (r) =>
                  !(
                    (r.sourceKind === 'person' && r.sourceId === personId) ||
                    (r.targetKind === 'person' && r.targetId === personId)
                  )
              ),
              projectIcons: nextIcons,
            },
          },
        };
      });
    },
    [actor, commitStoreUpdate, currentBundle, currentProjectId, permissions.isEditor, store.testUsers]
  );

  // 所属・グループ内ロールの追加・更新（編集者、または一般ログイン本人が自分自身の所属を変更する場合に許可）
  const upsertMembership = useCallback(
    async (membershipInput: Omit<Membership, 'projectId' | 'updatedAt'>) => {
      if (!currentBundle) return;
      const targetPerson = currentBundle.people.find((p) => p.id === membershipInput.personId);
      if (!targetPerson || !canEditPersonCard(actor, targetPerson, currentBundle)) {
        throw new Error('PERMISSION_DENIED: 所属・役割を編集する権限がありません。');
      }
      const now = new Date().toISOString();
      await commitStoreUpdate((prev) => {
        const b = prev.projects[currentProjectId];
        if (!b) return prev;

        const personExists = b.people.some((p) => p.id === membershipInput.personId);
        const groupExists = b.groups.some((g) => g.id === membershipInput.groupId);
        if (!personExists || !groupExists) {
          throw new Error('VALIDATION_ERROR: 同一プロジェクト内の有効な人物とグループを指定してください。');
        }

        // 同一人物×同一グループの所属が既にあれば更新、なければ作成
        const existing = b.memberships.find(
          (m) =>
            m.id === membershipInput.id ||
            (m.personId === membershipInput.personId && m.groupId === membershipInput.groupId)
        );

        const nextMem: Membership = {
          ...membershipInput,
          id: existing ? existing.id : membershipInput.id,
          projectId: currentProjectId,
          updatedAt: now,
        };

        const nextMemberships = existing
          ? b.memberships.map((m) => (m.id === existing.id ? nextMem : m))
          : [...b.memberships, nextMem];

        return {
          ...prev,
          projects: {
            ...prev.projects,
            [currentProjectId]: {
              ...b,
              memberships: nextMemberships,
            },
          },
        };
      });
    },
    [actor, commitStoreUpdate, currentBundle, currentProjectId]
  );

  const deleteMembership = useCallback(
    async (membershipId: string) => {
      if (!currentBundle) return;
      const targetMem = currentBundle.memberships.find((m) => m.id === membershipId);
      if (!targetMem) return;
      const targetPerson = currentBundle.people.find((p) => p.id === targetMem.personId);
      if (!targetPerson || !canEditPersonCard(actor, targetPerson, currentBundle)) {
        throw new Error('PERMISSION_DENIED: 所属を解除する権限がありません。');
      }
      await commitStoreUpdate((prev) => {
        const b = prev.projects[currentProjectId];
        if (!b) return prev;
        return {
          ...prev,
          projects: {
            ...prev.projects,
            [currentProjectId]: {
              ...b,
              memberships: b.memberships.filter((m) => m.id !== membershipId),
            },
          },
        };
      });
    },
    [actor, commitStoreUpdate, currentBundle, currentProjectId]
  );

  // キャンバス上のドラッグによる所属の「移動（通常ドラッグ）」および「コピー（Ctrl+ドラッグ / 右ドラッグ）」
  const moveOrCopyMembershipByDrag = useCallback(
    async (params: {
      personId: string;
      sourceMembershipId: string | null;
      targetGroupId: string;
      isCopy: boolean;
    }): Promise<{ membershipId: string; action: 'moved' | 'copied' | 'noop' }> => {
      if (!currentBundle) {
        throw new Error('PERMISSION_DENIED: プロジェクトが読み込まれていません。');
      }
      const { personId, sourceMembershipId, targetGroupId, isCopy } = params;
      const targetPerson = currentBundle.people.find((p) => p.id === personId);
      if (!targetPerson || !canEditPersonCard(actor, targetPerson, currentBundle)) {
        throw new Error('PERMISSION_DENIED: 他のユーザーの所属を変更する権限がありません。');
      }
      const sourceMem = sourceMembershipId
        ? currentBundle.memberships.find((m) => m.id === sourceMembershipId) || null
        : null;

      if (sourceMem && sourceMem.groupId === targetGroupId) {
        return { membershipId: sourceMem.id, action: 'noop' };
      }

      const existingInTarget = currentBundle.memberships.find(
        (m) => m.personId === personId && m.groupId === targetGroupId
      );

      const now = new Date().toISOString();
      const newMemId = existingInTarget ? existingInTarget.id : generateUnfathomableId('mem');
      const inheritedRoles = sourceMem ? [...sourceMem.roleIds] : [];
      const inheritedMemo = sourceMem ? sourceMem.memo : '';

      await commitStoreUpdate((prev) => {
        const b = prev.projects[currentProjectId];
        if (!b) return prev;

        let nextMemberships = [...b.memberships];

        if (isCopy || !sourceMem) {
          // コピー（兼務追加）または未所属からの新規所属追加
          if (!existingInTarget) {
            nextMemberships.push({
              id: newMemId,
              projectId: currentProjectId,
              personId,
              groupId: targetGroupId,
              roleIds: inheritedRoles,
              memo: inheritedMemo,
              updatedAt: now,
            });
          }
        } else {
          // 移動（元のグループ所属をターゲットグループへ移籍）
          if (existingInTarget) {
            // 既に移動先にも所属していた場合は元の所属を削除して統合
            nextMemberships = nextMemberships.filter((m) => m.id !== sourceMem.id);
          } else {
            nextMemberships = nextMemberships.map((m) =>
              m.id === sourceMem.id
                ? {
                    ...m,
                    groupId: targetGroupId,
                    updatedAt: now,
                  }
                : m
            );
          }
        }

        return {
          ...prev,
          projects: {
            ...prev.projects,
            [currentProjectId]: {
              ...b,
              memberships: nextMemberships,
            },
          },
        };
      });

      return {
        membershipId: !isCopy && sourceMem && !existingInTarget ? sourceMem.id : newMemId,
        action: isCopy || !sourceMem ? 'copied' : 'moved',
      };
    },
    [actor, commitStoreUpdate, currentBundle, currentProjectId]
  );

  // 関係線の追加・更新（編集者はすべて可、一般ログインユーザーは自分の人物カードが関わる関係線のみ可）
  const upsertRelationship = useCallback(
    async (relInput: Omit<Relationship, 'projectId' | 'updatedAt'>) => {
      if (!currentBundle) return;
      if (!canManageRelationship(actor, relInput, currentBundle)) {
        throw new Error(
          'PERMISSION_DENIED: 一般ログインユーザーは、自分自身の人物カードが接続元または接続先に含まれる関係線のみ作成・編集できます。'
        );
      }
      const existingRel = currentBundle.relationships.find((r) => r.id === relInput.id);
      if (existingRel && !canManageRelationship(actor, existingRel, currentBundle)) {
        throw new Error('PERMISSION_DENIED: この関係線を編集する権限がありません。');
      }

      const now = new Date().toISOString();
      await commitStoreUpdate((prev) => {
        const b = prev.projects[currentProjectId];
        if (!b) return prev;

        const srcOk =
          relInput.sourceKind === 'person'
            ? b.people.some((p) => p.id === relInput.sourceId)
            : b.groups.some((g) => g.id === relInput.sourceId);
        const tgtOk =
          relInput.targetKind === 'person'
            ? b.people.some((p) => p.id === relInput.targetId)
            : b.groups.some((g) => g.id === relInput.targetId);

        if (!srcOk || !tgtOk) {
          throw new Error('VALIDATION_ERROR: 別プロジェクトまたは存在しない対象への関係線は登録できません。');
        }

        const nextRel: Relationship = {
          ...relInput,
          projectId: currentProjectId,
          updatedAt: now,
        };

        const exists = b.relationships.some((r) => r.id === nextRel.id);
        const nextRels = exists
          ? b.relationships.map((r) => (r.id === nextRel.id ? nextRel : r))
          : [...b.relationships, nextRel];

        return {
          ...prev,
          projects: {
            ...prev.projects,
            [currentProjectId]: {
              ...b,
              relationships: nextRels,
            },
          },
        };
      });
    },
    [actor, commitStoreUpdate, currentBundle, currentProjectId]
  );

  const deleteRelationship = useCallback(
    async (relationshipId: string) => {
      if (!currentBundle) return;
      const targetRel = currentBundle.relationships.find((r) => r.id === relationshipId);
      if (!targetRel) return;
      if (!canManageRelationship(actor, targetRel, currentBundle)) {
        throw new Error('PERMISSION_DENIED: この関係線を削除する権限がありません。');
      }
      await commitStoreUpdate((prev) => {
        const b = prev.projects[currentProjectId];
        if (!b) return prev;
        return {
          ...prev,
          projects: {
            ...prev.projects,
            [currentProjectId]: {
              ...b,
              relationships: b.relationships.filter((r) => r.id !== relationshipId),
            },
          },
        };
      });
    },
    [actor, commitStoreUpdate, currentBundle, currentProjectId]
  );

  // 本人プロフィールのオンデマンド取得（非公開プロフィールは本人以外取得拒否）
  const fetchUserProfileOnDemand = useCallback(
    async (uid: string): Promise<UserProfile | null> => {
      const profile = store.userProfiles[uid];
      if (!profile) return null;
      if (!canReadUserProfile(actor, profile)) {
        throw new Error('PERMISSION_DENIED: このプロフィールは非公開に設定されています。');
      }
      return profile;
    },
    [actor, store.userProfiles]
  );

  // 本人プロフィールと本人アイコンの更新（本人のみ可能・管理者でも他人のプロフィール更新は拒否）
  const updateSelfProfile = useCallback(
    async (
      targetUid: string,
      profileInput: Pick<UserProfile, 'displayName' | 'bio' | 'links' | 'isPublic' | 'avatarPreset'>,
      newIconData?: { dataUrl: string; byteSize: number } | null,
      removeIcon?: boolean
    ) => {
      const existing = store.userProfiles[targetUid];
      const now = new Date().toISOString();
      const currentRev = existing?.iconRevision || 0;
      const nextRev = newIconData ? currentRev + 1 : removeIcon ? 0 : currentRev;

      const nextProfile: UserProfile = {
        ownerUid: targetUid,
        displayName: profileInput.displayName.trim().slice(0, 60),
        bio: profileInput.bio,
        links: profileInput.links,
        isPublic: profileInput.isPublic,
        iconRevision: nextRev,
        avatarPreset: profileInput.avatarPreset || 'user',
        updatedAt: now,
      };

      // 厳格な本人確認・文字数・URL検証
      assertCanUpdateUserProfile(actor, targetUid, nextProfile, existing);

      let nextIconDoc: ProfileIconDoc | undefined = store.profileIcons[targetUid];
      if (newIconData) {
        nextIconDoc = {
          ownerUid: targetUid,
          isPublic: nextProfile.isPublic,
          revision: nextRev,
          mimeType: 'image/webp',
          width: 128,
          height: 128,
          byteSize: newIconData.byteSize,
          dataUrl: newIconData.dataUrl,
          updatedAt: now,
        };
        assertCanUpdateProfileIcon(actor, targetUid, nextIconDoc, nextProfile);
        iconCacheRef.current.set(`profile:${targetUid}@${nextRev}`, newIconData.dataUrl);
      } else if (nextIconDoc && !removeIcon) {
        // プロフィールの公開状態変更に合わせて画像文書の isPublic も必ず同期させる（食い違い防止）
        nextIconDoc = {
          ...nextIconDoc,
          isPublic: nextProfile.isPublic,
          updatedAt: now,
        };
      }

      await commitStoreUpdate((prev) => {
        const nextIcons = { ...prev.profileIcons };
        if (removeIcon) {
          delete nextIcons[targetUid];
        } else if (nextIconDoc) {
          nextIcons[targetUid] = nextIconDoc;
        }
        return {
          ...prev,
          userProfiles: {
            ...prev.userProfiles,
            [targetUid]: nextProfile,
          },
          profileIcons: nextIcons,
        };
      });
    },
    [actor, commitStoreUpdate, store.profileIcons, store.userProfiles]
  );

  // 人物とGoogleアカウントのひも付け招待作成（管理者のみ）
  const createAccountInvitation = useCallback(
    async (personId: string, targetEmail: string): Promise<AccountInvitation> => {
      if (!permissions.isAdmin || !actor.uid || !currentBundle) {
        throw new Error('PERMISSION_DENIED: アカウントのひも付け招待作成はプロジェクト管理者のみ可能です。');
      }
      const person = currentBundle.people.find((p) => p.id === personId);
      if (!person) {
        throw new Error('VALIDATION_ERROR: 対象の人物が見つかりません。');
      }
      if (person.linkedUid) {
        throw new Error('VALIDATION_ERROR: この人物は既にアカウントとひも付けられています。');
      }
      const cleanEmail = targetEmail.trim().toLowerCase();
      if (!cleanEmail || !cleanEmail.includes('@')) {
        throw new Error('VALIDATION_ERROR: 有効なGoogleアカウントのメールアドレスを入力してください。');
      }

      const now = new Date().toISOString();
      const invId = generateUnfathomableId('inv');
      const newInv: AccountInvitation = {
        id: invId,
        projectId: currentProjectId,
        projectName: currentBundle.project.name,
        personId: person.id,
        personDisplayName: person.displayName,
        targetEmail: cleanEmail,
        status: 'pending',
        createdByUid: actor.uid,
        approvedByUid: null,
        createdAt: now,
        updatedAt: now,
      };

      await commitStoreUpdate((prev) => {
        const b = prev.projects[currentProjectId];
        if (!b) return prev;
        return {
          ...prev,
          invitations: [
            ...prev.invitations.map((i) =>
              i.personId === personId && i.projectId === currentProjectId && i.status === 'pending'
                ? { ...i, status: 'cancelled' as const, updatedAt: now }
                : i
            ),
            newInv,
          ],
          projects: {
            ...prev.projects,
            [currentProjectId]: {
              ...b,
              people: b.people.map((p) =>
                p.id === personId
                  ? { ...p, activeInvitationId: invId, updatedAt: now }
                  : p
              ),
            },
          },
        };
      });

      return newInv;
    },
    [actor.uid, commitStoreUpdate, currentBundle, currentProjectId, permissions.isAdmin]
  );

  // 招待先本人による承認（バッチ更新相当：招待ステータスを approved にし、人物の linkedUid に本人UIDをセット）
  const approveAccountInvitation = useCallback(
    async (invitationId: string) => {
      const inv = store.invitations.find((i) => i.id === invitationId);
      if (!inv) {
        throw new Error('VALIDATION_ERROR: 招待が見つかりません。');
      }
      const b = store.projects[inv.projectId];
      const person = b?.people.find((p) => p.id === inv.personId);
      if (!b || !person) {
        throw new Error('VALIDATION_ERROR: 対象のプロジェクトまたは人物が見つかりません。');
      }

      assertCanApproveInvitation(actor, inv, person);
      const now = new Date().toISOString();

      await commitStoreUpdate((prev) => {
        const targetBundle = prev.projects[inv.projectId];
        if (!targetBundle) return prev;

        // 承認した本人のプロフィールがまだ存在しない場合は初期プロフィール（非公開）を作成
        const nextProfiles = { ...prev.userProfiles };
        if (!nextProfiles[actor.uid!]) {
          nextProfiles[actor.uid!] = {
            ownerUid: actor.uid!,
            displayName: person.displayName,
            bio: '',
            links: [],
            isPublic: false,
            iconRevision: 0,
            avatarPreset: person.avatarPreset || 'user',
            updatedAt: now,
          };
        }

        return {
          ...prev,
          userProfiles: nextProfiles,
          invitations: prev.invitations.map((i) =>
            i.id === invitationId
              ? {
                  ...i,
                  status: 'approved',
                  approvedByUid: actor.uid!,
                  updatedAt: now,
                }
              : i
          ),
          projects: {
            ...prev.projects,
            [inv.projectId]: {
              ...targetBundle,
              people: targetBundle.people.map((p) =>
                p.id === inv.personId
                  ? {
                      ...p,
                      linkedUid: actor.uid!,
                      activeInvitationId: invitationId,
                      updatedAt: now,
                    }
                  : p
              ),
            },
          },
        };
      });
    },
    [actor, commitStoreUpdate, store.invitations, store.projects]
  );

  const declineOrCancelInvitation = useCallback(
    async (invitationId: string) => {
      const inv = store.invitations.find((i) => i.id === invitationId);
      if (!inv) return;
      const b = store.projects[inv.projectId];
      if (!b) return;
      const { isAdmin } = evaluateProjectAccess(actor, b);
      const isTargetSelf = Boolean(
        actor.email &&
          actor.emailVerified &&
          actor.email.toLowerCase() === inv.targetEmail.toLowerCase()
      );
      if (!isAdmin && !isTargetSelf) {
        throw new Error('PERMISSION_DENIED: 招待の取り消し・辞退権限がありません。');
      }
      const now = new Date().toISOString();
      const nextStatus = isTargetSelf && !isAdmin ? 'declined' : 'cancelled';

      await commitStoreUpdate((prev) => {
        const targetBundle = prev.projects[inv.projectId];
        if (!targetBundle) return prev;
        return {
          ...prev,
          invitations: prev.invitations.map((i) =>
            i.id === invitationId ? { ...i, status: nextStatus, updatedAt: now } : i
          ),
          projects: {
            ...prev.projects,
            [inv.projectId]: {
              ...targetBundle,
              people: targetBundle.people.map((p) =>
                p.id === inv.personId && p.activeInvitationId === invitationId
                  ? { ...p, activeInvitationId: null, updatedAt: now }
                  : p
              ),
            },
          },
        };
      });
    },
    [actor, commitStoreUpdate, store.invitations, store.projects]
  );

  // ひも付け解除（本人またはプロジェクト管理者のみ可能、解除しても本人プロフィール自体は変更・削除されない）
  const unlinkPersonAccount = useCallback(
    async (personId: string) => {
      if (!currentBundle) return;
      const person = currentBundle.people.find((p) => p.id === personId);
      if (!person) return;

      assertCanUnlinkAccount(actor, person, currentBundle);
      const now = new Date().toISOString();

      await commitStoreUpdate((prev) => {
        const b = prev.projects[currentProjectId];
        if (!b) return prev;
        return {
          ...prev,
          // prev.userProfiles および prev.profileIcons は一切変更・削除しない
          projects: {
            ...prev.projects,
            [currentProjectId]: {
              ...b,
              people: b.people.map((p) =>
                p.id === personId
                  ? {
                      ...p,
                      linkedUid: null,
                      activeInvitationId: null,
                      updatedAt: now,
                    }
                  : p
              ),
            },
          },
        };
      });
    },
    [actor, commitStoreUpdate, currentBundle, currentProjectId]
  );

  // YAMLバックアップ退避（管理者のみ）
  const exportCurrentProjectYaml = useCallback((): string => {
    if (!currentBundle || !permissions.isAdmin) {
      throw new Error('PERMISSION_DENIED: YAMLバックアップの退避（エクスポート）はプロジェクト管理者のみ実行できます。');
    }
    return exportProjectBundleToYaml(currentBundle);
  }, [currentBundle, permissions.isAdmin]);

  // YAMLバックアップ取込（管理者のみ）
  const importCurrentProjectYaml = useCallback(
    async (yamlContent: string): Promise<{ warnings: string[] }> => {
      if (!currentBundle || !permissions.isAdmin || !actor.uid) {
        throw new Error('PERMISSION_DENIED: YAMLバックアップの取込（インポート）はプロジェクト管理者のみ実行できます。');
      }
      const result = parseAndValidateYamlBackup(
        yamlContent,
        currentProjectId,
        currentBundle.project.ownerUid
      );
      if (!result.valid || !result.bundle) {
        throw new Error(result.error || 'YAMLファイルの検証に失敗しました。');
      }

      const imported = result.bundle;
      await commitStoreUpdate((prev) => {
        const existing = prev.projects[currentProjectId];
        if (!existing) return prev;
        return {
          ...prev,
          // 他人の本人プロフィール（prev.userProfiles）は一切書き換えない
          projects: {
            ...prev.projects,
            [currentProjectId]: {
              project: imported.project,
              groups: imported.groups,
              people: imported.people,
              memberships: imported.memberships,
              relationships: imported.relationships,
              diagrams: imported.diagrams,
              editorEmails: existing.editorEmails,
              projectIcons: imported.projectIcons,
            },
          },
        };
      });

      if (imported.diagrams.length > 0) {
        setActiveDiagramId(imported.diagrams[0].id);
      }

      return { warnings: result.warnings };
    },
    [actor.uid, commitStoreUpdate, currentBundle, currentProjectId, permissions.isAdmin]
  );

  const resetDemoState = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    const fresh: PersistedLocalStore = {
      projects: createInitialDemoProjects(),
      userProfiles: { ...INITIAL_USER_PROFILES },
      profileIcons: { ...INITIAL_PROFILE_ICONS },
      invitations: [...INITIAL_INVITATIONS],
      testUsers: [...INITIAL_TEST_USERS],
    };
    setStore(fresh);
    setActiveTestUserUid(DEMO_ADMIN_UID);
    setCurrentProjectId(DEMO_PROJECT_ID);
    setActiveDiagramId('diag_mixed_main');
    setUndoStack([]);
    setRedoStack([]);
    setSaveStatus('saved');
    setSaveErrorMessage(null);
  }, []);

  const value: AppStateContextValue = {
    isFirebaseConfigured,
    actor,
    currentUserLabel,
    testUsers: store.testUsers,
    activeTestUserUid,
    switchTestUser,
    createTestUser,
    deleteTestUser,
    saveStatus,
    lastSavedAt,
    saveErrorMessage,
    simulateNetworkFailure,
    setSimulateNetworkFailure,
    manualRefreshProject,
    projectsMap: store.projects,
    currentProjectId,
    selectProject,
    currentBundle,
    activeDiagramId,
    setActiveDiagramId,
    activeDiagram,
    permissions,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    undoLastAction,
    redoLastAction,
    createProject,
    updateProjectMeta,
    deleteCurrentProject,
    addEditorEmail,
    revokeEditorEmail,
    upsertTag,
    deleteTag,
    createDiagram,
    duplicateDiagram,
    updateDiagram,
    deleteDiagram,
    updateNodePosition,
    updateMultipleNodePositions,
    toggleGroupCollapse,
    upsertGroup,
    deleteGroupWithCascade,
    upsertPerson,
    deletePersonWithCascade,
    upsertMembership,
    deleteMembership,
    moveOrCopyMembershipByDrag,
    upsertRelationship,
    deleteRelationship,
    userProfiles: store.userProfiles,
    profileIcons: store.profileIcons,
    fetchUserProfileOnDemand,
    updateSelfProfile,
    invitations: store.invitations,
    createAccountInvitation,
    approveAccountInvitation,
    declineOrCancelInvitation,
    unlinkPersonAccount,
    exportCurrentProjectYaml,
    importCurrentProjectYaml,
    resetDemoState,
  };

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
};

export function useAppState(): AppStateContextValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) {
    throw new Error('useAppState must be used within AppStateProvider');
  }
  return ctx;
}
