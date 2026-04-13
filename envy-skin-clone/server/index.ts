import dotenv from "dotenv";
import express from "express";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

const app = express();
app.use(express.json());

const FRUITFY_API_BASE_URL = process.env.FRUITFY_API_BASE_URL || "https://api.fruitfy.io";
const FRUITFY_PIX_CHARGE_PATH = process.env.FRUITFY_PIX_CHARGE_PATH || "/api/pix/charge";
const FRUITFY_TOKEN = process.env.FRUITFY_TOKEN;
const FRUITFY_STORE_ID = process.env.FRUITFY_STORE_ID;
const FRUITFY_PRODUCT_ID = process.env.FRUITFY_PRODUCT_ID;
const PORT = Number(process.env.API_PORT || 3001);

function unwrapChargeData(responseJson: unknown): Record<string, unknown> {
  if (!responseJson || typeof responseJson !== "object") return {};
  const r = responseJson as { data?: unknown };
  let d: unknown = r.data ?? responseJson;
  if (typeof d === "string") {
    try {
      d = JSON.parse(d) as unknown;
    } catch {
      return {};
    }
  }
  if (!d || typeof d !== "object" || Array.isArray(d)) return {};
  return { ...(d as object) } as Record<string, unknown>;
}

function pickOrderUuid(obj: Record<string, unknown>): string | undefined {
  const direct = obj.uuid ?? obj.order_uuid;
  if (typeof direct === "string" && direct.length > 8) return direct;
  const order = obj.order;
  if (order && typeof order === "object" && order !== null) {
    const o = order as Record<string, unknown>;
    const id = o.uuid ?? o.id;
    if (typeof id === "string" && id.length > 8) return id;
  }
  return undefined;
}

function responseMightContainPixEmv(obj: unknown): boolean {
  try {
    return JSON.stringify(obj).includes("000201");
  } catch {
    return false;
  }
}

async function fetchFruitfyOrder(uuid: string): Promise<Record<string, unknown> | null> {
  if (!FRUITFY_TOKEN || !FRUITFY_STORE_ID) return null;
  const r = await fetch(`${FRUITFY_API_BASE_URL}/api/order/${encodeURIComponent(uuid)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${FRUITFY_TOKEN}`,
      "Store-Id": FRUITFY_STORE_ID,
      Accept: "application/json",
      "Accept-Language": "pt_BR",
    },
  });
  if (!r.ok) return null;
  const j = (await r.json()) as { data?: unknown };
  const d = j?.data ?? j;
  if (d && typeof d === "object" && !Array.isArray(d)) return { ...(d as object) } as Record<string, unknown>;
  return null;
}

const pickValidUtm = (utm: Record<string, unknown> | undefined) => {
  if (!utm) return undefined;
  const entries = Object.entries(utm).filter(([, value]) => typeof value === "string" && value.trim().length > 0);
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries);
};

function mergeTrackingPayload(
  utm: unknown,
  urlParams: unknown
): Record<string, unknown> | undefined {
  const a =
    utm && typeof utm === "object" && !Array.isArray(utm) ? (utm as Record<string, unknown>) : {};
  const b =
    urlParams && typeof urlParams === "object" && !Array.isArray(urlParams)
      ? (urlParams as Record<string, unknown>)
      : {};
  const merged = { ...b, ...a };
  return Object.keys(merged).length ? merged : undefined;
}

app.post("/api/pix/charge", async (req, res) => {
  try {
    if (!FRUITFY_TOKEN || !FRUITFY_STORE_ID || !FRUITFY_PRODUCT_ID) {
      return res.status(500).json({
        success: false,
        message: "Configuração da Fruitfy incompleta. Verifique FRUITFY_TOKEN, FRUITFY_STORE_ID e FRUITFY_PRODUCT_ID.",
      });
    }

    const { name, email, cpf, phone, amount, quantity, utm, urlParams: urlParamsBody } = req.body ?? {};

    if (!name || !email || !cpf || !phone || !amount) {
      return res.status(400).json({
        success: false,
        message: "Campos obrigatórios ausentes: name, email, cpf, phone, amount.",
      });
    }

    const parsedAmount = Number(amount);
    const parsedQuantity = Number(quantity || 1);

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(422).json({
        success: false,
        message: "Valor inválido. Envie o amount em centavos.",
      });
    }

    const tracking = mergeTrackingPayload(utm, urlParamsBody);
    const fruitfyBody: Record<string, unknown> = {
      name: String(name),
      email: String(email),
      cpf: String(cpf).replace(/\D/g, ""),
      phone: String(phone).replace(/\D/g, ""),
      items: [
        {
          id: FRUITFY_PRODUCT_ID,
          value: Math.round(parsedAmount),
          quantity: Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 1,
        },
      ],
    };
    const utmClean = pickValidUtm(tracking);
    if (utmClean) fruitfyBody.utm = utmClean;

    const fruitfyHeaders = {
      Authorization: `Bearer ${FRUITFY_TOKEN}`,
      "Store-Id": FRUITFY_STORE_ID,
      "Content-Type": "application/json",
      Accept: "application/json",
      "Accept-Language": "pt_BR",
    } as const;

    let gatewayResponse = await fetch(`${FRUITFY_API_BASE_URL}${FRUITFY_PIX_CHARGE_PATH}`, {
      method: "POST",
      headers: { ...fruitfyHeaders },
      body: JSON.stringify(fruitfyBody),
    });

    if (gatewayResponse.status === 404 && FRUITFY_PIX_CHARGE_PATH !== "/pix/charge") {
      gatewayResponse = await fetch(`${FRUITFY_API_BASE_URL}/pix/charge`, {
        method: "POST",
        headers: { ...fruitfyHeaders },
        body: JSON.stringify(fruitfyBody),
      });
    }

    const responseJson = (await gatewayResponse.json()) as {
      success?: boolean;
      message?: string;
      data?: unknown;
      errors?: unknown;
    };

    if (!gatewayResponse.ok) {
      return res.status(gatewayResponse.status).json({
        success: false,
        message: responseJson?.message || "Erro ao criar cobrança PIX na Fruitfy.",
        errors: responseJson?.errors || null,
      });
    }

    let merged = unwrapChargeData(responseJson);
    const orderUuid = pickOrderUuid(merged);

    if (orderUuid && !responseMightContainPixEmv(merged)) {
      const orderData = await fetchFruitfyOrder(orderUuid);
      if (orderData) merged = { ...merged, ...orderData };
    }

    return res.status(201).json({
      success: true,
      message: "Cobrança PIX gerada com sucesso.",
      data: merged,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Erro interno ao integrar com a Fruitfy.",
      error: error instanceof Error ? error.message : "unknown_error",
    });
  }
});

/** Consulta status do pedido — espelha GET /api/order/{order} da Fruitfy (TransactionStatus: paid, waiting_payment, …). */
app.get("/api/order/:orderId", async (req, res) => {
  try {
    if (!FRUITFY_TOKEN || !FRUITFY_STORE_ID) {
      return res.status(500).json({
        success: false,
        message: "Configuração da Fruitfy incompleta.",
      });
    }
    const orderId = req.params.orderId?.trim();
    if (!orderId || orderId.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(orderId)) {
      return res.status(400).json({
        success: false,
        message: "ID do pedido inválido.",
      });
    }
    const data = await fetchFruitfyOrder(orderId);
    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Pedido não encontrado.",
      });
    }
    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Erro ao consultar pedido na Fruitfy.",
      error: error instanceof Error ? error.message : "unknown_error",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Fruitfy API bridge rodando na porta ${PORT}`);
});
