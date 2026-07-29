export const FIXTURE_REPOSITORY =
  "https://github.com/odysseaspapadimas/polyphemus-spike-fixture";
export const FIXTURE_BASE_SHA =
  "3ef76abc46761bee1faad7335959d2f856452c21";
export const FIXTURE_TASK =
  "mergeRanges can incorrectly split covered intervals when one range is fully contained by an earlier range. Preserve the complete covered extent while retaining the current API and input immutability.";

export const REPOSITORY_DIR = "/workspace/repository";
export const GIT_METADATA_DIR = "/workspace/git-metadata";
export const GIT_EVIDENCE_DIR = "/workspace/git-evidence";
export const GIT_EVIDENCE_INDEX = `${GIT_EVIDENCE_DIR}/index`;
export const GIT_EVIDENCE_OBJECTS = `${GIT_EVIDENCE_DIR}/objects`;
export const CONTROL_DIR = "/workspace/control";
export const RESULT_DIR = "/workspace/result";
export const PACKAGE_MANAGER_CONFIG_DIR = "/workspace/package-manager-config";
export const PI_RESULT_PATH = `${RESULT_DIR}/pi-result.json`;
export const LEGACY_PI_RESULT_PATH = `${CONTROL_DIR}/pi-result.json`;
export const AGENT_STATE_DIR = "/home/polyphemus-agent/run";
export const MODEL_PROXY_TOKEN_PATH = `${AGENT_STATE_DIR}/model-proxy-token`;
export const HELD_OUT_DIR = "/workspace/held-out";
export const BASE_SHA_PATH = `${CONTROL_DIR}/base-sha.txt`;
export const REPOSITORY_URL_PATH = `${CONTROL_DIR}/repository-url.txt`;
export const VALIDATION_POLICY_PATH = `${CONTROL_DIR}/validation-policy.json`;
export const HELD_OUT_TEST_PATH = `${HELD_OUT_DIR}/merge-ranges.acceptance.test.ts`;

export const MAX_EXCERPT_CHARACTERS = 12_000;
