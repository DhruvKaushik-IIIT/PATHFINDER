// Shared by hello-meta.ts / hello-baseten.ts. Prints status + reply, never the key.
import { hasKey, type Provider } from "../src/lib/ai/clients.ts";
import { providerHealth, sayHello } from "../src/lib/ai/router.ts";

export async function hello(provider: Provider): Promise<void> {
  console.log(`${provider} key: ${hasKey(provider) ? "set" : "missing"}`);
  const t0 = Date.now();
  const r = await sayHello(provider);
  const ms = Date.now() - t0;
  if (r.data !== null) {
    console.log(`ok · ${r.model ?? r.source} · ${ms} ms`);
    console.log(`reply: ${r.data}`);
  } else {
    console.log(`FAILED · ${ms} ms`);
    console.log(`reason: ${r.degraded}`);
  }
  console.log(`health now: ${provider}=${providerHealth(provider)}`);
  process.exitCode = r.data !== null ? 0 : 1;
}
