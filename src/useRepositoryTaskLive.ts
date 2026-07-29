import { useQueryClient } from "@tanstack/react-query";
import * as Schema from "effect/Schema";
import { useEffect, useState } from "react";
import {
  RepositoryTaskLiveServerMessageSchema,
  type RepositoryTaskSnapshotLiveMessage,
} from "./domain/repository-task-live.ts";
import type { RepositoryTaskSnapshot } from "./domain/repository-task.ts";

export type RepositoryTaskLiveStatus =
  | "disabled"
  | "connecting"
  | "connected"
  | "disconnected";

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const HEARTBEAT_INTERVAL_MS = 20_000;
const HEARTBEAT_TIMEOUT_MS = 45_000;

export const hasRecoverableRepositoryTaskActivity = (
  snapshot: RepositoryTaskSnapshot | undefined,
): boolean => snapshot !== undefined && (snapshot.activeRunId !== null ||
  snapshot.agentRuns.some((run) => run.publication !== null &&
    run.publication.status !== "complete" && run.publication.status !== "failed"));

export const newerRepositoryTaskSnapshot = (
  current: RepositoryTaskSnapshot | undefined,
  candidate: RepositoryTaskSnapshot,
): RepositoryTaskSnapshot => current !== undefined &&
    current.taskId === candidate.taskId && current.revision > candidate.revision
  ? current
  : candidate;

export const applyNewerRepositoryTaskSnapshot = (
  current: RepositoryTaskSnapshot | undefined,
  message: RepositoryTaskSnapshotLiveMessage,
  expectedTaskId: string,
): RepositoryTaskSnapshot | undefined => {
  if (message.taskId !== expectedTaskId ||
      message.snapshot.taskId !== expectedTaskId ||
      message.revision !== message.snapshot.revision) {
    return current;
  }
  return current === undefined || message.revision > current.revision
    ? message.snapshot
    : current;
};

const decodeMessage = (input: unknown) => {
  try {
    const message = Schema.decodeUnknownSync(RepositoryTaskLiveServerMessageSchema)(input);
    if (message.type === "repository-task.snapshot" &&
        (message.taskId !== message.snapshot.taskId ||
          message.revision !== message.snapshot.revision)) {
      return null;
    }
    return message;
  } catch {
    return null;
  }
};

export const useRepositoryTaskLive = (
  taskId: string | null,
): RepositoryTaskLiveStatus => {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<RepositoryTaskLiveStatus>(
    taskId === null ? "disabled" : "connecting",
  );

  useEffect(() => {
    if (taskId === null) {
      setStatus("disabled");
      return;
    }

    let disposed = false;
    let reconnectAttempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
    let lastServerMessageAt = 0;
    let socket: WebSocket | undefined;

    const refetchAuthoritative = () => {
      void queryClient.refetchQueries({
        queryKey: ["repository-task", taskId],
        type: "active",
      });
    };

    const clearHeartbeat = () => {
      if (heartbeatTimer !== undefined) clearInterval(heartbeatTimer);
      heartbeatTimer = undefined;
    };

    const connect = () => {
      if (disposed) return;
      setStatus(reconnectAttempt === 0 ? "connecting" : "disconnected");
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(
        `${protocol}//${window.location.host}/api/repository-tasks/${encodeURIComponent(taskId)}/live`,
      );

      socket.onopen = () => {
        if (disposed) return;
        lastServerMessageAt = Date.now();
        setStatus("connected");
        refetchAuthoritative();
        clearHeartbeat();
        heartbeatTimer = setInterval(() => {
          if (socket?.readyState !== WebSocket.OPEN) return;
          if (Date.now() - lastServerMessageAt > HEARTBEAT_TIMEOUT_MS) {
            socket.close(4000, "Repository Task live heartbeat timed out");
            return;
          }
          socket.send(JSON.stringify({
            version: 1,
            type: "repository-task.heartbeat",
            sentAt: new Date().toISOString(),
          }));
        }, HEARTBEAT_INTERVAL_MS);
      };

      socket.onmessage = (event) => {
        if (typeof event.data !== "string") return;
        let value: unknown;
        try {
          value = JSON.parse(event.data) as unknown;
        } catch {
          return;
        }
        const message = decodeMessage(value);
        if (message === null) return;
        reconnectAttempt = 0;
        lastServerMessageAt = Date.now();
        if (message.type !== "repository-task.snapshot") return;
        queryClient.setQueryData<RepositoryTaskSnapshot>(
          ["repository-task", taskId],
          (current) => applyNewerRepositoryTaskSnapshot(current, message, taskId),
        );
        queryClient.setQueryData<readonly RepositoryTaskSnapshot[]>(
          ["repository-task-index"],
          (current) => current?.map((snapshot) => snapshot.taskId === taskId
            ? applyNewerRepositoryTaskSnapshot(snapshot, message, taskId) ?? snapshot
            : snapshot),
        );
      };

      socket.onerror = () => socket?.close();
      socket.onclose = () => {
        clearHeartbeat();
        if (disposed) return;
        setStatus("disconnected");
        refetchAuthoritative();
        const delay = Math.min(
          RECONNECT_BASE_MS * (2 ** reconnectAttempt),
          RECONNECT_MAX_MS,
        );
        reconnectAttempt += 1;
        reconnectTimer = setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      disposed = true;
      clearHeartbeat();
      if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
      socket?.close(1000, "Repository Task selection changed");
    };
  }, [queryClient, taskId]);

  return status;
};
