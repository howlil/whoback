export type InstagramCookie = {
  value?: string | null;
};

export type InstagramCookieGetter = (details: {
  url: string;
  name: string;
}) => Promise<InstagramCookie | null | undefined>;

export type ViewerIdentitySource = 'cookie' | 'cached-account' | 'checkpoint';

export type ViewerIdentity = {
  id: string;
  source: ViewerIdentitySource;
};

export async function resolveInstagramViewerId(
  getCookie: InstagramCookieGetter,
  cachedAccountId?: string,
  checkpointAccountId?: string,
): Promise<ViewerIdentity | null> {
  try {
    const cookie = await getCookie({
      url: 'https://www.instagram.com/',
      name: 'ds_user_id',
    });

    const cookieValue = cookie?.value?.trim();
    if (cookieValue) {
      return { id: cookieValue, source: 'cookie' };
    }
  } catch {
    // Cookie access can fail in hardened browser configurations.
  }

  const accountId = cachedAccountId?.trim();
  if (accountId) {
    return { id: accountId, source: 'cached-account' };
  }

  const checkpointId = checkpointAccountId?.trim();
  if (checkpointId) {
    return { id: checkpointId, source: 'checkpoint' };
  }

  return null;
}
