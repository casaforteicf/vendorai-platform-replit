declare module "cors" {
  import type { RequestHandler } from "express";

  export type CorsOriginCallback = (error: Error | null, allow?: boolean) => void;
  export interface CorsOptions {
    origin?: boolean | string | RegExp | Array<boolean | string | RegExp> |
      ((origin: string | undefined, callback: CorsOriginCallback) => void);
    methods?: string | string[];
    allowedHeaders?: string | string[];
    exposedHeaders?: string | string[];
    credentials?: boolean;
    maxAge?: number;
    preflightContinue?: boolean;
    optionsSuccessStatus?: number;
  }

  export default function cors(options?: CorsOptions): RequestHandler;
}
