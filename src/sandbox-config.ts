export const FIXTURE_REPOSITORY =
  "https://github.com/odysseaspapadimas/polyphemus-spike-fixture";
export const FIXTURE_BASE_SHA =
  "3ef76abc46761bee1faad7335959d2f856452c21";
export const FIXTURE_TASK =
  "mergeRanges can incorrectly split covered intervals when one range is fully contained by an earlier range. Preserve the complete covered extent while retaining the current API and input immutability.";

export const REPOSITORY_DIR = "/workspace/repository";
export const CONTROL_DIR = "/workspace/control";
export const PI_RESULT_PATH = `${CONTROL_DIR}/pi-result.json`;
export const BASE_SHA_PATH = `${CONTROL_DIR}/base-sha.txt`;
export const REPOSITORY_URL_PATH = `${CONTROL_DIR}/repository-url.txt`;
export const VALIDATION_POLICY_PATH = `${CONTROL_DIR}/validation-policy.json`;
export const HELD_OUT_TEST_PATH = `${CONTROL_DIR}/merge-ranges.acceptance.test.ts`;

export const MAX_EXCERPT_CHARACTERS = 12_000;
