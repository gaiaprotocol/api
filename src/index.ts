// src/index.ts
// Entry point router for the API Worker.
// Every request is dispatched here and routed to the correct handler.

import {
  handleLogin,
  handleNonce,
  handleValidateToken,
  preflightResponse,
  syncNftOwnershipFromEvents,
} from '@gaiaprotocol/worker-common';

import { oauth2Callback, oauth2Logout, oauth2Start } from 'cf-oauth';
import { WorkerEntrypoint } from 'cloudflare:workers';
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';

// DB fetchers
import { fetchGaiaName } from './db/gaia-names';
import { fetchAndStoreGodsStats } from './db/gods-stats';
import { fetchNftDataByIds } from './db/nft';
import { fetchNotice, fetchNotices } from './db/notice';
import { getPersonaPostWithReplies } from './db/persona/post';
import { fetchProfileByAddress } from './db/profile';

// Core handlers
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
import { handleSaveMetadata } from './handlers/save-metadata';
import { handleSearchNames } from './handlers/search-names';
import { handleSetName } from './handlers/set-name';
import { handleSetProfile } from './handlers/set-profile';

// OAuth handlers
import { oauth2LinkWallet } from './handlers/oauth2/link-wallet';
import { oauth2LoginWithIdToken } from './handlers/oauth2/login-with-idtoken';
import { oauth2Me } from './handlers/oauth2/me';
import { oauth2MeByToken } from './handlers/oauth2/me-by-token';
import { oauth2UnlinkWalletBySession } from './handlers/oauth2/unlink-wallet-by-session';
import { oauth2UnlinkWalletByToken } from './handlers/oauth2/unlink-wallet-by-token';

// Persona-specific handlers
import { getPersonaProfile, handlePersonaProfile } from './handlers/persona-profile';
import { handleBookmarkPersonaPost, handleUnbookmarkPersonaPost } from './handlers/persona/bookmark-post';
import { handleCreatePersonaPost } from './handlers/persona/create-post';
import { handleDeletePersonaPost } from './handlers/persona/delete-post';
import { handlePersonaHoldingReward } from './handlers/persona/holding-reward';
import { handleLikePersonaPost, handleUnlikePersonaPost } from './handlers/persona/like-post';
import { handleListPersonaPosts } from './handlers/persona/list-posts';
import { handlePersonaPostWithReplies } from './handlers/persona/post-with-replies';
import { handleUpdatePersonaPost } from './handlers/persona/update-post';

// Persona fragment handler
import { handleHeldPersonaFragments } from './handlers/persona/held-fragments';

// Persona chat & Durable Object
import { handlePersonaChatWebSocket } from './do/persona-chat-room';

// ✅ Persona chat REST handlers
import {
  handleCreatePersonaChatMessage,
  handleListPersonaChatMessages,
} from './handlers/persona/chat-messages';
import {
  handleListPersonaChatReactions,
  handleTogglePersonaChatReaction,
} from './handlers/persona/chat-reactions';

// Sync workers
import { syncPersonaFragmentTrades } from './sync/persona-fragment-trades';

const MAINNET_CLIENT = createPublicClient({ chain: mainnet, transport: http() });
const GODS_ADDRESS = '0x134590ACB661Da2B318BcdE6b39eF5cF8208E372';
const GODS_TOKEN_RANGE = { start: 0, end: 3332 };
const NFT_OWNERSHIP_SYNC_BLOCK_STEP = 500;

// ----------------------------------------------------------------------------------------------------
// Worker Entrypoint
// ----------------------------------------------------------------------------------------------------
export default class ApiWorker extends WorkerEntrypoint<Env> {
  /**
   * Main HTTP router.
   * Every endpoint is explicitly matched by path + method.
   */
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') return preflightResponse();

    const url = new URL(request.url);

    // --------------------------------------------------
    // Basic / utility endpoints
    // --------------------------------------------------
    if (url.pathname === '/envtype') return new Response(this.env.ENV_TYPE);
    if (url.pathname === '/notices') return handleNotices(this.env);

    // --------------------------------------------------
    // Authentication & Token
    // --------------------------------------------------
    if (url.pathname === '/nonce' && request.method === 'POST')
      return handleNonce(request, this.env);

