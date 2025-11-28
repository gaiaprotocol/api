import { handleLogin, handleNonce, handleValidateToken, preflightResponse, syncNftOwnershipFromEvents } from '@gaiaprotocol/worker-common';
import { oauth2Callback, oauth2Logout, oauth2Start } from 'cf-oauth';
import { WorkerEntrypoint } from 'cloudflare:workers';
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import { fetchGaiaName } from './db/gaia-names';
import { fetchAndStoreGodsStats } from './db/gods-stats';
import { fetchNftDataByIds } from './db/nft';
import { fetchNotice, fetchNotices } from './db/notice';
import { getPostWithReplies } from './db/post';
import { fetchProfileByAddress, getProfileWithPosts } from './db/profile';
import { handleGetName } from './handlers/get-name';
import { handleGetNames } from './handlers/get-names';
import { handleGetProfile } from './handlers/get-profile';
import { handleGodMetadata } from './handlers/god-metadata';
import { handleGodsStats } from './handlers/gods-stats';
import { handleHeldNftsRequest } from './handlers/held-nfts';
import { handleInitNftOwnership } from './handlers/init-nft-ownership';
import { handleMyName } from './handlers/my-name';
import { handleMyProfile } from './handlers/my-profile';
import { handleNftDataRequest } from './handlers/nft';
import { handleNftDataByIds } from './handlers/nft-by-ids';
import { handleNotices } from './handlers/notice';
import { oauth2LinkWallet } from './handlers/oauth2/link-wallet';
import { oauth2LoginWithIdToken } from './handlers/oauth2/login-with-idtoken';
import { oauth2Me } from './handlers/oauth2/me';
import { oauth2MeByToken } from './handlers/oauth2/me-by-token';
import { oauth2UnlinkWalletBySession } from './handlers/oauth2/unlink-wallet-by-session';
import { oauth2UnlinkWalletByToken } from './handlers/oauth2/unlink-wallet-by-token';
import { handlePostWithReplies } from './handlers/post-with-replies';
import { handleProfileWithPosts } from './handlers/profile-with-posts';
import { handleSaveMetadata } from './handlers/save-metadata';
import { handleSearchNames } from './handlers/search-names';
import { handleSetName } from './handlers/set-name';
import { handleSetProfile } from './handlers/set-profile';

const CLIENT = createPublicClient({ chain: mainnet, transport: http() });
const NFT_ADDRESS = '0x134590ACB661Da2B318BcdE6b39eF5cF8208E372';
const TOKEN_RANGE = { start: 0, end: 3332 };
const BLOCK_STEP = 500;

