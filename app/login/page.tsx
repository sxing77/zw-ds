import AuthForm from '@/components/AuthForm';
import CommercePage from '@/components/CommercePage';
import { currentUser, safeReturn } from '@/lib/commerce/auth';
import { commerceEnabled, googleLoginEnabled, localTest } from '@/lib/commerce/config';

export const dynamic = 'force-dynamic';
export const metadata = { title: '登录与注册 · 紫微命盘', robots: { index: false } };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ return?: string; login?: string }>;
}) {
  const enabled = commerceEnabled();
  const user = enabled ? await currentUser() : null;
  const params = await searchParams;
  const returnTo = safeReturn(params.return);

  return (
    <CommercePage title="账号登录与注册">
      <AuthForm
        enabled={enabled}
        googleEnabled={googleLoginEnabled()}
        localTest={localTest()}
        returnTo={returnTo}
        loginFailed={params.login === 'failed'}
        currentEmail={user?.email}
      />
    </CommercePage>
  );
}
