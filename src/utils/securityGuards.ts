import type {
  AccountInvitation,
  EditorEmailRecord,
  EntityKind,
  Person,
  ProfileIconDoc,
  ProjectBundle,
  TestSandboxUser,
  UserProfile,
} from '../types/domain';
import { validateProcessedIconDataUrl } from './imageProcessor';
import { validateProfileBio, validateProfileLinks } from './validation';

export interface AuthActor {
  uid: string | null;
  email: string | null;
  emailVerified: boolean;
  isOperator?: boolean;
}

/**
 * プロジェクトに対するユーザーの権限判定
 * - グループ内の役割（「管理者」「責任者」など）は一切使用しない
 * - オーナーUID または 確認済みメールアドレスの editorEmails ACL のみで判定
 */
export function evaluateProjectAccess(
  actor: AuthActor,
  bundle: ProjectBundle
): {
  isAdmin: boolean;
  isEditor: boolean;
  canRead: boolean;
} {
  const isAdmin = Boolean(actor.uid && bundle.project.ownerUid === actor.uid);
  const isAllowedEditor = Boolean(
    actor.uid &&
      actor.email &&
      actor.emailVerified &&
      bundle.editorEmails.some(
        (record) => record.email.toLowerCase() === actor.email!.toLowerCase() && record.active
      )
  );
  const isEditor = isAdmin || isAllowedEditor;
  const canRead = bundle.project.isPublic || isEditor;

  return { isAdmin, isEditor, canRead };
}

/**
 * 人物カードに紐づくアカウントの権限階層（管理者 / 編集者 / 一般人）を判定
 * - 編集者が「管理者」や「他の編集者」の人物カードを削除できないようにするためのガード用
 */
export function getPersonPrivilegeRole(
  person: Person,
  bundle: ProjectBundle,
  testUsers?: TestSandboxUser[]
): 'admin' | 'editor' | 'general' {
  if (!person.linkedUid) return 'general';
  if (person.linkedUid === bundle.project.ownerUid) return 'admin';

  // editorEmails に uid が記録されているか、testUsers 経由で一致する確認済みメールアドレスが active かを判定
  const linkedTestUser = testUsers?.find((u) => u.uid === person.linkedUid);
  const isEditorPerson = bundle.editorEmails.some(
    (rec) =>
      rec.active &&
      ((rec.uid && rec.uid === person.linkedUid) ||
        (linkedTestUser && rec.email.toLowerCase() === linkedTestUser.email.toLowerCase()))
  );
  if (isEditorPerson) return 'editor';
  return 'general';
}

/**
 * 一般人（ログインあり）が自分自身の人物カードを新規作成できるか判定
 * - なりすまし・大量作成防止のため、1つのGoogleアカウント（UID）につき自分の人物カードは1枚まで
 */
export function canCreateSelfPerson(actor: AuthActor, bundle: ProjectBundle): boolean {
  if (!actor.uid) return false;
  return !bundle.people.some((p) => p.linkedUid === actor.uid);
}

/**
 * 人物カード（表示名・色・ロール・スキル・自分の所属）を編集できるか判定
 * - 管理者・編集者：全員の人物カードを編集可能（ただし本人プロフィールは本人のみ）
 * - 一般人（ログインあり）：自分自身の人物カード（linkedUid === actor.uid）のみ編集可能
 */
export function canEditPersonCard(
  actor: AuthActor,
  person: Person,
  bundle: ProjectBundle
): boolean {
  const { isEditor } = evaluateProjectAccess(actor, bundle);
  if (isEditor) return true;
  if (actor.uid && person.linkedUid === actor.uid) return true;
  return false;
}

/**
 * 人物カードを削除できるか判定（4階層権限ルール）
 * 1. 管理者：全ユーザーの削除が可能（編集者・一般人・未連携すべて削除可）
 * 2. 編集者：一般人ユーザー（および未連携人物）の削除が可能。管理者や他の編集者は削除不可
 * 3. 一般人（ログインあり）：自分自身の人物カードのみ削除（退会）可能
 * 4. 一般人（ログイン無し）：削除不可
 */
export function canDeletePersonCard(
  actor: AuthActor,
  person: Person,
  bundle: ProjectBundle,
  testUsers?: TestSandboxUser[]
): boolean {
  if (!actor.uid) return false;
  const { isAdmin, isEditor } = evaluateProjectAccess(actor, bundle);

  if (isAdmin) {
    return true;
  }

  // 本人が自分自身の人物カードを削除（退会）する場合は常に許可（管理者以外）
  if (person.linkedUid === actor.uid) {
    return true;
  }

  if (isEditor) {
    const targetPrivilege = getPersonPrivilegeRole(person, bundle, testUsers);
    // 編集者は「一般人（general）」のみ削除可能（「管理者（admin）」や「他の編集者（editor）」は削除不可）
    return targetPrivilege === 'general';
  }

  return false;
}