    if (url.pathname === '/login/valhalla' && request.method === 'POST')
      return handleLogin(
        request,
        1,
        this.env,
        this.env.VALHALLA_DOMAIN,
        this.env.VALHALLA_URI,
      );

    if (url.pathname === '/login/personas' && request.method === 'POST')
      return handleLogin(
        request,
        1,
        this.env,
        this.env.PERSONAS_DOMAIN,
        this.env.PERSONAS_URI,
      );

    if (url.pathname === '/validate-token' && request.method === 'GET')
      return handleValidateToken(request, this.env);

    // --------------------------------------------------
    // Name API
    // --------------------------------------------------
    if (url.pathname === '/set-name') return handleSetName(request, this.env);
    if (url.pathname === '/get-name') return handleGetName(request, this.env);
    if (url.pathname === '/my-name') return handleMyName(request, this.env);
    if (url.pathname === '/get-names') return handleGetNames(request, this.env);
    if (url.pathname === '/search-names') return handleSearchNames(request, this.env);

    // --------------------------------------------------
    // Profile API
    // --------------------------------------------------
    if (url.pathname === '/set-profile') return handleSetProfile(request, this.env);
    if (url.pathname === '/get-profile') return handleGetProfile(request, this.env);
    if (url.pathname === '/my-profile') return handleMyProfile(request, this.env);

    // --------------------------------------------------
    // NFT API
    // --------------------------------------------------
    if (url.pathname === '/init-nft-ownership')
      return handleInitNftOwnership(request, this.env);
    if (url.pathname.startsWith('/nft/'))
      return handleNftDataRequest(request, this.env);
    if (url.pathname.startsWith('/god-metadata/'))
      return handleGodMetadata(request, this.env);
    if (url.pathname.endsWith('/nfts'))
      return handleHeldNftsRequest(request, this.env);
    if (url.pathname === '/nfts/by-ids')
      return handleNftDataByIds(request, this.env);
    if (url.pathname === '/save-metadata')
      return handleSaveMetadata(request, this.env);
    if (url.pathname === '/gods-stats')
      return handleGodsStats(request, this.env);

    // --------------------------------------------------
    // Persona Profile / Posts / Fragment Ownership
    // --------------------------------------------------
    if (url.pathname === '/persona-profile')
      return handlePersonaProfile(request, this.env);

    if (url.pathname === '/persona/held-fragments' && request.method === 'GET')
      return handleHeldPersonaFragments(request, this.env);

    // Persona posts
    if (url.pathname === '/persona/posts' && request.method === 'GET')
      return handleListPersonaPosts(request, this.env);

    if (url.pathname === '/persona/posts' && request.method === 'POST')
      return handleCreatePersonaPost(request, this.env);

    if (url.pathname === '/persona/posts/update' && request.method === 'POST')
      return handleUpdatePersonaPost(request, this.env);

    if (url.pathname === '/persona/posts/delete' && request.method === 'POST')
      return handleDeletePersonaPost(request, this.env);

    if (url.pathname === '/persona/post-with-replies' && request.method === 'GET')
      return handlePersonaPostWithReplies(request, this.env);

    if (url.pathname === '/persona/posts/like' && request.method === 'POST')
      return handleLikePersonaPost(request, this.env);

    if (url.pathname === '/persona/posts/unlike' && request.method === 'POST')
      return handleUnlikePersonaPost(request, this.env);

    if (url.pathname === '/persona/posts/bookmark' && request.method === 'POST')
      return handleBookmarkPersonaPost(request, this.env);

    if (url.pathname === '/persona/posts/unbookmark' && request.method === 'POST')
      return handleUnbookmarkPersonaPost(request, this.env);

    if (url.pathname === '/persona/holding-reward' && request.method === 'GET')
      return handlePersonaHoldingReward(request, this.env);

    // --------------------------------------------------
    // Persona Chat REST API
    //   These paths are used by the frontend:
    //     GET  /persona/chat/messages
    //     POST /persona/chat/messages
    //     GET  /persona/chat/reactions
    //     POST /persona/chat/reactions/toggle
    // --------------------------------------------------
    if (url.pathname === '/persona/chat/messages' && request.method === 'GET')
      return handleListPersonaChatMessages(request, this.env);

    if (url.pathname === '/persona/chat/messages' && request.method === 'POST')
      return handleCreatePersonaChatMessage(request, this.env);

