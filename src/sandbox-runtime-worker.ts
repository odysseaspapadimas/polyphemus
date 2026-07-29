import { Sandbox } from "@cloudflare/sandbox";
import {
  handleSandboxRuntimeRequest,
  type SandboxRuntimeEnv,
} from "./sandbox-runtime.ts";

export { Sandbox };

export default {
  fetch(request: Request, env: SandboxRuntimeEnv): Promise<Response> {
    return handleSandboxRuntimeRequest(request, env);
  },
};
