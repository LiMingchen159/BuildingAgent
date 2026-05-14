declare module "ws" {
  import { EventEmitter } from "node:events";
  import { IncomingMessage } from "node:http";
  import { ClientRequestArgs } from "node:http";
  import { ClientRequestOptions } from "node:https";
  import { Duplex } from "node:stream";

  export class WebSocket extends EventEmitter {
    static readonly CONNECTING: 0;
    static readonly OPEN: 1;
    static readonly CLOSING: 2;
    static readonly CLOSED: 3;
    readonly readyState: number;
    readonly OPEN: 1;
    constructor(address: string | URL, options?: ClientRequestArgs | ClientRequestOptions);
    send(data: string | Buffer | ArrayBuffer | ArrayBufferView): void;
    close(code?: number, reason?: string): void;
    terminate(): void;
    on(event: "open", listener: () => void): this;
    on(event: "close", listener: (code: number, reason: Buffer) => void): this;
    on(event: "message", listener: (data: Buffer) => void): this;
    on(event: "error", listener: (error: Error) => void): this;
  }

  export class WebSocketServer extends EventEmitter {
    constructor(options: { noServer: boolean });
    handleUpgrade(
      request: IncomingMessage,
      socket: Duplex,
      head: Buffer,
      callback: (ws: WebSocket) => void
    ): void;
    on(event: "connection", listener: (ws: WebSocket, request: IncomingMessage) => void): this;
  }
}
