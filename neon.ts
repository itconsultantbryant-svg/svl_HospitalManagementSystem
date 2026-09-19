import { defineConfig } from "@neon/config/v1";
import * as esbuild from "esbuild";

/**
 * U-HPCMS backend-as-code for Neon:
 * - Lakebase Postgres (always on the branch; DATABASE_URL injected)
 * - Neon Function `api` — Express hospital API next to the database
 *
 * Frontend stays on Vercel. Deploy: `neon auth` → `./scripts/deploy-neon.sh`
 * or `neon deploy --env .env.neon`
 */
export default defineConfig({
  functions: {
    api: {
      name: "U-HPCMS API",
      source: "./backend/functions/api.js",
      // Bundle Express + routes as CJS; stub sql.js (Postgres-only on Neon).
      bundler: async () => {
        const result = await esbuild.build({
          entryPoints: ["./backend/functions/api.js"],
          bundle: true,
          platform: "node",
          target: "node24",
          format: "cjs",
          write: false,
          minify: true,
          packages: "bundle",
          alias: {
            "sql.js": "./backend/functions/empty-stub.js",
          },
          external: ["pg-native"],
        });
        return {
          "index.js": result.outputFiles[0].text,
        };
      },
      env: {
        NODE_ENV: "production",
        DB_TYPE: "postgres",
        JWT_SECRET: process.env.JWT_SECRET ?? "",
        CORS_ORIGIN: process.env.CORS_ORIGIN ?? process.env.FRONTEND_URL ?? "",
        JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? "8h",
        LRD_PER_USD: process.env.LRD_PER_USD ?? "193.5",
      },
      dev: {
        port: 8787,
      },
    },
  },

  branch: (branch) => {
    if (branch.isDefault) {
      return {
        postgres: {
          computeSettings: {
            autoscalingLimitMinCu: 0.25,
            autoscalingLimitMaxCu: 1,
          },
        },
      };
    }
    if (!branch.exists) {
      return {
        ttl: "7d",
        postgres: {
          computeSettings: {
            autoscalingLimitMinCu: 0.25,
            autoscalingLimitMaxCu: 0.25,
            suspendTimeout: "5m",
          },
        },
      };
    }
    return {};
  },
});
