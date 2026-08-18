import type { NextFunction, Request, Response } from "express";
import { db, eq, usersTable } from "@workspace/db";
import {
  publishNotification,
  type NotificationEvent,
} from "./notificationService";

type Draft = Omit<NotificationEvent, "organizationId" | "eventKey"> & {
  keyPart?: string;
};
const clean = (v: any) => String(v ?? "").trim();
const ref = (body: any) =>
  clean(
    body?.movementNumber ||
      body?.chamberName ||
      body?.taskCode ||
      body?.batchNumber ||
      body?.batchCode ||
      body?.poNumber ||
      body?.prNumber ||
      body?.grnNumber ||
      body?.invoiceNumber ||
      body?.returnNumber ||
      body?.quotationNumber ||
      body?.documentNumber ||
      body?.orderCode ||
      body?.title ||
      body?.name ||
      body?.id,
  );
const entityId = (body: any, req: Request) =>
  clean(
    body?.id ||
      req.params?.id ||
      req.body?.id ||
      req.path.match(
        /\/(?:batches|growing-batches|tasks|chambers)\/(\d+)/,
      )?.[1] ||
      /^\/api\/sales\/(\d+)$/.exec(req.path)?.[1] ||
      ref(body),
  );
const label = (body: any, fallback: string) => ref(body) || fallback;
const state = (body: any, req: Request) =>
  clean(
    body?.status ||
      req.body?.status ||
      req.body?.decision ||
      req.path.match(
        /\/(approve|reject|send|confirm|complete|dispatch|start|pause)$/,
      )?.[1],
  ).toLowerCase();

