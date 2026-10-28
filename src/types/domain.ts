// ============================================================================
// KizunaMap ドメインモデル定義
// 人物・Googleアカウント・プロジェクト編集権限・グループ内ロール・図の座標を明確に分離
// ============================================================================

export type PermissionRole = 'admin' | 'editor' | 'self_only' | 'viewer' | 'anonymous';

export type DiagramViewMode = 'mixed' | 'people' | 'groups';
export type NodeDisplayStyle = 'card' | 'compact';

export interface TagItem {
  id: string;
  name: string;
  color: string;
}

export interface ProfileLink {
  label: string; // 最大50文字
  url: string;   // http:// or https://, 最大2048文字
}

/**
 * 本人プロフィール (/userProfiles/{uid})
 * - 所有者UID本人のみが編集可能（プロジェクト管理者・編集者も変更不可）
 * - アカウント単位で共通、複数プロジェクトから参照可能
 * - メールアドレスは絶対に含めない
 */
export interface UserProfile {
  ownerUid: string;
  displayName: string;
  bio: string; // 最大400文字（書記素クラスタ＆UTF-16コード単位の両方で検証）
  links: ProfileLink[]; // 最大2個
  isPublic: boolean;
  iconRevision: number;
  avatarPreset: string;
  updatedAt: string;
}

/**
 * 本人プロフィール画像 (/profileIcons/{uid})
 * - 128x128px WebP Base64 (原則20KB以下、最大30KB)
 * - 基本情報（UserProfile）と分離し、iconRevision の変化時のみ取得・キャッシュ再利用
 */
export interface ProfileIconDoc {
  ownerUid: string;
  isPublic: boolean;
  revision: number;
  mimeType: 'image/webp';
  width: 128;
  height: 128;
  byteSize: number;
  dataUrl: string;
  updatedAt: string;
}

/**
 * プロジェクト用アイコン画像 (/projects/{projectId}/projectIcons/{iconId})
 * - 大グループ・小グループ・未連携人物の仮アイコン用
 */
export interface ProjectIconDoc {
  id: string;
  projectId: string;
  targetKind: 'group' | 'unlinkedPerson';
  targetId: string;
  revision: number;
  mimeType: 'image/webp';
  width: 128;
  height: 128;
  byteSize: number;
  dataUrl: string;
  updatedAt: string;
}

/**
 * プロジェクト本体 (/projects/{projectId})
 * - URLは推測しにくい識別子
 * - メールアドレスやメンバー一覧は公開プロジェクト文書に含めない
 */
export interface Project {
  id: string;
  name: string;
  description: string;
  ownerUid: string;
  isPublic: boolean;
  roleTags: TagItem[];     // 全体役割・所属役割タグ
  skillTags: TagItem[];    // スキルタグ
  relationTags: TagItem[]; // 関係タグ
  groupTags: TagItem[];    // グループタグ
  createdAt: string;
  updatedAt: string;
}

/**
 * 編集者許可リスト (/projects/{projectId}/editorEmails/{email})
 * - 管理者のみ一覧・追加・取り消し可能
 */
export interface EditorEmailRecord {
  email: string;
  uid?: string | null;
  active: boolean;
  addedByUid: string;
  updatedAt: string;
}

/**
 * 大グループ・小グループ (/projects/{projectId}/groups/{groupId})
 * - 二階層管理（大グループ kind='large', 小グループ kind='small'）
 * - 小グループの親は1つの大グループのみ
 */
export interface Group {
  id: string;
  projectId: string;
  name: string;
  kind: 'large' | 'small';
  parentGroupId: string | null;
  color: string;
  description: string;
  tags: string[]; // groupTags の ID
  iconId: string | null;
  iconRevision: number;
  avatarPreset: string;
  order: number;
  updatedAt: string;
}

/**
 * プロジェクト内の人物 (/projects/{projectId}/people/{personId})
 * - Googleアカウントがない人物も登録可能（linkedUid = null）
 * - 非公開プロフィールの内容やメールアドレスはここにコピーしない
 */
export interface Person {
  id: string;
  projectId: string;
  displayName: string;       // プロジェクト上の表示名
  globalRoleIds: string[];   // 全体での役割・肩書（複数）
  skillIds: string[];        // スキル（複数）
  color: string;             // 図の表示色
  projectMemo: string;       // プロジェクト用メモ（本人コメントとは別・公開プロジェクトでは公開）
  linkedUid: string | null;  // ひも付け承認済みの本人UID
  activeInvitationId: string | null;
  tempIconId: string | null; // 未連携時の仮アイコン文書ID
  tempIconRevision: number;
  avatarPreset: string;
  updatedAt: string;
}

