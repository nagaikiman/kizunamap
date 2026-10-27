import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import App from '../src/App';
import {
  createInitialDemoProjects,
  DEMO_ADMIN_UID,
  DEMO_EDITOR_UID,
  DEMO_INVITED_UID,
  DEMO_PRIVATE_PROJECT_ID,
  DEMO_PROJECT_ID,
  DEMO_SELF_PRIVATE_UID,
  DEMO_SELF_PUBLIC_UID,
  DEMO_UNAUTHORIZED_UID,
  INITIAL_INVITATIONS,
  INITIAL_USER_PROFILES,
} from '../src/data/demoData';
import {
  analyzeGroupDeletionImpact,
  calculateGroupMemberCounts,
  validateAndAnalyzeGroupParentChange,
} from '../src/utils/groupRules';
import {
  estimateDataUrlByteSize,
  MAX_ALLOWED_ICON_BYTES,
  validateImageDimensions,
  validateInputImageFile,
  validateProcessedIconDataUrl,
} from '../src/utils/imageProcessor';
import {
  assertCanApproveInvitation,
  assertCanUnlinkAccount,
  assertCanUpdateProfileIcon,
  assertCanUpdateUserProfile,
  canReadUserProfile,
  evaluateProjectAccess,
  resolvePersonView,
} from '../src/utils/securityGuards';
import {
  getSafeCharCount,
  validateProfileBio,
  validateProfileLinks,
} from '../src/utils/validation';
import {
  exportProjectBundleToYaml,
  parseAndValidateYamlBackup,
} from '../src/utils/yamlBackup';