function events(req: Request, body: any): Draft[] {
  const p = req.path.toLowerCase(),
    method = req.method,
    id = entityId(body, req),
    status = state(body, req),
    at = new Date().toLocaleString("en-IN");
  const event = (
    permissionKey: string,
    eventType: string,
    title: string,
    message: string,
    navigationUrl: string,
    sourceModule = permissionKey.split(".")[0],
    extra: Partial<Draft> = {},
  ): Draft => ({
    permissionKey,
    eventType,
    sourceModule,
    targetModule: sourceModule,
    submodule: permissionKey.split(".").slice(1).join("."),
    title,
    message,
    navigationUrl,
    sourceEntityId: id,
    sourceReference: ref(body),
    keyPart: clean(body?.updatedAt || body?.createdAt || status || id),
    ...extra,
  });
  if (method === "POST" && p === "/api/inventory/movements")
    return [
      event(
        "inventory.stock.notification",
        "STOCK_MOVEMENT_CREATED",
        "Stock movement completed",
        `Stock movement ${label(body, id)} was recorded at ${at}.`,
        "/inventory",
      ),
    ];
  if (
    method === "POST" &&
    p.includes("/api/assets/") &&
    p.endsWith("/allocate")
  )
    return [
      event(
        "inventory.assets.notification",
        "ASSET_ALLOCATED",
        "Asset allocated",
        `${label(body, "Asset")} was allocated at ${at}.`,
        "/inventory",
      ),
    ];
  if (
    method === "POST" &&
    p.includes("/api/assets/allocations/") &&
    p.endsWith("/deallocate")
  )
    return [
      event(
        "inventory.assets.notification",
        "ASSET_DEALLOCATED",
        "Asset deallocated",
        `${label(body, "Asset")} was deallocated at ${at}.`,
        "/inventory",
      ),
    ];
  const masters: [[string, string, string, string]] | any = [
    [
      /^\/api\/(vault\/item-names|materials)\/?$/,
      "inventory.materials.notification",
      "ITEM_CREATED",
      "Item created",
    ],
    [
      /^\/api\/categories\/?$/,
      "inventory.categories.notification",
      "CATEGORY_CREATED",
      "Category created",
    ],
    [
      /^\/api\/services\/?$/,
      "inventory.materials.notification",
      "SERVICE_CREATED",
      "Service created",
    ],
    [
      /^\/api\/vault\/locations\/?$/,
      "inventory.warehouses.notification",
      "WAREHOUSE_CREATED",
      "Warehouse created",
    ],
  ];
  if (method === "POST")
    for (const [pattern, permission, type, title] of masters)
      if (pattern.test(p))
        return [
          event(
            permission,
            type,
            title,
            `${label(body, title)} was created at ${at}.`,
            "/inventory",
          ),
        ];
  const flex = p.match(
    /^\/api\/flex\/(purchase-requests|purchase-orders|goods-receipts|purchase-invoices|purchase-returns)(?:\/([^/]+))?/,
  );
  if (flex && (method === "POST" || method === "PATCH")) {
    if (
      method === "PATCH" &&
      req.body?.status == null &&
      !/\/(approve|reject|send|confirm|complete|dispatch)$/.test(p)
    )
      return [];
    const map: any = {
      "purchase-requests": [
        "flex.purchase_requests.notification",
        "PURCHASE_REQUEST",
        "Purchase request",
        "/flex/purchase-requests",
      ],
      "purchase-orders": [
        "flex.purchase_orders.notification",
        "PURCHASE_ORDER",
        "Purchase order",
        "/flex/purchase-orders",
      ],
      "goods-receipts": [
        "flex.goods_receipts.notification",
        "GOODS_RECEIPT",
        "Goods receipt",
        "/flex/goods-receipts",
      ],
      "purchase-invoices": [
        "flex.purchase_invoices.notification",
        "PURCHASE_INVOICE",
        "Purchase invoice",
        "/flex/purchase-invoices",
      ],
      "purchase-returns": [
        "flex.purchase_returns.notification",
        "PURCHASE_RETURN",
        "Purchase return",
        "/flex/purchase-returns",
      ],
    };
    const m = map[flex[1]],
      action = status || "created";
    const out = [
      event(
        m[0],
        `${m[1]}_${action.toUpperCase().replace(/\W+/g, "_")}`,
        `${m[2]} ${action}`,
        `${label(body, m[2])} was ${action} at ${at}.`,
        m[3],
        "flex",
      ),
    ];
    if (flex[1] === "purchase-invoices" && method === "POST")
      out.push(
        event(
          "accounts.accounts_payable.notification",
          "ACCOUNTS_PAYABLE_CREATED",
          "Accounts payable created",
          `${label(body, "Purchase invoice")} created an Accounts Payable entry.`,
          "/accounts",
          "accounts",
        ),
      );
    return out;
  }
  if (
    (method === "POST" && p === "/api/sales") ||
    ((method === "PATCH" || method === "PUT") && /^\/api\/sales\/\d+$/.test(p))
  ) {
    const action = status || "created";
    return [
      event(
        "sales.quotations.notification",
        `SALES_ORDER_${action.toUpperCase()}`,
        `Sales order ${action}`,
        `${label(body, "Sales order")} was ${action} at ${at}.`,
        "/sales",
        "sales",
      ),
    ];
  }
  const sales = p.match(
    /^\/api\/sales\/(quotations|proforma[^/]*|challans|invoices|returns)(?:\/([^/]+))?/,
  );
  if (sales && (method === "POST" || method === "PATCH" || method === "PUT")) {
    if (
      method !== "POST" &&
      req.body?.status == null &&
      !/\/(approve|reject|send|complete)$/.test(p)
    )
      return [];
    const map: any = {
      quotations: ["sales.quotations.notification", "Quotation"],
      challans: ["sales.delivery_challans.notification", "Delivery challan"],
      invoices: ["sales.invoices.notification", "Sales invoice"],
      returns: ["sales.returns.notification", "Sales return"],
    };
    const m = sales[1].startsWith("proforma")
        ? ["sales.proforma_invoices.notification", "Proforma invoice"]
        : map[sales[1]],
      action = status || "created";
    const out = [
      event(
        m[0],
        `SALES_${sales[1].toUpperCase()}_${action.toUpperCase()}`,
        `${m[1]} ${action}`,
        `${label(body, m[1])} was ${action} at ${at}.`,
        "/sales",
        "sales",
      ),
    ];
    if (sales[1] === "returns" && p.endsWith("/issue-credit"))
      out.push(
        event(
          "accounts.accounts_receivable.notification",
          "SALES_CREDIT_NOTE_CREATED",
          "Sales credit note created",
          `${label(body, "Sales return")} created a credit-note adjustment in Accounts Receivable.`,
          "/accounts",
          "accounts",
        ),
      );
    if (
      sales[1] === "invoices" &&
      ["created", "complete", "completed", "approved"].includes(action)
    )
      out.push(
        event(
          "accounts.accounts_receivable.notification",
          "ACCOUNTS_RECEIVABLE_CREATED",
          "Accounts receivable created",
          `${label(body, "Sales invoice")} created or updated Accounts Receivable.`,
          "/accounts",
          "accounts",
        ),
      );
    return out;
  }
  const account = p.match(/^\/api\/accounts\/(coa|journal-entries|ap|ar)/);
  if (account && method === "POST") {
    const map: Record<string, [string, string]> = {
      coa: ["accounts.chart_of_accounts.notification", "Account created"],
      "journal-entries": [
        "accounts.journal_entries.notification",
        "Journal entry created",
      ],
      ap: [
        "accounts.accounts_payable.notification",
        `Accounts payable ${p.endsWith("/approve") ? "approved" : p.endsWith("/reject") ? "rejected" : "created"}`,
      ],
      ar: [
        "accounts.accounts_receivable.notification",
        `Accounts receivable ${p.endsWith("/approve") ? "approved" : p.endsWith("/reject") ? "rejected" : "created"}`,
      ],
    };
    const [permission, title] = map[account[1]];
    return [
      event(
        permission,
        title.toUpperCase().replace(/\W+/g, "_"),
        title,
        `${label(body, title)} at ${at}.`,
        "/accounts",
        "accounts",
      ),
    ];
  }
  if (
    method === "POST" &&
    /^\/api\/sales\/(payments|receivable-adjustments)/.test(p)
  ) {
    return [
      event(
        "accounts.accounts_receivable.notification",
        "ACCOUNTS_RECEIVABLE_UPDATED",
        "Accounts receivable updated",
        `${label(body, "Sales transaction")} updated Accounts Receivable at ${at}.`,
        "/accounts",
        "accounts",
      ),
    ];
  }
  if (method === "POST" && /^\/api\/flex\/vendor-payments/.test(p)) {
    return [
      event(
        "accounts.accounts_payable.notification",
        "ACCOUNTS_PAYABLE_UPDATED",
        "Accounts payable updated",
        `${label(body, "Vendor payment")} updated Accounts Payable at ${at}.`,
        "/accounts",
        "accounts",
      ),
    ];
  }
  const crew = p.match(
    /^\/api\/crew\/(attendance|leaves|claims|overtime|bonus|deductions)(?:\/([^/]+))?/,
  );
  if (crew && (method === "POST" || method === "PATCH" || method === "PUT")) {
    if (
      method !== "POST" &&
      req.body?.status == null &&
      !/\/(approve|reject)$/.test(p)
    )
      return [];
    const scope: any = {
      attendance: "attendance",
      leaves: "leave",
      claims: "claims",
      overtime: "overtime",
      bonus: "bonus",
      deductions: "deductions",
    };
    const action = status || "requested";
    return [
      event(
        `crew.${scope[crew[1]]}.notification`,
        `CREW_${crew[1].toUpperCase()}_${action.toUpperCase()}`,
        `${crew[1]} ${action}`,
        `${label(body, crew[1])} was ${action} at ${at}.`,
        "/crew",
        "crew",
      ),
    ];
  }
  if (
    p.startsWith("/api/tasks") &&
    (method === "POST" || method === "PATCH" || method === "PUT")
  ) {
    const action = p.endsWith("/assignments")
      ? "assigned"
      : p.includes("time-log")
        ? clean(
            p.match(/time-logs\/(start|pause|complete)$/)?.[1] ||
              "timesheet_updated",
          )
        : method === "POST"
          ? body?.assigneeId || body?.assignments?.length
            ? "assigned"
            : "created"
          : status || "updated";
    return [
      event(
        p.includes("time-log")
          ? "task.time_logs.notification"
          : "task.task_board.notification",
        `TASK_${action.toUpperCase()}`,
        `Task ${action}`,
        `${label(body, "Task")} was ${action} at ${at}.`,
        "/tasks",
        "task",
      ),
    ];
  }
  if (
    p.startsWith("/api/scheduling/events") &&
    (method === "POST" || method === "PATCH")
  ) {
    const action = method === "POST" ? "created" : "rescheduled";
    return [
      event(
        "scheduling.calendar.notification",
        `SCHEDULE_${action.toUpperCase()}`,
        `Schedule ${action}`,
        `${label(body, "Schedule")} was ${action} at ${at}.`,
        "/scheduling",
        "scheduling",
      ),
    ];
  }
  if (method === "POST" && /^\/api\/batches\/[^/]+\/advance/.test(p))
    return [
      event(
        "production.batches.notification",
        "BATCH_STAGE_COMPLETED",
        "Batch stage completed",
        `Batch ${label(body, id)} completed ${clean(body?.completedStage || req.body?.completedStage || "a stage")} at ${at}.`,
        `/annur/batches/${id}`,
        "production",
      ),
    ];
  if (
    method === "POST" &&
    /^\/api\/coimbatore\/batches\/[^/]+\/(turns|qc)/.test(p)
  )
    return [
      event(
        "production.casing_soil.notification",
        "CASING_STAGE_COMPLETED",
        "Casing soil stage completed",
        `Casing batch ${label(body, id)} completed ${clean(body?.turnNumber ? `turn T${body.turnNumber}` : status || "QC")} at ${at}.`,
        `/coimbatore/batches/${id}`,
        "production",
      ),
    ];
  if (method === "POST" && /^\/api\/lab\/batches\/[^/]+\/advance/.test(p))
    return [
      event(
        "production.spawn_batches.notification",
        "SPAWN_STAGE_COMPLETED",
        "Spawn stage completed",
        `Spawn batch ${label(body, id)} completed ${clean(body?.completedStage || "a stage")} at ${at}.`,
        `/lab/batches/${id}`,
        "production",
      ),
    ];
  if (
    method === "POST" &&
    p.includes("/api/ooty/") &&
    (p.includes("advance") || p.includes("complete"))
  )
    return [
      event(
        "production.growing_rooms.notification",
        "GROWING_ROOM_STAGE_COMPLETED",
        "Growing room stage completed",
        `${label(body, "Growing room batch")} completed ${clean(body?.completedStage || "a stage")} at ${at}.`,
        "/ooty",
        "production",
      ),
    ];
  if (method === "POST" && /^\/api\/chambers\/[^/]+\/readings/.test(p))
    return [
      event(
        "production.chambers.notification",
        "CHAMBER_LOG_COMPLETED",
        "Chamber logging completed",
        `${label(body, "Bulk chamber")} logging completed for the ${body?.expectedLogTime ? new Date(body.expectedLogTime).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : "scheduled"} interval at ${body?.recordedAt ? new Date(body.recordedAt).toLocaleString("en-IN") : at}.`,
        "/annur/chambers",
        "production",
        {
          metadata: {
            expectedLogTime: body?.expectedLogTime,
            readingId: body?.id,
          },
        },
      ),
    ];
  return [];
}
export function notificationEventMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  let responseBody: any;
  const json = res.json.bind(res);
  res.json = ((body: any) => {
    responseBody = body;
    return json(body);
  }) as any;
  res.on("finish", () => {
    if (
      res.statusCode < 200 ||
      res.statusCode >= 300 ||
      res.locals.notificationHandled === true ||
      !["POST", "PUT", "PATCH"].includes(req.method)
    )
      return;
    void (async () => {
      const userId = Number((req.session as any)?.userId);
      if (!userId) return;
      const [user] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);
      if (!user) return;
      for (const draft of events(req, responseBody)) {
        const { keyPart, ...data } = draft;
        await publishNotification({
          ...data,
          organizationId: Number(user.organizationId ?? 1),
          actorId: userId,
          eventKey: `${data.eventType}:${data.sourceEntityId || req.path}:${keyPart || state(responseBody, req)}`,
        });
      }
    })().catch((error) => {
      req.log?.error({ err: error }, "Notification event publication failed");
    });
  });
  next();
}