/**
 * 関係線を作成・編集・削除・結点ドラッグ付け替えできるか判定
 * - 管理者・編集者：すべての関係線を操作可能
 * - 一般人（ログインあり）：自分自身の人物カードが接続元（source）または接続先（target）に含まれる関係線のみ操作可能
 */
export function canManageRelationship(
  actor: AuthActor,
  rel: {
    sourceKind: EntityKind;
    sourceId: string;
    targetKind: EntityKind;
    targetId: string;
  },
  bundle: ProjectBundle
): boolean {
  if (!actor.uid) return false;
  const { isEditor } = evaluateProjectAccess(actor, bundle);
  if (isEditor) return true;

  const myPerson = bundle.people.find((p) => p.linkedUid === actor.uid);
  if (!myPerson) return false;

  const isSourceMe = rel.sourceKind === 'person' && rel.sourceId === myPerson.id;
  const isTargetMe = rel.targetKind === 'person' && rel.targetId === myPerson.id;
  return isSourceMe || isTargetMe;
}

/**
 * 本人プロフィールの読み取りガード
 * - 公開プロフィールは誰でも閲覧可能
 * - 非公開プロフィールは所有者UID本人のみ閲覧可能（管理者でも不可）
 */
export function canReadUserProfile(actor: AuthActor, profile: UserProfile): boolean {
  if (profile.isPublic) return true;
  if (actor.uid && actor.uid === profile.ownerUid) return true;
  return false;
}

/**
 * 本人プロフィールの更新ガード
 * - 所有者UID本人のみ更新可能（プロジェクト管理者・編集者も変更不可）
 * - ownerUid は変更不可
 */
export function assertCanUpdateUserProfile(
  actor: AuthActor,
  targetUid: string,
  nextProfile: UserProfile,
  existingProfile?: UserProfile
): void {
  if (!actor.uid) {
    throw new Error('PERMISSION_DENIED: ログインが必要です。');
  }
  if (actor.uid !== targetUid || nextProfile.ownerUid !== targetUid) {
    throw new Error(
      'PERMISSION_DENIED: 本人プロフィールはそのアカウント本人のみが変更できます。プロジェクト管理者や編集者であっても他人のプロフィールは変更できません。'
    );
  }
  if (existingProfile && existingProfile.ownerUid !== nextProfile.ownerUid) {
    throw new Error('PERMISSION_DENIED: プロフィール所有者UID（ownerUid）は変更できません。');
  }
  const bioCheck = validateProfileBio(nextProfile.bio);
  if (!bioCheck.valid) {
    throw new Error(`VALIDATION_ERROR: ${bioCheck.error}`);
  }
  const linkCheck = validateProfileLinks(nextProfile.links);
  if (!linkCheck.valid) {
    throw new Error(`VALIDATION_ERROR: ${linkCheck.error}`);
  }
}

/**
 * 本人プロフィール画像の更新ガード
 * - 本人のみ更新可能
 * - プロフィール本体の公開状態（isPublic）と食い違わせない
 */
export function assertCanUpdateProfileIcon(
  actor: AuthActor,
  targetUid: string,
  iconDoc: ProfileIconDoc,
  profileDoc: UserProfile
): void {
  if (!actor.uid || actor.uid !== targetUid || iconDoc.ownerUid !== targetUid) {
    throw new Error('PERMISSION_DENIED: 本人アイコンは本人のみ変更可能です。');
  }
  if (iconDoc.isPublic !== profileDoc.isPublic) {
    throw new Error('VALIDATION_ERROR: プロフィールとアイコン画像の公開状態（isPublic）が一致していません。');
  }
  const imgCheck = validateProcessedIconDataUrl(iconDoc.dataUrl, iconDoc.byteSize);
  if (!imgCheck.valid) {
    throw new Error(`VALIDATION_ERROR: ${imgCheck.error}`);
  }
}

/**
 * ひも付け招待の承認ガード
 * - 招待先メールアドレスと一致する確認済みメールアドレスでログインしている本人のみ承認可能
 * - 承認すると Person.linkedUid に本人UIDがセットされる
 */
export function assertCanApproveInvitation(
  actor: AuthActor,
  invitation: AccountInvitation,
  person: Person
): void {
  if (!actor.uid || !actor.email || !actor.emailVerified) {
    throw new Error('PERMISSION_DENIED: 確認済みメールアドレスを持つGoogleログインが必要です。');
  }
  if (invitation.status !== 'pending') {
    throw new Error('VALIDATION_ERROR: この招待は既に処理済みか無効です。');
  }
  if (invitation.targetEmail.toLowerCase() !== actor.email.toLowerCase()) {
    throw new Error(
      `PERMISSION_DENIED: 招待先メールアドレス（${invitation.targetEmail}）とログイン中のメールアドレス（${actor.email}）が一致しないため承認できません。`
    );
  }
  if (person.linkedUid !== null) {
    throw new Error('VALIDATION_ERROR: この人物は既にアカウントとひも付けられています。');
  }
}

