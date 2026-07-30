import {
  handleSandboxRuntimeRequest,
  type SandboxRuntimeEnv,
} from "./sandbox-runtime.ts";

export { Sandbox } from "./Sandbox.ts";

export default {
  fetch(request: Request, env: SandboxRuntimeEnv): Promise<Response> {
    return handleSandboxRuntimeRequest(request, env);
  },
};
