import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const PROJECT_ID = 'demo-kizunamap-rules-test';
const isEmulatorRunning = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

describe.skipIf(!isEmulatorRunning)('Firestore セキュリティルール検証 (Firebase Emulator)', () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules,
        host: '127.0.0.1',
        port: 8080,
      },
    });
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();

    // 初期シードデータをセキュリティルール無効コンテキストで投入
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();

      // 運営アカウント設定
      await setDoc(doc(db, 'systemConfig/operators'), {
        allowedUids: ['uid_operator_admin'],
        allowedEmails: ['admin@example.com'],
      });

      // 公開プロジェクト
      await setDoc(doc(db, 'projects/proj_public'), {
        id: 'proj_public',
        name: '公開テストプロジェクト',
        description: 'テスト用',
        ownerUid: 'uid_operator_admin',
        isPublic: true,
        roleTags: [],
        skillTags: [],
        relationTags: [],
        groupTags: [],
        createdAt: '2026-10-27T00:00:00Z',
        updatedAt: '2026-10-27T00:00:00Z',
      });

      // 公開プロジェクトの編集者許可リスト
      await setDoc(doc(db, 'projects/proj_public/editorEmails/editor@example.com'), {
        email: 'editor@example.com',
        active: true,
        addedByUid: 'uid_operator_admin',
        updatedAt: '2026-10-27T00:00:00Z',
      });

      // 大グループ
      await setDoc(doc(db, 'projects/proj_public/groups/grp_large_1'), {
        id: 'grp_large_1',
        projectId: 'proj_public',
        name: '開発本部',
        kind: 'large',
        parentGroupId: null,
        color: '#2563eb',
        description: '',
        tags: [],
        iconId: null,
        iconRevision: 0,
        avatarPreset: 'building',
        order: 0,
        updatedAt: '2026-10-27T00:00:00Z',
      });

      // 招待待ちの未連携人物
      await setDoc(doc(db, 'projects/proj_public/people/person_invited'), {
        id: 'person_invited',
        projectId: 'proj_public',
        displayName: '伊藤 健太',
        globalRoleIds: [],
        skillIds: [],
        color: '#0891b2',
        projectMemo: '',
        linkedUid: null,
        activeInvitationId: 'inv_1',
        tempIconId: null,
        tempIconRevision: 0,
        avatarPreset: 'user',
        updatedAt: '2026-10-27T00:00:00Z',
      });

      // ひも付け招待
      await setDoc(doc(db, 'invitations/inv_1'), {
        id: 'inv_1',
        projectId: 'proj_public',
        projectName: '公開テストプロジェクト',
        personId: 'person_invited',
        personDisplayName: '伊藤 健太',
        targetEmail: 'ito@example.com',
        status: 'pending',
        createdByUid: 'uid_operator_admin',
        approvedByUid: null,
        createdAt: '2026-10-27T00:00:00Z',
        updatedAt: '2026-10-27T00:00:00Z',
      });

      // 非公開プロジェクト
      await setDoc(doc(db, 'projects/proj_private'), {
        id: 'proj_private',
        name: '非公開テストプロジェクト',
        description: '秘密',
        ownerUid: 'uid_operator_admin',
        isPublic: false,
        roleTags: [],
        skillTags: [],
        relationTags: [],
        groupTags: [],
        createdAt: '2026-10-27T00:00:00Z',
        updatedAt: '2026-10-27T00:00:00Z',
      });

      // 公開プロフィールと非公開プロフィール
      await setDoc(doc(db, 'userProfiles/uid_public_user'), {
        ownerUid: 'uid_public_user',
        displayName: '公開ユーザー',
        bio: '公開コメント',
        links: [{ label: 'Blog', url: 'https://example.com' }],
        isPublic: true,
        iconRevision: 1,
        avatarPreset: 'user',
        updatedAt: '2026-10-27T00:00:00Z',
      });

      await setDoc(doc(db, 'userProfiles/uid_private_user'), {
        ownerUid: 'uid_private_user',
        displayName: '非公開ユーザー',
        bio: '秘密のコメント',
        links: [],
        isPublic: false,
        iconRevision: 0,
        avatarPreset: 'shield',
        updatedAt: '2026-10-27T00:00:00Z',
      });
    });
  });

  it('1. 未ログインで公開図・公開プロフィールは閲覧でき、非公開図・非公開プロフィールは拒否されること', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore();

    await assertSucceeds(getDoc(doc(anonDb, 'projects/proj_public')));
    await assertSucceeds(getDoc(doc(anonDb, 'userProfiles/uid_public_user')));

    await assertFails(getDoc(doc(anonDb, 'projects/proj_private')));
    await assertFails(getDoc(doc(anonDb, 'userProfiles/uid_private_user')));
  });

  it('2. 本人のみ自分のプロフィールと本人アイコンを更新でき、プロジェクト管理者でも他人のプロフィール更新は拒否されること', async () => {
    const adminDb = testEnv
      .authenticatedContext('uid_operator_admin', {
        email: 'admin@example.com',
        email_verified: true,
      })
      .firestore();

    const selfDb = testEnv
      .authenticatedContext('uid_public_user', {
        email: 'public@example.com',
        email_verified: true,
      })
      .firestore();

    // 管理者であっても他人のプロフィール更新は拒否
    await assertFails(
      updateDoc(doc(adminDb, 'userProfiles/uid_public_user'), {
        bio: '管理者による不正書き換え',
      })
    );

    // 本人によるプロフィール更新は成功
    await assertSucceeds(
      updateDoc(doc(selfDb, 'userProfiles/uid_public_user'), {
        bio: '本人による更新コメント',
      })
    );

    // 本人であっても ownerUid の書き換えは拒否
    await assertFails(
      updateDoc(doc(selfDb, 'userProfiles/uid_public_user'), {
        ownerUid: 'uid_hacker',
      })
    );

    // 本人による 128x128 WebP アイコン（30KB以下、isPublicがプロフィールと一致）保存は成功
    const validWebp =
      'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoCAAIAAQAcJaQAA3AA/vuUAAA=';
    await assertSucceeds(
      setDoc(doc(selfDb, 'profileIcons/uid_public_user'), {
        ownerUid: 'uid_public_user',
        isPublic: true,
        revision: 1,
        mimeType: 'image/webp',
        width: 128,
        height: 128,
        byteSize: 44,
        dataUrl: validWebp,
        updatedAt: '2026-10-27T01:00:00Z',
      })
    );

    // プロフィール本体(isPublic: true)と食い違う isPublic: false のアイコン保存は拒否
    await assertFails(
      setDoc(doc(selfDb, 'profileIcons/uid_public_user'), {
        ownerUid: 'uid_public_user',
        isPublic: false,
        revision: 2,
        mimeType: 'image/webp',
        width: 128,
        height: 128,
        byteSize: 44,
        dataUrl: validWebp,
        updatedAt: '2026-10-27T01:00:00Z',
      })
    );
  });

  it('3. 編集者はグループ・所属を更新でき、許可取り消し後や編集権限のない本人はプロジェクト更新できないこと', async () => {
    const editorDb = testEnv
      .authenticatedContext('uid_editor', {
        email: 'editor@example.com',
        email_verified: true,
      })
      .firestore();

    const selfOnlyDb = testEnv
      .authenticatedContext('uid_public_user', {
        email: 'public@example.com',
        email_verified: true,
      })
      .firestore();

    // 編集者は有効な大グループ配下に小グループを作成可能
    await assertSucceeds(
      setDoc(doc(editorDb, 'projects/proj_public/groups/grp_small_1'), {
        id: 'grp_small_1',
        projectId: 'proj_public',
        name: 'フロントエンド班',
        kind: 'small',
        parentGroupId: 'grp_large_1',
        color: '#3b82f6',
        description: '',
        tags: [],
        iconId: null,
        iconRevision: 0,
        avatarPreset: 'layout',
        order: 1,
        updatedAt: '2026-10-27T01:00:00Z',
      })
    );

    // 小グループを親にした三階層ネストはルールで拒否されること
    await assertFails(
      setDoc(doc(editorDb, 'projects/proj_public/groups/grp_invalid_nested'), {
        id: 'grp_invalid_nested',
        projectId: 'proj_public',
        name: '不正な孫グループ',
        kind: 'small',
        parentGroupId: 'grp_small_1',
        color: '#3b82f6',
        description: '',
        tags: [],
        iconId: null,
        iconRevision: 0,
        avatarPreset: 'layout',
        order: 2,
        updatedAt: '2026-10-27T01:00:00Z',
      })
    );

    // 編集権限のない本人はグループ作成不可
    await assertFails(
      setDoc(doc(selfOnlyDb, 'projects/proj_public/groups/grp_hack'), {
        id: 'grp_hack',
        projectId: 'proj_public',
        name: '不正グループ',
        kind: 'large',
        parentGroupId: null,
        color: '#000',
        description: '',
        tags: [],
        iconId: null,
        iconRevision: 0,
        avatarPreset: 'building',
        order: 3,
        updatedAt: '2026-10-27T01:00:00Z',
      })
    );

    // 管理者が編集者の権限を active: false に取り消した後は、編集者の書き込みが即座に拒否されること
    const adminDb = testEnv
      .authenticatedContext('uid_operator_admin', {
        email: 'admin@example.com',
        email_verified: true,
      })
      .firestore();

    await assertSucceeds(
      updateDoc(doc(adminDb, 'projects/proj_public/editorEmails/editor@example.com'), {
        active: false,
        updatedAt: '2026-10-27T02:00:00Z',
      })
    );

    await assertFails(
      updateDoc(doc(editorDb, 'projects/proj_public/groups/grp_small_1'), {
        name: '取り消し後の更新試行',
      })
    );
  });

  it('4. 編集者許可一覧(editorEmails)や招待(invitations)の第三者による公開取得を拒否し、招待は対象本人のみバッチ承認できること', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore();
    const otherUserDb = testEnv
      .authenticatedContext('uid_other', {
        email: 'other@example.com',
        email_verified: true,
      })
      .firestore();

    // メンバー許可一覧の取得拒否
    await assertFails(getDocs(collection(anonDb, 'projects/proj_public/editorEmails')));
    await assertFails(getDocs(collection(otherUserDb, 'projects/proj_public/editorEmails')));

    // 他人宛ての招待取得および承認の拒否
    await assertFails(getDoc(doc(otherUserDb, 'invitations/inv_1')));
    await assertFails(
      updateDoc(doc(otherUserDb, 'invitations/inv_1'), {
        status: 'approved',
        approvedByUid: 'uid_other',
      })
    );

    // 招待先メールアドレス(ito@example.com)の確認済み本人によるバッチ承認＆ひも付けは成功すること
    const invitedSelfDb = testEnv
      .authenticatedContext('uid_ito_verified', {
        email: 'ito@example.com',
        email_verified: true,
      })
      .firestore();

    const batch = writeBatch(invitedSelfDb);
    batch.update(doc(invitedSelfDb, 'invitations/inv_1'), {
      status: 'approved',
      approvedByUid: 'uid_ito_verified',
      updatedAt: '2026-10-27T03:00:00Z',
    });
    batch.update(doc(invitedSelfDb, 'projects/proj_public/people/person_invited'), {
      linkedUid: 'uid_ito_verified',
      activeInvitationId: 'inv_1',
      updatedAt: '2026-10-27T03:00:00Z',
    });

    await assertSucceeds(batch.commit());
  });
});
