import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { errorHandler, notFoundHandler } from "./common/error-handler.js";
import { env } from "./lib/env.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { usersRouter } from "./modules/users/users.routes.js";
import { rolesRouter } from "./modules/roles/roles.routes.js";
import { virtualMachinesRouter } from "./modules/virtual-machines/vm.routes.js";
import { hypervisorsRouter } from "./modules/hypervisors/hypervisors.routes.js";
import { groupsRouter } from "./modules/groups/groups.routes.js";
import { storageRouter } from "./modules/storage/storage.routes.js";
import { templatesRouter } from "./modules/templates/templates.routes.js";
import { isosRouter } from "./modules/isos/isos.routes.js";
import { networksRouter } from "./modules/networks/networks.routes.js";
import { remoteConsoleRouter } from "./modules/remote-console/remote-console.routes.js";
import { auditLogsRouter } from "./modules/audit-logs/audit-logs.routes.js";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes.js";
import { settingsRouter } from "./modules/settings/settings.routes.js";

export const app = express();

app.set("trust proxy", true);
app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true
  })
);
app.use(morgan("dev"));
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "hyperdesk-api"
  });
});

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/users", usersRouter);
app.use("/api/v1/roles", rolesRouter);
app.use("/api/v1/groups", groupsRouter);
app.use("/api/v1/virtual-machines", virtualMachinesRouter);
app.use("/api/v1/hypervisors", hypervisorsRouter);
app.use("/api/v1/storage", storageRouter);
app.use("/api/v1/templates", templatesRouter);
app.use("/api/v1/isos", isosRouter);
app.use("/api/v1/networks", networksRouter);
app.use("/api/v1/remote-console", remoteConsoleRouter);
app.use("/api/v1/audit-logs", auditLogsRouter);
app.use("/api/v1/dashboard", dashboardRouter);
app.use("/api/v1/settings", settingsRouter);

app.use(notFoundHandler);
app.use(errorHandler);