    if (url.pathname === '/persona/chat/reactions' && request.method === 'GET')
      return handleListPersonaChatReactions(request, this.env);

    if (url.pathname === '/persona/chat/reactions/toggle' && request.method === 'POST')
      return handleTogglePersonaChatReaction(request, this.env);

    // --------------------------------------------------
    // Persona Chat WebSocket (Durable Object)
    // --------------------------------------------------
    if (url.pathname === '/persona/chat/ws' && request.method === 'GET') {
      return handlePersonaChatWebSocket(request, this.env);
    }

    // --------------------------------------------------
    // OAuth2
    // --------------------------------------------------
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
        },
      },
    };

    if (url.pathname === '/oauth2/start/valhalla/google')
      return oauth2Start(
        request,
        this.env,
        'google',
        oauth2Providers,
        this.env.VALHALLA_GOOGLE_REDIRECT_URI,
      );

    if (url.pathname === '/oauth2/callback/valhalla/google')
      return oauth2Callback(
        request,
        this.env,
        'google',
        oauth2Providers,
        this.env.VALHALLA_GOOGLE_REDIRECT_URI,
        this.env.VALHALLA_URI,
      );

    if (url.pathname === '/oauth2/start/personas/google')
      return oauth2Start(
        request,
        this.env,
        'google',
        oauth2Providers,
        this.env.PERSONAS_GOOGLE_REDIRECT_URI,
      );

    if (url.pathname === '/oauth2/callback/personas/google')
      return oauth2Callback(
        request,
        this.env,
        'google',
        oauth2Providers,
        this.env.PERSONAS_GOOGLE_REDIRECT_URI,
        this.env.PERSONAS_URI,
      );

    if (url.pathname === '/oauth2/login-with-idtoken/google')
      return oauth2LoginWithIdToken(request, this.env, oauth2Providers, 'google');

    if (url.pathname === '/oauth2/me-by-token/google')
      return oauth2MeByToken(request, this.env, 'google');

    if (url.pathname === '/oauth2/me')
      return oauth2Me(request, this.env, oauth2Providers);

    if (url.pathname === '/oauth2/logout')
      return oauth2Logout(request, this.env, oauth2Providers);

    if (url.pathname === '/oauth2/link-wallet')
      return oauth2LinkWallet(request, this.env);

    if (url.pathname === '/oauth2/unlink-wallet-by-token')
      return oauth2UnlinkWalletByToken(request, this.env);

    if (url.pathname === '/oauth2/unlink-wallet-by-session')
      return oauth2UnlinkWalletBySession(request, this.env);

    return new Response('Not Found', { status: 404 });
  }

  /**
   * Scheduled cron tasks (for sync jobs).
   */
  async scheduled(controller: ScheduledController) {
    const envType: string = this.env.ENV_TYPE;

    if (controller.cron === '*/1 * * * *') {
      if (envType === 'prod') {
        await syncNftOwnershipFromEvents(
          this.env,
          MAINNET_CLIENT,
          { [GODS_ADDRESS]: GODS_TOKEN_RANGE },
          NFT_OWNERSHIP_SYNC_BLOCK_STEP,
        );
      }

      if (envType === 'dev' || envType === 'testnet') {
        await syncPersonaFragmentTrades(this.env);
      }
    }

    if (controller.cron === '0 * * * *') {
      if (envType === 'prod') {
        await fetchAndStoreGodsStats(this.env);
      }
    }
  }

  // Internal helper functions for cross-worker usage
  fetchNotices() {
    return fetchNotices(this.env);
  }
  fetchNotice(id: number) {
    return fetchNotice(this.env, id);
  }
  fetchNftDataByIds(ids: string[]) {
    return fetchNftDataByIds(this.env, ids);
  }
  fetchGaiaName(name: string) {
    return fetchGaiaName(this.env, name);
  }
  fetchProfileByAddress(address: string) {
    return fetchProfileByAddress(this.env, address);
  }
  getPersonaProfile(address: string) {
    return getPersonaProfile(this.env, address);
  }
  getPersonaPostWithReplies(postId: number) {
    return getPersonaPostWithReplies(this.env, postId);
  }
}

// ----------------------------------------------------------------------------------------------------
// Durable Object export (must match wrangler.toml class_name)
// ----------------------------------------------------------------------------------------------------
export { PersonaChatRoomDO } from './do/persona-chat-room';