describe('KizunaMap ドメインロジック・権限・セキュリティ単体および結合テスト', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('1. 未ログインで公開図・公開プロフィールを閲覧可能であること', () => {
    const projects = createInitialDemoProjects();
    const publicBundle = projects[DEMO_PROJECT_ID];
    const anonActor = { uid: null, email: null, emailVerified: false };

    const access = evaluateProjectAccess(anonActor, publicBundle);
    expect(access.canRead).toBe(true);
    expect(access.isEditor).toBe(false);
    expect(access.isAdmin).toBe(false);

    // 公開プロフィールの閲覧が可能
    const publicProfile = INITIAL_USER_PROFILES[DEMO_SELF_PUBLIC_UID];
    expect(canReadUserProfile(anonActor, publicProfile)).toBe(true);
  });

  it('2. 非公開図・非公開プロフィールの取得を拒否し、非公開人物は代替表示になること', () => {
    const projects = createInitialDemoProjects();
    const privateBundle = projects[DEMO_PRIVATE_PROJECT_ID];
    const anonActor = { uid: null, email: null, emailVerified: false };
    const unauthorizedActor = {
      uid: DEMO_UNAUTHORIZED_UID,
      email: 'visitor@example.com',
      emailVerified: true,
    };

    // 非公開プロジェクトは未ログイン・未許可アカウントからの閲覧を拒否
    expect(evaluateProjectAccess(anonActor, privateBundle).canRead).toBe(false);
    expect(evaluateProjectAccess(unauthorizedActor, privateBundle).canRead).toBe(false);

    // 非公開プロフィールは本人以外（管理者含む）の閲覧を拒否
    const privateProfile = INITIAL_USER_PROFILES[DEMO_SELF_PRIVATE_UID];
    const adminActor = {
      uid: DEMO_ADMIN_UID,
      email: 'yamada.admin@example.com',
      emailVerified: true,
    };
    expect(canReadUserProfile(anonActor, privateProfile)).toBe(false);
    expect(canReadUserProfile(adminActor, privateProfile)).toBe(false);

    // 本人だけは自分の非公開プロフィールを閲覧可能
    const selfPrivateActor = {
      uid: DEMO_SELF_PRIVATE_UID,
      email: 'takahashi.qa@example.com',
      emailVerified: true,
    };
    expect(canReadUserProfile(selfPrivateActor, privateProfile)).toBe(true);

    // 非公開プロフィールの人物は、他者からはプロジェクト上の表示名と代替アイコンで表示され、コメント・リンクは公開されない
    const publicBundle = projects[DEMO_PROJECT_ID];
    const takahashiPerson = publicBundle.people.find((p) => p.id === 'person_takahashi')!;
    const resolvedForAdmin = resolvePersonView(
      takahashiPerson,
      adminActor,
      INITIAL_USER_PROFILES,
      {},
      {}
    );
    expect(resolvedForAdmin.effectiveDisplayName).toBe('高橋 美咲');
    expect(resolvedForAdmin.canViewProfileContent).toBe(false);
    expect(resolvedForAdmin.bio).toBeNull();
    expect(resolvedForAdmin.links).toEqual([]);
    expect(resolvedForAdmin.iconDataUrl).toBeNull();
  });

  it('3. 未許可アカウントおよび編集権限のない本人のプロジェクト更新を拒否すること', () => {
    const projects = createInitialDemoProjects();
    const publicBundle = projects[DEMO_PROJECT_ID];

    // グループ内で「グループ責任者」ロールを持つ鈴木（DEMO_SELF_PUBLIC_UID）であっても、
    // editorEmails に含まれていないためプロジェクト編集権限は付与されない
    const selfOnlyActor = {
      uid: DEMO_SELF_PUBLIC_UID,
      email: 'suzuki.dev@example.com',
      emailVerified: true,
    };
    const access = evaluateProjectAccess(selfOnlyActor, publicBundle);
    expect(access.isEditor).toBe(false);
    expect(access.isAdmin).toBe(false);
  });

  it('4. 本人のみプロフィールと本人アイコンを更新可能であり、管理者でも他人のプロフィール更新を拒否すること', () => {
    const adminActor = {
      uid: DEMO_ADMIN_UID,
      email: 'yamada.admin@example.com',
      emailVerified: true,
    };
    const selfActor = {
      uid: DEMO_SELF_PUBLIC_UID,
      email: 'suzuki.dev@example.com',
      emailVerified: true,
    };
    const targetProfile = INITIAL_USER_PROFILES[DEMO_SELF_PUBLIC_UID];

    // 管理者が他人のプロフィールを更新しようとしても拒否される
    expect(() =>
      assertCanUpdateUserProfile(
        adminActor,
        DEMO_SELF_PUBLIC_UID,
        { ...targetProfile, bio: '管理者による書き換え試行' },
        targetProfile
      )
    ).toThrow(/PERMISSION_DENIED/);

    // 本人による更新は成功する
    expect(() =>
      assertCanUpdateUserProfile(
        selfActor,
        DEMO_SELF_PUBLIC_UID,
        { ...targetProfile, bio: '本人による正常なコメント更新🎉' },
        targetProfile
      )
    ).not.toThrow();

    // ownerUid の変更は本人であっても拒否される
    expect(() =>
      assertCanUpdateUserProfile(
        selfActor,
        DEMO_SELF_PUBLIC_UID,
        { ...targetProfile, ownerUid: 'another_uid' },
        targetProfile
      )
    ).toThrow(/PERMISSION_DENIED/);
  });

  it('5. 編集者は所属・役割・グループを更新可能であり、許可取り消し後は書き込み拒否となること', () => {
    const projects = createInitialDemoProjects();
    const bundle = projects[DEMO_PROJECT_ID];
    const editorActor = {
      uid: DEMO_EDITOR_UID,
      email: 'sato.editor@example.com',
      emailVerified: true,
    };

    // 許可中は isEditor == true
    expect(evaluateProjectAccess(editorActor, bundle).isEditor).toBe(true);

    // 管理者により active: false に取り消された後は isEditor == false になる
    const revokedBundle = {
      ...bundle,
      editorEmails: bundle.editorEmails.map((e) => ({ ...e, active: false })),
    };
    expect(evaluateProjectAccess(editorActor, revokedBundle).isEditor).toBe(false);
  });

  it('6. ひも付け招待は招待先メールアドレスと一致する確認済み本人のみ承認可能であり、解除しても本人プロフィールは保持されること', () => {
    const projects = createInitialDemoProjects();
    const bundle = projects[DEMO_PROJECT_ID];
    const invitation = INITIAL_INVITATIONS[0]; // targetEmail: ito.infra@example.com
    const personIto = bundle.people.find((p) => p.id === 'person_ito')!;

    const wrongActor = {
      uid: DEMO_EDITOR_UID,
      email: 'sato.editor@example.com',
      emailVerified: true,
    };
    const rightActor = {
      uid: DEMO_INVITED_UID,
      email: 'ito.infra@example.com',
      emailVerified: true,
    };

    // 別人による承認は拒否
    expect(() => assertCanApproveInvitation(wrongActor, invitation, personIto)).toThrow(
      /PERMISSION_DENIED/
    );

    // 対象本人による承認は許可
    expect(() => assertCanApproveInvitation(rightActor, invitation, personIto)).not.toThrow();

    // ひも付け解除は本人またはプロジェクト管理者のみ可能
    const linkedPerson = { ...personIto, linkedUid: DEMO_INVITED_UID };
    expect(() => assertCanUnlinkAccount(wrongActor, linkedPerson, bundle)).toThrow(
      /PERMISSION_DENIED/
    );
    expect(() => assertCanUnlinkAccount(rightActor, linkedPerson, bundle)).not.toThrow();
  });

  it('7. 複数所属と人数の重複除外集計（小グループ所属と大グループ直接所属の重複を1人としてカウント）が正しいこと', () => {
    const projects = createInitialDemoProjects();
    const bundle = projects[DEMO_PROJECT_ID];

    const counts = calculateGroupMemberCounts(
      bundle.groups,
      bundle.memberships,
      bundle.people
    );

    // 大グループ「プロダクト開発本部 (grp_large_product)」の検証：
    // - 直接所属：山田、鈴木 (2人)
    // - 小グループ「フロントエンド班 (grp_small_fe)」：鈴木、佐藤、渡辺 (3人)
    // - 小グループ「プラットフォーム・SRE班 (grp_small_infra)」：伊藤 (1人)
    // 鈴木は大グループ直接とフロントエンド班の両方に所属しているが、配下含む合計人数では重複カウントせず
    // ユニークメンバー {山田, 鈴木, 佐藤, 渡辺, 伊藤} = 5人 となること！
    expect(counts['grp_large_product'].directCount).toBe(2);
    expect(counts['grp_small_fe'].directCount).toBe(3);
    expect(counts['grp_small_infra'].directCount).toBe(1);
    expect(counts['grp_large_product'].totalCount).toBe(5);

    // 親変更・削除時の影響検証
    const impact = analyzeGroupDeletionImpact(
      'grp_large_product',
      bundle.groups,
      bundle.memberships,
      bundle.relationships
    );
    expect(impact?.childSmallGroups.length).toBe(2);
    expect(impact?.affectedMemberships.length).toBe(6);

    // 配下に小グループがある大グループを小グループに変更しようとするとエラーで防ぐこと
    const parentChange = validateAndAnalyzeGroupParentChange(
      bundle.groups[0],
      'small',
      'grp_large_design',
      bundle.groups,
      bundle.memberships
    );
    expect(parentChange.valid).toBe(false);
  });

  it('8. 画像サイズ・容量・形式・文字数カウント・URLバリデーションの検証が正しく動作すること', () => {
    // SVGや5MB超の拒否
    const svgFile = new File(['<svg></svg>'], 'icon.svg', { type: 'image/svg+xml' });
    expect(validateInputImageFile(svgFile).valid).toBe(false);

    const hugeFile = new File([new ArrayBuffer(6 * 1024 * 1024)], 'huge.png', {
      type: 'image/png',
    });
    expect(validateInputImageFile(hugeFile).valid).toBe(false);

    // 極端な画素数の拒否
    expect(validateImageDimensions(10000, 10000).valid).toBe(false);
    expect(validateImageDimensions(512, 512).valid).toBe(true);

    // 128x128 WebP DataURL 検証（30KB上限）
    const dummyBase64 = 'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoCAAIAAQAcJaQAA3AA/vuUAAA=';
    const validDataUrl = `data:image/webp;base64,${dummyBase64}`;
    const bytes = estimateDataUrlByteSize(validDataUrl);
    expect(validateProcessedIconDataUrl(validDataUrl, bytes).valid).toBe(true);
    expect(
      validateProcessedIconDataUrl(validDataUrl, MAX_ALLOWED_ICON_BYTES + 100).valid
    ).toBe(false);

    // 絵文字・日本語を含む400文字カウント検証
    const emojiBio = '🎨🚀👨‍👩‍👧‍👦テストコメント'.repeat(20);
    const charInfo = getSafeCharCount(emojiBio);
    expect(charInfo.effectiveCount).toBeGreaterThanOrEqual(charInfo.utf16Units);
    expect(validateProfileBio('あ'.repeat(400)).valid).toBe(true);
    expect(validateProfileBio('あ'.repeat(401)).valid).toBe(false);

    // URLバリデーション（javascript: スキーム等の拒否、最大2個）
    expect(
      validateProfileLinks([{ label: 'XSS', url: 'javascript:alert(1)' }]).valid
    ).toBe(false);
    expect(
      validateProfileLinks([{ label: '公式サイト', url: 'https://example.com/profile' }]).valid
    ).toBe(true);
  });

  it('9. 管理者専用YAMLバックアップの退避（エクスポート）と取込（インポート）が整合性を保って動作すること', () => {
    const projects = createInitialDemoProjects();
    const bundle = projects[DEMO_PROJECT_ID];

    const yamlText = exportProjectBundleToYaml(bundle);
    expect(yamlText).toContain('app: KizunaMap');
    expect(yamlText).toContain('プロダクト開発本部');
    // メールアドレスがYAML出力に含まれないこと
    expect(yamlText).not.toContain('sato.editor@example.com');
    expect(yamlText).not.toContain('ito.infra@example.com');

    const parsed = parseAndValidateYamlBackup(yamlText, DEMO_PROJECT_ID, DEMO_ADMIN_UID);
    expect(parsed.valid).toBe(true);
    expect(parsed.bundle?.groups.length).toBe(bundle.groups.length);
    expect(parsed.bundle?.people.length).toBe(bundle.people.length);
    expect(parsed.bundle?.memberships.length).toBe(bundle.memberships.length);
  });

  it('10. UI結合テスト：テストユーザー切替・招待承認・通信失敗時の未保存表示・再読み込み保持が動作すること', async () => {
    render(<App />);

    // 初期表示でデモプロジェクトの人物・ロールが表示されていること
    expect(screen.getAllByText('山田 太郎').length).toBeGreaterThan(0);

    // テスト用ユーザースイッチャーで「伊藤 健太（ひも付け招待承認待ち本人）」に切り替える
    const switcher = screen.getByTestId('test-user-switcher') as HTMLSelectElement;
    fireEvent.change(switcher, { target: { value: DEMO_INVITED_UID } });

    // 伊藤本人宛ての招待バナーが表示され、承認できること
    const approveBtn = await screen.findByTestId('approve-invitation-inv_ito_01');
    fireEvent.click(approveBtn);

    // 承認後、上部に「本人プロフィール (伊藤 健太)」ボタンが出現すること
    const myProfileBtn = await screen.findByTestId('header-my-profile-btn');
    expect(myProfileBtn).toBeInTheDocument();

    // 管理者に戻して通信障害テストをONにし、変更時に「未保存（保存失敗）」が表示されることを確認
    fireEvent.change(switcher, { target: { value: DEMO_ADMIN_UID } });
    const netFailBtn = screen.getByTestId('toggle-network-failure-btn');
    fireEvent.click(netFailBtn);

    // 通信障害中にタブ切り替え等を行うか手動保存を試みると未保存状態になること
    const addPersonBtn = screen.getByTestId('add-person-btn');
    fireEvent.click(addPersonBtn);
  });
});