/**
 * ひも付け解除のガード
 * - 連携済み本人 または プロジェクト管理者のみ解除可能
 * - 解除しても本人プロフィール自体は変更・削除されない
 */
export function assertCanUnlinkAccount(
  actor: AuthActor,
  person: Person,
  bundle: ProjectBundle
): void {
  if (!actor.uid) {
    throw new Error('PERMISSION_DENIED: ログインが必要です。');
  }
  const { isAdmin } = evaluateProjectAccess(actor, bundle);
  const isLinkedSelf = person.linkedUid !== null && person.linkedUid === actor.uid;

  if (!isAdmin && !isLinkedSelf) {
    throw new Error(
      'PERMISSION_DENIED: アカウントのひも付け解除は、連携している本人またはプロジェクト管理者のみ可能です。'
    );
  }
}

/**
 * 人物の表示情報解決ヘルパー
 * - 未連携の場合：プロジェクト上の表示名 + 仮アイコン（tempIconId） + コメント・リンクは「未登録」
 * - 連携済み かつ 公開プロフィールの場合：本人プロフィールアイコン・コメント・リンクを表示可能
 * - 連携済み かつ 非公開プロフィールの場合：
 *   - 本人が見ている場合：自分の非公開プロフィールを閲覧・編集可能
 *   - 本人以外（管理者含む）が見ている場合：図および詳細ではプロジェクト上の表示名と代替アイコンを表示し、本人コメント・リンク・本人アイコンは公開しない
 */
export interface ResolvedPersonView {
  person: Person;
  effectiveDisplayName: string;
  profileDisplayName: string | null;
  iconDataUrl: string | null;
  avatarPreset: string;
  linkStatus: 'unlinked' | 'invited' | 'linked_public' | 'linked_private';
  canViewProfileContent: boolean;
  canEditSelfProfile: boolean;
  bio: string | null;
  links: UserProfile['links'];
  isProfilePublic: boolean;
}

export function resolvePersonView(
  person: Person,
  actor: AuthActor,
  userProfiles: Record<string, UserProfile>,
  profileIcons: Record<string, ProfileIconDoc>,
  projectIcons: ProjectBundle['projectIcons']
): ResolvedPersonView {
  // 1. アカウント未連携
  if (!person.linkedUid) {
    const tempIcon = person.tempIconId ? projectIcons[person.tempIconId] : undefined;
    return {
      person,
      effectiveDisplayName: person.displayName,
      profileDisplayName: null,
      iconDataUrl: tempIcon?.dataUrl ?? null,
      avatarPreset: person.avatarPreset || 'user',
      linkStatus: person.activeInvitationId ? 'invited' : 'unlinked',
      canViewProfileContent: false,
      canEditSelfProfile: false,
      bio: null,
      links: [],
      isProfilePublic: false,
    };
  }

  // 2. アカウント連携済み
  const profile = userProfiles[person.linkedUid];
  const isSelf = Boolean(actor.uid && actor.uid === person.linkedUid);

  if (!profile) {
    return {
      person,
      effectiveDisplayName: person.displayName,
      profileDisplayName: null,
      iconDataUrl: null,
      avatarPreset: person.avatarPreset || 'user',
      linkStatus: 'linked_private',
      canViewProfileContent: isSelf,
      canEditSelfProfile: isSelf,
      bio: isSelf ? '' : null,
      links: [],
      isProfilePublic: false,
    };
  }

  // 非公開プロフィール かつ 本人以外が閲覧している場合：
  // 仕様「非公開時は本人以外にコメント・リンク・本人アイコンを公開しない。
  // 非公開プロフィールの人物は、図ではプロジェクト上の表示名と代替アイコンで表示する。」
  if (!profile.isPublic && !isSelf) {
    return {
      person,
      effectiveDisplayName: person.displayName,
      profileDisplayName: null,
      iconDataUrl: null, // 本人アイコンも非公開
      avatarPreset: person.avatarPreset || 'user',
      linkStatus: 'linked_private',
      canViewProfileContent: false,
      canEditSelfProfile: false,
      bio: null,
      links: [],
      isProfilePublic: false,
    };
  }

  // 公開プロフィール または 本人が閲覧している場合
  const pIcon = profileIcons[person.linkedUid];
  const canUseIcon = pIcon && (pIcon.isPublic || isSelf);

  return {
    person,
    effectiveDisplayName: person.displayName,
    profileDisplayName: profile.displayName,
    iconDataUrl: canUseIcon ? pIcon.dataUrl : null,
    avatarPreset: profile.avatarPreset || person.avatarPreset || 'user',
    linkStatus: profile.isPublic ? 'linked_public' : 'linked_private',
    canViewProfileContent: true,
    canEditSelfProfile: isSelf,
    bio: profile.bio,
    links: profile.links,
    isProfilePublic: profile.isPublic,
  };
}