export default class ApiWorker extends WorkerEntrypoint<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return preflightResponse();
    }

    const url = new URL(request.url);

    if (url.pathname === '/envtype') return new Response(this.env.ENV_TYPE);
    if (url.pathname === '/notices') return handleNotices(this.env);

    // 로그인 관련
    if (url.pathname === '/nonce' && request.method === 'POST') return handleNonce(request, this.env);

    if (url.pathname === '/login/valhalla' && request.method === 'POST') return handleLogin(request, 1, this.env, this.env.VALHALLA_DOMAIN, this.env.VALHALLA_URI);
    if (url.pathname === '/login/personas' && request.method === 'POST') return handleLogin(request, 1, this.env, this.env.PERSONAS_DOMAIN, this.env.PERSONAS_URI);

    if (url.pathname === '/validate-token' && request.method === 'GET') return handleValidateToken(request, this.env);

    // 이름 관련
    if (url.pathname === '/set-name') return handleSetName(request, this.env);
    if (url.pathname === '/get-name') return handleGetName(request, this.env);
    if (url.pathname === '/my-name') return handleMyName(request, this.env);
    if (url.pathname === '/get-names') return handleGetNames(request, this.env);
    if (url.pathname === '/search-names') return handleSearchNames(request, this.env);

    // 프로필 관련
    if (url.pathname === '/set-profile') return handleSetProfile(request, this.env);
    if (url.pathname === '/get-profile') return handleGetProfile(request, this.env);
    if (url.pathname === '/my-profile') return handleMyProfile(request, this.env);

    // NFT 관련
    if (url.pathname === '/init-nft-ownership') return handleInitNftOwnership(request, this.env);
    if (url.pathname.startsWith('/nft/')) return handleNftDataRequest(request, this.env);
    if (url.pathname.startsWith('/god-metadata/')) return handleGodMetadata(request, this.env);
    if (url.pathname.endsWith('/nfts')) return handleHeldNftsRequest(request, this.env);
    if (url.pathname === '/nfts/by-ids') return handleNftDataByIds(request, this.env);
    if (url.pathname === '/save-metadata') return handleSaveMetadata(request, this.env);
    if (url.pathname === '/gods-stats') return handleGodsStats(request, this.env);

    // 🔹 프로필 + 포스트
    if (url.pathname === '/profile-with-posts') {
      return handleProfileWithPosts(request, this.env);
    }

    // 🔹 포스트 + 댓글
    if (url.pathname === '/post-with-replies') {
      return handlePostWithReplies(request, this.env);
    }

    // OAuth2
    const oauth2Providers = {
      google: {
        client_id: this.env.GOOGLE_CLIENT_ID,
        client_secret: this.env.GOOGLE_CLIENT_SECRET,
        auth_url: 'https://accounts.google.com/o/oauth2/v2/auth',
        token_url: 'https://oauth2.googleapis.com/token',
        userinfo_url: 'https://openidconnect.googleapis.com/v1/userinfo',
        scope: 'openid email profile',
        oidc: {
          issuer: 'https://accounts.google.com',
          discovery: 'https://accounts.google.com/.well-known/openid-configuration',
          require_email_verified: false,
        }
      },
    }

    if (url.pathname === '/oauth2/start/valhalla/google') return oauth2Start(request, this.env, 'google', oauth2Providers, this.env.VALHALLA_GOOGLE_REDIRECT_URI);
    if (url.pathname === '/oauth2/callback/valhalla/google') return oauth2Callback(request, this.env, 'google', oauth2Providers, this.env.VALHALLA_GOOGLE_REDIRECT_URI, this.env.VALHALLA_URI);
    if (url.pathname === '/oauth2/start/personas/google') return oauth2Start(request, this.env, 'google', oauth2Providers, this.env.PERSONAS_GOOGLE_REDIRECT_URI);
    if (url.pathname === '/oauth2/callback/personas/google') return oauth2Callback(request, this.env, 'google', oauth2Providers, this.env.PERSONAS_GOOGLE_REDIRECT_URI, this.env.PERSONAS_URI);

    if (url.pathname === '/oauth2/login-with-idtoken/google') return oauth2LoginWithIdToken(request, this.env, oauth2Providers, 'google')
    if (url.pathname === '/oauth2/me-by-token/google') return oauth2MeByToken(request, this.env, 'google')

    if (url.pathname === '/oauth2/me') return oauth2Me(request, this.env, oauth2Providers)
    if (url.pathname === '/oauth2/logout') return oauth2Logout(request, this.env, oauth2Providers)
    if (url.pathname === '/oauth2/link-wallet') return oauth2LinkWallet(request, this.env)
    if (url.pathname === '/oauth2/unlink-wallet-by-token') return oauth2UnlinkWalletByToken(request, this.env)
    if (url.pathname === '/oauth2/unlink-wallet-by-session') return oauth2UnlinkWalletBySession(request, this.env)

    return new Response('Not Found', { status: 404 });
  }

  async scheduled(controller: ScheduledController) {
    if (this.env.ENV_TYPE === 'dev' || this.env.ENV_TYPE === 'testnet') return;

    if (controller.cron === "*/1 * * * *") {
      // 매 분마다 실행할 작업
      await syncNftOwnershipFromEvents(this.env, CLIENT, { [NFT_ADDRESS]: TOKEN_RANGE }, BLOCK_STEP);
    }

    if (controller.cron === "0 * * * *") {
      // 매시 정각마다 실행할 작업
      await fetchAndStoreGodsStats(this.env);
    }
  }

  // export functions
  fetchNotices() { return fetchNotices(this.env); }
  fetchNotice(id: number) { return fetchNotice(this.env, id); }
  fetchNftDataByIds(ids: string[]) { return fetchNftDataByIds(this.env, ids) }
  fetchGaiaName(name: string) { return fetchGaiaName(this.env, name) }
  fetchProfileByAddress(address: string) { return fetchProfileByAddress(this.env, address) }
  getProfileWithPosts(address: string) { return getProfileWithPosts(this.env, address) }
  getPostWithReplies(id: number) { return getPostWithReplies(this.env, id) }
};
