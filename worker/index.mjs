import { Container, getContainer } from '@cloudflare/containers';

// Secrets and config forwarded from the Worker into the container process.
// Set them with `wrangler secret put <NAME>`; see README for the full list.
const FORWARDED_ENV = [
    'AUTH0_DOMAIN',
    'AUTH0_CLIENT_ID',
    'AUTH0_CLIENT_SECRET',
    'AUTH0_CALLBACK_URL',
    'APP_BASE_URL',
    'SESSION_SECRET',
    'ENABLE_PKCE'
];

export class OAuthDemoContainer extends Container {
    defaultPort = 3000;

    // Sessions and the flow event log live in the container's memory, so sleeping
    // ends them: anyone mid-login is dropped. Keep the idle window generous enough
    // that a demo survives a pause. Moving sessions to KV or a Durable Object is
    // what would make this genuinely durable.
    sleepAfter = '30m';

    constructor(ctx, env) {
        super(ctx, env);

        // envVars is a plain instance field on the base class, so it has to be
        // assigned here rather than declared as a getter, which the base
        // constructor's own field initializer would shadow.
        const forwarded = { NODE_ENV: 'production', PORT: '3000' };
        for (const key of FORWARDED_ENV) {
            const value = env[key];
            if (typeof value === 'string' && value !== '') forwarded[key] = value;
        }
        this.envVars = forwarded;
    }

    onError(error) {
        console.error('Container error:', error);
    }
}

export default {
    async fetch(request, env) {
        // One named instance for the whole app. express-session's store and the
        // flow event log are both in-process, so every request — including the
        // WebSocket upgrade — has to reach the same container. Do not switch to
        // getRandom() or raise max_instances without moving session state to a
        // shared store first; logins would fail unpredictably.
        //
        // Container.fetch() detects the Upgrade header and proxies the socket
        // bidirectionally. containerFetch() does not support WebSockets.
        return getContainer(env.OAUTH_DEMO, 'oauth-demo').fetch(request);
    }
};
