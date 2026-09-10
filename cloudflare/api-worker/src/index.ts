import { DurableObject, scheduler } from "cloudflare:workers";

interface Env {
  API_BACKEND: DurableObjectNamespace<ApiBackend>;
  [key: string]: unknown;
}

function stringEnv(env: Env): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter(([, value]) => typeof value === "string"),
  ) as Record<string, string>;
}

export class ApiBackend extends DurableObject<Env> {
  private ready?: Promise<void>;

  constructor(ctx: DurableObjectState, private readonly env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      await ctx.container!.setInactivityTimeout(60 * 60 * 1000);
    });
  }

  private async ensureReady(): Promise<void> {
    const container = this.ctx.container!;
    if (!container.running) {
      container.start({
        enableInternet: true,
        env: {
          PORT: "8080",
          NODE_ENV: "production",
          ...stringEnv(this.env),
        },
      });
    }

    const port = container.getTcpPort(8080);
    let lastError: unknown;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      try {
        const response = await port.fetch("http://container/api/healthz");
        if (response.ok) return;
        lastError = new Error(`healthz returned ${response.status}`);
      } catch (error) {
        lastError = error;
      }
      await scheduler.wait(250);
    }
    throw lastError ?? new Error("Cloudflare API container did not become ready");
  }

  async fetch(request: Request): Promise<Response> {
    if (!this.ctx.container!.running) this.ready = undefined;
    this.ready ??= this.ensureReady().catch((error) => {
      this.ready = undefined;
      throw error;
    });
    await this.ready;
    return this.ctx.container!.getTcpPort(8080).fetch(request);
  }
}

function backend(env: Env) {
  return env.API_BACKEND.getByName("vendorai-production");
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return backend(env).fetch(request);
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      backend(env)
        .fetch(new Request("https://internal.vendorai/api/healthz"))
        .then(() => undefined),
    );
  },
};
