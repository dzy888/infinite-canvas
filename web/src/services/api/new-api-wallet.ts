import { platformRequest } from "./new-api-platform";

export type PaymentMethod = { name: string; type: string; min_topup?: number; pay_method_index?: number };
export type CreemProduct = { name: string; productId: string; price: number; quota: number; currency: string };
export type TopupInfo = {
    enable_online_topup: boolean;
    enable_stripe_topup: boolean;
    enable_redemption: boolean;
    enable_waffo_topup?: boolean;
    enable_waffo_pancake_topup?: boolean;
    enable_creem_topup?: boolean;
    pay_methods: PaymentMethod[];
    waffo_pay_methods?: Array<{ name: string }>;
    creem_products?: CreemProduct[];
    min_topup: number;
    stripe_min_topup: number;
    waffo_min_topup?: number;
    waffo_pancake_min_topup?: number;
    amount_options: number[];
};
export type TopupRecord = { id: number; trade_no: string; money: number; payment_method: string; create_time: number; status: string };
function arrayValue<T>(value: unknown): T[] {
    if (typeof value === "string") {
        try {
            value = JSON.parse(value);
        } catch {
            return [];
        }
    }
    return Array.isArray(value) ? value : [];
}
export async function getTopupInfo(): Promise<TopupInfo> {
    const info = await platformRequest<TopupInfo>("/user/topup/info");
    return {
        ...info,
        pay_methods: arrayValue<PaymentMethod>(info.pay_methods),
        amount_options: arrayValue<number>(info.amount_options)
            .map(Number)
            .filter((value) => Number.isFinite(value) && value > 0),
        creem_products: arrayValue<CreemProduct>(info.creem_products),
        waffo_pay_methods: arrayValue<{ name: string }>(info.waffo_pay_methods),
    };
}
export function paymentMethods(info: TopupInfo): PaymentMethod[] {
    return info.pay_methods.flatMap((method): PaymentMethod[] => {
        if (method.type === "stripe") return info.enable_stripe_topup ? [{ ...method, min_topup: Number(method.min_topup) || info.stripe_min_topup }] : [];
        if (method.type === "waffo_pancake") return info.enable_waffo_pancake_topup ? [{ ...method, min_topup: info.waffo_pancake_min_topup }] : [];
        if (method.type === "waffo") return info.enable_waffo_topup ? (info.waffo_pay_methods || []).map((item, index) => ({ name: item.name, type: "waffo", pay_method_index: index, min_topup: info.waffo_min_topup })) : [];
        return info.enable_online_topup && method.type !== "creem" ? [{ ...method, min_topup: Number(method.min_topup) || info.min_topup }] : [];
    });
}
export const paymentMethodKey = (method: PaymentMethod) => method.type + (method.pay_method_index === undefined ? "" : ":" + method.pay_method_index);
export async function quotePayment(amount: number, method: PaymentMethod): Promise<number> {
    const prefix = ["stripe", "waffo"].includes(method.type) ? method.type + "/" : method.type === "waffo_pancake" ? "waffo-pancake/" : "";
    const value = Number(await platformRequest<string>("/user/" + prefix + "amount", false, { method: "POST", body: { amount } }));
    if (!Number.isFinite(value) || value <= 0) throw new Error("Invalid payment quote");
    return value;
}
export type Checkout = { url: string; fields?: Record<string, unknown> };
export function safeCheckoutUrl(value: unknown): string {
    if (typeof value !== "string") throw new Error("Invalid checkout");
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Invalid checkout");
    return url.href;
}
export async function createPayment(amount: number, method: PaymentMethod): Promise<Checkout> {
    const prefix = ["stripe", "waffo"].includes(method.type) ? method.type + "/" : method.type === "waffo_pancake" ? "waffo-pancake/" : "";
    const response = await platformRequest<{ data: string | Record<string, unknown>; url?: string }>("/user/" + prefix + "pay", true, {
        method: "POST",
        body: { amount, payment_method: method.type, ...(method.pay_method_index === undefined ? {} : { pay_method_index: method.pay_method_index }) },
    });
    if (!prefix) return { url: safeCheckoutUrl(response.url), fields: response.data as Record<string, unknown> };
    const data = response.data;
    return { url: safeCheckoutUrl(typeof data === "string" ? data : data?.pay_link || data?.payment_url || data?.checkout_url) };
}
export async function createCreemPayment(productId: string): Promise<Checkout> {
    const data = await platformRequest<{ checkout_url: string }>("/user/creem/pay", false, { method: "POST", body: { product_id: productId, payment_method: "creem" } });
    return { url: safeCheckoutUrl(data.checkout_url) };
}
// The window is opened by the user's click before awaiting the order request.
export function showCheckout(checkout: Checkout, popup: Window, target: string) {
    if (popup.closed) throw new Error("Payment window closed");
    if (!checkout.fields) {
        popup.location.href = checkout.url;
        return;
    }
    const form = document.createElement("form");
    form.action = checkout.url;
    form.method = "POST";
    form.target = target;
    for (const [key, value] of Object.entries(checkout.fields)) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = String(value);
        form.appendChild(input);
    }
    document.body.appendChild(form);
    try {
        form.submit();
    } finally {
        form.remove();
    }
}