/**
 * 所属先ごとの役割 (/projects/{projectId}/memberships/{membershipId})
 * - 人物とグループの間の独立した所属情報
 * - 同じ人物に所属先ごとに異なる役割（複数）と所属メモを設定可能
 * - 小グループ所属と大グループへの直接所属は別管理
 */
export interface Membership {
  id: string;
  projectId: string;
  personId: string;
  groupId: string;
  roleIds: string[]; // そのグループでの役割（roleTags の ID、複数）
  memo: string;      // 所属メモ
  updatedAt: string;
}

/**
 * 任意の関係線 (/projects/{projectId}/relationships/{relationshipId})
 * - 人物と人物、グループとグループ、人物とグループ（所属以外の関係）
 * - 同じ対象間に複数の関係を登録可能
 */
export type EntityKind = 'person' | 'group';
export type RelationDirection = 'forward' | 'bidirectional' | 'none';
export type RelationLineStyle = 'solid' | 'dashed';
export type HandleSide = 'top' | 'right' | 'bottom' | 'left';

export interface Relationship {
  id: string;
  projectId: string;
  sourceKind: EntityKind;
  sourceId: string;
  targetKind: EntityKind;
  targetId: string;
  sourceHandle?: HandleSide | null; // カードの結合位置（上・右・下・左）
  targetHandle?: HandleSide | null; // カードの結合位置（上・右・下・左）
  label: string;                 // 関係名（例：開発指示、レビュー依頼）
  tagIds: string[];              // 関係タグ（複数）
  direction: RelationDirection;  // 片方向・双方向・矢印なし
  color: string;
  lineStyle: RelationLineStyle;  // 実線・破線
  memo: string;
  updatedAt: string;
}

/**
 * 相関図タブ・レイアウト設定 (/projects/{projectId}/diagrams/{diagramId})
 * - 人物・グループ・所属・関係の実データと、図ごとの座標・表示設定を分離
 */
export interface NodePosition {
  x: number;
  y: number;
}

export interface DiagramFilterConfig {
  focusedEntityId: string | null;
  focusedGroupId: string | null;
  selectedRoleIds: string[];
  selectedSkillIds: string[];
  showMemberships: boolean;
  showRelationships: boolean;
  showGroupHierarchy: boolean;
  showMixedArrows?: boolean; // 初期画面（所属中心）での矢印表示ON/OFF（デフォルトOFF=false）
}

export interface Diagram {
  id: string;
  projectId: string;
  name: string;
  description: string;
  viewMode: DiagramViewMode;     // 'mixed' | 'people' | 'groups'
  nodeStyle: NodeDisplayStyle;   // 'card' | 'compact'
  nodePositions: Record<string, NodePosition>; // key: "person:{id}" or "group:{id}"
  collapsedGroupIds: string[];   // 折りたたみ中の大グループID一覧
  hiddenNodeIds: string[];
  filterConfig: DiagramFilterConfig;
  order: number;
  updatedAt: string;
}

/**
 * 人物とGoogleアカウントの安全なひも付け招待 (/invitations/{invitationId})
 */
export type InvitationStatus = 'pending' | 'approved' | 'declined' | 'cancelled';

export interface AccountInvitation {
  id: string;
  projectId: string;
  projectName: string;
  personId: string;
  personDisplayName: string;
  targetEmail: string;
  status: InvitationStatus;
  createdByUid: string;
  approvedByUid: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 管理者がテスト用に複数作成・切り替えできる仮想ユーザー
 */
export interface TestSandboxUser {
  uid: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  roleHint: 'admin' | 'editor' | 'self_only' | 'unauthorized';
  createdAt: string;
}

/**
 * 保存ステータス
 */
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * プロジェクト全体のバンドル状態（メモリ上・YAMLバックアップ用）
 */
export interface ProjectBundle {
  project: Project;
  groups: Group[];
  people: Person[];
  memberships: Membership[];
  relationships: Relationship[];
  diagrams: Diagram[];
  editorEmails: EditorEmailRecord[];
  projectIcons: Record<string, ProjectIconDoc>;
}
